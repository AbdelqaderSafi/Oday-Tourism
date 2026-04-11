import { LanguageEnum, Prisma } from 'generated/prisma/client';

export type TripAddonTranslationInput = {
  language: LanguageEnum;
  name: string;
  description: string;
};

export type CreateTripAddonDto = {
  price: Prisma.Decimal;
  translations: TripAddonTranslationInput[];
};

export type UpdateTripAddonDto = Partial<CreateTripAddonDto>;

export type TripAddonResponseDTO = Prisma.TripAddonGetPayload<{
  include: { translations: true };
}>;
