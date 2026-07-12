import { describe, expect, it } from "vitest";
import {
  canApplyRemoteVideoResult,
  canRetryRemoteVideoPlayback,
  createRemoteVideoRetryOwnerKey,
  getPlayerVideoUnavailableReason,
  isCurrentVideoSourceIdentity,
} from "./player-video-playback-state";

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
