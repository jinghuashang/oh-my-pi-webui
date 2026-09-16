import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';

@Module({
  imports: [OmpEngineModule],
  controllers: [AppsController],
  providers: [AppsService],
  exports: [AppsService],
})
export class AppsModule {}
