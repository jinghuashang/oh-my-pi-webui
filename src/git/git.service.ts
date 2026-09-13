/**
 * Repository inspection for one workspace directory.
 *
 * Every command runs with `-C <cwd>` through the same validated workspace path
 * the file service enforces, so a request cannot point git at a directory the
 * WebUI was never allowed to touch.
 */
import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-codes';
import { FilesService } from '../files/files.service';

const execFileAsync = promisify(execFile);

/** Git commands never wait forever on a locked index or a hanging hook. */
const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER = 4 * 1024 * 1024;

export interface GitChange {
  path: string;
  /** Porcelain status code, e.g. `M`, `??`, `A`. */
  status: string;
  additions: number;
  deletions: number;
}

export interface GitStatus {
  /** False when the directory is not inside a work tree. */
  isRepo: boolean;
  branch: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  additions: number;
  deletions: number;
  changes: GitChange[];
  /** Local branch names, for the switcher. */
  branches: string[];
}

export interface GitCommitResult {
  sha: string;
  summary: string;
}

@Injectable()
export class GitService {
  private readonly logger = new Logger(GitService.name);

  constructor(private readonly files: FilesService) {}

  /** Repository state for a workspace directory, or a not-a-repo answer. */
  async status(cwd: string): Promise<GitStatus> {
    const directory = await this.files.resolveSafePath(cwd);
    if (!(await this.isRepository(directory))) {
      return {
        isRepo: false,
        branch: null,
        detached: false,
        upstream: null,
        ahead: 0,
        behind: 0,
        additions: 0,
        deletions: 0,
        changes: [],
        branches: [],
      };
    }

    const [branch, porcelain, tracked, untracked, branches] = await Promise.all([
      this.run(directory, ['rev-parse', '--abbrev-ref', 'HEAD']),
      this.run(directory, ['status', '--porcelain=v1', '--untracked-files=all']),
      this.run(directory, ['diff', '--numstat', 'HEAD']),
      this.run(directory, ['ls-files', '--others', '--exclude-standard']),
      this.run(directory, ['branch', '--format=%(refname:short)']),
    ]);

    const stats = new Map<string, { additions: number; deletions: number }>();
    for (const line of tracked.split('\n')) {
      const [added, removed, ...rest] = line.split('\t');
      const path = rest.join('\t').trim();
      if (!path) continue;
      stats.set(path, {
        additions: Number.parseInt(added, 10) || 0,
        deletions: Number.parseInt(removed, 10) || 0,
      });
    }

    const changes: GitChange[] = [];
    for (const line of porcelain.split('\n')) {
      if (line.length < 4) continue;
      const status = line.slice(0, 2).trim() || '??';
      const rawPath = line.slice(3);
      // Renames arrive as `old -> new`; the destination is what the user acts on.
      const path = rawPath.includes(' -> ') ? rawPath.split(' -> ')[1] : rawPath;
      const stat = stats.get(path) ?? { additions: 0, deletions: 0 };
      changes.push({ path, status, ...stat });
    }

    const untrackedPaths = untracked.split('\n').filter((line) => line.trim().length > 0);
    for (const path of untrackedPaths) {
      if (changes.some((change) => change.path === path)) continue;
      changes.push({ path, status: '??', additions: 0, deletions: 0 });
    }

    const tracking = await this.upstreamDivergence(directory);

    return {
      isRepo: true,
      branch: branch.trim() || null,
      detached: branch.trim() === 'HEAD',
      upstream: tracking.upstream,
      ahead: tracking.ahead,
      behind: tracking.behind,
      additions: changes.reduce((total, change) => total + change.additions, 0),
      deletions: changes.reduce((total, change) => total + change.deletions, 0),
      changes,
      branches: branches
        .split('\n')
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
    };
  }

  /** Switches the work tree to an existing local branch. */
  async checkout(cwd: string, branch: string): Promise<void> {
    const directory = await this.files.resolveSafePath(cwd);
    const name = branch.trim();
    if (!name || name.startsWith('-')) {
      throw BusinessException.badRequest(
        ErrorCode.git.branchRequired,
        'A branch name is required',
      );
    }
    await this.run(directory, ['checkout', name]);
  }

  /** Stages every change in the work tree and commits it. */
  async commit(cwd: string, message: string): Promise<GitCommitResult> {
    const directory = await this.files.resolveSafePath(cwd);
    const text = message.trim();
    if (!text) {
      throw BusinessException.badRequest(
        ErrorCode.git.messageRequired,
        'A commit message is required',
      );
    }

    await this.run(directory, ['add', '--all']);
    await this.run(directory, ['commit', '-m', text]);
    const [sha, summary] = await Promise.all([
      this.run(directory, ['rev-parse', '--short', 'HEAD']),
      this.run(directory, ['log', '-1', '--pretty=%s']),
    ]);
    this.logger.log(`Committed ${sha.trim()} in ${directory}`);
    return { sha: sha.trim(), summary: summary.trim() };
  }

  /** True when the directory is inside a git work tree. */
  private async isRepository(directory: string): Promise<boolean> {
    try {
      const result = await this.run(directory, ['rev-parse', '--is-inside-work-tree']);
      return result.trim() === 'true';
    } catch {
      return false;
    }
  }

  /** Upstream name and ahead/behind counts; absent when no upstream is set. */
  private async upstreamDivergence(
    directory: string,
  ): Promise<{ upstream: string | null; ahead: number; behind: number }> {
    try {
      const upstream = (await this.run(directory, [
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        '@{upstream}',
      ])).trim();
      const counts = (await this.run(directory, [
        'rev-list',
        '--left-right',
        '--count',
        `${upstream}...HEAD`,
      ])).trim();
      const [behind, ahead] = counts.split(/\s+/).map((value) => Number.parseInt(value, 10) || 0);
      return { upstream, ahead, behind };
    } catch {
      return { upstream: null, ahead: 0, behind: 0 };
    }
  }

  /** Runs one git command in the directory; never inherits an interactive terminal. */
  private async run(directory: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', directory, ...args], {
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '1' },
      });
      return stdout;
    } catch (error) {
      const stderr = (error as { stderr?: unknown }).stderr;
      const detail = typeof stderr === 'string' && stderr.trim() ? stderr.trim() : String(error);
      throw BusinessException.badRequest(ErrorCode.git.commandFailed, detail, {
        command: `git ${args[0]}`,
      });
    }
  }
}
