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

const addonTranslationsSchema = z
  .array(
    z.object({
      language: z.enum(['ar', 'en']),
      name: z.string().min(2).max(255),
      description: z.string().min(2),
    }),
  )
  .min(1)
  .max(2);

const addonInputSchema = z.object({
  price: priceField,
  price_egp: priceField,
  translations: addonTranslationsSchema,
});

// by_id rows: a row with an id edits that add-on; a row without one creates an add-on.
const addonUpdateRowSchema = z.object({
  id: uuidLike.toLowerCase(),
  price: priceField.optional(),
  price_egp: nullablePriceField.optional(),
  translations: addonTranslationsSchema.optional(),
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

// Rows with an `id` use the update schema, rows without one the create schema.
function writeRowsField<C extends z.ZodTypeAny, U extends z.ZodTypeAny>(
  name: string,
  createSchema: C,
  updateSchema: U,
) {
  return z.string().transform((value, ctx) => {
    const rows = parseJsonArray(value);
    if (!rows) {
      ctx.addIssue({
        code: 'custom',
        message: `${name} يجب أن تكون مصفوفة JSON`,
      });
      return z.NEVER;
    }
    return rows.map((row, index): z.output<C> | z.output<U> => {
      const schema =
        typeof row === 'object' && row !== null && 'id' in row
          ? updateSchema
          : createSchema;
      const result = schema.safeParse(row);
      if (result.success) return result.data as z.output<C> | z.output<U>;
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
}

function deleteIdsField(name: string, label: string) {
  return z.string().transform((value, ctx) => {
    const result = z
      .array(uuidLike.toLowerCase())
      .safeParse(parseJsonArray(value));
    if (result.success) return result.data;
    ctx.addIssue({
      code: 'custom',
      message: `${name} يجب أن تكون مصفوفة JSON من معرّفات ${label}`,
    });
    return z.NEVER;
  });
}

const writeModeField = (name: string) =>
  z
    .enum(['by_id', ''], `القيمة المسموحة لـ ${name} هي by_id فقط`)
    .transform((mode) => mode || undefined)
    .optional();

type IdWriteCheck = {
  rows: object[] | undefined;
  mode: 'by_id' | undefined;
  deleteIds: string[] | undefined;
  rowsField: string;
  modeField: string;
  deleteField: string;
  noun: string;
};

function idWriteIssues(
  check: IdWriteCheck,
): { path: string[]; message: string }[] {
  const issues: { path: string[]; message: string }[] = [];
  const issue = (field: string, message: string) =>
    issues.push({ path: [field], message });
  const editedIds = (check.rows ?? []).flatMap((row) =>
    'id' in row && typeof row.id === 'string' ? [row.id] : [],
  );
  const deleteIds = check.deleteIds ?? [];
  if (check.mode !== 'by_id') {
    if (check.deleteIds !== undefined)
      issue(
        check.deleteField,
        `${check.deleteField} يتطلب ${check.modeField}=by_id`,
      );
    if (editedIds.length)
      issue(
        check.modeField,
        `تعديل ${check.noun} بمعرّفاتها يتطلب ${check.modeField}=by_id`,
      );
    return issues;
  }
  if (new Set(editedIds).size !== editedIds.length)
    issue(check.rowsField, 'لا يجوز تكرار المعرّف نفسه');
  if (new Set(deleteIds).size !== deleteIds.length)
    issue(check.deleteField, 'لا يجوز تكرار المعرّف نفسه');
  if (deleteIds.some((id) => editedIds.includes(id)))
    issue(check.deleteField, 'لا يمكن تعديل عنصر وحذفه في الطلب نفسه');
  return issues;
}

const roomWriteRowsField = writeRowsField(
  'rooms',
  roomInputSchema,
  roomUpdateRowSchema,
);
const addonWriteRowsField = writeRowsField(
  'addons',
  addonInputSchema,
  addonUpdateRowSchema,
);

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
    rooms_write_mode: writeModeField('rooms_write_mode'),
    delete_room_ids: deleteIdsField('delete_room_ids', 'الغرف').optional(),
    addons: addonWriteRowsField.optional(),
    addons_write_mode: writeModeField('addons_write_mode'),
    delete_addon_ids: deleteIdsField('delete_addon_ids', 'الترقيات').optional(),
    deleteAssetIds: z
      .union([z.array(uuidLike), uuidLike.transform((v) => [v])])
      .optional(),
  })
  .transform((hotel, ctx) => {
    const issues = [
      ...idWriteIssues({
        rows: hotel.rooms,
        mode: hotel.rooms_write_mode,
        deleteIds: hotel.delete_room_ids,
        rowsField: 'rooms',
        modeField: 'rooms_write_mode',
        deleteField: 'delete_room_ids',
        noun: 'الغرف',
      }),
      ...idWriteIssues({
        rows: hotel.addons,
        mode: hotel.addons_write_mode,
        deleteIds: hotel.delete_addon_ids,
        rowsField: 'addons',
        modeField: 'addons_write_mode',
        deleteField: 'delete_addon_ids',
        noun: 'الترقيات',
      }),
    ];
    for (const issue of issues) ctx.addIssue({ code: 'custom', ...issue });
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
