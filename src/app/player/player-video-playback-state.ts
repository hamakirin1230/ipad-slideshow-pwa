export type PlayerVideoUnavailableReason =
  | "remoteOffline"
  | "remoteConnectionRequired"
  | "playbackFailed";

export type PlayerRemoteVideoRetryStatus = "idle" | "retrying" | "failed";

export function getPlayerVideoUnavailableReason({
  isCurrentRemoteVideo,
  isOnline,
}: {
  isCurrentRemoteVideo: boolean;
  isOnline: boolean | null;
}): PlayerVideoUnavailableReason {
  if (isCurrentRemoteVideo && isOnline === false) {
    return "remoteOffline";
  }

  if (isCurrentRemoteVideo) {
    return "remoteConnectionRequired";
  }

  return "playbackFailed";
}

export function getPlayerVideoUnavailableCopy(
  reason: PlayerVideoUnavailableReason,
) {
  switch (reason) {
    case "remoteOffline":
      return {
        badge: "オンライン再生専用",
        title: "この動画はオンライン再生が必要です",
        description:
          "この端末には動画本体を保存していないため、オフラインでは再生できません。インターネット接続を確認してから再度開くか、前後のスライドへ移動してください。",
      };

    case "remoteConnectionRequired":
      return {
        badge: "オンライン動画",
        title: "動画を再生できませんでした",
        description:
          "インターネット接続とGoogle接続を確認してください。この動画はオンライン時にDriveから再生します。",
      };

    case "playbackFailed":
      return {
        title: "この動画を再生できませんでした",
        description:
          "前後のスライドへ移動するか、管理画面でoffline syncの状態を確認してください。",
      };
  }
}

export function getRemoteVideoRetryGuidance({
  isCurrentRemoteVideo,
  isOnline,
  googleStatus,
  retryStatus,
}: {
  isCurrentRemoteVideo: boolean;
  isOnline: boolean | null;
  googleStatus: string;
  retryStatus: PlayerRemoteVideoRetryStatus;
}): string | null {
  if (!isCurrentRemoteVideo) {
    return null;
  }

  if (retryStatus === "retrying") {
    return "動画の再接続を試みています。";
  }

  if (isOnline !== true) {
    return "オンライン接続後に再試行できます。";
  }

  if (googleStatus !== "connected") {
    return "設定画面でGoogle接続を確認してください。";
  }

  return retryStatus === "failed"
    ? "再接続できませんでした。接続を確認して再試行してください。"
    : "接続を確認してから再試行してください。";
}

export function createRemoteVideoRetryOwnerKey({
  projectKey,
  snapshotKey,
  slideKey,
}: {
  projectKey: string | null;
  snapshotKey: string | null;
  slideKey: string | null;
}): string | null {
  if (!projectKey || !snapshotKey || !slideKey) {
    return null;
  }

  return `${projectKey}:${snapshotKey}:${slideKey}`;
}

export function canRetryRemoteVideoPlayback({
  isRemoteVideo,
  hasPlaybackError,
  isOnline,
  isGoogleConnected,
  isRetrying,
  ownerMatches,
}: {
  isRemoteVideo: boolean;
  hasPlaybackError: boolean;
  isOnline: boolean | null;
  isGoogleConnected: boolean;
  isRetrying: boolean;
  ownerMatches: boolean;
}): boolean {
  return (
    isRemoteVideo &&
    hasPlaybackError &&
    isOnline === true &&
    isGoogleConnected &&
    !isRetrying &&
    ownerMatches
  );
}

export function canApplyRemoteVideoResult({
  expectedOwnerKey,
  currentOwnerKey,
  expectedGeneration,
  currentGeneration,
  isCancelled,
}: {
  expectedOwnerKey: string | null;
  currentOwnerKey: string | null;
  expectedGeneration: number;
  currentGeneration: number;
  isCancelled: boolean;
}): boolean {
  return (
    !isCancelled &&
    expectedOwnerKey !== null &&
    currentOwnerKey !== null &&
    expectedOwnerKey === currentOwnerKey &&
    expectedGeneration === currentGeneration
  );
}

export function isCurrentVideoSourceIdentity(
  expectedSource: string | null,
  actualSource: string | null,
): boolean {
  return (
    expectedSource !== null &&
    actualSource !== null &&
    expectedSource === actualSource
  );
}
