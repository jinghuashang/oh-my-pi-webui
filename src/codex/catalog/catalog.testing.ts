/** Isolated filesystem fixtures shared by catalog behavior tests. */
import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CatalogPathsService } from './catalog-paths.service';
import { CatalogStorageService } from './catalog-storage.service';

export const draftCatalog = JSON.stringify({
  models: [
    {
      slug: 'custom-model',
      visibility: 'list',
      base_instructions: 'Be useful.',
    },
  ],
});

/** Creates a disposable WebUI home, never touching the developer's configuration or database. */
export function catalogFixture() {
  const home = mkdtempSync(join(tmpdir(), 'catalog-test-'));
  // pnpm installs the CLI as a shell shim on Windows; spawning the extensionless
  // name there fails with ENOENT because no executable by that name exists.
  const cli = resolve(
    'node_modules/.bin',
    process.platform === 'win32' ? 'codex.cmd' : 'codex',
  );
  const paths = new CatalogPathsService(
    new ConfigService({
      WEBUI_HOME: home,
      BRIDGE_BIN: cli,
    }),
  );
  const storage = new CatalogStorageService(paths);
  storage.ensureDirectory();
  return {
    home,
    paths,
    storage,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}
