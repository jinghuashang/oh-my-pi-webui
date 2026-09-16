/**
 * REST controller for aggregated OMP engine status and config writes.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-codes';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/api-responses.dto';
import { OmpService } from './omp-engine.service';
import {
  OmpStatusService,
  type CodexStatusResponse,
} from './omp-status.service';
import {
  SANDBOX_MODE_VALUES,
  UpdateApprovalPolicyDto,
  UpdateSandboxModeDto,
} from './dto/omp-config.dto';
import { APPROVAL_POLICY_VALUES } from './dto/v2/openapi.schema';
import {
  CodexAccountStatusDto,
  CodexAppServerStatusDto,
  CodexConfigSummaryDto,
  CodexConfigStatusDto,
  CodexInitializeStatusDto,
  CodexModelsStatusDto,
  CodexProviderStatusDto,
  CodexRuntimeStatusDto,
  CodexStatusErrorDto,
  CodexStatusResponseDto,
} from './dto/omp-status.dto';

@ApiTags('codex')
@ApiBearerAuth()
@ApiExtraModels(
  CodexStatusErrorDto,
  CodexAppServerStatusDto,
  CodexConfigSummaryDto,
  CodexInitializeStatusDto,
  CodexAccountStatusDto,
  CodexConfigStatusDto,
  CodexProviderStatusDto,
  CodexModelsStatusDto,
  CodexRuntimeStatusDto,
)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiTags('omp')
@Controller('omp')
export class OmpStatusController {
  constructor(
    private readonly codexStatusService: OmpStatusService,
    private readonly ompService: OmpService,
  ) {}

  /** Returns aggregated OMP engine readiness and runtime status. */
  @Get('status')
  @ApiOperation({ summary: 'Get aggregated Codex runtime status' })
  @ApiOkResponse({ type: CodexStatusResponseDto })
  async getStatus(): Promise<CodexStatusResponse> {
    return this.codexStatusService.getStatus();
  }

  /** Updates the global approval default for new threads; loaded policies are unchanged. */
  @Post('approval-policy')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update approval policy default for new threads' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNoContentResponse()
  async updateApprovalPolicy(
    @Body() body: UpdateApprovalPolicyDto,
  ): Promise<void> {
    const value =
      typeof body?.approvalPolicy === 'string' ? body.approvalPolicy : null;
    if (
      !value ||
      !(APPROVAL_POLICY_VALUES as readonly string[]).includes(value)
    ) {
      throw BusinessException.badRequest(
        ErrorCode.threads.invalidApprovalPolicy,
        'Invalid approval policy',
      );
    }
    await this.ompService.request('config/batchWrite', {
      edits: [
        {
          keyPath: 'approval_policy',
          value,
          mergeStrategy: 'replace',
        },
      ],
      reloadUserConfig: true,
    });
    this.codexStatusService.invalidateCache();
  }

  /** Updates the global sandbox default for new threads; loaded policies are unchanged. */
  @Post('sandbox-mode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update sandbox mode default for new threads' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNoContentResponse()
  async updateSandboxMode(@Body() body: UpdateSandboxModeDto): Promise<void> {
    const value =
      typeof body?.sandboxMode === 'string' ? body.sandboxMode : null;
    if (!value || !(SANDBOX_MODE_VALUES as readonly string[]).includes(value)) {
      throw BusinessException.badRequest(
        ErrorCode.threads.invalidSandboxMode,
        'Invalid sandbox mode',
      );
    }
    await this.ompService.request('config/batchWrite', {
      edits: [
        {
          keyPath: 'sandbox_mode',
          value,
          mergeStrategy: 'replace',
        },
      ],
      reloadUserConfig: true,
    });
    this.codexStatusService.invalidateCache();
  }
}
