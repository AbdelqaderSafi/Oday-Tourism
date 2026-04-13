import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

export const CreateTripSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'إنشاء رحلة جديدة',
      description:
        'إنشاء رحلة مع الترجمات (عربي/إنجليزي) ورفع صورة رئيسية واحدة وصور فرعية',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: [
          'slug',
          'city',
          'price',
          'start_time',
          'end_time',
          'translations',
          'mainImages',
        ],
        properties: {
          slug: {
            type: 'string',
            example: 'cairo-historical-trip',
            description: 'الـ slug الفريد للرحلة',
          },
          city: {
            type: 'string',
            enum: ['SHARM_EL_SHEIKH', 'EL_GHARDQA', 'EL_AIN_SOKHNA', 'DAHAB'],
            example: 'SHARM_EL_SHEIKH',
            description: 'المدينة التي تنطلق منها الرحلة',
          },
          price: { type: 'number', example: 350, minimum: 0 },
          start_time: {
            type: 'string',
            example: '8:00 AM',
            description: 'وقت البدء',
          },
          end_time: {
            type: 'string',
            example: '6:00 PM',
            description: 'وقت الانتهاء',
          },
          youtube_video_url: {
            type: 'string',
            example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            description: 'رابط فيديو يوتيوب للرحلة (اختياري)',
          },
          translations: {
            type: 'string',
            example:
              '[{"language":"ar","title":"رحلة القاهرة التاريخية","subtitle":"استكشف الأهرامات","description":"رحلة مميزة لاستكشاف معالم القاهرة التاريخية","duration":"3 أيام / 2 ليالي","facilities":["نقل مكيف","دليل سياحي","غداء"]},{"language":"en","title":"Cairo Historical Trip","subtitle":"Explore the Pyramids","description":"Amazing trip to explore Cairo\'s historical landmarks","duration":"3 Days / 2 Nights","facilities":["Air-conditioned transport","Tour guide","Lunch"]}]',
            description:
              'JSON string - مصفوفة الترجمات (عربي وإنجليزي). كل ترجمة تحتوي: language, title, subtitle, description, duration, facilities',
          },
          mainImages: {
            type: 'string',
            format: 'binary',
            description: 'الصورة الرئيسية للرحلة (صورة واحدة فقط)',
          },
          subImages: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'صور المعرض الفرعية (حتى 20 صورة)',
          },
          options: {
            type: 'string',
            example:
              '[{"price":100,"translations":[{"language":"ar","name":"خيار قياسي","description":"وصف الخيار القياسي"},{"language":"en","name":"Standard Option","description":"Standard option description"}]}]',
            description:
              'JSON string - مصفوفة الخيارات (اختياري). كل خيار يحتوي: price, translations[] (name مطلوب، description اختياري)',
          },
          addons: {
            type: 'string',
            example:
              '[{"price":50,"translations":[{"language":"ar","name":"وجبة عشاء","description":"عشاء فاخر"},{"language":"en","name":"Dinner","description":"Luxury dinner"}]}]',
            description:
              'JSON string - مصفوفة الإضافات (اختياري). كل إضافة تحتوي: price, translations[]',
          },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'تم إنشاء الرحلة بنجاح' }),
    ApiResponse({ status: 400, description: 'بيانات غير صحيحة' }),
    ApiResponse({ status: 401, description: 'غير مصرح' }),
  );

export const FindAllTripsSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'جلب جميع الرحلات',
      description: 'جلب الرحلات مع الترجمات والصور، مع دعم الـ pagination والفلترة بالمدينة',
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
      name: 'city',
      required: false,
      enum: ['SHARM_EL_SHEIKH', 'EL_GHARDQA', 'EL_AIN_SOKHNA', 'DAHAB'],
      description: 'فلترة الرحلات حسب المدينة',
    }),
    ApiResponse({
      status: 200,
      description: 'قائمة الرحلات مع الترجمات وبيانات الـ pagination',
    }),
  );

export const FindOneTripSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'جلب رحلة بالـ ID',
      description: 'جلب بيانات رحلة محددة مع جميع ترجماتها وصورها',
    }),
    ApiParam({
      name: 'id',
      description: 'معرّف الرحلة (UUID)',
      example: 'bf176f2b-d79a-4b70-a8dd-e9f86f191371',
    }),
    ApiResponse({
      status: 200,
      description: 'بيانات الرحلة مع الترجمات والصور',
      schema: {
        example: {
          id: 'bf176f2b-d79a-4b70-a8dd-e9f86f191371',
          slug: 'cairo-historical-trip',
          price: '350.00',
          start_time: '8:00 AM',
          end_time: '6:00 PM',
          youtube_video_url: null,
          is_deleted: false,
          created_at: '2026-03-18T10:00:00.000Z',
          updated_at: '2026-03-18T10:00:00.000Z',
          translations: [
            {
              id: 'uuid-1',
              trip_id: 'bf176f2b-d79a-4b70-a8dd-e9f86f191371',
              language: 'ar',
              title: 'رحلة القاهرة التاريخية',
              subtitle: 'استكشف الأهرامات',
              description: 'رحلة مميزة لاستكشاف معالم القاهرة التاريخية',
              duration: '3 أيام / 2 ليالي',
              facilities: ['نقل مكيف', 'دليل سياحي', 'غداء'],
            },
            {
              id: 'uuid-2',
              trip_id: 'bf176f2b-d79a-4b70-a8dd-e9f86f191371',
              language: 'en',
              title: 'Cairo Historical Trip',
              subtitle: 'Explore the Pyramids',
              description:
                "Amazing trip to explore Cairo's historical landmarks",
              duration: '3 Days / 2 Nights',
              facilities: ['Air-conditioned transport', 'Tour guide', 'Lunch'],
            },
          ],
          assets: [
            {
              id: 'uuid',
              url: 'https://ik.imagekit.io/...',
              fileType: 'image/jpeg',
              kind: 'TRIP_MAIN_IMAGE',
            },
          ],
          options: [
            {
              id: 'option-uuid',
              price: '100.00',
              is_deleted: false,
              translations: [
                {
                  id: 'ot-1',
                  option_id: 'option-uuid',
                  language: 'ar',
                  name: 'خيار قياسي',
                  description: 'وصف الخيار القياسي',
                },
                {
                  id: 'ot-2',
                  option_id: 'option-uuid',
                  language: 'en',
                  name: 'Standard Option',
                  description: 'Standard option description',
                },
              ],
            },
          ],
          addons: [
            {
              id: 'addon-uuid',
              price: '50.00',
              is_deleted: false,
              translations: [
                {
                  id: 'at-1',
                  addon_id: 'addon-uuid',
                  language: 'ar',
                  name: 'وجبة عشاء',
                  description: 'عشاء فاخر',
                },
                {
                  id: 'at-2',
                  addon_id: 'addon-uuid',
                  language: 'en',
                  name: 'Dinner',
                  description: 'Luxury dinner',
                },
              ],
            },
          ],
        },
      },
    }),
    ApiResponse({ status: 404, description: 'الرحلة غير موجودة' }),
  );

export const UpdateTripSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'تعديل رحلة',
      description:
        'تعديل بيانات الرحلة وترجماتها وخياراتها وإضافاتها. يمكن حذف صور عبر deleteAssetIds وإضافة صورة رئيسية عبر mainImages وصور معرض عبر subImages',
    }),
    ApiConsumes('multipart/form-data'),
    ApiParam({
      name: 'id',
      description: 'معرّف الرحلة (UUID)',
      example: 'bf176f2b-d79a-4b70-a8dd-e9f86f191371',
    }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          slug: {
            type: 'string',
            example: 'cairo-historical-trip-updated',
            description: 'الـ slug الفريد للرحلة (اختياري)',
          },
          city: {
            type: 'string',
            enum: ['SHARM_EL_SHEIKH', 'EL_GHARDQA', 'EL_AIN_SOKHNA', 'DAHAB'],
            example: 'EL_GHARDQA',
            description: 'المدينة التي تنطلق منها الرحلة (اختياري)',
          },
          price: { type: 'number', example: 400, minimum: 0 },
          start_time: { type: 'string', example: '9:00 AM' },
          end_time: { type: 'string', example: '7:00 PM' },
          youtube_video_url: {
            type: 'string',
            example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            description: 'رابط فيديو يوتيوب (اختياري، أرسل سلسلة فارغة لإزالته)',
          },
          translations: {
            type: 'string',
            example:
              '[{"language":"ar","title":"رحلة القاهرة المحدثة","subtitle":"استكشف الأهرامات","description":"وصف محدث","duration":"4 أيام / 3 ليالي","facilities":["نقل","دليل"]}]',
            description:
              'JSON string - الترجمات المراد تحديثها (upsert). كل ترجمة تحتوي: language, title, subtitle, description, duration, facilities',
          },
          options: {
            type: 'string',
            example:
              '[{"price":100,"translations":[{"language":"ar","name":"خيار قياسي","description":"وصف الخيار القياسي"},{"language":"en","name":"Standard Option","description":"Standard option description"}]}]',
            description:
              'JSON string - خيارات جديدة تُضاف للرحلة (اختياري). كل خيار يحتوي: price, translations[] (name مطلوب، description اختياري)',
          },
          addons: {
            type: 'string',
            example:
              '[{"price":50,"translations":[{"language":"ar","name":"وجبة عشاء","description":"عشاء فاخر"},{"language":"en","name":"Dinner","description":"Luxury dinner"}]}]',
            description:
              'JSON string - إضافات جديدة تُضاف للرحلة (اختياري). كل إضافة تحتوي: price, translations[]',
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
            type: 'string',
            format: 'binary',
            description: 'صورة رئيسية جديدة للرحلة (صورة واحدة فقط)',
          },
          subImages: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'صور معرض جديدة تُضاف للرحلة (حتى 20 صورة)',
          },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'تم تعديل الرحلة بنجاح' }),
    ApiResponse({ status: 400, description: 'بيانات غير صحيحة' }),
    ApiResponse({ status: 401, description: 'غير مصرح' }),
    ApiResponse({ status: 404, description: 'الرحلة غير موجودة' }),
  );

export const DeleteTripSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'حذف رحلة' }),
    ApiParam({
      name: 'id',
      description: 'معرّف الرحلة',
      example: 'uuid-here',
    }),
    ApiResponse({ status: 200, description: 'تم الحذف بنجاح' }),
    ApiResponse({ status: 404, description: 'الرحلة غير موجودة' }),
  );
