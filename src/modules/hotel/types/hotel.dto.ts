import {
  DestinatiosnEnum,
  HotelFilterRating,
  HotelMealPlan,
  hotels_stars,
  LanguageEnum,
  Prisma,
} from 'generated/prisma/client';

export type TranslationInput = {
  language: LanguageEnum;
  name: string;
  description: string;
  Facilities: Prisma.JsonValue;
};

export type RoomInput = {
  price: Prisma.Decimal;
  price_egp: Prisma.Decimal;
  capacity?: number | null;
  translations: {
    language: LanguageEnum;
    name: string;
    description?: string;
  }[];
};

export type RoomUpdateInput = {
  id: string;
  price?: Prisma.Decimal;
  price_egp?: Prisma.Decimal | null;
  capacity?: number | null;
  translations?: RoomInput['translations'];
};

export type AddonInput = {
  price: Prisma.Decimal;
  price_egp: Prisma.Decimal;
  translations: { language: LanguageEnum; name: string; description: string }[];
};

export type AddonUpdateInput = {
  id: string;
  price?: Prisma.Decimal;
  price_egp?: Prisma.Decimal | null;
  translations?: AddonInput['translations'];
};

export type CreateHotelDto = {
  slug: string;
  destination: DestinatiosnEnum;
  initial_price: Prisma.Decimal;
  initial_price_egp: Prisma.Decimal;
  stars: hotels_stars;
  rating: HotelFilterRating;
  meal_plan?: HotelMealPlan;
  is_discounted?: boolean;
  discount_percentage?: Prisma.Decimal;
  original_price?: Prisma.Decimal | null;
  original_price_egp?: Prisma.Decimal | null;
  youtube_video_url?: string;
  translations: TranslationInput[];
  rooms?: RoomInput[];
  addons?: AddonInput[];
};

export type UpdateHotelDto = Partial<CreateHotelDto>;

export type UpdateHotelRequest = Omit<UpdateHotelDto, 'rooms' | 'addons'> & {
  rooms?: (RoomInput | RoomUpdateInput)[];
  rooms_write_mode?: 'by_id';
  delete_room_ids?: string[];
  addons?: (AddonInput | AddonUpdateInput)[];
  addons_write_mode?: 'by_id';
  delete_addon_ids?: string[];
  deleteAssetIds?: string[];
};

export type HotelResponseDTO = Prisma.hotelsGetPayload<{
  include: { assets: true; translations: true; rooms: true; addons: true };
}>;
