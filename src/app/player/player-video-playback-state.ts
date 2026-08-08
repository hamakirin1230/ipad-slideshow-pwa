import {
  isDriveVideoFileSizeWithinLimit,
  isSupportedDriveVideoMimeType,
  type SupportedDriveVideoMimeType,
} from "@/lib/drive-video-policy";

export type PlayerVideoUnavailableReason =
  | "remoteOffline"
  | "remoteConnectionRequired"
  | "playbackFailed";

export type PlayerRemoteVideoRetryStatus = "idle" | "retrying" | "failed";

export type PlayerSlideMediaKind = "image" | "video" | "unsupported";

export type RemoteVideoContentTypeLabel =
  | SupportedDriveVideoMimeType
  | "missing"
  | "other";

export type RemoteVideoCanPlayTypeLabel = "probably" | "maybe" | "empty";

export function getPlayerVideoUnavailableReason({
  isCurrentRemoteVideo,
  isOnline,
  hasMediaPlaybackFailure = false,
}: {
  isCurrentRemoteVideo: boolean;
  isOnline: boolean | null;
  hasMediaPlaybackFailure?: boolean;
}): PlayerVideoUnavailableReason {
  if (isCurrentRemoteVideo && isOnline === false) {
    return "remoteOffline";
  }

  if (hasMediaPlaybackFailure) {
    return "playbackFailed";
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
          "この端末で対応していない動画codecの可能性があります。前後のスライドへ移動するか、別形式の動画を使用してください。",
      };
  }
}

export function getPlayerSlideMediaKind(slide: {
  type?: "image" | "video";
  mimeType: string;
  unsupportedReason?: string;
} | null): PlayerSlideMediaKind {
  if (!slide) {
    return "image";
  }

  if (slide.unsupportedReason) {
    return "unsupported";
  }

  if ((slide.type ?? "image") !== "video") {
    return "image";
  }

  return isSupportedDriveVideoMimeType(slide.mimeType)
    ? "video"
    : "unsupported";
}

export function isValidRemoteVideoFileSize(
  value: number | undefined,
): value is number {
  return isDriveVideoFileSizeWithinLimit(value);
}

export function buildPlayerDriveVideoSessionRegistration(input: {
  sessionId: string;
  assetFileId: string;
  mimeType: string;
  fileSize: number;
  expiresAt: number;
}): {
  sessionId: string;
  assetFileId: string;
  mimeType: SupportedDriveVideoMimeType;
  fileSize: number;
  expiresAt: number;
} | null {
  if (
    !isSupportedDriveVideoMimeType(input.mimeType) ||
    !isValidRemoteVideoFileSize(input.fileSize)
  ) {
    return null;
  }

  return { ...input, mimeType: input.mimeType };
}

export function normalizeRemoteVideoContentTypeLabel(
  value: unknown,
): RemoteVideoContentTypeLabel {
  if (isSupportedDriveVideoMimeType(typeof value === "string" ? value : "")) {
    return value as SupportedDriveVideoMimeType;
  }

  return value === "other" ? "other" : "missing";
}

export function normalizeRemoteVideoResponseContentType(
  value: string | null,
): RemoteVideoContentTypeLabel {
  if (!value) {
    return "missing";
  }

  const normalizedValue = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return isSupportedDriveVideoMimeType(normalizedValue)
    ? normalizedValue
    : "other";
}

export function getRemoteVideoCanPlayTypeLabel(input: {
  mimeType: SupportedDriveVideoMimeType;
  canPlayType: (mimeType: string) => string;
}): RemoteVideoCanPlayTypeLabel {
  const value = input.canPlayType(input.mimeType);
  return value === "probably" || value === "maybe" ? value : "empty";
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
