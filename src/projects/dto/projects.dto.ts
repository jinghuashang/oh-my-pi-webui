import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: 'Project name (folder name under data/projects)' })
  name!: string;

  @ApiPropertyOptional({ description: 'Optional model to use for the initial session' })
  model?: string;

  @ApiPropertyOptional({ description: 'Optional initial prompt message to start the project session' })
  initialPrompt?: string;

  @ApiPropertyOptional({
    description: 'Whether to automatically initialize a git repository in the new project (default true)',
    default: true,
  })
  initGit?: boolean;
}

export class ProjectItemDto {
  @ApiProperty({ description: 'Project directory name' })
  name!: string;

  @ApiProperty({ description: 'Absolute path to project directory' })
  path!: string;

  @ApiProperty({ description: 'Last modified timestamp in epoch ms' })
  mtime!: number;

  @ApiProperty({ description: 'Whether the project directory is a Git repository' })
  isGit!: boolean;

  @ApiProperty({ description: 'Number of items directly inside the project directory' })
  fileCount!: number;
}

export class ProjectsListResponseDto {
  @ApiProperty({ description: 'Base directory path where projects are stored under data' })
  baseDir!: string;

  @ApiProperty({ type: [ProjectItemDto] })
  projects!: ProjectItemDto[];
}

export class CreateProjectResponseDto {
  @ApiProperty({ description: 'Created project name' })
  name!: string;

  @ApiProperty({ description: 'Absolute directory path of the project' })
  path!: string;

  @ApiProperty({ description: 'ID of the initial session thread created for this project' })
  threadId!: string;

  @ApiProperty({ description: 'Whether a git repository was initialized in the project' })
  isGit!: boolean;
}
