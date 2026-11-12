import { z } from 'zod';
import { DestinatiosnEnum } from 'generated/prisma/client';
import { AVAILABILITY_LIMITS } from '../engine/availability-limits';
import { formatAmount, parseAmount } from '../engine/money';
import {
  addDays,
  daysBetween,
  hotelToday,
  isCalendarDate,
  stayNights,
} from '../engine/stay-dates';

const LIMITS = AVAILABILITY_LIMITS;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Issue = { path: (string | number)[]; message: string };

const dateField = z
  .string()
  .refine(
    isCalendarDate,
    'يجب أن يكون التاريخ بصيغة YYYY-MM-DD وتاريخًا صحيحًا',
  );

export const calendarRangeQuerySchema = z
  .object({ from: dateField, to: dateField })
  .transform((range, ctx) => {
    const nights = daysBetween(range.from, range.to);
    if (nights < 1 || nights > LIMITS.maxCalendarRangeNights) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `to يجب أن يكون بعد from بمدى لا يتجاوز ${LIMITS.maxCalendarRangeNights} ليلة`,
      });
    }
    return range;
  });

const overrideAmountField = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    const cents = parseAmount(String(value));
    if (cents !== null && cents > 0) return formatAmount(cents);
    ctx.addIssue({
      code: 'custom',
      message:
        'السعر يجب أن يكون أكبر من صفر بحد أقصى منزلتين عشريتين ولا يتجاوز 99999999.99',
    });
    return z.NEVER;
  });

const calendarChangeSchema = z.object({
  from: dateField,
  to: dateField,
  available_units: z
    .number()
    .int()
    .min(0)
    .max(LIMITS.maxAvailableUnits)
    .optional(),
  rate_override: z
    .strictObject({
      USD: overrideAmountField.nullable().optional(),
      EGP: overrideAmountField.nullable().optional(),
    })
    .optional(),
});

function calendarChangeIssues(
  changes: z.output<typeof calendarChangeSchema>[],
): Issue[] {
  const today = hotelToday();
  const windowEnd = addDays(today, LIMITS.bookingWindowDays);
  const seen = new Set<string>();
  const issues: Issue[] = [];
  changes.forEach((change, index) => {
    const nights = daysBetween(change.from, change.to);
    if (nights < 1 || nights > LIMITS.maxCalendarRangeNights) {
      issues.push({
        path: ['changes', index, 'to'],
        message: `to يجب أن يكون بعد from بمدى لا يتجاوز ${LIMITS.maxCalendarRangeNights} ليلة`,
      });
      return;
    }
    if (change.from < today)
      issues.push({
        path: ['changes', index, 'from'],
        message: 'لا يمكن تعديل ليالٍ قبل اليوم',
      });
    if (change.to > windowEnd)
      issues.push({
        path: ['changes', index, 'to'],
        message: `لا يمكن تعديل ليالٍ بعد ${LIMITS.bookingWindowDays} يومًا من اليوم`,
      });
    if (
      change.available_units === undefined &&
      change.rate_override?.USD === undefined &&
      change.rate_override?.EGP === undefined
    ) {
      issues.push({
        path: ['changes', index],
        message: 'حدد عدد الوحدات أو سعرًا واحدًا على الأقل',
      });
    }
    const dates = stayNights(change.from, change.to);
    if (dates.some((date) => seen.has(date)))
      issues.push({ path: ['changes', index], message: 'الفترات متداخلة' });
    for (const date of dates) seen.add(date);
  });
  return issues;
}

export const calendarUpdateBodySchema = z
  .object({
    revision: z.number().int().min(0),
    changes: z
      .array(calendarChangeSchema)
      .min(1)
      .max(LIMITS.maxCalendarChanges),
  })
  .transform((body, ctx) => {
    for (const issue of calendarChangeIssues(body.changes))
      ctx.addIssue({ code: 'custom', ...issue });
    return body;
  });

const idField = z.string().regex(UUID_PATTERN, 'معرّف غير صالح').toLowerCase();
const quantityField = z
  .number()
  .int('الكمية يجب أن تكون عددًا صحيحًا')
  .min(1, 'الكمية يجب أن تكون 1 على الأقل');
const visitorCategoryField = z.enum(
  ['egyptian-resident', 'other'],
  'visitor_category يجب أن تكون egyptian-resident أو other',
);

type StayFields = {
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
};

function stayIssues(stay: StayFields): Issue[] {
  const today = hotelToday();
  const nights = daysBetween(stay.check_in, stay.check_out);
  const issues: Issue[] = [];
  if (stay.check_in < today)
    issues.push({
      path: ['check_in'],
      message: 'تاريخ الوصول لا يمكن أن يكون قبل اليوم',
    });
  if (nights < 1)
    issues.push({
      path: ['check_out'],
      message: 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول',
    });
  else if (nights > LIMITS.maxStayNights)
    issues.push({
      path: ['check_out'],
      message: `مدة الإقامة لا تتجاوز ${LIMITS.maxStayNights} ليلة`,
    });
  if (stay.check_out > addDays(today, LIMITS.bookingWindowDays)) {
    issues.push({
      path: ['check_out'],
      message: `تاريخ المغادرة يجب أن يكون خلال ${LIMITS.bookingWindowDays} يومًا من اليوم`,
    });
  }
  if (stay.adults + stay.children > LIMITS.maxGuests)
    issues.push({
      path: ['adults'],
      message: `عدد الضيوف الإجمالي لا يتجاوز ${LIMITS.maxGuests}`,
    });
  return issues;
}

export const staySearchQuerySchema = z
  .object({
    destination: z.enum(DestinatiosnEnum),
    check_in: dateField,
    check_out: dateField,
    adults: z.coerce.number().int().min(1),
    children: z.coerce.number().int().min(0).default(0),
    visitor_category: visitorCategoryField,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(LIMITS.maxSearchPageSize)
      .default(LIMITS.defaultSearchPageSize),
  })
  .transform((query, ctx) => {
    for (const issue of stayIssues(query))
      ctx.addIssue({ code: 'custom', ...issue });
    return query;
  });

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

type SelectionFields = StayFields & {
  rooms?: { room_id: string; quantity: number }[];
  addons?: { addon_id: string; quantity: number }[];
};

function selectionIssues(body: SelectionFields): Issue[] {
  const addons = body.addons ?? [];
  if (!body.rooms)
    return addons.length
      ? [{ path: ['addons'], message: 'الترقيات تتطلب تحديد الغرف' }]
      : [];
  const issues: Issue[] = [];
  const roomCount = body.rooms.reduce((sum, room) => sum + room.quantity, 0);
  if (hasDuplicates(body.rooms.map((room) => room.room_id)))
    issues.push({ path: ['rooms'], message: 'لا يجوز تكرار الغرفة نفسها' });
  if (roomCount > body.adults + body.children)
    issues.push({ path: ['rooms'], message: 'عدد الغرف لا يتجاوز عدد الضيوف' });
  if (hasDuplicates(addons.map((addon) => addon.addon_id)))
    issues.push({ path: ['addons'], message: 'لا يجوز تكرار الترقية نفسها' });
  if (addons.reduce((sum, addon) => sum + addon.quantity, 0) > roomCount)
    issues.push({
      path: ['addons'],
      message: 'عدد الترقيات لا يتجاوز عدد الغرف',
    });
  return issues;
}

export const stayQuoteBodySchema = z
  .object({
    check_in: dateField,
    check_out: dateField,
    adults: z.number().int().min(1),
    children: z.number().int().min(0).default(0),
    visitor_category: visitorCategoryField,
    rooms: z
      .array(z.object({ room_id: idField, quantity: quantityField }))
      .min(1, 'rooms لا يمكن أن تكون فارغة')
      .optional(),
    addons: z
      .array(z.object({ addon_id: idField, quantity: quantityField }))
      .optional(),
  })
  .transform((body, ctx) => {
    for (const issue of [...stayIssues(body), ...selectionIssues(body)])
      ctx.addIssue({ code: 'custom', ...issue });
    return body;
  });
