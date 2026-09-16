/** Unit tests for McpServersService: list and reload operations. */
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { OmpService } from '../omp/omp-engine.service';
import { McpServersService, rewriteGithubUrl } from './mcp-servers.service';

describe('McpServersService', () => {
  let moduleRef: TestingModule;
  let service: McpServersService;

  const codexService = { request: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      providers: [
        McpServersService,
        { provide: OmpService, useValue: codexService },
        { provide: ConfigService, useValue: new ConfigService() },
      ],
    }).compile();
    service = moduleRef.get(McpServersService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('lists MCP servers with default params', async () => {
    const response = { data: [{ name: 'context7' }], nextCursor: null };
    codexService.request.mockResolvedValueOnce(response);
    const result = await service.listServers();
    expect(result).toBe(response);
    expect(codexService.request).toHaveBeenCalledWith(
      'mcpServerStatus/list',
      {},
    );
  });

  it('passes pagination and detail params', async () => {
    const params = {
      cursor: 'next',
      limit: 25,
      detail: 'toolsAndAuthOnly' as const,
    };
    const response = { data: [], nextCursor: null };
    codexService.request.mockResolvedValueOnce(response);
    const result = await service.listServers(params);
    expect(result).toBe(response);
    expect(codexService.request).toHaveBeenCalledWith(
      'mcpServerStatus/list',
      params,
    );
  });

  it('reloads all MCP servers', async () => {
    codexService.request.mockResolvedValueOnce(undefined);
    await service.reloadAll();
    expect(codexService.request).toHaveBeenCalledWith(
      'config/mcpServer/reload',
    );
  });

  it('rewrites GitHub URLs with mirror prefix', () => {
    const rawGit = 'git+https://github.com/oraios/serena';
    const rawHttp = 'https://github.com/oraios/serena';

    expect(rewriteGithubUrl(rawGit, 'direct')).toBe(rawGit);
    expect(rewriteGithubUrl(rawGit, 'https://github.com/')).toBe(rawGit);
    expect(rewriteGithubUrl(rawGit, 'https://ghfast.top/')).toBe(
      'git+https://ghfast.top/https://github.com/oraios/serena',
    );
    expect(rewriteGithubUrl(rawHttp, 'https://ghproxy.net/')).toBe(
      'https://ghproxy.net/https://github.com/oraios/serena',
    );
    expect(rewriteGithubUrl(rawGit, 'https://kkgithub.com/')).toBe(
      'git+https://kkgithub.com/oraios/serena',
    );
  });

  it('returns default store items with mirrors', async () => {
    const store = await service.getStore();
    expect(store.items.length).toBeGreaterThanOrEqual(5);
    expect(store.items.some((i) => i.name === 'exa')).toBe(true);
    expect(store.items.some((i) => i.name === 'context7')).toBe(true);
    expect(store.items.some((i) => i.name === 'playwright')).toBe(true);
    expect(store.items.some((i) => i.name === 'deepwiki')).toBe(true);
    expect(store.items.some((i) => i.name === 'serena')).toBe(true);
    expect(store.mirrors.length).toBeGreaterThan(0);
  });
});
