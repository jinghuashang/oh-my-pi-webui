import { Module } from '@nestjs/common';
import { OmpEngineModule } from '../omp/omp-engine.module';
import { McpServersController } from './mcp-servers.controller';
import { McpServersService } from './mcp-servers.service';

@Module({
  imports: [OmpEngineModule],
  controllers: [McpServersController],
  providers: [McpServersService],
  exports: [McpServersService],
})
export class McpServersModule {}
