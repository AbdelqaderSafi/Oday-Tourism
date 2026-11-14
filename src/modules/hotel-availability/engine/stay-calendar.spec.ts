import { chooseAllocation } from './room-allocation';
import { nightOffers } from './stay-calendar';
import {
  CalendarNight,
  priceStay,
  roomStayTerms,
  RoomTypeStock,
} from './stay-pricing';

const open = (
  availableUnits: number,
  overrides: Partial<CalendarNight['overrides']> = {},
): CalendarNight => ({
  availableUnits,
  overrides: { USD: null, EGP: null, ...overrides },
});

const D1 = '2026-11-20';
const D2 = '2026-11-21';
const D3 = '2026-11-22';

const double: RoomTypeStock = {
  roomId: 'r_double',
  capacity: 2,
  baseRates: { USD: 10000, EGP: 500000 },
  nights: new Map([
    [D1, open(1)],
    [D2, open(1, { USD: 14000, EGP: 700000 })],
    [D3, open(1)],
  ]),
};

const family: RoomTypeStock = {
  roomId: 'r_family',
  capacity: 3,
  baseRates: { USD: 15000, EGP: 720000 },
  nights: new Map([
    [D1, open(1)],
    [D2, open(1)],
  ]),
};

const suiteNoEgp: RoomTypeStock = {
  roomId: 'r_suite',
  capacity: 4,
  baseRates: { USD: 30000, EGP: null },
  nights: new Map([[D3, open(1)]]),
};

describe('nightOffers', () => {
  it('prices each night independently, with an override changing only its own night', () => {
    expect(nightOffers([double, family], [D1, D2], 5, 'EGP')).toEqual([
      { date: D1, available: true, total: 1220000 },
      { date: D2, available: true, total: 1420000 },
    ]);
  });

  it('uses the independent USD tariff', () => {
    expect(
      nightOffers([double, family], [D1, D2], 5, 'USD').map(
        (night) => night.total,
      ),
    ).toEqual([25000, 29000]);
  });

  it('marks a night closed when no allocation fits the party, and keeps the row', () => {
    expect(nightOffers([double, family], [D3, '2026-11-23'], 5, 'EGP')).toEqual(
      [
        { date: D3, available: false, total: null },
        { date: '2026-11-23', available: false, total: null },
      ],
    );
  });

  it('is available with a null total when every feasible allocation lacks a price', () => {
    expect(nightOffers([suiteNoEgp], [D3], 4, 'EGP')).toEqual([
      { date: D3, available: true, total: null },
    ]);
    expect(nightOffers([suiteNoEgp], [D3], 4, 'USD')).toEqual([
      { date: D3, available: true, total: 30000 },
    ]);
  });

  it('prefers a fully priced allocation over an unpriced one', () => {
    expect(nightOffers([double, suiteNoEgp], [D3], 2, 'EGP')).toEqual([
      { date: D3, available: true, total: 500000 },
    ]);
  });

  it('never offers a room type without a capacity', () => {
    const unverified: RoomTypeStock = { ...double, capacity: 0 };
    expect(nightOffers([unverified], [D1], 1, 'EGP')).toEqual([
      { date: D1, available: false, total: null },
    ]);
  });

  it('matches the one-night stay quote recommendation', () => {
    for (const [date, guests, currency] of [
      [D1, 5, 'EGP'],
      [D2, 5, 'USD'],
      [D3, 2, 'EGP'],
      [D3, 4, 'USD'],
    ] as const) {
      const rooms = [double, family, suiteNoEgp];
      const terms = rooms
        .map((room) => roomStayTerms(room, [date], guests, currency))
        .filter((t) => t.maxQuantity >= 1);
      const allocation = chooseAllocation(terms, guests);
      const quoteTotal = allocation
        ? priceStay(allocation.rooms, terms, [], 1).total
        : null;
      expect(nightOffers(rooms, [date], guests, currency)[0].total).toBe(
        quoteTotal,
      );
    }
  });
});
