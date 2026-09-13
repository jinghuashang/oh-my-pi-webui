/** REST controller for workspace repository state and actions. */
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/api-responses.dto';
import {
  GitCommitRequestDto,
  GitCommitResponseDto,
  GitCheckoutRequestDto,
  GitStatusResponseDto,
} from './dto/git.dto';
import { GitService } from './git.service';

@ApiTags('git')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('git')
export class GitController {
  constructor(private readonly gitService: GitService) {}

  /** Reports branch, upstream divergence and per-file change statistics. */
  @Get('status')
  @ApiOperation({ summary: 'Read repository status for a workspace directory' })
  @ApiQuery({ name: 'cwd', required: true })
  @ApiOkResponse({ type: GitStatusResponseDto })
  status(@Query('cwd') cwd: string): Promise<GitStatusResponseDto> {
    return this.gitService.status(cwd ?? '');
  }

  /** Switches the work tree to another local branch. */
  @Post('checkout')
  @ApiOperation({ summary: 'Check out a local branch' })
  @ApiOkResponse()
  async checkout(@Body() body: GitCheckoutRequestDto): Promise<{ ok: true }> {
    await this.gitService.checkout(body?.cwd ?? '', body?.branch ?? '');
    return { ok: true };
  }

  /** Stages and commits every change in the work tree. */
  @Post('commit')
  @ApiOperation({ summary: 'Commit all pending changes' })
  @ApiOkResponse({ type: GitCommitResponseDto })
  commit(@Body() body: GitCommitRequestDto): Promise<GitCommitResponseDto> {
    return this.gitService.commit(body?.cwd ?? '', body?.message ?? '');
  }
}
