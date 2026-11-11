import {
  CalendarNight,
  priceStay,
  roomStayTerms,
  RoomTypeStock,
  toBaseRate,
} from './stay-pricing';

const open = (
  availableUnits: number,
  overrides: Partial<CalendarNight['overrides']> = {},
): CalendarNight => ({
  availableUnits,
  overrides: { USD: null, EGP: null, ...overrides },
});

const nights = ['2026-11-20', '2026-11-21'];

const double: RoomTypeStock = {
  roomId: 'r_double',
  capacity: 2,
  baseRates: { USD: 10000, EGP: 500000 },
  nights: new Map([
    ['2026-11-20', open(2)],
    ['2026-11-21', open(1, { USD: 14000, EGP: 700000 })],
  ]),
};

const family: RoomTypeStock = {
  roomId: 'r_family',
  capacity: 3,
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
    const terms = roomStayTerms(double, nights, 5, 'EGP');
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
    expect(roomStayTerms(egpOnly, nights, 2, 'EGP').unitStayTotal).toBe(
      1050000,
    );
    expect(roomStayTerms(egpOnly, nights, 2, 'USD').unitStayTotal).toBe(20000);
  });

  it('is on request when a night has no rate, unless every night has an override', () => {
    const noEgp: RoomTypeStock = {
      ...family,
      baseRates: { USD: 30000, EGP: null },
    };
    const terms = roomStayTerms(noEgp, nights, 4, 'EGP');
    expect(terms.nightlyRates.map((night) => night.unitRate)).toEqual([
      null,
      null,
    ]);
    expect(terms.unitStayTotal).toBeNull();
    const overridden: RoomTypeStock = {
      ...noEgp,
      nights: new Map(nights.map((date) => [date, open(1, { EGP: 900000 })])),
    };
    expect(roomStayTerms(overridden, nights, 4, 'EGP').unitStayTotal).toBe(
      1800000,
    );
  });

  it('allows the smallest stock across the nights, capped at the party size', () => {
    expect(roomStayTerms(double, nights, 5, 'EGP').maxQuantity).toBe(1);
    const plenty: RoomTypeStock = {
      ...double,
      nights: new Map(nights.map((date) => [date, open(9)])),
    };
    expect(roomStayTerms(plenty, nights, 3, 'EGP').maxQuantity).toBe(3);
  });

  it('treats a missing night as closed and ignores the checkout date', () => {
    expect(
      roomStayTerms(double, ['2026-11-21', '2026-11-22'], 2, 'EGP').maxQuantity,
    ).toBe(0);
    expect(
      roomStayTerms(family, [...nights, '2026-11-22'], 3, 'EGP').maxQuantity,
    ).toBe(0);
    expect(roomStayTerms(family, nights, 3, 'EGP').maxQuantity).toBe(1);
  });

  it('never offers a room type without a verified capacity, however much stock it has', () => {
    const stocked = new Map(nights.map((date) => [date, open(5)]));
    expect(
      roomStayTerms(
        { ...double, capacity: 0, nights: stocked },
        nights,
        2,
        'EGP',
      ).maxQuantity,
    ).toBe(0);
    expect(
      roomStayTerms(
        { ...double, capacity: 1, nights: stocked },
        nights,
        2,
        'EGP',
      ).maxQuantity,
    ).toBe(2);
  });
});

describe('priceStay', () => {
  const terms = [
    roomStayTerms(double, nights, 5, 'EGP'),
    roomStayTerms(family, nights, 5, 'EGP'),
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
      6,
      'EGP',
    );
    expect(
      priceStay([{ roomId: 'r_family', quantity: 2 }], [plenty], [], 2)
        .roomTotal,
    ).toBe(2880000);
  });
});
