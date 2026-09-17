import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebuiVersionResponseDto {
  @ApiProperty({ description: 'Currently installed WebUI version' })
  currentVersion!: string;

  @ApiProperty({ description: 'Current short Git commit hash' })
  currentCommit!: string;

  @ApiProperty({ description: 'Latest remote Git commit hash on main branch' })
  latestCommit!: string;

  @ApiPropertyOptional({ description: 'Latest released version tag if available' })
  latestVersion?: string;

  @ApiProperty({ description: 'Whether a newer version or commit is available' })
  hasUpdate!: boolean;

  @ApiPropertyOptional({ description: 'Latest commit message summary' })
  commitMessage?: string;

  @ApiPropertyOptional({ description: 'Latest commit author' })
  commitAuthor?: string;

  @ApiPropertyOptional({ description: 'Latest commit timestamp or ISO date' })
  commitDate?: string;

  @ApiPropertyOptional({ description: 'Number of commits local branch is behind remote' })
  commitsBehind?: number;

  @ApiProperty({ description: 'GitHub repository URL' })
  repoUrl!: string;

  @ApiProperty({ description: 'Recommended git pull & rebuild command' })
  updateCommand!: string;

  @ApiProperty({ description: 'Recommended Docker Compose pull command' })
  dockerCommand!: string;

  @ApiProperty({ description: 'Timestamp when update check was performed in ms' })
  checkedAt!: number;

  @ApiPropertyOptional({ description: 'Fastest detected mirror ID' })
  fastestMirrorId?: string;

  @ApiPropertyOptional({ description: 'Fastest detected mirror URL' })
  fastestMirrorUrl?: string;
}

export class WebuiUpgradeRequestDto {
  @ApiPropertyOptional({ description: 'Selected GitHub mirror or proxy URL to accelerate git pull' })
  mirrorUrl?: string;

  @ApiPropertyOptional({ description: 'Whether to automatically run pnpm build after pulling (default true)', default: true })
  rebuild?: boolean;
}

export class WebuiUpgradeResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  output!: string;
}
