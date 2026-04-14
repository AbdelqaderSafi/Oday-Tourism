import { z } from 'zod';
import { paginationSchema } from 'src/modules/utils/api.util';
import { HotelQuery } from '../types/hotel.types';
import { Prisma } from 'generated/prisma/client';

const translationSchema = z.object({
  language: z.enum(['ar', 'en']),
  name: z.string().min(2).max(255),
  description: z.string().min(2),
  Facilities: z.array(z.string().min(1).max(255)),
});

// In multipart/form-data, translations arrive as a JSON string
const translationsField = z
  .string()
  .transform((val) => JSON.parse(val) as unknown)
  .pipe(z.array(translationSchema).min(1).max(2));

const roomInputSchema = z.object({
  price: z.coerce
    .number()
    .min(0)
    .transform((val) => new Prisma.Decimal(val)),
  translations: z
    .array(
      z.object({
        language: z.enum(['ar', 'en']),
        name: z.string().min(2).max(255),
        description: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(2),
});

const addonInputSchema = z.object({
  price: z.coerce
    .number()
    .min(0)
    .transform((val) => new Prisma.Decimal(val)),
  translations: z
    .array(
      z.object({
        language: z.enum(['ar', 'en']),
        name: z.string().min(2).max(255),
        description: z.string().min(2),
      }),
    )
    .min(1)
    .max(2),
});

// rooms and addons also arrive as JSON strings in multipart/form-data
const roomsField = z
  .string()
  .transform((val) => JSON.parse(val) as unknown)
  .pipe(z.array(roomInputSchema))
  .optional();

const addonsField = z
  .string()
  .transform((val) => JSON.parse(val) as unknown)
  .pipe(z.array(addonInputSchema))
  .optional();

export const hotelValidationSchema = z.object({
  slug: z.string().min(2).max(255),
  destination: z.enum([
    'SHARM_EL_SHEIKH',
    'EL_GHARDQA',
    'EL_AIN_SOKHNA',
    'DAHAB',
  ]),
  initial_price: z.coerce
    .number()
    .min(0)
    .transform((val) => new Prisma.Decimal(val)),
  stars: z.enum(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE']),
  rating: z.enum(['UNRATED', 'MOST_BOOKED', 'TOP_RATED', 'LOWEST_PRICE']),
  meal_plan: z.enum(['ALL_INCLUSIVE', 'BREAKFAST_ONLY', 'BREAKFAST_AND_DINNER', 'NO_MEALS']).optional(),
  is_discounted: z
    .union([z.boolean(), z.string().transform((val) => val === 'true')])
    .default(false),
  discount_percentage: z.coerce
    .number()
    .min(0)
    .max(100)
    .transform((val) => new Prisma.Decimal(val))
    .optional(),
  original_price: z.coerce
    .number()
    .min(0)
    .transform((val) => new Prisma.Decimal(val))
    .optional(),
  youtube_video_url: z.union([z.string().url(), z.literal('')]).optional(),
  translations: translationsField,
  rooms: roomsField,
  addons: addonsField,
});

// Zod v4 uuid() is overly strict with version/variant bits.
// Also trim whitespace/newlines that multipart/form-data can append to field values.
const uuidLike = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Invalid UUID',
  );

export const updateHotelValidationSchema = z.object({
  slug: z.string().min(2).max(255).optional(),
  destination: z
    .union([
      z.enum(['SHARM_EL_SHEIKH', 'EL_GHARDQA', 'EL_AIN_SOKHNA', 'DAHAB']),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  initial_price: z.coerce
    .number()
    .min(0)
    .transform((val) => new Prisma.Decimal(val))
    .optional(),
  stars: z
    .union([
      z.enum(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE']),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  rating: z
    .union([
      z.enum(['UNRATED', 'MOST_BOOKED', 'TOP_RATED', 'LOWEST_PRICE']),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  meal_plan: z
    .union([
      z.enum(['ALL_INCLUSIVE', 'BREAKFAST_ONLY', 'BREAKFAST_AND_DINNER', 'NO_MEALS']),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  is_discounted: z
    .union([z.boolean(), z.string().transform((val) => val === 'true')])
    .optional(),
  discount_percentage: z.coerce
    .number()
    .min(0)
    .max(100)
    .transform((val) => new Prisma.Decimal(val))
    .optional(),
  original_price: z.coerce
    .number()
    .min(0)
    .transform((val) => new Prisma.Decimal(val))
    .optional(),
  youtube_video_url: z.union([z.string().url(), z.literal('')]).optional(),
  translations: translationsField.optional(),
  rooms: roomsField,
  addons: addonsField,
  deleteAssetIds: z
    .union([z.array(uuidLike), uuidLike.transform((v) => [v])])
    .optional(),
});

export const hotelPaginationSchema = paginationSchema.extend({
  destination: z
    .enum(['SHARM_EL_SHEIKH', 'EL_GHARDQA', 'EL_AIN_SOKHNA', 'DAHAB'])
    .optional(),
  rating: z
    .enum(['UNRATED', 'MOST_BOOKED', 'TOP_RATED', 'LOWEST_PRICE'])
    .optional(),
}) satisfies z.ZodType<HotelQuery>;
