import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

export const CreateHotelSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'إنشاء فندق جديد',
      description:
        'إنشاء فندق مع الترجمات (عربي/إنجليزي) ورفع صور رئيسية وفرعية',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: [
          'slug',
          'destination',
          'initial_price',
          'initial_price_egp',
          'stars',
          'rating',
          'translations',
          'mainImages',
        ],
        properties: {
          slug: {
            type: 'string',
            example: 'al-nakheel-hotel',
            description: 'الـ slug الفريد للفندق',
          },
          destination: {
            type: 'string',
            enum: [
              'SHARM_EL_SHEIKH',
              'EL_GHARDQA',
              'EL_AIN_SOKHNA',
              'DAHAB',
              'EL_GOUNA',
              'NORTH_COAST',
              'CAIRO',
              'ALEXANDRIA',
              'SAHL_HASHEESH',
              'MARSA_MATROUH',
              'MARSA_ALAM',
              'FAYOUM',
              'ASWAN',
              'LUXOR',
            ],
            example: 'SHARM_EL_SHEIKH',
          },
          initial_price: { type: 'number', example: 250, minimum: 0 },
          initial_price_egp: {
            type: 'number',
            example: 2500,
            minimum: 0,
            description:
              'السعر الحالي بالجنيه المصري (لزوار فئة المصري المقيم في مصر)',
          },
          stars: {
            type: 'string',
            enum: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'],
            example: 'FIVE',
          },
          rating: {
            type: 'string',
            enum: ['UNRATED', 'MOST_BOOKED', 'TOP_RATED', 'LOWEST_PRICE'],
            example: 'UNRATED',
          },
          meal_plan: {
            type: 'string',
            enum: [
              'ALL_INCLUSIVE',
              'BREAKFAST_ONLY',
              'BREAKFAST_AND_DINNER',
              'NO_MEALS',
            ],
            example: 'BREAKFAST_ONLY',
            description: 'نوع الوجبات المشمولة (اختياري)',
          },
          is_discounted: {
            type: 'boolean',
            example: false,
            default: false,
          },
          discount_percentage: {
            type: 'number',
            example: 10,
            minimum: 0,
            maximum: 100,
            description: 'نسبة الخصم (اختياري)',
          },
          original_price: {
            type: 'number',
            example: 300,
            minimum: 0,
            description:
              'السعر الأصلي قبل الخصم بالدولار (مطلوب ويجب أن يكون أكبر من initial_price عند تفعيل الخصم)',
          },
          original_price_egp: {
            type: 'number',
            example: 3000,
            minimum: 0,
            description:
              'السعر الأصلي قبل الخصم بالجنيه المصري (مطلوب ويجب أن يكون أكبر من initial_price_egp عند تفعيل الخصم، وقيمة فارغة تعني null)',
          },
          youtube_video_url: {
            type: 'string',
            example: 'https://www.youtube.com/watch?v=example',
            description: 'رابط فيديو يوتيوب (اختياري)',
          },
          translations: {
            type: 'string',
            example:
              '[{"language":"ar","name":"فندق النخيل","description":"فندق فاخر في قلب المدينة","Facilities":["مسبح","واي فاي مجاني","سبا"]},{"language":"en","name":"Al Nakheel Hotel","description":"A luxury hotel in the heart of the city","Facilities":["Pool","Free WiFi","Spa"]}]',
            description:
              'JSON string - مصفوفة الترجمات (عربي وإنجليزي). كل ترجمة تحتوي: language, name, description, Facilities',
          },
          mainImages: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'الصور الرئيسية للفندق (حتى 5 صور)',
          },
          subImages: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'صور المعرض الفرعية (حتى 20 صورة)',
          },
          rooms: {
            type: 'string',
            example:
              '[{"price":150,"price_egp":1500,"capacity":2,"translations":[{"language":"ar","name":"غرفة ديلوكس","description":"غرفة فاخرة مع إطلالة على البحر"},{"language":"en","name":"Deluxe Room","description":"Luxury room with sea view"}]}]',
            description:
              'JSON string - مصفوفة الغرف (اختياري). كل غرفة تحتوي: price, price_egp, capacity (عدد الضيوف لكل وحدة 1-50، اختياري), translations[]',
          },
          addons: {
            type: 'string',
            example:
              '[{"price":50,"price_egp":500,"translations":[{"language":"ar","name":"إفطار","description":"وجبة إفطار فاخرة"},{"language":"en","name":"Breakfast","description":"Luxury breakfast"}]}]',
            description:
              'JSON string - مصفوفة الإضافات (اختياري). كل إضافة تحتوي: price, price_egp, translations[]',
          },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'تم إنشاء الفندق بنجاح' }),
    ApiResponse({ status: 400, description: 'بيانات غير صحيحة' }),
    ApiResponse({ status: 401, description: 'غير مصرح' }),
  );

export const FindAllHotelsSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'جلب جميع الفنادق',
      description:
        'جلب الفنادق مع الترجمات والصور، مع دعم الفلترة والـ pagination',
    }),
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      example: 1,
      description: 'رقم الصفحة',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      example: 10,
      description: 'عدد العناصر في الصفحة',
    }),
    ApiQuery({
      name: 'destination',
      required: false,
      enum: [
        'SHARM_EL_SHEIKH',
        'EL_GHARDQA',
        'EL_AIN_SOKHNA',
        'DAHAB',
        'EL_GOUNA',
        'NORTH_COAST',
        'CAIRO',
        'ALEXANDRIA',
        'SAHL_HASHEESH',
        'MARSA_MATROUH',
        'MARSA_ALAM',
        'FAYOUM',
        'ASWAN',
        'LUXOR',
      ],
      description: 'فلتر حسب الوجهة',
    }),
    ApiQuery({
      name: 'rating',
      required: false,
      enum: ['UNRATED', 'MOST_BOOKED', 'TOP_RATED', 'LOWEST_PRICE'],
      description: 'فلتر حسب التقييم',
    }),
    ApiResponse({
      status: 200,
      description: 'قائمة الفنادق مع الترجمات وبيانات الـ pagination',
    }),
  );

export const FindOneHotelSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'جلب فندق بالـ ID',
      description: 'جلب بيانات فندق محدد مع جميع ترجماته وصوره',
    }),
    ApiParam({
      name: 'id',
      description: 'معرّف الفندق (UUID)',
      example: 'bf176f2b-d79a-4b70-a8dd-e9f86f191371',
    }),
    ApiResponse({
      status: 200,
      description: 'بيانات الفندق مع الترجمات والصور',
      schema: {
        example: {
          id: 'bf176f2b-d79a-4b70-a8dd-e9f86f191371',
          slug: 'al-nakheel-hotel',
          destination: 'SHARM_EL_SHEIKH',
          initial_price: '250.00',
          initial_price_egp: '2500.00',
          stars: 'FIVE',
          rating: 'TOP_RATED',
          is_discounted: false,
          discount_percentage: null,
          original_price: null,
          original_price_egp: null,
          youtube_video_url: null,
          is_deleted: false,
          created_at: '2026-03-07T10:00:00.000Z',
          updated_at: '2026-03-07T10:00:00.000Z',
          translations: [
            {
              id: 'uuid-1',
              hotel_id: 'bf176f2b-d79a-4b70-a8dd-e9f86f191371',
              language: 'ar',
              name: 'فندق النخيل',
              description: 'فندق فاخر في قلب المدينة',
              Facilities: ['مسبح', 'واي فاي مجاني'],
            },
            {
              id: 'uuid-2',
              hotel_id: 'bf176f2b-d79a-4b70-a8dd-e9f86f191371',
              language: 'en',
              name: 'Al Nakheel Hotel',
              description: 'A luxury hotel in the heart of the city',
              Facilities: ['Pool', 'Free WiFi'],
            },
          ],
          assets: [
            {
              id: 'uuid',
              url: 'https://ik.imagekit.io/...',
              fileType: 'image/jpeg',
              kind: 'HOTEL_MAIN_IMAGE',
            },
          ],
          rooms: [
            {
              id: 'room-uuid',
              price: '150.00',
              price_egp: '1500.00',
              is_deleted: false,
              translations: [
                {
                  id: 'rt-1',
                  room_id: 'room-uuid',
                  language: 'ar',
                  name: 'غرفة ديلوكس',
                  description: 'غرفة فاخرة مع إطلالة على البحر',
                },
                {
                  id: 'rt-2',
                  room_id: 'room-uuid',
                  language: 'en',
                  name: 'Deluxe Room',
                  description: 'Luxury room with sea view',
                },
              ],
            },
          ],
          addons: [
            {
              id: 'addon-uuid',
              price: '50.00',
              price_egp: '500.00',
              is_deleted: false,
              translations: [
                {
                  id: 'at-1',
                  addon_id: 'addon-uuid',
                  language: 'ar',
                  name: 'إفطار',
                  description: 'وجبة إفطار فاخرة',
                },
                {
                  id: 'at-2',
                  addon_id: 'addon-uuid',
                  language: 'en',
                  name: 'Breakfast',
                  description: 'Luxury breakfast',
                },
              ],
            },
          ],
        },
      },
    }),
    ApiResponse({ status: 404, description: 'الفندق غير موجود' }),
  );

export const UpdateHotelSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'تعديل فندق',
      description:
        'تعديل بيانات الفندق وترجماته وغرفه وإضافاته. يمكن حذف صور عبر deleteAssetIds وإضافة صور رئيسية عبر mainImages وصور معرض عبر subImages',
    }),
    ApiConsumes('multipart/form-data'),
    ApiParam({
      name: 'id',
      description: 'معرّف الفندق (UUID)',
      example: 'bf176f2b-d79a-4b70-a8dd-e9f86f191371',
    }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          slug: {
            type: 'string',
            example: 'al-nakheel-hotel-updated',
            description: 'الـ slug الفريد للفندق (اختياري)',
          },
          destination: {
            type: 'string',
            enum: [
              'SHARM_EL_SHEIKH',
              'EL_GHARDQA',
              'EL_AIN_SOKHNA',
              'DAHAB',
              'EL_GOUNA',
              'NORTH_COAST',
              'CAIRO',
              'ALEXANDRIA',
              'SAHL_HASHEESH',
              'MARSA_MATROUH',
              'MARSA_ALAM',
              'FAYOUM',
              'ASWAN',
              'LUXOR',
            ],
            example: 'EL_GHARDQA',
          },
          initial_price: { type: 'number', example: 300, minimum: 0 },
          initial_price_egp: {
            type: 'number',
            example: 3000,
            minimum: 0,
            description:
              'السعر الحالي بالجنيه المصري (لزوار فئة المصري المقيم في مصر)',
          },
          stars: {
            type: 'string',
            enum: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'],
            example: 'FOUR',
          },
          rating: {
            type: 'string',
            enum: ['UNRATED', 'MOST_BOOKED', 'TOP_RATED', 'LOWEST_PRICE'],
          },
          meal_plan: {
            type: 'string',
            enum: [
              'ALL_INCLUSIVE',
              'BREAKFAST_ONLY',
              'BREAKFAST_AND_DINNER',
              'NO_MEALS',
            ],
            description: 'نوع الوجبات المشمولة (اختياري)',
          },
          is_discounted: { type: 'boolean' },
          discount_percentage: { type: 'number', minimum: 0, maximum: 100 },
          original_price: { type: 'number', minimum: 0 },
          original_price_egp: {
            type: 'number',
            minimum: 0,
            description:
              'السعر الأصلي بالجنيه المصري (لزوار فئة المصري المقيم في مصر)',
          },
          youtube_video_url: { type: 'string' },
          translations: {
            type: 'string',
            example:
              '[{"language":"ar","name":"فندق النخيل المحدث","description":"وصف محدث","Facilities":["مسبح","سبا"]}]',
            description:
              'JSON string - الترجمات المراد تحديثها (upsert). كل ترجمة تحتوي: language, name, description, Facilities',
          },
          rooms_write_mode: {
            type: 'string',
            enum: ['by_id'],
            description:
              'by_id: تصبح rooms مصفوفة upsert (صف فيه id يعدّل تلك الغرفة، وصف بدون id ينشئ غرفة، والغرف غير المذكورة تبقى). بدونها: إرسال rooms يستبدل كل الغرف، ويُرفض بـ 409 ROOM_IDS_REQUIRED إذا بدأ الفندق استخدام التقويم',
          },
          rooms: {
            type: 'string',
            example:
              '[{"id":"9b2f1c7e-4d3a-4f6b-8a1e-2c5d7f9e0a13","capacity":3,"translations":[{"language":"en","name":"Family Room"}]},{"price":150,"price_egp":1500,"capacity":2,"translations":[{"language":"ar","name":"غرفة ديلوكس"}]}]',
            description:
              'JSON string - الغرف (اختياري). صف بدون id يحتاج price, price_egp, translations ويقبل capacity. صف فيه id (مع by_id فقط) كل حقوله اختيارية: price, price_egp, capacity, translations',
          },
          delete_room_ids: {
            type: 'string',
            example: '["9b2f1c7e-4d3a-4f6b-8a1e-2c5d7f9e0a13"]',
            description:
              'JSON string - معرّفات غرف لأرشفتها (يتطلب rooms_write_mode=by_id)',
          },
          addons: {
            type: 'string',
            example:
              '[{"price":50,"price_egp":500,"translations":[{"language":"ar","name":"إفطار","description":"وجبة إفطار فاخرة"},{"language":"en","name":"Breakfast","description":"Luxury breakfast"}]}]',
            description:
              'JSON string - الإضافات (اختياري). إرسالها يستبدل الإضافات الحالية، ومصفوفة فارغة تحذفها، وعدم إرسالها يُبقيها (اختياري). كل إضافة تحتوي: price, price_egp, translations[]',
          },
          'deleteAssetIds[0]': {
            type: 'string',
            format: 'uuid',
            description: 'معرّف صورة لحذفها',
          },
          'deleteAssetIds[1]': {
            type: 'string',
            format: 'uuid',
            description: 'معرّف صورة لحذفها',
          },
          mainImages: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'صور رئيسية جديدة تُضاف للفندق (حتى 5 صور)',
          },
          subImages: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'صور معرض جديدة تُضاف للفندق (حتى 20 صورة)',
          },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'تم تعديل الفندق بنجاح' }),
    ApiResponse({ status: 400, description: 'بيانات غير صحيحة' }),
    ApiResponse({ status: 401, description: 'غير مصرح' }),
    ApiResponse({
      status: 409,
      description:
        'ROOM_IDS_REQUIRED: استبدال الغرف بدون by_id لفندق يستخدم التقويم',
    }),
    ApiResponse({ status: 404, description: 'الفندق غير موجود' }),
  );

export const DeleteHotelSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'حذف فندق' }),
    ApiParam({
      name: 'id',
      description: 'معرّف الفندق',
      example: 'uuid-here',
    }),
    ApiResponse({ status: 200, description: 'تم الحذف بنجاح' }),
    ApiResponse({ status: 404, description: 'الفندق غير موجود' }),
  );
