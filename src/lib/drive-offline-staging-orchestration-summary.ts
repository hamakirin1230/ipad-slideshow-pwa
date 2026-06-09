// src/lib/drive-offline-staging-orchestration-summary.ts

import type { DriveOfflineStagingPromotionOrchestrationResult } from "@/lib/drive-offline-staging-orchestration";

const DEFAULT_DIAGNOSTIC_LIMIT = 8;
const DEFAULT_DIAGNOSTIC_MAX_LENGTH = 160;

export type DriveOfflineStagingPromotionFailureSummary =
  | {
      reason: "validation-failed";
      validationReason: string;
      validationClassification: string;
      syncStateUpdated: true;
    }
  | {
      reason: "promotion-or-cleanup-failed";
      syncStateUpdated: true;
    };

type DriveOfflineStagingPromotionFailureInput =
  | {
      reason: "validation-failed";
      validationReason: string;
      validationClassification: string;
    }
  | {
      reason: "promotion-or-cleanup-failed";
    };

export type DriveOfflineStagingOrchestrationSummary =
  | {
      ok: true;
      status: "ready";
      syncRunId: string;
      projectId: string;
      slideCount: number;
      assetCount: number;
      stagingWrite: {
        cleanup: {
          deletedProjects: number;
          deletedAssets: number;
          deletedAssetBlobs: number;
        };
        writtenProjects: number;
        writtenAssets: number;
        writtenAssetBlobs: number;
      };
      promotion: {
        promotedProjects: number;
        promotedAssets: number;
        promotedAssetBlobs: number;
        deletedObsoleteAssets: number;
        deletedObsoleteAssetBlobs: number;
      };
      cleanup: {
        deletedProjects: number;
        deletedAssets: number;
        deletedAssetBlobs: number;
      };
    }
  | {
      ok: false;
      status: "stale";
      syncRunId: string;
    }
  | {
      ok: false;
      status: "driveFetchOrStagingWriteFailed";
      syncRunId: string;
      diagnostics: string[];
      omittedDiagnosticCount: number;
      syncStateUpdated: true;
    }
  | {
      ok: false;
      status: "promotionFailed";
      syncRunId: string;
      promotionFailure: DriveOfflineStagingPromotionFailureSummary;
    };

export function summarizeDriveOfflineStagingPromotionOrchestrationResult(
  result: DriveOfflineStagingPromotionOrchestrationResult,
): DriveOfflineStagingOrchestrationSummary {
  if (result.ok) {
    return {
      ok: true,
      status: "ready",
      syncRunId: result.syncRunId,
      projectId: result.snapshot.project.projectId,
      slideCount: result.snapshot.details.slideCount,
      assetCount: result.snapshot.details.assetCount,
      stagingWrite: {
        cleanup: {
          deletedProjects: result.stagingWrite.cleanup.deletedProjects,
          deletedAssets: result.stagingWrite.cleanup.deletedAssets,
          deletedAssetBlobs: result.stagingWrite.cleanup.deletedAssetBlobs,
        },
        writtenProjects: result.stagingWrite.writtenProjects,
        writtenAssets: result.stagingWrite.writtenAssets,
        writtenAssetBlobs: result.stagingWrite.writtenAssetBlobs,
      },
      promotion: {
        promotedProjects: result.promotion.promotion.promotedProjects,
        promotedAssets: result.promotion.promotion.promotedAssets,
        promotedAssetBlobs: result.promotion.promotion.promotedAssetBlobs,
        deletedObsoleteAssets:
          result.promotion.promotion.deletedObsoleteAssets,
        deletedObsoleteAssetBlobs:
          result.promotion.promotion.deletedObsoleteAssetBlobs,
      },
      cleanup: {
        deletedProjects: result.promotion.cleanup.deletedProjects,
        deletedAssets: result.promotion.cleanup.deletedAssets,
        deletedAssetBlobs: result.promotion.cleanup.deletedAssetBlobs,
      },
    };
  }

  switch (result.reason) {
    case "stale-sync-run":
      return {
        ok: false,
        status: "stale",
        syncRunId: result.syncRunId,
      };

    case "drive-fetch-or-staging-write-failed": {
      const diagnostics = sanitizeDiagnostics(result.diagnostics);

      return {
        ok: false,
        status: "driveFetchOrStagingWriteFailed",
        syncRunId: result.syncRunId,
        diagnostics: diagnostics.items,
        omittedDiagnosticCount: diagnostics.omittedCount,
        syncStateUpdated: true,
      };
    }

    case "promotion-failed":
      return {
        ok: false,
        status: "promotionFailed",
        syncRunId: result.syncRunId,
        promotionFailure: summarizePromotionFailure(result.promotion),
      };

    default:
      return assertNever(result);
  }
}

function summarizePromotionFailure(
  promotion: DriveOfflineStagingPromotionFailureInput,
): DriveOfflineStagingPromotionFailureSummary {
  switch (promotion.reason) {
    case "validation-failed":
      return {
        reason: "validation-failed",
        validationReason: promotion.validationReason,
        validationClassification: promotion.validationClassification,
        syncStateUpdated: true,
      };

    case "promotion-or-cleanup-failed":
      return {
        reason: "promotion-or-cleanup-failed",
        syncStateUpdated: true,
      };

    default:
      return assertNever(promotion);
  }
}

function sanitizeDiagnostics(
  diagnostics: string[],
  options?: {
    limit?: number;
    maxLength?: number;
  },
): {
  items: string[];
  omittedCount: number;
} {
  const limit = options?.limit ?? DEFAULT_DIAGNOSTIC_LIMIT;
  const maxLength = options?.maxLength ?? DEFAULT_DIAGNOSTIC_MAX_LENGTH;

  const items = diagnostics
    .slice(0, limit)
    .map((diagnostic) => truncateDiagnostic(diagnostic, maxLength));

  return {
    items,
    omittedCount: Math.max(0, diagnostics.length - items.length),
  };
}

function truncateDiagnostic(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected result variant: ${JSON.stringify(value)}`);
}
