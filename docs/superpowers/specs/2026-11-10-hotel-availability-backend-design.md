# Hotel availability and nightly pricing: backend design

- **Date:** 2026-11-10
- **Status:** Ready for review
- **Source contract:** `HOTEL_AVAILABILITY_BACKEND_HANDOFF.md` from the frontend (2026-11-10), and the admin calendar mock inside its `hotel-calendar-demo.html`
- **Branch:** `feat/hotel-availability`

## 1. Goal, scope and decisions

The frontend has built a dated hotel search, a stay quote with a recheck before the WhatsApp inquiry, and an Arabic admin calendar. The backend must provide:

1. Room capacity and room IDs that survive hotel edits (`rooms_write_mode=by_id`, `delete_room_ids`, `409 ROOM_IDS_REQUIRED`).
2. Per-night room stock and USD/EGP rate overrides, with an authenticated admin calendar API.
3. A public dated search (`GET /hotel/search`) and a public stay quote (`POST /hotel/:hotelId/stay-quote`).

Out of scope: reservations, holds or stock deduction (checkout stays a WhatsApp inquiry); child ages, infant rules and child rates; currency conversion; automatic discount stacking; stable add-on IDs.

Decisions taken during design review:

- **Delivery:** one pull request. Commits follow the handoff rollout order: room IDs and capacity, then the calendar, then search and quote.
- **Development database:** a new local database, `oday_tourism_dev`, on the local MySQL 9.4 service. The Railway database in `.env` is never used for development, and `prisma migrate dev` is never run against it.
- **Computation:** per-night rows plus a pure TypeScript engine shared by search and quote (section 6).
- **Add-ons:** keep today's replace-on-PATCH behavior, as the handoff specifies. Their IDs change whenever `addons` is sent.

## 2. Current state that shapes the design

- `PATCH /hotel/:id` with `rooms` hard-deletes every room and recreates it with a new UUID (`HotelService.update`). Add-ons are replaced the same way. A calendar keyed by `room_id` would not survive an edit.
- `Room` has no capacity in `schema.prisma`. The init migration created `room.capacity VARCHAR(50) NOT NULL`; commit `bee32de` removed the field from the schema without a migration. A database built from the migrations still has that column, so room inserts that omit it fail under MySQL's default strict mode. Whether production still has it is unknown.
- `HotelController` declares `GET /hotel/:id`, so `GET /hotel/search` must be registered before it.
- Errors have the shape `{ statusCode, message }` (Nest) or `{ message, errors[] }` (`ZodValidationPipe`). There is no machine-readable `code`.
- The repo has no unit tests; `test/app.e2e-spec.ts` is the unmodified scaffold, and Jest has no mapping for `src/...` imports.
- Already in place: the global `AuthGuard` protects every route without `@IsPublic`; `app.enableCors()` allows any origin; rooms and add-ons are soft-deleted (`is_deleted`) and hotel responses already filter them out.

## 3. Data model

### 3.1 Prisma schema changes

```prisma
model Room {
  // existing fields unchanged
  capacity          Int?              @map("guest_capacity") @db.UnsignedTinyInt
  calendar_revision Int               @default(0) @db.UnsignedInt
  calendar_days     RoomCalendarDay[]
}

model hotels {
  // existing fields unchanged
  calendar_managed_at DateTime?
}

model RoomCalendarDay {
  room_id           String   @db.VarChar(36)
  stay_date         DateTime @db.Date
  available_units   Int      @default(0) @db.UnsignedSmallInt
  rate_override_usd Decimal? @db.Decimal(10, 2)
  rate_override_egp Decimal? @db.Decimal(10, 2)
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  room              Room     @relation(fields: [room_id], references: [id])

  @@id([room_id, stay_date])
  @@map("room_calendar_days")
}
```

- `capacity` (API name; column `guest_capacity`) is the number of guests one unit of the type sleeps. `null` means unverified, and such a type never qualifies for dated search or quotes. The new column name cannot collide with the legacy `capacity` column.
- `calendar_revision` increments on every successful calendar write for the room. It starts at `0`, which is also what the frontend demo assumes for an unconfigured room.
- `calendar_managed_at` is set in the same transaction as the hotel's first successful calendar write. Once it is set, legacy room replacement returns `409 ROOM_IDS_REQUIRED`.
- `room_calendar_days` holds one row per room type and night, with primary key `(room_id, stay_date)`. No row, or `available_units = 0`, means the night is closed. The two currency overrides are independent; `null` inherits the base rate.

### 3.2 Migration

One migration, `prisma/migrations/20261110120000_add_hotel_availability/migration.sql`, written by hand like the existing idempotent migrations:

1. A prepared statement (`SET @sql = IF(EXISTS(...), ...)`, then `PREPARE` / `EXECUTE`) checks `information_schema.COLUMNS` for a legacy `room.capacity`. If the column exists, it runs `ALTER TABLE room MODIFY COLUMN capacity VARCHAR(50) NULL` so inserts that omit it succeed; otherwise it runs `SELECT 1`. No data is dropped. It replaced a stored procedure during the pre-push review: no earlier migration creates a routine, the Railway user's `CREATE ROUTINE` privilege was never checked, and the container runs `prisma migrate deploy` before it starts the API, so a failed migration would keep the API down. Production has no legacy `capacity` column (read-only check on 2026-11-11); both branches were rehearsed locally.
2. Additive DDL: `room.guest_capacity`, `room.calendar_revision`, `hotels.calendar_managed_at`, and the `room_calendar_days` table (`utf8mb4_unicode_ci`, like the existing tables) with a foreign key to `room(id)`.

After applying it to `oday_tourism_dev`, `prisma migrate diff` from that database to `schema.prisma` must show nothing for the new columns and table. It will still report the pre-existing legacy drift (the old `capacity` column), so any SQL that Prisma generates must be reviewed instead of applied as is.

There is no backfill. No capacity is derived from room descriptions and no stock is invented. After deployment, no hotel qualifies for dated search until an admin sets capacities and opens nights. The legacy catalog is unaffected.

### 3.3 Date handling rule

Every read and write of `stay_date` goes through raw SQL with `YYYY-MM-DD` strings; reads select `DATE_FORMAT(stay_date, '%Y-%m-%d')`. JS `Date` values are never bound to or read from that column. The development machine runs at UTC+2 and the server at UTC, and a driver conversion could shift a night by one day.

## 4. Room writes

### 4.1 Capacity

`capacity` is accepted wherever a room is written: nested `rooms` in `POST /hotel` and `PATCH /hotel/:id` (both modes), and `POST` and `PATCH /hotel/:hotelId/room`.

- An integer from 1 to 50, sent as a number or a numeric string (the demo fixture uses `"2"`).
- `null` or `''` clears it. Omitted on create means `null`; omitted on update means unchanged.
- Every room response returns `capacity` as an integer or `null`.

### 4.2 `PATCH /hotel/:id` with `rooms_write_mode=by_id`

The request stays `multipart/form-data`; `rooms` and `delete_room_ids` are JSON strings.

- `rooms` is an upsert array:
  - A row with `id` updates that room. Its other fields are optional (`price`, `price_egp`, `capacity`, `translations`) and validated like `PATCH /hotel/:hotelId/room/:id`; translations upsert by language, as in `RoomService.update`.
  - A row without `id` creates a room with today's requirements (`price`, `price_egp`, `translations`) plus optional `capacity`.
- `delete_room_ids` soft-deletes rooms (`is_deleted = true`). Their calendar rows stay attached to the archived room. UUIDs are never reused, so those rows never attach to a new room.
- Rooms that are not mentioned are unchanged. Omitting `rooms` or `delete_room_ids` changes nothing.
- `400 INVALID_INPUT` with `field` for:
  - an ID that is not a non-deleted room of this hotel (one generic message for unknown, foreign or deleted IDs);
  - a duplicate ID in either array;
  - an ID in both arrays;
  - `delete_room_ids` without `rooms_write_mode=by_id`;
  - any `rooms_write_mode` value other than `by_id`;
  - a row with `id` while `rooms_write_mode` is not `by_id`.
- Rooms are never matched by translated name, position, capacity or price.

### 4.3 Legacy mode (no `rooms_write_mode`)

- Without `rooms`: unchanged behavior.
- With `rooms`, on a hotel whose `calendar_managed_at` is set: `409 ROOM_IDS_REQUIRED` before anything is modified.
- With `rooms`, on any other hotel: replacement as today, except that existing rooms are soft-deleted instead of hard-deleted. Responses already exclude soft-deleted rooms.
- Add-ons keep today's replace behavior in both modes.

### 4.4 Atomicity and concurrency

All hotel, room and add-on changes run in one interactive transaction. When the request touches rooms, the transaction first locks the hotel row (`SELECT … FOR UPDATE`), then checks `calendar_managed_at` and validates by-ID room references, before any write. The first calendar write locks the same hotel row before its room row (section 5.2), so a legacy replacement cannot interleave with it, and the two transactions always take locks in the same order.

Any error rolls back the whole request. `FileCleanupInterceptor` removes the images uploaded with it, and ImageKit deletions for `deleteAssetIds` run only after a successful commit (existing behavior).

`PATCH /hotel/:hotelId/room/:id` already edits by ID, so it stays allowed for calendar-managed hotels. `DELETE` stays a soft delete.

## 5. Admin calendar API

Neither route has `@IsPublic`, so the global `AuthGuard` requires an admin token, including for reads. A missing or deleted hotel, or a room that is not a non-deleted room of that hotel, returns `404 NOT_FOUND`.

### 5.1 `GET /hotel/:hotelId/rooms/:roomId/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`

- `to` is exclusive, and the range is 1 to 365 nights. Reads are not limited to the booking window: reading other dates is harmless, and it avoids errors when the Cairo date changes while the admin page is open.
- The response has one entry per night, including nights without a row (IDs below are illustrative; real IDs are UUIDs):

```json
{
  "hotel_id": "h_123",
  "room_id": "r_double",
  "revision": 8,
  "base_rates": { "USD": "100.00", "EGP": "5000.00" },
  "days": [
    { "date": "2026-11-20", "available_units": 1, "rate_override": { "USD": null, "EGP": null } },
    { "date": "2026-11-21", "available_units": 1, "rate_override": { "USD": "140.00", "EGP": "7000.00" } },
    { "date": "2026-11-22", "available_units": 0, "rate_override": { "USD": null, "EGP": null } }
  ]
}
```

- `base_rates` holds the inherited rate per currency as a two-decimal string, or `null` when the base is missing or not positive, because a guest would then get "on request".
- Response header: `Cache-Control: no-store`.

### 5.2 `PATCH /hotel/:hotelId/rooms/:roomId/calendar`

```json
{
  "revision": 8,
  "changes": [
    { "from": "2026-11-21", "to": "2026-11-22", "available_units": 2, "rate_override": { "EGP": "7500.00" } },
    { "from": "2026-11-22", "to": "2026-11-23", "available_units": 0, "rate_override": { "USD": null, "EGP": null } }
  ]
}
```

Validation failures return `400 INVALID_INPUT` with `field`:

- `revision` is an integer ≥ 0, and `changes` has 1 to 365 entries.
- Each change has valid dates, `from < to`, `from` ≥ today in Cairo and `to` ≤ today + 365 days. It sets `available_units` or at least one `rate_override` key.
- `available_units` is an integer from 0 to 999.
- `rate_override` accepts only the `USD` and `EGP` keys. Each value is `null` (clear) or a positive amount with at most two decimals and at most 99,999,999.99, sent as a string or a number.
- No night may appear in two changes.

Semantics:

- Omitted fields stay unchanged.
- `null` clears that currency's override only.
- `available_units: 0` closes nights and keeps their overrides.
- A price-only change never opens a night; a new row gets `available_units = 0`.

The write runs in one transaction:

1. `UPDATE hotels SET calendar_managed_at = COALESCE(calendar_managed_at, UTC_TIMESTAMP(3)) WHERE id = ?`. This locks the hotel row first; the hotel PATCH (section 4.4) also locks the hotel before any room, so the two cannot deadlock.
2. `UPDATE room SET calendar_revision = calendar_revision + 1 WHERE id = ? AND hotel_id = ? AND is_deleted = 0 AND calendar_revision = ?`. Zero affected rows means `409 CALENDAR_CONFLICT`; existence was already checked for the 404.
3. For each change, one multi-row `INSERT … ON DUPLICATE KEY UPDATE` covering its nights. The update clause sets only the provided columns, using bound constants rather than the `VALUES()` function (deprecated since MySQL 8.0.20), so the same SQL runs on MySQL and MariaDB. New rows use `available_units = 0` and `null` overrides for fields that were not provided.

Any failure rolls everything back, including the hotel flag. Success returns `200`, and the frontend reloads the calendar:

```json
{ "hotel_id": "h_123", "room_id": "r_double", "revision": 9 }
```

Check order: body shape (400), then hotel and room (404), then revision (409).

A room without `capacity` can have a calendar. It qualifies for search once its capacity is set.

## 6. Availability engine

Pure TypeScript under `engine/`, with no database or Prisma imports, shared by search and quote.

### 6.1 Dates (`stay-dates.ts`)

- Today is the current date in `Africa/Cairo`, computed with `Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' })`, the same method as the frontend.
- Dates must match `YYYY-MM-DD` and round-trip through UTC, which rejects dates such as `2026-02-30`.
- Arithmetic uses UTC midnight. A stay is `[check_in, check_out)`: a Nov 20–22 stay checks and charges the nights of Nov 20 and Nov 21 only.

### 6.2 Money (`money.ts`)

Amounts are integer minor units (cents or piasters), parsed exactly from decimal strings and formatted back as two-decimal strings such as `"26400.00"`. The largest possible total (99,999,999.99 × 30 nights × 20 rooms, plus upgrades) is about 1.2 × 10¹³ minor units, far below 2⁵³.

### 6.3 Pricing rules (`stay-pricing.ts`)

- Tariff: `egyptian-resident` → `EGP`, `other` → `USD`. There is no conversion between currencies.
- Nightly rate in a currency: that night's override if it is not `null`; otherwise the base (`room.price` for USD, `room.price_egp` for EGP) if it is greater than zero; otherwise `null` (on request).
- `unit_stay_total`: the sum of the nightly rates for one unit, or `null` if any night is `null`.
- Room line subtotal: `unit_stay_total × quantity`.
- Upgrade (add-on) line: `unit_rate × quantity × nights`, where `unit_rate` is the add-on's price in the currency. A `null` price means on request; `0` means free (`"0.00"`), matching the existing visitor-pricing rule that zero marks a free add-on.
- `room_total` and `addons_total` are the sums of their lines, or `null` if any line is `null`. An empty upgrade list totals `"0.00"`.
- `total` is `room_total + addons_total`, or `null` if either is `null`. `pricing_status` is `PRICED` when `total` is not `null` and `ON_REQUEST` otherwise.

### 6.4 Availability

- A room type is eligible when neither the hotel nor the room is deleted and `capacity ≥ 1`.
- Its allocatable units for a stay are the minimum `available_units` over the stay's nights; a missing row counts as 0. The type is available when that minimum is at least 1, and `max_quantity = min(minimum, guests)`.
- Taking the minimum guarantees that one allocation holds on every night; types are never swapped between nights.

### 6.5 Allocation (`room-allocation.ts`)

A combination assigns a quantity `q ≤ max_quantity` to each available type, with `Σ capacity × q ≥ guests` and `1 ≤ Σ q ≤ guests`.

Selection:

1. Among combinations whose types all have a non-null `unit_stay_total`: the lowest total price, then fewer rooms, then the stable ordering. Result: `PRICED`.
2. If there is none: among all combinations, fewer rooms, then the stable ordering. Result: `ON_REQUEST`, with a `null` total.
3. If there is no combination at all, the hotel does not qualify for search, and a quote returns `409 STAY_UNAVAILABLE`.

Stable ordering: write a combination as its `(room_id, quantity)` pairs with `quantity > 0`, sorted by `room_id` (plain string comparison). Compare two combinations pair by pair: the smaller `room_id` first, then the smaller quantity.

Algorithm: dynamic programming over the types in `room_id` order, with the state (guests covered, capped at the party size) × (rooms used). Each state keeps its best partial combination by (price, stable ordering). This is exact for the ranking above because the ordering is decided on the shared prefix. It costs on the order of types × 21 × 21 × 20 steps per hotel. Unit tests compare it with brute-force enumeration on random small inputs.

Worked example from the handoff: five guests; `r_double` has capacity 2 and costs EGP 5000 + override 7000 = 12000 for the stay; `r_family` has capacity 3 and costs 7200 × 2 = 14400; one unit of each is available. The only combination is one of each, for `26400.00 EGP`. One upgrade at `900.00` for two nights adds `1800.00`, for a total of `28200.00 EGP`.

## 7. Public API

### 7.1 Shared rules

Search and quote share these checks, which return `400 INVALID_INPUT` with `field`:

- `check_in` ≥ today in Cairo, `check_out` > `check_in`, 1 to 30 nights, and `check_out` ≤ today + 365 days.
- `adults` is an integer ≥ 1; `children` is an integer ≥ 0, default 0; `adults + children` ≤ 20.
- `visitor_category` is `egyptian-resident` or `other`.

Both routes are `@IsPublic(true)`, and both responses set `Cache-Control: no-store`.

### 7.2 `GET /hotel/search`

Query: `destination` (a `DestinatiosnEnum` code, required), the shared fields, `page` (integer ≥ 1, default 1) and `limit` (integer 1–100, default 20). An unknown destination or an out-of-range `page` or `limit` returns `400 INVALID_INPUT`.

1. Load the non-deleted hotels in the destination with their eligible rooms (light select).
2. Load the calendar rows for those rooms within the stay where `available_units > 0`, in one query on the primary key.
3. Run the engine for each hotel and keep the hotels with a `PRICED` or `ON_REQUEST` offer.
4. Order by hotel `id`. The catalog (`GET /hotel`) has no `ORDER BY`, and the handoff allows the hotel ID alone in that case.
5. Paginate the filtered list. `meta.total` counts every qualifying hotel, including on-request ones.
6. Load the full catalog shape (the `GET /hotel` include: assets, translations, and non-deleted rooms and add-ons with translations) for the page's hotels only.

```json
{
  "data": [
    {
      "hotel": { "id": "h_123", "destination": "SHARM_EL_SHEIKH" },
      "stay_offer": {
        "nights": 2,
        "currency": "EGP",
        "pricing_status": "PRICED",
        "total": "26400.00",
        "rooms": [
          { "room_id": "r_double", "quantity": 1 },
          { "room_id": "r_family", "quantity": 1 }
        ]
      }
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

`hotel` is abbreviated above; the response carries the full catalog shape. A valid search without matches returns `data: []`, `meta.total: 0` and `meta.totalPages: 0`.

The `search` handler is declared in `HotelController` above `@Get(':id')` and delegates to `HotelAvailabilityService`.

### 7.3 `POST /hotel/:hotelId/stay-quote`

The body has the shared fields plus optional `rooms: [{ room_id, quantity }]` and optional `addons: [{ addon_id, quantity }]`.

A missing or deleted hotel, or a `hotelId` that is not a UUID, returns `404 NOT_FOUND`. Otherwise, problems visible in the request alone are `400`, and problems that depend on the hotel's current data are `409`.

`400 INVALID_INPUT`:

- `rooms` is present but empty.
- An ID is not UUID-shaped, or repeats within its array.
- A quantity is not a positive integer.
- `addons` is non-empty but `rooms` is absent.
- The total room quantity exceeds the number of guests.
- The total upgrade quantity exceeds the total room quantity.

Without `rooms`, the response is the engine's recommendation, with `nightly_rates`, `addons: []` and `addons_total: "0.00"`. If no combination is feasible, it returns `409 STAY_UNAVAILABLE`.

With `rooms`, it returns `409 STAY_UNAVAILABLE` with one generic message, which reveals nothing about other hotels, when:

- a room is not an available, eligible type of this hotel;
- a quantity exceeds that type's `max_quantity`;
- the selection does not cover the party;
- an add-on is not a non-deleted add-on of this hotel.

Response for an exact selection with one upgrade:

```json
{
  "hotel_id": "h_123",
  "check_in": "2026-11-20",
  "check_out": "2026-11-22",
  "adults": 4,
  "children": 1,
  "nights": 2,
  "visitor_category": "egyptian-resident",
  "currency": "EGP",
  "pricing_status": "PRICED",
  "available_room_types": [
    { "room_id": "r_double", "capacity": 2, "max_quantity": 1, "unit_stay_total": "12000.00" },
    { "room_id": "r_family", "capacity": 3, "max_quantity": 1, "unit_stay_total": "14400.00" }
  ],
  "rooms": [
    {
      "room_id": "r_double", "quantity": 1, "subtotal": "12000.00",
      "nightly_rates": [
        { "date": "2026-11-20", "unit_rate": "5000.00" },
        { "date": "2026-11-21", "unit_rate": "7000.00" }
      ]
    },
    {
      "room_id": "r_family", "quantity": 1, "subtotal": "14400.00",
      "nightly_rates": [
        { "date": "2026-11-20", "unit_rate": "7200.00" },
        { "date": "2026-11-21", "unit_rate": "7200.00" }
      ]
    }
  ],
  "addons": [{ "addon_id": "a_upgrade", "quantity": 1, "unit_rate": "900.00", "subtotal": "1800.00" }],
  "room_total": "26400.00",
  "addons_total": "1800.00",
  "total": "28200.00",
  "quoted_at": "2026-11-10T12:00:00.000Z"
}
```

- `available_room_types` appears in both modes. It lists every available type (at least one unit on every night), even when several types are needed to cover the party.
- `rooms` and `available_room_types` are sorted by `room_id`, and `nightly_rates` by date. A missing nightly rate is `null`, and so are the affected subtotal, `room_total` and `total`.
- `quoted_at` is an ISO 8601 UTC timestamp.
- Nothing is held and there is no quote ID. A changed price is a normal `200` with the new numbers; the frontend compares them with what the guest accepted.

## 8. Error contract

Error bodies for the routes in this design:

```json
{ "statusCode": 409, "code": "STAY_UNAVAILABLE", "message": "الغرف المختارة غير متاحة لهذه الإقامة", "field": "rooms" }
```

- `message` is Arabic, like the rest of the API, and clients branch on `code`. `field` is present when one request field is to blame. Validation errors keep the existing `errors: [{ field, message }]` list as well.
- Codes: `400 INVALID_INPUT`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 STAY_UNAVAILABLE`, `409 CALENDAR_CONFLICT`, `409 ROOM_IDS_REQUIRED`, `429 RATE_LIMITED`, `5xx INTERNAL_ERROR`. A database failure is a `500`, never an empty result. `403` does not occur today because there is a single admin role.
- Services throw the 409 errors with an explicit `code`. An `AvailabilityExceptionFilter`, applied with `@UseFilters` to the calendar controller and to the `search`, `stay-quote` and `update` handlers, adds `code` (from the status) and `field` (from the first validation error) when they are missing. It also replaces the English messages of 401, 403, 429 and 5xx errors with Arabic ones. Otherwise it keeps existing fields and leaves other routes untouched. Method- and controller-scoped filters also receive exceptions thrown by the global guards (`AuthGuard` 401, `ThrottlerGuard` 429).

## 9. Module layout

```text
src/modules/hotel-availability/
  hotel-availability.module.ts       # exports HotelAvailabilityService
  hotel-availability.service.ts      # search and quote: load data, call the engine, shape responses
  room-calendar.controller.ts        # GET/PATCH /hotel/:hotelId/rooms/:roomId/calendar
  room-calendar.service.ts
  engine/
    stay-dates.ts
    money.ts
    stay-pricing.ts
    room-allocation.ts
    *.spec.ts
  util/availability.validation.ts    # Zod schemas
  util/availability-exception.filter.ts
  types/availability.dto.ts
  swagger/availability.swagger.ts
```

- `HotelController` gains thin `search` (above `:id`) and `stay-quote` handlers, and `HotelModule` imports `HotelAvailabilityModule`.
- Room write changes live in `hotel.service.ts`, `hotel.validation.ts` and `hotel.dto.ts`, and in the room module's validation and DTO.
- The catalog include (`assets`, `translations`, and non-deleted `rooms` and `addons` with translations) becomes a constant shared by `HotelService` and the search.
- Swagger documents every new route and field in Arabic, like the existing docs, and the README endpoint tables are updated.

## 10. Validation limits

| Limit | Value |
| --- | --- |
| Nights per stay | 1–30 |
| Booking window | `check_in` ≥ today (Cairo), `check_out` ≤ today + 365 days |
| Guests | adults ≥ 1, children ≥ 0, total ≤ 20 |
| Search page size | default 20, max 100 |
| Room capacity | 1–50 |
| `available_units` | 0–999 |
| Calendar read range | 1–365 nights |
| Calendar write batch | 1–365 changes, each 1–365 nights, within today to today + 365 days |
| Override amount | > 0, at most 2 decimals, ≤ 99,999,999.99 |

## 11. Testing

1. **Engine unit tests (Jest).** Engine files import only each other and never Prisma, so Jest runs them without config changes. Cover:
   - dates: Cairo today across the UTC day boundary, invalid dates, night lists;
   - money parsing and formatting;
   - pricing: override vs base, an EGP-only override, `null` vs `0`, a non-positive base;
   - allocation: every acceptance case below, combinations with more rooms than guests, tie-breaks, and dynamic programming vs brute force on random inputs.
2. **Live HTTP verification on `oday_tourism_dev`.**
   - `prisma/seed-hotel-availability.ts` (npm script `seed:availability`) idempotently creates a test hotel, slug `availability-test-hotel`, in `SHARM_EL_SHEIKH`, with dates relative to today in Cairo. It has a two-person and a three-person room, a room without an EGP base rate, a priced upgrade, an open range, a closed night, and overrides in both currencies.
   - Every endpoint is then exercised over HTTP: the acceptance table, `401` without a token, `400` validation, `409` conflicts, `by_id` edits and `ROOM_IDS_REQUIRED`, and the unchanged legacy catalog.
   - The script refuses any database host other than localhost.
3. `npm run build`, and lint on the changed files.

Acceptance cases from the handoff:

| Case | Expected result |
| --- | --- |
| One unavailable night, or stock split across types on different nights | Hotel excluded; an exact quote returns `409 STAY_UNAVAILABLE` |
| Checkout date closed, occupied nights open | Hotel eligible; checkout date not charged |
| Five guests, one 2-person and one 3-person unit throughout | Both recommended for `26400.00 EGP`; with one `900.00 EGP` upgrade for two nights, `28200.00 EGP` |
| Two units on the first night, one on the second | `max_quantity` is 1 |
| EGP override on one night only | USD unaffected; clearing the EGP override restores the base |
| Missing EGP rate and no fully priced alternative | `ON_REQUEST` for EGP with `total: null`; no USD fallback |
| Admin closes a night or changes a rate after a search | A new exact quote returns `409 STAY_UNAVAILABLE` or the updated price |
| Stale revision, overlapping batch, or another hotel's room | Rejected with nothing saved; unauthenticated calls fail |
| Hotel content edit or room rename | Room ID and calendar survive; deleted types are never offered; legacy room replacement on a calendar-managed hotel returns `409 ROOM_IDS_REQUIRED` with no changes |
| Legacy catalog without dates; dated search with no matches | Catalog unchanged; an empty successful page |

## 12. Rollout

1. Before merging, and with the owner's permission, run a read-only check of the production `room` columns to record whether the legacy `capacity` column exists. The migration handles both cases.
2. Merge and deploy; Railway runs `prisma migrate deploy` on start. Nothing changes for the current frontend: the catalog is intact, dated search returns empty pages until hotels are configured, and `by_id` is opt-in.
3. Smoke-check production: `GET /hotel` and `GET /hotel/:id` are unchanged, `GET /hotel/search` returns an empty page, and the calendar requires a token.
4. Send the frontend the base URL, a test hotel and room, admin test access, the limits in section 10, example responses, and the questions in section 13.
5. The frontend deploys `admin` mode, and admins set capacities and calendars. It then switches to `live` mode after rechecking search, exact quotes, calendar writes and an old saved cart.

## 13. Questions for the frontend

1. Does the updated admin send `capacity` in room rows (`POST /hotel`, `PATCH /hotel/:id` in both modes, and room CRUD)? The API returns it as an integer or `null`; the demo fixture uses the string `"2"`.
2. Add-on IDs still change whenever `addons` is sent in `PATCH /hotel/:id`, so a saved upgrade can fail the requote with `409 STAY_UNAVAILABLE`.
3. An add-on priced `0` quotes as free (`"0.00"`); a `null` price is on request.
4. Are the limits in section 10 acceptable?
5. Tie-breaks follow section 6.5. In `live` mode the backend's recommendation is authoritative, even where the demo would pick differently.
6. Calendar `base_rates` returns `null` for a non-positive base (the demo returns `"0.00"`), and calendar reads are not limited to the booking window.
7. Error bodies follow section 8, with Arabic `message` text, and `quoted_at` includes milliseconds.

## 14. Risks and follow-ups

- **Rate limiting behind Railway's proxy.** The global throttler (5 requests per second and 100 per minute per IP) covers search and quote. Without `trust proxy`, every visitor may share the proxy's IP and therefore one limit. This already affects existing routes; the fix is recommended as a separate small change after confirming the behavior on Railway.
- **Legacy `capacity` column.** It stays in databases built from the migrations, and `prisma migrate dev` keeps proposing to drop it. A later cleanup migration can drop it once the production check confirms nobody needs the old values.
- **Soft-deleted rooms accumulate** under legacy replacement until every admin uses `by_id`.
- **Search loads every hotel in the destination.** That is fine at the current size; revisit with SQL pre-filtering if a destination reaches hundreds of hotels.
- **Cairo midnight.** The frontend and backend compute "today" independently, so a request sent just before midnight can be judged against the next day. Unrestricted calendar reads soften this for the admin.
