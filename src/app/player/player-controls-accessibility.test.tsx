import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayerPage from "./page";

vi.mock("@/app/app-providers", () => ({
  useAppState: () => ({
    googleStatus: "connected",
    registerDriveVideoPlaybackSession: vi.fn(),
    unregisterDriveVideoPlaybackSession: vi.fn(),
    clearDriveVideoPlaybackSessions: vi.fn(),
  }),
}));

vi.mock("./use-offline-playback-snapshot", () => ({
  useOfflinePlaybackSnapshot: () => ({
    status: "ready",
    snapshot: {
      status: "ready",
      checkedAt: "2026-08-12T00:00:00.000Z",
      projectId: "project-fixture",
      projectTitle: "アクセシビリティ確認",
      syncedAt: "2026-08-12T00:00:00.000Z",
      slideCount: 1,
      assetCount: 1,
      slides: [
        {
          slideId: "slide-fixture",
          assetId: "asset-fixture",
          order: 0,
          caption: "",
          durationSeconds: 5,
          type: "image",
          mimeType: "image/jpeg",
          assetName: "fixture.jpg",
          sourceDriveFileId: "drive-fixture",
          offlineAvailability: "offline",
          blob: new Blob(["fixture"], { type: "image/jpeg" }),
          blobMimeType: "image/jpeg",
          blobSizeBytes: 7,
        },
      ],
      availableProjects: [],
      publicationProvenance: {
        status: "publishedMatch",
        label: "公開版と一致",
        message: "公開版と一致しています。",
        tone: "success",
        warning: false,
        resyncRecommended: false,
      },
      diagnostics: [],
    },
    errorMessage: null,
    selectedProjectId: null,
    selectProject: vi.fn(),
    clearSelectedProject: vi.fn(),
    reload: vi.fn(),
  }),
}));

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("player auto-hide control accessibility", () => {
  it("keeps visible image controls available without inert or aria-hidden", () => {
    const markup = renderPlayer("normal");
    const controlGroups = getControlGroups(markup, "normal");

    expect(controlGroups).toHaveLength(4);
    for (const controlGroup of controlGroups) {
      expect(controlGroup).not.toContain("inert");
      expect(controlGroup).not.toContain("aria-hidden");
    }
  });

  it("makes production-hidden image controls inert and aria-hidden", () => {
    const markup = renderPlayer("production");
    const controlGroups = getControlGroups(markup, "normal");

    expect(controlGroups).toHaveLength(3);
    for (const controlGroup of controlGroups) {
      expect(controlGroup).toContain("inert=\"\"");
      expect(controlGroup).toContain("aria-hidden=\"true\"");
    }
  });

  it("keeps production mode actions outside hidden controls", () => {
    const markup = renderPlayer("production");

    expect(markup).toContain("本番モード中");
    expect(markup).toContain("本番終了");
    expect(markup).toContain("tabindex=\"-1\"");
    expect(source).toContain('label="長押しでロック解除"');
    expect(source).toContain("PLAYER_LOCK_HOLD_DURATION_MS = 2_000");
  });

  it("relocates a focused descendant when its control group becomes hidden", () => {
    expect(source).toContain("!controlGroup.contains(activeElement)");
    expect(source).toContain("focusDestination.focus({ preventScroll: true })");
    expect(source).toContain("document.activeElement");
    expect(source).toContain("focusDestinationRef.current");
  });

  it("applies the same shared boundary to custom video controls", () => {
    expect(source).toContain('data-player-controls="video"');
    expect(source).toContain("visible={showVideoControls}");
    expect(source).toContain("focusDestinationRef={playerRootRef}");
    expect(source).toContain("controls={false}");
  });
});

function renderPlayer(presentationMode: "normal" | "production") {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) =>
        key.endsWith("presentation-mode") ? presentationMode : null,
      setItem: vi.fn(),
    },
  });

  return renderToStaticMarkup(<PlayerPage />);
}

function getControlGroups(markup: string, kind: "normal" | "video") {
  return (
    markup.match(
      new RegExp(
        `<div[^>]*data-player-controls="${kind}"[^>]*>`,
        "g",
      ),
    ) ?? []
  );
}
