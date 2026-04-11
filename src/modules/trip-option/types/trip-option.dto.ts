import { LanguageEnum, Prisma } from 'generated/prisma/client';

export type TripOptionTranslationInput = {
  language: LanguageEnum;
  name: string;
  description?: string;
};

export type CreateTripOptionDto = {
  price: Prisma.Decimal;
  translations: TripOptionTranslationInput[];
};

export type UpdateTripOptionDto = Partial<CreateTripOptionDto>;

export type TripOptionResponseDTO = Prisma.TripOptionGetPayload<{
  include: { translations: true };
}>;
