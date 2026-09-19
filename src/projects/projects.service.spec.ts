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
  let mockFilesService: { addWorkspaceRoot: Mock; addAllowedRoot: Mock; removeWorkspaceRoot: Mock };
  let mockThreadsService: {
    startThread: Mock;
    startTurn: Mock;
  };

  beforeEach(async () => {
    tempBaseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'omp-projects-test-'));
    mockFilesService = {
      addWorkspaceRoot: vi.fn(),
      addAllowedRoot: vi.fn(),
      removeWorkspaceRoot: vi.fn(),
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

    expect(mockFilesService.addWorkspaceRoot).toHaveBeenCalledWith(result.path, true);
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

  it('normalizes various GitHub repository URL formats correctly', () => {
    const res1 = service.normalizeGitUrl('can1357/oh-my-pi');
    expect(res1.normalizedUrl).toBe('https://github.com/can1357/oh-my-pi.git');
    expect(res1.defaultName).toBe('oh-my-pi');

    const res2 = service.normalizeGitUrl('https://github.com/can1357/oh-my-pi.git');
    expect(res2.normalizedUrl).toBe('https://github.com/can1357/oh-my-pi.git');
    expect(res2.defaultName).toBe('oh-my-pi');

    const res3 = service.normalizeGitUrl('github.com/owner/demo-repo');
    expect(res3.normalizedUrl).toBe('https://github.com/owner/demo-repo');
    expect(res3.defaultName).toBe('demo-repo');

    expect(() => service.normalizeGitUrl('')).toThrow(BusinessException);
  });

  it('validates project names when cloning', async () => {
    await expect(
      service.cloneProject({ url: 'owner/repo', name: '../bad' }),
    ).rejects.toBeInstanceOf(BusinessException);
    await expect(
      service.cloneProject({ url: '', name: 'good' }),
    ).rejects.toBeInstanceOf(BusinessException);
  });

  it('opens existing directory when project folder already exists', async () => {
    const existingFolder = path.join(tempBaseDir, 'existing-repo');
    await fs.promises.mkdir(existingFolder, { recursive: true });

    const result = await service.cloneProject({
      url: 'owner/existing-repo',
      initialPrompt: 'Review the existing codebase',
    });

    expect(result.name).toBe('existing-repo');
    expect(result.path).toBe(existingFolder);
    expect(mockFilesService.addWorkspaceRoot).toHaveBeenCalledWith(existingFolder, true);
    expect(mockThreadsService.startThread).toHaveBeenCalledWith({
      cwd: existingFolder,
      model: undefined,
    });
    expect(mockThreadsService.startTurn).toHaveBeenCalledWith({
      threadId: 'thread-test-123',
      input: [{ type: 'text', text: 'Review the existing codebase', text_elements: [] }],
    });
  });

  it('deletes project and removes directory when deleteDirectory is true', async () => {
    const projectFolder = path.join(tempBaseDir, 'to-delete');
    await fs.promises.mkdir(projectFolder, { recursive: true });
    await fs.promises.writeFile(path.join(projectFolder, 'file.txt'), 'hello');

    const res = await service.deleteProject('to-delete', true);
    expect(res.success).toBe(true);
    expect(res.deletedDirectory).toBe(true);
    expect(fs.existsSync(projectFolder)).toBe(false);
    expect(mockFilesService.removeWorkspaceRoot).toHaveBeenCalledWith(projectFolder);
  });

  it('deletes project without removing directory when deleteDirectory is false', async () => {
    const projectFolder = path.join(tempBaseDir, 'keep-folder');
    await fs.promises.mkdir(projectFolder, { recursive: true });

    const res = await service.deleteProject('keep-folder', false);
    expect(res.success).toBe(true);
    expect(res.deletedDirectory).toBe(false);
    expect(fs.existsSync(projectFolder)).toBe(true);
  });
});
