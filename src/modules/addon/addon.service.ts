import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { CreateAddonDto, UpdateAddonDto } from './types/addon.dto';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class AddonService {
  constructor(private readonly prismaService: DatabaseService) {}

  async create(hotelId: string, dto: CreateAddonDto) {
    const hotel = await this.prismaService.hotels.findUnique({
      where: { id: hotelId, is_deleted: false },
    });
    if (!hotel) throw new NotFoundException('الفندق غير موجود');

    const addonId = randomUUID();
    const { translations, price, price_egp } = dto;

    return this.prismaService.$transaction(async (tx) => {
      await tx.hotelAddon.create({
        data: {
          id: addonId,
          hotel_id: hotelId,
          price: price as Prisma.Decimal,
          price_egp,
        },
      });

      for (const translation of translations) {
        await tx.hotelAddonTranslation.create({
          data: { addon_id: addonId, ...translation },
        });
      }

      return tx.hotelAddon.findUniqueOrThrow({
        where: { id: addonId },
        include: { translations: true },
      });
    });
  }

  findAll(hotelId: string) {
    return this.prismaService.hotelAddon.findMany({
      where: { hotel_id: hotelId, is_deleted: false },
      include: { translations: true },
    });
  }

  async findOne(hotelId: string, id: string) {
    const addon = await this.prismaService.hotelAddon.findFirst({
      where: { id, hotel_id: hotelId, is_deleted: false },
      include: { translations: true },
    });
    if (!addon) throw new NotFoundException('الإضافة غير موجودة');
    return addon;
  }

  async update(hotelId: string, id: string, dto: UpdateAddonDto) {
    const addon = await this.prismaService.hotelAddon.findFirst({
      where: { id, hotel_id: hotelId, is_deleted: false },
    });
    if (!addon) throw new NotFoundException('الإضافة غير موجودة');

    const { translations, price, price_egp } = dto;

    return this.prismaService.$transaction(async (tx) => {
      await tx.hotelAddon.update({
        where: { id },
        data: {
          ...(price !== undefined && { price: price as Prisma.Decimal }),
          ...(price_egp !== undefined && { price_egp }),
        },
      });

      if (translations?.length) {
        for (const translation of translations) {
          await tx.hotelAddonTranslation.upsert({
            where: {
              addon_id_language: {
                addon_id: id,
                language: translation.language,
              },
            },
            update: {
              name: translation.name,
              description: translation.description,
            },
            create: { addon_id: id, ...translation },
          });
        }
      }

      return tx.hotelAddon.findUniqueOrThrow({
        where: { id },
        include: { translations: true },
      });
    });
  }

  async remove(hotelId: string, id: string) {
    const addon = await this.prismaService.hotelAddon.findFirst({
      where: { id, hotel_id: hotelId, is_deleted: false },
    });
    if (!addon) throw new NotFoundException('الإضافة غير موجودة');

    return this.prismaService.hotelAddon.update({
      where: { id },
      data: { is_deleted: true },
    });
  }
}
