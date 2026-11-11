# Hotel Availability Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dated hotel search, stay quotes, an admin per-night room calendar, room capacity and stable room IDs, as specified in `docs/superpowers/specs/2026-11-10-hotel-availability-backend-design.md`.

**Architecture:** A new `room_calendar_days` table holds per-night stock and USD/EGP overrides. A pure TypeScript engine (`src/modules/hotel-availability/engine/`, no Prisma or Nest imports) turns rooms and calendar rows into nightly rates, maximum quantities, a recommended allocation and a priced quote; search and quote share it. Calendar writes bump an optimistic `room.calendar_revision` after locking the hotel row. `PATCH /hotel/:id` gains `rooms_write_mode=by_id`; legacy room replacement soft-deletes and is blocked once a hotel uses the calendar.

**Tech Stack:** NestJS 11 (Express 5), Prisma 7.4 with `@prisma/adapter-mariadb`, MySQL (Railway in production, local MySQL 9.4 for development), Zod 4, Jest 30 with ts-jest, Node 22 (`fetch` and `FormData` for live checks), PowerShell.

---

## Global constraints

- Branch `feat/hotel-availability`. Commit after each task. **Never push or open the PR**; the user does that.
- **Never touch the Railway database.** `.env` points at production. Every database, seed or server command runs after `. .\.tmp\local-session.ps1` (Task 1), which sets `DATABASE_URL` to the local `oday_tourism_dev` and refuses anything else. Dotenv and `@nestjs/config` never override a variable already set in the shell. Never run `prisma migrate dev`, `migrate reset` or `db push`. Never print `.env` values.
- Engine files import only each other (relative paths). They never import Prisma, Nest or `src/...`, so Jest runs them without config changes; the generated Prisma client is ESM.
- Money is integer minor units (`Cents`). Dates are `YYYY-MM-DD` strings. `stay_date` is read and written only through raw SQL (`DATE_FORMAT` on read, string parameters on write). Raw-SQL timestamps use `UTC_TIMESTAMP(3)`.
- User-facing messages are Arabic. Code comments only state constraints the code cannot show.
- After editing TypeScript run `npx eslint --fix <changed files>` (applies Prettier). Never run it on untouched files; `room.service.ts` and `zod.validation.pipe.ts` have pre-existing errors.
- Jest writes to stderr, so PowerShell shows a `NativeCommandError` banner even on success; read the `Tests:` line.

## File map

Create:
- `prisma/migrations/20261110120000_add_hotel_availability/migration.sql`
- `prisma/seed-hotel-availability.ts`
- `src/modules/hotel-availability/engine/{availability-limits,money,stay-dates,stay-pricing,room-allocation}.ts` and `money.spec.ts`, `stay-dates.spec.ts`, `stay-pricing.spec.ts`, `room-allocation.spec.ts`
- `src/modules/hotel-availability/util/{availability.errors,availability-exception.filter,availability.validation,availability.queries}.ts` and `availability-exception.filter.spec.ts`
- `src/modules/hotel-availability/types/availability.dto.ts`, `swagger/availability.swagger.ts`
- `src/modules/hotel-availability/{room-calendar.service,room-calendar.controller,hotel-availability.service,hotel-availability.module}.ts`
- `src/modules/hotel/util/hotel-catalog.ts`, `src/modules/utils/capacity.util.ts`

Modify: `prisma/schema.prisma`, `package.json`, `src/modules/hotel/{hotel.controller,hotel.module,hotel.service}.ts`, `src/modules/hotel/types/hotel.dto.ts`, `src/modules/hotel/util/hotel.validation.ts`, `src/modules/hotel/swagger/hotel.swagger.ts`, `src/modules/room/util/room.validation.ts`, `src/modules/room/types/room.dto.ts`, `src/modules/room/swagger/room.swagger.ts`, `README.md`.

Local only, gitignored: `.env.local`, `.tmp/local-session.ps1`, `.tmp/start-local-server.ps1`, `.tmp/availability-verify/*.mjs`, `.tmp/drift-*.sql`.

---

## Task 1: Local development database

**Produces:** `oday_tourism_dev` with every existing migration applied; `.tmp/local-session.ps1` (sets `DATABASE_URL`, defines `Invoke-LocalSql`); `.tmp/start-local-server.ps1`.

- [x] **Step 1: Ask the user for the local connection.** Stop and ask the user to create `.env.local` (gitignored) in the repo root with one line, percent-encoding special characters in the password:

```text
DATABASE_URL="mysql://root:YOUR_PASSWORD@127.0.0.1:3306/oday_tourism_dev?allowPublicKeyRetrieval=true"
```

Continue only after they confirm. Do not ask them to paste the password into chat. Check that `Get-Service MySQL94` shows `Running`.

- [x] **Step 2: Create `.tmp/local-session.ps1`**

```powershell
$line = Get-Content (Join-Path $PSScriptRoot '..\.env.local') | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) { throw '.env.local has no DATABASE_URL line' }
$env:DATABASE_URL = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"')
$dbUri = [Uri]$env:DATABASE_URL
if ($dbUri.Host -notin @('127.0.0.1', 'localhost') -or $dbUri.AbsolutePath -ne '/oday_tourism_dev') {
  Remove-Item Env:DATABASE_URL
  throw "Refusing to continue: DATABASE_URL points at $($dbUri.Host)$($dbUri.AbsolutePath)"
}

function Invoke-LocalSql([string]$Sql, [switch]$NoDatabase) {
  $user, $password = $dbUri.UserInfo.Split(':', 2) | ForEach-Object { [Uri]::UnescapeDataString($_) }
  $arguments = @('-h', $dbUri.Host, '-P', $dbUri.Port, '-u', $user, '--table', '-e', $Sql)
  if (-not $NoDatabase) { $arguments += @('-D', $dbUri.AbsolutePath.TrimStart('/')) }
  $env:MYSQL_PWD = $password
  try { & 'C:\Program Files\MySQL\MySQL Server 9.4\bin\mysql.exe' @arguments }
  finally { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
}

"Local database: $($dbUri.Host):$($dbUri.Port)$($dbUri.AbsolutePath)"
```

- [x] **Step 3: Create `.tmp/start-local-server.ps1`**

```powershell
. (Join-Path $PSScriptRoot 'local-session.ps1')
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 3000 is already in use; ask the user which server that is' }
Set-Location (Join-Path $PSScriptRoot '..')
npm run start:dev
```

- [x] **Step 4: Create the database and apply the existing migrations**

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. .\.tmp\local-session.ps1
Invoke-LocalSql -NoDatabase "CREATE DATABASE IF NOT EXISTS oday_tourism_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npx prisma migrate status
```

Expected: `Local database: 127.0.0.1:3306/oday_tourism_dev`, and `migrate status` names `MySQL database "oday_tourism_dev" at "127.0.0.1:3306"` with 15 unapplied migrations. If it names any other host, stop. Then run `npx prisma migrate deploy`. Expected: `All migrations have been successfully applied.` If an old migration fails, stop and report; never edit old migrations.

- [x] **Step 5: Record the drift baseline**

```powershell
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o .tmp/drift-before.sql
Get-Content .tmp/drift-before.sql
```

Expected drift only: dropping `room.capacity`, `trips`/`comments` `city` columns (a no-op migration), foreign-key actions (`CASCADE` vs `RESTRICT`), index names and `hotels.slug`'s default. If it touches other columns of `hotels`, `room`, `room_translations`, `hotel_addons`, `hotel_addon_translations`, `hotel_translations`, `assets` or `admins`, stop and report. No commit (nothing tracked changed).

---

## Task 2: Schema and migration

**Produces:** Prisma fields `Room.capacity` (column `guest_capacity`), `Room.calendar_revision`, `hotels.calendar_managed_at`, model `RoomCalendarDay`; regenerated client.

- [x] **Step 1: Edit `prisma/schema.prisma`.** In `model hotels`, add after `youtube_video_url`:

```prisma
  calendar_managed_at DateTime?
```

Replace `model Room` with:

```prisma
model Room {
  id                String            @id @default(uuid()) @db.VarChar(36)
  price             Decimal           @db.Decimal(10, 2)
  price_egp         Decimal?          @db.Decimal(10, 2)
  // Not `capacity`: databases built from the migrations still have a legacy room.capacity VARCHAR column.
  capacity          Int?              @map("guest_capacity") @db.UnsignedTinyInt
  calendar_revision Int               @default(0) @db.UnsignedInt
  hotel_id          String            @db.VarChar(36)
  is_deleted        Boolean           @default(false)
  created_at        DateTime          @default(now())
  updated_at        DateTime          @updatedAt
  hotel             hotels            @relation(fields: [hotel_id], references: [id])
  translations      RoomTranslation[]
  calendar_days     RoomCalendarDay[]

  @@index([hotel_id], map: "room_hotel_id_fkey")
  @@map("room")
}
```

Add after `model RoomTranslation`:

```prisma
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

Run `npx prisma format; npx prisma validate`. Expected: `The schema at prisma\schema.prisma is valid`.

- [x] **Step 2: Create `prisma/migrations/20261110120000_add_hotel_availability/migration.sql`**

```sql
-- Hotel availability: room capacity, calendar revisions and the nightly room calendar.

-- Databases built from the init migration have `room`.`capacity` VARCHAR(50) NOT NULL, which the schema no longer
-- has; inserts that omit it fail in strict mode. Production may or may not still have the column.
DROP PROCEDURE IF EXISTS relax_legacy_room_capacity;
CREATE PROCEDURE relax_legacy_room_capacity()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'room'
      AND COLUMN_NAME  = 'capacity'
  ) THEN
    ALTER TABLE `room` MODIFY COLUMN `capacity` VARCHAR(50) NULL;
  END IF;
END;
CALL relax_legacy_room_capacity();
DROP PROCEDURE IF EXISTS relax_legacy_room_capacity;

-- AlterTable
ALTER TABLE `room` ADD COLUMN `guest_capacity` TINYINT UNSIGNED NULL,
    ADD COLUMN `calendar_revision` INTEGER UNSIGNED NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `hotels` ADD COLUMN `calendar_managed_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `room_calendar_days` (
    `room_id` VARCHAR(36) NOT NULL,
    `stay_date` DATE NOT NULL,
    `available_units` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `rate_override_usd` DECIMAL(10, 2) NULL,
    `rate_override_egp` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`room_id`, `stay_date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `room_calendar_days` ADD CONSTRAINT `room_calendar_days_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [x] **Step 3: Generate, apply locally, verify**

```powershell
npx prisma generate
. .\.tmp\local-session.ps1
npx prisma migrate status
npx prisma migrate deploy
Invoke-LocalSql "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'room' AND COLUMN_NAME IN ('capacity','guest_capacity','calendar_revision')) OR (TABLE_NAME = 'hotels' AND COLUMN_NAME = 'calendar_managed_at') OR TABLE_NAME = 'room_calendar_days') ORDER BY TABLE_NAME, ORDINAL_POSITION;"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o .tmp/drift-after.sql
Compare-Object (Get-Content .tmp/drift-before.sql) (Get-Content .tmp/drift-after.sql)
```

Expected: status lists exactly `20261110120000_add_hotel_availability` as pending, and deploy applies it. Columns: `room.capacity varchar(50) YES`, `room.guest_capacity tinyint unsigned YES`, `room.calendar_revision int unsigned NO 0`, `hotels.calendar_managed_at datetime(3) YES`, and the seven `room_calendar_days` columns. `drift-after.sql` mentions none of `guest_capacity`, `calendar_revision`, `calendar_managed_at` or `room_calendar_days`. Small statement reordering in `Compare-Object` is fine.

- [x] **Step 4: Build and commit**

Run `npm run build`. Expected: exit 0.

```powershell
git add prisma/schema.prisma prisma/migrations/20261110120000_add_hotel_availability/migration.sql
git commit -m "feat(db): add room capacity, calendar revision and nightly room calendar"
```

---

## Task 3: Engine — limits, money and dates (TDD)

**Produces:** `AVAILABILITY_LIMITS`; `Cents`, `parseAmount`, `formatAmount`, `formatAmountOrNull`; `isCalendarDate`, `addDays`, `daysBetween`, `stayNights`, `hotelToday`.

- [x] **Step 1: Write the failing tests.** `src/modules/hotel-availability/engine/money.spec.ts`:

```ts
import { formatAmount, formatAmountOrNull, parseAmount } from './money';

describe('money', () => {
  it('parses decimal strings into minor units', () => {
    expect(parseAmount('5000.00')).toBe(500000);
    expect(parseAmount('7500.5')).toBe(750050);
    expect(parseAmount('12')).toBe(1200);
    expect(parseAmount(' 0.01 ')).toBe(1);
    expect(parseAmount('99999999.99')).toBe(9999999999);
  });

  it('rejects anything but a non-negative amount with at most two decimals', () => {
    for (const value of ['', '-1', '1.234', '1e3', 'abc', '123456789', '.5', '5.']) {
      expect(parseAmount(value)).toBeNull();
    }
  });

  it('formats minor units with exactly two decimals', () => {
    expect(formatAmount(2640000)).toBe('26400.00');
    expect(formatAmount(5)).toBe('0.05');
    expect(formatAmount(0)).toBe('0.00');
    expect(formatAmount(9999999999)).toBe('99999999.99');
    expect(formatAmountOrNull(null)).toBeNull();
    expect(formatAmountOrNull(180000)).toBe('1800.00');
  });
});
```

`src/modules/hotel-availability/engine/stay-dates.spec.ts`:

```ts
import { addDays, daysBetween, hotelToday, isCalendarDate, stayNights } from './stay-dates';

describe('stay dates', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isCalendarDate('2026-11-20')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    for (const value of ['2026-02-29', '2026-13-01', '2026-11-31', '2026-1-01', '20261120', ' 2026-11-20', '2026-11-20T00:00']) {
      expect(isCalendarDate(value)).toBe(false);
    }
  });

  it('moves across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-20', '2026-11-22')).toBe(2);
    expect(daysBetween('2026-11-22', '2026-11-20')).toBe(-2);
  });

  it('lists occupied nights and never the checkout date', () => {
    expect(stayNights('2026-11-20', '2026-11-22')).toEqual(['2026-11-20', '2026-11-21']);
    expect(stayNights('2026-11-22', '2026-11-22')).toEqual([]);
  });

  it('uses the Cairo calendar date, including daylight saving time', () => {
    expect(hotelToday(new Date('2026-11-09T21:59:00Z'))).toBe('2026-11-09');
    expect(hotelToday(new Date('2026-11-09T22:30:00Z'))).toBe('2026-11-10');
    expect(hotelToday(new Date('2026-07-15T21:30:00Z'))).toBe('2026-07-16');
  });
});
```

- [x] **Step 2: Run them to confirm they fail.** `npx jest src/modules/hotel-availability/engine`. Expected: FAIL with `Cannot find module './money'` and `'./stay-dates'`.

- [x] **Step 3: Implement.** `engine/availability-limits.ts`:

```ts
export const AVAILABILITY_LIMITS = {
  maxStayNights: 30,
  bookingWindowDays: 365,
  maxGuests: 20,
  defaultSearchPageSize: 20,
  maxSearchPageSize: 100,
  maxCalendarRangeNights: 365,
  maxCalendarChanges: 365,
  maxAvailableUnits: 999,
} as const;
```

`engine/money.ts`:

```ts
// Integer minor units (cents / piasters), so totals are exact.
export type Cents = number;

const AMOUNT_PATTERN = /^(\d{1,8})(?:\.(\d{1,2}))?$/;

export function parseAmount(value: string): Cents | null {
  const match = AMOUNT_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function formatAmount(cents: Cents): string {
  const fraction = cents % 100;
  return `${(cents - fraction) / 100}.${String(fraction).padStart(2, '0')}`;
}

export function formatAmountOrNull(cents: Cents | null): string | null {
  return cents === null ? null : formatAmount(cents);
}
```

`engine/stay-dates.ts`:

```ts
const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Hotel nights are Egyptian calendar dates, whatever the server's time zone.
const hotelDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromTime = (time: number) => new Date(time).toISOString().slice(0, 10);

export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const time = toTime(value);
  return !Number.isNaN(time) && fromTime(time) === value;
}

export function addDays(date: string, days: number): string {
  return fromTime(toTime(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

export function stayNights(checkIn: string, checkOut: string): string[] {
  const count = Math.max(daysBetween(checkIn, checkOut), 0);
  return Array.from({ length: count }, (_, index) => addDays(checkIn, index));
}

export function hotelToday(now: Date = new Date()): string {
  const parts = new Map(hotelDateFormat.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`;
}
```

- [x] **Step 4: Run the tests.** `npx jest src/modules/hotel-availability/engine`. Expected: `Tests: 7 passed`.

- [x] **Step 5: Lint and commit**

```powershell
npx eslint --fix src/modules/hotel-availability/engine
git add src/modules/hotel-availability/engine
git commit -m "feat(availability): add money, Cairo date helpers and limits"
```

---

## Task 4: Engine — stay pricing (TDD)

**Produces (`engine/stay-pricing.ts`):** `Currency`, `VisitorCategory`, `Rates`, `VISITOR_CURRENCY`, `CalendarNight`, `RoomTypeStock`, `NightlyRate`, `RoomStayTerms`, `UpgradeSelection`, `PricedStay`, `toBaseRate`, `roomStayTerms`, `priceStay`. It imports only the `RoomPick` type from `room-allocation.ts`, so create that type first.

- [x] **Step 1: Create the shared type.** `engine/room-allocation.ts` (completed in Task 5):

```ts
export type RoomPick = { roomId: string; quantity: number };
```

- [x] **Step 2: Write the failing test** `engine/stay-pricing.spec.ts`:

```ts
import { CalendarNight, priceStay, roomStayTerms, RoomTypeStock, toBaseRate } from './stay-pricing';

const open = (availableUnits: number, overrides: Partial<CalendarNight['overrides']> = {}): CalendarNight => ({
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
    expect(roomStayTerms(egpOnly, nights, 2, 'EGP').unitStayTotal).toBe(1050000);
    expect(roomStayTerms(egpOnly, nights, 2, 'USD').unitStayTotal).toBe(20000);
  });

  it('is on request when a night has no rate, unless every night has an override', () => {
    const noEgp: RoomTypeStock = { ...family, baseRates: { USD: 30000, EGP: null } };
    const terms = roomStayTerms(noEgp, nights, 4, 'EGP');
    expect(terms.nightlyRates.map((night) => night.unitRate)).toEqual([null, null]);
    expect(terms.unitStayTotal).toBeNull();
    const overridden: RoomTypeStock = { ...noEgp, nights: new Map(nights.map((date) => [date, open(1, { EGP: 900000 })])) };
    expect(roomStayTerms(overridden, nights, 4, 'EGP').unitStayTotal).toBe(1800000);
  });

  it('allows the smallest stock across the nights, capped at the party size', () => {
    expect(roomStayTerms(double, nights, 5, 'EGP').maxQuantity).toBe(1);
    const plenty: RoomTypeStock = { ...double, nights: new Map(nights.map((date) => [date, open(9)])) };
    expect(roomStayTerms(plenty, nights, 3, 'EGP').maxQuantity).toBe(3);
  });

  it('treats a missing night as closed and ignores the checkout date', () => {
    expect(roomStayTerms(double, ['2026-11-21', '2026-11-22'], 2, 'EGP').maxQuantity).toBe(0);
    expect(roomStayTerms(family, [...nights, '2026-11-22'], 3, 'EGP').maxQuantity).toBe(0);
    expect(roomStayTerms(family, nights, 3, 'EGP').maxQuantity).toBe(1);
  });
});

describe('priceStay', () => {
  const terms = [roomStayTerms(double, nights, 5, 'EGP'), roomStayTerms(family, nights, 5, 'EGP')];
  const rooms = [
    { roomId: 'r_double', quantity: 1 },
    { roomId: 'r_family', quantity: 1 },
  ];

  it('adds room subtotals and upgrades priced per room per night (handoff example)', () => {
    const quote = priceStay(rooms, terms, [{ addonId: 'a_upgrade', quantity: 1, unitRate: 90000 }], 2);
    expect(quote.rooms.map((line) => line.subtotal)).toEqual([1200000, 1440000]);
    expect(quote.addons).toEqual([{ addonId: 'a_upgrade', quantity: 1, unitRate: 90000, subtotal: 180000 }]);
    expect(quote.roomTotal).toBe(2640000);
    expect(quote.addonsTotal).toBe(180000);
    expect(quote.total).toBe(2820000);
  });

  it('prices no upgrades at zero and a zero-priced upgrade as free', () => {
    expect(priceStay(rooms, terms, [], 2).addonsTotal).toBe(0);
    const free = priceStay(rooms, terms, [{ addonId: 'a_free', quantity: 2, unitRate: 0 }], 2);
    expect(free.addons[0].subtotal).toBe(0);
    expect(free.total).toBe(2640000);
  });

  it('turns the total on request when any line has no price', () => {
    const quote = priceStay(rooms, terms, [{ addonId: 'a_unpriced', quantity: 1, unitRate: null }], 2);
    expect(quote.roomTotal).toBe(2640000);
    expect(quote.addonsTotal).toBeNull();
    expect(quote.total).toBeNull();
  });

  it('multiplies a room subtotal by its quantity', () => {
    const plenty = roomStayTerms({ ...family, nights: new Map(nights.map((date) => [date, open(3)])) }, nights, 6, 'EGP');
    expect(priceStay([{ roomId: 'r_family', quantity: 2 }], [plenty], [], 2).roomTotal).toBe(2880000);
  });
});
```

- [x] **Step 3: Run it to confirm it fails.** `npx jest src/modules/hotel-availability/engine/stay-pricing`. Expected: FAIL, `Cannot find module './stay-pricing'`.

- [x] **Step 4: Implement** `engine/stay-pricing.ts`:

```ts
import { Cents, parseAmount } from './money';
import type { RoomPick } from './room-allocation';

export type Currency = 'USD' | 'EGP';
export type VisitorCategory = 'egyptian-resident' | 'other';
export type Rates = Record<Currency, Cents | null>;

export const VISITOR_CURRENCY: Record<VisitorCategory, Currency> = {
  'egyptian-resident': 'EGP',
  other: 'USD',
};

export type CalendarNight = { availableUnits: number; overrides: Rates };

export type RoomTypeStock = {
  roomId: string;
  capacity: number;
  baseRates: Rates;
  nights: ReadonlyMap<string, CalendarNight>;
};

export type NightlyRate = { date: string; unitRate: Cents | null };

export type RoomStayTerms = {
  roomId: string;
  capacity: number;
  maxQuantity: number;
  unitStayTotal: Cents | null;
  nightlyRates: NightlyRate[];
};

export type UpgradeSelection = { addonId: string; quantity: number; unitRate: Cents | null };

export type PricedStay = {
  rooms: (RoomPick & { subtotal: Cents | null; nightlyRates: NightlyRate[] })[];
  addons: (UpgradeSelection & { subtotal: Cents | null })[];
  roomTotal: Cents | null;
  addonsTotal: Cents | null;
  total: Cents | null;
};

// A base tariff of zero or less was never set: guests get "on request", not a free room.
export function toBaseRate(amount: string | null): Cents | null {
  const cents = amount === null ? null : parseAmount(amount);
  return cents !== null && cents > 0 ? cents : null;
}

function sumOrNull(values: (Cents | null)[]): Cents | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

export function roomStayTerms(room: RoomTypeStock, nights: string[], guests: number, currency: Currency): RoomStayTerms {
  const nightlyRates = nights.map((date) => ({
    date,
    unitRate: room.nights.get(date)?.overrides[currency] ?? room.baseRates[currency],
  }));
  const fewestUnits = Math.min(...nights.map((date) => room.nights.get(date)?.availableUnits ?? 0));
  return {
    roomId: room.roomId,
    capacity: room.capacity,
    maxQuantity: nights.length ? Math.max(0, Math.min(fewestUnits, guests)) : 0,
    unitStayTotal: sumOrNull(nightlyRates.map((night) => night.unitRate)),
    nightlyRates,
  };
}

export function priceStay(rooms: RoomPick[], terms: RoomStayTerms[], upgrades: UpgradeSelection[], nightCount: number): PricedStay {
  const termsById = new Map(terms.map((roomTerms) => [roomTerms.roomId, roomTerms]));
  const roomLines = rooms.map(({ roomId, quantity }) => {
    const roomTerms = termsById.get(roomId);
    if (!roomTerms) throw new Error(`No stay terms for room ${roomId}`);
    return {
      roomId,
      quantity,
      subtotal: roomTerms.unitStayTotal === null ? null : roomTerms.unitStayTotal * quantity,
      nightlyRates: roomTerms.nightlyRates,
    };
  });
  const addonLines = upgrades.map((upgrade) => ({
    ...upgrade,
    subtotal: upgrade.unitRate === null ? null : upgrade.unitRate * upgrade.quantity * nightCount,
  }));
  const roomTotal = sumOrNull(roomLines.map((line) => line.subtotal));
  const addonsTotal = sumOrNull(addonLines.map((line) => line.subtotal));
  return {
    rooms: roomLines,
    addons: addonLines,
    roomTotal,
    addonsTotal,
    total: roomTotal === null || addonsTotal === null ? null : roomTotal + addonsTotal,
  };
}
```

- [x] **Step 5: Run the tests.** Expected: `Tests: 10 passed` for `stay-pricing.spec.ts`.

- [x] **Step 6: Lint and commit**

```powershell
npx eslint --fix src/modules/hotel-availability/engine
git add src/modules/hotel-availability/engine
git commit -m "feat(availability): add nightly pricing and stay totals"
```

---

## Task 5: Engine — room allocation (TDD)

**Produces (`engine/room-allocation.ts`):** `AllocationCandidate`, `RoomPick`, `Allocation`, `compareIds`, `compareRoomPicks`, `chooseAllocation`, `isSelectionFeasible`. `RoomStayTerms` structurally satisfies `AllocationCandidate`.

- [x] **Step 1: Write the failing test** `engine/room-allocation.spec.ts`:

```ts
import { Allocation, AllocationCandidate, chooseAllocation, compareIds, compareRoomPicks, isSelectionFeasible, RoomPick } from './room-allocation';

const room = (roomId: string, capacity: number, maxQuantity: number, unitStayTotal: number | null): AllocationCandidate => ({
  roomId,
  capacity,
  maxQuantity,
  unitStayTotal,
});

type Option = { rooms: RoomPick[]; capacity: number; count: number; total: number | null };

function bruteForce(candidates: AllocationCandidate[], guests: number): Allocation | null {
  const types = candidates.filter((c) => c.capacity > 0 && c.maxQuantity > 0).sort((a, b) => compareIds(a.roomId, b.roomId));
  const options: Option[] = [];
  const visit = (index: number, option: Option) => {
    if (index === types.length) {
      if (option.count >= 1 && option.count <= guests && option.capacity >= guests) options.push(option);
      return;
    }
    const type = types[index];
    visit(index + 1, option);
    for (let quantity = 1; quantity <= type.maxQuantity; quantity++) {
      visit(index + 1, {
        rooms: [...option.rooms, { roomId: type.roomId, quantity }],
        capacity: option.capacity + type.capacity * quantity,
        count: option.count + quantity,
        total: option.total === null || type.unitStayTotal === null ? null : option.total + type.unitStayTotal * quantity,
      });
    }
  };
  visit(0, { rooms: [], capacity: 0, count: 0, total: 0 });
  const priced = options.filter((option) => option.total !== null);
  const pool = priced.length ? priced : options;
  const [best] = [...pool].sort((a, b) => (a.total ?? 0) - (b.total ?? 0) || a.count - b.count || compareRoomPicks(a.rooms, b.rooms));
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
    expect(chooseAllocation([room('r_double', 2, 1, 1200000), room('r_family', 3, 1, 1440000)], 5)).toEqual({
      rooms: [
        { roomId: 'r_double', quantity: 1 },
        { roomId: 'r_family', quantity: 1 },
      ],
      total: 2640000,
    });
  });

  it('prefers the cheapest cover, then fewer rooms, then the lowest room ids', () => {
    expect(chooseAllocation([room('a', 4, 1, 1000), room('b', 2, 2, 300)], 4)?.rooms).toEqual([{ roomId: 'b', quantity: 2 }]);
    expect(chooseAllocation([room('a', 4, 1, 600), room('b', 2, 2, 300)], 4)?.rooms).toEqual([{ roomId: 'a', quantity: 1 }]);
    expect(chooseAllocation([room('b', 2, 1, 500), room('a', 2, 1, 500)], 2)?.rooms).toEqual([{ roomId: 'a', quantity: 1 }]);
  });

  it('uses a fully priced option before any on-request one', () => {
    expect(chooseAllocation([room('a', 2, 1, null), room('b', 1, 2, 300)], 2)).toEqual({ rooms: [{ roomId: 'b', quantity: 2 }], total: 600 });
  });

  it('falls back to the fewest rooms on request when nothing is fully priced', () => {
    expect(chooseAllocation([room('a', 1, 2, 100), room('b', 3, 1, null)], 3)).toEqual({ rooms: [{ roomId: 'b', quantity: 1 }], total: null });
  });

  it('returns null when no combination covers the party', () => {
    expect(chooseAllocation([room('a', 2, 1, 100), room('b', 2, 1, 100)], 5)).toBeNull();
    expect(chooseAllocation([room('a', 2, 0, 100)], 2)).toBeNull();
    expect(chooseAllocation([], 1)).toBeNull();
  });

  it('matches brute force on random small inputs', () => {
    const random = seededRandom(20261110);
    const pick = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    for (let run = 0; run < 500; run++) {
      const candidates = Array.from({ length: pick(1, 4) }, (_, index) =>
        room(`r${index}`, pick(1, 5), pick(0, 3), random() < 0.25 ? null : pick(1, 6) * 50),
      );
      const guests = pick(1, 8);
      expect({ candidates, guests, result: chooseAllocation(candidates, guests) }).toEqual({ candidates, guests, result: bruteForce(candidates, guests) });
    }
  });
});

describe('compareRoomPicks', () => {
  it('orders by room id, then quantity, then length', () => {
    expect(compareRoomPicks([{ roomId: 'a', quantity: 2 }], [{ roomId: 'b', quantity: 1 }])).toBeLessThan(0);
    expect(compareRoomPicks([{ roomId: 'a', quantity: 1 }], [{ roomId: 'a', quantity: 2 }])).toBeLessThan(0);
    expect(compareRoomPicks([{ roomId: 'a', quantity: 1 }, { roomId: 'b', quantity: 1 }], [{ roomId: 'a', quantity: 1 }])).toBeGreaterThan(0);
    expect(compareRoomPicks([{ roomId: 'a', quantity: 1 }], [{ roomId: 'a', quantity: 1 }])).toBe(0);
  });
});

describe('isSelectionFeasible', () => {
  const types = [room('r_double', 2, 1, 1200000), room('r_family', 3, 1, 1440000)];
  const both = [
    { roomId: 'r_double', quantity: 1 },
    { roomId: 'r_family', quantity: 1 },
  ];

  it('accepts a selection that covers the party within each max quantity', () => {
    expect(isSelectionFeasible(both, types, 5)).toBe(true);
  });

  it('rejects unknown types, too many units, too little capacity and more rooms than guests', () => {
    expect(isSelectionFeasible([{ roomId: 'r_other', quantity: 1 }], types, 2)).toBe(false);
    expect(isSelectionFeasible([{ roomId: 'r_double', quantity: 2 }], types, 4)).toBe(false);
    expect(isSelectionFeasible([{ roomId: 'r_double', quantity: 1 }], types, 3)).toBe(false);
    expect(isSelectionFeasible(both, types, 1)).toBe(false);
  });
});
```

- [x] **Step 2: Run it to confirm it fails.** `npx jest src/modules/hotel-availability/engine/room-allocation`. Expected: FAIL (`chooseAllocation` is not exported).

- [x] **Step 3: Implement.** Replace `engine/room-allocation.ts` with:

```ts
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
    if (a[index].quantity !== b[index].quantity) return a[index].quantity - b[index].quantity;
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
function cheapestCover(candidates: AllocationCandidate[], guests: number, unitCost: (candidate: AllocationCandidate) => Cents): Plan | null {
  const types = candidates
    .filter((candidate) => candidate.capacity > 0 && candidate.maxQuantity > 0)
    .sort((a, b) => compareIds(a.roomId, b.roomId));
  let table = Array.from({ length: guests + 1 }, () => Array.from({ length: guests + 1 }, (): Plan | undefined => undefined));
  table[0][0] = { cost: 0, rooms: [] };
  for (const type of types) {
    const next = table.map((row) => [...row]);
    for (let covered = 0; covered <= guests; covered++) {
      for (let used = 0; used < guests; used++) {
        const plan = table[covered][used];
        if (!plan) continue;
        for (let quantity = 1; quantity <= type.maxQuantity && used + quantity <= guests; quantity++) {
          const reach = Math.min(guests, covered + quantity * type.capacity);
          const candidate: Plan = {
            cost: plan.cost + unitCost(type) * quantity,
            rooms: [...plan.rooms, { roomId: type.roomId, quantity }],
          };
          if (isBetter(candidate, next[reach][used + quantity])) next[reach][used + quantity] = candidate;
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

export function chooseAllocation(candidates: AllocationCandidate[], guests: number): Allocation | null {
  const priced = cheapestCover(
    candidates.filter((candidate) => candidate.unitStayTotal !== null),
    guests,
    (candidate) => candidate.unitStayTotal ?? 0,
  );
  if (priced) return { rooms: priced.rooms, total: priced.cost };
  const onRequest = cheapestCover(candidates, guests, () => 0);
  return onRequest ? { rooms: onRequest.rooms, total: null } : null;
}

export function isSelectionFeasible(rooms: RoomPick[], candidates: AllocationCandidate[], guests: number): boolean {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.roomId, candidate]));
  let capacity = 0;
  let count = 0;
  for (const { roomId, quantity } of rooms) {
    const candidate = candidatesById.get(roomId);
    if (!candidate || candidate.capacity < 1 || quantity < 1 || quantity > candidate.maxQuantity) return false;
    capacity += candidate.capacity * quantity;
    count += quantity;
  }
  return count >= 1 && count <= guests && capacity >= guests;
}
```

- [x] **Step 4: Run all engine tests.** `npx jest src/modules/hotel-availability/engine`. Expected: `Tests: 26 passed`.

- [x] **Step 5: Lint and commit**

```powershell
npx eslint --fix src/modules/hotel-availability/engine
git add src/modules/hotel-availability/engine
git commit -m "feat(availability): add room allocation with brute-force-checked tie-breaks"
```

---

## Task 6: Error helpers and exception filter (TDD)

**Produces:** `util/availability.errors.ts` (`invalidInput`, `notFound`, `stayUnavailable`, `calendarConflict`, `roomIdsRequired`); `util/availability-exception.filter.ts` (`AvailabilityExceptionFilter`, `toErrorBody`).

- [x] **Step 1: Write the failing test** `util/availability-exception.filter.spec.ts`:

```ts
import { ArgumentsHost, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AvailabilityExceptionFilter, toErrorBody } from './availability-exception.filter';
import { invalidInput, stayUnavailable } from './availability.errors';

describe('toErrorBody', () => {
  it('keeps validation details and surfaces the first field', () => {
    const errors = [{ field: 'check_in', message: 'x' }];
    expect(toErrorBody(new BadRequestException({ message: 'بيانات الطلب غير صالحة', errors }), 400)).toEqual({
      statusCode: 400,
      code: 'INVALID_INPUT',
      message: 'بيانات الطلب غير صالحة',
      field: 'check_in',
      errors,
    });
  });

  it('keeps explicit codes and fields', () => {
    expect(toErrorBody(invalidInput('rooms', 'معرّف غرفة غير صالح لهذا الفندق'), 400)).toEqual({
      statusCode: 400,
      code: 'INVALID_INPUT',
      message: 'معرّف غرفة غير صالح لهذا الفندق',
      field: 'rooms',
    });
    expect(toErrorBody(stayUnavailable('rooms'), 409)).toMatchObject({ statusCode: 409, code: 'STAY_UNAVAILABLE', field: 'rooms' });
  });

  it('maps framework errors to codes with Arabic messages', () => {
    expect(toErrorBody(new UnauthorizedException(), 401)).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول كمسؤول' });
    expect(toErrorBody(new ThrottlerException(), 429)).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(toErrorBody(new NotFoundException('الفندق غير موجود'), 404)).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'الفندق غير موجود' });
  });

  it('hides unexpected errors behind INTERNAL_ERROR', () => {
    expect(toErrorBody(new Error('connection refused'), 500)).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'حدث خطأ غير متوقع، حاول مرة أخرى',
    });
  });
});

describe('AvailabilityExceptionFilter', () => {
  it('writes the status and body to the response', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
    new AvailabilityExceptionFilter().catch(stayUnavailable(), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, code: 'STAY_UNAVAILABLE' }));
  });
});
```

- [x] **Step 2: Run it to confirm it fails.** `npx jest src/modules/hotel-availability/util`. Expected: FAIL, missing modules.

- [x] **Step 3: Implement** `util/availability.errors.ts`:

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

export function invalidInput(field: string, message: string) {
  return new BadRequestException({ code: 'INVALID_INPUT', message, field });
}

export function notFound(message: string) {
  return new NotFoundException({ code: 'NOT_FOUND', message });
}

export function stayUnavailable(field?: 'rooms' | 'addons') {
  return new ConflictException({
    code: 'STAY_UNAVAILABLE',
    message: 'الغرف المختارة غير متاحة لهذه الإقامة',
    ...(field && { field }),
  });
}

export function calendarConflict() {
  return new ConflictException({
    code: 'CALENDAR_CONFLICT',
    message: 'تقويم الغرفة تغيّر منذ آخر تحميل؛ أعد تحميله ثم احفظ مرة أخرى',
  });
}

export function roomIdsRequired() {
  return new ConflictException({
    code: 'ROOM_IDS_REQUIRED',
    message: 'هذا الفندق يدير الغرف بالتقويم؛ عدّل الغرف بمعرّفاتها عبر rooms_write_mode=by_id',
  });
}
```

`util/availability-exception.filter.ts`:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

type ErrorBody = Record<string, unknown>;

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'INVALID_INPUT',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

// Guards and the framework answer in English; these codes always answer in Arabic.
const ARABIC_MESSAGES: Partial<Record<string, string>> = {
  UNAUTHENTICATED: 'يجب تسجيل الدخول كمسؤول',
  FORBIDDEN: 'غير مسموح بهذه العملية',
  RATE_LIMITED: 'طلبات كثيرة، حاول مرة أخرى بعد قليل',
  INTERNAL_ERROR: 'حدث خطأ غير متوقع، حاول مرة أخرى',
};

function firstErrorField(errors: unknown): string | undefined {
  if (!Array.isArray(errors)) return undefined;
  const first: unknown = errors[0];
  if (typeof first === 'object' && first !== null && 'field' in first && typeof first.field === 'string') {
    return first.field;
  }
  return undefined;
}

export function toErrorBody(exception: unknown, status: number): ErrorBody {
  const raw = exception instanceof HttpException ? exception.getResponse() : {};
  const body: ErrorBody = typeof raw === 'string' ? { message: raw } : { ...(raw as ErrorBody) };
  const code = typeof body.code === 'string' ? body.code : (CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : undefined));
  const result: ErrorBody = {
    ...body,
    statusCode: status,
    message: (code ? ARABIC_MESSAGES[code] : undefined) ?? body.message,
  };
  if (code) result.code = code;
  const field = body.field ?? firstErrorField(body.errors);
  if (field !== undefined) result.field = field;
  return result;
}

@Catch()
export class AvailabilityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AvailabilityExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    host.switchToHttp().getResponse<Response>().status(status).json(toErrorBody(exception, status));
  }
}
```

- [x] **Step 4: Run the tests.** `npx jest src/modules/hotel-availability`. Expected: `Tests: 31 passed`.

- [x] **Step 5: Lint and commit**

```powershell
npx eslint --fix src/modules/hotel-availability/util
git add src/modules/hotel-availability/util
git commit -m "feat(availability): add error codes and the availability exception filter"
```

---

## Task 7: Local fixtures and the verification harness

**Produces:** `npm run seed:availability` (local-only reset of two fixture hotels); `.tmp/availability-verify/harness.mjs` and `run.mjs`. Calendar fixtures are relative to Cairo today `T`: the main stay is `T+10`–`T+12`.

| Room (fixed id) | Capacity | USD / EGP base | Calendar |
| --- | --- | --- | --- |
| double `bbbbbbbb-0000-4000-8000-000000000001` | 2 | 100 / 5000 | T+10: 2 units; T+11: 1 unit, overrides 140 / 7000; T+12: 0 units, USD 150; T+16: 1 unit |
| family `…0002` | 3 | 150 / 7200 | T+10, T+11: 1 unit; T+17: 1 unit |
| suite `…0003` | 4 | 300 / none | T+10, T+11, T+14: 1 unit |
| legacy `…0004` (legacy hotel) | none | 80 / 4000 | none |

Upgrade `cccccccc-0000-4000-8000-000000000001`: USD 20, EGP 900. Managed hotel `aaaaaaaa-0000-4000-8000-000000000001` (`availability-test-hotel`, `calendar_managed_at` set); legacy hotel `…0002` (`availability-legacy-hotel`). Both are in `SHARM_EL_SHEIKH`.

- [x] **Step 1: Create `prisma/seed-hotel-availability.ts`**

```ts
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { Prisma, PrismaClient } from 'generated/prisma/client';
import { addDays, hotelToday } from 'src/modules/hotel-availability/engine/stay-dates';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is missing');
const { hostname } = new URL(url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname) || process.env.NODE_ENV === 'production') {
  throw new Error(`Refusing to write availability fixtures to ${hostname}: local databases only.`);
}

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

const HOTEL_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const LEGACY_HOTEL_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const DOUBLE_ROOM_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const FAMILY_ROOM_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const SUITE_ROOM_ID = 'bbbbbbbb-0000-4000-8000-000000000003';
const LEGACY_ROOM_ID = 'bbbbbbbb-0000-4000-8000-000000000004';
const UPGRADE_ADDON_ID = 'cccccccc-0000-4000-8000-000000000001';
const FIXTURE_HOTEL_IDS = [HOTEL_ID, LEGACY_HOTEL_ID];

// [room id, days after today in Cairo, available units, USD override, EGP override]
const CALENDAR: [string, number, number, string | null, string | null][] = [
  [DOUBLE_ROOM_ID, 10, 2, null, null],
  [DOUBLE_ROOM_ID, 11, 1, '140.00', '7000.00'],
  [DOUBLE_ROOM_ID, 12, 0, '150.00', null],
  [DOUBLE_ROOM_ID, 16, 1, null, null],
  [FAMILY_ROOM_ID, 10, 1, null, null],
  [FAMILY_ROOM_ID, 11, 1, null, null],
  [FAMILY_ROOM_ID, 17, 1, null, null],
  [SUITE_ROOM_ID, 10, 1, null, null],
  [SUITE_ROOM_ID, 11, 1, null, null],
  [SUITE_ROOM_ID, 14, 1, null, null],
];

const room = (id: string, capacity: number | null, usd: string, egp: string | null, en: string, ar: string) => ({
  id,
  capacity,
  price: usd,
  price_egp: egp,
  translations: {
    create: [
      { language: 'en' as const, name: en },
      { language: 'ar' as const, name: ar },
    ],
  },
});

const hotelTranslations = (en: string, ar: string) => ({
  create: [
    { language: 'en' as const, name: en, description: `${en} for local availability tests`, Facilities: ['Pool'] },
    { language: 'ar' as const, name: ar, description: `${ar} لاختبارات التوافر المحلية`, Facilities: ['مسبح'] },
  ],
});

async function removeFixtures(tx: Prisma.TransactionClient) {
  const inFixtureHotels = { hotel_id: { in: FIXTURE_HOTEL_IDS } };
  const roomIds = (await tx.room.findMany({ where: inFixtureHotels, select: { id: true } })).map((r) => r.id);
  if (roomIds.length) {
    await tx.$executeRaw`DELETE FROM room_calendar_days WHERE room_id IN (${Prisma.join(roomIds)})`;
    await tx.roomTranslation.deleteMany({ where: { room_id: { in: roomIds } } });
    await tx.room.deleteMany({ where: { id: { in: roomIds } } });
  }
  const addonIds = (await tx.hotelAddon.findMany({ where: inFixtureHotels, select: { id: true } })).map((a) => a.id);
  if (addonIds.length) {
    await tx.hotelAddonTranslation.deleteMany({ where: { addon_id: { in: addonIds } } });
    await tx.hotelAddon.deleteMany({ where: { id: { in: addonIds } } });
  }
  await tx.hotelTranslation.deleteMany({ where: inFixtureHotels });
  await tx.asset.deleteMany({ where: { hotelId: { in: FIXTURE_HOTEL_IDS } } });
  await tx.hotels.deleteMany({ where: { id: { in: FIXTURE_HOTEL_IDS } } });
}

async function main() {
  const today = hotelToday();
  await prisma.$transaction(
    async (tx) => {
      await removeFixtures(tx);
      await tx.hotels.create({
        data: {
          id: HOTEL_ID,
          slug: 'availability-test-hotel',
          destination: 'SHARM_EL_SHEIKH',
          initial_price: '100.00',
          initial_price_egp: '5000.00',
          stars: 'FOUR',
          rating: 'UNRATED',
          calendar_managed_at: new Date(),
          translations: hotelTranslations('Availability Test Hotel', 'فندق اختبار التوافر'),
          rooms: {
            create: [
              room(DOUBLE_ROOM_ID, 2, '100.00', '5000.00', 'Double Room', 'غرفة مزدوجة'),
              room(FAMILY_ROOM_ID, 3, '150.00', '7200.00', 'Family Room', 'غرفة عائلية'),
              room(SUITE_ROOM_ID, 4, '300.00', null, 'Suite', 'جناح'),
            ],
          },
          addons: {
            create: [
              {
                id: UPGRADE_ADDON_ID,
                price: '20.00',
                price_egp: '900.00',
                translations: {
                  create: [
                    { language: 'en', name: 'Sea view upgrade', description: 'Upgrade to a sea view room' },
                    { language: 'ar', name: 'ترقية لإطلالة بحرية', description: 'ترقية الغرفة إلى إطلالة على البحر' },
                  ],
                },
              },
            ],
          },
        },
      });
      await tx.hotels.create({
        data: {
          id: LEGACY_HOTEL_ID,
          slug: 'availability-legacy-hotel',
          destination: 'SHARM_EL_SHEIKH',
          initial_price: '80.00',
          initial_price_egp: '4000.00',
          stars: 'THREE',
          rating: 'UNRATED',
          translations: hotelTranslations('Legacy Catalog Hotel', 'فندق الكتالوج القديم'),
          rooms: { create: [room(LEGACY_ROOM_ID, null, '80.00', '4000.00', 'Standard Room', 'غرفة قياسية')] },
        },
      });
      const rows = CALENDAR.map(
        ([roomId, offset, units, usd, egp]) =>
          Prisma.sql`(${roomId}, ${addDays(today, offset)}, ${units}, ${usd}, ${egp}, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      );
      await tx.$executeRaw`
        INSERT INTO room_calendar_days (room_id, stay_date, available_units, rate_override_usd, rate_override_egp, created_at, updated_at)
        VALUES ${Prisma.join(rows)}
      `;
    },
    { timeout: 20_000 },
  );
  console.log(`Availability fixtures ready. Cairo today ${today}; main stay ${addDays(today, 10)} to ${addDays(today, 12)}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [x] **Step 2: Add the npm script.** In `package.json` `scripts`, after `"seed": "tsx prisma/seed.ts",` add:

```json
    "seed:availability": "tsx prisma/seed-hotel-availability.ts",
```

- [x] **Step 3: Run the seed twice (idempotency) and check the refusal**

```powershell
. .\.tmp\local-session.ps1
npm run seed:availability
npm run seed:availability
Invoke-LocalSql "SELECT COUNT(*) AS rooms FROM room WHERE hotel_id LIKE 'aaaaaaaa-%'; SELECT COUNT(*) AS nights FROM room_calendar_days WHERE room_id LIKE 'bbbbbbbb-%';"
$saved = $env:DATABASE_URL; $env:DATABASE_URL = 'mysql://x:y@example.com:3306/railway'; npm run seed:availability; $env:DATABASE_URL = $saved
```

Expected: both runs print `Availability fixtures ready…`; counts are `rooms 4` and `nights 10`; the last run fails with `Refusing to write availability fixtures to example.com`.

- [x] **Step 4: Create `.tmp/availability-verify/harness.mjs`** (not committed)

```js
import 'dotenv/config';
import { execSync } from 'node:child_process';

export const BASE_URL = 'http://localhost:3000';

export const IDS = {
  hotel: 'aaaaaaaa-0000-4000-8000-000000000001',
  legacyHotel: 'aaaaaaaa-0000-4000-8000-000000000002',
  double: 'bbbbbbbb-0000-4000-8000-000000000001',
  family: 'bbbbbbbb-0000-4000-8000-000000000002',
  suite: 'bbbbbbbb-0000-4000-8000-000000000003',
  legacyRoom: 'bbbbbbbb-0000-4000-8000-000000000004',
  upgrade: 'cccccccc-0000-4000-8000-000000000001',
  missing: 'dddddddd-0000-4000-8000-000000000000',
};

const FIXTURE_SLUGS = ['availability-legacy-hotel', 'availability-test-hotel'];
const cairoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const day = (offset) => new Date(Date.parse(`${cairoToday}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

const results = [];
let adminToken = '';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function send(method, path, { body, form, auth = false, retryOn429 = true } = {}) {
  const headers = auth ? { Authorization: `Bearer ${adminToken}` } : {};
  let payload;
  if (form) {
    payload = new FormData();
    for (const [key, value] of Object.entries(form)) payload.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  for (let attempt = 0; ; attempt++) {
    await sleep(250);
    const response = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
    if (response.status === 429 && retryOn429 && attempt < 20) {
      await sleep(3000);
      continue;
    }
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: response.status, body: json, headers: response.headers };
  }
}

export function check(endpoint, name, expected, passed, actual) {
  results.push({ endpoint, name, expected, passed: Boolean(passed) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${endpoint} | ${name}`);
  if (!passed) console.log(`     expected: ${expected}\n     actual:   ${JSON.stringify(actual)}`);
}

export function checkError(endpoint, name, response, status, code, field) {
  const body = response.body ?? {};
  const passed =
    response.status === status && body.statusCode === status && body.code === code && typeof body.message === 'string' && (field === undefined || body.field === field);
  check(endpoint, name, `${status} ${code}${field ? ` (field ${field})` : ''}`, passed, { status: response.status, body });
}

export function reseed() {
  execSync('npm run seed:availability', { stdio: 'inherit' });
}

export async function prepare() {
  reseed();
  const catalog = await send('GET', '/hotel?destination=SHARM_EL_SHEIKH&limit=100');
  const slugs = (catalog.body?.data ?? []).map((hotel) => hotel.slug).sort();
  if (JSON.stringify(slugs) !== JSON.stringify(FIXTURE_SLUGS)) {
    throw new Error(`The server on ${BASE_URL} is not on the fresh local database (Sharm hotels: ${slugs.join(', ') || 'none'}). Stopping before any write.`);
  }
  const login = await send('POST', '/auth/login', { body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
  if (login.status !== 201 || typeof login.body?.token !== 'string') throw new Error(`Admin login failed with status ${login.status}`);
  adminToken = login.body.token;
}

export function report() {
  const failed = results.filter((result) => !result.passed);
  console.log('\n| Endpoint | الحالة | المتوقع | النتيجة |\n|---|---|---|---|');
  for (const result of results) console.log(`| \`${result.endpoint}\` | ${result.name} | ${result.expected} | ${result.passed ? '✅' : '❌'} |`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}
```

`.tmp/availability-verify/run.mjs`:

```js
import { prepare, report } from './harness.mjs';

const ALL = ['capacity', 'rooms', 'calendar', 'stay', 'errors'];
const requested = process.argv.slice(2);
const sections = requested.includes('all') ? ALL : requested;
if (!sections.length || sections.some((name) => !ALL.includes(name))) {
  console.error(`Usage: node .tmp/availability-verify/run.mjs <${ALL.join('|')}|all>...`);
  process.exit(1);
}
await prepare();
for (const name of sections) {
  const { default: run } = await import(`./${name}.mjs`);
  console.log(`\n## ${name}`);
  await run();
}
report();
```

Every section file reseeds first, so sections are independent. The `prepare()` slug check stops the run before any write if port 3000 is served by anything other than the local database.

- [x] **Step 5: Build and commit**

Run `npm run build`. Expected: exit 0.

```powershell
git add prisma/seed-hotel-availability.ts package.json
git commit -m "chore(availability): add local-only availability fixtures"
```

---

## Task 8: Room capacity in room writes

**Produces:** `capacityField` and `MAX_ROOM_CAPACITY` in `src/modules/utils/capacity.util.ts`; `capacity` accepted by `POST /hotel` rows, legacy `PATCH /hotel/:id` rows, and `POST`/`PATCH /hotel/:hotelId/room`.

- [x] **Step 1: Create `src/modules/utils/capacity.util.ts`**

```ts
import { z } from 'zod';

export const MAX_ROOM_CAPACITY = 50;

const CAPACITY_MESSAGE = `يجب أن تكون سعة الغرفة عددًا صحيحًا من 1 إلى ${MAX_ROOM_CAPACITY}`;

// Guests one unit sleeps. Multipart rows may send it as a string; '' and null clear it.
export const capacityField = z.unknown().transform((value, ctx): number | null => {
  if (value === null || value === '') return null;
  const capacity = typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  if (typeof capacity === 'number' && Number.isInteger(capacity) && capacity >= 1 && capacity <= MAX_ROOM_CAPACITY) {
    return capacity;
  }
  ctx.addIssue({ code: 'custom', message: CAPACITY_MESSAGE });
  return z.NEVER;
});
```

- [x] **Step 2: Room module.** In `src/modules/room/util/room.validation.ts`, add `import { capacityField } from 'src/modules/utils/capacity.util';` and add `capacity: capacityField.optional(),` after `price_egp` in both `createRoomValidationSchema` and `updateRoomValidationSchema`. In `src/modules/room/types/room.dto.ts`, add `capacity?: number | null;` after `price_egp` in `CreateRoomDto`. `RoomService` needs no change: it spreads the remaining fields into `data`.

In `src/modules/room/swagger/room.swagger.ts`, add this property after `price_egp` in both the create and update `ApiBody` schemas:

```ts
          capacity: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            nullable: true,
            example: 2,
            description:
              'عدد الضيوف لكل وحدة من هذا النوع (اختياري). null أو نص فارغ يمسحها، والغرفة بلا سعة لا تظهر في البحث بالتواريخ',
          },
```

- [x] **Step 3: Hotel rows.** In `src/modules/hotel/util/hotel.validation.ts`, add `import { capacityField } from 'src/modules/utils/capacity.util';` and in `roomInputSchema` add `capacity: capacityField.optional(),` after `price_egp: priceField,`. In `src/modules/hotel/types/hotel.dto.ts` add `capacity?: number | null;` after `price_egp` in `RoomInput`. In `src/modules/hotel/swagger/hotel.swagger.ts`, `CreateHotelSwagger` `rooms` property, replace the example and description with:

```ts
            example:
              '[{"price":150,"price_egp":1500,"capacity":2,"translations":[{"language":"ar","name":"غرفة ديلوكس","description":"غرفة فاخرة مع إطلالة على البحر"},{"language":"en","name":"Deluxe Room","description":"Luxury room with sea view"}]}]',
            description:
              'JSON string - مصفوفة الغرف (اختياري). كل غرفة تحتوي: price, price_egp, capacity (عدد الضيوف لكل وحدة 1-50، اختياري), translations[]',
```

- [x] **Step 4: Build.** `npm run build`. Expected: exit 0.

- [x] **Step 5: Start the local server.** In the background run `powershell -NoProfile -ExecutionPolicy Bypass -File .\.tmp\start-local-server.ps1`, and wait for `Nest application successfully started`. Watch mode keeps it current for later tasks; reuse it if it is still running.

- [x] **Step 6: Write `.tmp/availability-verify/capacity.mjs`**

```js
import { IDS, check, reseed, send } from './harness.mjs';

const translations = [{ language: 'en', name: 'Capacity Room' }];
const roomPath = (roomId) => `/hotel/${IDS.legacyHotel}/room${roomId ? `/${roomId}` : ''}`;

function checkValidation(endpoint, name, response, field) {
  const passed = response.status === 400 && (response.body?.errors ?? []).some((error) => error.field === field);
  check(endpoint, name, `400, errors[].field ${field}`, passed, { status: response.status, body: response.body });
}

export default async function capacity() {
  reseed();
  const create = 'POST /hotel/:hotelId/room';
  const update = 'PATCH /hotel/:hotelId/room/:id';

  const created = await send('POST', roomPath(), { auth: true, body: { price: 50, price_egp: 2500, capacity: 2, translations } });
  check(create, 'capacity 2', '201, capacity 2', created.status === 201 && created.body?.capacity === 2, created.body);
  const roomId = created.body?.id;

  const plain = await send('POST', roomPath(), { auth: true, body: { price: 50, translations } });
  check(create, 'no capacity', '201, capacity null', plain.status === 201 && plain.body?.capacity === null, plain.body);
  const noToken = await send('POST', roomPath(), { body: { price: 50, capacity: 2, translations } });
  check(create, 'no token', '401', noToken.status === 401, noToken.status);

  const fromString = await send('PATCH', roomPath(roomId), { auth: true, body: { capacity: '3' } });
  check(update, 'capacity "3"', '200, capacity 3', fromString.status === 200 && fromString.body?.capacity === 3, fromString.body);
  const untouched = await send('PATCH', roomPath(roomId), { auth: true, body: { price: 60 } });
  check(update, 'capacity omitted', '200, capacity stays 3', untouched.status === 200 && untouched.body?.capacity === 3, untouched.body);
  const cleared = await send('PATCH', roomPath(roomId), { auth: true, body: { capacity: null } });
  check(update, 'capacity null', '200, capacity null', cleared.status === 200 && cleared.body?.capacity === null, cleared.body);

  for (const bad of [0, 51, 2.5, -1, 'abc', true]) {
    checkValidation(update, `capacity ${JSON.stringify(bad)}`, await send('PATCH', roomPath(roomId), { auth: true, body: { capacity: bad } }), 'capacity');
  }
}
```

- [x] **Step 7: Run it.** `. .\.tmp\local-session.ps1; node .tmp/availability-verify/run.mjs capacity`. Expected: `12/12 passed`. On a failure, fix the code and rerun.

- [x] **Step 8: Lint and commit**

```powershell
npx eslint --fix src/modules/utils/capacity.util.ts src/modules/room/util/room.validation.ts src/modules/room/types/room.dto.ts src/modules/room/swagger/room.swagger.ts src/modules/hotel/util/hotel.validation.ts src/modules/hotel/types/hotel.dto.ts src/modules/hotel/swagger/hotel.swagger.ts
git add src/modules/utils/capacity.util.ts src/modules/room src/modules/hotel
git commit -m "feat(rooms): accept room capacity in hotel and room writes"
```

---

## Task 9: Stable room IDs on `PATCH /hotel/:id`

**Produces:** `rooms_write_mode=by_id` and `delete_room_ids`; soft-deleting legacy replacement; `409 ROOM_IDS_REQUIRED`; `HOTEL_CATALOG_INCLUDE` and `HotelCatalogEntry` in `src/modules/hotel/util/hotel-catalog.ts`; `AvailabilityExceptionFilter` on hotel `update`.

- [x] **Step 1: Create `src/modules/hotel/util/hotel-catalog.ts`**

```ts
import { Prisma } from 'generated/prisma/client';

export const HOTEL_CATALOG_INCLUDE = {
  assets: true,
  translations: true,
  rooms: { where: { is_deleted: false }, include: { translations: true } },
  addons: { where: { is_deleted: false }, include: { translations: true } },
} satisfies Prisma.hotelsInclude;

export type HotelCatalogEntry = Prisma.hotelsGetPayload<{ include: typeof HOTEL_CATALOG_INCLUDE }>;
```

- [x] **Step 2: DTOs.** In `src/modules/hotel/types/hotel.dto.ts`, add after `RoomInput`:

```ts
export type RoomUpdateInput = {
  id: string;
  price?: Prisma.Decimal;
  price_egp?: Prisma.Decimal | null;
  capacity?: number | null;
  translations?: RoomInput['translations'];
};
```

Replace `UpdateHotelRequest` with:

```ts
export type UpdateHotelRequest = Omit<UpdateHotelDto, 'rooms'> & {
  rooms?: (RoomInput | RoomUpdateInput)[];
  rooms_write_mode?: 'by_id';
  delete_room_ids?: string[];
  deleteAssetIds?: string[];
};
```

- [x] **Step 3: Validation (`src/modules/hotel/util/hotel.validation.ts`).** Move the `uuidLike` block (its two comment lines and the declaration) to just below the imports, because the new row schema uses it. Replace `roomInputSchema` with:

```ts
const roomTranslationsSchema = z
  .array(
    z.object({
      language: z.enum(['ar', 'en']),
      name: z.string().min(2).max(255),
      description: z.string().min(1).optional(),
    }),
  )
  .min(1)
  .max(2);

const roomInputSchema = z.object({
  price: priceField,
  price_egp: priceField,
  capacity: capacityField.optional(),
  translations: roomTranslationsSchema,
});

// by_id rows: a row with an id edits that room type; a row without one creates a type.
const roomUpdateRowSchema = z.object({
  id: uuidLike.toLowerCase(),
  price: priceField.optional(),
  price_egp: nullablePriceField.optional(),
  capacity: capacityField.optional(),
  translations: roomTranslationsSchema.optional(),
});
```

Add after `addonsField`:

```ts
function parseJsonArray(value: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const roomWriteRowsField = z.string().transform((value, ctx) => {
  const rows = parseJsonArray(value);
  if (!rows) {
    ctx.addIssue({ code: 'custom', message: 'rooms يجب أن تكون مصفوفة JSON' });
    return z.NEVER;
  }
  return rows.map((row, index) => {
    const schema = typeof row === 'object' && row !== null && 'id' in row ? roomUpdateRowSchema : roomInputSchema;
    const result = schema.safeParse(row);
    if (result.success) return result.data;
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: 'custom', path: [index, ...issue.path], message: issue.message });
    }
    return z.NEVER;
  });
});

const deleteRoomIdsField = z.string().transform((value, ctx) => {
  const result = z.array(uuidLike.toLowerCase()).safeParse(parseJsonArray(value));
  if (result.success) return result.data;
  ctx.addIssue({ code: 'custom', message: 'delete_room_ids يجب أن تكون مصفوفة JSON من معرّفات الغرف' });
  return z.NEVER;
});
```

In `updateHotelValidationSchema`, change `export const updateHotelValidationSchema = z.object({` to `export const updateHotelValidationSchema = z` and `.object({`. Replace `rooms: roomsField,` with:

```ts
    rooms: roomWriteRowsField.optional(),
    rooms_write_mode: z
      .enum(['by_id', ''], 'القيمة المسموحة لـ rooms_write_mode هي by_id فقط')
      .transform((mode) => mode || undefined)
      .optional(),
    delete_room_ids: deleteRoomIdsField.optional(),
```

Replace the closing `});` of that schema with:

```ts
  })
  .transform((hotel, ctx) => {
    const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [field], message });
    const editedIds = (hotel.rooms ?? []).flatMap((row) => ('id' in row ? [row.id] : []));
    const deleteIds = hotel.delete_room_ids ?? [];
    if (hotel.rooms_write_mode !== 'by_id') {
      if (hotel.delete_room_ids !== undefined) issue('delete_room_ids', 'delete_room_ids يتطلب rooms_write_mode=by_id');
      if (editedIds.length) issue('rooms_write_mode', 'تعديل الغرف بمعرّفاتها يتطلب rooms_write_mode=by_id');
      return hotel;
    }
    if (new Set(editedIds).size !== editedIds.length) issue('rooms', 'لا يجوز تكرار معرّف الغرفة');
    if (new Set(deleteIds).size !== deleteIds.length) issue('delete_room_ids', 'لا يجوز تكرار معرّف الغرفة');
    if (deleteIds.some((roomId) => editedIds.includes(roomId))) issue('delete_room_ids', 'لا يمكن تعديل غرفة وحذفها في الطلب نفسه');
    return hotel;
  });
```

`POST /hotel` keeps `roomsField`. Object-level `.transform` only runs once every field is valid.

- [x] **Step 4: Service (`src/modules/hotel/hotel.service.ts`).**
  - Imports: import `RoomInput` and `RoomUpdateInput` with the existing DTOs; add `import { HOTEL_CATALOG_INCLUDE } from './util/hotel-catalog';` and `import { invalidInput, roomIdsRequired } from '../hotel-availability/util/availability.errors';`. Below the imports add:

```ts
type RoomWriteRequest = Pick<UpdateHotelRequest, 'rooms' | 'rooms_write_mode' | 'delete_room_ids'>;

const isExistingRoom = (row: RoomInput | RoomUpdateInput): row is RoomUpdateInput => 'id' in row;
```

  - Replace all four inline catalog includes (in `create`, `findAll`, `findOne` and the end of `update`) with `include: HOTEL_CATALOG_INCLUDE,`.
  - In `create`, replace the body of `for (const room of rooms) { … }` with `await this.createRoom(tx, hotelId, room);`.
  - In `update`, destructure `rooms_write_mode` and `delete_room_ids` alongside `rooms`, so they never reach `tx.hotels.update`. Make this the first statement inside the transaction callback:

```ts
      if (rooms !== undefined || delete_room_ids !== undefined) {
        await this.lockRoomChanges(tx, id, { rooms, rooms_write_mode, delete_room_ids });
      }
```

  - Replace the whole `if (rooms !== undefined) { … }` block (the hard-delete and recreate) with:

```ts
      if (rooms_write_mode === 'by_id') {
        await this.writeRoomsById(tx, id, rooms ?? [], delete_room_ids ?? []);
      } else if (rooms !== undefined) {
        await this.replaceRooms(tx, id, rooms.filter((row): row is RoomInput => !isExistingRoom(row)));
      }
```

  - Add these methods after `remove`:

```ts
  // Room writes lock the hotel row first; calendar writes do the same, so the two never deadlock.
  private async lockRoomChanges(tx: Prisma.TransactionClient, hotelId: string, request: RoomWriteRequest) {
    const [hotel] = await tx.$queryRaw<{ calendar_managed_at: Date | null }[]>`
      SELECT calendar_managed_at FROM hotels WHERE id = ${hotelId} FOR UPDATE
    `;
    if (request.rooms_write_mode !== 'by_id') {
      if (hotel?.calendar_managed_at) throw roomIdsRequired();
      return;
    }
    const editedIds = (request.rooms ?? []).filter(isExistingRoom).map((row) => row.id);
    await this.assertActiveRooms(tx, hotelId, editedIds, 'rooms');
    await this.assertActiveRooms(tx, hotelId, request.delete_room_ids ?? [], 'delete_room_ids');
  }

  private async assertActiveRooms(tx: Prisma.TransactionClient, hotelId: string, roomIds: string[], field: string) {
    if (!roomIds.length) return;
    const found = await tx.room.count({ where: { id: { in: roomIds }, hotel_id: hotelId, is_deleted: false } });
    if (found !== roomIds.length) throw invalidInput(field, 'معرّف غرفة غير صالح لهذا الفندق');
  }

  private async replaceRooms(tx: Prisma.TransactionClient, hotelId: string, rooms: RoomInput[]) {
    await tx.room.updateMany({ where: { hotel_id: hotelId, is_deleted: false }, data: { is_deleted: true } });
    for (const room of rooms) await this.createRoom(tx, hotelId, room);
  }

  private async writeRoomsById(tx: Prisma.TransactionClient, hotelId: string, rows: (RoomInput | RoomUpdateInput)[], deleteIds: string[]) {
    for (const row of rows) {
      if (isExistingRoom(row)) await this.updateRoom(tx, row);
      else await this.createRoom(tx, hotelId, row);
    }
    if (deleteIds.length) {
      await tx.room.updateMany({ where: { id: { in: deleteIds }, hotel_id: hotelId }, data: { is_deleted: true } });
    }
  }

  private async createRoom(tx: Prisma.TransactionClient, hotelId: string, room: RoomInput) {
    const roomId = randomUUID();
    const { translations, ...fields } = room;
    await tx.room.create({ data: { id: roomId, hotel_id: hotelId, ...fields } });
    for (const translation of translations) {
      await tx.roomTranslation.create({ data: { room_id: roomId, ...translation } });
    }
  }

  private async updateRoom(tx: Prisma.TransactionClient, { id, translations, ...fields }: RoomUpdateInput) {
    await tx.room.update({ where: { id }, data: fields });
    for (const translation of translations ?? []) {
      await tx.roomTranslation.upsert({
        where: { room_id_language: { room_id: id, language: translation.language } },
        update: { name: translation.name, description: translation.description },
        create: { room_id: id, ...translation },
      });
    }
  }
```

- [x] **Step 5: Controller and Swagger.** In `hotel.controller.ts`, import `UseFilters` from `@nestjs/common` and `AvailabilityExceptionFilter` from `'../hotel-availability/util/availability-exception.filter'`; add `@UseFilters(AvailabilityExceptionFilter)` above `@UpdateHotelSwagger()`. In `UpdateHotelSwagger`, replace the `rooms` property and add two properties before `addons`:

```ts
          rooms_write_mode: {
            type: 'string',
            enum: ['by_id'],
            description:
              'by_id: تصبح rooms مصفوفة upsert (صف فيه id يعدّل تلك الغرفة، وصف بدون id ينشئ غرفة، والغرف غير المذكورة تبقى). بدونها: إرسال rooms يستبدل كل الغرف، ويُرفض بـ 409 ROOM_IDS_REQUIRED إذا بدأ الفندق استخدام التقويم',
          },
          rooms: {
            type: 'string',
            example:
              '[{"id":"9b2f1c7e-4d3a-4f6b-8a1e-2c5d7f9e0a13","capacity":3,"translations":[{"language":"en","name":"Family Room"}]},{"price":150,"price_egp":1500,"capacity":2,"translations":[{"language":"ar","name":"غرفة ديلوكس"}]}]',
            description:
              'JSON string - الغرف (اختياري). صف بدون id يحتاج price, price_egp, translations ويقبل capacity. صف فيه id (مع by_id فقط) كل حقوله اختيارية: price, price_egp, capacity, translations',
          },
          delete_room_ids: {
            type: 'string',
            example: '["9b2f1c7e-4d3a-4f6b-8a1e-2c5d7f9e0a13"]',
            description: 'JSON string - معرّفات غرف لأرشفتها (يتطلب rooms_write_mode=by_id)',
          },
```

Add `ApiResponse({ status: 409, description: 'ROOM_IDS_REQUIRED: استبدال الغرف بدون by_id لفندق يستخدم التقويم' }),` before the 404 response.

- [x] **Step 6: Build.** `npm run build`. Expected: exit 0.

- [x] **Step 7: Write `.tmp/availability-verify/rooms.mjs`**

```js
import { IDS, check, checkError, reseed, send } from './harness.mjs';

const endpoint = 'PATCH /hotel/:id';
const managed = `/hotel/${IDS.hotel}`;
const legacy = `/hotel/${IDS.legacyHotel}`;
const newRoom = { price: 80, price_egp: 4000, capacity: 2, translations: [{ language: 'en', name: 'Garden Room' }] };
const roomIds = (response) => (response.body?.rooms ?? []).map((room) => room.id).sort();
const patch = (path, form, auth = true) => send('PATCH', path, { auth, form });

export default async function rooms() {
  reseed();
  const originals = [IDS.double, IDS.family, IDS.suite];

  const renamed = await patch(managed, { rooms_write_mode: 'by_id', rooms: [{ id: IDS.double, translations: [{ language: 'en', name: 'Double Deluxe' }] }] });
  const double = renamed.body?.rooms?.find((room) => room.id === IDS.double);
  check(endpoint, 'by_id rename', '200, same ids, new name', renamed.status === 200 && JSON.stringify(roomIds(renamed)) === JSON.stringify(originals) && double?.translations?.some((t) => t.language === 'en' && t.name === 'Double Deluxe'), renamed.body);

  const edited = await patch(managed, { rooms_write_mode: 'by_id', rooms: [{ id: IDS.family, capacity: '4' }] });
  check(endpoint, 'by_id capacity edit', '200, family capacity 4', edited.status === 200 && edited.body?.rooms?.find((room) => room.id === IDS.family)?.capacity === 4, edited.body);

  const created = await patch(managed, { rooms_write_mode: 'by_id', rooms: [newRoom] });
  check(endpoint, 'by_id create', '200, 4 rooms incl. originals', created.status === 200 && roomIds(created).length === 4 && originals.every((id) => roomIds(created).includes(id)), created.body);

  const deleted = await patch(managed, { rooms_write_mode: 'by_id', delete_room_ids: [IDS.suite] });
  check(endpoint, 'by_id delete', '200, suite gone', deleted.status === 200 && roomIds(deleted).length === 3 && !roomIds(deleted).includes(IDS.suite), deleted.body);
  const archived = await send('GET', `/hotel/${IDS.hotel}/room/${IDS.suite}`);
  check('GET /hotel/:hotelId/room/:id', 'archived room', '404', archived.status === 404, archived.status);

  const invalid = [
    ['unknown id', { rooms_write_mode: 'by_id', rooms: [{ id: IDS.missing, capacity: 2 }] }, 'rooms'],
    ['other hotel room id', { rooms_write_mode: 'by_id', rooms: [{ id: IDS.legacyRoom, capacity: 2 }] }, 'rooms'],
    ['deleted room id', { rooms_write_mode: 'by_id', rooms: [{ id: IDS.suite, capacity: 2 }] }, 'rooms'],
    ['delete unknown id', { rooms_write_mode: 'by_id', delete_room_ids: [IDS.missing] }, 'delete_room_ids'],
    ['duplicate ids', { rooms_write_mode: 'by_id', rooms: [{ id: IDS.double }, { id: IDS.double }] }, 'rooms'],
    ['edit and delete one id', { rooms_write_mode: 'by_id', rooms: [{ id: IDS.double }], delete_room_ids: [IDS.double] }, 'delete_room_ids'],
    ['delete without by_id', { delete_room_ids: [IDS.double] }, 'delete_room_ids'],
    ['ids without by_id', { rooms: [{ id: IDS.double, capacity: 2 }] }, 'rooms_write_mode'],
    ['unknown mode', { rooms_write_mode: 'replace', rooms: [newRoom] }, 'rooms_write_mode'],
    ['malformed rooms json', { rooms_write_mode: 'by_id', rooms: '{oops' }, 'rooms'],
    ['bad capacity in a row', { rooms_write_mode: 'by_id', rooms: [{ id: IDS.double, capacity: 0 }] }, 'rooms.0.capacity'],
  ];
  for (const [name, form, field] of invalid) checkError(endpoint, name, await patch(managed, form), 400, 'INVALID_INPUT', field);
  const afterInvalid = await send('GET', managed);
  check('GET /hotel/:id', 'rejected writes changed nothing', 'same room ids', JSON.stringify(roomIds(afterInvalid)) === JSON.stringify(roomIds(deleted)), roomIds(afterInvalid));

  const before = await send('GET', managed);
  checkError(endpoint, 'legacy rooms on a calendar hotel', await patch(managed, { stars: 'FIVE', rooms: [newRoom] }), 409, 'ROOM_IDS_REQUIRED');
  const after = await send('GET', managed);
  check('GET /hotel/:id', 'ROOM_IDS_REQUIRED changed nothing', 'same stars and rooms', after.body?.stars === before.body?.stars && JSON.stringify(roomIds(after)) === JSON.stringify(roomIds(before)), { before: before.body?.stars, after: after.body?.stars });

  const contentOnly = await patch(managed, { stars: 'THREE' });
  check(endpoint, 'legacy edit without rooms', '200, stars THREE', contentOnly.status === 200 && contentOnly.body?.stars === 'THREE', contentOnly.body);

  const replaced = await patch(legacy, { rooms: [newRoom] });
  check(endpoint, 'legacy replacement without calendar', '200, one new room', replaced.status === 200 && roomIds(replaced).length === 1 && !roomIds(replaced).includes(IDS.legacyRoom) && replaced.body?.rooms?.[0]?.capacity === 2, replaced.body);
  const oldRoom = await send('GET', `/hotel/${IDS.legacyHotel}/room/${IDS.legacyRoom}`);
  check('GET /hotel/:hotelId/room/:id', 'replaced room archived', '404', oldRoom.status === 404, oldRoom.status);

  checkError(endpoint, 'no token', await patch(managed, { stars: 'TWO' }, false), 401, 'UNAUTHENTICATED');
  checkError(endpoint, 'unknown hotel', await patch(`/hotel/${IDS.missing}`, { stars: 'TWO' }), 404, 'NOT_FOUND');
}
```

- [x] **Step 8: Run `rooms` and recheck `capacity`.** `. .\.tmp\local-session.ps1; node .tmp/availability-verify/run.mjs capacity rooms`. Expected: `36/36 passed`.

- [x] **Step 9: Lint and commit**

```powershell
npx eslint --fix src/modules/hotel/util/hotel-catalog.ts src/modules/hotel/types/hotel.dto.ts src/modules/hotel/util/hotel.validation.ts src/modules/hotel/hotel.service.ts src/modules/hotel/hotel.controller.ts src/modules/hotel/swagger/hotel.swagger.ts
git add src/modules/hotel
git commit -m "feat(hotel): keep room ids with rooms_write_mode=by_id and block legacy replacement on calendar hotels"
```

---

## Task 10: Admin room calendar API

**Produces:** `GET`/`PATCH /hotel/:hotelId/rooms/:roomId/calendar`; `HotelAvailabilityModule` (imported by `HotelModule`); `UUID_PATTERN`, `dateField` and calendar schemas; `loadRoomNights`, `baseRates`, `toRoomStock`, `STOCK_ROOM_SELECT`, `ELIGIBLE_ROOM_WHERE`, `StockRoom`, `RoomNights`; calendar DTO types.

- [ ] **Step 1: Validation (`util/availability.validation.ts`)**

```ts
import { z } from 'zod';
import { AVAILABILITY_LIMITS } from '../engine/availability-limits';
import { formatAmount, parseAmount } from '../engine/money';
import { addDays, daysBetween, hotelToday, isCalendarDate, stayNights } from '../engine/stay-dates';

const LIMITS = AVAILABILITY_LIMITS;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Issue = { path: (string | number)[]; message: string };

const dateField = z.string().refine(isCalendarDate, 'يجب أن يكون التاريخ بصيغة YYYY-MM-DD وتاريخًا صحيحًا');

export const calendarRangeQuerySchema = z
  .object({ from: dateField, to: dateField })
  .transform((range, ctx) => {
    const nights = daysBetween(range.from, range.to);
    if (nights < 1 || nights > LIMITS.maxCalendarRangeNights) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: `to يجب أن يكون بعد from بمدى لا يتجاوز ${LIMITS.maxCalendarRangeNights} ليلة` });
    }
    return range;
  });

const overrideAmountField = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const cents = parseAmount(String(value));
  if (cents !== null && cents > 0) return formatAmount(cents);
  ctx.addIssue({ code: 'custom', message: 'السعر يجب أن يكون أكبر من صفر بحد أقصى منزلتين عشريتين ولا يتجاوز 99999999.99' });
  return z.NEVER;
});

const calendarChangeSchema = z.object({
  from: dateField,
  to: dateField,
  available_units: z.number().int().min(0).max(LIMITS.maxAvailableUnits).optional(),
  rate_override: z
    .strictObject({ USD: overrideAmountField.nullable().optional(), EGP: overrideAmountField.nullable().optional() })
    .optional(),
});

function calendarChangeIssues(changes: z.output<typeof calendarChangeSchema>[]): Issue[] {
  const today = hotelToday();
  const windowEnd = addDays(today, LIMITS.bookingWindowDays);
  const seen = new Set<string>();
  const issues: Issue[] = [];
  changes.forEach((change, index) => {
    const nights = daysBetween(change.from, change.to);
    if (nights < 1 || nights > LIMITS.maxCalendarRangeNights) {
      issues.push({ path: ['changes', index, 'to'], message: `to يجب أن يكون بعد from بمدى لا يتجاوز ${LIMITS.maxCalendarRangeNights} ليلة` });
      return;
    }
    if (change.from < today) issues.push({ path: ['changes', index, 'from'], message: 'لا يمكن تعديل ليالٍ قبل اليوم' });
    if (change.to > windowEnd) issues.push({ path: ['changes', index, 'to'], message: `لا يمكن تعديل ليالٍ بعد ${LIMITS.bookingWindowDays} يومًا من اليوم` });
    if (change.available_units === undefined && change.rate_override?.USD === undefined && change.rate_override?.EGP === undefined) {
      issues.push({ path: ['changes', index], message: 'حدد عدد الوحدات أو سعرًا واحدًا على الأقل' });
    }
    const dates = stayNights(change.from, change.to);
    if (dates.some((date) => seen.has(date))) issues.push({ path: ['changes', index], message: 'الفترات متداخلة' });
    for (const date of dates) seen.add(date);
  });
  return issues;
}

export const calendarUpdateBodySchema = z
  .object({
    revision: z.number().int().min(0),
    changes: z.array(calendarChangeSchema).min(1).max(LIMITS.maxCalendarChanges),
  })
  .transform((body, ctx) => {
    for (const issue of calendarChangeIssues(body.changes)) ctx.addIssue({ code: 'custom', ...issue });
    return body;
  });
```

- [ ] **Step 2: DTOs (`types/availability.dto.ts`)**

```ts
import type { z } from 'zod';
import type { Currency } from '../engine/stay-pricing';
import type { calendarRangeQuerySchema, calendarUpdateBodySchema } from '../util/availability.validation';

export type CalendarRangeQuery = z.output<typeof calendarRangeQuerySchema>;
export type CalendarUpdateBody = z.output<typeof calendarUpdateBodySchema>;
export type CalendarChange = CalendarUpdateBody['changes'][number];

export type MoneyRates = Record<Currency, string | null>;

export type RoomCalendarResponse = {
  hotel_id: string;
  room_id: string;
  revision: number;
  base_rates: MoneyRates;
  days: { date: string; available_units: number; rate_override: MoneyRates }[];
};

export type RoomCalendarUpdateResponse = { hotel_id: string; room_id: string; revision: number };
```

- [ ] **Step 3: Queries (`util/availability.queries.ts`)**

```ts
import { Prisma } from 'generated/prisma/client';
import { DatabaseService } from '../../database/database.service';
import { parseAmount } from '../engine/money';
import { CalendarNight, Rates, RoomTypeStock, toBaseRate } from '../engine/stay-pricing';

export type RoomNights = Map<string, Map<string, CalendarNight>>;

export type StockRoom = { id: string; capacity: number | null; price: Prisma.Decimal; price_egp: Prisma.Decimal | null };

export const STOCK_ROOM_SELECT = { id: true, capacity: true, price: true, price_egp: true } satisfies Prisma.RoomSelect;

export const ELIGIBLE_ROOM_WHERE = { is_deleted: false, capacity: { gte: 1 } } satisfies Prisma.RoomWhereInput;

type CalendarRow = {
  room_id: string;
  stay_date: string;
  available_units: number;
  rate_override_usd: string | null;
  rate_override_egp: string | null;
};

const toOverride = (amount: string | null) => (amount === null ? null : parseAmount(amount));

// stay_date comes back as text so no Date object (or time zone) ever touches it.
export async function loadRoomNights(db: DatabaseService, roomIds: string[], from: string, to: string, { openOnly }: { openOnly: boolean }): Promise<RoomNights> {
  const nights: RoomNights = new Map();
  if (!roomIds.length) return nights;
  const rows = await db.$queryRaw<CalendarRow[]>`
    SELECT room_id,
           DATE_FORMAT(stay_date, '%Y-%m-%d') AS stay_date,
           available_units,
           CAST(rate_override_usd AS CHAR) AS rate_override_usd,
           CAST(rate_override_egp AS CHAR) AS rate_override_egp
    FROM room_calendar_days
    WHERE room_id IN (${Prisma.join(roomIds)})
      AND stay_date >= ${from} AND stay_date < ${to}
      ${openOnly ? Prisma.sql`AND available_units > 0` : Prisma.empty}
  `;
  for (const row of rows) {
    const roomNights = nights.get(row.room_id) ?? new Map<string, CalendarNight>();
    roomNights.set(row.stay_date, {
      availableUnits: Number(row.available_units),
      overrides: { USD: toOverride(row.rate_override_usd), EGP: toOverride(row.rate_override_egp) },
    });
    nights.set(row.room_id, roomNights);
  }
  return nights;
}

export function baseRates(room: Pick<StockRoom, 'price' | 'price_egp'>): Rates {
  return {
    USD: toBaseRate(room.price.toFixed(2)),
    EGP: room.price_egp === null ? null : toBaseRate(room.price_egp.toFixed(2)),
  };
}

export function toRoomStock(room: StockRoom, nights: RoomNights): RoomTypeStock {
  return { roomId: room.id, capacity: room.capacity ?? 0, baseRates: baseRates(room), nights: nights.get(room.id) ?? new Map() };
}
```

- [ ] **Step 4: Service (`room-calendar.service.ts`)**

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { formatAmountOrNull } from './engine/money';
import { stayNights } from './engine/stay-dates';
import type { CalendarChange, CalendarRangeQuery, CalendarUpdateBody, RoomCalendarResponse, RoomCalendarUpdateResponse } from './types/availability.dto';
import { calendarConflict, notFound } from './util/availability.errors';
import { baseRates, loadRoomNights } from './util/availability.queries';
import { UUID_PATTERN } from './util/availability.validation';

function calendarUpsert(roomId: string, change: CalendarChange): Prisma.Sql {
  const units = change.available_units;
  const usd = change.rate_override?.USD;
  const egp = change.rate_override?.EGP;
  const rows = stayNights(change.from, change.to).map(
    (date) => Prisma.sql`(${roomId}, ${date}, ${units ?? 0}, ${usd ?? null}, ${egp ?? null}, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
  );
  const updates = [Prisma.sql`updated_at = UTC_TIMESTAMP(3)`];
  if (units !== undefined) updates.push(Prisma.sql`available_units = ${units}`);
  if (usd !== undefined) updates.push(Prisma.sql`rate_override_usd = ${usd}`);
  if (egp !== undefined) updates.push(Prisma.sql`rate_override_egp = ${egp}`);
  return Prisma.sql`
    INSERT INTO room_calendar_days (room_id, stay_date, available_units, rate_override_usd, rate_override_egp, created_at, updated_at)
    VALUES ${Prisma.join(rows)}
    ON DUPLICATE KEY UPDATE ${Prisma.join(updates)}
  `;
}

@Injectable()
export class RoomCalendarService {
  constructor(private readonly prismaService: DatabaseService) {}

  async getCalendar(hotelId: string, roomId: string, range: CalendarRangeQuery): Promise<RoomCalendarResponse> {
    const room = await this.findRoom(hotelId, roomId);
    const nights = (await loadRoomNights(this.prismaService, [room.id], range.from, range.to, { openOnly: false })).get(room.id);
    const base = baseRates(room);
    return {
      hotel_id: hotelId,
      room_id: room.id,
      revision: room.calendar_revision,
      base_rates: { USD: formatAmountOrNull(base.USD), EGP: formatAmountOrNull(base.EGP) },
      days: stayNights(range.from, range.to).map((date) => {
        const night = nights?.get(date);
        return {
          date,
          available_units: night?.availableUnits ?? 0,
          rate_override: {
            USD: formatAmountOrNull(night?.overrides.USD ?? null),
            EGP: formatAmountOrNull(night?.overrides.EGP ?? null),
          },
        };
      }),
    };
  }

  async updateCalendar(hotelId: string, roomId: string, body: CalendarUpdateBody): Promise<RoomCalendarUpdateResponse> {
    const room = await this.findRoom(hotelId, roomId);
    await this.prismaService.$transaction(async (tx) => {
      // Hotel row first, then the room: PATCH /hotel/:id locks in the same order.
      await tx.$executeRaw`UPDATE hotels SET calendar_managed_at = COALESCE(calendar_managed_at, UTC_TIMESTAMP(3)) WHERE id = ${hotelId}`;
      const bumped = await tx.$executeRaw`
        UPDATE room SET calendar_revision = calendar_revision + 1
        WHERE id = ${room.id} AND hotel_id = ${hotelId} AND is_deleted = false AND calendar_revision = ${body.revision}
      `;
      if (bumped !== 1) throw calendarConflict();
      for (const change of body.changes) await tx.$executeRaw(calendarUpsert(room.id, change));
    });
    return { hotel_id: hotelId, room_id: room.id, revision: body.revision + 1 };
  }

  private async findRoom(hotelId: string, roomId: string) {
    const room =
      UUID_PATTERN.test(hotelId) && UUID_PATTERN.test(roomId)
        ? await this.prismaService.room.findFirst({
            where: { id: roomId, hotel_id: hotelId, is_deleted: false, hotel: { is_deleted: false } },
            select: { id: true, price: true, price_egp: true, calendar_revision: true },
          })
        : null;
    if (!room) throw notFound('الغرفة غير موجودة في هذا الفندق');
    return room;
  }
}
```

- [ ] **Step 5: Swagger (`swagger/availability.swagger.ts`)**

```ts
import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AVAILABILITY_LIMITS } from '../engine/availability-limits';

const LIMITS = AVAILABILITY_LIMITS;
const ERROR_SHAPE = 'جسم الخطأ: { statusCode, code, message, field?, errors? }';
const HOTEL_ID = '6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
const ROOM_ID = '9b2f1c7e-4d3a-4f6b-8a1e-2c5d7f9e0a13';

const calendarParams = () => [
  ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
  ApiParam({ name: 'roomId', description: 'معرّف الغرفة (UUID)' }),
];

export const GetRoomCalendarSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'تقويم غرفة: الوحدات المتاحة وأسعار كل ليلة',
      description: `ليلة لكل تاريخ من from حتى ما قبل to (حتى ${LIMITS.maxCalendarRangeNights} ليلة)، مع revision والأسعار الأساسية. الليلة بلا سجل مغلقة. base_rates تكون null إذا لم يُحدد سعر أساسي موجب.`,
    }),
    ...calendarParams(),
    ApiQuery({ name: 'from', required: true, example: '2026-11-20', description: 'أول ليلة YYYY-MM-DD' }),
    ApiQuery({ name: 'to', required: true, example: '2026-11-23', description: 'اليوم التالي لآخر ليلة (غير مشمول)' }),
    ApiResponse({
      status: 200,
      description: 'تقويم الغرفة',
      schema: {
        example: {
          hotel_id: HOTEL_ID,
          room_id: ROOM_ID,
          revision: 8,
          base_rates: { USD: '100.00', EGP: '5000.00' },
          days: [
            { date: '2026-11-20', available_units: 1, rate_override: { USD: null, EGP: null } },
            { date: '2026-11-21', available_units: 1, rate_override: { USD: '140.00', EGP: '7000.00' } },
            { date: '2026-11-22', available_units: 0, rate_override: { USD: null, EGP: null } },
          ],
        },
      },
    }),
    ApiResponse({ status: 400, description: `INVALID_INPUT. ${ERROR_SHAPE}` }),
    ApiResponse({ status: 401, description: 'UNAUTHENTICATED' }),
    ApiResponse({ status: 404, description: 'NOT_FOUND: الغرفة ليست غرفة فعّالة في هذا الفندق' }),
  );

export const UpdateRoomCalendarSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'تعديل تقويم غرفة دفعة واحدة',
      description: `revision يجب أن يطابق آخر قراءة وإلا 409 CALENDAR_CONFLICT بلا أي حفظ. كل تغيير يغطي الليالي من from حتى ما قبل to، بين اليوم و${LIMITS.bookingWindowDays} يومًا بعده، ويحدد available_units (0-${LIMITS.maxAvailableUnits}) أو rate_override (USD/EGP، وnull يلغي السعر الخاص). الحقول غير المرسلة لا تتغير، و0 وحدات يغلق الليلة ويُبقي أسعارها. لا يجوز تداخل الفترات.`,
    }),
    ...calendarParams(),
    ApiBody({
      schema: {
        type: 'object',
        required: ['revision', 'changes'],
        properties: {
          revision: { type: 'integer', minimum: 0, example: 8 },
          changes: {
            type: 'array',
            minItems: 1,
            maxItems: LIMITS.maxCalendarChanges,
            items: {
              type: 'object',
              required: ['from', 'to'],
              properties: {
                from: { type: 'string', example: '2026-11-21' },
                to: { type: 'string', example: '2026-11-22' },
                available_units: { type: 'integer', minimum: 0, maximum: LIMITS.maxAvailableUnits },
                rate_override: {
                  type: 'object',
                  properties: {
                    USD: { type: 'string', nullable: true, example: '140.00' },
                    EGP: { type: 'string', nullable: true, example: '7500.00' },
                  },
                },
              },
            },
          },
        },
        example: {
          revision: 8,
          changes: [
            { from: '2026-11-21', to: '2026-11-22', available_units: 2, rate_override: { EGP: '7500.00' } },
            { from: '2026-11-22', to: '2026-11-23', available_units: 0, rate_override: { USD: null, EGP: null } },
          ],
        },
      },
    }),
    ApiResponse({ status: 200, description: 'تم الحفظ', schema: { example: { hotel_id: HOTEL_ID, room_id: ROOM_ID, revision: 9 } } }),
    ApiResponse({ status: 400, description: `INVALID_INPUT. ${ERROR_SHAPE}` }),
    ApiResponse({ status: 401, description: 'UNAUTHENTICATED' }),
    ApiResponse({ status: 404, description: 'NOT_FOUND' }),
    ApiResponse({ status: 409, description: 'CALENDAR_CONFLICT: التقويم تغيّر منذ آخر قراءة' }),
  );
```

- [ ] **Step 6: Controller and module.** `room-calendar.controller.ts`:

```ts
import { Body, Controller, Get, Header, Param, Patch, Query, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import { RoomCalendarService } from './room-calendar.service';
import { GetRoomCalendarSwagger, UpdateRoomCalendarSwagger } from './swagger/availability.swagger';
import type { CalendarRangeQuery, CalendarUpdateBody } from './types/availability.dto';
import { AvailabilityExceptionFilter } from './util/availability-exception.filter';
import { calendarRangeQuerySchema, calendarUpdateBodySchema } from './util/availability.validation';

@ApiTags('Room calendar')
@ApiBearerAuth()
@UseFilters(AvailabilityExceptionFilter)
@Controller('hotel/:hotelId/rooms/:roomId/calendar')
export class RoomCalendarController {
  constructor(private readonly roomCalendarService: RoomCalendarService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @GetRoomCalendarSwagger()
  findRange(
    @Param('hotelId') hotelId: string,
    @Param('roomId') roomId: string,
    @Query(new ZodValidationPipe(calendarRangeQuerySchema)) range: CalendarRangeQuery,
  ) {
    return this.roomCalendarService.getCalendar(hotelId, roomId, range);
  }

  @Patch()
  @UpdateRoomCalendarSwagger()
  update(
    @Param('hotelId') hotelId: string,
    @Param('roomId') roomId: string,
    @Body(new ZodValidationPipe(calendarUpdateBodySchema)) body: CalendarUpdateBody,
  ) {
    return this.roomCalendarService.updateCalendar(hotelId, roomId, body);
  }
}
```

`hotel-availability.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RoomCalendarController } from './room-calendar.controller';
import { RoomCalendarService } from './room-calendar.service';

@Module({
  controllers: [RoomCalendarController],
  providers: [RoomCalendarService, DatabaseService],
})
export class HotelAvailabilityModule {}
```

In `src/modules/hotel/hotel.module.ts`, import `HotelAvailabilityModule` from `'../hotel-availability/hotel-availability.module'` and set `imports: [FileModule, HotelAvailabilityModule]`.

- [ ] **Step 7: Build.** `npm run build`. Expected: exit 0. The watch server reloads.

- [ ] **Step 8: Write `.tmp/availability-verify/calendar.mjs`**

```js
import { isDeepStrictEqual } from 'node:util';
import { IDS, check, checkError, day, reseed, send } from './harness.mjs';

const getEp = 'GET /hotel/:hotelId/rooms/:roomId/calendar';
const patchEp = 'PATCH /hotel/:hotelId/rooms/:roomId/calendar';
const path = (roomId = IDS.double, hotelId = IDS.hotel) => `/hotel/${hotelId}/rooms/${roomId}/calendar`;
const read = (from, to, roomId, hotelId) => send('GET', `${path(roomId, hotelId)}?from=${from}&to=${to}`, { auth: true });
const write = (body, roomId, hotelId) => send('PATCH', path(roomId, hotelId), { auth: true, body });
const night = (date, units, USD = null, EGP = null) => ({ date, available_units: units, rate_override: { USD, EGP } });

export default async function calendar() {
  reseed();

  const initial = await read(day(10), day(13));
  check(getEp, 'seeded nights', '200, revision 0, base rates, closed night with kept override', isDeepStrictEqual(initial.body, {
    hotel_id: IDS.hotel,
    room_id: IDS.double,
    revision: 0,
    base_rates: { USD: '100.00', EGP: '5000.00' },
    days: [night(day(10), 2), night(day(11), 1, '140.00', '7000.00'), night(day(12), 0, '150.00')],
  }), initial.body);
  check(getEp, 'no-store header', 'Cache-Control: no-store', initial.headers.get('cache-control') === 'no-store', initial.headers.get('cache-control'));
  const suite = await read(day(10), day(12), IDS.suite);
  check(getEp, 'missing EGP base', 'base_rates USD 300.00, EGP null', isDeepStrictEqual(suite.body?.base_rates, { USD: '300.00', EGP: null }), suite.body);

  checkError(getEp, 'no token', await send('GET', `${path()}?from=${day(10)}&to=${day(12)}`), 401, 'UNAUTHENTICATED');
  checkError(getEp, 'to before from', await read(day(12), day(10)), 400, 'INVALID_INPUT', 'to');
  checkError(getEp, 'impossible date', await read('2026-02-30', day(10)), 400, 'INVALID_INPUT', 'from');
  checkError(getEp, '366 nights', await read(day(0), day(366)), 400, 'INVALID_INPUT', 'to');
  checkError(getEp, 'room of another hotel', await read(day(10), day(12), IDS.double, IDS.legacyHotel), 404, 'NOT_FOUND');
  checkError(getEp, 'non-uuid room', await read(day(10), day(12), 'not-a-uuid'), 404, 'NOT_FOUND');

  const egp = await write({ revision: 0, changes: [{ from: day(10), to: day(11), rate_override: { EGP: '5500' } }] });
  check(patchEp, 'EGP override on one night', '200, revision 1', isDeepStrictEqual(egp.body, { hotel_id: IDS.hotel, room_id: IDS.double, revision: 1 }), egp.body);
  const afterEgp = await read(day(10), day(11));
  check(getEp, 'override saved, USD and units untouched', 'units 2, USD null, EGP 5500.00', isDeepStrictEqual(afterEgp.body?.days, [night(day(10), 2, null, '5500.00')]), afterEgp.body);

  const cleared = await write({ revision: 1, changes: [{ from: day(10), to: day(11), rate_override: { EGP: null } }] });
  const afterClear = await read(day(10), day(11));
  check(patchEp, 'clear EGP override', 'revision 2, EGP inherited again', cleared.body?.revision === 2 && afterClear.body?.days?.[0]?.rate_override?.EGP === null, afterClear.body);

  checkError(patchEp, 'stale revision', await write({ revision: 0, changes: [{ from: day(10), to: day(11), available_units: 5 }] }), 409, 'CALENDAR_CONFLICT');
  checkError(patchEp, 'overlapping changes', await write({ revision: 2, changes: [{ from: day(10), to: day(12), available_units: 1 }, { from: day(11), to: day(13), available_units: 1 }] }), 400, 'INVALID_INPUT', 'changes.1');
  const unchanged = await read(day(10), day(11));
  check(getEp, 'rejected batches saved nothing', 'revision 2, units 2', unchanged.body?.revision === 2 && unchanged.body?.days?.[0]?.available_units === 2, unchanged.body);

  const one = (change) => ({ revision: 2, changes: [change] });
  checkError(patchEp, 'past night', await write(one({ from: day(-1), to: day(0), available_units: 1 })), 400, 'INVALID_INPUT', 'changes.0.from');
  checkError(patchEp, 'beyond booking window', await write(one({ from: day(365), to: day(366), available_units: 1 })), 400, 'INVALID_INPUT', 'changes.0.to');
  checkError(patchEp, 'empty change', await write(one({ from: day(10), to: day(11) })), 400, 'INVALID_INPUT', 'changes.0');
  checkError(patchEp, 'units above 999', await write(one({ from: day(10), to: day(11), available_units: 1000 })), 400, 'INVALID_INPUT', 'changes.0.available_units');
  checkError(patchEp, 'zero override', await write(one({ from: day(10), to: day(11), rate_override: { EGP: 0 } })), 400, 'INVALID_INPUT', 'changes.0.rate_override.EGP');
  checkError(patchEp, 'unknown currency', await write(one({ from: day(10), to: day(11), rate_override: { GBP: '10' } })), 400, 'INVALID_INPUT', 'changes.0.rate_override');
  checkError(patchEp, 'no changes', await write({ revision: 2, changes: [] }), 400, 'INVALID_INPUT', 'changes');

  await write({ revision: 2, changes: [{ from: day(11), to: day(12), available_units: 0 }] });
  const afterClose = await read(day(11), day(12));
  check(patchEp, 'closing keeps overrides', 'units 0, 140.00 / 7000.00', isDeepStrictEqual(afterClose.body?.days, [night(day(11), 0, '140.00', '7000.00')]), afterClose.body);
  await write({ revision: 3, changes: [{ from: day(20), to: day(21), rate_override: { USD: 99 } }] });
  const afterPriceOnly = await read(day(20), day(21));
  check(patchEp, 'price-only edit does not open a night', 'units 0, USD 99.00', isDeepStrictEqual(afterPriceOnly.body?.days, [night(day(20), 0, '99.00')]), afterPriceOnly.body);

  checkError(patchEp, 'no token', await send('PATCH', path(), { body: one({ from: day(10), to: day(11), available_units: 1 }) }), 401, 'UNAUTHENTICATED');
  checkError(patchEp, 'room of another hotel', await write({ revision: 0, changes: [{ from: day(10), to: day(11), available_units: 1 }] }, IDS.double, IDS.legacyHotel), 404, 'NOT_FOUND');

  const renamed = await send('PATCH', `/hotel/${IDS.hotel}`, { auth: true, form: { rooms_write_mode: 'by_id', rooms: [{ id: IDS.double, translations: [{ language: 'ar', name: 'مزدوجة محدثة' }] }] } });
  const afterRename = await read(day(10), day(11));
  check(getEp, 'calendar survives a room rename', 'revision 4, units 2', renamed.status === 200 && afterRename.body?.revision === 4 && afterRename.body?.days?.[0]?.available_units === 2, afterRename.body);

  const firstWrite = await write({ revision: 0, changes: [{ from: day(10), to: day(11), available_units: 1 }] }, IDS.legacyRoom, IDS.legacyHotel);
  check(patchEp, 'first write on an unmanaged hotel', '200, revision 1', firstWrite.body?.revision === 1, firstWrite.body);
  checkError('PATCH /hotel/:id', 'legacy rooms after the first calendar write', await send('PATCH', `/hotel/${IDS.legacyHotel}`, { auth: true, form: { rooms: [{ price: 70, price_egp: 3500, translations: [{ language: 'en', name: 'New' }] }] } }), 409, 'ROOM_IDS_REQUIRED');
}
```

- [ ] **Step 9: Run it.** `. .\.tmp\local-session.ps1; node .tmp/availability-verify/run.mjs calendar`. Expected: `29/29 passed`.

- [ ] **Step 10: Lint and commit**

```powershell
npx eslint --fix src/modules/hotel-availability src/modules/hotel/hotel.module.ts
git add src/modules/hotel-availability src/modules/hotel/hotel.module.ts
git commit -m "feat(availability): add the admin room calendar API"
```

---

## Task 11: Dated search and stay quote

**Produces:** `GET /hotel/search`, `POST /hotel/:hotelId/stay-quote`, `HotelAvailabilityService` (exported).

- [ ] **Step 1: Validation.** In `util/availability.validation.ts`, add `import { DestinatiosnEnum } from 'generated/prisma/client';` and append:

```ts
const idField = z.string().regex(UUID_PATTERN, 'معرّف غير صالح').toLowerCase();
const quantityField = z.number().int('الكمية يجب أن تكون عددًا صحيحًا').min(1, 'الكمية يجب أن تكون 1 على الأقل');
const visitorCategoryField = z.enum(['egyptian-resident', 'other'], 'visitor_category يجب أن تكون egyptian-resident أو other');

type StayFields = { check_in: string; check_out: string; adults: number; children: number };

function stayIssues(stay: StayFields): Issue[] {
  const today = hotelToday();
  const nights = daysBetween(stay.check_in, stay.check_out);
  const issues: Issue[] = [];
  if (stay.check_in < today) issues.push({ path: ['check_in'], message: 'تاريخ الوصول لا يمكن أن يكون قبل اليوم' });
  if (nights < 1) issues.push({ path: ['check_out'], message: 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول' });
  else if (nights > LIMITS.maxStayNights) issues.push({ path: ['check_out'], message: `مدة الإقامة لا تتجاوز ${LIMITS.maxStayNights} ليلة` });
  if (stay.check_out > addDays(today, LIMITS.bookingWindowDays)) {
    issues.push({ path: ['check_out'], message: `تاريخ المغادرة يجب أن يكون خلال ${LIMITS.bookingWindowDays} يومًا من اليوم` });
  }
  if (stay.adults + stay.children > LIMITS.maxGuests) issues.push({ path: ['adults'], message: `عدد الضيوف الإجمالي لا يتجاوز ${LIMITS.maxGuests}` });
  return issues;
}

export const staySearchQuerySchema = z
  .object({
    destination: z.enum(DestinatiosnEnum),
    check_in: dateField,
    check_out: dateField,
    adults: z.coerce.number().int().min(1),
    children: z.coerce.number().int().min(0).default(0),
    visitor_category: visitorCategoryField,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(LIMITS.maxSearchPageSize).default(LIMITS.defaultSearchPageSize),
  })
  .transform((query, ctx) => {
    for (const issue of stayIssues(query)) ctx.addIssue({ code: 'custom', ...issue });
    return query;
  });

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

type SelectionFields = StayFields & {
  rooms?: { room_id: string; quantity: number }[];
  addons?: { addon_id: string; quantity: number }[];
};

function selectionIssues(body: SelectionFields): Issue[] {
  const addons = body.addons ?? [];
  if (!body.rooms) return addons.length ? [{ path: ['addons'], message: 'الترقيات تتطلب تحديد الغرف' }] : [];
  const issues: Issue[] = [];
  const roomCount = body.rooms.reduce((sum, room) => sum + room.quantity, 0);
  if (hasDuplicates(body.rooms.map((room) => room.room_id))) issues.push({ path: ['rooms'], message: 'لا يجوز تكرار الغرفة نفسها' });
  if (roomCount > body.adults + body.children) issues.push({ path: ['rooms'], message: 'عدد الغرف لا يتجاوز عدد الضيوف' });
  if (hasDuplicates(addons.map((addon) => addon.addon_id))) issues.push({ path: ['addons'], message: 'لا يجوز تكرار الترقية نفسها' });
  if (addons.reduce((sum, addon) => sum + addon.quantity, 0) > roomCount) issues.push({ path: ['addons'], message: 'عدد الترقيات لا يتجاوز عدد الغرف' });
  return issues;
}

export const stayQuoteBodySchema = z
  .object({
    check_in: dateField,
    check_out: dateField,
    adults: z.number().int().min(1),
    children: z.number().int().min(0).default(0),
    visitor_category: visitorCategoryField,
    rooms: z.array(z.object({ room_id: idField, quantity: quantityField })).min(1, 'rooms لا يمكن أن تكون فارغة').optional(),
    addons: z.array(z.object({ addon_id: idField, quantity: quantityField })).optional(),
  })
  .transform((body, ctx) => {
    for (const issue of [...stayIssues(body), ...selectionIssues(body)]) ctx.addIssue({ code: 'custom', ...issue });
    return body;
  });
```

- [ ] **Step 2: DTOs.** In `types/availability.dto.ts`, extend the imports (`Currency, VisitorCategory` from stay-pricing; `staySearchQuerySchema, stayQuoteBodySchema` from validation; `import type { HotelCatalogEntry } from 'src/modules/hotel/util/hotel-catalog';` and `import type { PaginatedResult } from 'src/types/util.types';`) and append:

```ts
export type StaySearchQuery = z.output<typeof staySearchQuerySchema>;
export type StayQuoteBody = z.output<typeof stayQuoteBodySchema>;
export type PricingStatus = 'PRICED' | 'ON_REQUEST';

export type StayOffer = {
  nights: number;
  currency: Currency;
  pricing_status: PricingStatus;
  total: string | null;
  rooms: { room_id: string; quantity: number }[];
};

export type StaySearchResponse = PaginatedResult<{ hotel: HotelCatalogEntry; stay_offer: StayOffer }>;

export type StayQuoteResponse = {
  hotel_id: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  nights: number;
  visitor_category: VisitorCategory;
  currency: Currency;
  pricing_status: PricingStatus;
  available_room_types: { room_id: string; capacity: number; max_quantity: number; unit_stay_total: string | null }[];
  rooms: { room_id: string; quantity: number; subtotal: string | null; nightly_rates: { date: string; unit_rate: string | null }[] }[];
  addons: { addon_id: string; quantity: number; unit_rate: string | null; subtotal: string | null }[];
  room_total: string | null;
  addons_total: string | null;
  total: string | null;
  quoted_at: string;
};
```

- [ ] **Step 3: Service (`hotel-availability.service.ts`)**

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { HOTEL_CATALOG_INCLUDE } from '../hotel/util/hotel-catalog';
import { Cents, formatAmountOrNull, parseAmount } from './engine/money';
import { chooseAllocation, compareIds, isSelectionFeasible, RoomPick } from './engine/room-allocation';
import { stayNights } from './engine/stay-dates';
import { Currency, priceStay, roomStayTerms, RoomStayTerms, UpgradeSelection, VISITOR_CURRENCY, VisitorCategory } from './engine/stay-pricing';
import type { PricingStatus, StayQuoteBody, StayQuoteResponse, StaySearchQuery, StaySearchResponse } from './types/availability.dto';
import { notFound, stayUnavailable } from './util/availability.errors';
import { ELIGIBLE_ROOM_WHERE, loadRoomNights, RoomNights, STOCK_ROOM_SELECT, StockRoom, toRoomStock } from './util/availability.queries';
import { UUID_PATTERN } from './util/availability.validation';

type StayRequest = { check_in: string; check_out: string; adults: number; children: number; visitor_category: VisitorCategory };
type Stay = { nights: string[]; guests: number; currency: Currency };
type AddonPrice = { id: string; price: Prisma.Decimal; price_egp: Prisma.Decimal | null };

const toStay = (request: StayRequest): Stay => ({
  nights: stayNights(request.check_in, request.check_out),
  guests: request.adults + request.children,
  currency: VISITOR_CURRENCY[request.visitor_category],
});

const pricingStatus = (total: Cents | null): PricingStatus => (total === null ? 'ON_REQUEST' : 'PRICED');

const toRoomQuantity = (pick: RoomPick) => ({ room_id: pick.roomId, quantity: pick.quantity });

function availableTerms(rooms: StockRoom[], roomNights: RoomNights, stay: Stay): RoomStayTerms[] {
  return rooms
    .map((room) => roomStayTerms(toRoomStock(room, roomNights), stay.nights, stay.guests, stay.currency))
    .filter((terms) => terms.maxQuantity >= 1)
    .sort((a, b) => compareIds(a.roomId, b.roomId));
}

function exactRooms(selection: NonNullable<StayQuoteBody['rooms']>, terms: RoomStayTerms[], guests: number): RoomPick[] {
  const rooms = selection
    .map(({ room_id, quantity }) => ({ roomId: room_id, quantity }))
    .sort((a, b) => compareIds(a.roomId, b.roomId));
  if (!isSelectionFeasible(rooms, terms, guests)) throw stayUnavailable('rooms');
  return rooms;
}

function recommendedRooms(terms: RoomStayTerms[], guests: number): RoomPick[] {
  const allocation = chooseAllocation(terms, guests);
  if (!allocation) throw stayUnavailable();
  return allocation.rooms;
}

function selectedUpgrades(selection: NonNullable<StayQuoteBody['addons']>, addons: AddonPrice[], currency: Currency): UpgradeSelection[] {
  const addonsById = new Map(addons.map((addon) => [addon.id, addon]));
  return selection
    .map(({ addon_id, quantity }) => {
      const addon = addonsById.get(addon_id);
      if (!addon) throw stayUnavailable('addons');
      const price = currency === 'USD' ? addon.price : addon.price_egp;
      return { addonId: addon_id, quantity, unitRate: price === null ? null : parseAmount(price.toFixed(2)) };
    })
    .sort((a, b) => compareIds(a.addonId, b.addonId));
}

@Injectable()
export class HotelAvailabilityService {
  constructor(private readonly prismaService: DatabaseService) {}

  async search(query: StaySearchQuery): Promise<StaySearchResponse> {
    const stay = toStay(query);
    const hotels = await this.prismaService.hotels.findMany({
      where: { destination: query.destination, is_deleted: false },
      orderBy: { id: 'asc' },
      select: { id: true, rooms: { where: ELIGIBLE_ROOM_WHERE, select: STOCK_ROOM_SELECT } },
    });
    const roomIds = hotels.flatMap((hotel) => hotel.rooms.map((room) => room.id));
    const roomNights = await loadRoomNights(this.prismaService, roomIds, query.check_in, query.check_out, { openOnly: true });
    const offers = hotels.flatMap((hotel) => {
      const allocation = chooseAllocation(availableTerms(hotel.rooms, roomNights, stay), stay.guests);
      return allocation ? [{ hotelId: hotel.id, allocation }] : [];
    });

    const { skip, take, page } = this.prismaService.handleQueryPagination(query);
    const pageOffers = offers.slice(skip, skip + take);
    const catalog = pageOffers.length
      ? await this.prismaService.hotels.findMany({
          where: { id: { in: pageOffers.map((offer) => offer.hotelId) } },
          include: HOTEL_CATALOG_INCLUDE,
        })
      : [];
    const catalogById = new Map(catalog.map((hotel) => [hotel.id, hotel]));

    return {
      data: pageOffers.flatMap(({ hotelId, allocation }) => {
        const hotel = catalogById.get(hotelId);
        if (!hotel) return [];
        return [
          {
            hotel,
            stay_offer: {
              nights: stay.nights.length,
              currency: stay.currency,
              pricing_status: pricingStatus(allocation.total),
              total: formatAmountOrNull(allocation.total),
              rooms: allocation.rooms.map(toRoomQuantity),
            },
          },
        ];
      }),
      ...this.prismaService.formatPaginationResponse({ page, count: offers.length, limit: take }),
    };
  }

  async quote(hotelId: string, body: StayQuoteBody): Promise<StayQuoteResponse> {
    const hotel = UUID_PATTERN.test(hotelId)
      ? await this.prismaService.hotels.findFirst({
          where: { id: hotelId, is_deleted: false },
          select: {
            id: true,
            rooms: { where: ELIGIBLE_ROOM_WHERE, select: STOCK_ROOM_SELECT },
            addons: { where: { is_deleted: false }, select: { id: true, price: true, price_egp: true } },
          },
        })
      : null;
    if (!hotel) throw notFound('الفندق غير موجود');

    const stay = toStay(body);
    const roomNights = await loadRoomNights(this.prismaService, hotel.rooms.map((room) => room.id), body.check_in, body.check_out, { openOnly: true });
    const terms = availableTerms(hotel.rooms, roomNights, stay);
    const rooms = body.rooms ? exactRooms(body.rooms, terms, stay.guests) : recommendedRooms(terms, stay.guests);
    const priced = priceStay(rooms, terms, selectedUpgrades(body.addons ?? [], hotel.addons, stay.currency), stay.nights.length);

    return {
      hotel_id: hotel.id,
      check_in: body.check_in,
      check_out: body.check_out,
      adults: body.adults,
      children: body.children,
      nights: stay.nights.length,
      visitor_category: body.visitor_category,
      currency: stay.currency,
      pricing_status: pricingStatus(priced.total),
      available_room_types: terms.map((type) => ({
        room_id: type.roomId,
        capacity: type.capacity,
        max_quantity: type.maxQuantity,
        unit_stay_total: formatAmountOrNull(type.unitStayTotal),
      })),
      rooms: priced.rooms.map((line) => ({
        room_id: line.roomId,
        quantity: line.quantity,
        subtotal: formatAmountOrNull(line.subtotal),
        nightly_rates: line.nightlyRates.map((rate) => ({ date: rate.date, unit_rate: formatAmountOrNull(rate.unitRate) })),
      })),
      addons: priced.addons.map((line) => ({
        addon_id: line.addonId,
        quantity: line.quantity,
        unit_rate: formatAmountOrNull(line.unitRate),
        subtotal: formatAmountOrNull(line.subtotal),
      })),
      room_total: formatAmountOrNull(priced.roomTotal),
      addons_total: formatAmountOrNull(priced.addonsTotal),
      total: formatAmountOrNull(priced.total),
      quoted_at: new Date().toISOString(),
    };
  }
}
```

In `hotel-availability.module.ts`, import `HotelAvailabilityService`, add it to `providers`, and add `exports: [HotelAvailabilityService]`.

- [ ] **Step 4: Swagger.** Append to `swagger/availability.swagger.ts` (add `import { DestinatiosnEnum } from 'generated/prisma/client';`):

```ts
const VISITOR_CATEGORY_DOC = {
  enum: ['egyptian-resident', 'other'],
  description: 'egyptian-resident يسعّر بالجنيه المصري (EGP)، وother بالدولار (USD)، بلا تحويل بين العملتين',
};

const STAY_RULES = `check_in من اليوم (بتوقيت القاهرة)، من 1 إلى ${LIMITS.maxStayNights} ليلة، وcheck_out خلال ${LIMITS.bookingWindowDays} يومًا. adults ≥ 1، children ≥ 0، والإجمالي حتى ${LIMITS.maxGuests}.`;

export const SearchHotelStaysSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'البحث عن فنادق متاحة لتواريخ محددة',
      description: `يرجع الفنادق التي يكفي مخزونها كل ليالي الإقامة مع أرخص توزيع غرف مقترح، مرتبة بمعرّف الفندق. ${STAY_RULES} pricing_status = ON_REQUEST وtotal = null إذا لم يتوفر سعر كامل.`,
    }),
    ApiQuery({ name: 'destination', required: true, enum: Object.values(DestinatiosnEnum) }),
    ApiQuery({ name: 'check_in', required: true, example: '2026-11-20' }),
    ApiQuery({ name: 'check_out', required: true, example: '2026-11-22' }),
    ApiQuery({ name: 'adults', required: true, type: Number, example: 4 }),
    ApiQuery({ name: 'children', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'visitor_category', required: true, ...VISITOR_CATEGORY_DOC }),
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'limit', required: false, type: Number, example: LIMITS.defaultSearchPageSize, description: `حتى ${LIMITS.maxSearchPageSize}` }),
    ApiResponse({
      status: 200,
      description: 'hotel بنفس شكل GET /hotel (مختصر هنا)',
      schema: {
        example: {
          data: [
            {
              hotel: { id: HOTEL_ID, destination: 'SHARM_EL_SHEIKH' },
              stay_offer: {
                nights: 2,
                currency: 'EGP',
                pricing_status: 'PRICED',
                total: '26400.00',
                rooms: [
                  { room_id: ROOM_ID, quantity: 1 },
                  { room_id: 'c3d4e5f6-0a1b-4c2d-8e3f-4a5b6c7d8e9f', quantity: 1 },
                ],
              },
            },
          ],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        },
      },
    }),
    ApiResponse({ status: 400, description: `INVALID_INPUT. ${ERROR_SHAPE}` }),
    ApiResponse({ status: 429, description: 'RATE_LIMITED' }),
  );

export const StayQuoteSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'تسعير إقامة في فندق',
      description: `بدون rooms: يرجع التوزيع المقترح والأنواع المتاحة. مع rooms: يتحقق من الاختيار المحدد ويسعّره مع الترقيات (سعر الترقية لكل غرفة لكل ليلة). ${STAY_RULES} لا يحجز أي شيء.`,
    }),
    ApiParam({ name: 'hotelId', description: 'معرّف الفندق (UUID)' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['check_in', 'check_out', 'adults', 'visitor_category'],
        properties: {
          check_in: { type: 'string', example: '2026-11-20' },
          check_out: { type: 'string', example: '2026-11-22' },
          adults: { type: 'integer', minimum: 1, example: 4 },
          children: { type: 'integer', minimum: 0, example: 1 },
          visitor_category: { type: 'string', ...VISITOR_CATEGORY_DOC },
          rooms: {
            type: 'array',
            items: { type: 'object', properties: { room_id: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } } },
          },
          addons: {
            type: 'array',
            items: { type: 'object', properties: { addon_id: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } } },
          },
        },
        example: {
          check_in: '2026-11-20',
          check_out: '2026-11-22',
          adults: 4,
          children: 1,
          visitor_category: 'egyptian-resident',
          rooms: [{ room_id: ROOM_ID, quantity: 1 }],
          addons: [{ addon_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', quantity: 1 }],
        },
      },
    }),
    ApiResponse({ status: 200, description: 'التسعير الحالي؛ الأسعار والمخزون قد تتغير قبل الإرسال' }),
    ApiResponse({ status: 400, description: `INVALID_INPUT. ${ERROR_SHAPE}` }),
    ApiResponse({ status: 404, description: 'NOT_FOUND: الفندق غير موجود' }),
    ApiResponse({ status: 409, description: 'STAY_UNAVAILABLE: لا يوجد توزيع يغطي الضيوف أو الاختيار لم يعد متاحًا' }),
  );
```

- [ ] **Step 5: Controller.** In `hotel.controller.ts`, add `Header`, `HttpCode` and `HttpStatus` to the `@nestjs/common` import, and import `HotelAvailabilityService`, `staySearchQuerySchema`, `stayQuoteBodySchema`, `SearchHotelStaysSwagger`, `StayQuoteSwagger`, and the types `StayQuoteBody` and `StaySearchQuery` (with `import type`). Inject the service: `constructor(private readonly hotelService: HotelService, private readonly hotelAvailabilityService: HotelAvailabilityService) {}`. Insert between `findAll` and `findOne`; `search` must stay above `@Get(':id')`:

```ts
  @IsPublic(true)
  @Get('search')
  @Header('Cache-Control', 'no-store')
  @UseFilters(AvailabilityExceptionFilter)
  @SearchHotelStaysSwagger()
  search(@Query(new ZodValidationPipe(staySearchQuerySchema)) query: StaySearchQuery) {
    return this.hotelAvailabilityService.search(query);
  }
```

Add after `findOne`:

```ts
  @IsPublic(true)
  @Post(':hotelId/stay-quote')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseFilters(AvailabilityExceptionFilter)
  @StayQuoteSwagger()
  quote(@Param('hotelId') hotelId: string, @Body(new ZodValidationPipe(stayQuoteBodySchema)) body: StayQuoteBody) {
    return this.hotelAvailabilityService.quote(hotelId, body);
  }
```

- [ ] **Step 6: Build.** `npm run build`. Expected: exit 0.

- [ ] **Step 7: Write `.tmp/availability-verify/stay.mjs`**

```js
import { isDeepStrictEqual } from 'node:util';
import { IDS, check, checkError, day, reseed, send } from './harness.mjs';

const searchEp = 'GET /hotel/search';
const quoteEp = 'POST /hotel/:hotelId/stay-quote';
const stayA = { check_in: day(10), check_out: day(12) };
const party = { adults: 4, children: 1 };
const egp = { visitor_category: 'egyptian-resident' };
const usd = { visitor_category: 'other' };
const both = [{ room_id: IDS.double, quantity: 1 }, { room_id: IDS.family, quantity: 1 }];
const search = (params) => send('GET', `/hotel/search?${new URLSearchParams({ destination: 'SHARM_EL_SHEIKH', ...params })}`);
const quote = (body, hotelId = IDS.hotel) => send('POST', `/hotel/${hotelId}/stay-quote`, { body });
const offerOf = (response) => response.body?.data?.[0]?.stay_offer;
const emptyPage = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };

export default async function stay() {
  reseed();

  const found = await search({ ...stayA, ...egp, ...party });
  check(searchEp, 'handoff example (EGP)', '1 hotel, PRICED 26400.00, double + family', found.status === 200 && found.body?.data?.length === 1 && found.body.data[0].hotel?.id === IDS.hotel && Array.isArray(found.body.data[0].hotel?.translations) && isDeepStrictEqual(offerOf(found), { nights: 2, currency: 'EGP', pricing_status: 'PRICED', total: '26400.00', rooms: both }) && isDeepStrictEqual(found.body.meta, { total: 1, page: 1, limit: 20, totalPages: 1 }), found.body);
  check(searchEp, 'no-store header', 'Cache-Control: no-store', found.headers.get('cache-control') === 'no-store', found.headers.get('cache-control'));
  const foundUsd = await search({ ...stayA, ...usd, ...party });
  check(searchEp, 'same stay in USD', 'PRICED 540.00 USD', offerOf(foundUsd)?.total === '540.00' && offerOf(foundUsd)?.currency === 'USD', foundUsd.body);
  const onRequest = await search({ check_in: day(14), check_out: day(15), ...egp, adults: 2 });
  check(searchEp, 'only an unpriced type (EGP)', 'ON_REQUEST, total null, suite', isDeepStrictEqual(offerOf(onRequest), { nights: 1, currency: 'EGP', pricing_status: 'ON_REQUEST', total: null, rooms: [{ room_id: IDS.suite, quantity: 1 }] }), onRequest.body);
  const sameInUsd = await search({ check_in: day(14), check_out: day(15), ...usd, adults: 2 });
  check(searchEp, 'USD has its own price, no fallback', 'PRICED 300.00', offerOf(sameInUsd)?.total === '300.00', sameInUsd.body);
  for (const [name, params] of [
    ['one closed night', { check_in: day(10), check_out: day(13), adults: 2 }],
    ['stock split across types', { check_in: day(16), check_out: day(18), adults: 2 }],
    ['no hotels in destination', { ...stayA, adults: 2, destination: 'DAHAB' }],
  ]) {
    const empty = await search({ ...egp, ...params });
    check(searchEp, name, '200, empty page', empty.status === 200 && isDeepStrictEqual(empty.body, emptyPage), empty.body);
  }
  for (const [name, params, field] of [
    ['missing destination', { destination: '', ...stayA, ...egp, adults: 2 }, 'destination'],
    ['unknown visitor category', { ...stayA, visitor_category: 'tourist', adults: 2 }, 'visitor_category'],
    ['check-in in the past', { check_in: day(-1), check_out: day(1), ...egp, adults: 2 }, 'check_in'],
    ['check-out not after check-in', { check_in: day(10), check_out: day(10), ...egp, adults: 2 }, 'check_out'],
    ['31 nights', { check_in: day(10), check_out: day(41), ...egp, adults: 2 }, 'check_out'],
    ['beyond booking window', { check_in: day(364), check_out: day(366), ...egp, adults: 2 }, 'check_out'],
    ['no adults', { ...stayA, ...egp, adults: 0 }, 'adults'],
    ['21 guests', { ...stayA, ...egp, adults: 11, children: 10 }, 'adults'],
    ['limit above 100', { ...stayA, ...egp, adults: 2, limit: 101 }, 'limit'],
  ]) {
    checkError(searchEp, name, await search(params), 400, 'INVALID_INPUT', field);
  }

  const recommended = await quote({ ...stayA, ...party, ...egp });
  check(quoteEp, 'recommendation matches search', 'double + family, 26400.00, no upgrades', recommended.status === 200 && isDeepStrictEqual(recommended.body?.rooms?.map(({ room_id, quantity }) => ({ room_id, quantity })), both) && recommended.body?.total === '26400.00' && isDeepStrictEqual(recommended.body?.addons, []) && recommended.body?.addons_total === '0.00', recommended.body);
  check(quoteEp, 'available room types', 'double 12000.00, family 14400.00, suite null, max 1 each', isDeepStrictEqual(recommended.body?.available_room_types, [
    { room_id: IDS.double, capacity: 2, max_quantity: 1, unit_stay_total: '12000.00' },
    { room_id: IDS.family, capacity: 3, max_quantity: 1, unit_stay_total: '14400.00' },
    { room_id: IDS.suite, capacity: 4, max_quantity: 1, unit_stay_total: null },
  ]), recommended.body?.available_room_types);

  const exact = await quote({ ...stayA, ...party, ...egp, rooms: both, addons: [{ addon_id: IDS.upgrade, quantity: 1 }] });
  check(quoteEp, 'handoff exact quote with upgrade', 'PRICED 28200.00 with nightly lines', exact.status === 200 && exact.body?.pricing_status === 'PRICED' && exact.body?.room_total === '26400.00' && exact.body?.addons_total === '1800.00' && exact.body?.total === '28200.00' && isDeepStrictEqual(exact.body?.rooms?.[0]?.nightly_rates, [{ date: day(10), unit_rate: '5000.00' }, { date: day(11), unit_rate: '7000.00' }]) && isDeepStrictEqual(exact.body?.addons, [{ addon_id: IDS.upgrade, quantity: 1, unit_rate: '900.00', subtotal: '1800.00' }]) && !Number.isNaN(Date.parse(exact.body?.quoted_at)), exact.body);
  check(quoteEp, 'no-store header', 'Cache-Control: no-store', exact.headers.get('cache-control') === 'no-store', exact.headers.get('cache-control'));

  const unpriced = await quote({ check_in: day(14), check_out: day(15), ...egp, adults: 2, rooms: [{ room_id: IDS.suite, quantity: 1 }] });
  check(quoteEp, 'missing EGP rate', 'ON_REQUEST with null lines', unpriced.body?.pricing_status === 'ON_REQUEST' && unpriced.body?.total === null && unpriced.body?.room_total === null && unpriced.body?.rooms?.[0]?.subtotal === null && unpriced.body?.rooms?.[0]?.nightly_rates?.[0]?.unit_rate === null, unpriced.body);

  checkError(quoteEp, 'more units than every night allows', await quote({ ...stayA, ...egp, adults: 4, rooms: [{ room_id: IDS.double, quantity: 2 }] }), 409, 'STAY_UNAVAILABLE', 'rooms');
  checkError(quoteEp, 'stay with a closed night', await quote({ check_in: day(10), check_out: day(13), ...party, ...egp, rooms: both }), 409, 'STAY_UNAVAILABLE', 'rooms');
  checkError(quoteEp, 'selection too small', await quote({ ...stayA, ...party, ...egp, rooms: [{ room_id: IDS.double, quantity: 1 }] }), 409, 'STAY_UNAVAILABLE', 'rooms');
  checkError(quoteEp, 'room of another hotel', await quote({ ...stayA, ...egp, adults: 2, rooms: [{ room_id: IDS.legacyRoom, quantity: 1 }] }), 409, 'STAY_UNAVAILABLE', 'rooms');
  checkError(quoteEp, 'unknown upgrade', await quote({ ...stayA, ...party, ...egp, rooms: both, addons: [{ addon_id: IDS.missing, quantity: 1 }] }), 409, 'STAY_UNAVAILABLE', 'addons');
  checkError(quoteEp, 'no combination', await quote({ check_in: day(16), check_out: day(18), ...egp, adults: 2 }), 409, 'STAY_UNAVAILABLE');
  for (const [name, overrides, field] of [
    ['empty rooms', { rooms: [] }, 'rooms'],
    ['duplicate rooms', { rooms: [{ room_id: IDS.double, quantity: 1 }, { room_id: IDS.double, quantity: 1 }] }, 'rooms'],
    ['zero quantity', { rooms: [{ room_id: IDS.double, quantity: 0 }] }, 'rooms.0.quantity'],
    ['malformed room id', { rooms: [{ room_id: 'r_double', quantity: 1 }] }, 'rooms.0.room_id'],
    ['upgrades without rooms', { addons: [{ addon_id: IDS.upgrade, quantity: 1 }] }, 'addons'],
    ['more rooms than guests', { adults: 1, rooms: both }, 'rooms'],
    ['more upgrades than rooms', { rooms: [{ room_id: IDS.family, quantity: 1 }], addons: [{ addon_id: IDS.upgrade, quantity: 2 }] }, 'addons'],
  ]) {
    checkError(quoteEp, name, await quote({ ...stayA, ...egp, adults: 2, ...overrides }), 400, 'INVALID_INPUT', field);
  }
  checkError(quoteEp, 'non-uuid hotel', await quote({ ...stayA, ...egp, adults: 2 }, 'h_123'), 404, 'NOT_FOUND');
  checkError(quoteEp, 'unknown hotel', await quote({ ...stayA, ...egp, adults: 2 }, IDS.missing), 404, 'NOT_FOUND');

  await send('PATCH', `/hotel/${IDS.hotel}/rooms/${IDS.double}/calendar`, { auth: true, body: { revision: 0, changes: [{ from: day(11), to: day(12), rate_override: { EGP: '7500.00' } }] } });
  const requote = await quote({ ...stayA, ...party, ...egp, rooms: both });
  check(quoteEp, 'requote after a rate change', '200, total 26900.00', requote.body?.total === '26900.00', requote.body);
  await send('PATCH', `/hotel/${IDS.hotel}/rooms/${IDS.family}/calendar`, { auth: true, body: { revision: 0, changes: [{ from: day(11), to: day(12), available_units: 0 }] } });
  checkError(quoteEp, 'requote after a night closes', await quote({ ...stayA, ...party, ...egp, rooms: both }), 409, 'STAY_UNAVAILABLE', 'rooms');

  await send('PATCH', `/hotel/${IDS.hotel}`, { auth: true, form: { rooms_write_mode: 'by_id', delete_room_ids: [IDS.suite] } });
  const afterDelete = await search({ check_in: day(14), check_out: day(15), ...usd, adults: 2 });
  check(searchEp, 'deleted room type is never offered', 'empty page', isDeepStrictEqual(afterDelete.body, emptyPage), afterDelete.body);

  const catalog = await send('GET', '/hotel?destination=SHARM_EL_SHEIKH');
  check('GET /hotel', 'catalog without dates', '200, both hotels with rooms, addons and translations', catalog.status === 200 && catalog.body?.data?.length === 2 && catalog.body.data.every((hotel) => Array.isArray(hotel.rooms) && Array.isArray(hotel.addons) && Array.isArray(hotel.translations)), catalog.body?.meta);
  const one = await send('GET', `/hotel/${IDS.hotel}`);
  check('GET /hotel/:id', 'hotel by id', '200 with stable room ids', one.status === 200 && one.body?.rooms?.some((room) => room.id === IDS.double), one.status);
}
```

`.tmp/availability-verify/errors.mjs`:

```js
import { check, day, send } from './harness.mjs';

export default async function errors() {
  const path = `/hotel/search?${new URLSearchParams({ destination: 'SHARM_EL_SHEIKH', check_in: day(10), check_out: day(12), adults: '2', visitor_category: 'other' })}`;
  const burst = await Promise.all(Array.from({ length: 8 }, () => send('GET', path, { retryOn429: false })));
  const limited = burst.find((response) => response.status === 429);
  check('GET /hotel/search', 'burst of 8 requests', '429 RATE_LIMITED', limited?.body?.code === 'RATE_LIMITED' && limited?.body?.statusCode === 429, burst.map((response) => response.status));
}
```

- [ ] **Step 8: Run it.** `. .\.tmp\local-session.ps1; node .tmp/availability-verify/run.mjs stay errors`. Expected: `43/43 passed`.

- [ ] **Step 9: Lint and commit**

```powershell
npx eslint --fix src/modules/hotel-availability src/modules/hotel/hotel.controller.ts
git add src/modules/hotel-availability src/modules/hotel/hotel.controller.ts
git commit -m "feat(availability): add dated hotel search and stay quotes"
```

---

## Task 12: README

- [ ] **Step 1: Edit `README.md`.**
  - In the project tree, add `│   ├── seed-hotel-availability.ts # Local-only availability fixtures` under `seed.ts`, and `│       ├── hotel-availability/ # Dated search, stay quotes, room calendar` under `addon/`.
  - In the Hotels table, add these rows and change the `PATCH /hotel/:id` description to `Update hotel (\`rooms_write_mode=by_id\` keeps room IDs)`:

```markdown
| `GET` | `/hotel/search` | Dated availability search (public) |
| `POST` | `/hotel/:hotelId/stay-quote` | Price a stay: recommendation or exact rooms and upgrades (public) |
```

  - After the Add-ons table, add:

```markdown
#### Room calendar *(admin, nested under hotel)*

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/hotel/:hotelId/rooms/:roomId/calendar?from=&to=` | Nightly units, rate overrides, base rates and revision (`to` exclusive, up to 365 nights) |
| `PATCH` | `/hotel/:hotelId/rooms/:roomId/calendar` | Atomic batch of changes guarded by `revision` (a stale revision returns `409 CALENDAR_CONFLICT`) |

#### Hotel availability rules

- **Tariff:** `visitor_category=egyptian-resident` prices in EGP and `other` in USD, with no conversion.
- **Stay:** `check_in` today or later (Africa/Cairo), 1–30 nights, `check_out` within 365 days; adults ≥ 1 and at most 20 guests.
- **Stock:** a room type is offered when it has a `capacity` (1–50) and at least one unit on every night; nights without a calendar row are closed. The nightly rate is that night's override, else the room's base price if above zero, else on request.
- **Recommendation:** the cheapest fully priced combination, then fewer rooms, then the lowest room IDs; otherwise the fewest rooms on request (`pricing_status: ON_REQUEST`, `total: null`).
- **Room IDs:** `PATCH /hotel/:id` with `rooms_write_mode=by_id` updates rows that have an `id`, creates rows without one, and archives `delete_room_ids`. Once a hotel has a calendar write, replacing rooms without `by_id` returns `409 ROOM_IDS_REQUIRED`.
- **Errors** on these routes have the shape `{ statusCode, code, message, field?, errors? }`, with codes `INVALID_INPUT`, `UNAUTHENTICATED`, `NOT_FOUND`, `STAY_UNAVAILABLE`, `CALENDAR_CONFLICT`, `ROOM_IDS_REQUIRED`, `RATE_LIMITED` and `INTERNAL_ERROR`.
```

  - In the schema diagram, replace `       ├── Room` with `       ├── Room ──── RoomCalendarDay (nightly units and rate overrides)`.
  - In Seeding, add: ``For local availability testing, `npm run seed:availability` resets two fixture hotels in `SHARM_EL_SHEIKH` with calendar data relative to today in Cairo. It refuses any database host other than localhost.``
  - In Available Scripts, add `| \`npm run seed:availability\` | Reset local availability fixtures (local databases only) |` after `npm run seed`.

- [ ] **Step 2: Commit.** `git add README.md; git commit -m "docs: document hotel availability, room calendar and stable room ids"`

---

## Task 13: Full verification

- [ ] **Step 1: Unit tests.** `npx jest src/modules/hotel-availability`. Expected: `Tests: 31 passed`.
- [ ] **Step 2: Build.** `npm run build`. Expected: exit 0.
- [ ] **Step 3: Lint every changed file.** Run `git diff --name-only main...HEAD -- '*.ts'`, then `npx eslint` on those files without `--fix`. Expected: 0 errors.
- [ ] **Step 4: Live matrix.** With the server running: `. .\.tmp\local-session.ps1; node .tmp/availability-verify/run.mjs all`. Expected: all 108 cases pass. Fix any failure in the code (or the case, if the case itself is wrong), rerun, and never report a red case as known.
- [ ] **Step 5: Report** (Arabic, per the `test-endpoints` skill): paste the printed table and `N/N passed`. Note what was skipped and why: `POST /hotel` with images (would upload to the real ImageKit account; its room-row schema is exercised through legacy `PATCH` rows), and the 500 path (covered by the filter unit test).
- [ ] **Step 6: Stop the background server** started in Task 8, and check `git status` is clean apart from the gitignored files.

---

## Task 14: Pre-merge checks and frontend handoff

- [ ] **Step 1: Ask the owner's permission** for a read-only production check. Only with a yes, run against `.env`'s URL without printing it. Parse it as in `local-session.ps1` but skip the host guard, and use only these `SELECT`s:

```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'room' ORDER BY ORDINAL_POSITION;
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;
```

Record whether `room.capacity` exists, that `room.id` uses `utf8mb4_unicode_ci`, and that no migration is unfinished. The migration handles both capacity cases.

- [ ] **Step 2: Draft the frontend message (English)** for the user to send after deploy. Include: the new routes, the limits table (spec section 10), example responses from the local run, and the seven questions in spec section 13. Also cover how to get test data in production: an admin sets room capacities, then writes a calendar.
- [ ] **Step 3: Hand over.** Tell the user the branch is ready, list the commits, and suggest `/ready-for-leader` before they push. Do not push.
