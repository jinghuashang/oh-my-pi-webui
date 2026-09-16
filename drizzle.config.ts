import { defineConfig } from 'drizzle-kit';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

function resolveDatabaseUrl(): string {
  const explicit = process.env.WEBUI_DB_PATH?.trim();
  const webuiHome = process.env.WEBUI_HOME?.trim();
  return join(webuiHome || join(homedir(), '.omp'), 'webui.sqlite');
}

const dbPath = resolveDatabaseUrl();
mkdirSync(dirname(dbPath), { recursive: true });

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
});
