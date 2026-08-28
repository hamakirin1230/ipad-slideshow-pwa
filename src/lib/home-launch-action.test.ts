import { describe, expect, it } from "vitest";
import {
  hasReadyLocalPlaybackCopy,
  resolveHomeLaunchAction,
} from "./home-launch-action";

describe("resolveHomeLaunchAction", () => {
  it("plays first when a local playback copy already exists", () => {
    expect(
      resolveHomeLaunchAction({
        googleStatus: "notConnected",
        driveStatus: "unchecked",
        projectStatus: "idle",
        albumCount: 0,
        hasLocalPlaybackCopy: true,
      }),
    ).toEqual({ kind: "play", label: "再生する", href: "/player" });
  });

  it("asks to connect Google when there is no local copy yet", () => {
    expect(
      resolveHomeLaunchAction({
        googleStatus: "notConnected",
        driveStatus: "unchecked",
        projectStatus: "idle",
        albumCount: 0,
        hasLocalPlaybackCopy: false,
      }),
    ).toEqual({
      kind: "connectGoogle",
      label: "Googleアカウントでつなぐ",
      href: "/settings",
    });
  });

  it("asks to prepare the Drive workspace after connect", () => {
    expect(
      resolveHomeLaunchAction({
        googleStatus: "connected",
        driveStatus: "notCreated",
        projectStatus: "idle",
        albumCount: 0,
        hasLocalPlaybackCopy: false,
      }),
    ).toEqual({
      kind: "prepareWorkspace",
      label: "保存場所を準備する",
      href: "/settings",
    });
  });

  it("asks to create an album when Drive is ready and none exist", () => {
    expect(
      resolveHomeLaunchAction({
        googleStatus: "connected",
        driveStatus: "ready",
        projectStatus: "notCreated",
        albumCount: 0,
        hasLocalPlaybackCopy: false,
      }),
    ).toEqual({
      kind: "createAlbum",
      label: "アルバムをつくる",
      href: "/admin",
    });
  });

  it("asks to save locally when albums exist but this device has no copy", () => {
    expect(
      resolveHomeLaunchAction({
        googleStatus: "connected",
        driveStatus: "ready",
        projectStatus: "ready",
        albumCount: 1,
        hasLocalPlaybackCopy: false,
      }),
    ).toEqual({
      kind: "saveLocally",
      label: "ローカルに保存する",
      href: "/admin#device",
    });
  });
});

describe("hasReadyLocalPlaybackCopy", () => {
  it("requires a matching ready sync state", () => {
    expect(
      hasReadyLocalPlaybackCopy({
        projects: [{ projectId: "album-a" }],
        syncStates: [{ projectId: "album-a", status: "ready" }],
      }),
    ).toBe(true);
    expect(
      hasReadyLocalPlaybackCopy({
        projects: [{ projectId: "album-a" }],
        syncStates: [{ projectId: "album-a", status: "failed" }],
      }),
    ).toBe(false);
    expect(
      hasReadyLocalPlaybackCopy({
        projects: [{ projectId: "album-a" }],
        syncStates: [{ projectId: "album-b", status: "ready" }],
      }),
    ).toBe(false);
  });
});
