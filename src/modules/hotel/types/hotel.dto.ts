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
  translations: { language: LanguageEnum; name: string; description?: string }[];
};

export type AddonInput = {
  price: Prisma.Decimal;
  translations: { language: LanguageEnum; name: string; description: string }[];
};

export type CreateHotelDto = {
  slug: string;
  destination: DestinatiosnEnum;
  initial_price: Prisma.Decimal;
  stars: hotels_stars;
  rating: HotelFilterRating;
  meal_plan?: HotelMealPlan;
  is_discounted?: boolean;
  discount_percentage?: Prisma.Decimal;
  original_price?: Prisma.Decimal;
  youtube_video_url?: string;
  translations: TranslationInput[];
  rooms?: RoomInput[];
  addons?: AddonInput[];
};

export type UpdateHotelDto = Partial<CreateHotelDto>;

export type UpdateHotelRequest = UpdateHotelDto & {
  deleteAssetIds?: string[];
};

export type HotelResponseDTO = Prisma.hotelsGetPayload<{
  include: { assets: true; translations: true; rooms: true; addons: true };
}>;
