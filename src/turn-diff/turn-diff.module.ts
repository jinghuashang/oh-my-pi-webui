/** Turn diff persistence module. */
import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { ConversationBranchesModule } from '../conversation-branches/conversation-branches.module';
import { DatabaseModule } from '../database/database.module';
import { TurnDiffController } from './turn-diff.controller';
import { TurnDiffService } from './turn-diff.service';

@Module({
  imports: [OmpEngineModule, ConversationBranchesModule, DatabaseModule],
  controllers: [TurnDiffController],
  providers: [TurnDiffService],
  exports: [TurnDiffService],
})
export class TurnDiffModule {}
