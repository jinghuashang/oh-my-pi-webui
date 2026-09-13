import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface OmpSettingItem {
  key: string;
  value: unknown;
  type: 'boolean' | 'string' | 'number' | 'enum' | 'array' | 'record';
  description: string;
  options?: string[] | null;
}

export interface OmpCategory {
  id: string;
  name: string;
  icon: string;
  items: OmpSettingItem[];
}

export interface OmpConfigData {
  categories: OmpCategory[];
  totalSettings: number;
}

const CATEGORY_META: Record<string, { name: string; icon: string }> = {
  agent: { name: 'Agent', icon: '🤖' },
  appearance: { name: 'Appearance', icon: '🎨' },
  model: { name: 'Model', icon: '🤖' },
  interaction: { name: 'Interaction', icon: '📑' },
  context: { name: 'Context', icon: '📋' },
  memory: { name: 'Memory', icon: '🧠' },
  files: { name: 'Files', icon: '📁' },
  shell: { name: 'Shell', icon: '🖥️' },
  tools: { name: 'Tools', icon: '🔧' },
  tasks: { name: 'Tasks', icon: '📦' },
  providers: { name: 'Providers', icon: '🌐' },
  plugins: { name: 'Plugins', icon: '🧩' },
};

/** Category ids in the order the settings rail lists them. */
const ORDERED_CATEGORY_IDS = [
  'agent',
  'appearance',
  'model',
  'interaction',
  'context',
  'memory',
  'files',
  'shell',
  'tools',
  'tasks',
  'providers',
  'plugins',
];

/**
 * Keys under omp's `[internal]` section that describe the agent itself rather
 * than the product surface; the rest of that section is deployment plumbing.
 */
const AGENT_KEYS: Record<string, true> = {
  enabledModels: true,
  enabledProviders: true,
  disabledProviders: true,
  modelRoles: true,
  modelTags: true,
  modelProviderOrder: true,
  cycleOrder: true,
  shellPath: true,
};

/** Section mapping: omp's own `[internal]` section is the agent's own config. */
const SECTION_TO_CATEGORY: Record<string, string> = {
  internal: 'agent',
};

@Injectable()
export class OmpConfigService {
  private readonly logger = new Logger(OmpConfigService.name);
  private cachedConfig: OmpConfigData | null = null;
  private cacheExpiresAt = 0;

  private get ompBin(): string {
    return process.env.OMP_BIN || 'omp';
  }

  /**
   * Reads all OMP configuration items grouped by the 11 official categories.
   */
  async getConfig(forceRefresh = false): Promise<OmpConfigData> {
    const now = Date.now();
    if (!forceRefresh && this.cachedConfig && now < this.cacheExpiresAt) {
      return this.cachedConfig;
    }

    try {
      const [listResult, jsonResult] = await Promise.all([
        execFileAsync(this.ompBin, ['config', 'list'], { timeout: 8000 }),
        execFileAsync(this.ompBin, ['config', 'list', '--json'], { timeout: 8000 }),
      ]);

      const rawJson = JSON.parse(jsonResult.stdout) as Record<
        string,
        { value?: unknown; type: string; description?: string }
      >;

      const categoriesMap: Record<string, OmpCategory> = {};
      for (const id of ORDERED_CATEGORY_IDS) {
        categoriesMap[id] = {
          id,
          name: CATEGORY_META[id].name,
          icon: CATEGORY_META[id].icon,
          items: [],
        };
      }

      let currentSection = 'internal';
      for (const line of listResult.stdout.split('\n')) {
        const secMatch = line.match(/^\[(.*)\]$/);
        if (secMatch) {
          currentSection = secMatch[1].toLowerCase().trim();
          continue;
        }

        const trimmed = line.trim();
        if (!trimmed) continue;

        const kvMatch = trimmed.match(/^([a-zA-Z0-9._-]+)\s*=\s*(.*)$/);
        if (!kvMatch) continue;

        const key = kvMatch[1];
        const rest = kvMatch[2];
        const optMatch = rest.match(/\(([^)]+)\)$/);
        let options: string[] | null = null;
        if (optMatch && optMatch[1].includes('|')) {
          options = optMatch[1].split('|').map((o) => o.trim());
        }

        const meta = rawJson[key];
        const settingType = (meta?.type || 'string') as OmpSettingItem['type'];
        const settingItem: OmpSettingItem = {
          key,
          value: meta?.value,
          type: settingType,
          description: meta?.description || '',
          options,
        };

        // Determine target category. Extension and skill keys are plugin
        // surface no matter which section omp files them under; the rest of
        // omp's own `[internal]` section is the agent's configuration.
        let targetCategory: string;
        if (
          key.startsWith('skills.') ||
          key.startsWith('mcp.') ||
          key.startsWith('commands.') ||
          key === 'extensions' ||
          key === 'disabledExtensions'
        ) {
          targetCategory = 'plugins';
        } else if (currentSection === 'internal') {
          targetCategory = AGENT_KEYS[key] === true ? 'agent' : '';
        } else {
          targetCategory = SECTION_TO_CATEGORY[currentSection] ?? currentSection;
        }

        if (targetCategory && categoriesMap[targetCategory]) {
          categoriesMap[targetCategory].items.push(settingItem);
        }
      }

      let total = 0;
      const categories = ORDERED_CATEGORY_IDS.map((id) => {
        const cat = categoriesMap[id];
        total += cat.items.length;
        return cat;
      });

      this.cachedConfig = { categories, totalSettings: total };
      this.cacheExpiresAt = now + 30_000; // cache for 30s
      return this.cachedConfig;
    } catch (err) {
      this.logger.error(`Failed to read omp config: ${String(err)}`);
      if (this.cachedConfig) return this.cachedConfig;
      throw err;
    }
  }

  /**
   * Sets a single OMP configuration setting via `omp config set`.
   */
  async setSetting(key: string, value: unknown): Promise<{ success: boolean; message: string }> {
    let strVal: string;
    if (typeof value === 'boolean') {
      strVal = value ? 'true' : 'false';
    } else if (typeof value === 'number') {
      strVal = String(value);
    } else if (typeof value === 'object' && value !== null) {
      strVal = JSON.stringify(value);
    } else {
      strVal = String(value ?? '');
    }

    try {
      const { stdout } = await execFileAsync(this.ompBin, ['config', 'set', key, strVal], {
        timeout: 8000,
      });
      this.cachedConfig = null; // Invalidate cache
      return { success: true, message: stdout.trim() };
    } catch (err) {
      this.logger.error(`Failed to set ${key} = ${strVal}: ${String(err)}`);
      throw err;
    }
  }

  /**
   * Sets multiple OMP configuration settings in sequence.
   */
  async batchSetSettings(
    updates: Array<{ key: string; value: unknown }>,
  ): Promise<{ success: boolean; updated: number }> {
    for (const { key, value } of updates) {
      await this.setSetting(key, value);
    }
    this.cachedConfig = null;
    return { success: true, updated: updates.length };
  }
}
