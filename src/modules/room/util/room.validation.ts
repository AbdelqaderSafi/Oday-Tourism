import { z } from 'zod';
import { nullablePriceField, priceField } from 'src/modules/utils/price.util';
import {
  capacityField,
  occupancyIssues,
  occupancyLimitFields,
} from 'src/modules/utils/capacity.util';

const roomTranslationSchema = z.object({
  language: z.enum(['ar', 'en']),
  name: z.string().min(2).max(255),
  description: z.string().min(1).optional(),
});

export const createRoomValidationSchema = z
  .object({
    price: priceField,
    price_egp: nullablePriceField.optional(),
    capacity: capacityField.optional(),
    ...occupancyLimitFields,
    translations: z.array(roomTranslationSchema).min(1).max(2),
  })
  .superRefine((room, ctx) => {
    for (const issue of occupancyIssues(room))
      ctx.addIssue({
        code: 'custom',
        path: [issue.field],
        message: issue.message,
      });
  });

// Cross-field limits on update are checked in RoomService against the stored values.
export const updateRoomValidationSchema = z.object({
  price: priceField.optional(),
  price_egp: nullablePriceField.optional(),
  capacity: capacityField.optional(),
  ...occupancyLimitFields,
  translations: z.array(roomTranslationSchema).min(1).max(2).optional(),
});
