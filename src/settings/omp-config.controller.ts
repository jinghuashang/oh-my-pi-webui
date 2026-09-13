import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/api-responses.dto';
import { OmpConfigData, OmpConfigService } from './omp-config.service';

export class UpdateOmpSettingDto {
  key!: string;
  value!: unknown;
}

export class BatchUpdateOmpSettingsDto {
  updates!: Array<{ key: string; value: unknown }>;
}

@ApiTags('omp-config')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('omp/config')
export class OmpConfigController {
  constructor(private readonly ompConfigService: OmpConfigService) {}

  /**
   * Returns full OMP configuration categorized across the 11 official tabs:
   * Appearance, Model, Interaction, Context, Memory, Files, Shell, Tools, Tasks, Providers, Plugins.
   */
  @Get()
  @ApiOperation({ summary: 'Get full OMP categorized configuration' })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  @ApiOkResponse({ description: 'Categorized OMP configuration items' })
  async getConfig(@Query('refresh') refresh?: string): Promise<OmpConfigData> {
    return this.ompConfigService.getConfig(refresh === 'true' || refresh === '1');
  }

  /**
   * Updates one or multiple OMP configuration settings via `omp config set`.
   */
  @Patch()
  @ApiOperation({ summary: 'Update one or more OMP configuration settings' })
  async updateConfig(
    @Body() body: UpdateOmpSettingDto | BatchUpdateOmpSettingsDto,
  ): Promise<{ success: boolean; message?: string; updated?: number }> {
    if ('updates' in body && Array.isArray(body.updates)) {
      return this.ompConfigService.batchSetSettings(body.updates);
    }
    if ('key' in body && typeof body.key === 'string') {
      return this.ompConfigService.setSetting(body.key, body.value);
    }
    return { success: false, message: 'Invalid payload' };
  }
}
