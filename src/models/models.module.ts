import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { ModelsController } from './models.controller';
import { ModelsService } from './models.service';

@Module({
  imports: [OmpEngineModule],
  controllers: [ModelsController],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
