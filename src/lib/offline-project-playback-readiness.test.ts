import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  evaluateOfflineProjectPlaybackReadiness,
  readOfflineProjectPlaybackReadiness,
} from "./offline-project-playback-readiness";

const source = readFileSync(
  new URL("./offline-project-playback-readiness.ts", import.meta.url),
  "utf8",
);

describe("offline project playback readiness", () => {
  it("is ready only when the selected project and ready sync state match", () => {
    expect(
      evaluateOfflineProjectPlaybackReadiness({
        projectId: "project-a",
        project: { projectId: "project-a" },
        syncState: { projectId: "project-a", status: "ready" },
      }),
    ).toEqual({ status: "ready" });
  });

  it("does not treat another confirmed project as the selected project", () => {
    expect(
      evaluateOfflineProjectPlaybackReadiness({
        projectId: "project-a",
        project: { projectId: "project-b" },
        syncState: { projectId: "project-b", status: "ready" },
      }),
    ).toEqual({ status: "notReady" });
    expect(
      evaluateOfflineProjectPlaybackReadiness({
        projectId: "project-a",
        project: { projectId: "project-a" },
        syncState: { projectId: "project-b", status: "ready" },
      }),
    ).toEqual({ status: "notReady" });
  });

  it("treats missing or non-ready sync state as not ready", () => {
    expect(
      evaluateOfflineProjectPlaybackReadiness({
        projectId: "project-a",
        project: { projectId: "project-a" },
        syncState: { projectId: "project-a", status: "failed" },
      }),
    ).toEqual({ status: "notReady" });
    expect(
      evaluateOfflineProjectPlaybackReadiness({
        projectId: "project-a",
        project: { projectId: "project-a" },
        syncState: null,
      }),
    ).toEqual({ status: "notReady" });
  });

  it("reads only the selected project records", async () => {
    const getProject = vi.fn(async (projectId: string) => ({
      projectId,
    }));
    const getSyncState = vi.fn(async (projectId: string) => ({
      projectId,
      status: "ready",
    }));

    await expect(
      readOfflineProjectPlaybackReadiness("project-selected", {
        getProject,
        getSyncState,
      }),
    ).resolves.toEqual({ status: "ready" });
    expect(getProject).toHaveBeenCalledWith("project-selected");
    expect(getSyncState).toHaveBeenCalledWith("project-selected");
  });

  it("does not read asset Blob stores", () => {
    expect(source).toContain("OFFLINE_PROJECTS_STORE");
    expect(source).toContain("OFFLINE_SYNC_STATE_STORE");
    expect(source).not.toContain("OFFLINE_ASSET_BLOBS_STORE");
    expect(source).not.toContain("OFFLINE_ASSETS_STORE");
    expect(source).not.toContain("readOfflinePlaybackSnapshot");
    expect(source).not.toContain(".blob");
  });

  it("returns unavailable without exposing the store error", async () => {
    const result = await readOfflineProjectPlaybackReadiness("project-a", {
      getProject: vi.fn(async () => {
        throw new Error("indexeddb-internal-error");
      }),
      getSyncState: vi.fn(async () => ({
        projectId: "project-a",
        status: "ready",
      })),
    });
    expect(result).toEqual({ status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("indexeddb-internal-error");
    expect(JSON.stringify(result)).not.toContain("project-a");
  });
});
