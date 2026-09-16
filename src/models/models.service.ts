/**
 * Handles model listing by delegating to OMP engine.
 */
import { Injectable } from '@nestjs/common';
import { OmpService } from '../omp/omp-engine.service';
import type { v2 } from '../omp/omp-schema';

@Injectable()
export class ModelsService {
  constructor(private readonly ompService: OmpService) {}

  /**
   * Lists available models from the OMP engine.
   *
   * @param params - Optional pagination and filter parameters
   * @returns Paginated model list
   */
  async listModels(
    params: v2.ModelListParams = {},
  ): Promise<v2.ModelListResponse> {
    return this.ompService.request<v2.ModelListResponse>('model/list', params);
  }
}
