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
  CreateProjectDto,
  CreateProjectResponseDto,
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

    // If local ./data exists, project directories are placed under data/projects
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
    try {
      this.filesService.addWorkspaceRoot(projectDir);
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
}
