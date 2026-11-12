import { z } from 'zod';
import { paginationSchema } from 'src/modules/utils/api.util';
import { HotelQuery } from '../types/hotel.types';
import { Prisma } from 'generated/prisma/client';
import {
  getDiscountPriceIssues,
  nullablePriceField,
  priceField,
} from 'src/modules/utils/price.util';
import { capacityField } from 'src/modules/utils/capacity.util';

// Zod v4 uuid() is overly strict with version/variant bits.
// Also trim whitespace/newlines that multipart/form-data can append to field values.
const uuidLike = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Invalid UUID',
  );

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

const roomTranslationsSchema = z
  .array(
    z.object({
      language: z.enum(['ar', 'en']),
      name: z.string().min(2).max(255),
      description: z.string().min(1).optional(),
    }),
  )
  .min(1)
  .max(2);

const roomInputSchema = z.object({
  price: priceField,
  price_egp: priceField,
  capacity: capacityField.optional(),
  translations: roomTranslationsSchema,
});

// by_id rows: a row with an id edits that room type; a row without one creates a type.
const roomUpdateRowSchema = z.object({
  id: uuidLike.toLowerCase(),
  price: priceField.optional(),
  price_egp: nullablePriceField.optional(),
  capacity: capacityField.optional(),
  translations: roomTranslationsSchema.optional(),
});

const addonInputSchema = z.object({
  price: priceField,
  price_egp: priceField,
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

function parseJsonArray(value: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const roomWriteRowsField = z.string().transform((value, ctx) => {
  const rows = parseJsonArray(value);
  if (!rows) {
    ctx.addIssue({ code: 'custom', message: 'rooms يجب أن تكون مصفوفة JSON' });
    return z.NEVER;
  }
  return rows.map((row, index) => {
    const schema =
      typeof row === 'object' && row !== null && 'id' in row
        ? roomUpdateRowSchema
        : roomInputSchema;
    const result = schema.safeParse(row);
    if (result.success) return result.data;
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: 'custom',
        path: [index, ...issue.path],
        message: issue.message,
      });
    }
    return z.NEVER;
  });
});

const deleteRoomIdsField = z.string().transform((value, ctx) => {
  const result = z
    .array(uuidLike.toLowerCase())
    .safeParse(parseJsonArray(value));
  if (result.success) return result.data;
  ctx.addIssue({
    code: 'custom',
    message: 'delete_room_ids يجب أن تكون مصفوفة JSON من معرّفات الغرف',
  });
  return z.NEVER;
});

export const hotelValidationSchema = z
  .object({
    slug: z.string().min(2).max(255),
    destination: z.enum([
      'SHARM_EL_SHEIKH',
      'EL_GHARDQA',
      'EL_AIN_SOKHNA',
      'DAHAB',
      'EL_GOUNA',
      'NORTH_COAST',
      'CAIRO',
      'ALEXANDRIA',
      'SAHL_HASHEESH',
      'MARSA_MATROUH',
      'MARSA_ALAM',
      'FAYOUM',
      'ASWAN',
      'LUXOR',
    ]),
    initial_price: priceField,
    initial_price_egp: priceField,
    stars: z.enum(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE']),
    rating: z.enum(['UNRATED', 'MOST_BOOKED', 'TOP_RATED', 'LOWEST_PRICE']),
    meal_plan: z
      .enum([
        'ALL_INCLUSIVE',
        'BREAKFAST_ONLY',
        'BREAKFAST_AND_DINNER',
        'NO_MEALS',
      ])
      .optional(),
    is_discounted: z
      .union([z.boolean(), z.string().transform((val) => val === 'true')])
      .default(false),
    discount_percentage: z.coerce
      .number()
      .min(0)
      .max(100)
      .transform((val) => new Prisma.Decimal(val))
      .optional(),
    original_price: nullablePriceField.optional(),
    original_price_egp: nullablePriceField.optional(),
    youtube_video_url: z.union([z.string().url(), z.literal('')]).optional(),
    translations: translationsField,
    rooms: roomsField,
    addons: addonsField,
  })
  .superRefine((hotel, ctx) => {
    for (const issue of getDiscountPriceIssues(hotel)) {
      ctx.addIssue({
        code: 'custom',
        path: [issue.field],
        message: issue.message,
      });
    }
  });

export const updateHotelValidationSchema = z
  .object({
    slug: z.string().min(2).max(255).optional(),
    destination: z
      .union([
        z.enum([
          'SHARM_EL_SHEIKH',
          'EL_GHARDQA',
          'EL_AIN_SOKHNA',
          'DAHAB',
          'EL_GOUNA',
          'NORTH_COAST',
          'CAIRO',
          'ALEXANDRIA',
          'SAHL_HASHEESH',
          'MARSA_MATROUH',
          'MARSA_ALAM',
          'FAYOUM',
          'ASWAN',
          'LUXOR',
        ]),
        z.literal('').transform(() => undefined),
      ])
      .optional(),
    initial_price: priceField.optional(),
    initial_price_egp: priceField.optional(),
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
        z.enum([
          'ALL_INCLUSIVE',
          'BREAKFAST_ONLY',
          'BREAKFAST_AND_DINNER',
          'NO_MEALS',
        ]),
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
    original_price: nullablePriceField.optional(),
    original_price_egp: nullablePriceField.optional(),
    youtube_video_url: z.union([z.string().url(), z.literal('')]).optional(),
    translations: translationsField.optional(),
    rooms: roomWriteRowsField.optional(),
    rooms_write_mode: z
      .enum(['by_id', ''], 'القيمة المسموحة لـ rooms_write_mode هي by_id فقط')
      .transform((mode) => mode || undefined)
      .optional(),
    delete_room_ids: deleteRoomIdsField.optional(),
    addons: addonsField,
    deleteAssetIds: z
      .union([z.array(uuidLike), uuidLike.transform((v) => [v])])
      .optional(),
  })
  .transform((hotel, ctx) => {
    const issue = (field: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [field], message });
    const editedIds = (hotel.rooms ?? []).flatMap((row) =>
      'id' in row ? [row.id] : [],
    );
    const deleteIds = hotel.delete_room_ids ?? [];
    if (hotel.rooms_write_mode !== 'by_id') {
      if (hotel.delete_room_ids !== undefined)
        issue(
          'delete_room_ids',
          'delete_room_ids يتطلب rooms_write_mode=by_id',
        );
      if (editedIds.length)
        issue(
          'rooms_write_mode',
          'تعديل الغرف بمعرّفاتها يتطلب rooms_write_mode=by_id',
        );
      return hotel;
    }
    if (new Set(editedIds).size !== editedIds.length)
      issue('rooms', 'لا يجوز تكرار معرّف الغرفة');
    if (new Set(deleteIds).size !== deleteIds.length)
      issue('delete_room_ids', 'لا يجوز تكرار معرّف الغرفة');
    if (deleteIds.some((roomId) => editedIds.includes(roomId)))
      issue('delete_room_ids', 'لا يمكن تعديل غرفة وحذفها في الطلب نفسه');
    return hotel;
  });

export const hotelPaginationSchema = paginationSchema.extend({
  destination: z
    .enum([
      'SHARM_EL_SHEIKH',
      'EL_GHARDQA',
      'EL_AIN_SOKHNA',
      'DAHAB',
      'EL_GOUNA',
      'NORTH_COAST',
      'CAIRO',
      'ALEXANDRIA',
      'SAHL_HASHEESH',
      'MARSA_MATROUH',
      'MARSA_ALAM',
      'FAYOUM',
      'ASWAN',
      'LUXOR',
    ])
    .optional(),
  rating: z
    .enum(['UNRATED', 'MOST_BOOKED', 'TOP_RATED', 'LOWEST_PRICE'])
    .optional(),
}) satisfies z.ZodType<HotelQuery>;
