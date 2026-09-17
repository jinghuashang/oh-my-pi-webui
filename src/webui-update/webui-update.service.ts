import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  WebuiUpdateProgressDto,
  WebuiUpgradeRequestDto,
  WebuiUpgradeResponseDto,
  WebuiVersionResponseDto,
} from './dto/webui-update.dto';
import { OmpMirrorsResponseDto } from '../omp-update/dto/omp-update.dto';
import { OmpUpdateService } from '../omp-update/omp-update.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class WebuiUpdateService {
  private readonly logger = new Logger(WebuiUpdateService.name);
  private cachedCheck: { result: WebuiVersionResponseDto; expiresAt: number } | null = null;
  private progress: WebuiUpdateProgressDto = {
    status: 'idle',
    stage: '',
    percent: 0,
    outputLog: '',
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly ompUpdateService: OmpUpdateService,
  ) {}

  private get repoRoot(): string {
    return process.cwd();
  }


  getProgress(): WebuiUpdateProgressDto {
    return this.progress;
  }
  /**
   * Reads current WebUI version from package.json.
   */
  getCurrentVersion(): string {
    try {
      const pkgPath = path.join(this.repoRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
        return pkg.version || '0.1.0';
      }
    } catch (err) {
      this.logger.warn(`Failed to read package.json version: ${String(err)}`);
    }
    return '0.1.0';
  }

  /**
   * Gets current short Git commit hash with multi-tier fallback (env, version.json, .git directory, git CLI).
   */
  async getCurrentCommit(): Promise<string> {
    // 1. Check environment variables (e.g. Docker build arg or runtime env)
    const envCommit =
      this.configService.get<string>('WEBUI_COMMIT_SHA')?.trim() ||
      this.configService.get<string>('GIT_COMMIT')?.trim() ||
      process.env.WEBUI_COMMIT_SHA?.trim() ||
      process.env.GIT_COMMIT?.trim();
    if (envCommit && envCommit.length >= 7) {
      return envCommit.slice(0, 7);
    }

    // 2. Check version.json in repoRoot, dist, or parent directory
    for (const vPath of [
      path.join(this.repoRoot, 'version.json'),
      path.join(this.repoRoot, 'dist', 'version.json'),
      path.join(__dirname, '..', '..', 'version.json'),
    ]) {
      try {
        if (fs.existsSync(vPath)) {
          const v = JSON.parse(fs.readFileSync(vPath, 'utf-8')) as { commit?: string };
          if (v.commit && v.commit !== 'unknown') {
            return v.commit.slice(0, 7);
          }
        }
      } catch {}
    }

    // 3. Read .git directly from file system (no git binary needed)
    try {
      const gitDir = path.join(this.repoRoot, '.git');
      if (fs.existsSync(gitDir)) {
        const headPath = path.join(gitDir, 'HEAD');
        if (fs.existsSync(headPath)) {
          const headContent = fs.readFileSync(headPath, 'utf-8').trim();
          if (!headContent.startsWith('ref:')) {
            return headContent.slice(0, 7);
          }
          const refRelative = headContent.slice('ref:'.length).trim();
          const refPath = path.join(gitDir, refRelative);
          if (fs.existsSync(refPath)) {
            return fs.readFileSync(refPath, 'utf-8').trim().slice(0, 7);
          }
          const packedPath = path.join(gitDir, 'packed-refs');
          if (fs.existsSync(packedPath)) {
            const packed = fs.readFileSync(packedPath, 'utf-8');
            const line = packed.split('\n').find((l) => l.includes(refRelative));
            if (line) return line.trim().split(' ')[0].slice(0, 7);
          }
        }
      }
    } catch {}

    // 4. Try git CLI
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: this.repoRoot,
        timeout: 4000,
      });
      const trimmed = stdout.trim();
      if (trimmed) {
        return trimmed;
      }
    } catch {}

    return 'unknown';
  }

  /**
   * Gets mirror ping and speed test results.
   */
  async getMirrors(ping = true): Promise<OmpMirrorsResponseDto> {
    return this.ompUpdateService.getMirrors(ping);
  }

  /**
   * Checks GitHub repository for new commits or releases.
   */
  async checkUpdate(forceRefresh = false, mirrorUrl?: string): Promise<WebuiVersionResponseDto> {
    const now = Date.now();
    if (!forceRefresh && this.cachedCheck && this.cachedCheck.expiresAt > now) {
      return this.cachedCheck.result;
    }

    const currentVersion = this.getCurrentVersion();
    const currentCommit = await this.getCurrentCommit();
    const repoUrl = 'https://github.com/jinghuashang/oh-my-pi-webui';

    let latestCommit = currentCommit;
    let commitMessage: string | undefined;
    let commitAuthor: string | undefined;
    let commitDate: string | undefined;

    // 1. Try GitHub API first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('https://api.github.com/repos/jinghuashang/oh-my-pi-webui/commits/main', {
        headers: {
          'User-Agent': 'oh-my-pi-webui',
          Accept: 'application/vnd.github.v3+json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as {
          sha?: string;
          commit?: {
            message?: string;
            author?: { name?: string; date?: string };
          };
        };
        if (data.sha) {
          latestCommit = data.sha.slice(0, 7);
          commitMessage = data.commit?.message?.split('\n')[0] || undefined;
          commitAuthor = data.commit?.author?.name || undefined;
          commitDate = data.commit?.author?.date || undefined;
        }
      }
    } catch (err) {
      this.logger.debug(`GitHub API commit check failed: ${String(err)}`);
    }

    // 2. If GitHub API failed or was rate-limited, fallback to `git ls-remote` (optionally via mirror)
    if (latestCommit === currentCommit) {
      try {
        let remoteTarget = 'https://github.com/jinghuashang/oh-my-pi-webui.git';
        if (mirrorUrl && mirrorUrl !== 'direct' && !mirrorUrl.startsWith('http://127.0.0.1')) {
          const prefix = mirrorUrl.endsWith('/') ? mirrorUrl : `${mirrorUrl}/`;
          remoteTarget = `${prefix}https://github.com/jinghuashang/oh-my-pi-webui.git`;
        }

        const { stdout } = await execFileAsync('git', ['ls-remote', remoteTarget, 'refs/heads/main'], {
          cwd: this.repoRoot,
          timeout: 10_000,
        });
        const match = stdout.match(/^([a-f0-9]{7,40})/);
        if (match) {
          latestCommit = match[1].slice(0, 7);
        }
      } catch (err) {
        this.logger.debug(`git ls-remote fallback check failed: ${String(err)}`);
      }
    }

    const hasUpdate =
      latestCommit !== 'unknown' &&
      (currentCommit === 'unknown' || latestCommit.toLowerCase() !== currentCommit.toLowerCase());

    // Determine fastest mirror for command display
    let fastestMirrorUrl: string | undefined;
    let fastestMirrorId: string | undefined;
    try {
      const mirrorData = await this.getMirrors(false);
      const fastest = mirrorData.mirrors.find((m) => m.isFastest) ?? mirrorData.mirrors.find((m) => m.available);
      fastestMirrorUrl = fastest?.url;
      fastestMirrorId = fastest?.id;
    } catch {}

    const result: WebuiVersionResponseDto = {
      currentVersion,
      currentCommit,
      latestCommit,
      hasUpdate,
      commitMessage,
      commitAuthor,
      commitDate,
      repoUrl,
      updateCommand: 'git pull && pnpm build',
      dockerCommand: 'docker compose pull && docker compose up -d',
      checkedAt: now,
      fastestMirrorId,
      fastestMirrorUrl,
    };

    // Cache check results for 2 minutes
    this.cachedCheck = {
      result,
      expiresAt: now + 120_000,
    };

    return result;
  }

  /**
   * Executes git pull with optional mirror acceleration and triggers production build.
   */
  async upgrade(dto: WebuiUpgradeRequestDto): Promise<WebuiUpgradeResponseDto> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    };

    let pullTarget = 'origin';
    if (dto.mirrorUrl && dto.mirrorUrl !== 'direct') {
      const isProxy = dto.mirrorUrl.startsWith('http://') || dto.mirrorUrl.startsWith('socks');
      if (isProxy) {
        env.HTTPS_PROXY = dto.mirrorUrl;
        env.HTTP_PROXY = dto.mirrorUrl;
        env.ALL_PROXY = dto.mirrorUrl;
      } else {
        const prefix = dto.mirrorUrl.endsWith('/') ? dto.mirrorUrl : `${dto.mirrorUrl}/`;
        pullTarget = `${prefix}https://github.com/jinghuashang/oh-my-pi-webui.git`;
      }
    }
    this.logger.log(`Pulling WebUI updates from ${pullTarget}...`);
    this.progress = {
      status: 'pulling',
      stage: 'Pulling latest git changes from remote...',
      percent: 25,
      outputLog: '',
    };
    let outputLog = '';

    try {
      const { stdout: pullOut, stderr: pullErr } = await execFileAsync(
        'git',
        ['pull', pullTarget, 'main'],
        {
          cwd: this.repoRoot,
          timeout: 120_000,
          env,
        },
      );
      outputLog += `${pullOut}\n${pullErr}`.trim();
      this.progress.outputLog = outputLog;

      if (dto.rebuild !== false) {
        this.logger.log('Rebuilding WebUI after pull...');
        this.progress = {
          status: 'building',
          stage: 'Building production assets (Vite & NestJS)...',
          percent: 65,
          outputLog,
        };
        const { stdout: buildOut, stderr: buildErr } = await execFileAsync(
          'pnpm',
          ['build'],
          {
            cwd: this.repoRoot,
            timeout: 240_000,
            env,
          },
        );
        outputLog += `\n\n[Build Output]\n${buildOut}\n${buildErr}`.trim();
        this.progress.outputLog = outputLog;
      }

      const targetCommit = this.cachedCheck?.result.latestCommit;
      this.cachedCheck = null;
      const newCommit = await this.getCurrentCommit();
      try {
        const vPath = path.join(this.repoRoot, 'version.json');
        fs.writeFileSync(
          vPath,
          JSON.stringify(
            {
              version: this.getCurrentVersion(),
              commit: newCommit !== 'unknown' ? newCommit : (targetCommit || 'updated'),
              builtAt: new Date().toISOString(),
            },
            null,
            2,
          ),
          'utf-8',
        );
      } catch {}

      this.progress = {
        status: 'completed',
        stage: `WebUI successfully updated to commit ${newCommit}!`,
        percent: 100,
        outputLog,
      };

      return {
        success: true,
        message: `WebUI successfully updated to commit ${newCommit}`,
        output: outputLog,
      };
    } catch (err) {
      let errStr = '';
      if (err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string') {
        errStr = err.stderr;
      } else {
        errStr = String(err);
      }
      this.logger.error(`WebUI upgrade failed: ${errStr}`);
      this.progress = {
        status: 'failed',
        stage: 'Update failed',
        percent: 100,
        outputLog: `${outputLog}\n${errStr}`.trim(),
        error: errStr,
      };
      return {
        success: false,
        message: `Update failed: ${errStr}`,
        output: `${outputLog}\n${errStr}`.trim(),
      };
    }
  }
}
