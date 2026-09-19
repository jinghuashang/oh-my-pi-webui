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
  { id: 'ghproxy', name: 'ghproxy.net (Fast Proxy)', url: 'https://ghproxy.net/' },
  { id: 'ghddlc', name: 'gh.ddlc.top (Node Proxy)', url: 'https://gh.ddlc.top/' },
  { id: 'ghfast', name: 'ghfast.top (Proxy)', url: 'https://ghfast.top/' },
  { id: 'gitmirror', name: 'hub.gitmirror.com (Mirror)', url: 'https://hub.gitmirror.com/' },
  { id: 'kkgithub', name: 'kkgithub.com (Overseas Node)', url: 'https://kkgithub.com/' },
  { id: 'direct', name: 'Direct (Official)', url: 'https://github.com/' },
];

export function buildMirrorDownloadUrl(rawUrl: string, mirrorUrl?: string): string {
  if (
    !mirrorUrl ||
    mirrorUrl === 'direct' ||
    mirrorUrl === 'https://github.com/' ||
    mirrorUrl === 'https://github.com' ||
    mirrorUrl.trim() === ''
  ) {
    return rawUrl;
  }
  if (mirrorUrl === 'https://kkgithub.com/' || mirrorUrl === 'https://kkgithub.com') {
    return rawUrl.replace('https://github.com/', 'https://kkgithub.com/');
  }
  const prefix = mirrorUrl.endsWith('/') ? mirrorUrl : `${mirrorUrl}/`;
  return `${prefix}${rawUrl}`;
}

@Injectable()
export class OmpUpdateService {
  private readonly logger = new Logger(OmpUpdateService.name);
  private cachedCheck: { result: OmpVersionResponseDto; expiresAt: number } | null = null;
  private abortController: AbortController | null = null;
  private activeChildProcess: { kill: (signal?: NodeJS.Signals) => void } | null = null;
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
   * Aborts an in-progress OMP update task and resets progress state.
   */
  cancelUpgrade(): { success: boolean; message: string } {
    if (this.progress.status !== 'downloading' && this.progress.status !== 'installing') {
      return { success: false, message: 'No active OMP update task to cancel.' };
    }

    this.logger.log('Cancelling active OMP update task...');
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
      downloadedBytes: 0,
      totalBytes: 0,
      error: 'Cancelled by user',
    };

    return { success: true, message: 'OMP update task has been cancelled.' };
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
    const signal = this.abortController?.signal;
    const res = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'oh-my-pi-webui' },
      redirect: 'follow',
      signal,
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
      if (signal?.aborted) {
        fileStream.destroy();
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
        throw new Error('Download aborted by user.');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
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

      // If running with WEBUI_HOME or persistent volume (/root/.omp), persist updated binary
      try {
        const webuiHome = this.configService.get<string>('WEBUI_HOME') || path.join(homedir(), '.omp');
        const persistentBinDir = path.join(webuiHome, 'bin');
        if (!fs.existsSync(persistentBinDir)) {
          fs.mkdirSync(persistentBinDir, { recursive: true });
        }
        const persistentTarget = path.join(persistentBinDir, path.basename(targetPath));
        fs.copyFileSync(targetPath, persistentTarget);
        if (process.platform !== 'win32') {
          fs.chmodSync(persistentTarget, 0o755);
        }
        this.logger.log(`Persisted updated OMP binary to ${persistentTarget} across container rebuilds`);
      } catch (persistErr) {
        this.logger.warn(`Could not copy updated binary to persistent volume: ${String(persistErr)}`);
      }
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

    // Find fastest available, preferring acceleration proxies over direct
    const available = pinged.filter((m) => m.available && (m.latencyMs ?? -1) > 0);
    let fastestId: string | undefined;
    let fastestUrl: string | undefined;
    if (available.length > 0) {
      const nonDirect = available.filter((m) => m.id !== 'direct');
      if (nonDirect.length > 0) {
        nonDirect.sort((a, b) => (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999));
        fastestId = nonDirect[0].id;
        fastestUrl = nonDirect[0].url;
      } else {
        available.sort((a, b) => (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999));
        fastestId = available[0].id;
        fastestUrl = available[0].url;
      }
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

    // 1. Try domestic npmmirror first (ultra-fast, reliable in China)
    try {
      const res = await fetch('https://registry.npmmirror.com/@oh-my-pi/pi-coding-agent/latest', {
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const data = (await res.json()) as { version?: string };
        if (data.version && this.compareSemver(data.version, latestVersion) > 0) {
          latestVersion = data.version;
        }
      }
    } catch (err) {
      this.logger.debug(`npmmirror check failed: ${String(err)}`);
    }

    // 2. Try GitHub Releases API for release notes and verification
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
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
        if (match && this.compareSemver(match[1], latestVersion) > 0) {
          latestVersion = match[1];
        }
        releaseNotes = data.body || undefined;
        releaseUrl = data.html_url || 'https://github.com/can1357/oh-my-pi/releases';
      }
    } catch (err) {
      this.logger.debug(`GitHub release check skipped/failed: ${String(err)}`);
    }

    // 3. If still equal or failed, check via official npmjs.org
    if (latestVersion === currentVersion) {
      try {
        const res = await fetch('https://registry.npmjs.org/@oh-my-pi/pi-coding-agent/latest', {
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = (await res.json()) as { version?: string };
          if (data.version && this.compareSemver(data.version, latestVersion) > 0) {
            latestVersion = data.version;
          }
        }
      } catch (err) {
        this.logger.debug(`npmjs check failed: ${String(err)}`);
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
    // If another update is currently running, cancel the old one first to avoid race condition!
    if (this.progress.status === 'downloading' || this.progress.status === 'installing') {
      this.logger.warn('Previous update is still running, aborting it before starting new update...');
      this.cancelUpgrade();
    }

    this.abortController = new AbortController();
    const check = await this.checkUpdate();
    const targetBinary = await this.resolveBinaryPath();
    const binaryName = this.resolveBinaryName();
    const targetVersion = check.latestVersion || '18.2.4';
    const rawAssetUrl = `https://github.com/can1357/oh-my-pi/releases/download/v${targetVersion}/${binaryName}`;

    // Gather candidate mirror URLs to ensure high reliability
    const mirrorCandidates: string[] = [];
    if (dto.mirrorUrl && dto.mirrorUrl !== 'direct' && dto.mirrorUrl !== 'https://github.com/') {
      mirrorCandidates.push(dto.mirrorUrl);
    }
    try {
      const mirrorData = await this.getMirrors(false);
      const fastest = mirrorData.mirrors.find((m) => m.isFastest && m.id !== 'direct');
      if (fastest && !mirrorCandidates.includes(fastest.url)) {
        mirrorCandidates.push(fastest.url);
      }
    } catch {}

    for (const fallback of ['https://ghproxy.net/', 'https://gh.ddlc.top/', 'https://hub.gitmirror.com/']) {
      if (!mirrorCandidates.includes(fallback)) {
        mirrorCandidates.push(fallback);
      }
    }
    if (!mirrorCandidates.includes('direct')) {
      mirrorCandidates.push('direct');
    }

    let lastError: Error | null = null;
    let successfulUrl: string | null = null;

    // 1. Try direct mirror binary download first (with real-time progress)
    if (!dto.canary) {
      for (const candidate of mirrorCandidates) {
        const downloadUrl = buildMirrorDownloadUrl(rawAssetUrl, candidate);
        this.logger.log(`Attempting OMP binary download via: ${downloadUrl}`);
        try {
          await this.downloadBinaryWithProgress(downloadUrl, targetBinary);
          successfulUrl = downloadUrl;
          break;
        } catch (err) {
          lastError = err as Error;
          this.logger.warn(`Download via ${downloadUrl} failed: ${String(err)}; trying next candidate...`);
        }
      }
    }

    if (successfulUrl) {
      this.abortController = null;
      this.cachedCheck = null;
      const newVersion = await this.getCurrentVersion();
      return {
        success: true,
        message: `Successfully downloaded and updated OMP to v${newVersion} via mirror acceleration.`,
        output: `Downloaded ${binaryName} from ${successfulUrl}\nInstalled to ${targetBinary}\nVerified version: v${newVersion}`,
      };
    }

    // 2. Fallback to native CLI update if mirror download is bypassed or failed
    this.logger.warn(`Mirror downloads failed (${lastError?.message}), falling back to native CLI update...`);
    const args = ['update'];
    if (dto.canary) {
      args.push('--canary');
    }
    if (dto.force) {
      args.push('--force');
    }

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (dto.mirrorUrl && (dto.mirrorUrl.startsWith('http://') || dto.mirrorUrl.startsWith('socks'))) {
      env.HTTPS_PROXY = dto.mirrorUrl;
      env.HTTP_PROXY = dto.mirrorUrl;
      env.ALL_PROXY = dto.mirrorUrl;
    }

    this.logger.log(
      `Executing omp update via CLI with args: ${args.join(' ')}...`,
    );

    try {
      const child = execFile(this.ompBin, args, {
        timeout: 180_000,
        env,
      });
      this.activeChildProcess = child;
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        let out = '';
        let err = '';
        child.stdout?.on('data', (d) => (out += d));
        child.stderr?.on('data', (d) => (err += d));
        child.on('close', (code) => {
          if (code === 0) resolve({ stdout: out, stderr: err });
          else reject(new Error(err || `Process exited with code ${code}`));
        });
        child.on('error', reject);
      });
      this.activeChildProcess = null;
      this.abortController = null;

      const output = `${stdout}\n${stderr}`.trim();
      this.cachedCheck = null;
      const newVersion = await this.getCurrentVersion();

      return {
        success: true,
        message: `Successfully executed update. Current version is now v${newVersion}.`,
        output,
      };
    } catch (err) {
      this.activeChildProcess = null;
      this.abortController = null;
      let output = '';
      if (err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string') {
        output = err.stderr;
      } else {
        output = String(err);
      }
      this.logger.error(`omp update failed: ${output}`);
      return {
        success: false,
        message: `Update execution failed: ${lastError?.message || output}`,
        output: `Mirror download error: ${lastError?.message || 'unknown'}\n\nCLI output:\n${output}`,
      };
    }
  }
}
