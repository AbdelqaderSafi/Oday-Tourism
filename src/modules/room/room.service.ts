import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { CreateRoomDto, UpdateRoomDto } from './types/room.dto';
import { assertOccupancy } from '../utils/capacity.util';

const withoutUndefined = <T extends object>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as Partial<T>;

@Injectable()
export class RoomService {
  constructor(private readonly prismaService: DatabaseService) {}

  async create(hotelId: string, dto: CreateRoomDto) {
    const hotel = await this.prismaService.hotels.findUnique({
      where: { id: hotelId, is_deleted: false },
    });
    if (!hotel) throw new NotFoundException('الفندق غير موجود');

    const roomId = randomUUID();
    const { translations, price, ...rest } = dto;

    return this.prismaService.$transaction(async (tx) => {
      await tx.room.create({
        data: {
          id: roomId,
          hotel_id: hotelId,
          price: price,
          ...rest,
        },
      });

      for (const translation of translations) {
        await tx.roomTranslation.create({
          data: { room_id: roomId, ...translation },
        });
      }

      return tx.room.findUniqueOrThrow({
        where: { id: roomId },
        include: { translations: true },
      });
    });
  }

  findAll(hotelId: string) {
    return this.prismaService.room.findMany({
      where: { hotel_id: hotelId, is_deleted: false },
      include: { translations: true },
    });
  }

  async findOne(hotelId: string, id: string) {
    const room = await this.prismaService.room.findFirst({
      where: { id, hotel_id: hotelId, is_deleted: false },
      include: { translations: true },
    });
    if (!room) throw new NotFoundException('الغرفة غير موجودة');
    return room;
  }

  async update(hotelId: string, id: string, dto: UpdateRoomDto) {
    const room = await this.prismaService.room.findFirst({
      where: { id, hotel_id: hotelId, is_deleted: false },
    });
    if (!room) throw new NotFoundException('الغرفة غير موجودة');

    const { translations, price, ...rest } = dto;
    assertOccupancy({ ...room, ...withoutUndefined(rest) });

    return this.prismaService.$transaction(async (tx) => {
      await tx.room.update({
        where: { id },
        data: {
          ...rest,
          ...(price !== undefined && { price: price }),
        },
      });

      if (translations?.length) {
        for (const translation of translations) {
          await tx.roomTranslation.upsert({
            where: {
              room_id_language: { room_id: id, language: translation.language },
            },
            update: {
              name: translation.name,
              description: translation.description,
            },
            create: { room_id: id, ...translation },
          });
        }
      }

      return tx.room.findUniqueOrThrow({
        where: { id },
        include: { translations: true },
      });
    });
  }

  async remove(hotelId: string, id: string) {
    const room = await this.prismaService.room.findFirst({
      where: { id, hotel_id: hotelId, is_deleted: false },
    });
    if (!room) throw new NotFoundException('الغرفة غير موجودة');

    return this.prismaService.room.update({
      where: { id },
      data: { is_deleted: true },
    });
  }
}
