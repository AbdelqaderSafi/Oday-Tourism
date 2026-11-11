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
): AllocationCandidate => ({
  roomId,
  capacity,
  maxQuantity,
  unitStayTotal,
});

type Option = {
  rooms: RoomPick[];
  capacity: number;
  count: number;
  total: number | null;
};

function bruteForce(
  candidates: AllocationCandidate[],
  guests: number,
): Allocation | null {
  const types = candidates
    .filter((c) => c.capacity > 0 && c.maxQuantity > 0)
    .sort((a, b) => compareIds(a.roomId, b.roomId));
  const options: Option[] = [];
  const visit = (index: number, option: Option) => {
    if (index === types.length) {
      if (
        option.count >= 1 &&
        option.count <= guests &&
        option.capacity >= guests
      )
        options.push(option);
      return;
    }
    const type = types[index];
    visit(index + 1, option);
    for (let quantity = 1; quantity <= type.maxQuantity; quantity++) {
      visit(index + 1, {
        rooms: [...option.rooms, { roomId: type.roomId, quantity }],
        capacity: option.capacity + type.capacity * quantity,
        count: option.count + quantity,
        total:
          option.total === null || type.unitStayTotal === null
            ? null
            : option.total + type.unitStayTotal * quantity,
      });
    }
  };
  visit(0, { rooms: [], capacity: 0, count: 0, total: 0 });
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
        [room('r_double', 2, 1, 1200000), room('r_family', 3, 1, 1440000)],
        5,
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
      chooseAllocation([room('a', 4, 1, 1000), room('b', 2, 2, 300)], 4)?.rooms,
    ).toEqual([{ roomId: 'b', quantity: 2 }]);
    expect(
      chooseAllocation([room('a', 4, 1, 600), room('b', 2, 2, 300)], 4)?.rooms,
    ).toEqual([{ roomId: 'a', quantity: 1 }]);
    expect(
      chooseAllocation([room('b', 2, 1, 500), room('a', 2, 1, 500)], 2)?.rooms,
    ).toEqual([{ roomId: 'a', quantity: 1 }]);
  });

  it('uses a fully priced option before any on-request one', () => {
    expect(
      chooseAllocation([room('a', 2, 1, null), room('b', 1, 2, 300)], 2),
    ).toEqual({ rooms: [{ roomId: 'b', quantity: 2 }], total: 600 });
  });

  it('falls back to the fewest rooms on request when nothing is fully priced', () => {
    expect(
      chooseAllocation([room('a', 1, 2, 100), room('b', 3, 1, null)], 3),
    ).toEqual({ rooms: [{ roomId: 'b', quantity: 1 }], total: null });
  });

  it('returns null when no combination covers the party', () => {
    expect(
      chooseAllocation([room('a', 2, 1, 100), room('b', 2, 1, 100)], 5),
    ).toBeNull();
    expect(chooseAllocation([room('a', 2, 0, 100)], 2)).toBeNull();
    expect(chooseAllocation([], 1)).toBeNull();
  });

  it('matches brute force on random small inputs', () => {
    const random = seededRandom(20261110);
    const pick = (min: number, max: number) =>
      min + Math.floor(random() * (max - min + 1));
    for (let run = 0; run < 500; run++) {
      const candidates = Array.from({ length: pick(1, 4) }, (_, index) =>
        room(
          `r${index}`,
          pick(1, 5),
          pick(0, 3),
          random() < 0.25 ? null : pick(1, 6) * 50,
        ),
      );
      const guests = pick(1, 8);
      expect({
        candidates,
        guests,
        result: chooseAllocation(candidates, guests),
      }).toEqual({
        candidates,
        guests,
        result: bruteForce(candidates, guests),
      });
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
    room('r_double', 2, 1, 1200000),
    room('r_family', 3, 1, 1440000),
  ];
  const both = [
    { roomId: 'r_double', quantity: 1 },
    { roomId: 'r_family', quantity: 1 },
  ];

  it('accepts a selection that covers the party within each max quantity', () => {
    expect(isSelectionFeasible(both, types, 5)).toBe(true);
  });

  it('rejects unknown types, too many units, too little capacity and more rooms than guests', () => {
    expect(
      isSelectionFeasible([{ roomId: 'r_other', quantity: 1 }], types, 2),
    ).toBe(false);
    expect(
      isSelectionFeasible([{ roomId: 'r_double', quantity: 2 }], types, 4),
    ).toBe(false);
    expect(
      isSelectionFeasible([{ roomId: 'r_double', quantity: 1 }], types, 3),
    ).toBe(false);
    expect(isSelectionFeasible(both, types, 1)).toBe(false);
  });
});
