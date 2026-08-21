import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  loadOfflinePlaybackSnapshotForRequest,
  resolvePlaybackProjectId,
} from "./use-offline-playback-snapshot";
import type { OfflinePlaybackSnapshot } from "@/lib/offline-playback-snapshot";

const hookSource = readFileSync(
  new URL("./use-offline-playback-snapshot.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const syncPanelSource = readFileSync(
  new URL("../admin/offline-sync-panel.tsx", import.meta.url),
  "utf8",
);

function readySnapshot(projectId: string): OfflinePlaybackSnapshot {
  return {
    status: "ready",
    checkedAt: "2026-08-21T00:00:00.000Z",
    projectId,
    syncedAt: "2026-08-21T00:00:00.000Z",
    slideCount: 1,
    assetCount: 1,
    slides: [],
    availableProjects: [],
    publicationProvenance: {
      status: "unpublished",
      label: "未公開",
      tone: "neutral",
      message: "未公開",
      warning: false,
      resyncRecommended: false,
    },
    diagnostics: [],
  };
}

describe("player requested project selection", () => {
  it("uses the URL project even when localStorage has an older project", async () => {
    const selectedProjectId = resolvePlaybackProjectId({
      requestedProjectId: "current",
      storedProjectId: "old",
    });
    const calls: Array<string | null> = [];
    const result = await loadOfflinePlaybackSnapshotForRequest({
      requestId: 1,
      getCurrentRequestId: () => 1,
      projectId: selectedProjectId,
      readSnapshot: async ({ projectId }) => {
        calls.push(projectId);
        return readySnapshot(projectId ?? "missing");
      },
    });

    expect(selectedProjectId).toBe("current");
    expect(calls).toEqual(["current"]);
    expect(result).toEqual({
      kind: "ready",
      snapshot: readySnapshot("current"),
    });
  });

  it("falls back to the stored project only when the URL has no projectId", async () => {
    const selectedProjectId = resolvePlaybackProjectId({
      requestedProjectId: null,
      storedProjectId: "old",
    });
    const result = await loadOfflinePlaybackSnapshotForRequest({
      requestId: 1,
      getCurrentRequestId: () => 1,
      projectId: selectedProjectId,
      readSnapshot: async ({ projectId }) => readySnapshot(projectId ?? "missing"),
    });

    expect(selectedProjectId).toBe("old");
    expect(result.kind === "ready" && result.snapshot.status === "ready").toBe(
      true,
    );
    if (result.kind === "ready" && result.snapshot.status === "ready") {
      expect(result.snapshot.projectId).toBe("old");
    }
  });

  it("loads the new URL project after the query changes from A to B", async () => {
    const calls: string[] = [];
    const first = await loadOfflinePlaybackSnapshotForRequest({
      requestId: 1,
      getCurrentRequestId: () => 1,
      projectId: resolvePlaybackProjectId({
        requestedProjectId: "project-a",
        storedProjectId: "old",
      }),
      readSnapshot: async ({ projectId }) => {
        calls.push(projectId ?? "");
        return readySnapshot(projectId ?? "missing");
      },
    });
    const second = await loadOfflinePlaybackSnapshotForRequest({
      requestId: 2,
      getCurrentRequestId: () => 2,
      projectId: resolvePlaybackProjectId({
        requestedProjectId: "project-b",
        storedProjectId: "old",
      }),
      readSnapshot: async ({ projectId }) => {
        calls.push(projectId ?? "");
        return readySnapshot(projectId ?? "missing");
      },
    });

    expect(calls).toEqual(["project-a", "project-b"]);
    expect(first.kind === "ready" && first.snapshot.status === "ready").toBe(
      true,
    );
    expect(second.kind === "ready" && second.snapshot.status === "ready").toBe(
      true,
    );
    if (first.kind === "ready" && first.snapshot.status === "ready") {
      expect(first.snapshot.projectId).toBe("project-a");
    }
    if (second.kind === "ready" && second.snapshot.status === "ready") {
      expect(second.snapshot.projectId).toBe("project-b");
    }
  });

  it("ignores a stale snapshot for the previous project", async () => {
    let currentRequestId = 1;
    let resolveOld:
      | ((snapshot: OfflinePlaybackSnapshot) => void)
      | null = null;
    const oldLoad = loadOfflinePlaybackSnapshotForRequest({
      requestId: 1,
      getCurrentRequestId: () => currentRequestId,
      projectId: "old",
      readSnapshot: () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    });

    currentRequestId = 2;
    const newLoad = loadOfflinePlaybackSnapshotForRequest({
      requestId: 2,
      getCurrentRequestId: () => currentRequestId,
      projectId: "current",
      readSnapshot: async ({ projectId }) => readySnapshot(projectId ?? "missing"),
    });

    resolveOld?.(readySnapshot("old"));
    await expect(oldLoad).resolves.toEqual({ kind: "ignored" });
    await expect(newLoad).resolves.toEqual({
      kind: "ready",
      snapshot: readySnapshot("current"),
    });
  });

  it("takes the Player route query as the snapshot authority", () => {
    expect(pageSource).toContain("useSearchParams()");
    expect(pageSource).toContain("<Suspense");
    expect(pageSource).toContain("useOfflinePlaybackSnapshot({\n    requestedProjectId,");
    expect(pageSource).not.toContain("window.location.search");
    expect(hookSource).not.toContain("window.location.search");
    expect(hookSource).toContain("resolvePlaybackProjectId({");
    expect(hookSource).toContain("requestedProjectId,");
    expect(hookSource).toContain("projectId: selectedProjectId");
    expect(pageSource).toContain("[playbackProjectId]");
    expect(syncPanelSource).toContain("createPlayerProjectLinkHref(selectedProjectId)");
    expect(syncPanelSource).toContain("この作品を再生");
  });
});
