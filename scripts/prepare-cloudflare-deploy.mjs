import { readFileSync, writeFileSync } from 'node:fs';

const settings = JSON.parse(readFileSync(new URL('../cloudflare-deploy.json', import.meta.url), 'utf8'));
const database = settings.d1_databases?.[0];
if (settings.d1_databases?.length !== 1 || database?.binding !== 'DB' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(database?.database_id ?? '')) {
  console.error('Check the DB binding and database ID in cloudflare-deploy.json.');
  process.exit(1);
}

const path = 'dist/server/wrangler.json';
let config;
try {
  config = JSON.parse(readFileSync(path, 'utf8'));
} catch {
  console.error('Build the app first with npm run build.');
  process.exit(1);
}
if (!Array.isArray(config.d1_databases) || config.d1_databases.length !== 1 || config.d1_databases[0].binding !== 'DB') {
  console.error('Expected one D1 database with the DB binding.');
  process.exit(1);
}
config.name = settings.worker_name;
config.d1_databases[0].database_name = database.database_name;
config.d1_databases[0].database_id = database.database_id;
writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log('Cloudflare deployment config is ready.');
