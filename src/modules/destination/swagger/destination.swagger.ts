import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { DestinatiosnEnum } from 'generated/prisma/client';

const destinationParam = ApiParam({
  name: 'destination',
  description: 'الوجهة (من الوجهات المحددة للفنادق والرحلات)',
  enum: Object.values(DestinatiosnEnum),
});

export const FindAllDestinationsSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'جلب الوجهات مع صورة وعدد الفنادق والرحلات لكل وجهة',
      description:
        'type=hotels يرجع الوجهات التي فيها فنادق فقط، و type=trips يرجع الوجهات التي فيها رحلات فقط. لعرض فنادق وجهة: GET /hotel?destination=X، ولعرض رحلاتها: GET /trip?city=X',
    }),
    ApiQuery({
      name: 'type',
      required: false,
      enum: ['hotels', 'trips'],
      description: 'فصل الوجهات حسب القسم (فنادق أو رحلات)',
    }),
    ApiResponse({
      status: 200,
      description:
        'قائمة الوجهات، و image تكون null إذا لم تُضف صورة، مع hotels_count و trips_count',
    }),
  );

export const FindOneDestinationSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'جلب صورة وجهة معينة' }),
    destinationParam,
    ApiResponse({ status: 200, description: 'بيانات الوجهة مع الصورة' }),
    ApiResponse({ status: 400, description: 'وجهة غير صالحة' }),
  );

export const SetDestinationImageSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'إضافة أو استبدال صورة الوجهة',
      description: 'إذا كان للوجهة صورة سابقة يتم استبدالها وحذفها من التخزين',
    }),
    destinationParam,
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['image'],
        properties: {
          image: {
            type: 'string',
            format: 'binary',
            description: 'صورة الوجهة',
          },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'تم حفظ صورة الوجهة بنجاح' }),
    ApiResponse({
      status: 400,
      description: 'يجب إرفاق صورة أو وجهة غير صالحة',
    }),
  );

export const RemoveDestinationImageSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'حذف صورة الوجهة' }),
    destinationParam,
    ApiResponse({ status: 200, description: 'تم الحذف بنجاح' }),
    ApiResponse({ status: 404, description: 'لا توجد صورة لهذه الوجهة' }),
  );
