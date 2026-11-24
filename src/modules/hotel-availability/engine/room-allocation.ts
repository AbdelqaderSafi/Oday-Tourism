import type { Cents } from './money';
import {
  canHost,
  HostUnit,
  OccupancyLimits,
  Party,
  partyGuests,
} from './occupancy';

export type AllocationCandidate = {
  roomId: string;
  capacity: number;
  maxQuantity: number;
  unitStayTotal: Cents | null;
  limits: OccupancyLimits;
};

export type RoomPick = { roomId: string; quantity: number };

export type Allocation = { rooms: RoomPick[]; total: Cents | null };

type Plan = { rooms: RoomPick[]; count: number; cost: Cents };

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

const unitsOf = (type: AllocationCandidate, quantity: number): HostUnit[] =>
  Array.from({ length: quantity }, () => ({
    capacity: type.capacity,
    limits: type.limits,
  }));

// Depth-first over types in room_id order, with q units of each. Ranking: cost (0 for the on-request pass),
// then fewer rooms, then the stable room order. Every room needs a guest, so a plan has at most one room per guest.
function bestPlan(
  candidates: AllocationCandidate[],
  party: Party,
  unitCost: (type: AllocationCandidate) => Cents,
): Plan | null {
  const types = candidates
    .filter((candidate) => candidate.capacity > 0 && candidate.maxQuantity > 0)
    .sort((a, b) => compareIds(a.roomId, b.roomId));
  const maxRooms = partyGuests(party);
  let best: Plan | null = null;
  const picks: RoomPick[] = [];
  const units: HostUnit[] = [];
  const isBetter = (plan: Plan) =>
    !best || plan.cost !== best.cost
      ? !best || plan.cost < best.cost
      : plan.count !== best.count
        ? plan.count < best.count
        : compareRoomPicks(plan.rooms, best.rooms) < 0;

  const visit = (index: number, cost: Cents, count: number, room: number) => {
    if (
      best &&
      (cost > best.cost || (cost === best.cost && count > best.count))
    )
      return;
    if (index === types.length) {
      if (count < 1 || room < partyGuests(party)) return;
      const plan = { rooms: [...picks], count, cost };
      if (isBetter(plan) && canHost(units, party)) best = plan;
      return;
    }
    const type = types[index];
    visit(index + 1, cost, count, room);
    for (
      let quantity = 1;
      quantity <= type.maxQuantity && count + quantity <= maxRooms;
      quantity++
    ) {
      picks.push({ roomId: type.roomId, quantity });
      units.push(...unitsOf(type, quantity));
      visit(
        index + 1,
        cost + unitCost(type) * quantity,
        count + quantity,
        room + type.capacity * quantity,
      );
      units.length -= quantity;
      picks.pop();
    }
  };
  visit(0, 0, 0, 0);
  return best;
}

export function chooseAllocation(
  candidates: AllocationCandidate[],
  party: Party,
): Allocation | null {
  const priced = bestPlan(
    candidates.filter((candidate) => candidate.unitStayTotal !== null),
    party,
    (candidate) => candidate.unitStayTotal ?? 0,
  );
  if (priced) return { rooms: priced.rooms, total: priced.cost };
  const onRequest = bestPlan(candidates, party, () => 0);
  return onRequest ? { rooms: onRequest.rooms, total: null } : null;
}

export function isSelectionFeasible(
  rooms: RoomPick[],
  candidates: AllocationCandidate[],
  party: Party,
): boolean {
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.roomId, candidate]),
  );
  const units: HostUnit[] = [];
  for (const { roomId, quantity } of rooms) {
    const candidate = candidatesById.get(roomId);
    if (
      !candidate ||
      candidate.capacity < 1 ||
      quantity < 1 ||
      quantity > candidate.maxQuantity
    )
      return false;
    units.push(...unitsOf(candidate, quantity));
  }
  return canHost(units, party);
}
