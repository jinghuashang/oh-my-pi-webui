/**
 * Thin facade over OmpProcessManager for business modules.
 * Provides typed request helpers that map to app-server JSON-RPC methods.
 */
import { Injectable } from '@nestjs/common';
import { OmpProcessManager } from './omp-process-manager.service';
import type { OmpJsonRpcClient } from './omp-jsonrpc-client';
import { OmpUnavailableError } from './omp-errors';

@Injectable()
export class OmpService {
  constructor(private readonly processManager: OmpProcessManager) {}

  /**
   * Returns the active JSON-RPC client.
   *
   * @throws Error if the app-server is not connected
   */
  getClient(): OmpJsonRpcClient {
    const client = this.processManager.getClient();
    if (!client) {
      throw new OmpUnavailableError();
    }
    return client;
  }

  /**
   * Sends a typed request to the app-server and returns the result.
   *
   * @param method - JSON-RPC method name
   * @param params - Method parameters
   * @returns The response result
   */
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    return this.getClient().request<T>(method, params);
  }
}
