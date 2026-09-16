/** Logs module exposing structured log browsing and diagnostics export. */
import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  imports: [OmpEngineModule],
  controllers: [LogsController],
  providers: [LogsService],
})
export class LogsModule {}
