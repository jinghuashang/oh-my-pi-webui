/** Apps facade over OMP engine JSON-RPC methods. */
import { Injectable } from '@nestjs/common';
import { OmpService } from '../omp/omp-engine.service';
import type { v2 } from '../omp/omp-schema';

@Injectable()
export class AppsService {
  constructor(private readonly ompService: OmpService) {}

  /** Lists experimental apps/connectors from OMP engine. */
  listApps(params: v2.AppsListParams = {}): Promise<v2.AppsListResponse> {
    return this.ompService.request<v2.AppsListResponse>('app/list', params);
  }

  /** Reads fresh metadata for one or more apps/connectors. */
  readApps(params: v2.AppsReadParams): Promise<v2.AppsReadResponse> {
    return this.ompService.request<v2.AppsReadResponse>('app/read', params);
  }
}
