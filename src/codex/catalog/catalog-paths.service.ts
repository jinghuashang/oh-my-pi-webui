/** Resolves catalog and user-config locations even when Codex cannot initialize. */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

@Injectable()
export class CatalogPathsService {
  constructor(private readonly config: ConfigService) {}

  /** Absolute engine home passed to both the app-server and validation subprocesses. */
  get home(): string {
    return resolve(
      this.config.get<string>('WEBUI_HOME') || join(homedir(), '.omp'),
    );
  }
  /** User-level config path, independent of config/read. */
  get configFile(): string {
    // omp keeps its user configuration inside the home directory; resolving it
    // from `home` keeps a disposable fixture home from touching the real one.
    const ompConfig = join(this.home, 'agent', 'config.yml');
    if (existsSync(ompConfig)) return ompConfig;
    return join(this.home, 'config.toml');
  }
  /** Application-owned writable catalog directory, persisted inside the WebUI home. */
  get directory(): string {
    return join(this.home, 'webui', 'model-catalog');
  }
  /** Prefer the project's bridge unless BRIDGE_BIN explicitly overrides it. */
  get binary(): string {
    const override = this.config.get<string>('BRIDGE_BIN');
    if (override) return override.includes('/') || override.includes('\\') ? resolve(override) : override;
    return resolve('bridge/dist/index.js');
  }
}
