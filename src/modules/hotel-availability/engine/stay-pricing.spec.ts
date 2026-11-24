import {
  CalendarNight,
  priceStay,
  roomStayTerms,
  RoomTypeStock,
  toBaseRate,
} from './stay-pricing';
import { NO_LIMITS } from './occupancy';

const open = (
  availableUnits: number,
  overrides: Partial<CalendarNight['overrides']> = {},
): CalendarNight => ({
  availableUnits,
  overrides: { USD: null, EGP: null, ...overrides },
});

const nights = ['2026-11-20', '2026-11-21'];

const party = (adults: number, children = 0) => ({ adults, children });

const double: RoomTypeStock = {
  roomId: 'r_double',
  capacity: 2,
  limits: NO_LIMITS,
  baseRates: { USD: 10000, EGP: 500000 },
  nights: new Map([
    ['2026-11-20', open(2)],
    ['2026-11-21', open(1, { USD: 14000, EGP: 700000 })],
  ]),
};

const family: RoomTypeStock = {
  roomId: 'r_family',
  capacity: 3,
  limits: NO_LIMITS,
  baseRates: { USD: 15000, EGP: 720000 },
  nights: new Map([
    ['2026-11-20', open(1)],
    ['2026-11-21', open(1)],
    ['2026-11-22', open(0)],
  ]),
};

describe('toBaseRate', () => {
  it('treats a missing or non-positive base tariff as unset', () => {
    expect(toBaseRate('5000.00')).toBe(500000);
    expect(toBaseRate('0.00')).toBeNull();
    expect(toBaseRate(null)).toBeNull();
    expect(toBaseRate('-5.00')).toBeNull();
  });
});

describe('roomStayTerms', () => {
  it('prices each night from its override, else the base rate', () => {
    const terms = roomStayTerms(double, nights, party(5), 'EGP');
    expect(terms.nightlyRates).toEqual([
      { date: '2026-11-20', unitRate: 500000 },
      { date: '2026-11-21', unitRate: 700000 },
    ]);
    expect(terms.unitStayTotal).toBe(1200000);
  });

  it('keeps currencies independent', () => {
    const egpOnly: RoomTypeStock = {
      ...double,
      nights: new Map([
        ['2026-11-20', open(1, { EGP: 550000 })],
        ['2026-11-21', open(1)],
      ]),
    };
    expect(roomStayTerms(egpOnly, nights, party(2), 'EGP').unitStayTotal).toBe(
      1050000,
    );
    expect(roomStayTerms(egpOnly, nights, party(2), 'USD').unitStayTotal).toBe(
      20000,
    );
  });

  it('is on request when a night has no rate, unless every night has an override', () => {
    const noEgp: RoomTypeStock = {
      ...family,
      baseRates: { USD: 30000, EGP: null },
    };
    const terms = roomStayTerms(noEgp, nights, party(4), 'EGP');
    expect(terms.nightlyRates.map((night) => night.unitRate)).toEqual([
      null,
      null,
    ]);
    expect(terms.unitStayTotal).toBeNull();
    const overridden: RoomTypeStock = {
      ...noEgp,
      nights: new Map(nights.map((date) => [date, open(1, { EGP: 900000 })])),
    };
    expect(
      roomStayTerms(overridden, nights, party(4), 'EGP').unitStayTotal,
    ).toBe(1800000);
  });

  it('treats any positive units as open: the party size alone caps the quantity', () => {
    expect(roomStayTerms(double, nights, party(5), 'EGP').maxQuantity).toBe(5);
    expect(roomStayTerms(family, nights, party(6), 'EGP').maxQuantity).toBe(6);
  });

  it('allows one room per guest, children included', () => {
    expect(roomStayTerms(double, nights, party(1, 2), 'EGP').maxQuantity).toBe(
      3,
    );
  });

  it('shows a type only to parties with at least its adult capacity in adults', () => {
    const golfBeach = (adults: number): RoomTypeStock => ({
      ...double,
      limits: { ...NO_LIMITS, adults },
    });
    const visible = (adults: number, children: number) =>
      [1, 2, 3].filter(
        (roomAdults) =>
          roomStayTerms(
            golfBeach(roomAdults),
            nights,
            party(adults, children),
            'EGP',
          ).maxQuantity > 0,
      );
    expect(visible(1, 1)).toEqual([1]);
    expect(visible(1, 2)).toEqual([1]);
    expect(visible(2, 0)).toEqual([1, 2]);
    expect(visible(3, 0)).toEqual([1, 2, 3]);
    expect(roomStayTerms(double, nights, party(1), 'EGP').maxQuantity).toBe(1);
  });

  it('treats a night without a row as open', () => {
    const noRows: RoomTypeStock = { ...double, nights: new Map() };
    expect(roomStayTerms(noRows, nights, party(6), 'USD').maxQuantity).toBe(6);
    expect(roomStayTerms(noRows, nights, party(6), 'USD').unitStayTotal).toBe(
      20000,
    );
  });

  it('closes the type when any stay night has 0 units, and ignores the checkout date', () => {
    expect(
      roomStayTerms(family, [...nights, '2026-11-22'], party(3), 'EGP')
        .maxQuantity,
    ).toBe(0);
    expect(roomStayTerms(family, nights, party(3), 'EGP').maxQuantity).toBe(3);
  });

  it('never offers a room type without a verified capacity, however much stock it has', () => {
    const stocked = new Map(nights.map((date) => [date, open(5)]));
    expect(
      roomStayTerms(
        { ...double, capacity: 0, nights: stocked },
        nights,
        party(2),
        'EGP',
      ).maxQuantity,
    ).toBe(0);
    expect(
      roomStayTerms(
        { ...double, capacity: 1, nights: stocked },
        nights,
        party(2),
        'EGP',
      ).maxQuantity,
    ).toBe(2);
  });
});

describe('priceStay', () => {
  const terms = [
    roomStayTerms(double, nights, party(5), 'EGP'),
    roomStayTerms(family, nights, party(5), 'EGP'),
  ];
  const rooms = [
    { roomId: 'r_double', quantity: 1 },
    { roomId: 'r_family', quantity: 1 },
  ];

  it('adds room subtotals and upgrades priced per room per night (handoff example)', () => {
    const quote = priceStay(
      rooms,
      terms,
      [{ addonId: 'a_upgrade', quantity: 1, unitRate: 90000 }],
      2,
    );
    expect(quote.rooms.map((line) => line.subtotal)).toEqual([
      1200000, 1440000,
    ]);
    expect(quote.addons).toEqual([
      { addonId: 'a_upgrade', quantity: 1, unitRate: 90000, subtotal: 180000 },
    ]);
    expect(quote.roomTotal).toBe(2640000);
    expect(quote.addonsTotal).toBe(180000);
    expect(quote.total).toBe(2820000);
  });

  it('prices no upgrades at zero and a zero-priced upgrade as free', () => {
    expect(priceStay(rooms, terms, [], 2).addonsTotal).toBe(0);
    const free = priceStay(
      rooms,
      terms,
      [{ addonId: 'a_free', quantity: 2, unitRate: 0 }],
      2,
    );
    expect(free.addons[0].subtotal).toBe(0);
    expect(free.total).toBe(2640000);
  });

  it('turns the total on request when any line has no price', () => {
    const quote = priceStay(
      rooms,
      terms,
      [{ addonId: 'a_unpriced', quantity: 1, unitRate: null }],
      2,
    );
    expect(quote.roomTotal).toBe(2640000);
    expect(quote.addonsTotal).toBeNull();
    expect(quote.total).toBeNull();
  });

  it('multiplies a room subtotal by its quantity', () => {
    const plenty = roomStayTerms(
      { ...family, nights: new Map(nights.map((date) => [date, open(3)])) },
      nights,
      party(6),
      'EGP',
    );
    expect(
      priceStay([{ roomId: 'r_family', quantity: 2 }], [plenty], [], 2)
        .roomTotal,
    ).toBe(2880000);
  });
});
