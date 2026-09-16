import { Module } from '@nestjs/common';
import { OmpEngineConfigController } from './omp-engine-config.controller';
import { OmpFeedbackController } from './omp-feedback.controller';
import { OmpProcessManager } from './omp-process-manager.service';
import { OmpStatusController } from './omp-status.controller';
import { OmpStatusService } from './omp-status.service';
import { OmpService } from './omp-engine.service';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogPathsService } from './catalog/catalog-paths.service';
import { CatalogStorageService } from './catalog/catalog-storage.service';
import { CatalogNativeService } from './catalog/catalog-native.service';
import {
  CatalogAdmissionService,
  CatalogMutationInterceptor,
} from './catalog/catalog-admission.service';
import { CatalogActivityService } from './catalog/catalog-activity.service';
import { CatalogService } from './catalog/catalog.service';

@Module({
  controllers: [
    OmpStatusController,
    OmpEngineConfigController,
    OmpFeedbackController,
    CatalogController,
  ],
  providers: [
    OmpProcessManager,
    OmpService,
    OmpStatusService,
    CatalogPathsService,
    CatalogStorageService,
    CatalogNativeService,
    CatalogAdmissionService,
    CatalogActivityService,
    CatalogService,
    { provide: APP_INTERCEPTOR, useClass: CatalogMutationInterceptor },
  ],
  exports: [
    OmpProcessManager,
    OmpService,
    OmpStatusService,
    CatalogAdmissionService,
  ],
})
export class OmpEngineModule {}
