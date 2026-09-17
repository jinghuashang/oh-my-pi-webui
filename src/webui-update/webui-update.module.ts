import { Module } from '@nestjs/common';
import { OmpUpdateModule } from '../omp-update/omp-update.module';
import { WebuiUpdateController } from './webui-update.controller';
import { WebuiUpdateService } from './webui-update.service';

@Module({
  imports: [OmpUpdateModule],
  controllers: [WebuiUpdateController],
  providers: [WebuiUpdateService],
  exports: [WebuiUpdateService],
})
export class WebuiUpdateModule {}
