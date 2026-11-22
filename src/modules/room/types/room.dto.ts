import { LanguageEnum, Prisma } from 'generated/prisma/client';

export type RoomTranslationInput = {
  language: LanguageEnum;
  name: string;
  description?: string;
};

export type CreateRoomDto = {
  price: Prisma.Decimal;
  price_egp?: Prisma.Decimal | null;
  capacity?: number | null;
  adult_capacity?: number | null;
  child_capacity?: number | null;
  children_under_3_capacity?: number | null;
  children_under_6_capacity?: number | null;
  children_6_to_12_capacity?: number | null;
  translations: RoomTranslationInput[];
};

export type UpdateRoomDto = Partial<CreateRoomDto>;

export type RoomResponseDTO = Prisma.RoomGetPayload<{
  include: { translations: true };
}>;
