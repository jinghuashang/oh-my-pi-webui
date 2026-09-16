import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';

@Module({
  imports: [OmpEngineModule],
  controllers: [PluginsController],
  providers: [PluginsService],
  exports: [PluginsService],
})
export class PluginsModule {}
