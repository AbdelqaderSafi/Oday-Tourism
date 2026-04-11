import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { CreateTripOptionDto, UpdateTripOptionDto } from './types/trip-option.dto';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class TripOptionService {
  constructor(private readonly prismaService: DatabaseService) {}

  async create(tripId: string, dto: CreateTripOptionDto) {
    const trip = await this.prismaService.trips.findUnique({
      where: { id: tripId, is_deleted: false },
    });
    if (!trip) throw new NotFoundException('الرحلة غير موجودة');

    const optionId = randomUUID();
    const { translations, price } = dto;

    return this.prismaService.$transaction(async (tx) => {
      await tx.tripOption.create({
        data: {
          id: optionId,
          trip_id: tripId,
          price: price as Prisma.Decimal,
        },
      });

      for (const translation of translations) {
        await tx.optionTranslation.create({
          data: { option_id: optionId, ...translation },
        });
      }

      return tx.tripOption.findUniqueOrThrow({
        where: { id: optionId },
        include: { translations: true },
      });
    });
  }

  findAll(tripId: string) {
    return this.prismaService.tripOption.findMany({
      where: { trip_id: tripId, is_deleted: false },
      include: { translations: true },
    });
  }

  async findOne(tripId: string, id: string) {
    const option = await this.prismaService.tripOption.findFirst({
      where: { id, trip_id: tripId, is_deleted: false },
      include: { translations: true },
    });
    if (!option) throw new NotFoundException('الخيار غير موجود');
    return option;
  }

  async update(tripId: string, id: string, dto: UpdateTripOptionDto) {
    const option = await this.prismaService.tripOption.findFirst({
      where: { id, trip_id: tripId, is_deleted: false },
    });
    if (!option) throw new NotFoundException('الخيار غير موجود');

    const { translations, price } = dto;

    return this.prismaService.$transaction(async (tx) => {
      await tx.tripOption.update({
        where: { id },
        data: {
          ...(price !== undefined && { price: price as Prisma.Decimal }),
        },
      });

      if (translations?.length) {
        for (const translation of translations) {
          await tx.optionTranslation.upsert({
            where: {
              option_id_language: {
                option_id: id,
                language: translation.language,
              },
            },
            update: {
              name: translation.name,
              ...(translation.description !== undefined && {
                description: translation.description,
              }),
            },
            create: { option_id: id, ...translation },
          });
        }
      }

      return tx.tripOption.findUniqueOrThrow({
        where: { id },
        include: { translations: true },
      });
    });
  }

  async remove(tripId: string, id: string) {
    const option = await this.prismaService.tripOption.findFirst({
      where: { id, trip_id: tripId, is_deleted: false },
    });
    if (!option) throw new NotFoundException('الخيار غير موجود');

    return this.prismaService.tripOption.update({
      where: { id },
      data: { is_deleted: true },
    });
  }
}
