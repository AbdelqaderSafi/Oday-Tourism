import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';

export const CreateRoomSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'إضافة غرفة للفندق' }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['price', 'translations'],
        properties: {
          price: { type: 'number', example: 150, minimum: 0 },
          price_egp: {
            type: 'number',
            example: 1500,
            minimum: 0,
            nullable: true,
            description:
              'السعر بالجنيه المصري (اختياري، القيمة الفارغة تعني null)',
          },
          capacity: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'عدد الضيوف لكل وحدة من هذا النوع (اختياري). null أو نص فارغ يمسحها، والغرفة بلا سعة لا تظهر في البحث بالتواريخ',
          },
          adult_capacity: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'أقصى عدد بالغين في الغرفة (اختياري، null بلا حد إضافي، لا يتجاوز capacity)',
          },
          child_capacity: {
            type: 'integer',
            minimum: 0,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'أقصى عدد أطفال (0 يمنع الأطفال، null بلا حد إضافي، لا يتجاوز capacity)',
          },
          children_under_3_capacity: {
            type: 'integer',
            minimum: 0,
            maximum: 50,
            nullable: true,
            example: 1,
            description:
              'أقصى عدد أطفال أعمارهم 0-2 (لا يتجاوز child_capacity)',
          },
          children_under_6_capacity: {
            type: 'integer',
            minimum: 0,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'أقصى عدد أطفال أعمارهم 0-5؛ الأقل من 3 يُحسبون هنا أيضًا (لا يتجاوز child_capacity)',
          },
          children_6_to_12_capacity: {
            type: 'integer',
            minimum: 0,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'أقصى عدد أطفال أعمارهم 6-12 شاملة (لا يتجاوز child_capacity)',
          },
          translations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['language', 'name'],
              properties: {
                language: { type: 'string', enum: ['ar', 'en'], example: 'ar' },
                name: { type: 'string', example: 'غرفة ديلوكس' },
                description: {
                  type: 'string',
                  example: 'غرفة فاخرة مع إطلالة على البحر',
                  nullable: true,
                },
              },
            },
            example: [
              {
                language: 'ar',
                name: 'غرفة ديلوكس',
                description: 'غرفة فاخرة مع إطلالة على البحر',
              },
              {
                language: 'en',
                name: 'Deluxe Room',
                description: 'Luxury room with sea view',
              },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'تم إنشاء الغرفة بنجاح' }),
    ApiResponse({ status: 400, description: 'بيانات غير صحيحة' }),
    ApiResponse({ status: 404, description: 'الفندق غير موجود' }),
  );

export const FindAllRoomsSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'جلب جميع غرف الفندق' }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiResponse({ status: 200, description: 'قائمة الغرف مع الترجمات' }),
  );

export const FindOneRoomSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'جلب غرفة بالـ ID' }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الغرفة (UUID)' }),
    ApiResponse({ status: 200, description: 'بيانات الغرفة مع الترجمات' }),
    ApiResponse({ status: 404, description: 'الغرفة غير موجودة' }),
  );

export const UpdateRoomSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'تعديل غرفة' }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الغرفة (UUID)' }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          price: { type: 'number', example: 200, minimum: 0 },
          price_egp: {
            type: 'number',
            example: 2000,
            minimum: 0,
            nullable: true,
            description:
              'السعر بالجنيه المصري (اختياري، القيمة الفارغة تعني null)',
          },
          capacity: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'عدد الضيوف لكل وحدة من هذا النوع (اختياري). null أو نص فارغ يمسحها، والغرفة بلا سعة لا تظهر في البحث بالتواريخ',
          },
          adult_capacity: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'أقصى عدد بالغين في الغرفة (اختياري، null بلا حد إضافي، لا يتجاوز capacity)',
          },
          child_capacity: {
            type: 'integer',
            minimum: 0,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'أقصى عدد أطفال (0 يمنع الأطفال، null بلا حد إضافي، لا يتجاوز capacity)',
          },
          children_under_3_capacity: {
            type: 'integer',
            minimum: 0,
            maximum: 50,
            nullable: true,
            example: 1,
            description:
              'أقصى عدد أطفال أعمارهم 0-2 (لا يتجاوز child_capacity)',
          },
          children_under_6_capacity: {
            type: 'integer',
            minimum: 0,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'أقصى عدد أطفال أعمارهم 0-5؛ الأقل من 3 يُحسبون هنا أيضًا (لا يتجاوز child_capacity)',
          },
          children_6_to_12_capacity: {
            type: 'integer',
            minimum: 0,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'أقصى عدد أطفال أعمارهم 6-12 شاملة (لا يتجاوز child_capacity)',
          },
          translations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                language: { type: 'string', enum: ['ar', 'en'] },
                name: { type: 'string', example: 'غرفة سويت' },
                description: {
                  type: 'string',
                  example: 'غرفة واسعة مع جاكوزي',
                  nullable: true,
                },
              },
            },
          },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'تم التعديل بنجاح' }),
    ApiResponse({ status: 404, description: 'الغرفة غير موجودة' }),
  );

export const DeleteRoomSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'حذف غرفة' }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiParam({ name: 'id', description: 'معرّف الغرفة (UUID)' }),
    ApiResponse({ status: 200, description: 'تم الحذف بنجاح' }),
    ApiResponse({ status: 404, description: 'الغرفة غير موجودة' }),
  );
