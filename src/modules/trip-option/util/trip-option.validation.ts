import { z } from 'zod';
import { Prisma } from 'generated/prisma/client';

const tripOptionTranslationSchema = z.object({
  language: z.enum(['ar', 'en']),
  name: z.string().min(2).max(255),
  description: z.string().min(2).optional(),
});

export const createTripOptionValidationSchema = z.object({
  price: z.coerce
    .number()
    .min(0)
    .transform((val) => new Prisma.Decimal(val)),
  translations: z.array(tripOptionTranslationSchema).min(1).max(2),
});

export const updateTripOptionValidationSchema = z.object({
  price: z.coerce
    .number()
    .min(0)
    .transform((val) => new Prisma.Decimal(val))
    .optional(),
  translations: z.array(tripOptionTranslationSchema).min(1).max(2).optional(),
});
