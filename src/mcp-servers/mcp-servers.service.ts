/** MCP server status facade over OMP engine JSON-RPC methods and local mcp.json config management. */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { OmpService } from '../omp/omp-engine.service';
import type { v2 } from '../omp/omp-schema';
import {
  InstallMcpServerDto,
  McpConfigResponseDto,
  McpStoreItemDto,
  McpStoreResponseDto,
  ToggleMcpServerDto,
} from './dto/mcp-servers.dto';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-codes';

export const GITHUB_MIRRORS = [
  { id: 'direct', name: '官方直连 (Direct)', url: 'https://github.com/' },
  { id: 'ghfast', name: 'ghfast.top (极速代理)', url: 'https://ghfast.top/' },
  { id: 'ghproxy', name: 'ghproxy.net (节点加速)', url: 'https://ghproxy.net/' },
  { id: 'gitmirror', name: 'gitmirror.com (镜像站)', url: 'https://hub.gitmirror.com/' },
  { id: 'kkgithub', name: 'kkgithub.com (海外节点)', url: 'https://kkgithub.com/' },
];

export const DEFAULT_MCP_STORE: Array<{
  name: string;
  title: string;
  description: string;
  category: string;
  type: 'stdio' | 'http';
  hasGithubSource: boolean;
  config: Record<string, unknown>;
}> = [
  {
    name: 'exa',
    title: 'Exa Search',
    description: '基于 Exa AI 引擎的实时网页搜索与内容深度提取 MCP，具备高准确度检索能力',
    category: '搜索与检索',
    type: 'http',
    hasGithubSource: false,
    config: {
      type: 'http',
      url: 'https://mcp.exa.ai/mcp',
    },
  },
  {
    name: 'context7',
    title: 'Context7 Docs',
    description: 'Upstash 提供的官方最新第三方库/框架技术文档、API 说明与代码范例实时查询 MCP',
    category: '文档与知识',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
  },
  {
    name: 'playwright',
    title: 'Playwright Browser',
    description: 'Playwright 官方无头浏览器自动化控制 MCP，支持网页导航、截图、点击与表单交互',
    category: '自动化与爬虫',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['@playwright/mcp@latest'],
    },
  },
  {
    name: 'deepwiki',
    title: 'DeepWiki AI',
    description: '基于 DeepWiki 的 GitHub 开源仓库智能问答与代码架构 Wiki 知识库 MCP',
    category: '代码分析与Wiki',
    type: 'http',
    hasGithubSource: false,
    config: {
      type: 'http',
      url: 'https://mcp.deepwiki.com/mcp',
    },
  },
  {
    name: 'serena',
    title: 'Serena Assistant',
    description: '专业 IDE 语义代码分析与多轮长效记忆管理 MCP（Python/uvx 驱动，支持 GitHub 镜像加速）',
    category: '代码助手与记忆',
    type: 'stdio',
    hasGithubSource: true,
    config: {
      type: 'stdio',
      command: 'uvx',
      args: [
        '--from',
        'git+https://github.com/oraios/serena',
        'serena',
        'start-mcp-server',
        '--context',
        'ide-assistant',
      ],
      env: {
        PYTHONUNBUFFERED: '1',
      },
    },
  },
];

export function rewriteGithubUrl(raw: string, mirrorUrl?: string): string {
  if (!mirrorUrl || mirrorUrl === 'direct' || mirrorUrl === 'https://github.com/') {
    return raw;
  }
  if (mirrorUrl === 'https://kkgithub.com/') {
    return raw
      .replace('https://github.com/', 'https://kkgithub.com/')
      .replace('git+https://github.com/', 'git+https://kkgithub.com/');
  }

  const prefix = mirrorUrl.endsWith('/') ? mirrorUrl : `${mirrorUrl}/`;
  if (raw.startsWith('git+https://github.com/')) {
    return `git+${prefix}https://github.com/${raw.slice('git+https://github.com/'.length)}`;
  }
  if (raw.startsWith('https://github.com/')) {
    return `${prefix}${raw}`;
  }
  return raw;
}

export function recursivelyApplyMirror(obj: unknown, mirrorUrl: string): unknown {
  if (typeof obj === 'string') {
    return rewriteGithubUrl(obj, mirrorUrl);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => recursivelyApplyMirror(item, mirrorUrl));
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = recursivelyApplyMirror(v, mirrorUrl);
    }
    return result;
  }
  return obj;
}
@Injectable()
export class McpServersService {
  private readonly logger = new Logger(McpServersService.name);

  constructor(
    private readonly ompService: OmpService,
    private readonly configService: ConfigService,
  ) {}

  /** Resolves absolute path to mcp.json in the agent directory. */
  getMcpConfigPath(): string {
    const webuiHome = this.configService.get<string>('WEBUI_HOME')?.trim();
    const baseDir = webuiHome || path.join(homedir(), '.omp');
    return path.join(baseDir, 'agent', 'mcp.json');
  }

  /** Reads mcp.json directly from disk. */
  readMcpConfigFile(): {
    $schema?: string;
    mcpServers: Record<string, unknown>;
    disabledServers: string[];
  } {
    const filePath = this.getMcpConfigPath();
    if (!fs.existsSync(filePath)) {
      return {
        $schema: 'https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json',
        mcpServers: {},
        disabledServers: [],
      };
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        $schema: parsed.$schema,
        mcpServers: (parsed.mcpServers && typeof parsed.mcpServers === 'object') ? parsed.mcpServers : {},
        disabledServers: Array.isArray(parsed.disabledServers) ? parsed.disabledServers : [],
      };
    } catch (err) {
      this.logger.error(`Failed to parse mcp.json at ${filePath}: ${String(err)}`);
      return { mcpServers: {}, disabledServers: [] };
    }
  }

  /** Writes mcp.json to disk. */
  writeMcpConfigFile(data: {
    $schema?: string;
    mcpServers: Record<string, unknown>;
    disabledServers: string[];
  }): void {
    const filePath = this.getMcpConfigPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /** Gets current MCP configuration with available mirrors. */
  async getConfig(): Promise<McpConfigResponseDto> {
    const config = this.readMcpConfigFile();
    return {
      mcpServers: config.mcpServers,
      disabledServers: config.disabledServers,
      mirrors: GITHUB_MIRRORS,
    };
  }

  /** Gets list of available MCP servers in the store along with current install status. */
  async getStore(): Promise<McpStoreResponseDto> {
    const config = this.readMcpConfigFile();
    const installedKeys = new Set(Object.keys(config.mcpServers));
    const disabledSet = new Set(config.disabledServers);

    const items: McpStoreItemDto[] = DEFAULT_MCP_STORE.map((entry) => {
      const isInstalled = installedKeys.has(entry.name);
      const isEnabled = isInstalled && !disabledSet.has(entry.name);
      return {
        name: entry.name,
        title: entry.title,
        description: entry.description,
        category: entry.category,
        type: entry.type,
        config: (isInstalled ? config.mcpServers[entry.name] : entry.config) as Record<string, unknown>,
        installed: isInstalled,
        enabled: isEnabled,
        hasGithubSource: entry.hasGithubSource,
      };
    });

    return {
      items,
      mirrors: GITHUB_MIRRORS,
    };
  }

  /** Installs or updates an MCP server into mcp.json with optional GitHub mirror acceleration. */
  async installServer(dto: InstallMcpServerDto): Promise<{ success: boolean; name: string }> {
    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      throw BusinessException.badRequest(ErrorCode.files.nameRequired, 'Server name is required');
    }

    const processedConfig = (dto.mirrorUrl && dto.mirrorUrl !== 'direct')
      ? (recursivelyApplyMirror(dto.config, dto.mirrorUrl) as Record<string, unknown>)
      : dto.config;

    const data = this.readMcpConfigFile();
    data.mcpServers[trimmedName] = processedConfig;
    data.disabledServers = data.disabledServers.filter((s) => s !== trimmedName);
    this.writeMcpConfigFile(data);

    try {
      await this.reloadAll();
    } catch (err) {
      this.logger.warn(`Failed to reload MCP servers after install: ${String(err)}`);
    }

    this.logger.log(`Installed MCP server "${trimmedName}" with mirror "${dto.mirrorUrl || 'direct'}"`);
    return { success: true, name: trimmedName };
  }

  /** Toggles enablement of an MCP server. */
  async toggleServer(dto: ToggleMcpServerDto): Promise<{ success: boolean; name: string; enabled: boolean }> {
    const trimmedName = dto.name.trim();
    const data = this.readMcpConfigFile();
    const disabledSet = new Set(data.disabledServers);

    if (dto.enabled) {
      disabledSet.delete(trimmedName);
    } else {
      disabledSet.add(trimmedName);
    }
    data.disabledServers = Array.from(disabledSet);
    this.writeMcpConfigFile(data);

    try {
      await this.reloadAll();
    } catch (err) {
      this.logger.warn(`Failed to reload MCP servers after toggle: ${String(err)}`);
    }

    return { success: true, name: trimmedName, enabled: dto.enabled };
  }

  /** Deletes an MCP server from mcp.json. */
  async deleteServer(name: string): Promise<{ success: boolean; name: string }> {
    const trimmedName = name.trim();
    const data = this.readMcpConfigFile();
    delete data.mcpServers[trimmedName];
    data.disabledServers = data.disabledServers.filter((s) => s !== trimmedName);
    this.writeMcpConfigFile(data);

    try {
      await this.reloadAll();
    } catch (err) {
      this.logger.warn(`Failed to reload MCP servers after delete: ${String(err)}`);
    }

    this.logger.log(`Removed MCP server "${trimmedName}"`);
    return { success: true, name: trimmedName };
  }

  /** Lists MCP server inventory and auth metadata. */
  async listServers(
    params: v2.ListMcpServerStatusParams = {},
  ): Promise<v2.ListMcpServerStatusResponse> {
    return this.ompService.request<v2.ListMcpServerStatusResponse>(
      'mcpServerStatus/list',
      params,
    );
  }

  /** Reloads all configured MCP servers. The protocol does not support per-server toggles. */
  async reloadAll(): Promise<void> {
    await this.ompService.request<v2.McpServerRefreshResponse>(
      'config/mcpServer/reload',
    );
  }

  /** Starts an OAuth login flow for an MCP server and returns the browser URL. */
  startOauthLogin(
    params: v2.McpServerOauthLoginParams,
  ): Promise<v2.McpServerOauthLoginResponse> {
    return this.ompService.request<v2.McpServerOauthLoginResponse>(
      'mcpServer/oauth/login',
      params,
    );
  }
}
