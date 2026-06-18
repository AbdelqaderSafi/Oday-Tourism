import {
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { ZodError, ZodType } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private schema: ZodType<T>) {}

  transform(value: T, _metadata: ArgumentMetadata) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        // نرجّع 400 برسالة واضحة بدل 500 لأن الخطأ من بيانات الطلب
        throw new BadRequestException({
          message: 'بيانات الطلب غير صالحة',
          errors: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      throw error;
    }
  }
}
