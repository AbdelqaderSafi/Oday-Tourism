import { z } from 'zod';
import { nullablePriceField, priceField } from 'src/modules/utils/price.util';

const tripAddonTranslationSchema = z.object({
  language: z.enum(['ar', 'en']),
  name: z.string().min(2).max(255),
  description: z.string().min(2),
});

export const createTripAddonValidationSchema = z.object({
  price: priceField,
  price_egp: nullablePriceField.optional(),
  translations: z.array(tripAddonTranslationSchema).min(1).max(2),
});

export const updateTripAddonValidationSchema = z.object({
  price: priceField.optional(),
  price_egp: nullablePriceField.optional(),
  translations: z.array(tripAddonTranslationSchema).min(1).max(2).optional(),
});
