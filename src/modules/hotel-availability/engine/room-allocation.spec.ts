import { canHost, NO_LIMITS, OccupancyLimits, Party } from './occupancy';
import {
  Allocation,
  AllocationCandidate,
  chooseAllocation,
  compareIds,
  compareRoomPicks,
  isSelectionFeasible,
  RoomPick,
} from './room-allocation';

const room = (
  roomId: string,
  capacity: number,
  maxQuantity: number,
  unitStayTotal: number | null,
  limits: Partial<OccupancyLimits> = {},
): AllocationCandidate => ({
  roomId,
  capacity,
  maxQuantity,
  unitStayTotal,
  limits: { ...NO_LIMITS, ...limits },
});

const adults = (count: number): Party => ({
  adults: count,
  children: 0,
  childAges: [],
});
const family = (adultCount: number, childAges: number[]): Party => ({
  adults: adultCount,
  children: childAges.length,
  childAges,
});

type Option = { rooms: RoomPick[]; count: number; total: number | null };

// Enumerates every multiset of units and ranks them as the spec does. canHost has its own brute-force check.
function bruteForce(
  candidates: AllocationCandidate[],
  party: Party,
): Allocation | null {
  const types = candidates
    .filter((c) => c.capacity > 0 && c.maxQuantity > 0)
    .sort((a, b) => compareIds(a.roomId, b.roomId));
  const options: Option[] = [];
  const visit = (index: number, option: Option) => {
    if (index === types.length) {
      const units = option.rooms.flatMap((pick) => {
        const type = types.find(
          (t) => t.roomId === pick.roomId,
        ) as AllocationCandidate;
        return Array.from({ length: pick.quantity }, () => ({
          capacity: type.capacity,
          limits: type.limits,
        }));
      });
      if (option.count >= 1 && canHost(units, party)) options.push(option);
      return;
    }
    const type = types[index];
    visit(index + 1, option);
    for (let quantity = 1; quantity <= type.maxQuantity; quantity++) {
      visit(index + 1, {
        rooms: [...option.rooms, { roomId: type.roomId, quantity }],
        count: option.count + quantity,
        total:
          option.total === null || type.unitStayTotal === null
            ? null
            : option.total + type.unitStayTotal * quantity,
      });
    }
  };
  visit(0, { rooms: [], count: 0, total: 0 });
  const priced = options.filter((option) => option.total !== null);
  const pool = priced.length ? priced : options;
  const [best] = [...pool].sort(
    (a, b) =>
      (a.total ?? 0) - (b.total ?? 0) ||
      a.count - b.count ||
      compareRoomPicks(a.rooms, b.rooms),
  );
  return best ? { rooms: best.rooms, total: best.total } : null;
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

describe('chooseAllocation', () => {
  it('recommends the handoff mix for five guests', () => {
    expect(
      chooseAllocation(
        [room('r_double', 2, 5, 1200000), room('r_family', 3, 5, 1440000)],
        family(4, [8]),
      ),
    ).toEqual({
      rooms: [
        { roomId: 'r_double', quantity: 1 },
        { roomId: 'r_family', quantity: 1 },
      ],
      total: 2640000,
    });
  });

  it('prefers the cheapest cover, then fewer rooms, then the lowest room ids', () => {
    expect(
      chooseAllocation([room('a', 4, 4, 1000), room('b', 2, 4, 300)], adults(4))
        ?.rooms,
    ).toEqual([{ roomId: 'b', quantity: 2 }]);
    expect(
      chooseAllocation([room('a', 4, 4, 600), room('b', 2, 4, 300)], adults(4))
        ?.rooms,
    ).toEqual([{ roomId: 'a', quantity: 1 }]);
    expect(
      chooseAllocation([room('b', 2, 2, 500), room('a', 2, 2, 500)], adults(2))
        ?.rooms,
    ).toEqual([{ roomId: 'a', quantity: 1 }]);
  });

  it('uses a fully priced option before any on-request one', () => {
    expect(
      chooseAllocation(
        [room('a', 2, 2, null), room('b', 1, 2, 300)],
        adults(2),
      ),
    ).toEqual({ rooms: [{ roomId: 'b', quantity: 2 }], total: 600 });
  });

  it('falls back to the fewest rooms on request when nothing is fully priced', () => {
    expect(
      chooseAllocation(
        [room('a', 1, 2, 100), room('b', 3, 3, null)],
        adults(3),
      ),
    ).toEqual({ rooms: [{ roomId: 'b', quantity: 1 }], total: null });
  });

  it('takes a second room when the age limits rule out one', () => {
    const limited = room('r', 4, 2, 1000, {
      adults: 2,
      children: 2,
      under3: 1,
      under6: 2,
      age6to12: 2,
    });
    expect(chooseAllocation([limited], family(2, [2, 7]))).toEqual({
      rooms: [{ roomId: 'r', quantity: 1 }],
      total: 1000,
    });
    expect(chooseAllocation([limited], family(2, [2, 2]))).toEqual({
      rooms: [{ roomId: 'r', quantity: 2 }],
      total: 2000,
    });
  });

  it('never gives a room to children alone', () => {
    expect(
      chooseAllocation([room('r', 3, 3, 1000)], family(1, [7, 8, 9])),
    ).toBeNull();
    expect(
      chooseAllocation([room('r', 3, 3, 1000)], family(2, [7, 8, 9]))?.rooms,
    ).toEqual([{ roomId: 'r', quantity: 2 }]);
  });

  it('returns null when no combination covers the party', () => {
    expect(
      chooseAllocation([room('a', 2, 1, 100), room('b', 2, 1, 100)], adults(5)),
    ).toBeNull();
    expect(chooseAllocation([room('a', 2, 0, 100)], adults(2))).toBeNull();
    expect(chooseAllocation([], adults(1))).toBeNull();
  });

  it('matches brute force on random small inputs', () => {
    const random = seededRandom(20261122);
    const pick = (min: number, max: number) =>
      min + Math.floor(random() * (max - min + 1));
    const maybe = (max: number) => (random() < 0.5 ? null : pick(0, max));
    for (let run = 0; run < 400; run++) {
      const candidates = Array.from({ length: pick(1, 3) }, (_, index) =>
        room(
          `r${index}`,
          pick(1, 4),
          pick(0, 3),
          random() < 0.25 ? null : pick(1, 6) * 50,
          {
            adults: random() < 0.5 ? null : pick(1, 3),
            children: maybe(2),
            under3: maybe(1),
            under6: maybe(2),
            age6to12: maybe(2),
          },
        ),
      );
      const ages = Array.from({ length: pick(0, 3) }, () => pick(0, 12));
      const party = family(pick(1, 3), ages);
      expect({
        candidates,
        party,
        result: chooseAllocation(candidates, party),
      }).toEqual({ candidates, party, result: bruteForce(candidates, party) });
    }
  });
});

describe('compareRoomPicks', () => {
  it('orders by room id, then quantity, then length', () => {
    expect(
      compareRoomPicks(
        [{ roomId: 'a', quantity: 2 }],
        [{ roomId: 'b', quantity: 1 }],
      ),
    ).toBeLessThan(0);
    expect(
      compareRoomPicks(
        [{ roomId: 'a', quantity: 1 }],
        [{ roomId: 'a', quantity: 2 }],
      ),
    ).toBeLessThan(0);
    expect(
      compareRoomPicks(
        [
          { roomId: 'a', quantity: 1 },
          { roomId: 'b', quantity: 1 },
        ],
        [{ roomId: 'a', quantity: 1 }],
      ),
    ).toBeGreaterThan(0);
    expect(
      compareRoomPicks(
        [{ roomId: 'a', quantity: 1 }],
        [{ roomId: 'a', quantity: 1 }],
      ),
    ).toBe(0);
  });
});

describe('isSelectionFeasible', () => {
  const types = [
    room('r_double', 2, 5, 1200000),
    room('r_family', 3, 5, 1440000),
  ];
  const both = [
    { roomId: 'r_double', quantity: 1 },
    { roomId: 'r_family', quantity: 1 },
  ];

  it('accepts a selection that holds the party', () => {
    expect(isSelectionFeasible(both, types, family(4, [8]))).toBe(true);
  });

  it('rejects unknown types, too many units, too little capacity and rooms without an adult', () => {
    expect(
      isSelectionFeasible(
        [{ roomId: 'r_other', quantity: 1 }],
        types,
        adults(2),
      ),
    ).toBe(false);
    expect(
      isSelectionFeasible(
        [{ roomId: 'r_double', quantity: 6 }],
        types,
        adults(6),
      ),
    ).toBe(false);
    expect(
      isSelectionFeasible(
        [{ roomId: 'r_double', quantity: 1 }],
        types,
        adults(3),
      ),
    ).toBe(false);
    expect(isSelectionFeasible(both, types, family(1, [5]))).toBe(false);
  });

  it('rejects a selection that breaks an age limit', () => {
    const limited = [room('r', 4, 2, 1000, { under3: 1 })];
    expect(
      isSelectionFeasible(
        [{ roomId: 'r', quantity: 1 }],
        limited,
        family(2, [1, 2]),
      ),
    ).toBe(false);
    expect(
      isSelectionFeasible(
        [{ roomId: 'r', quantity: 2 }],
        limited,
        family(2, [1, 2]),
      ),
    ).toBe(true);
  });
});
