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
  McpStoreSourceDto,
  ToggleMcpServerDto,
} from './dto/mcp-servers.dto';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-codes';

export const GITHUB_MIRRORS = [
  { id: 'direct', name: 'Direct (Official)', url: 'https://github.com/' },
  { id: 'ghproxy', name: 'ghproxy.net (Fast Proxy)', url: 'https://ghproxy.net/' },
  { id: 'ghddlc', name: 'gh.ddlc.top (Node Proxy)', url: 'https://gh.ddlc.top/' },
  { id: 'ghfast', name: 'ghfast.top (Proxy)', url: 'https://ghfast.top/' },
  { id: 'gitmirror', name: 'hub.gitmirror.com (Mirror)', url: 'https://hub.gitmirror.com/' },
  { id: 'kkgithub', name: 'kkgithub.com (Overseas Node)', url: 'https://kkgithub.com/' },
];

export const MCP_STORE_SOURCES: McpStoreSourceDto[] = [
  {
    id: 'official',
    name: 'OMP WebUI Official Store',
    url: 'https://github.com/jinghuashang/oh-my-pi-webui',
    description: 'Curated and verified core MCP services for Oh My Pi',
  },
  {
    id: 'mcpservers-org',
    name: 'MCPServers.org Community',
    url: 'https://mcpservers.org/zh-CN/',
    description: 'Global open registry with community-verified Model Context Protocol servers',
  },
];

export const MCPSERVERS_ORG_STORE: Array<{
  name: string;
  title: string;
  description: string;
  category: string;
  type: 'stdio' | 'http';
  hasGithubSource: boolean;
  config: Record<string, unknown>;
}> = [
  {
    name: 'filesystem',
    title: 'Filesystem Server',
    description: 'Local file system access with secure permission boundaries by Model Context Protocol.',
    category: 'System & Files',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    },
  },
  {
    name: 'github',
    title: 'GitHub Server',
    description: 'Official GitHub MCP server for managing issues, pull requests, files, and branches.',
    category: 'Developer Tools',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    },
  },
  {
    name: 'postgres',
    title: 'PostgreSQL Server',
    description: 'Read-only database access and schema inspection for PostgreSQL databases.',
    category: 'Database',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
    },
  },
  {
    name: 'sqlite',
    title: 'SQLite Server',
    description: 'Query and inspect SQLite databases with automatic table and schema detection.',
    category: 'Database',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', 'data.db'],
    },
  },
  {
    name: 'fetch',
    title: 'Fetch Server',
    description: 'Web page content fetching and automatic HTML-to-Markdown conversion.',
    category: 'Search & Retrieval',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
  },
  {
    name: 'brave-search',
    title: 'Brave Search Server',
    description: 'Privacy-preserving web and local search using the Brave Search API.',
    category: 'Search & Retrieval',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: '' },
    },
  },
  {
    name: 'git',
    title: 'Git Tools Server',
    description: 'Git repository reading, commit searching, log inspection, and branch diffing tools.',
    category: 'Developer Tools',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-server-git', '--repository', '.'],
    },
  },
  {
    name: 'memory',
    title: 'Knowledge Graph Memory',
    description: 'Persistent knowledge graph memory system for long-term multi-session recall.',
    category: 'Coding & Memory',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  },
  {
    name: 'puppeteer',
    title: 'Puppeteer Automation',
    description: 'Browser navigation, interaction, console log inspection, and screenshot capture.',
    category: 'Browser & Automation',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    },
  },
  {
    name: 'sentry',
    title: 'Sentry Error Tracker',
    description: 'Retrieve and analyze application exceptions, stacktraces, and issue summaries from Sentry.',
    category: 'Developer Tools',
    type: 'stdio',
    hasGithubSource: false,
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sentry'],
      env: { SENTRY_AUTH_TOKEN: '' },
    },
  },
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
    description:
      'Real-time web search and deep content extraction MCP powered by Exa AI with high retrieval precision.',
    category: 'Search & Retrieval',
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
    description:
      'Official documentation, API references, and code examples search MCP for libraries and frameworks by Upstash.',
    category: 'Documentation & Knowledge',
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
    description:
      'Official headless browser automation MCP supporting navigation, screenshots, clicking, and form interactions.',
    category: 'Browser & Automation',
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
    description:
      'GitHub open-source repository intelligent Q&A and code architecture wiki knowledge base MCP powered by DeepWiki.',
    category: 'Code Analysis & Wiki',
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
    description:
      'Professional IDE semantic code analysis and multi-turn persistent session memory management MCP (Python/uvx driven).',
    category: 'Coding & Memory',
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

  private get networkProxy(): string | undefined {
    const proxy = this.configService.get<string>('WEBUI_NETWORK_PROXY')?.trim();
    return proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || undefined;
  }

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

  /** Gets list of available MCP servers in the store along with current install status and sources. */
  async getStore(source = 'official'): Promise<McpStoreResponseDto> {
    const config = this.readMcpConfigFile();
    const installedKeys = new Set(Object.keys(config.mcpServers));
    const disabledSet = new Set(config.disabledServers);

    const storeCatalog = source === 'mcpservers-org' ? MCPSERVERS_ORG_STORE : DEFAULT_MCP_STORE;

    const items: McpStoreItemDto[] = storeCatalog.map((entry) => {
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
      sources: MCP_STORE_SOURCES,
      activeSource: source,
    };
  }
  /** Installs or updates an MCP server into mcp.json with optional GitHub mirror acceleration. */
  async installServer(dto: InstallMcpServerDto): Promise<{ success: boolean; name: string }> {
    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      throw BusinessException.badRequest(ErrorCode.files.nameRequired, 'Server name is required');
    }

    let processedConfig = (dto.mirrorUrl && dto.mirrorUrl !== 'direct')
      ? (recursivelyApplyMirror(dto.config, dto.mirrorUrl) as Record<string, unknown>)
      : { ...dto.config };

    // If a global network proxy is configured, inject it into MCP server environment if stdio
    const proxy = this.networkProxy;
    if (proxy && typeof processedConfig === 'object' && processedConfig !== null) {
      const isStdio = !('type' in processedConfig) || processedConfig.type === 'stdio';
      if (isStdio) {
        const env = ((processedConfig as Record<string, unknown>).env as Record<string, string>) || {};
        processedConfig = {
          ...processedConfig,
          env: {
            ...env,
            HTTPS_PROXY: env.HTTPS_PROXY || proxy,
            HTTP_PROXY: env.HTTP_PROXY || proxy,
            ALL_PROXY: env.ALL_PROXY || proxy,
          },
        };
      }
    }
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
