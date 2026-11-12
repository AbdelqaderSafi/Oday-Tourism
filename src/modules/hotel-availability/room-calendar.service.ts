import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { formatAmountOrNull } from './engine/money';
import { stayNights } from './engine/stay-dates';
import type {
  CalendarChange,
  CalendarRangeQuery,
  CalendarUpdateBody,
  RoomCalendarResponse,
  RoomCalendarUpdateResponse,
} from './types/availability.dto';
import { calendarConflict, notFound } from './util/availability.errors';
import { baseRates, loadRoomNights } from './util/availability.queries';
import { UUID_PATTERN } from './util/availability.validation';

function calendarUpsert(roomId: string, change: CalendarChange): Prisma.Sql {
  const units = change.available_units;
  const usd = change.rate_override?.USD;
  const egp = change.rate_override?.EGP;
  const rows = stayNights(change.from, change.to).map(
    (date) =>
      Prisma.sql`(${roomId}, ${date}, ${units ?? 0}, ${usd ?? null}, ${egp ?? null}, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
  );
  const updates = [Prisma.sql`updated_at = UTC_TIMESTAMP(3)`];
  if (units !== undefined) updates.push(Prisma.sql`available_units = ${units}`);
  if (usd !== undefined) updates.push(Prisma.sql`rate_override_usd = ${usd}`);
  if (egp !== undefined) updates.push(Prisma.sql`rate_override_egp = ${egp}`);
  return Prisma.sql`
    INSERT INTO room_calendar_days (room_id, stay_date, available_units, rate_override_usd, rate_override_egp, created_at, updated_at)
    VALUES ${Prisma.join(rows)}
    ON DUPLICATE KEY UPDATE ${Prisma.join(updates)}
  `;
}

@Injectable()
export class RoomCalendarService {
  constructor(private readonly prismaService: DatabaseService) {}

  async getCalendar(
    hotelId: string,
    roomId: string,
    range: CalendarRangeQuery,
  ): Promise<RoomCalendarResponse> {
    const room = await this.findRoom(hotelId, roomId);
    const nights = (
      await loadRoomNights(
        this.prismaService,
        [room.id],
        range.from,
        range.to,
        { openOnly: false },
      )
    ).get(room.id);
    const base = baseRates(room);
    return {
      hotel_id: hotelId,
      room_id: room.id,
      revision: room.calendar_revision,
      base_rates: {
        USD: formatAmountOrNull(base.USD),
        EGP: formatAmountOrNull(base.EGP),
      },
      days: stayNights(range.from, range.to).map((date) => {
        const night = nights?.get(date);
        return {
          date,
          available_units: night?.availableUnits ?? 0,
          rate_override: {
            USD: formatAmountOrNull(night?.overrides.USD ?? null),
            EGP: formatAmountOrNull(night?.overrides.EGP ?? null),
          },
        };
      }),
    };
  }

  async updateCalendar(
    hotelId: string,
    roomId: string,
    body: CalendarUpdateBody,
  ): Promise<RoomCalendarUpdateResponse> {
    const room = await this.findRoom(hotelId, roomId);
    await this.prismaService.$transaction(async (tx) => {
      // Hotel row first, then the room: PATCH /hotel/:id locks in the same order.
      await tx.$executeRaw`UPDATE hotels SET calendar_managed_at = COALESCE(calendar_managed_at, UTC_TIMESTAMP(3)) WHERE id = ${hotelId}`;
      const bumped = await tx.$executeRaw`
        UPDATE room SET calendar_revision = calendar_revision + 1
        WHERE id = ${room.id} AND hotel_id = ${hotelId} AND is_deleted = false AND calendar_revision = ${body.revision}
      `;
      if (bumped !== 1) throw calendarConflict();
      for (const change of body.changes)
        await tx.$executeRaw(calendarUpsert(room.id, change));
    });
    return { hotel_id: hotelId, room_id: room.id, revision: body.revision + 1 };
  }

  private async findRoom(hotelId: string, roomId: string) {
    const room =
      UUID_PATTERN.test(hotelId) && UUID_PATTERN.test(roomId)
        ? await this.prismaService.room.findFirst({
            where: {
              id: roomId,
              hotel_id: hotelId,
              is_deleted: false,
              hotel: { is_deleted: false },
            },
            select: {
              id: true,
              price: true,
              price_egp: true,
              calendar_revision: true,
            },
          })
        : null;
    if (!room) throw notFound('الغرفة غير موجودة في هذا الفندق');
    return room;
  }
}
