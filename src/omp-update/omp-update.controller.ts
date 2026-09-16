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
  OmpUpgradeRequestDto,
  OmpUpgradeResponseDto,
  OmpVersionResponseDto,
} from './dto/omp-update.dto';
import { OmpUpdateService } from './omp-update.service';

@ApiTags('omp-update')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('omp/update')
export class OmpUpdateController {
  constructor(private readonly ompUpdateService: OmpUpdateService) {}

  /**
   * Checks for available OMP version updates.
   */
  @Get('check')
  @ApiOperation({ summary: 'Check for OMP binary updates' })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  @ApiOkResponse({ type: OmpVersionResponseDto })
  checkUpdate(@Query('refresh') refresh?: string): Promise<OmpVersionResponseDto> {
    return this.ompUpdateService.checkUpdate(refresh === 'true' || refresh === '1');
  }

  /**
   * Triggers `omp update` command to upgrade the OMP CLI.
   */
  @Post('upgrade')
  @ApiOperation({ summary: 'Execute omp update command to upgrade CLI' })
  @ApiOkResponse({ type: OmpUpgradeResponseDto })
  upgrade(@Body() body: OmpUpgradeRequestDto): Promise<OmpUpgradeResponseDto> {
    return this.ompUpdateService.upgrade(body);
  }
}
