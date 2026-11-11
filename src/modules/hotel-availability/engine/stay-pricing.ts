import { Cents, parseAmount } from './money';
import type { RoomPick } from './room-allocation';

export type Currency = 'USD' | 'EGP';
export type VisitorCategory = 'egyptian-resident' | 'other';
export type Rates = Record<Currency, Cents | null>;

export const VISITOR_CURRENCY: Record<VisitorCategory, Currency> = {
  'egyptian-resident': 'EGP',
  other: 'USD',
};

export type CalendarNight = { availableUnits: number; overrides: Rates };

export type RoomTypeStock = {
  roomId: string;
  capacity: number;
  baseRates: Rates;
  nights: ReadonlyMap<string, CalendarNight>;
};

export type NightlyRate = { date: string; unitRate: Cents | null };

export type RoomStayTerms = {
  roomId: string;
  capacity: number;
  maxQuantity: number;
  unitStayTotal: Cents | null;
  nightlyRates: NightlyRate[];
};

export type UpgradeSelection = {
  addonId: string;
  quantity: number;
  unitRate: Cents | null;
};

export type PricedStay = {
  rooms: (RoomPick & { subtotal: Cents | null; nightlyRates: NightlyRate[] })[];
  addons: (UpgradeSelection & { subtotal: Cents | null })[];
  roomTotal: Cents | null;
  addonsTotal: Cents | null;
  total: Cents | null;
};

// A base tariff of zero or less was never set: guests get "on request", not a free room.
export function toBaseRate(amount: string | null): Cents | null {
  const cents = amount === null ? null : parseAmount(amount);
  return cents !== null && cents > 0 ? cents : null;
}

function sumOrNull(values: (Cents | null)[]): Cents | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

export function roomStayTerms(
  room: RoomTypeStock,
  nights: string[],
  guests: number,
  currency: Currency,
): RoomStayTerms {
  const nightlyRates = nights.map((date) => ({
    date,
    unitRate:
      room.nights.get(date)?.overrides[currency] ?? room.baseRates[currency],
  }));
  const fewestUnits = Math.min(
    ...nights.map((date) => room.nights.get(date)?.availableUnits ?? 0),
  );
  return {
    roomId: room.roomId,
    capacity: room.capacity,
    // A type without a verified capacity is never offered, whatever its stock (spec 6.4).
    maxQuantity:
      nights.length && room.capacity >= 1
        ? Math.max(0, Math.min(fewestUnits, guests))
        : 0,
    unitStayTotal: sumOrNull(nightlyRates.map((night) => night.unitRate)),
    nightlyRates,
  };
}

export function priceStay(
  rooms: RoomPick[],
  terms: RoomStayTerms[],
  upgrades: UpgradeSelection[],
  nightCount: number,
): PricedStay {
  const termsById = new Map(
    terms.map((roomTerms) => [roomTerms.roomId, roomTerms]),
  );
  const roomLines = rooms.map(({ roomId, quantity }) => {
    const roomTerms = termsById.get(roomId);
    if (!roomTerms) throw new Error(`No stay terms for room ${roomId}`);
    return {
      roomId,
      quantity,
      subtotal:
        roomTerms.unitStayTotal === null
          ? null
          : roomTerms.unitStayTotal * quantity,
      nightlyRates: roomTerms.nightlyRates,
    };
  });
  const addonLines = upgrades.map((upgrade) => ({
    ...upgrade,
    subtotal:
      upgrade.unitRate === null
        ? null
        : upgrade.unitRate * upgrade.quantity * nightCount,
  }));
  const roomTotal = sumOrNull(roomLines.map((line) => line.subtotal));
  const addonsTotal = sumOrNull(addonLines.map((line) => line.subtotal));
  return {
    rooms: roomLines,
    addons: addonLines,
    roomTotal,
    addonsTotal,
    total:
      roomTotal === null || addonsTotal === null
        ? null
        : roomTotal + addonsTotal,
  };
}
