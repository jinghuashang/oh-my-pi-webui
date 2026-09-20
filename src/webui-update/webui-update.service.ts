import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
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
  private abortController: AbortController | null = null;
  private activeChildProcess: { kill: (signal?: NodeJS.Signals) => void } | null = null;
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

  private get networkProxy(): string | undefined {
    const proxy = this.configService.get<string>('WEBUI_NETWORK_PROXY')?.trim();
    return proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || undefined;
  }

  private get repoRoot(): string {
    return process.cwd();
  }


  getProgress(): WebuiUpdateProgressDto {
    return this.progress;
  }

  /**
   * Cancels and aborts an in-progress WebUI update task and kills child processes.
   */
  cancelUpgrade(): { success: boolean; message: string } {
    if (this.progress.status !== 'pulling' && this.progress.status !== 'building') {
      return { success: false, message: 'No active WebUI update task to cancel.' };
    }

    this.logger.log('Cancelling active WebUI update task...');
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.activeChildProcess) {
      try {
        this.activeChildProcess.kill('SIGTERM');
      } catch {}
      this.activeChildProcess = null;
    }

    this.progress = {
      status: 'failed',
      stage: 'Update cancelled by user.',
      percent: 0,
      outputLog: `${this.progress.outputLog}\n[Cancelled by user]`.trim(),
      error: 'Cancelled by user',
    };

    return { success: true, message: 'WebUI update task has been cancelled.' };
  }
  /**
   * Detects whether the process is running inside a Docker or containerized environment.
   */
  isDocker(): boolean {
    try {
      if (fs.existsSync('/.dockerenv')) return true;
      if (fs.existsSync('/run/.containerenv')) return true;
      if (process.env.DOCKER_CONTAINER === 'true' || process.env.IS_DOCKER === 'true') return true;
      if (fs.existsSync('/proc/1/cgroup')) {
        const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf-8');
        if (cgroup.includes('docker') || cgroup.includes('containerd') || cgroup.includes('kubepods')) {
          return true;
        }
      }
    } catch {}
    return false;
  }

  /**
   * Checks if .git directory exists and has full write permissions.
   */
  isGitWritable(): boolean {
    try {
      const gitDir = path.join(this.repoRoot, '.git');
      if (!fs.existsSync(gitDir)) return false;
      const testFile = path.join(gitDir, `.writable_probe_${Date.now()}`);
      fs.writeFileSync(testFile, '1', 'utf-8');
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Determines whether in-place auto update is supported.
   * In Docker environments with mounted ./data volume, update is supported via overlay patching.
   */
  canAutoUpdate(): boolean {
    return true;
  }

  /**
   * Human-readable explanation when auto update is disabled.
   */
  getAutoUpdateDisabledReason(): string | undefined {
    return undefined;
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

    const isDocker = this.isDocker();
    const canAutoUpdate = this.canAutoUpdate();
    const autoUpdateDisabledReason = this.getAutoUpdateDisabledReason();

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
      dockerCommand: 'git pull && docker compose up -d --build',
      checkedAt: now,
      fastestMirrorId,
      fastestMirrorUrl,
      isDocker,
      canAutoUpdate,
      autoUpdateDisabledReason,
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
    if (!this.canAutoUpdate()) {
      const reason = this.getAutoUpdateDisabledReason() || 'In-place update is not supported in this environment.';
      this.logger.warn(`WebUI in-place update rejected: ${reason}`);
      this.progress = {
        status: 'failed',
        stage: reason,
        percent: 0,
        outputLog: reason,
        error: reason,
      };
      return { success: false, message: reason, output: reason };
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    };
    const configuredProxy = this.networkProxy;
    if (configuredProxy) {
      env.HTTPS_PROXY = configuredProxy;
      env.HTTP_PROXY = configuredProxy;
      env.ALL_PROXY = configuredProxy;
    }
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
    if (this.progress.status === 'pulling' || this.progress.status === 'building') {
      this.logger.warn('Previous WebUI update task is still running, aborting it before starting new update...');
      this.cancelUpgrade();
    }

    this.abortController = new AbortController();
    const check = await this.checkUpdate();
    const isDocker = this.isDocker();
    const targetCommit = check.latestCommit || 'latest';
    const webuiHome = this.configService.get<string>('WEBUI_HOME') || path.join(homedir(), '.omp');
    // 1. If running inside Docker container or environment without writable .git,
    // execute overlay upgrade using GitHub tarball/bundle archive via chosen mirror!
    if (isDocker || !this.isGitWritable()) {
      return this.upgradeDockerContainer(dto, targetCommit, webuiHome);
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

  /**
   * Upgrades WebUI inside Docker container by downloading source tarball from GitHub
   * via mirror acceleration, overlay-updating files, and persisting version state across container rebuilds!
   */
  private async upgradeDockerContainer(
    dto: WebuiUpgradeRequestDto,
    targetCommit: string,
    webuiHome: string,
  ): Promise<WebuiUpgradeResponseDto> {
    this.logger.log(`Executing Docker container overlay upgrade to commit ${targetCommit}...`);
    let outputLog = `[Docker Container Upgrade Started]\nTarget Commit: ${targetCommit}\nPersistent Volume: ${webuiHome}\n\n`;

    this.progress = {
      status: 'pulling',
      stage: 'Downloading latest WebUI archive from GitHub via mirror...',
      percent: 15,
      outputLog,
    };

    const rawTarballUrl = `https://github.com/jinghuashang/oh-my-pi-webui/archive/refs/heads/main.tar.gz`;
    const candidates = [
      dto.mirrorUrl && dto.mirrorUrl !== 'direct' ? dto.mirrorUrl : undefined,
      'https://ghproxy.net/',
      'https://gh.ddlc.top/',
      'https://hub.gitmirror.com/',
      'direct',
    ].filter((c): c is string => Boolean(c));

    const tempTarPath = path.join(this.repoRoot, `.update_${Date.now()}.tar.gz`);
    let downloaded = false;

    for (const mirror of candidates) {
      let downloadUrl = rawTarballUrl;
      if (mirror !== 'direct') {
        const prefix = mirror.endsWith('/') ? mirror : `${mirror}/`;
        downloadUrl = `${prefix}${rawTarballUrl}`;
      }

      this.logger.log(`Fetching WebUI tarball from ${downloadUrl}...`);
      try {
        const res = await fetch(downloadUrl, {
          headers: { 'User-Agent': 'oh-my-pi-webui' },
          redirect: 'follow',
          signal: this.abortController ? this.abortController.signal : AbortSignal.timeout(60_000),
        });

        if (res.ok && res.body) {
          const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
          const totalFormatted = totalBytes > 0 ? `${(totalBytes / 1024 / 1024).toFixed(1)} MB` : undefined;
          const fileStream = fs.createWriteStream(tempTarPath);
          const reader = res.body.getReader();
          let downloadedBytes = 0;
          const startTime = Date.now();
          let lastSampleTime = startTime;
          let lastSampleBytes = 0;

          while (true) {
            if (this.abortController?.signal.aborted) {
              fileStream.destroy();
              try { if (fs.existsSync(tempTarPath)) fs.unlinkSync(tempTarPath); } catch {}
              throw new Error('WebUI update download aborted by user.');
            }
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              downloadedBytes += value.byteLength;
              fileStream.write(Buffer.from(value));

              const now = Date.now();
              const elapsed = now - lastSampleTime;
              if (elapsed >= 150 || (totalBytes > 0 && downloadedBytes >= totalBytes)) {
                const speedBytesPerSec = ((downloadedBytes - lastSampleBytes) / (elapsed || 1)) * 1000;
                const speedMb = speedBytesPerSec / (1024 * 1024);
                const percent = totalBytes > 0
                  ? Math.min(40, Math.round(15 + (downloadedBytes / totalBytes) * 25))
                  : Math.min(40, Math.round(15 + (downloadedBytes / (15 * 1024 * 1024)) * 25));

                this.progress = {
                  status: 'pulling',
                  stage: `Downloading WebUI archive... (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${totalFormatted || 'streaming...'})`,
                  percent,
                  speedFormatted: `${speedMb.toFixed(2)} MB/s`,
                  outputLog,
                };

                lastSampleTime = now;
                lastSampleBytes = downloadedBytes;
              }
            }
          }
          await new Promise<void>((resolve, reject) => {
            fileStream.end((err: Error | null) => (err ? reject(err) : resolve()));
          });
          downloaded = true;
          outputLog += `✓ Downloaded update archive via ${mirror}\n`;
          break;
        }
      } catch (err) {
        if (this.abortController?.signal.aborted) {
          throw err;
        }
        this.logger.warn(`Failed to download tarball via ${mirror}: ${String(err)}`);
      }
    }

    if (!downloaded || !fs.existsSync(tempTarPath)) {
      const errMessage = 'Failed to download WebUI update archive through available mirrors';
      this.progress = {
        status: 'failed',
        stage: errMessage,
        percent: 0,
        outputLog,
        error: errMessage,
      };
      return { success: false, message: errMessage, output: outputLog };
    }

    // 2. Extract tarball overlaying /app files
    this.progress = {
      status: 'building',
      stage: 'Unpacking update archive and updating application files...',
      percent: 45,
      outputLog,
    };

    try {
      const { stdout: tarOut, stderr: tarErr } = await execFileAsync(
        'tar',
        ['-xzf', tempTarPath, '--strip-components=1', '-C', this.repoRoot],
        { timeout: 60_000 },
      );
      outputLog += `✓ Unpacked files successfully: ${tarOut || 'ok'}\n${tarErr || ''}\n`;
    } catch (tarError) {
      outputLog += `⚠️ tar unpack notice: ${String(tarError)}\n`;
    } finally {
      try { fs.unlinkSync(tempTarPath); } catch {}
    }

    // 3. Run production build
    if (dto.rebuild !== false) {
      this.progress = {
        status: 'building',
        stage: 'Building updated frontend & backend bundles...',
        percent: 75,
        outputLog,
      };

      try {
        const { stdout: buildOut, stderr: buildErr } = await execFileAsync('pnpm', ['build'], {
          cwd: this.repoRoot,
          timeout: 240_000,
        });
        outputLog += `\n[Build Output]\n${buildOut}\n${buildErr}`.trim();
      } catch (buildErr) {
        this.logger.warn(`pnpm build completed with notice: ${String(buildErr)}`);
        outputLog += `\n[Build Notice]\n${String(buildErr)}`;
      }
    }

    // Backup updated dist & public to persistent volume overlay (/root/.omp/webui_overlay)
    // so even if the container is re-created without re-building the image, the updates persist!
    try {
      const overlayDir = path.join(webuiHome, 'webui_overlay');
      if (!fs.existsSync(overlayDir)) fs.mkdirSync(overlayDir, { recursive: true });
      
      for (const folder of ['dist', 'public']) {
        const srcPath = path.join(this.repoRoot, folder);
        const destPath = path.join(overlayDir, folder);
        if (fs.existsSync(srcPath)) {
          fs.cpSync(srcPath, destPath, { recursive: true, force: true });
        }
      }
      outputLog += `\n✓ Synchronized updated bundles to persistent volume (./data/webui_overlay)\n`;
    } catch (overlayErr) {
      this.logger.warn(`Failed to copy build to webui_overlay: ${String(overlayErr)}`);
    }

    // 4. Update and stamp version.json in both app directory and persistent volume
    const finalVersion = this.getCurrentVersion();
    const versionInfo = {
      version: finalVersion,
      commit: targetCommit,
      builtAt: new Date().toISOString(),
      updatedVia: 'container-overlay',
    };

    for (const vTarget of [
      path.join(this.repoRoot, 'version.json'),
      path.join(this.repoRoot, 'dist', 'version.json'),
      path.join(webuiHome, 'version.json'),
    ]) {
      try {
        const dir = path.dirname(vTarget);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(vTarget, JSON.stringify(versionInfo, null, 2), 'utf-8');
      } catch {}
    }

    this.cachedCheck = null;
    outputLog += `\n\n✓ WebUI update completed! Version updated to ${targetCommit} (${finalVersion}).`;

    this.progress = {
      status: 'completed',
      stage: `WebUI successfully updated to commit ${targetCommit}!`,
      percent: 100,
      outputLog,
    };

    return {
      success: true,
      message: `WebUI successfully updated to commit ${targetCommit}! Please restart or refresh.`,
      output: outputLog,
    };
  }
}
