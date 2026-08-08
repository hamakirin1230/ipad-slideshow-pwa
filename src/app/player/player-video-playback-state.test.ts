import { describe, expect, it, vi } from "vitest";
import {
  buildPlayerDriveVideoSessionRegistration,
  canApplyRemoteVideoResult,
  canRetryRemoteVideoPlayback,
  createRemoteVideoRetryOwnerKey,
  getPlayerSlideMediaKind,
  getPlayerVideoUnavailableCopy,
  getPlayerVideoUnavailableReason,
  getRemoteVideoCanPlayTypeLabel,
  isCurrentVideoSourceIdentity,
  normalizeRemoteVideoContentTypeLabel,
  normalizeRemoteVideoResponseContentType,
} from "./player-video-playback-state";
import { DRIVE_VIDEO_MAX_BYTES } from "@/lib/drive-video-policy";

describe("getPlayerVideoUnavailableReason", () => {
  it.each([
    [true, false, "remoteOffline"],
    [true, true, "remoteConnectionRequired"],
    [false, false, "playbackFailed"],
  ] as const)("classifies remote=%s online=%s", (isRemote, isOnline, expected) => {
    expect(
      getPlayerVideoUnavailableReason({
        isCurrentRemoteVideo: isRemote,
        isOnline,
      }),
    ).toBe(expected);
  });

  it("uses the safe codec fallback for an actual media playback failure", () => {
    const reason = getPlayerVideoUnavailableReason({
      isCurrentRemoteVideo: true,
      isOnline: true,
      hasMediaPlaybackFailure: true,
    });
    expect(reason).toBe("playbackFailed");
    expect(getPlayerVideoUnavailableCopy(reason)).toEqual({
      title: "この動画を再生できませんでした",
      description:
        "この端末で対応していない動画codecの可能性があります。前後のスライドへ移動するか、別形式の動画を使用してください。",
    });
  });
});

describe("MOV player policy", () => {
  it.each(["video/mp4", "video/quicktime"] as const)(
    "classifies %s as video",
    (mimeType) => {
      expect(getPlayerSlideMediaKind({ type: "video", mimeType })).toBe(
        "video",
      );
    },
  );

  it("keeps other video MIME types unsupported", () => {
    expect(
      getPlayerSlideMediaKind({ type: "video", mimeType: "video/webm" }),
    ).toBe("unsupported");
  });

  it.each(["video/mp4", "video/quicktime"] as const)(
    "registers a remote %s session with the actual MIME",
    (mimeType) => {
      expect(
        buildPlayerDriveVideoSessionRegistration({
          sessionId: "session-safe",
          assetFileId: "drive-file-sensitive-fixture",
          mimeType,
          fileSize: DRIVE_VIDEO_MAX_BYTES,
          expiresAt: 1234,
        }),
      ).toMatchObject({ mimeType, fileSize: DRIVE_VIDEO_MAX_BYTES });
    },
  );

  it("rejects a remote session above 5 GiB", () => {
    expect(
      buildPlayerDriveVideoSessionRegistration({
        sessionId: "session-safe",
        assetFileId: "drive-file-sensitive-fixture",
        mimeType: "video/quicktime",
        fileSize: DRIVE_VIDEO_MAX_BYTES + 1,
        expiresAt: 1234,
      }),
    ).toBeNull();
  });

  it("calls canPlayType with the current QuickTime MIME", () => {
    const canPlayType = vi.fn(() => "maybe");
    expect(
      getRemoteVideoCanPlayTypeLabel({
        mimeType: "video/quicktime",
        canPlayType,
      }),
    ).toBe("maybe");
    expect(canPlayType).toHaveBeenCalledWith("video/quicktime");
  });

  it("classifies MP4, QuickTime, missing, and other response content types", () => {
    expect(normalizeRemoteVideoResponseContentType("video/mp4")).toBe(
      "video/mp4",
    );
    expect(
      normalizeRemoteVideoResponseContentType("video/quicktime; charset=binary"),
    ).toBe("video/quicktime");
    expect(normalizeRemoteVideoResponseContentType(null)).toBe("missing");
    expect(normalizeRemoteVideoResponseContentType("video/webm")).toBe(
      "other",
    );
    expect(normalizeRemoteVideoContentTypeLabel("video/quicktime")).toBe(
      "video/quicktime",
    );
  });

  it("keeps sanitized fallback output free of stream secrets", () => {
    const serialized = JSON.stringify(
      getPlayerVideoUnavailableCopy("playbackFailed"),
    );
    expect(serialized).not.toContain("access-token-sensitive-fixture");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("drive-file-sensitive-fixture");
    expect(serialized).not.toContain("https://");
  });
});

describe("canRetryRemoteVideoPlayback", () => {
  const retryable = {
    isRemoteVideo: true,
    hasPlaybackError: true,
    isOnline: true,
    isGoogleConnected: true,
    isRetrying: false,
    ownerMatches: true,
  } as const;

  it("allows a current remote error when all prerequisites are ready", () => {
    expect(canRetryRemoteVideoPlayback(retryable)).toBe(true);
  });

  it("keeps manual retry available for a MOV remote error", () => {
    expect(canRetryRemoteVideoPlayback(retryable)).toBe(true);
  });

  it.each([
    ["offline", { isOnline: false }],
    ["online unknown", { isOnline: null }],
    ["Google disconnected", { isGoogleConnected: false }],
    ["retrying", { isRetrying: true }],
    ["owner mismatch", { ownerMatches: false }],
    ["offline video", { isRemoteVideo: false }],
    ["no playback error", { hasPlaybackError: false }],
  ])("rejects %s", (_label, override) => {
    expect(
      canRetryRemoteVideoPlayback({ ...retryable, ...override }),
    ).toBe(false);
  });
});

describe("canApplyRemoteVideoResult", () => {
  const current = {
    expectedOwnerKey: "owner-a",
    currentOwnerKey: "owner-a",
    expectedGeneration: 2,
    currentGeneration: 2,
    isCancelled: false,
  } as const;

  it("allows a current owner and generation", () => {
    expect(canApplyRemoteVideoResult(current)).toBe(true);
  });

  it.each([
    ["owner mismatch", { currentOwnerKey: "owner-b" }],
    ["generation mismatch", { currentGeneration: 3 }],
    ["cancelled", { isCancelled: true }],
    ["missing expected owner", { expectedOwnerKey: null }],
    ["missing current owner", { currentOwnerKey: null }],
  ])("rejects %s", (_label, override) => {
    expect(canApplyRemoteVideoResult({ ...current, ...override })).toBe(false);
  });
});

describe("createRemoteVideoRetryOwnerKey", () => {
  const create = (projectKey: string, snapshotKey: string, slideKey: string) =>
    createRemoteVideoRetryOwnerKey({ projectKey, snapshotKey, slideKey });

  it("is stable for the same inputs", () => {
    expect(create("project-a", "snapshot-a", "slide-a"))
      .toBe(create("project-a", "snapshot-a", "slide-a"));
  });

  it.each([
    ["project", create("project-b", "snapshot-a", "slide-a")],
    ["snapshot", create("project-a", "snapshot-b", "slide-a")],
    ["slide", create("project-a", "snapshot-a", "slide-b")],
  ])("changes when %s changes", (_label, changed) => {
    expect(changed).not.toBe(create("project-a", "snapshot-a", "slide-a"));
  });
});

describe("isCurrentVideoSourceIdentity", () => {
  it("requires matching non-null identities", () => {
    expect(isCurrentVideoSourceIdentity("source-a", "source-a")).toBe(true);
    expect(isCurrentVideoSourceIdentity("source-a", "source-b")).toBe(false);
    expect(isCurrentVideoSourceIdentity(null, null)).toBe(false);
  });
});
