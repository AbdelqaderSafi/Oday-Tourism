import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const MAX_ROOM_CAPACITY = 50;

const CAPACITY_MESSAGE = `يجب أن تكون سعة الغرفة عددًا صحيحًا من 1 إلى ${MAX_ROOM_CAPACITY}`;

// Guests one unit sleeps. Multipart rows may send it as a string; '' and null clear it.
export const capacityField = z
  .unknown()
  .transform((value, ctx): number | null => {
    if (value === null || value === '') return null;
    const capacity =
      typeof value === 'string' && /^\s*\d+\s*$/.test(value)
        ? Number(value)
        : value;
    if (
      typeof capacity === 'number' &&
      Number.isInteger(capacity) &&
      capacity >= 1 &&
      capacity <= MAX_ROOM_CAPACITY
    ) {
      return capacity;
    }
    ctx.addIssue({ code: 'custom', message: CAPACITY_MESSAGE });
    return z.NEVER;
  });

function boundedIntField(min: number, message: string) {
  return z.unknown().transform((value, ctx): number | null => {
    if (value === null || value === '') return null;
    const parsed =
      typeof value === 'string' && /^\s*\d+\s*$/.test(value)
        ? Number(value)
        : value;
    if (
      typeof parsed === 'number' &&
      Number.isInteger(parsed) &&
      parsed >= min &&
      parsed <= MAX_ROOM_CAPACITY
    ) {
      return parsed;
    }
    ctx.addIssue({ code: 'custom', message });
    return z.NEVER;
  });
}

// Occupancy limits per room: null means no limit beyond capacity, 0 forbids the category.
export const OCCUPANCY_LIMIT_FIELDS = [
  'adult_capacity',
  'child_capacity',
  'children_under_3_capacity',
  'children_under_6_capacity',
  'children_6_to_12_capacity',
] as const;

export type OccupancyField = (typeof OCCUPANCY_LIMIT_FIELDS)[number];

export const occupancyLimitFields = {
  adult_capacity: boundedIntField(
    1,
    `حد البالغين عدد صحيح من 1 إلى ${MAX_ROOM_CAPACITY}`,
  ).optional(),
  child_capacity: boundedIntField(
    0,
    `حد الأطفال عدد صحيح من 0 إلى ${MAX_ROOM_CAPACITY}`,
  ).optional(),
  children_under_3_capacity: boundedIntField(
    0,
    `حد الأطفال أقل من 3 سنوات عدد صحيح من 0 إلى ${MAX_ROOM_CAPACITY}`,
  ).optional(),
  children_under_6_capacity: boundedIntField(
    0,
    `حد الأطفال أقل من 6 سنوات عدد صحيح من 0 إلى ${MAX_ROOM_CAPACITY}`,
  ).optional(),
  children_6_to_12_capacity: boundedIntField(
    0,
    `حد الأطفال من 6 إلى 12 سنة عدد صحيح من 0 إلى ${MAX_ROOM_CAPACITY}`,
  ).optional(),
};

export type OccupancyValues = Partial<
  Record<'capacity' | OccupancyField, number | null>
>;

// Checks the stored values merged with the request: adult and child limits <= capacity, age bands <= child limit.
export function occupancyIssues(
  values: OccupancyValues,
): { field: OccupancyField; message: string }[] {
  const capacity = values.capacity ?? null;
  const children = values.child_capacity ?? null;
  const issues: { field: OccupancyField; message: string }[] = [];
  const over = (value: number | null | undefined, limit: number | null) =>
    value !== null && value !== undefined && limit !== null && value > limit;
  if (over(values.adult_capacity, capacity))
    issues.push({
      field: 'adult_capacity',
      message: 'حد البالغين لا يتجاوز سعة الغرفة',
    });
  if (over(values.child_capacity, capacity))
    issues.push({
      field: 'child_capacity',
      message: 'حد الأطفال لا يتجاوز سعة الغرفة',
    });
  const bandLimit = children ?? capacity;
  for (const field of [
    'children_under_3_capacity',
    'children_under_6_capacity',
    'children_6_to_12_capacity',
  ] as const) {
    if (over(values[field], bandLimit))
      issues.push({
        field,
        message: 'حد الفئة العمرية لا يتجاوز حد الأطفال ولا سعة الغرفة',
      });
  }
  return issues;
}

export function assertOccupancy(values: OccupancyValues, fieldPrefix = '') {
  const issues = occupancyIssues(values);
  if (issues.length) {
    throw new BadRequestException({
      message: 'بيانات الطلب غير صالحة',
      errors: issues.map((issue) => ({
        field: `${fieldPrefix}${issue.field}`,
        message: issue.message,
      })),
    });
  }
}
