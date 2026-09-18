import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { WebuiUpdateService } from './webui-update.service';
import { OmpUpdateService } from '../omp-update/omp-update.service';

describe('WebuiUpdateService', () => {
  const configService = new ConfigService();
  const ompUpdateService = new OmpUpdateService(configService);
  const service = new WebuiUpdateService(configService, ompUpdateService);

  it('reads package.json version correctly', () => {
    const version = service.getCurrentVersion();
    expect(version).toBe('0.1.0');
  });

  it('detects current git commit hash', async () => {
    const commit = await service.getCurrentCommit();
    expect(commit).toMatch(/^[a-f0-9]{7,40}$/);
  });
  it(
    'checks for updates and returns version response object',
    async () => {
      const check = await service.checkUpdate();
      expect(check.currentVersion).toBe('0.1.0');
      expect(check.currentCommit).toMatch(/^[a-f0-9]{7,40}$/);
      expect(check.repoUrl).toBe('https://github.com/jinghuashang/oh-my-pi-webui');
      expect(typeof check.hasUpdate).toBe('boolean');
      expect(check.updateCommand).toContain('git pull');
    },
    15000,
  );

  it('detects docker and writable status', () => {
    expect(typeof service.isDocker()).toBe('boolean');
    expect(typeof service.canAutoUpdate()).toBe('boolean');
  });

  it('rejects in-place upgrade when canAutoUpdate is false', async () => {
    const canUpdateSpy = vi.spyOn(service, 'canAutoUpdate').mockReturnValue(false);
    const res = await service.upgrade({});
    expect(res.success).toBe(false);
    expect(res.message).toBeTruthy();
    canUpdateSpy.mockRestore();
  });
});
