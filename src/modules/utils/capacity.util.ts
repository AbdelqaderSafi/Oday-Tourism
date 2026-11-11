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
