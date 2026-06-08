// src/lib/offline-staging-validation-integration.ts

import type { OfflineStagingProject } from "@/lib/offline-schema";
import {
  getOfflineStagingRecordsBySyncRunId,
  getOfflineStagingRecordsBySyncRunIdInTransaction,
  type OfflineStagingReadStores,
  type OfflineStagingRecordsForSyncRun,
} from "@/lib/offline-staging-read";
import {
  validateOfflineStagingRecordsForSyncRun,
  type OfflineStagingValidationFailureReason,
} from "@/lib/offline-staging-validation";

export type OfflineStagingValidationIntegrationResult =
  | {
      ok: true;
      records: OfflineStagingRecordsForSyncRun;
      project: OfflineStagingProject;
      validation: { ok: true };
    }
  | {
      ok: false;
      records: OfflineStagingRecordsForSyncRun;
      validation: {
        ok: false;
        reason: OfflineStagingValidationFailureReason;
      };
    };

function assertValidSyncRunId(syncRunId: string): void {
  if (syncRunId.length === 0) {
    throw new Error("syncRunId is required.");
  }

  if (syncRunId !== syncRunId.trim()) {
    throw new Error(
      "syncRunId must not include leading or trailing whitespace.",
    );
  }
}

function buildOfflineStagingValidationIntegrationResult(
  records: OfflineStagingRecordsForSyncRun,
): OfflineStagingValidationIntegrationResult {
  const validation = validateOfflineStagingRecordsForSyncRun(records);

  if (!validation.ok) {
    return {
      ok: false,
      records,
      validation,
    };
  }

  const project = records.projects[0];

  if (!project) {
    throw new Error("Validated staging project is missing.");
  }

  return {
    ok: true,
    records,
    project,
    validation,
  };
}

export async function validateOfflineStagingForSyncRunInTransaction(
  stores: OfflineStagingReadStores,
  syncRunId: string,
): Promise<OfflineStagingValidationIntegrationResult> {
  assertValidSyncRunId(syncRunId);

  const records = await getOfflineStagingRecordsBySyncRunIdInTransaction(
    stores,
    syncRunId,
  );

  return buildOfflineStagingValidationIntegrationResult(records);
}

export async function validateOfflineStagingForSyncRun(
  syncRunId: string,
): Promise<OfflineStagingValidationIntegrationResult> {
  assertValidSyncRunId(syncRunId);

  const records = await getOfflineStagingRecordsBySyncRunId(syncRunId);

  return buildOfflineStagingValidationIntegrationResult(records);
}
