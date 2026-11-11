import { z } from 'zod';
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
