import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export function invalidInput(field: string, message: string) {
  return new BadRequestException({ code: 'INVALID_INPUT', message, field });
}

export function notFound(message: string) {
  return new NotFoundException({ code: 'NOT_FOUND', message });
}

export function stayUnavailable(field?: 'rooms' | 'addons') {
  return new ConflictException({
    code: 'STAY_UNAVAILABLE',
    message: 'الغرف المختارة غير متاحة لهذه الإقامة',
    ...(field && { field }),
  });
}

export function calendarConflict() {
  return new ConflictException({
    code: 'CALENDAR_CONFLICT',
    message: 'تقويم الغرفة تغيّر منذ آخر تحميل؛ أعد تحميله ثم احفظ مرة أخرى',
  });
}

export function addonIdsRequired() {
  return new ConflictException({
    code: 'ADDON_IDS_REQUIRED',
    message:
      'هذا الفندق يدير الغرف بالتقويم؛ عدّل الترقيات بمعرّفاتها عبر addons_write_mode=by_id',
  });
}

export function roomIdsRequired() {
  return new ConflictException({
    code: 'ROOM_IDS_REQUIRED',
    message:
      'هذا الفندق يدير الغرف بالتقويم؛ عدّل الغرف بمعرّفاتها عبر rooms_write_mode=by_id',
  });
}
