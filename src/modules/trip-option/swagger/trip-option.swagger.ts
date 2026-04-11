import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';

export const CreateTripOptionSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'إضافة option للرحلة' }),
    ApiParam({ name: 'tripId', description: 'معرّف الرحلة (UUID)' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['price', 'translations'],
        properties: {
          price: { type: 'number', example: 100, minimum: 0 },
          translations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['language', 'name'],
              properties: {
                language: { type: 'string', enum: ['ar', 'en'], example: 'ar' },
                name: { type: 'string', example: 'VIP' },
                description: { type: 'string', example: 'خيار VIP مع مميزات إضافية' },
              },
            },
            example: [
              {
                language: 'ar',
                name: 'VIP',
                description: 'خيار VIP مع مميزات إضافية',
              },
              {
                language: 'en',
                name: 'VIP',
                description: 'VIP option with extra features',
              },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'تم إنشاء الخيار بنجاح' }),
    ApiResponse({ status: 400, description: 'بيانات غير صحيحة' }),
    ApiResponse({ status: 404, description: 'الرحلة غير موجودة' }),
  );

export const FindAllTripOptionsSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'جلب جميع خيارات الرحلة' }),
    ApiParam({ name: 'tripId', description: 'معرّف الرحلة (UUID)' }),
    ApiResponse({ status: 200, description: 'قائمة الخيارات مع الترجمات' }),
  );

export const FindOneTripOptionSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'جلب خيار رحلة بالـ ID' }),
    ApiParam({ name: 'tripId', description: 'معرّف الرحلة (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الخيار (UUID)' }),
    ApiResponse({ status: 200, description: 'بيانات الخيار مع الترجمات' }),
    ApiResponse({ status: 404, description: 'الخيار غير موجود' }),
  );

export const UpdateTripOptionSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'تعديل خيار رحلة' }),
    ApiParam({ name: 'tripId', description: 'معرّف الرحلة (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الخيار (UUID)' }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          price: { type: 'number', example: 120, minimum: 0 },
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
    ApiResponse({ status: 404, description: 'الخيار غير موجود' }),
  );

export const DeleteTripOptionSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'حذف خيار رحلة' }),
    ApiParam({ name: 'tripId', description: 'معرّف الرحلة (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الخيار (UUID)' }),
    ApiResponse({ status: 200, description: 'تم الحذف بنجاح' }),
    ApiResponse({ status: 404, description: 'الخيار غير موجود' }),
  );
