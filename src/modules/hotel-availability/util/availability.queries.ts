import { Prisma } from 'generated/prisma/client';
import { DatabaseService } from '../../database/database.service';
import { parseAmount } from '../engine/money';
import {
  CalendarNight,
  Rates,
  RoomTypeStock,
  toBaseRate,
} from '../engine/stay-pricing';

export type RoomNights = Map<string, Map<string, CalendarNight>>;

export type StockRoom = {
  id: string;
  capacity: number | null;
  adult_capacity: number | null;
  child_capacity: number | null;
  children_under_3_capacity: number | null;
  children_under_6_capacity: number | null;
  children_6_to_12_capacity: number | null;
  price: Prisma.Decimal;
  price_egp: Prisma.Decimal | null;
};

export const STOCK_ROOM_SELECT = {
  id: true,
  capacity: true,
  adult_capacity: true,
  child_capacity: true,
  children_under_3_capacity: true,
  children_under_6_capacity: true,
  children_6_to_12_capacity: true,
  price: true,
  price_egp: true,
} satisfies Prisma.RoomSelect;

export const ELIGIBLE_ROOM_WHERE = {
  is_deleted: false,
  capacity: { gte: 1 },
} satisfies Prisma.RoomWhereInput;

type CalendarRow = {
  room_id: string;
  stay_date: string;
  available_units: number;
  rate_override_usd: string | null;
  rate_override_egp: string | null;
};

const toOverride = (amount: string | null) =>
  amount === null ? null : parseAmount(amount);

// stay_date comes back as text so no Date object (or time zone) ever touches it.
export async function loadRoomNights(
  db: DatabaseService,
  roomIds: string[],
  from: string,
  to: string,
): Promise<RoomNights> {
  const nights: RoomNights = new Map();
  if (!roomIds.length) return nights;
  const rows = await db.$queryRaw<CalendarRow[]>`
    SELECT room_id,
           DATE_FORMAT(stay_date, '%Y-%m-%d') AS stay_date,
           available_units,
           CAST(rate_override_usd AS CHAR) AS rate_override_usd,
           CAST(rate_override_egp AS CHAR) AS rate_override_egp
    FROM room_calendar_days
    WHERE room_id IN (${Prisma.join(roomIds)})
      AND stay_date >= ${from} AND stay_date < ${to}
  `;
  for (const row of rows) {
    const roomNights =
      nights.get(row.room_id) ?? new Map<string, CalendarNight>();
    roomNights.set(row.stay_date, {
      availableUnits: Number(row.available_units),
      overrides: {
        USD: toOverride(row.rate_override_usd),
        EGP: toOverride(row.rate_override_egp),
      },
    });
    nights.set(row.room_id, roomNights);
  }
  return nights;
}

export function baseRates(room: Pick<StockRoom, 'price' | 'price_egp'>): Rates {
  return {
    USD: toBaseRate(room.price.toFixed(2)),
    EGP: room.price_egp === null ? null : toBaseRate(room.price_egp.toFixed(2)),
  };
}

export function toRoomStock(
  room: StockRoom,
  nights: RoomNights,
): RoomTypeStock {
  return {
    roomId: room.id,
    capacity: room.capacity ?? 0,
    limits: {
      adults: room.adult_capacity,
      children: room.child_capacity,
      under3: room.children_under_3_capacity,
      under6: room.children_under_6_capacity,
      age6to12: room.children_6_to_12_capacity,
    },
    baseRates: baseRates(room),
    nights: nights.get(room.id) ?? new Map(),
  };
}
