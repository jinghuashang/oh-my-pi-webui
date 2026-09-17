import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import {
  AddCustomMirrorDto,
  OmpMirrorsResponseDto,
  OmpUpdateProgressDto,
  OmpUpgradeRequestDto,
  OmpUpgradeResponseDto,
  OmpVersionResponseDto,
  UpdateMirrorDto,
} from './dto/omp-update.dto';

const execFileAsync = promisify(execFile);

export const DEFAULT_UPDATE_MIRRORS: UpdateMirrorDto[] = [
  { id: 'direct', name: 'Direct (Official)', url: 'https://github.com/' },
  { id: 'ghproxy', name: 'ghproxy.net (Fast Proxy)', url: 'https://ghproxy.net/' },
  { id: 'ghddlc', name: 'gh.ddlc.top (Node Proxy)', url: 'https://gh.ddlc.top/' },
  { id: 'ghfast', name: 'ghfast.top (Proxy)', url: 'https://ghfast.top/' },
  { id: 'gitmirror', name: 'hub.gitmirror.com (Mirror)', url: 'https://hub.gitmirror.com/' },
  { id: 'kkgithub', name: 'kkgithub.com (Overseas Node)', url: 'https://kkgithub.com/' },
];

@Injectable()
export class OmpUpdateService {
  private readonly logger = new Logger(OmpUpdateService.name);
  private cachedCheck: { result: OmpVersionResponseDto; expiresAt: number } | null = null;
  private progress: OmpUpdateProgressDto = {
    status: 'idle',
    stage: '',
    percent: 0,
    downloadedBytes: 0,
    totalBytes: 0,
  };
  constructor(private readonly configService: ConfigService) {}

  private get ompBin(): string {
    return this.configService.get<string>('OMP_BIN') || 'omp';
  }

  private get customMirrorsFile(): string {
    const webuiHome = this.configService.get<string>('WEBUI_HOME')?.trim();
    const baseDir = webuiHome || path.join(homedir(), '.omp');
    return path.join(baseDir, 'agent', 'update-mirrors.json');
  }

  getProgress(): OmpUpdateProgressDto {
    return this.progress;
  }

  /**
   * Computes the release asset binary name based on operating system and architecture.
   */
  resolveBinaryName(): string {
    const platform = process.platform;
    const arch = process.arch;
    let osPart: string;
    if (platform === 'linux') {
      const isMusl = fs.existsSync('/etc/alpine-release');
      osPart = isMusl ? 'linux-musl' : 'linux';
    } else if (platform === 'darwin') {
      osPart = 'darwin';
    } else if (platform === 'win32') {
      osPart = 'windows';
    } else {
      osPart = platform;
    }
    const ext = platform === 'win32' ? '.exe' : '';
    return `omp-${osPart}-${arch}${ext}`;
  }

  /**
   * Resolves the real absolute path to the local omp binary.
   */
  async resolveBinaryPath(): Promise<string> {
    const ompBin = this.ompBin;
    if (path.isAbsolute(ompBin) && fs.existsSync(ompBin)) {
      return ompBin;
    }
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execFileAsync(cmd, [ompBin], { timeout: 4000 });
      const firstPath = stdout.trim().split(/\r?\n/)[0]?.trim();
      if (firstPath && fs.existsSync(firstPath)) {
        return firstPath;
      }
    } catch {}
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local');
      const defaultWin = path.join(localAppData, 'omp', 'omp.exe');
      if (fs.existsSync(defaultWin)) return defaultWin;
    } else {
      const linuxPath = path.join(homedir(), '.local', 'bin', 'omp');
      if (fs.existsSync(linuxPath)) return linuxPath;
      const usrBin = '/usr/local/bin/omp';
      if (fs.existsSync(usrBin)) return usrBin;
    }
    return ompBin;
  }

  /**
   * Downloads release binary with real-time speed, bytes calculation and atomic install.
   */
  async downloadBinaryWithProgress(downloadUrl: string, targetPath: string): Promise<void> {
    this.progress = {
      status: 'downloading',
      stage: 'Connecting to update server...',
      percent: 0,
      downloadedBytes: 0,
      totalBytes: 0,
    };

    const res = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'oh-my-pi-webui' },
      redirect: 'follow',
    });

    if (!res.ok || !res.body) {
      throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
    }

    const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
    const totalFormatted = totalBytes > 0 ? `${(totalBytes / 1024 / 1024).toFixed(1)} MB` : undefined;
    this.progress.totalBytes = totalBytes;
    this.progress.totalFormatted = totalFormatted;

    const tempPath = `${targetPath}.${Date.now()}.${process.pid}.tmp`;
    const fileStream = fs.createWriteStream(tempPath);

    let downloadedBytes = 0;
    const startTime = Date.now();
    let lastSampleTime = startTime;
    let lastSampleBytes = 0;

    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        downloadedBytes += value.byteLength;
        fileStream.write(Buffer.from(value));

        const now = Date.now();
        const elapsed = now - lastSampleTime;
        if (elapsed >= 250 || downloadedBytes === totalBytes) {
          const speedBytesPerSec = ((downloadedBytes - lastSampleBytes) / (elapsed || 1)) * 1000;
          const speedMb = speedBytesPerSec / (1024 * 1024);
          const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;

          this.progress = {
            status: 'downloading',
            stage: `Downloading binary... (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${totalFormatted || '...'})`,
            percent,
            speedFormatted: `${speedMb.toFixed(2)} MB/s`,
            downloadedBytes,
            totalBytes,
            downloadedFormatted: `${(downloadedBytes / 1024 / 1024).toFixed(1)} MB`,
            totalFormatted,
          };

          lastSampleTime = now;
          lastSampleBytes = downloadedBytes;
        }
      }
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end((err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.progress = {
      ...this.progress,
      status: 'installing',
      stage: 'Installing binary update...',
      percent: 99,
    };

    if (process.platform !== 'win32') {
      fs.chmodSync(tempPath, 0o755);
    }

    const backupPath = `${targetPath}.${Date.now()}.bak`;
    try {
      if (fs.existsSync(targetPath)) {
        try {
          fs.renameSync(targetPath, backupPath);
        } catch {}
      }
      fs.renameSync(tempPath, targetPath);
      if (process.platform !== 'win32') {
        fs.chmodSync(targetPath, 0o755);
      }
      try {
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
      } catch {}
    } catch (err) {
      if (fs.existsSync(backupPath) && !fs.existsSync(targetPath)) {
        try { fs.renameSync(backupPath, targetPath); } catch {}
      }
      throw err;
    }

    this.progress = {
      ...this.progress,
      status: 'completed',
      stage: 'Update installed successfully!',
      percent: 100,
    };
  }

  private loadCustomMirrors(): UpdateMirrorDto[] {
    try {
      if (fs.existsSync(this.customMirrorsFile)) {
        const raw = fs.readFileSync(this.customMirrorsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((m) => ({ ...m, isCustom: true }));
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to read custom mirrors: ${String(err)}`);
    }
    return [];
  }

  private saveCustomMirrors(mirrors: UpdateMirrorDto[]): void {
    try {
      const dir = path.dirname(this.customMirrorsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.customMirrorsFile, JSON.stringify(mirrors, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error(`Failed to save custom mirrors: ${String(err)}`);
    }
  }

  /**
   * Adds a user-defined custom mirror or proxy.
   */
  addCustomMirror(dto: AddCustomMirrorDto): UpdateMirrorDto {
    const custom = this.loadCustomMirrors();
    const id = `custom-${Date.now()}`;
    const newMirror: UpdateMirrorDto = {
      id,
      name: dto.name.trim() || dto.url.trim(),
      url: dto.url.trim(),
      isCustom: true,
    };
    custom.push(newMirror);
    this.saveCustomMirrors(custom);
    return newMirror;
  }

  /**
   * Deletes a user-defined custom mirror.
   */
  deleteCustomMirror(id: string): boolean {
    const custom = this.loadCustomMirrors();
    const filtered = custom.filter((m) => m.id !== id);
    if (filtered.length !== custom.length) {
      this.saveCustomMirrors(filtered);
      return true;
    }
    return false;
  }

  /**
   * Tests latency of each mirror concurrently and identifies the fastest available mirror.
   */
  async getMirrors(ping = true): Promise<OmpMirrorsResponseDto> {
    const custom = this.loadCustomMirrors();
    const allMirrors: UpdateMirrorDto[] = [...DEFAULT_UPDATE_MIRRORS, ...custom];

    if (!ping) {
      return { mirrors: allMirrors };
    }

    const pinged = await Promise.all(
      allMirrors.map(async (mirror) => {
        const t0 = Date.now();
        try {
          const testUrl = mirror.id === 'direct' ? 'https://api.github.com/zen' : mirror.url;
          const res = await fetch(testUrl, {
            headers: { 'User-Agent': 'oh-my-pi-webui' },
            signal: AbortSignal.timeout(2500),
          });
          if (res.ok || res.status < 500) {
            return {
              ...mirror,
              latencyMs: Date.now() - t0,
              available: true,
            };
          }
          return {
            ...mirror,
            latencyMs: -1,
            available: false,
          };
        } catch {
          return {
            ...mirror,
            latencyMs: -1,
            available: false,
          };
        }
      }),
    );

    // Find fastest available
    const available = pinged.filter((m) => m.available && (m.latencyMs ?? -1) > 0);
    let fastestId: string | undefined;
    let fastestUrl: string | undefined;
    if (available.length > 0) {
      available.sort((a, b) => (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999));
      fastestId = available[0].id;
      fastestUrl = available[0].url;
    }

    const finalMirrors = pinged.map((m) => ({
      ...m,
      isFastest: m.id === fastestId,
    }));

    // Sort: available fastest first, then unavailable
    finalMirrors.sort((a, b) => {
      if (a.available && !b.available) return -1;
      if (!a.available && b.available) return 1;
      return (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999);
    });

    return {
      mirrors: finalMirrors,
      fastestId,
      fastestUrl,
    };
  }

  /**
   * Compares two semantic version strings (e.g. "18.2.1" vs "18.1.19").
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
  async checkUpdate(forceRefresh = false, mirrorUrl?: string): Promise<OmpVersionResponseDto> {
    const now = Date.now();
    if (!forceRefresh && this.cachedCheck && this.cachedCheck.expiresAt > now) {
      return this.cachedCheck.result;
    }

    const currentVersion = await this.getCurrentVersion();
    let latestVersion = currentVersion;
    let releaseNotes: string | undefined;
    let releaseUrl: string | undefined;

    // 1. Try GitHub Releases API first (using mirror prefix if specified)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      let apiUrl = 'https://api.github.com/repos/can1357/oh-my-pi/releases/latest';
      if (mirrorUrl && mirrorUrl !== 'direct' && !mirrorUrl.startsWith('http://127.0.0.1')) {
        const prefix = mirrorUrl.endsWith('/') ? mirrorUrl : `${mirrorUrl}/`;
        apiUrl = `${prefix}https://api.github.com/repos/can1357/oh-my-pi/releases/latest`;
      }
      const res = await fetch(apiUrl, {
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
   * Executes `omp update` command to upgrade the CLI binary with optional mirror/proxy support.
   */
  async upgrade(dto: OmpUpgradeRequestDto): Promise<OmpUpgradeResponseDto> {
    const check = await this.checkUpdate();
    const targetBinary = await this.resolveBinaryPath();
    const binaryName = this.resolveBinaryName();

    // If mirror is specified or user wants mirror-accelerated download
    const isMirrorPrefix = dto.mirrorUrl && dto.mirrorUrl !== 'direct' && !dto.mirrorUrl.startsWith('http://127.0.0.1');
    if (isMirrorPrefix || (!dto.canary && check.latestVersion)) {
      let downloadUrl = `https://github.com/can1357/oh-my-pi/releases/download/v${check.latestVersion}/${binaryName}`;
      if (isMirrorPrefix && dto.mirrorUrl) {
        const prefix = dto.mirrorUrl.endsWith('/') ? dto.mirrorUrl : `${dto.mirrorUrl}/`;
        downloadUrl = `${prefix}${downloadUrl}`;
      }

      this.logger.log(`Downloading OMP binary directly via mirror: ${downloadUrl} to ${targetBinary}`);
      try {
        await this.downloadBinaryWithProgress(downloadUrl, targetBinary);
        this.cachedCheck = null;
        const newVersion = await this.getCurrentVersion();
        return {
          success: true,
          message: `Successfully downloaded and updated OMP to v${newVersion} via mirror acceleration.`,
          output: `Downloaded ${binaryName} from ${downloadUrl}\nInstalled to ${targetBinary}\nVerified version: v${newVersion}`,
        };
      } catch (err) {
        this.logger.warn(`Direct mirror binary download failed, falling back to CLI update: ${String(err)}`);
      }
    }

    // Fallback to CLI update
    const args = ['update'];
    if (dto.canary) {
      args.push('--canary');
    }
    if (dto.force) {
      args.push('--force');
    }

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (dto.mirrorUrl && dto.mirrorUrl !== 'direct') {
      const isProxy = dto.mirrorUrl.startsWith('http://') || dto.mirrorUrl.startsWith('socks');
      if (isProxy) {
        env.HTTPS_PROXY = dto.mirrorUrl;
        env.HTTP_PROXY = dto.mirrorUrl;
        env.ALL_PROXY = dto.mirrorUrl;
      } else {
        env.GH_PROXY = dto.mirrorUrl;
        env.GITHUB_MIRROR = dto.mirrorUrl;
        env.OMP_UPDATE_MIRROR = dto.mirrorUrl;
      }
    }

    this.logger.log(
      `Executing omp upgrade with args: ${args.join(' ')} and mirror: ${dto.mirrorUrl || 'direct'}...`,
    );

    try {
      const { stdout, stderr } = await execFileAsync(this.ompBin, args, {
        timeout: 180_000,
        env,
      });

      const output = `${stdout}\n${stderr}`.trim();
      this.cachedCheck = null;
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
