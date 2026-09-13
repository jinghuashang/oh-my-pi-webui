/** Runtime settings module backed by SQLite. */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { OmpConfigController } from './omp-config.controller';
import { OmpConfigService } from './omp-config.service';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [SettingsController, OmpConfigController],
  providers: [SettingsService, OmpConfigService],
  exports: [SettingsService, OmpConfigService],
})
export class SettingsModule {}
