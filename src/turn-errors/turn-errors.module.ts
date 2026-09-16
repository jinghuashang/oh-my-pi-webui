/** Turn error persistence module. */
import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { ConversationBranchesModule } from '../conversation-branches/conversation-branches.module';
import { DatabaseModule } from '../database/database.module';
import { TurnErrorsController } from './turn-errors.controller';
import { TurnErrorsService } from './turn-errors.service';

@Module({
  imports: [OmpEngineModule, ConversationBranchesModule, DatabaseModule],
  controllers: [TurnErrorsController],
  providers: [TurnErrorsService],
  exports: [TurnErrorsService],
})
export class TurnErrorsModule {}
