import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { CreateTripAddonDto, UpdateTripAddonDto } from './types/trip-addon.dto';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class TripAddonService {
  constructor(private readonly prismaService: DatabaseService) {}

  async create(tripId: string, dto: CreateTripAddonDto) {
    const trip = await this.prismaService.trips.findUnique({
      where: { id: tripId, is_deleted: false },
    });
    if (!trip) throw new NotFoundException('الرحلة غير موجودة');

    const addonId = randomUUID();
    const { translations, price } = dto;

    return this.prismaService.$transaction(async (tx) => {
      await tx.tripAddon.create({
        data: {
          id: addonId,
          trip_id: tripId,
          price: price as Prisma.Decimal,
        },
      });

      for (const translation of translations) {
        await tx.tripAddonTranslation.create({
          data: { addon_id: addonId, ...translation },
        });
      }

      return tx.tripAddon.findUniqueOrThrow({
        where: { id: addonId },
        include: { translations: true },
      });
    });
  }

  findAll(tripId: string) {
    return this.prismaService.tripAddon.findMany({
      where: { trip_id: tripId, is_deleted: false },
      include: { translations: true },
    });
  }

  async findOne(tripId: string, id: string) {
    const addon = await this.prismaService.tripAddon.findFirst({
      where: { id, trip_id: tripId, is_deleted: false },
      include: { translations: true },
    });
    if (!addon) throw new NotFoundException('الإضافة غير موجودة');
    return addon;
  }

  async update(tripId: string, id: string, dto: UpdateTripAddonDto) {
    const addon = await this.prismaService.tripAddon.findFirst({
      where: { id, trip_id: tripId, is_deleted: false },
    });
    if (!addon) throw new NotFoundException('الإضافة غير موجودة');

    const { translations, price } = dto;

    return this.prismaService.$transaction(async (tx) => {
      await tx.tripAddon.update({
        where: { id },
        data: {
          ...(price !== undefined && { price: price as Prisma.Decimal }),
        },
      });

      if (translations?.length) {
        for (const translation of translations) {
          await tx.tripAddonTranslation.upsert({
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

      return tx.tripAddon.findUniqueOrThrow({
        where: { id },
        include: { translations: true },
      });
    });
  }

  async remove(tripId: string, id: string) {
    const addon = await this.prismaService.tripAddon.findFirst({
      where: { id, trip_id: tripId, is_deleted: false },
    });
    if (!addon) throw new NotFoundException('الإضافة غير موجودة');

    return this.prismaService.tripAddon.update({
      where: { id },
      data: { is_deleted: true },
    });
  }
}
