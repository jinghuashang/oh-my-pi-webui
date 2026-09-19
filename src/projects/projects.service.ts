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

  constructor(
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
    private readonly threadsService: ThreadsService,
  ) {}

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
      // Execute git clone
      const args = ['clone'];
      if (dto.shallow !== false) {
        args.push('--depth', '1');
      }
      if (dto.branch && dto.branch.trim()) {
        args.push('--branch', dto.branch.trim());
      }
      args.push(normalizedUrl, projectDir);

      this.logger.log(`Cloning repository from ${normalizedUrl} into ${projectDir}...`);
      try {
        await execFileAsync('git', args, {
          timeout: 180_000,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
          },
        });
      } catch (err) {
        // Clean up partial directory on clone failure
        if (fs.existsSync(projectDir)) {
          try {
            await fs.promises.rm(projectDir, { recursive: true, force: true });
          } catch {}
        }
        let stderr = '';
        if (err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string') {
          stderr = err.stderr;
        } else {
          stderr = String(err);
        }
        this.logger.error(`Git clone failed for ${normalizedUrl}: ${stderr}`);
        throw BusinessException.badRequest(
          ErrorCode.git.commandFailed,
          `Failed to clone repository: ${stderr.trim()}`,
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
