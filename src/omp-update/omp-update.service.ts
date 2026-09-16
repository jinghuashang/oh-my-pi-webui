import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  OmpUpgradeRequestDto,
  OmpUpgradeResponseDto,
  OmpVersionResponseDto,
} from './dto/omp-update.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class OmpUpdateService {
  private readonly logger = new Logger(OmpUpdateService.name);
  private cachedCheck: { result: OmpVersionResponseDto; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  private get ompBin(): string {
    return this.configService.get<string>('OMP_BIN') || 'omp';
  }

  /**
   * Compares two semantic version strings (e.g. "18.2.1" vs "18.1.19").
   * Returns > 0 if a > b, < 0 if a < b, 0 if equal.
   */
  compareSemver(a: string, b: string): number {
    const cleanA = a.replace(/^v/, '').trim();
    const cleanB = b.replace(/^v/, '').trim();
    const partsA = cleanA.split('.').map((p) => parseInt(p, 10) || 0);
    const partsB = cleanB.split('.').map((p) => parseInt(p, 10) || 0);

    const maxLen = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < maxLen; i++) {
      const segA = partsA[i] ?? 0;
      const segB = partsB[i] ?? 0;
      if (segA !== segB) {
        return segA - segB;
      }
    }
    return 0;
  }

  /**
   * Gets currently installed OMP version by invoking `omp --version`.
   */
  async getCurrentVersion(): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.ompBin, ['--version'], { timeout: 6000 });
      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      if (match) {
        return match[1];
      }
      return stdout.trim().replace(/^omp\/?/i, '') || 'unknown';
    } catch (err) {
      this.logger.warn(`Failed to detect local omp version: ${String(err)}`);
      return '18.1.19';
    }
  }

  /**
   * Checks for updates by querying GitHub releases API with fallback to `omp update --check`.
   */
  async checkUpdate(forceRefresh = false): Promise<OmpVersionResponseDto> {
    const now = Date.now();
    if (!forceRefresh && this.cachedCheck && this.cachedCheck.expiresAt > now) {
      return this.cachedCheck.result;
    }

    const currentVersion = await this.getCurrentVersion();
    let latestVersion = currentVersion;
    let releaseNotes: string | undefined;
    let releaseUrl: string | undefined;

    // 1. Try GitHub Releases API first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('https://api.github.com/repos/can1357/oh-my-pi/releases/latest', {
        headers: {
          'User-Agent': 'oh-my-pi-webui',
          Accept: 'application/vnd.github.v3+json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as {
          tag_name?: string;
          name?: string;
          body?: string;
          html_url?: string;
        };
        const rawTag = data.tag_name || data.name || '';
        const match = rawTag.match(/(\d+\.\d+\.\d+)/);
        if (match) {
          latestVersion = match[1];
          releaseNotes = data.body || undefined;
          releaseUrl = data.html_url || 'https://github.com/can1357/oh-my-pi/releases';
        }
      }
    } catch (err) {
      this.logger.debug(`GitHub release check skipped/failed: ${String(err)}`);
    }

    // 2. If GitHub fetch didn't return a higher version, verify with `omp update --check`
    if (latestVersion === currentVersion) {
      try {
        const { stdout } = await execFileAsync(this.ompBin, ['update', '--check'], {
          timeout: 10_000,
        });
        const match = stdout.match(/([Nn]ew version|[Uu]pdate available.*?|[Ll]atest.*?)\s*v?(\d+\.\d+\.\d+)/);
        if (match && match[2]) {
          latestVersion = match[2];
        }
      } catch (err) {
        this.logger.debug(`omp update --check failed: ${String(err)}`);
      }
    }

    const hasUpdate = this.compareSemver(latestVersion, currentVersion) > 0;

    const result: OmpVersionResponseDto = {
      currentVersion,
      latestVersion,
      hasUpdate,
      updateCommand: 'omp update',
      releaseNotes,
      releaseUrl: releaseUrl || 'https://github.com/can1357/oh-my-pi/releases',
      checkedAt: now,
    };

    // Cache check results for 2 minutes
    this.cachedCheck = {
      result,
      expiresAt: now + 120_000,
    };

    return result;
  }

  /**
   * Executes `omp update` command to upgrade the CLI binary.
   */
  async upgrade(dto: OmpUpgradeRequestDto): Promise<OmpUpgradeResponseDto> {
    const args = ['update'];
    if (dto.canary) {
      args.push('--canary');
    }
    if (dto.force) {
      args.push('--force');
    }

    this.logger.log(`Executing omp upgrade with args: ${args.join(' ')}...`);

    try {
      const { stdout, stderr } = await execFileAsync(this.ompBin, args, {
        timeout: 180_000,
        env: {
          ...process.env,
        },
      });

      const output = `${stdout}\n${stderr}`.trim();
      this.cachedCheck = null; // Clear cache so next check sees new version
      const newVersion = await this.getCurrentVersion();

      return {
        success: true,
        message: `Successfully executed update. Current version is now v${newVersion}.`,
        output,
      };
    } catch (err) {
      let output = '';
      if (err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string') {
        output = err.stderr;
      } else {
        output = String(err);
      }
      this.logger.error(`omp update failed: ${output}`);
      return {
        success: false,
        message: `Update execution failed: ${output}`,
        output,
      };
    }
  }
}
