// Fills the database with the data the app needs to start: the first superadmin and, outside
// production, a demo club with a room and tables. Run after migrations:
// npm run migration:run && npm run seed.
// Safe to run again: everything that already exists is left as it is.
import dataSource from '../data-source';
import { User } from '@/modules/users/entities/user.entity';
import { Club } from '@/modules/clubs/entities/club.entity';
import { Room } from '@/modules/clubs/entities/room.entity';
import { BilliardTable } from '@/modules/tables/entities/billiard-table.entity';
import { BilliardTableType } from '@/modules/tables/types/table-type.enum';
import { ensureSuperadmin, SuperadminSettings } from './superadmin.seed';
import { planTableGrid } from './table-grid';

const DEMO_TABLES = 6;
const DEMO_CLUB = {
  name: 'Carambol Demo Club',
  address: 'Khreshchatyk 1, Kyiv',
  lat: 50.4501,
  lng: 30.5234,
  minGapCm: 150,
};
// 3 tables per row need 3 × 300 + 2 × 150 cm, plus a passage to the wall on both sides: 1500 cm.
// 2 rows need 2 × 150 + 150 cm, plus the same margins: 750 cm. The room has some spare space.
const DEMO_ROOM = { name: 'Main hall', widthCm: 1600, lengthCm: 900 };

function readSuperadminSettings(): SuperadminSettings {
  const settings = {
    userName: process.env.SEED_SUPERADMIN_USERNAME,
    email: process.env.SEED_SUPERADMIN_EMAIL,
    phone: process.env.SEED_SUPERADMIN_PHONE,
    password: process.env.SEED_SUPERADMIN_PASSWORD,
  };
  const missing = Object.entries(settings).filter(([, value]) => !value);
  if (missing.length > 0) {
    const names = missing.map(([key]) => `SEED_SUPERADMIN_${key.toUpperCase()}`).join(', ');
    throw new Error(`Set ${names} in .env before seeding`);
  }
  return settings as SuperadminSettings;
}

async function seedDemoClub(): Promise<void> {
  const clubs = dataSource.getRepository(Club);
  const rooms = dataSource.getRepository(Room);
  const tables = dataSource.getRepository(BilliardTable);

  const club =
    (await clubs.findOneBy({ name: DEMO_CLUB.name })) ??
    (await clubs.save(clubs.create(DEMO_CLUB)));
  const room =
    (await rooms.findOneBy({ clubId: club.id, name: DEMO_ROOM.name })) ??
    (await rooms.save(rooms.create({ ...DEMO_ROOM, clubId: club.id })));

  // The grid starts at the room corner; moving it by one passage keeps every table away from the walls.
  const types = Object.values(BilliardTableType);
  const placements = planTableGrid(DEMO_TABLES, 3, { lengthCm: 300, widthCm: 150 }, club.minGapCm);

  for (const [index, placement] of placements.entries()) {
    const number = index + 1;
    if (await tables.findOneBy({ roomId: room.id, number })) continue; // already there
    await tables.save(
      tables.create({
        ...placement,
        x: placement.x + club.minGapCm,
        y: placement.y + club.minGapCm,
        roomId: room.id,
        number,
        type: types[index % types.length],
      }),
    );
    console.log(`Table ${number} created`);
  }
}

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    const settings = readSuperadminSettings();
    const result = await ensureSuperadmin(dataSource.getRepository(User), settings);
    console.log(`Superadmin ${settings.email}: ${result}`);

    if (process.env.NODE_ENV === 'production') {
      console.log('Production: demo club skipped');
      return;
    }
    await seedDemoClub();
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
