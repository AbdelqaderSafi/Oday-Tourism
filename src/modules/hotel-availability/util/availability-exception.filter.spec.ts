import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  AvailabilityExceptionFilter,
  toErrorBody,
} from './availability-exception.filter';
import { invalidInput, stayUnavailable } from './availability.errors';

describe('toErrorBody', () => {
  it('keeps validation details and surfaces the first field', () => {
    const errors = [{ field: 'check_in', message: 'x' }];
    expect(
      toErrorBody(
        new BadRequestException({ message: 'بيانات الطلب غير صالحة', errors }),
        400,
      ),
    ).toEqual({
      statusCode: 400,
      code: 'INVALID_INPUT',
      message: 'بيانات الطلب غير صالحة',
      field: 'check_in',
      errors,
    });
  });

  it('keeps explicit codes and fields', () => {
    expect(
      toErrorBody(
        invalidInput('rooms', 'معرّف غرفة غير صالح لهذا الفندق'),
        400,
      ),
    ).toEqual({
      statusCode: 400,
      code: 'INVALID_INPUT',
      message: 'معرّف غرفة غير صالح لهذا الفندق',
      field: 'rooms',
    });
    expect(toErrorBody(stayUnavailable('rooms'), 409)).toMatchObject({
      statusCode: 409,
      code: 'STAY_UNAVAILABLE',
      field: 'rooms',
    });
  });

  it('maps framework errors to codes with Arabic messages', () => {
    expect(toErrorBody(new UnauthorizedException(), 401)).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      message: 'يجب تسجيل الدخول كمسؤول',
    });
    expect(toErrorBody(new ThrottlerException(), 429)).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
    });
    expect(
      toErrorBody(new NotFoundException('الفندق غير موجود'), 404),
    ).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'الفندق غير موجود',
    });
  });

  it('hides unexpected errors behind INTERNAL_ERROR', () => {
    expect(toErrorBody(new Error('connection refused'), 500)).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'حدث خطأ غير متوقع، حاول مرة أخرى',
    });
  });
});

describe('AvailabilityExceptionFilter', () => {
  it('writes the status and body to the response', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    new AvailabilityExceptionFilter().catch(stayUnavailable(), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, code: 'STAY_UNAVAILABLE' }),
    );
  });
});
