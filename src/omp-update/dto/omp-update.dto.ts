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

export class OmpUpgradeRequestDto {
  @ApiPropertyOptional({ description: 'Switch to canary channel' })
  canary?: boolean;

  @ApiPropertyOptional({ description: 'Force update even if current' })
  force?: boolean;
}

export class OmpUpgradeResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  output!: string;
}
