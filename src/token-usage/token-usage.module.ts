/** Token usage persistence module. */
import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { ConversationBranchesModule } from '../conversation-branches/conversation-branches.module';
import { DatabaseModule } from '../database/database.module';
import { TokenUsageController } from './token-usage.controller';
import { TokenUsageService } from './token-usage.service';

@Module({
  imports: [OmpEngineModule, ConversationBranchesModule, DatabaseModule],
  controllers: [TokenUsageController],
  providers: [TokenUsageService],
  exports: [TokenUsageService],
})
export class TokenUsageModule {}
