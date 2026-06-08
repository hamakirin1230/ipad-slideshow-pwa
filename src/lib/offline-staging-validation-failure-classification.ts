// src/lib/offline-staging-validation-failure-classification.ts

import type { OfflineSyncStatus } from "@/lib/offline-schema";
import type { OfflineStagingValidationFailureReason } from "@/lib/offline-staging-validation";

export type OfflineStagingValidationFailureClassification = Extract<
  OfflineSyncStatus,
  "failed" | "corrupt"
>;

export function classifyOfflineStagingValidationFailure(
  reason: OfflineStagingValidationFailureReason,
): OfflineStagingValidationFailureClassification {
  switch (reason) {
    case "missing-project":
    case "multiple-projects":
    case "schema-version-mismatch":
    case "duplicate-asset":
    case "duplicate-asset-blob":
    case "missing-asset":
    case "unexpected-asset":
    case "missing-asset-blob":
    case "unexpected-asset-blob":
      return "corrupt";
  }
}
