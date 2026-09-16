import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { jsonValueSchema } from '../../omp/dto/v2/openapi.schema';

export const MCP_SERVER_STATUS_DETAIL_VALUES = [
  'full',
  'toolsAndAuthOnly',
] as const;

export const MCP_SERVER_STARTUP_STATE_VALUES = [
  'starting',
  'ready',
  'failed',
  'cancelled',
] as const;

/** Query params for mcpServerStatus/list. */
export class ListMcpServersQueryDto {
  @ApiPropertyOptional()
  cursor?: string;

  @ApiPropertyOptional({ type: Number })
  limit?: number;

  @ApiPropertyOptional({ enum: MCP_SERVER_STATUS_DETAIL_VALUES })
  detail?: (typeof MCP_SERVER_STATUS_DETAIL_VALUES)[number];
}

/** Raw MCP server status list. Tool/resource schemas are dynamic MCP payloads. */
export class McpServersListResponseDto {
  @ApiProperty({
    type: 'array',
    items: jsonValueSchema(false) as Record<string, unknown>,
  })
  data!: unknown[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

/** Response for config/mcpServer/reload. */
export class McpServersReloadResponseDto {
  @ApiProperty()
  ok!: boolean;
}

/** Request body for mcpServer/oauth/login. */
export class McpServerOauthLoginRequestDto {
  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ type: [String] })
  scopes?: string[];

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 600 })
  timeoutSecs?: number;
}

/** Response for mcpServer/oauth/login. */
export class McpServerOauthLoginResponseDto {
  @ApiProperty()
  authorizationUrl!: string;
}

export class McpConfigResponseDto {
  @ApiProperty({ description: 'Configured MCP servers dictionary' })
  mcpServers!: Record<string, unknown>;

  @ApiProperty({ description: 'List of disabled server names', type: [String] })
  disabledServers!: string[];

  @ApiProperty({ description: 'Available GitHub mirrors for MCP installation' })
  mirrors!: Array<{ id: string; name: string; url: string }>;
}

export class InstallMcpServerDto {
  @ApiProperty({ description: 'Identifier of the MCP server' })
  name!: string;

  @ApiProperty({ description: 'Server configuration object' })
  config!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'GitHub mirror URL to accelerate git/github sources' })
  mirrorUrl?: string;
}

export class ToggleMcpServerDto {
  @ApiProperty({ description: 'Identifier of the MCP server' })
  name!: string;

  @ApiProperty({ description: 'Whether the server is enabled' })
  enabled!: boolean;
}

export class McpStoreItemDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty()
  type!: 'stdio' | 'http';

  @ApiProperty()
  config!: Record<string, unknown>;

  @ApiProperty()
  installed!: boolean;

  @ApiProperty()
  enabled!: boolean;

  @ApiPropertyOptional()
  hasGithubSource?: boolean;
}

export class McpStoreResponseDto {
  @ApiProperty({ type: [McpStoreItemDto] })
  items!: McpStoreItemDto[];

  @ApiProperty()
  mirrors!: Array<{ id: string; name: string; url: string }>;
}
