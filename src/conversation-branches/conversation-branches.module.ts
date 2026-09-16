import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { DatabaseModule } from '../database/database.module';
import { ConversationBranchAdoptionService } from './conversation-branch-adoption.service';
import { ConversationBranchMutationsService } from './conversation-branch-mutations.service';
import { ConversationBranchesService } from './conversation-branches.service';

@Module({
  imports: [OmpEngineModule, DatabaseModule],
  providers: [
    ConversationBranchesService,
    ConversationBranchMutationsService,
    ConversationBranchAdoptionService,
  ],
  exports: [
    ConversationBranchesService,
    ConversationBranchMutationsService,
    ConversationBranchAdoptionService,
  ],
})
export class ConversationBranchesModule {}
