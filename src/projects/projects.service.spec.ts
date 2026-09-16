import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BusinessException } from '../common/business.exception';
import { FilesService } from '../files/files.service';
import { ThreadsService } from '../threads/threads.service';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let tempBaseDir: string;
  let mockFilesService: { addWorkspaceRoot: Mock };
  let mockThreadsService: {
    startThread: Mock;
    startTurn: Mock;
  };

  beforeEach(async () => {
    tempBaseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'omp-projects-test-'));
    mockFilesService = {
      addWorkspaceRoot: vi.fn(),
    };
    mockThreadsService = {
      startThread: vi.fn().mockResolvedValue({
        thread: {
          id: 'thread-test-123',
          cwd: tempBaseDir,
        },
      }),
      startTurn: vi.fn().mockResolvedValue({}),
    };

    const configService = new ConfigService({
      WEBUI_PROJECTS_DIR: tempBaseDir,
    });

    service = new ProjectsService(
      configService,
      mockFilesService as unknown as FilesService,
      mockThreadsService as unknown as ThreadsService,
    );
  });

  it('resolves base directory correctly from config', () => {
    expect(service.getProjectsBaseDir()).toBe(tempBaseDir);
  });

  it('rejects invalid or traversal project names', async () => {
    await expect(service.createProject({ name: '' })).rejects.toBeInstanceOf(
      BusinessException,
    );
    await expect(service.createProject({ name: '../evil' })).rejects.toBeInstanceOf(
      BusinessException,
    );
    await expect(service.createProject({ name: 'foo/bar' })).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it('creates project directory, inits git, registers root and starts thread session', async () => {
    const result = await service.createProject({
      name: 'hello-world-project',
      initialPrompt: 'Build me a calculator app',
      initGit: true,
    });

    expect(result.name).toBe('hello-world-project');
    expect(result.path).toBe(path.join(tempBaseDir, 'hello-world-project'));
    expect(result.threadId).toBe('thread-test-123');
    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.existsSync(path.join(result.path, '.git'))).toBe(true);

    expect(mockFilesService.addWorkspaceRoot).toHaveBeenCalledWith(result.path);
    expect(mockThreadsService.startThread).toHaveBeenCalledWith({
      cwd: result.path,
      model: undefined,
    });
    expect(mockThreadsService.startTurn).toHaveBeenCalledWith({
      threadId: 'thread-test-123',
      input: [{ type: 'text', text: 'Build me a calculator app', text_elements: [] }],
    });

    const listing = await service.listProjects();
    expect(listing.projects.some((p) => p.name === 'hello-world-project')).toBe(true);
  });
});
