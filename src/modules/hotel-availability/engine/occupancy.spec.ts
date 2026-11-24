import {
  canHost,
  HostUnit,
  NO_LIMITS,
  OccupancyLimits,
  Party,
} from './occupancy';

const unit = (
  capacity: number,
  limits: Partial<OccupancyLimits> = {},
): HostUnit => ({ capacity, limits: { ...NO_LIMITS, ...limits } });
const party = (
  adults: number,
  childAges: number[] | null,
  children = childAges?.length ?? 0,
): Party => ({ adults, childAges, children });

// The handoff's example room: total 4, adults 2, children 2, under-3 1, under-6 2, 6-12 2.
const example = unit(4, {
  adults: 2,
  children: 2,
  under3: 1,
  under6: 2,
  age6to12: 2,
});

const unlimited = (value: number | null) => value ?? Number.POSITIVE_INFINITY;

// Independent oracle: try every assignment of every guest to a unit and check each unit directly.
function bruteForce(units: HostUnit[], p: Party): boolean {
  if (!units.length) return false;
  const guests: ('adult' | number | 'unknown')[] = [
    ...Array.from({ length: p.adults }, () => 'adult' as const),
    ...(p.childAges ??
      Array.from({ length: p.children }, () => 'unknown' as const)),
  ];
  const assignment = new Array<number>(guests.length).fill(0);
  const fits = () =>
    units.every((u, index) => {
      const mine = guests.filter((_, g) => assignment[g] === index);
      const adults = mine.filter((g) => g === 'adult').length;
      const kids = mine.filter((g) => g !== 'adult');
      const under3 = kids.filter((g) => typeof g === 'number' && g <= 2).length;
      const under6 = kids.filter(
        (g) => typeof g === 'number' && g >= 3 && g <= 5,
      ).length;
      const sixToTwelve = kids.filter(
        (g) => typeof g === 'number' && g >= 6,
      ).length;
      return (
        mine.length >= 1 &&
        mine.length <= u.capacity &&
        adults <= unlimited(u.limits.adults) &&
        kids.length <= unlimited(u.limits.children) &&
        under3 <= unlimited(u.limits.under3) &&
        under6 <= unlimited(u.limits.under6) &&
        sixToTwelve <= unlimited(u.limits.age6to12)
      );
    });
  const total = units.length ** guests.length;
  for (let code = 0; code < total; code++) {
    let rest = code;
    for (let g = 0; g < guests.length; g++) {
      assignment[g] = rest % units.length;
      rest = Math.floor(rest / units.length);
    }
    if (fits()) return true;
  }
  return false;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('canHost', () => {
  it('accepts the handoff example: 2 adults with children aged 2 and 7', () => {
    expect(canHost([example], party(2, [2, 7]))).toBe(true);
  });

  it('rejects two children under 3 when the under-3 limit is 1', () => {
    expect(canHost([example], party(2, [2, 2]))).toBe(false);
  });

  it('keeps the age bands separate: under-3 never counts toward the 3-5 (under-6) limit', () => {
    const room = unit(5, { under3: 1, under6: 1 });
    expect(canHost([room], party(1, [2]))).toBe(true);
    expect(canHost([room], party(1, [2, 4]))).toBe(true);
    expect(canHost([room], party(1, [4, 5]))).toBe(false);
    expect(canHost([room], party(1, [2, 2]))).toBe(false);
  });

  it('accepts a 2-year-old and rejects a 3-year-old when only under-3 is allowed', () => {
    const room = unit(4, {
      adults: 3,
      children: 1,
      under3: 1,
      under6: 0,
      age6to12: 0,
    });
    expect(canHost([room], party(3, [2]))).toBe(true);
    expect(canHost([room], party(3, [3]))).toBe(false);
    expect(canHost([room], party(3, [7]))).toBe(false);
  });

  it('treats 0 as forbidding the category and null as no extra limit', () => {
    expect(canHost([unit(4, { children: 0 })], party(2, [7]))).toBe(false);
    expect(canHost([unit(4, { age6to12: 0 })], party(2, [12]))).toBe(false);
    expect(canHost([unit(4, { age6to12: 0 })], party(2, [5]))).toBe(true);
    expect(canHost([unit(4)], party(1, [0, 3, 12]))).toBe(true);
  });

  it('allows an extra room for children on a booking with one adult', () => {
    const single = unit(2, { adults: 1, children: 1 });
    expect(canHost([single], party(1, [7, 8]))).toBe(false);
    expect(canHost([single, single], party(1, [7, 8]))).toBe(true);
  });

  it('requires at least one guest who fits each selected room', () => {
    const adultsOnly = unit(2, { children: 0 });
    expect(canHost([adultsOnly, adultsOnly, unit(3)], party(1, [7, 8]))).toBe(
      false,
    );
    expect(canHost([adultsOnly, unit(1)], party(1, [7]))).toBe(true);
  });

  it('lets two rooms hold a party that fits neither alone', () => {
    expect(canHost([example], party(2, [2, 2]))).toBe(false);
    expect(canHost([example, example], party(2, [2, 2]))).toBe(true);
  });

  it('applies only the total and child limits to children without ages', () => {
    expect(
      canHost([unit(4, { children: 2, under3: 0 })], party(2, null, 2)),
    ).toBe(true);
    expect(canHost([unit(4, { children: 1 })], party(2, null, 2))).toBe(false);
  });

  it('matches brute force on random small inputs', () => {
    const random = seededRandom(20261122);
    const pick = (min: number, max: number) =>
      min + Math.floor(random() * (max - min + 1));
    const maybe = (max: number) => (random() < 0.4 ? null : pick(0, max));
    for (let run = 0; run < 600; run++) {
      const units = Array.from({ length: pick(1, 3) }, () =>
        unit(pick(1, 4), {
          adults: random() < 0.4 ? null : pick(1, 3),
          children: maybe(3),
          under3: maybe(2),
          under6: maybe(2),
          age6to12: maybe(2),
        }),
      );
      const ages =
        random() < 0.15
          ? null
          : Array.from({ length: pick(0, 3) }, () => pick(0, 12));
      const p = party(pick(1, 3), ages, ages ? ages.length : pick(0, 3));
      expect({ units, p, result: canHost(units, p) }).toEqual({
        units,
        p,
        result: bruteForce(units, p),
      });
    }
  });
});
