import { LanguageEnum, Prisma } from 'generated/prisma/client';

export type AddonTranslationInput = {
  language: LanguageEnum;
  name: string;
  description: string;
};

export type CreateAddonDto = {
  price: Prisma.Decimal;
  price_egp?: Prisma.Decimal | null;
  translations: AddonTranslationInput[];
};

export type UpdateAddonDto = Partial<CreateAddonDto>;

export type AddonResponseDTO = Prisma.HotelAddonGetPayload<{
  include: { translations: true };
}>;
