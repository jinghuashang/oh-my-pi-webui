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
  WebuiUpdateProgressDto,
  WebuiUpgradeRequestDto,
  WebuiUpgradeResponseDto,
  WebuiVersionResponseDto,
} from './dto/webui-update.dto';
import { OmpMirrorsResponseDto } from '../omp-update/dto/omp-update.dto';
import { WebuiUpdateService } from './webui-update.service';

@ApiTags('webui-update')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('webui/update')
export class WebuiUpdateController {
  constructor(private readonly webuiUpdateService: WebuiUpdateService) {}

  /**
   * Checks for available WebUI git commits or releases.
   */
  @Get('check')
  @ApiOperation({ summary: 'Check for WebUI git updates and remote commits' })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  @ApiQuery({ name: 'mirrorUrl', required: false, type: String })
  @ApiOkResponse({ type: WebuiVersionResponseDto })
  checkUpdate(
    @Query('refresh') refresh?: string,
    @Query('mirrorUrl') mirrorUrl?: string,
  ): Promise<WebuiVersionResponseDto> {
    return this.webuiUpdateService.checkUpdate(refresh === 'true' || refresh === '1', mirrorUrl);
  }

  /**
   * Gets list of GitHub mirrors with latency ping results.
   */
  @Get('mirrors')
  @ApiOperation({ summary: 'Get list of mirrors with speed test results for WebUI updates' })
  @ApiQuery({ name: 'ping', required: false, type: Boolean })
  @ApiOkResponse({ type: OmpMirrorsResponseDto })
  getMirrors(@Query('ping') ping?: string): Promise<OmpMirrorsResponseDto> {
    return this.webuiUpdateService.getMirrors(ping === 'true' || ping === '1' || ping === undefined);
  }

  /**
   * Gets current progress and output for WebUI update.
   */
  @Get('progress')
  @ApiOperation({ summary: 'Get real-time WebUI update pull/build progress' })
  @ApiOkResponse({ type: WebuiUpdateProgressDto })
  getProgress(): WebuiUpdateProgressDto {
    return this.webuiUpdateService.getProgress();
  }


  /**
   * Cancels and aborts an in-progress WebUI update task.
   */
  @Post('cancel')
  @ApiOperation({ summary: 'Cancel in-progress WebUI update pull or build' })
  @ApiOkResponse({ type: Object })
  cancelUpgrade(): { success: boolean; message: string } {
    return this.webuiUpdateService.cancelUpgrade();
  }
  /**
   * Pulls latest WebUI updates from remote git repository.
   */
  @Post('upgrade')
  @ApiOperation({ summary: 'Pull latest WebUI commits from GitHub and rebuild' })
  @ApiOkResponse({ type: WebuiUpgradeResponseDto })
  upgrade(@Body() body: WebuiUpgradeRequestDto): Promise<WebuiUpgradeResponseDto> {
    return this.webuiUpdateService.upgrade(body);
  }
}
