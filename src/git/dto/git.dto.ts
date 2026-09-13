import { ApiProperty } from '@nestjs/swagger';

/** One changed path with its staged plus unstaged line counts. */
export class GitChangeDto {
  @ApiProperty()
  path!: string;

  @ApiProperty({ description: 'Porcelain status code, e.g. `M`, `??`.' })
  status!: string;

  @ApiProperty()
  additions!: number;

  @ApiProperty()
  deletions!: number;
}

/** Repository state for the workspace directory a conversation runs in. */
export class GitStatusResponseDto {
  @ApiProperty({ description: 'False when the directory is not a git work tree.' })
  isRepo!: boolean;

  @ApiProperty({ nullable: true, type: String })
  branch!: string | null;

  @ApiProperty()
  detached!: boolean;

  @ApiProperty({ nullable: true, type: String })
  upstream!: string | null;

  @ApiProperty()
  ahead!: number;

  @ApiProperty()
  behind!: number;

  @ApiProperty()
  additions!: number;

  @ApiProperty()
  deletions!: number;

  @ApiProperty({ type: () => [GitChangeDto] })
  changes!: GitChangeDto[];

  @ApiProperty({ type: [String] })
  branches!: string[];
}

/** Branch switch request. */
export class GitCheckoutRequestDto {
  @ApiProperty()
  cwd!: string;

  @ApiProperty()
  branch!: string;
}

/** Commit request; stages every change before committing. */
export class GitCommitRequestDto {
  @ApiProperty()
  cwd!: string;

  @ApiProperty()
  message!: string;
}

/** Result of a successful commit. */
export class GitCommitResponseDto {
  @ApiProperty()
  sha!: string;

  @ApiProperty()
  summary!: string;
}
