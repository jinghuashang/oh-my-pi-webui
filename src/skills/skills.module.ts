import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  imports: [OmpEngineModule],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
