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
  price: Prisma.Decimal;
  price_egp: Prisma.Decimal | null;
};

export const STOCK_ROOM_SELECT = {
  id: true,
  capacity: true,
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
  { openOnly }: { openOnly: boolean },
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
      ${openOnly ? Prisma.sql`AND available_units > 0` : Prisma.empty}
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
    baseRates: baseRates(room),
    nights: nights.get(room.id) ?? new Map(),
  };
}
