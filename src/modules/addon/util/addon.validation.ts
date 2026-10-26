import { z } from 'zod';
import { nullablePriceField, priceField } from 'src/modules/utils/price.util';

const addonTranslationSchema = z.object({
  language: z.enum(['ar', 'en']),
  name: z.string().min(2).max(255),
  description: z.string().min(2),
});

export const createAddonValidationSchema = z.object({
  price: priceField,
  price_egp: nullablePriceField.optional(),
  translations: z.array(addonTranslationSchema).min(1).max(2),
});

export const updateAddonValidationSchema = z.object({
  price: priceField.optional(),
  price_egp: nullablePriceField.optional(),
  translations: z.array(addonTranslationSchema).min(1).max(2).optional(),
});
