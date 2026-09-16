import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [OmpEngineModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
