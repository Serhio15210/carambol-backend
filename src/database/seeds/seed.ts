// Fills the database with the data the app needs to start: the first superadmin and, outside
// production, demo tables. Run after migrations: npm run migration:run && npm run seed.
// Safe to run again: everything that already exists is left as it is.
import dataSource from '../data-source';
import { User } from '@/modules/users/entities/user.entity';
import { BilliardTable } from '@/modules/tables/entities/billiard-table.entity';
import { BilliardTableType } from '@/modules/tables/types/table-type.enum';
import { MIN_GAP_CM } from '@/modules/tables/table-layout';
import { ensureSuperadmin, SuperadminSettings } from './superadmin.seed';
import { planTableGrid } from './table-grid';

const DEMO_TABLES = 6;

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

async function seedDemoTables(): Promise<void> {
  const repo = dataSource.getRepository(BilliardTable);
  const types = Object.values(BilliardTableType);
  const placements = planTableGrid(DEMO_TABLES, 3, { lengthCm: 300, widthCm: 150 }, MIN_GAP_CM);

  for (const [index, placement] of placements.entries()) {
    const number = index + 1;
    if (await repo.findOneBy({ number })) continue; // a table with this number is already there
    await repo.save(repo.create({ ...placement, number, type: types[index % types.length] }));
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
      console.log('Production: demo tables skipped');
      return;
    }
    await seedDemoTables();
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
