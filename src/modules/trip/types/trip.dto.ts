import { DestinatiosnEnum, LanguageEnum, Prisma } from 'generated/prisma/client';

export type TripTranslationInput = {
  language: LanguageEnum;
  title: string;
  subtitle: string;
  description: string;
  duration: string;
  facilities: Prisma.JsonValue;
};

export type TripOptionInput = {
  price: Prisma.Decimal;
  translations: { language: LanguageEnum; name: string; description?: string }[];
};

export type TripAddonInput = {
  price: Prisma.Decimal;
  translations: { language: LanguageEnum; name: string; description: string }[];
};

export type CreateTripDto = {
  slug: string;
  city: DestinatiosnEnum;
  price: Prisma.Decimal;
  start_time: string;
  end_time: string;
  youtube_video_url?: string;
  translations: TripTranslationInput[];
  options?: TripOptionInput[];
  addons?: TripAddonInput[];
};

export type UpdateTripDto = Partial<CreateTripDto>;

export type UpdateTripRequest = UpdateTripDto & {
  deleteAssetIds?: string[];
};

export type TripResponseDTO = Prisma.tripsGetPayload<{
  include: {
    assets: true;
    translations: true;
    options: { include: { translations: true } };
    addons: { include: { translations: true } };
  };
}>;
