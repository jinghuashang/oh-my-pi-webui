/** Skills facade over OMP engine JSON-RPC methods. */
import { Injectable } from '@nestjs/common';
import { OmpService } from '../omp/omp-engine.service';
import type { v2 } from '../omp/omp-schema';

@Injectable()
export class SkillsService {
  constructor(private readonly ompService: OmpService) {}

  /** Lists available skills for one or more working directories. */
  async listSkills(
    params: v2.SkillsListParams,
  ): Promise<v2.SkillsListResponse> {
    return this.ompService.request<v2.SkillsListResponse>('skills/list', params);
  }

  /** Writes skill enablement config by path or name. */
  async writeSkillConfig(
    params: v2.SkillsConfigWriteParams,
  ): Promise<v2.SkillsConfigWriteResponse> {
    return this.ompService.request<v2.SkillsConfigWriteResponse>(
      'skills/config/write',
      params,
    );
  }
}
