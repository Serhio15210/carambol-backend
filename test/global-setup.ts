import { execSync } from 'child_process';
import { Client } from 'pg';
import { TEST_DATABASE_URL, useTestEnv } from './test-env';

// Runs once before all e2e test files: creates the test database if needed and brings its
// schema up to date with OUR migrations, so every run also proves the migrations work.
export default async function globalSetup(): Promise<void> {
  useTestEnv();
  await createDatabaseIfMissing();
  // The same command a deploy runs; DATABASE_URL in the env points it at the test database.
  execSync('npm run migration:run', { stdio: 'inherit', env: process.env });
}

async function createDatabaseIfMissing(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  url.pathname = '/postgres'; // a database that always exists, to run CREATE DATABASE from

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}
