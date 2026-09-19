import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-codes';
import { FilesService } from '../files/files.service';
import { ThreadsService } from '../threads/threads.service';
import {
  CloneProgressDto,
  CloneProjectDto,
  CreateProjectDto,
  CreateProjectResponseDto,
  DeleteProjectResponseDto,
  ProjectItemDto,
  ProjectsListResponseDto,
} from './dto/projects.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private activeCloneProcess: { kill: (signal?: NodeJS.Signals) => void } | null = null;
  private activeCloneTargetDir: string | null = null;
  private cloneProgress: CloneProgressDto = {
    status: 'idle',
    stage: '',
    percent: 0,
    outputLog: '',
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
    private readonly threadsService: ThreadsService,
  ) {}

  getCloneProgress(): CloneProgressDto {
    return this.cloneProgress;
  }

  /**
   * Cancels and aborts an in-progress git clone task, kills process and removes partial files.
   */
  cancelClone(): { success: boolean; message: string } {
    if (this.cloneProgress.status !== 'cloning' || !this.activeCloneProcess) {
      return { success: false, message: 'No active git clone task to cancel.' };
    }

    this.logger.log('Cancelling active git clone task...');
    try {
      this.activeCloneProcess.kill('SIGTERM');
    } catch {}
    this.activeCloneProcess = null;

    const targetDir = this.activeCloneTargetDir;
    this.activeCloneTargetDir = null;

    if (targetDir && fs.existsSync(targetDir)) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
        this.logger.log(`Cleaned up partial cloned directory: ${targetDir}`);
      } catch (err) {
        this.logger.warn(`Could not remove partial directory ${targetDir}: ${String(err)}`);
      }
    }

    this.cloneProgress = {
      status: 'cancelled',
      stage: 'Git clone was cancelled by user.',
      percent: 0,
      outputLog: `${this.cloneProgress.outputLog}\n[Cancelled by user]`.trim(),
      error: 'Cancelled by user',
    };

    return { success: true, message: 'Git clone task has been cancelled.' };
  }
  /**
   * Resolves the base directory where project folders are created.
   * Prioritizes ./data/projects under current workspace or WEBUI_HOME/projects.
   */
  getProjectsBaseDir(): string {
    const explicit = this.configService.get<string>('WEBUI_PROJECTS_DIR')?.trim();
    if (explicit) return path.resolve(explicit);
    // 1. If running in container with mounted /workspaces or OMP_CWD
    const ompCwd = this.configService.get<string>('OMP_CWD')?.trim() || process.env.OMP_CWD?.trim();
    if (ompCwd && fs.existsSync(ompCwd) && fs.statSync(ompCwd).isDirectory()) {
      return path.resolve(ompCwd);
    }
    if (fs.existsSync('/workspaces') && fs.statSync('/workspaces').isDirectory()) {
      return '/workspaces';
    }

    // 2. If local ./workspaces exists
    const localWorkspaces = path.join(process.cwd(), 'workspaces');
    if (fs.existsSync(localWorkspaces) && fs.statSync(localWorkspaces).isDirectory()) {
      return localWorkspaces;
    }

    // 3. If local ./data exists, project directories are placed under data/projects
    const localData = path.join(process.cwd(), 'data');
    if (fs.existsSync(localData)) {
      return path.join(localData, 'projects');
    }

    const webuiHome = this.configService.get<string>('WEBUI_HOME')?.trim();
    if (webuiHome) {
      return path.join(path.resolve(webuiHome), 'projects');
    }

    return path.join(process.cwd(), 'data', 'projects');
  }

  /**
   * Lists existing projects under the data/projects base directory.
   */
  async listProjects(): Promise<ProjectsListResponseDto> {
    const baseDir = this.getProjectsBaseDir();
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
    const projects: ProjectItemDto[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectPath = path.join(baseDir, entry.name);
      try {
        const stat = await fs.promises.stat(projectPath);
        const isGit = fs.existsSync(path.join(projectPath, '.git'));
        const subFiles = await fs.promises.readdir(projectPath);
        projects.push({
          name: entry.name,
          path: projectPath,
          mtime: stat.mtimeMs,
          isGit,
          fileCount: subFiles.length,
        });
      } catch (err) {
        this.logger.warn(`Failed to inspect project folder ${projectPath}: ${String(err)}`);
      }
    }

    // Sort newest modified first
    projects.sort((a, b) => b.mtime - a.mtime);

    return { baseDir, projects };
  }

  /**
   * Creates a new project directory under data/projects, optionally inits git,
   * registers the workspace root, creates an initial thread, and optionally starts the first turn!
   */
  async createProject(dto: CreateProjectDto): Promise<CreateProjectResponseDto> {
    const rawName = typeof dto.name === 'string' ? dto.name.trim() : '';
    if (!rawName) {
      throw BusinessException.badRequest(
        ErrorCode.files.nameRequired,
        'Project name is required',
      );
    }

    // Sanitize project folder name against traversal and illegal characters
    if (rawName.includes('/') || rawName.includes('\\') || rawName.includes('..')) {
      throw BusinessException.badRequest(
        ErrorCode.files.nameInvalid,
        'Project name cannot contain path separators or parent directory references',
      );
    }

    const sanitizedName = rawName.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '').trim();
    if (!sanitizedName) {
      throw BusinessException.badRequest(
        ErrorCode.files.nameInvalid,
        'Project name contains only illegal characters',
      );
    }

    const baseDir = this.getProjectsBaseDir();
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const projectDir = path.join(baseDir, sanitizedName);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // 1. Initialize git repo if requested and .git doesn't exist
    let isGit = false;
    if (dto.initGit !== false) {
      const gitDir = path.join(projectDir, '.git');
      if (!fs.existsSync(gitDir)) {
        try {
          await execFileAsync('git', ['-C', projectDir, 'init', '-q', '-b', 'main']);
          isGit = true;
        } catch {
          try {
            await execFileAsync('git', ['-C', projectDir, 'init', '-q']);
            isGit = true;
          } catch (e) {
            this.logger.warn(`Could not init git in ${projectDir}: ${String(e)}`);
          }
        }
      } else {
        isGit = true;
      }
    }

    // 2. Register workspace root in FilesService so file operations, terminal and diff work immediately
    // 2. Register workspace root in FilesService as an explicitly trusted root
    try {
      this.filesService.addAllowedRoot(projectDir);
      this.filesService.addWorkspaceRoot(projectDir, true);
    } catch (e) {
      this.logger.warn(`Could not add ${projectDir} as dynamic workspace root: ${String(e)}`);
    }

    // 3. Start a new thread session with cwd = projectDir
    const threadRes = await this.threadsService.startThread({
      cwd: projectDir,
      model: dto.model,
    });

    const threadId = threadRes.thread.id;

    // 4. If initial prompt is provided, start the initial turn automatically
    if (dto.initialPrompt && dto.initialPrompt.trim()) {
      try {
        await this.threadsService.startTurn({
          threadId,
          input: [{ type: 'text', text: dto.initialPrompt.trim(), text_elements: [] }],
        });
      } catch (err) {
      }
    }

    this.logger.log(`Created new project "${sanitizedName}" at ${projectDir} with thread ${threadId}`);

    return {
      name: sanitizedName,
      path: projectDir,
      threadId,
      isGit,
    };
  }

  /**
   * Normalizes repository URL or owner/repo format and extracts a default project folder name.
   */
  normalizeGitUrl(rawUrl: string): { normalizedUrl: string; defaultName: string } {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      throw BusinessException.badRequest(
        ErrorCode.files.pathRequired,
        'Repository URL is required',
      );
    }

    let url = trimmed;
    // Handle owner/repo shorthand (e.g. "can1357/oh-my-pi")
    if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(url)) {
      url = `https://github.com/${url}.git`;
    } else if (url.startsWith('github.com/')) {
      url = `https://${url}`;
    }

    // Extract repository name from url
    const cleanUrl = url.replace(/\.git$/, '').replace(/\/+$/, '');
    const parts = cleanUrl.split(/[/:]/);
    const lastPart = parts[parts.length - 1];
    const defaultName = lastPart ? lastPart.replace(/[^a-zA-Z0-9_-]/g, '') : 'project';

    return {
      normalizedUrl: url,
      defaultName: defaultName || 'project',
    };
  }

  /**
   * Clones a GitHub repository into data/projects/<projectName>, registers workspace root,
   * creates an initial session thread, and optionally sends the initial prompt!
   */
  async cloneProject(dto: CloneProjectDto): Promise<CreateProjectResponseDto> {
    const { normalizedUrl, defaultName } = this.normalizeGitUrl(dto.url);
    const rawName = typeof dto.name === 'string' && dto.name.trim() ? dto.name.trim() : defaultName;

    // Validate project name against path traversal
    if (rawName.includes('/') || rawName.includes('\\') || rawName.includes('..')) {
      throw BusinessException.badRequest(
        ErrorCode.files.nameInvalid,
        'Project name cannot contain path separators or parent directory references',
      );
    }

    const sanitizedName = rawName.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '').trim();
    if (!sanitizedName) {
      throw BusinessException.badRequest(
        ErrorCode.files.nameInvalid,
        'Project name contains only illegal characters',
      );
    }

    const baseDir = this.getProjectsBaseDir();
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const projectDir = path.join(baseDir, sanitizedName);
    const alreadyExists = fs.existsSync(projectDir);

    if (!alreadyExists) {
      // If another clone is running, cancel it first to prevent conflicts
      if (this.cloneProgress.status === 'cloning') {
        this.cancelClone();
      }

      // Execute git clone with real-time progress and output tracking
      const args = ['clone', '--progress'];
      if (dto.shallow !== false) {
        args.push('--depth', '1');
      }
      if (dto.branch && dto.branch.trim()) {
        args.push('--branch', dto.branch.trim());
      }
      args.push(normalizedUrl, projectDir);

      this.logger.log(`Cloning repository from ${normalizedUrl} into ${projectDir}...`);
      this.activeCloneTargetDir = projectDir;
      this.cloneProgress = {
        status: 'cloning',
        stage: `Cloning ${normalizedUrl}...`,
        percent: 5,
        outputLog: `> git ${args.join(' ')}\n`,
        url: normalizedUrl,
        targetDir: projectDir,
      };

      try {
        const child = execFile('git', args, {
          timeout: 180_000,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
          },
        });
        this.activeCloneProcess = child;

        const parseProgress = (chunk: string) => {
          this.cloneProgress.outputLog += chunk;
          // Parse typical git clone progress: Receiving objects:  45% (120/266)
          const match = chunk.match(/Receiving objects:\s+(\d+)%/);
          if (match) {
            const pct = parseInt(match[1], 10);
            this.cloneProgress.percent = Math.min(95, Math.max(10, pct));
            this.cloneProgress.stage = `Receiving objects: ${pct}%`;
          } else if (chunk.includes('Resolving deltas:')) {
            const deltaMatch = chunk.match(/Resolving deltas:\s+(\d+)%/);
            if (deltaMatch) {
              const pct = parseInt(deltaMatch[1], 10);
              this.cloneProgress.percent = Math.min(98, 90 + Math.round(pct * 0.08));
              this.cloneProgress.stage = `Resolving deltas: ${pct}%`;
            }
          } else if (chunk.includes('Cloning into')) {
            this.cloneProgress.percent = 10;
            this.cloneProgress.stage = 'Connecting and cloning repository...';
          }
        };

        child.stdout?.on('data', (d) => parseProgress(d.toString()));
        child.stderr?.on('data', (d) => parseProgress(d.toString()));

        await new Promise<void>((resolve, reject) => {
          child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`git clone exited with code ${code}`));
          });
          child.on('error', reject);
        });

        this.activeCloneProcess = null;
        this.activeCloneTargetDir = null;
        this.cloneProgress.status = 'completed';
        this.cloneProgress.percent = 100;
        this.cloneProgress.stage = 'Repository cloned successfully!';
      } catch (err) {
        const isCancelled = this.cloneProgress.status === 'cancelled';
        this.activeCloneProcess = null;
        this.activeCloneTargetDir = null;

        // Clean up partial directory on clone failure if not already cleaned
        if (fs.existsSync(projectDir)) {
          try {
            await fs.promises.rm(projectDir, { recursive: true, force: true });
          } catch {}
        }

        if (isCancelled) {
          throw BusinessException.badRequest(
            ErrorCode.git.commandFailed,
            'Git clone operation was cancelled by user.',
          );
        }

        this.cloneProgress.status = 'failed';
        this.cloneProgress.error = String(err);
        this.cloneProgress.stage = 'Git clone failed.';

        this.logger.error(`Git clone failed for ${normalizedUrl}: ${this.cloneProgress.outputLog}`);
        throw BusinessException.badRequest(
          ErrorCode.git.commandFailed,
          `Failed to clone repository: ${this.cloneProgress.outputLog.slice(-400).trim() || String(err)}`,
        );
      }
    } else {
      this.logger.log(`Project directory ${projectDir} already exists; opening existing workspace.`);
    }

    // Register workspace root in FilesService
    // Register workspace root in FilesService as an explicitly trusted root
    try {
      this.filesService.addAllowedRoot(projectDir);
      this.filesService.addWorkspaceRoot(projectDir, true);
    } catch (e) {
      this.logger.warn(`Could not add ${projectDir} as dynamic workspace root: ${String(e)}`);
    }

    // Start initial thread session with cwd = projectDir
    const threadRes = await this.threadsService.startThread({
      cwd: projectDir,
      model: dto.model,
    });

    const threadId = threadRes.thread.id;

    // Send initial prompt if provided
    if (dto.initialPrompt && dto.initialPrompt.trim()) {
      try {
        await this.threadsService.startTurn({
          threadId,
          input: [{ type: 'text', text: dto.initialPrompt.trim(), text_elements: [] }],
        });
      } catch (err) {
        this.logger.warn(`Failed to send initial prompt to thread ${threadId}: ${String(err)}`);
      }
    }

    this.logger.log(`Cloned and opened project "${sanitizedName}" at ${projectDir} with thread ${threadId}`);

    return {
      name: sanitizedName,
      path: projectDir,
      threadId,
      isGit: true,
    };
  }

  /**
   * Deletes a project from data/projects (or /workspaces).
   * If deleteDirectory is true, completely removes the physical directory from disk.
   */
  async deleteProject(
    projectName: string,
    deleteDirectory = false,
  ): Promise<DeleteProjectResponseDto> {
    const rawName = projectName.trim();
    if (rawName.includes('/') || rawName.includes('\\') || rawName.includes('..')) {
      throw BusinessException.badRequest(
        ErrorCode.files.nameInvalid,
        'Project name cannot contain path separators or parent directory references',
      );
    }
    const sanitizedName = rawName.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '').trim();
    if (!sanitizedName) {
      throw BusinessException.badRequest(
        ErrorCode.files.nameRequired,
        'Project name is required',
      );
    }

    const baseDir = this.getProjectsBaseDir();
    const projectDir = path.join(baseDir, sanitizedName);

    // 1. Check if there are active or archived threads under this project/workspace
    try {
      const overview = await this.threadsService.listOverview({ limit: 100 });
      const activeThreadsInProject = overview.data.filter((row) => {
        const cwd = row.thread?.cwd;
        if (!cwd) return false;
        const normalizedCwd = path.resolve(cwd).toLowerCase();
        const normalizedProject = path.resolve(projectDir).toLowerCase();
        return (
          normalizedCwd === normalizedProject ||
          normalizedCwd.startsWith(normalizedProject + path.sep.toLowerCase())
        );
      });

      if (activeThreadsInProject.length > 0) {
        throw BusinessException.badRequest(
          ErrorCode.threads.deleteTopologyConflict,
          `Cannot delete project: please delete all ${activeThreadsInProject.length} conversation(s) inside this project first.`,
        );
      }
    } catch (err) {
      if (err instanceof BusinessException) {
        throw err;
      }
      this.logger.warn(`Could not verify threads before project delete: ${String(err)}`);
    }

    let deletedDir = false;
    if (fs.existsSync(projectDir)) {
      if (deleteDirectory) {
        try {
          await fs.promises.rm(projectDir, { recursive: true, force: true });
          deletedDir = true;
          this.logger.log(`Deleted project directory on disk: ${projectDir}`);
        } catch (err) {
          this.logger.error(`Failed to delete project directory ${projectDir}: ${String(err)}`);
          throw BusinessException.badRequest(
            ErrorCode.files.operationFailed,
            `Failed to remove project directory: ${String(err)}`,
          );
        }
      }
    }

    // Unregister root from FilesService
    try {
      this.filesService.removeWorkspaceRoot(projectDir);
    } catch {}

    return {
      name: sanitizedName,
      deletedDirectory: deletedDir,
      success: true,
    };
  }
}
