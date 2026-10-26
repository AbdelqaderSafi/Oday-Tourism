import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';

export const CreateAddonSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'إضافة addon للفندق' }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['price', 'translations'],
        properties: {
          price: { type: 'number', example: 50, minimum: 0 },
          price_egp: {
            type: 'number',
            example: 500,
            minimum: 0,
            nullable: true,
            description:
              'السعر بالجنيه المصري (اختياري، القيمة الفارغة تعني null)',
          },
          translations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['language', 'name', 'description'],
              properties: {
                language: { type: 'string', enum: ['ar', 'en'], example: 'ar' },
                name: { type: 'string', example: 'إفطار' },
                description: { type: 'string', example: 'وجبة إفطار فاخرة' },
              },
            },
            example: [
              {
                language: 'ar',
                name: 'إفطار',
                description: 'وجبة إفطار فاخرة',
              },
              {
                language: 'en',
                name: 'Breakfast',
                description: 'Luxury breakfast meal',
              },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'تم إنشاء الإضافة بنجاح' }),
    ApiResponse({ status: 400, description: 'بيانات غير صحيحة' }),
    ApiResponse({ status: 404, description: 'الفندق غير موجود' }),
  );

export const FindAllAddonsSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'جلب جميع إضافات الفندق' }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiResponse({ status: 200, description: 'قائمة الإضافات مع الترجمات' }),
  );

export const FindOneAddonSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'جلب إضافة بالـ ID' }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الإضافة (UUID)' }),
    ApiResponse({ status: 200, description: 'بيانات الإضافة مع الترجمات' }),
    ApiResponse({ status: 404, description: 'الإضافة غير موجودة' }),
  );

export const UpdateAddonSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'تعديل إضافة' }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الإضافة (UUID)' }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          price: { type: 'number', example: 70, minimum: 0 },
          price_egp: {
            type: 'number',
            example: 700,
            minimum: 0,
            nullable: true,
            description:
              'السعر بالجنيه المصري (اختياري، القيمة الفارغة تعني null)',
          },
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

export const DeleteAddonSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'حذف إضافة' }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الإضافة (UUID)' }),
    ApiResponse({ status: 200, description: 'تم الحذف بنجاح' }),
    ApiResponse({ status: 404, description: 'الإضافة غير موجودة' }),
  );
