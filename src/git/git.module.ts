/** Repository status and actions for workspace directories. */
import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { GitController } from './git.controller';
import { GitService } from './git.service';

@Module({
  imports: [FilesModule],
  controllers: [GitController],
  providers: [GitService],
  exports: [GitService],
})
export class GitModule {}
