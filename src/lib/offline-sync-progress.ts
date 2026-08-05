export const OFFLINE_SYNC_PROGRESS_PHASES = [
  "preflight",
  "manifest",
  "publication",
  "assetMetadata",
  "assetSaving",
  "stagingValidation",
  "promotion",
  "completed",
] as const;

export type OfflineSyncProgressPhase =
  (typeof OFFLINE_SYNC_PROGRESS_PHASES)[number];

export type OfflineSyncProgress = {
  phase: OfflineSyncProgressPhase;
  processedAssetCount?: number;
  totalAssetCount?: number;
  percent?: number;
  message: string;
};

export type OfflineSyncProgressListener = (
  progress: OfflineSyncProgress,
) => void;

export type OfflineSyncProgressView = {
  message: string;
  countLabel?: string;
  percent?: number;
};

export const OFFLINE_SYNC_COMPLETED_MESSAGE = "同期完了";
export const OFFLINE_SYNC_CANCELLED_MESSAGE = "同期を中止しました";
export const OFFLINE_SYNC_STALE_MANIFEST_MESSAGE =
  "Drive上の内容が同期中に変更されました。再度同期してください";

const PHASE_INDEX = new Map(
  OFFLINE_SYNC_PROGRESS_PHASES.map((phase, index) => [phase, index]),
);

const PHASE_MESSAGES: Record<OfflineSyncProgressPhase, string> = {
  preflight: "同期前確認中",
  manifest: "manifestを確認中",
  publication: "公開状態を確認中",
  assetMetadata: "素材情報を取得中",
  assetSaving: "素材を保存中",
  stagingValidation: "stagingを検証中",
  promotion: "confirmed storeへ反映中",
  completed: OFFLINE_SYNC_COMPLETED_MESSAGE,
};

export function createOfflineSyncProgress(input: {
  phase: OfflineSyncProgressPhase;
  processedAssetCount?: number;
  totalAssetCount?: number;
}): OfflineSyncProgress {
  if (!PHASE_INDEX.has(input.phase)) {
    throw new TypeError("offline sync progress phase is invalid.");
  }
  const hasProcessed = input.processedAssetCount !== undefined;
  const hasTotal = input.totalAssetCount !== undefined;
  if (hasProcessed !== hasTotal) {
    throw new TypeError(
      "processedAssetCount and totalAssetCount must be provided together.",
    );
  }

  if (!hasTotal) {
    if (input.phase === "completed") {
      throw new TypeError("completed progress requires asset counts.");
    }
    return {
      phase: input.phase,
      message: PHASE_MESSAGES[input.phase],
    };
  }

  const processedAssetCount = input.processedAssetCount as number;
  const totalAssetCount = input.totalAssetCount as number;
  if (
    !Number.isSafeInteger(processedAssetCount) ||
    !Number.isSafeInteger(totalAssetCount) ||
    processedAssetCount < 0 ||
    totalAssetCount < 0 ||
    processedAssetCount > totalAssetCount
  ) {
    throw new TypeError("offline sync progress counts are invalid.");
  }
  if (
    input.phase === "completed" &&
    processedAssetCount !== totalAssetCount
  ) {
    throw new TypeError("completed progress requires all assets processed.");
  }

  const percent =
    input.phase === "completed"
      ? 100
      : totalAssetCount === 0
        ? 0
        : Math.min(
            100,
            Math.max(
              0,
              Math.floor((processedAssetCount / totalAssetCount) * 100),
            ),
          );
  const message =
    input.phase === "assetSaving"
      ? `${PHASE_MESSAGES.assetSaving} ${processedAssetCount} / ${totalAssetCount}`
      : PHASE_MESSAGES[input.phase];

  return {
    phase: input.phase,
    processedAssetCount,
    totalAssetCount,
    percent,
    message,
  };
}

export function advanceOfflineSyncProgress(
  previous: OfflineSyncProgress | null,
  candidate: OfflineSyncProgress,
): OfflineSyncProgress | null {
  let next: OfflineSyncProgress;
  try {
    next = createOfflineSyncProgress({
      phase: candidate.phase,
      ...(candidate.processedAssetCount !== undefined &&
      candidate.totalAssetCount !== undefined
        ? {
            processedAssetCount: candidate.processedAssetCount,
            totalAssetCount: candidate.totalAssetCount,
          }
        : {}),
    });
  } catch {
    return previous;
  }

  if (!previous) return next;

  const previousPhaseIndex = PHASE_INDEX.get(previous.phase);
  const nextPhaseIndex = PHASE_INDEX.get(next.phase);
  if (
    previousPhaseIndex === undefined ||
    nextPhaseIndex === undefined ||
    nextPhaseIndex < previousPhaseIndex
  ) {
    return previous;
  }
  if (
    previous.totalAssetCount !== undefined &&
    (next.totalAssetCount === undefined ||
      next.totalAssetCount !== previous.totalAssetCount)
  ) {
    return previous;
  }
  if (
    previous.processedAssetCount !== undefined &&
    (next.processedAssetCount === undefined ||
      next.processedAssetCount < previous.processedAssetCount)
  ) {
    return previous;
  }
  if (
    previous.percent !== undefined &&
    (next.percent === undefined || next.percent < previous.percent)
  ) {
    return previous;
  }
  if (offlineSyncProgressEquals(previous, next)) return previous;
  return next;
}

export function buildOfflineSyncProgressView(
  progress: OfflineSyncProgress | null,
): OfflineSyncProgressView | null {
  if (!progress) return null;
  const safeProgress = advanceOfflineSyncProgress(null, progress);
  if (!safeProgress) return null;
  return {
    message: safeProgress.message,
    ...(safeProgress.processedAssetCount !== undefined &&
    safeProgress.totalAssetCount !== undefined
      ? {
          countLabel: `${safeProgress.processedAssetCount} / ${safeProgress.totalAssetCount}`,
        }
      : {}),
    ...(safeProgress.percent !== undefined
      ? { percent: safeProgress.percent }
      : {}),
  };
}

function offlineSyncProgressEquals(
  left: OfflineSyncProgress,
  right: OfflineSyncProgress,
): boolean {
  return (
    left.phase === right.phase &&
    left.processedAssetCount === right.processedAssetCount &&
    left.totalAssetCount === right.totalAssetCount &&
    left.percent === right.percent &&
    left.message === right.message
  );
}
