/** Plugins facade over OMP engine JSON-RPC methods. */
import { Injectable } from '@nestjs/common';
import { OmpService } from '../omp/omp-engine.service';
import type { v2 } from '../omp/omp-schema';

@Injectable()
export class PluginsService {
  constructor(private readonly ompService: OmpService) {}

  /** Lists plugin marketplaces and installation state. */
  listPlugins(
    params: v2.PluginListParams = {},
  ): Promise<v2.PluginListResponse> {
    return this.ompService.request<v2.PluginListResponse>('plugin/list', params);
  }

  /** Reads detailed metadata for one plugin inside one marketplace. */
  readPlugin(params: v2.PluginReadParams): Promise<v2.PluginReadResponse> {
    return this.ompService.request<v2.PluginReadResponse>('plugin/read', params);
  }

  /** Installs a plugin through the app-server plugin lifecycle. */
  installPlugin(
    params: v2.PluginInstallParams,
  ): Promise<v2.PluginInstallResponse> {
    return this.ompService.request<v2.PluginInstallResponse>(
      'plugin/install',
      params,
    );
  }

  /** Reconciles installed plugin bundles against the latest plugin-service state. */
  reconcilePlugin(
    params: v2.PluginReconcileParams = {},
  ): Promise<v2.PluginReconcileResponse> {
    return this.ompService.request<v2.PluginReconcileResponse>(
      'plugin/reconcile',
      params,
    );
  }

  /** Uninstalls a user-installed plugin. */
  uninstallPlugin(
    params: v2.PluginUninstallParams,
  ): Promise<v2.PluginUninstallResponse> {
    return this.ompService.request<v2.PluginUninstallResponse>(
      'plugin/uninstall',
      params,
    );
  }
}
