import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
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
