import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/api-responses.dto';
import {
  AddCustomMirrorDto,
  OmpMirrorsResponseDto,
  OmpUpdateProgressDto,
  OmpUpgradeRequestDto,
  OmpUpgradeResponseDto,
  OmpVersionResponseDto,
  UpdateMirrorDto,
} from './dto/omp-update.dto';
import { OmpUpdateService } from './omp-update.service';

@ApiTags('omp-update')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('omp/update')
export class OmpUpdateController {
  constructor(private readonly ompUpdateService: OmpUpdateService) {}
  /**
   * Gets list of update mirrors with ping latency test and fastest mirror identification.
   */
  @Get('mirrors')
  @ApiOperation({ summary: 'Get list of OMP update mirrors with speed test results' })
  @ApiQuery({ name: 'ping', required: false, type: Boolean })
  @ApiOkResponse({ type: OmpMirrorsResponseDto })
  getMirrors(@Query('ping') ping?: string): Promise<OmpMirrorsResponseDto> {
    return this.ompUpdateService.getMirrors(ping === 'true' || ping === '1' || ping === undefined);
  }

  /**
   * Adds a user-defined custom update mirror or proxy.
   */
  @Post('mirrors/custom')
  @ApiOperation({ summary: 'Add a custom OMP update mirror or proxy' })
  @ApiCreatedResponse({ type: UpdateMirrorDto })
  addCustomMirror(@Body() body: AddCustomMirrorDto): UpdateMirrorDto {
    return this.ompUpdateService.addCustomMirror(body);
  }

  /**
   * Deletes a user-defined custom update mirror.
   */
  @Delete('mirrors/custom/:id')
  @ApiOperation({ summary: 'Delete a custom OMP update mirror' })
  @ApiOkResponse({ type: Object })
  deleteCustomMirror(@Param('id') id: string): { success: boolean } {
    return { success: this.ompUpdateService.deleteCustomMirror(id) };
  }

  /**
   * Checks for available OMP version updates.
   */
  @Get('check')
  @ApiOperation({ summary: 'Check for OMP binary updates' })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  @ApiQuery({ name: 'mirrorUrl', required: false, type: String })
  @ApiOkResponse({ type: OmpVersionResponseDto })
  checkUpdate(
    @Query('refresh') refresh?: string,
    @Query('mirrorUrl') mirrorUrl?: string,
  ): Promise<OmpVersionResponseDto> {
    return this.ompUpdateService.checkUpdate(refresh === 'true' || refresh === '1', mirrorUrl);
  }

  /**
   * Gets current real-time download and install progress for OMP update.
   */
  @Get('progress')
  @ApiOperation({ summary: 'Get real-time OMP update download progress and speed' })
  @ApiOkResponse({ type: OmpUpdateProgressDto })
  getProgress(): OmpUpdateProgressDto {
    return this.ompUpdateService.getProgress();
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
