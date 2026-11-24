// Per-room occupancy limits. null means "no limit beyond the room's total capacity"; 0 forbids the category.
export type OccupancyLimits = {
  adults: number | null;
  children: number | null;
  under3: number | null;
  under6: number | null;
  age6to12: number | null;
};

export const NO_LIMITS: OccupancyLimits = {
  adults: null,
  children: null,
  under3: null,
  under6: null,
  age6to12: null,
};

// childAges is null when the request carried no ages: those children count only toward the total and child limits.
export type Party = {
  adults: number;
  children: number;
  childAges: number[] | null;
};

export type HostUnit = { capacity: number; limits: OccupancyLimits };

export const partyGuests = (party: Party) => party.adults + party.children;

const BIG = 1_000_000;
const cap = (limit: number | null) => (limit === null ? BIG : limit);

function maxFlow(capacity: number[][], source: number, sink: number): number {
  const size = capacity.length;
  let flow = 0;
  for (;;) {
    const parent = new Array<number>(size).fill(-1);
    parent[source] = source;
    const queue = [source];
    while (queue.length && parent[sink] === -1) {
      const node = queue.shift() as number;
      for (let next = 0; next < size; next++) {
        if (parent[next] === -1 && capacity[node][next] > 0) {
          parent[next] = node;
          queue.push(next);
        }
      }
    }
    if (parent[sink] === -1) return flow;
    let push = Number.POSITIVE_INFINITY;
    for (let node = sink; node !== source; node = parent[node])
      push = Math.min(push, capacity[parent[node]][node]);
    for (let node = sink; node !== source; node = parent[node]) {
      capacity[parent[node]][node] -= push;
      capacity[node][parent[node]] += push;
    }
    flow += push;
  }
}

// Can these room units hold the whole party? The booking needs an adult and every room needs a guest; a room may
// hold children only, so a lone adult can book a second room for the children. A max-flow over each room's limits,
// where the age bands are separate: ages 0-2 <= under3, ages 3-5 <= under6, ages 6-12 <= age6to12,
// all children <= children, adults <= adults, everyone <= capacity.
export function canHost(units: HostUnit[], party: Party): boolean {
  const rooms = units.length;
  if (rooms < 1 || party.adults < 1 || partyGuests(party) < rooms) return false;
  if (units.some((unit) => unit.capacity < 1 || cap(unit.limits.adults) < 1))
    return false;

  const ages = party.childAges;
  const demand = [
    party.adults,
    ages ? ages.filter((age) => age <= 2).length : 0,
    ages ? ages.filter((age) => age >= 3 && age <= 5).length : 0,
    ages ? ages.filter((age) => age >= 6).length : 0,
    ages ? 0 : party.children,
  ];
  const needed = demand.reduce((sum, count) => sum + count, 0);

  // Nodes: 0 source, 1 sink, 2..6 guest groups, then per room: total, adults, children, under6, under3, 6-12.
  const SOURCE = 0;
  const SINK = 1;
  const size = 7 + rooms * 6;
  const graph = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  );
  demand.forEach((count, group) => (graph[SOURCE][2 + group] = count));
  units.forEach((unit, index) => {
    const [total, adults, children, under6, under3, sixToTwelve] = Array.from(
      { length: 6 },
      (_, k) => 7 + index * 6 + k,
    );
    const { limits } = unit;
    graph[total][SINK] = 1;
    graph[adults][total] = cap(limits.adults);
    graph[children][total] = cap(limits.children);
    graph[under6][children] = cap(limits.under6);
    graph[under3][children] = cap(limits.under3);
    graph[sixToTwelve][children] = cap(limits.age6to12);
    graph[2][adults] = BIG;
    graph[3][under3] = BIG;
    graph[4][under6] = BIG;
    graph[5][sixToTwelve] = BIG;
    graph[6][children] = BIG;
  });
  // First put one guest in each room. Augmenting paths never pass through the sink, so raising each room to its
  // full capacity afterwards keeps every room occupied while the second pass places everyone else.
  if (maxFlow(graph, SOURCE, SINK) !== rooms) return false;
  units.forEach(
    (unit, index) => (graph[7 + index * 6][SINK] = unit.capacity - 1),
  );
  return maxFlow(graph, SOURCE, SINK) === needed - rooms;
}
