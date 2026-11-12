import { Prisma } from 'generated/prisma/client';

export const HOTEL_CATALOG_INCLUDE = {
  assets: true,
  translations: true,
  rooms: { where: { is_deleted: false }, include: { translations: true } },
  addons: { where: { is_deleted: false }, include: { translations: true } },
} satisfies Prisma.hotelsInclude;

export type HotelCatalogEntry = Prisma.hotelsGetPayload<{
  include: typeof HOTEL_CATALOG_INCLUDE;
}>;
