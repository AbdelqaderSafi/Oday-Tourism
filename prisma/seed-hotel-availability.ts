import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { Prisma, PrismaClient } from 'generated/prisma/client';
import {
  addDays,
  hotelToday,
} from 'src/modules/hotel-availability/engine/stay-dates';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is missing');
const { hostname } = new URL(url);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
  process.env.NODE_ENV === 'production'
) {
  throw new Error(
    `Refusing to write availability fixtures to ${hostname}: local databases only.`,
  );
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

const room = (
  id: string,
  capacity: number | null,
  usd: string,
  egp: string | null,
  en: string,
  ar: string,
) => ({
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
    {
      language: 'en' as const,
      name: en,
      description: `${en} for local availability tests`,
      Facilities: ['Pool'],
    },
    {
      language: 'ar' as const,
      name: ar,
      description: `${ar} لاختبارات التوافر المحلية`,
      Facilities: ['مسبح'],
    },
  ],
});

async function removeFixtures(tx: Prisma.TransactionClient) {
  const inFixtureHotels = { hotel_id: { in: FIXTURE_HOTEL_IDS } };
  const roomIds = (
    await tx.room.findMany({ where: inFixtureHotels, select: { id: true } })
  ).map((r) => r.id);
  if (roomIds.length) {
    await tx.$executeRaw`DELETE FROM room_calendar_days WHERE room_id IN (${Prisma.join(roomIds)})`;
    await tx.roomTranslation.deleteMany({
      where: { room_id: { in: roomIds } },
    });
    await tx.room.deleteMany({ where: { id: { in: roomIds } } });
  }
  const addonIds = (
    await tx.hotelAddon.findMany({
      where: inFixtureHotels,
      select: { id: true },
    })
  ).map((a) => a.id);
  if (addonIds.length) {
    await tx.hotelAddonTranslation.deleteMany({
      where: { addon_id: { in: addonIds } },
    });
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
          translations: hotelTranslations(
            'Availability Test Hotel',
            'فندق اختبار التوافر',
          ),
          rooms: {
            create: [
              room(
                DOUBLE_ROOM_ID,
                2,
                '100.00',
                '5000.00',
                'Double Room',
                'غرفة مزدوجة',
              ),
              room(
                FAMILY_ROOM_ID,
                3,
                '150.00',
                '7200.00',
                'Family Room',
                'غرفة عائلية',
              ),
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
                    {
                      language: 'en',
                      name: 'Sea view upgrade',
                      description: 'Upgrade to a sea view room',
                    },
                    {
                      language: 'ar',
                      name: 'ترقية لإطلالة بحرية',
                      description: 'ترقية الغرفة إلى إطلالة على البحر',
                    },
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
          translations: hotelTranslations(
            'Legacy Catalog Hotel',
            'فندق الكتالوج القديم',
          ),
          rooms: {
            create: [
              room(
                LEGACY_ROOM_ID,
                null,
                '80.00',
                '4000.00',
                'Standard Room',
                'غرفة قياسية',
              ),
            ],
          },
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
  console.log(
    `Availability fixtures ready. Cairo today ${today}; main stay ${addDays(today, 10)} to ${addDays(today, 12)}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
