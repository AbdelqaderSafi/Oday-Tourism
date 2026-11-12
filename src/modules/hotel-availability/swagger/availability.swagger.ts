import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { DestinatiosnEnum } from 'generated/prisma/client';
import { AVAILABILITY_LIMITS } from '../engine/availability-limits';

const LIMITS = AVAILABILITY_LIMITS;
const ERROR_SHAPE = 'جسم الخطأ: { statusCode, code, message, field?, errors? }';
const HOTEL_ID = '6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
const ROOM_ID = '9b2f1c7e-4d3a-4f6b-8a1e-2c5d7f9e0a13';

const calendarParams = () => [
  ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
  ApiParam({ name: 'roomId', description: 'معرّف الغرفة (UUID)' }),
];

export const GetRoomCalendarSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'تقويم غرفة: الوحدات المتاحة وأسعار كل ليلة',
      description: `ليلة لكل تاريخ من from حتى ما قبل to (حتى ${LIMITS.maxCalendarRangeNights} ليلة)، مع revision والأسعار الأساسية. الليلة بلا سجل مغلقة. base_rates تكون null إذا لم يُحدد سعر أساسي موجب.`,
    }),
    ...calendarParams(),
    ApiQuery({
      name: 'from',
      required: true,
      example: '2026-11-20',
      description: 'أول ليلة YYYY-MM-DD',
    }),
    ApiQuery({
      name: 'to',
      required: true,
      example: '2026-11-23',
      description: 'اليوم التالي لآخر ليلة (غير مشمول)',
    }),
    ApiResponse({
      status: 200,
      description: 'تقويم الغرفة',
      schema: {
        example: {
          hotel_id: HOTEL_ID,
          room_id: ROOM_ID,
          revision: 8,
          base_rates: { USD: '100.00', EGP: '5000.00' },
          days: [
            {
              date: '2026-11-20',
              available_units: 1,
              rate_override: { USD: null, EGP: null },
            },
            {
              date: '2026-11-21',
              available_units: 1,
              rate_override: { USD: '140.00', EGP: '7000.00' },
            },
            {
              date: '2026-11-22',
              available_units: 0,
              rate_override: { USD: null, EGP: null },
            },
          ],
        },
      },
    }),
    ApiResponse({ status: 400, description: `INVALID_INPUT. ${ERROR_SHAPE}` }),
    ApiResponse({ status: 401, description: 'UNAUTHENTICATED' }),
    ApiResponse({
      status: 404,
      description: 'NOT_FOUND: الغرفة ليست غرفة فعّالة في هذا الفندق',
    }),
  );

export const UpdateRoomCalendarSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'تعديل تقويم غرفة دفعة واحدة',
      description: `revision يجب أن يطابق آخر قراءة وإلا 409 CALENDAR_CONFLICT بلا أي حفظ. كل تغيير يغطي الليالي من from حتى ما قبل to، بين اليوم و${LIMITS.bookingWindowDays} يومًا بعده، ويحدد available_units (0-${LIMITS.maxAvailableUnits}) أو rate_override (USD/EGP، وnull يلغي السعر الخاص). الحقول غير المرسلة لا تتغير، و0 وحدات يغلق الليلة ويُبقي أسعارها. لا يجوز تداخل الفترات.`,
    }),
    ...calendarParams(),
    ApiBody({
      schema: {
        type: 'object',
        required: ['revision', 'changes'],
        properties: {
          revision: { type: 'integer', minimum: 0, example: 8 },
          changes: {
            type: 'array',
            minItems: 1,
            maxItems: LIMITS.maxCalendarChanges,
            items: {
              type: 'object',
              required: ['from', 'to'],
              properties: {
                from: { type: 'string', example: '2026-11-21' },
                to: { type: 'string', example: '2026-11-22' },
                available_units: {
                  type: 'integer',
                  minimum: 0,
                  maximum: LIMITS.maxAvailableUnits,
                },
                rate_override: {
                  type: 'object',
                  properties: {
                    USD: { type: 'string', nullable: true, example: '140.00' },
                    EGP: { type: 'string', nullable: true, example: '7500.00' },
                  },
                },
              },
            },
          },
        },
        example: {
          revision: 8,
          changes: [
            {
              from: '2026-11-21',
              to: '2026-11-22',
              available_units: 2,
              rate_override: { EGP: '7500.00' },
            },
            {
              from: '2026-11-22',
              to: '2026-11-23',
              available_units: 0,
              rate_override: { USD: null, EGP: null },
            },
          ],
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'تم الحفظ',
      schema: {
        example: { hotel_id: HOTEL_ID, room_id: ROOM_ID, revision: 9 },
      },
    }),
    ApiResponse({ status: 400, description: `INVALID_INPUT. ${ERROR_SHAPE}` }),
    ApiResponse({ status: 401, description: 'UNAUTHENTICATED' }),
    ApiResponse({ status: 404, description: 'NOT_FOUND' }),
    ApiResponse({
      status: 409,
      description: 'CALENDAR_CONFLICT: التقويم تغيّر منذ آخر قراءة',
    }),
  );

const VISITOR_CATEGORY_DOC = {
  enum: ['egyptian-resident', 'other'],
  description:
    'egyptian-resident يسعّر بالجنيه المصري (EGP)، وother بالدولار (USD)، بلا تحويل بين العملتين',
};

const STAY_RULES = `check_in من اليوم (بتوقيت القاهرة)، من 1 إلى ${LIMITS.maxStayNights} ليلة، وcheck_out خلال ${LIMITS.bookingWindowDays} يومًا. adults ≥ 1، children ≥ 0، والإجمالي حتى ${LIMITS.maxGuests}.`;

export const SearchHotelStaysSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'البحث عن فنادق متاحة لتواريخ محددة',
      description: `يرجع الفنادق التي يكفي مخزونها كل ليالي الإقامة مع أرخص توزيع غرف مقترح، مرتبة بمعرّف الفندق. ${STAY_RULES} pricing_status = ON_REQUEST وtotal = null إذا لم يتوفر سعر كامل.`,
    }),
    ApiQuery({
      name: 'destination',
      required: true,
      enum: Object.values(DestinatiosnEnum),
    }),
    ApiQuery({ name: 'check_in', required: true, example: '2026-11-20' }),
    ApiQuery({ name: 'check_out', required: true, example: '2026-11-22' }),
    ApiQuery({ name: 'adults', required: true, type: Number, example: 4 }),
    ApiQuery({ name: 'children', required: false, type: Number, example: 1 }),
    ApiQuery({
      name: 'visitor_category',
      required: true,
      ...VISITOR_CATEGORY_DOC,
    }),
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      example: LIMITS.defaultSearchPageSize,
      description: `حتى ${LIMITS.maxSearchPageSize}`,
    }),
    ApiResponse({
      status: 200,
      description: 'hotel بنفس شكل GET /hotel (مختصر هنا)',
      schema: {
        example: {
          data: [
            {
              hotel: { id: HOTEL_ID, destination: 'SHARM_EL_SHEIKH' },
              stay_offer: {
                nights: 2,
                currency: 'EGP',
                pricing_status: 'PRICED',
                total: '26400.00',
                rooms: [
                  { room_id: ROOM_ID, quantity: 1 },
                  {
                    room_id: 'c3d4e5f6-0a1b-4c2d-8e3f-4a5b6c7d8e9f',
                    quantity: 1,
                  },
                ],
              },
            },
          ],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        },
      },
    }),
    ApiResponse({ status: 400, description: `INVALID_INPUT. ${ERROR_SHAPE}` }),
    ApiResponse({ status: 429, description: 'RATE_LIMITED' }),
  );

export const StayQuoteSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'تسعير إقامة في فندق',
      description: `بدون rooms: يرجع التوزيع المقترح والأنواع المتاحة. مع rooms: يتحقق من الاختيار المحدد ويسعّره مع الترقيات (سعر الترقية لكل غرفة لكل ليلة). ${STAY_RULES} لا يحجز أي شيء.`,
    }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['check_in', 'check_out', 'adults', 'visitor_category'],
        properties: {
          check_in: { type: 'string', example: '2026-11-20' },
          check_out: { type: 'string', example: '2026-11-22' },
          adults: { type: 'integer', minimum: 1, example: 4 },
          children: { type: 'integer', minimum: 0, example: 1 },
          visitor_category: { type: 'string', ...VISITOR_CATEGORY_DOC },
          rooms: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                room_id: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
              },
            },
          },
          addons: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                addon_id: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
        example: {
          check_in: '2026-11-20',
          check_out: '2026-11-22',
          adults: 4,
          children: 1,
          visitor_category: 'egyptian-resident',
          rooms: [{ room_id: ROOM_ID, quantity: 1 }],
          addons: [
            { addon_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', quantity: 1 },
          ],
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'التسعير الحالي؛ الأسعار والمخزون قد تتغير قبل الإرسال',
    }),
    ApiResponse({ status: 400, description: `INVALID_INPUT. ${ERROR_SHAPE}` }),
    ApiResponse({ status: 404, description: 'NOT_FOUND: الفندق غير موجود' }),
    ApiResponse({
      status: 409,
      description:
        'STAY_UNAVAILABLE: لا يوجد توزيع يغطي الضيوف أو الاختيار لم يعد متاحًا',
    }),
  );
