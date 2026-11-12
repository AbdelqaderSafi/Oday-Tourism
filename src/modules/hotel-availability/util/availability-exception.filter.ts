import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

type ErrorBody = Record<string, unknown>;

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'INVALID_INPUT',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

// Guards and the framework answer in English; these codes always answer in Arabic.
const ARABIC_MESSAGES: Partial<Record<string, string>> = {
  UNAUTHENTICATED: 'يجب تسجيل الدخول كمسؤول',
  FORBIDDEN: 'غير مسموح بهذه العملية',
  RATE_LIMITED: 'طلبات كثيرة، حاول مرة أخرى بعد قليل',
  INTERNAL_ERROR: 'حدث خطأ غير متوقع، حاول مرة أخرى',
};

function firstErrorField(errors: unknown): string | undefined {
  if (!Array.isArray(errors)) return undefined;
  const first: unknown = errors[0];
  if (
    typeof first === 'object' &&
    first !== null &&
    'field' in first &&
    typeof first.field === 'string'
  ) {
    return first.field;
  }
  return undefined;
}

export function toErrorBody(exception: unknown, status: number): ErrorBody {
  const raw = exception instanceof HttpException ? exception.getResponse() : {};
  const body: ErrorBody =
    typeof raw === 'string' ? { message: raw } : { ...(raw as ErrorBody) };
  const code =
    typeof body.code === 'string'
      ? body.code
      : (CODE_BY_STATUS[status] ??
        (status >= 500 ? 'INTERNAL_ERROR' : undefined));
  const result: ErrorBody = {
    ...body,
    statusCode: status,
    message: (code ? ARABIC_MESSAGES[code] : undefined) ?? body.message,
  };
  if (code) result.code = code;
  const field = body.field ?? firstErrorField(body.errors);
  if (field !== undefined) result.field = field;
  return result;
}

@Catch()
export class AvailabilityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AvailabilityExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500)
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json(toErrorBody(exception, status));
  }
}
