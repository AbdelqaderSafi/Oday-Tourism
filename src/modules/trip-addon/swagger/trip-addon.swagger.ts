import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';

export const CreateTripAddonSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'إضافة addon للرحلة' }),
    ApiParam({ name: 'tripId', description: 'معرّف الرحلة (UUID)' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['price', 'translations'],
        properties: {
          price: { type: 'number', example: 50, minimum: 0 },
          translations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['language', 'name', 'description'],
              properties: {
                language: { type: 'string', enum: ['ar', 'en'], example: 'ar' },
                name: { type: 'string', example: 'وجبة غداء' },
                description: { type: 'string', example: 'وجبة غداء فاخرة' },
              },
            },
            example: [
              {
                language: 'ar',
                name: 'وجبة غداء',
                description: 'وجبة غداء فاخرة',
              },
              {
                language: 'en',
                name: 'Lunch',
                description: 'Luxury lunch meal',
              },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'تم إنشاء الإضافة بنجاح' }),
    ApiResponse({ status: 400, description: 'بيانات غير صحيحة' }),
    ApiResponse({ status: 404, description: 'الرحلة غير موجودة' }),
  );

export const FindAllTripAddonsSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'جلب جميع إضافات الرحلة' }),
    ApiParam({ name: 'tripId', description: 'معرّف الرحلة (UUID)' }),
    ApiResponse({ status: 200, description: 'قائمة الإضافات مع الترجمات' }),
  );

export const FindOneTripAddonSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'جلب إضافة رحلة بالـ ID' }),
    ApiParam({ name: 'tripId', description: 'معرّف الرحلة (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الإضافة (UUID)' }),
    ApiResponse({ status: 200, description: 'بيانات الإضافة مع الترجمات' }),
    ApiResponse({ status: 404, description: 'الإضافة غير موجودة' }),
  );

export const UpdateTripAddonSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'تعديل إضافة رحلة' }),
    ApiParam({ name: 'tripId', description: 'معرّف الرحلة (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الإضافة (UUID)' }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          price: { type: 'number', example: 70, minimum: 0 },
          translations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                language: { type: 'string', enum: ['ar', 'en'] },
                name: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'تم التعديل بنجاح' }),
    ApiResponse({ status: 404, description: 'الإضافة غير موجودة' }),
  );

export const DeleteTripAddonSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'حذف إضافة رحلة' }),
    ApiParam({ name: 'tripId', description: 'معرّف الرحلة (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الإضافة (UUID)' }),
    ApiResponse({ status: 200, description: 'تم الحذف بنجاح' }),
    ApiResponse({ status: 404, description: 'الإضافة غير موجودة' }),
  );
