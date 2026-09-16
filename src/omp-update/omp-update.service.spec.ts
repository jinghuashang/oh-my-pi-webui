import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { OmpUpdateService } from './omp-update.service';

describe('OmpUpdateService', () => {
  const service = new OmpUpdateService(new ConfigService());

  it('correctly compares semantic versions', () => {
    expect(service.compareSemver('18.2.1', '18.1.19')).toBeGreaterThan(0);
    expect(service.compareSemver('18.1.19', '18.2.1')).toBeLessThan(0);
    expect(service.compareSemver('v18.2.1', '18.2.1')).toBe(0);
    expect(service.compareSemver('19.0.0', '18.99.99')).toBeGreaterThan(0);
    expect(service.compareSemver('18.1.1', '18.1.1')).toBe(0);
  });

  it('detects current version via omp CLI', async () => {
    const version = await service.getCurrentVersion();
    expect(version).toMatch(/\d+\.\d+\.\d+/);
  });
});
