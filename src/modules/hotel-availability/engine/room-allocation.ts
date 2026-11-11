import type { Cents } from './money';

export type AllocationCandidate = {
  roomId: string;
  capacity: number;
  maxQuantity: number;
  unitStayTotal: Cents | null;
};

export type RoomPick = { roomId: string; quantity: number };

export type Allocation = { rooms: RoomPick[]; total: Cents | null };

type Plan = { cost: Cents; rooms: RoomPick[] };

export function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// Final tie-break: (room_id, quantity) pairs in room_id order, compared pair by pair.
export function compareRoomPicks(a: RoomPick[], b: RoomPick[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const byId = compareIds(a[index].roomId, b[index].roomId);
    if (byId !== 0) return byId;
    if (a[index].quantity !== b[index].quantity)
      return a[index].quantity - b[index].quantity;
  }
  return a.length - b.length;
}

function isBetter(candidate: Plan, current: Plan | undefined): boolean {
  if (!current) return true;
  if (candidate.cost !== current.cost) return candidate.cost < current.cost;
  return compareRoomPicks(candidate.rooms, current.rooms) < 0;
}

// Dynamic programming over (guests covered, capped at the party) x (rooms used), with types in room_id order.
// Keeping one best plan per cell is exact because ties are decided on the shared prefix.
function cheapestCover(
  candidates: AllocationCandidate[],
  guests: number,
  unitCost: (candidate: AllocationCandidate) => Cents,
): Plan | null {
  const types = candidates
    .filter((candidate) => candidate.capacity > 0 && candidate.maxQuantity > 0)
    .sort((a, b) => compareIds(a.roomId, b.roomId));
  let table = Array.from({ length: guests + 1 }, () =>
    Array.from({ length: guests + 1 }, (): Plan | undefined => undefined),
  );
  table[0][0] = { cost: 0, rooms: [] };
  for (const type of types) {
    const next = table.map((row) => [...row]);
    for (let covered = 0; covered <= guests; covered++) {
      for (let used = 0; used < guests; used++) {
        const plan = table[covered][used];
        if (!plan) continue;
        for (
          let quantity = 1;
          quantity <= type.maxQuantity && used + quantity <= guests;
          quantity++
        ) {
          const reach = Math.min(guests, covered + quantity * type.capacity);
          const candidate: Plan = {
            cost: plan.cost + unitCost(type) * quantity,
            rooms: [...plan.rooms, { roomId: type.roomId, quantity }],
          };
          if (isBetter(candidate, next[reach][used + quantity]))
            next[reach][used + quantity] = candidate;
        }
      }
    }
    table = next;
  }
  let best: Plan | null = null;
  for (let used = 1; used <= guests; used++) {
    const plan = table[guests][used];
    if (plan && (!best || plan.cost < best.cost)) best = plan;
  }
  return best;
}

export function chooseAllocation(
  candidates: AllocationCandidate[],
  guests: number,
): Allocation | null {
  const priced = cheapestCover(
    candidates.filter((candidate) => candidate.unitStayTotal !== null),
    guests,
    (candidate) => candidate.unitStayTotal ?? 0,
  );
  if (priced) return { rooms: priced.rooms, total: priced.cost };
  const onRequest = cheapestCover(candidates, guests, () => 0);
  return onRequest ? { rooms: onRequest.rooms, total: null } : null;
}

export function isSelectionFeasible(
  rooms: RoomPick[],
  candidates: AllocationCandidate[],
  guests: number,
): boolean {
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.roomId, candidate]),
  );
  let capacity = 0;
  let count = 0;
  for (const { roomId, quantity } of rooms) {
    const candidate = candidatesById.get(roomId);
    if (
      !candidate ||
      candidate.capacity < 1 ||
      quantity < 1 ||
      quantity > candidate.maxQuantity
    )
      return false;
    capacity += candidate.capacity * quantity;
    count += quantity;
  }
  return count >= 1 && count <= guests && capacity >= guests;
}
