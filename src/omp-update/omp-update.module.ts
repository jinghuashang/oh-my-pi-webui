import { Module } from '@nestjs/common';
import { OmpUpdateController } from './omp-update.controller';
import { OmpUpdateService } from './omp-update.service';

@Module({
  controllers: [OmpUpdateController],
  providers: [OmpUpdateService],
  exports: [OmpUpdateService],
})
export class OmpUpdateModule {}
