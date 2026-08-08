import type { AssetCleanupDeleteStatus } from "@/app/app-providers";
import type { DriveProjectUnusedAssetDeletePreflightResult } from "@/lib/google-drive";

export function canPrepareUnusedAssetDeletion(input: {
  preflightResult: DriveProjectUnusedAssetDeletePreflightResult | null;
  selectedAssetFileIds: string[];
  blockedReason: string | null;
  isDeleteInFlight: boolean;
  isPreflightInFlight: boolean;
  isPreviewInFlight: boolean;
}) {
  const preflight = input.preflightResult;
  return Boolean(
    preflight &&
      preflight.eligibleAssetCount > 0 &&
      preflight.blockedAssetCount === 0 &&
      sameStringSet(
        input.selectedAssetFileIds,
        preflight.selectedAssetFileIds,
      ) &&
      input.blockedReason === null &&
      !input.isDeleteInFlight &&
      !input.isPreflightInFlight &&
      !input.isPreviewInFlight,
  );
}

export function getAssetCleanupDeleteLiveRole(
  status: AssetCleanupDeleteStatus,
): "alert" | "status" | undefined {
  if (
    status === "partialFailure" ||
    status === "blocked" ||
    status === "error"
  ) {
    return "alert";
  }

  if (
    status === "deleting" ||
    status === "completed" ||
    status === "cancelled"
  ) {
    return "status";
  }

  return undefined;
}

function sameStringSet(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size &&
    Array.from(leftSet).every((value) => rightSet.has(value))
  );
}
