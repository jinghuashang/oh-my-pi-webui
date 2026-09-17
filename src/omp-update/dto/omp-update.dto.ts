import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OmpVersionResponseDto {
  @ApiProperty({ description: 'Currently installed omp version' })
  currentVersion!: string;

  @ApiProperty({ description: 'Latest released omp version' })
  latestVersion!: string;

  @ApiProperty({ description: 'Whether an update is available' })
  hasUpdate!: boolean;

  @ApiProperty({ description: 'Recommended command to perform update' })
  updateCommand!: string;

  @ApiPropertyOptional({ description: 'Release notes or changelog summary' })
  releaseNotes?: string;

  @ApiPropertyOptional({ description: 'GitHub release page URL' })
  releaseUrl?: string;

  @ApiProperty({ description: 'Timestamp when update check was performed in ms' })
  checkedAt!: number;
}

export class UpdateMirrorDto {
  @ApiProperty({ description: 'Mirror unique identifier' })
  id!: string;

  @ApiProperty({ description: 'Mirror display label' })
  name!: string;

  @ApiProperty({ description: 'Mirror base URL or proxy address' })
  url!: string;

  @ApiPropertyOptional({ description: 'Latency in milliseconds (-1 if unreachable)' })
  latencyMs?: number;

  @ApiPropertyOptional({ description: 'Whether this mirror is currently the fastest available' })
  isFastest?: boolean;

  @ApiPropertyOptional({ description: 'Whether mirror responded successfully' })
  available?: boolean;

  @ApiPropertyOptional({ description: 'Whether this is a user-added custom mirror' })
  isCustom?: boolean;
}

export class AddCustomMirrorDto {
  @ApiProperty({ description: 'Mirror display label' })
  name!: string;

  @ApiProperty({ description: 'Mirror base URL or proxy address' })
  url!: string;
}

export class OmpMirrorsResponseDto {
  @ApiProperty({ type: [UpdateMirrorDto] })
  mirrors!: UpdateMirrorDto[];

  @ApiPropertyOptional({ description: 'ID of the fastest detected mirror' })
  fastestId?: string;

  @ApiPropertyOptional({ description: 'URL of the fastest detected mirror' })
  fastestUrl?: string;
}

export class OmpUpgradeRequestDto {
  @ApiPropertyOptional({ description: 'Switch to canary channel' })
  canary?: boolean;

  @ApiPropertyOptional({ description: 'Force update even if current' })
  force?: boolean;

  @ApiPropertyOptional({ description: 'Selected GitHub mirror or proxy URL to accelerate update' })
  mirrorUrl?: string;
}
export class OmpUpgradeResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  output!: string;
}

export class OmpUpdateProgressDto {
  @ApiProperty({ enum: ['idle', 'downloading', 'installing', 'completed', 'failed'] })
  status!: 'idle' | 'downloading' | 'installing' | 'completed' | 'failed';

  @ApiProperty()
  stage!: string;

  @ApiProperty({ description: 'Download progress percentage (0 - 100)' })
  percent!: number;

  @ApiPropertyOptional({ description: 'Current download speed formatted, e.g. 2.5 MB/s' })
  speedFormatted?: string;

  @ApiProperty({ description: 'Downloaded bytes so far' })
  downloadedBytes!: number;

  @ApiProperty({ description: 'Total expected bytes' })
  totalBytes!: number;

  @ApiPropertyOptional({ description: 'Formatted downloaded bytes, e.g. 45.2 MB' })
  downloadedFormatted?: string;

  @ApiPropertyOptional({ description: 'Formatted total bytes, e.g. 240.2 MB' })
  totalFormatted?: string;

  @ApiPropertyOptional()
  error?: string;
}
