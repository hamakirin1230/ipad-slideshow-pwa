import type {
  DriveProjectSummary,
  DriveProjectUnusedAssetDeletePreflightAsset,
  DriveProjectUnusedAssetDeletePreflightBlockedReason,
  DriveProjectUnusedAssetDeletePreflightResult,
} from "@/lib/google-drive";

const DRIVE_API_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export type DriveProjectUnusedAssetDeleteItemStatus =
  | "deleted"
  | "failed"
  | "notAttempted"
  | "blocked";

export type DriveProjectUnusedAssetDeleteFailureReason =
  | "notFound"
  | "stillReferenced"
  | "metadataChanged"
  | "notAppManagedAsset"
  | "wrongProject"
  | "wrongParent"
  | "deleteRejected"
  | "aborted"
  | "unexpectedFailure";

export type DriveProjectUnusedAssetDeleteItemResult = {
  assetName: string;
  assetFileIdPart: string;
  sizeBytes: number | null;
  status: DriveProjectUnusedAssetDeleteItemStatus;
  reason?: DriveProjectUnusedAssetDeleteFailureReason;
};

export type DriveProjectUnusedAssetDeleteResult = {
  status: "completed" | "partialFailure" | "blocked" | "failed";
  requestedCount: number;
  deletedCount: number;
  failedCount: number;
  blockedCount: number;
  notAttemptedCount: number;
  deletedTotalSizeBytes: number;
  items: DriveProjectUnusedAssetDeleteItemResult[];
};

export type DriveProjectUnusedAssetDeleteReview = {
  assetCount: number;
  totalSizeBytes: number;
  assets: Array<{
    assetName: string;
    assetFileIdPart: string;
    sizeBytes: number | null;
  }>;
};

export type DriveProjectUnusedAssetDeleteOwner = {
  workspaceId: string;
  projectId: string;
  manifestFileId: string;
  assetsFolderId: string;
};

type DriveProjectUnusedAssetDeletePlanAsset = {
  assetFileId: string;
  assetFileIdPart: string;
  assetName: string;
  sizeBytes: number | null;
  metadataFingerprint: string;
};

export type DriveProjectUnusedAssetDeletePlan = {
  owner: DriveProjectUnusedAssetDeleteOwner;
  assets: DriveProjectUnusedAssetDeletePlanAsset[];
};

export type PrepareDriveProjectUnusedAssetDeleteResult =
  | {
      ok: true;
      plan: DriveProjectUnusedAssetDeletePlan;
      review: DriveProjectUnusedAssetDeleteReview;
    }
  | {
      ok: false;
      reason:
        | "preflightMissing"
        | "selectionChanged"
        | "ownerChanged"
        | "eligibleAssetRequired"
        | "blockedAssetPresent";
    };

export class DriveProjectUnusedAssetDeleteRequestError extends Error {
  readonly reason: DriveProjectUnusedAssetDeleteFailureReason;

  constructor(reason: DriveProjectUnusedAssetDeleteFailureReason) {
    super("Drive project unused asset delete request failed.");
    this.name = "DriveProjectUnusedAssetDeleteRequestError";
    this.reason = reason;
  }
}

export function buildDriveProjectUnusedAssetDeleteOwner(input: {
  workspaceId: string;
  project: DriveProjectSummary;
}): DriveProjectUnusedAssetDeleteOwner {
  return {
    workspaceId: input.workspaceId,
    projectId: input.project.projectId,
    manifestFileId: input.project.manifestFileId,
    assetsFolderId: input.project.assetsFolderId,
  };
}

export function prepareDriveProjectUnusedAssetDeletion(input: {
  selectedAssetFileIds: string[];
  preflightResult: DriveProjectUnusedAssetDeletePreflightResult | null;
  preflightOwner: DriveProjectUnusedAssetDeleteOwner | null;
  currentOwner: DriveProjectUnusedAssetDeleteOwner;
}): PrepareDriveProjectUnusedAssetDeleteResult {
  const preflight = input.preflightResult;

  if (!preflight || !input.preflightOwner) {
    return { ok: false, reason: "preflightMissing" };
  }

  if (!driveProjectUnusedAssetDeleteOwnerMatches(
    input.preflightOwner,
    input.currentOwner,
  )) {
    return { ok: false, reason: "ownerChanged" };
  }

  if (!sameStringSet(
    input.selectedAssetFileIds,
    preflight.selectedAssetFileIds,
  )) {
    return { ok: false, reason: "selectionChanged" };
  }

  if (
    preflight.blockedAssetCount > 0 ||
    preflight.eligibleAssetCount !== preflight.allAssets.length ||
    preflight.eligibleAssets.some((asset) => asset.status !== "eligible")
  ) {
    return { ok: false, reason: "blockedAssetPresent" };
  }

  if (preflight.eligibleAssetCount === 0) {
    return { ok: false, reason: "eligibleAssetRequired" };
  }

  const assets = preflight.eligibleAssets.map((asset) => ({
    assetFileId: asset.assetFileId,
    assetFileIdPart: asset.assetFileIdPart,
    assetName: asset.assetName,
    sizeBytes: asset.sizeBytes,
    metadataFingerprint: buildMetadataFingerprint(asset),
  }));

  return {
    ok: true,
    plan: {
      owner: input.currentOwner,
      assets,
    },
    review: {
      assetCount: assets.length,
      totalSizeBytes: assets.reduce(
        (total, asset) => total + (asset.sizeBytes ?? 0),
        0,
      ),
      assets: assets.map(({ assetName, assetFileIdPart, sizeBytes }) => ({
        assetName,
        assetFileIdPart,
        sizeBytes,
      })),
    },
  };
}

export function driveProjectUnusedAssetDeleteOwnerMatches(
  expected: DriveProjectUnusedAssetDeleteOwner,
  actual: DriveProjectUnusedAssetDeleteOwner,
) {
  return (
    expected.workspaceId === actual.workspaceId &&
    expected.projectId === actual.projectId &&
    expected.manifestFileId === actual.manifestFileId &&
    expected.assetsFolderId === actual.assetsFolderId
  );
}

export async function executeDriveProjectUnusedAssetDeletion(input: {
  plan: DriveProjectUnusedAssetDeletePlan;
  currentOwner: DriveProjectUnusedAssetDeleteOwner;
  runFreshPreflight: (
    assetFileIds: string[],
  ) => Promise<DriveProjectUnusedAssetDeletePreflightResult>;
  deleteAssetFile: (assetFileId: string) => Promise<void>;
  onProgress?: (progress: { current: number; total: number }) => void;
}): Promise<DriveProjectUnusedAssetDeleteResult> {
  const initialItems = input.plan.assets.map(toNotAttemptedItem);

  if (!driveProjectUnusedAssetDeleteOwnerMatches(
    input.plan.owner,
    input.currentOwner,
  )) {
    return buildDeleteResult(
      initialItems.map((item) => ({
        ...item,
        status: "blocked",
        reason: "wrongProject",
      })),
    );
  }

  let executePreflight: DriveProjectUnusedAssetDeletePreflightResult;
  try {
    executePreflight = await input.runFreshPreflight(
      input.plan.assets.map((asset) => asset.assetFileId),
    );
  } catch (error) {
    return buildDeleteResult([
      toFailedItem(input.plan.assets[0], getFailureReason(error)),
      ...input.plan.assets.slice(1).map(toNotAttemptedItem),
    ]);
  }

  const executeValidation = validateFreshPreflight(
    input.plan,
    executePreflight,
  );
  if (!executeValidation.ok) {
    return buildDeleteResult(executeValidation.items);
  }

  const items: DriveProjectUnusedAssetDeleteItemResult[] = [];

  for (const [index, planAsset] of input.plan.assets.entries()) {
    input.onProgress?.({ current: index + 1, total: input.plan.assets.length });

    let itemPreflight: DriveProjectUnusedAssetDeletePreflightResult;
    try {
      itemPreflight = await input.runFreshPreflight([planAsset.assetFileId]);
    } catch (error) {
      items.push(toFailedItem(planAsset, getFailureReason(error)));
      items.push(...input.plan.assets.slice(index + 1).map(toNotAttemptedItem));
      return buildDeleteResult(items);
    }

    const itemValidation = validateFreshPreflight(
      { owner: input.plan.owner, assets: [planAsset] },
      itemPreflight,
    );
    if (!itemValidation.ok) {
      items.push(...itemValidation.items);
      items.push(...input.plan.assets.slice(index + 1).map(toNotAttemptedItem));
      return buildDeleteResult(items);
    }

    try {
      await input.deleteAssetFile(planAsset.assetFileId);
      items.push({
        assetName: planAsset.assetName,
        assetFileIdPart: planAsset.assetFileIdPart,
        sizeBytes: planAsset.sizeBytes,
        status: "deleted",
      });
    } catch (error) {
      items.push(toFailedItem(planAsset, getFailureReason(error)));
      items.push(...input.plan.assets.slice(index + 1).map(toNotAttemptedItem));
      return buildDeleteResult(items);
    }
  }

  return buildDeleteResult(items);
}

export async function deleteDriveProjectAssetFile(input: {
  accessToken: string;
  assetFileId: string;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(
      `${DRIVE_API_FILES_URL}/${encodeURIComponent(input.assetFileId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
        },
        signal: input.signal,
      },
    );

    if (response.status !== 204) {
      throw new DriveProjectUnusedAssetDeleteRequestError(
        response.status === 404 ? "notFound" : "deleteRejected",
      );
    }
  } catch (error) {
    if (error instanceof DriveProjectUnusedAssetDeleteRequestError) {
      throw error;
    }

    throw new DriveProjectUnusedAssetDeleteRequestError(
      isAbortError(error) || input.signal.aborted
        ? "aborted"
        : "unexpectedFailure",
    );
  }
}

function validateFreshPreflight(
  plan: DriveProjectUnusedAssetDeletePlan,
  preflight: DriveProjectUnusedAssetDeletePreflightResult,
):
  | { ok: true }
  | { ok: false; items: DriveProjectUnusedAssetDeleteItemResult[] } {
  const freshByFileId = new Map(
    preflight.allAssets.map((asset) => [asset.assetFileId, asset]),
  );
  const sameSet = sameStringSet(
    plan.assets.map((asset) => asset.assetFileId),
    preflight.selectedAssetFileIds,
  );

  if (
    !sameSet ||
    preflight.eligibleAssetCount !== plan.assets.length ||
    preflight.blockedAssetCount > 0
  ) {
    return {
      ok: false,
      items: plan.assets.map((planAsset) => {
        const freshAsset = freshByFileId.get(planAsset.assetFileId);
        if (!freshAsset) {
          return toBlockedItem(planAsset, "metadataChanged");
        }
        if (freshAsset.status === "blocked") {
          return toBlockedItem(
            planAsset,
            mapBlockedReason(freshAsset.blockedReasons),
          );
        }
        return toNotAttemptedItem(planAsset);
      }),
    };
  }

  const changedAssetFileIds = new Set(
    plan.assets
      .filter((planAsset) => {
        const freshAsset = freshByFileId.get(planAsset.assetFileId);
        return (
          !freshAsset ||
          buildMetadataFingerprint(freshAsset) !==
            planAsset.metadataFingerprint
        );
      })
      .map((asset) => asset.assetFileId),
  );

  if (changedAssetFileIds.size > 0) {
    return {
      ok: false,
      items: plan.assets.map((asset) =>
        changedAssetFileIds.has(asset.assetFileId)
          ? toBlockedItem(asset, "metadataChanged")
          : toNotAttemptedItem(asset),
      ),
    };
  }

  return { ok: true };
}

function buildMetadataFingerprint(
  asset: DriveProjectUnusedAssetDeletePreflightAsset,
) {
  return JSON.stringify([
    asset.assetFileId,
    asset.assetId,
    asset.assetName,
    asset.mimeType,
    asset.sizeBytes,
    asset.createdTime,
    asset.modifiedTime,
    asset.referenceSlideCount,
  ]);
}

function mapBlockedReason(
  reasons: DriveProjectUnusedAssetDeletePreflightBlockedReason[],
): DriveProjectUnusedAssetDeleteFailureReason {
  if (reasons.includes("notFound")) return "notFound";
  if (reasons.includes("stillReferenced")) return "stillReferenced";
  if (reasons.includes("notAppManagedAsset")) return "notAppManagedAsset";
  if (reasons.includes("wrongProject")) return "wrongProject";
  if (reasons.includes("wrongParent")) return "wrongParent";
  return "metadataChanged";
}

function getFailureReason(
  error: unknown,
): DriveProjectUnusedAssetDeleteFailureReason {
  if (error instanceof DriveProjectUnusedAssetDeleteRequestError) {
    return error.reason;
  }
  return isAbortError(error) ? "aborted" : "unexpectedFailure";
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError"
  );
}

function sameStringSet(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size &&
    Array.from(leftSet).every((value) => rightSet.has(value))
  );
}

function toNotAttemptedItem(
  asset: DriveProjectUnusedAssetDeletePlanAsset,
): DriveProjectUnusedAssetDeleteItemResult {
  return {
    assetName: asset.assetName,
    assetFileIdPart: asset.assetFileIdPart,
    sizeBytes: asset.sizeBytes,
    status: "notAttempted",
  };
}

function toBlockedItem(
  asset: DriveProjectUnusedAssetDeletePlanAsset,
  reason: DriveProjectUnusedAssetDeleteFailureReason,
): DriveProjectUnusedAssetDeleteItemResult {
  return {
    ...toNotAttemptedItem(asset),
    status: "blocked",
    reason,
  };
}

function toFailedItem(
  asset: DriveProjectUnusedAssetDeletePlanAsset,
  reason: DriveProjectUnusedAssetDeleteFailureReason,
): DriveProjectUnusedAssetDeleteItemResult {
  return {
    ...toNotAttemptedItem(asset),
    status: "failed",
    reason,
  };
}

function buildDeleteResult(
  items: DriveProjectUnusedAssetDeleteItemResult[],
): DriveProjectUnusedAssetDeleteResult {
  const deletedItems = items.filter((item) => item.status === "deleted");
  const failedCount = items.filter((item) => item.status === "failed").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const notAttemptedCount = items.filter(
    (item) => item.status === "notAttempted",
  ).length;
  const status =
    deletedItems.length === items.length
      ? "completed"
      : deletedItems.length > 0
        ? "partialFailure"
        : blockedCount > 0
          ? "blocked"
          : "failed";

  return {
    status,
    requestedCount: items.length,
    deletedCount: deletedItems.length,
    failedCount,
    blockedCount,
    notAttemptedCount,
    deletedTotalSizeBytes: deletedItems.reduce(
      (total, item) => total + (item.sizeBytes ?? 0),
      0,
    ),
    items,
  };
}
