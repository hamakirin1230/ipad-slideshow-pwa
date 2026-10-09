import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { projectReadFixture, projectId, workspaceId } from "../project-read-model.test-fixtures";
import { buildEmptyGooglePhotosSyncBinding, GOOGLE_PHOTOS_SYNC_PENDING_PHASES, type GooglePhotosSyncPendingPhase } from "./sync-binding";
import type { GooglePhotosSyncPreparedSource } from "./sync-drive-source";
import { diagnoseGooglePhotosSyncPending, type GooglePhotosSyncDiagnosticsAdapters } from "./sync-pending-diagnostics";

const fingerprint = `sha256:${"a".repeat(64)}`;
const changedFingerprint = `sha256:${"b".repeat(64)}`;
const { project } = projectReadFixture();
function binding(phase: GooglePhotosSyncPendingPhase = "finalizing") {
  const early = ["creatingAlbum", "albumBound", "mediaCreating"].includes(phase);
  const item = (id: string) => ({ slideId: `fixture-slide-${id}`, renderKey: fingerprint, mediaItemId: `fixture-media-${id}`, snapshot: null });
  const stable = phase === "creatingAlbum" ? null : { generation: 1, completedAt: "2026-10-01T00:00:00.000Z", rendererVersion: 3, items: [item("old")] };
  return {
    ...buildEmptyGooglePhotosSyncBinding({ workspaceId, projectId }),
    album: phase === "creatingAlbum" ? null : { albumId: "fixture-album", createdAt: "2026-10-01T00:00:00.000Z", lastKnownTitle: "fixture-title" },
    stable,
    pending: { phase, operationId: "fixture-operation", startedAt: "2026-10-02T00:00:00.000Z", sourceFingerprint: fingerprint,
      targetTitle: "fixture-title", previousManagedMediaItemIds: stable?.items.map(item => item.mediaItemId) ?? [], targetItems: early ? [] : [item("a"), item("b")] },
  };
}
function harness(phase: GooglePhotosSyncPendingPhase = "finalizing") {
  const remote = binding(phase);
  const original = structuredClone(remote);
  const source: GooglePhotosSyncPreparedSource = { projectId, projectTitle: "fixture-title", targetAlbumTitle: "fixture-title", sourceSlideCount: 2,
    skippedVideoCount: 0, totalBytes: 10, rendererVersion: 3, items: [], desiredSlides: [], sourceFingerprint: fingerprint };
  const adapters: GooglePhotosSyncDiagnosticsAdapters = {
    readBinding: vi.fn(async () => ({ status: "ready" as const, fileId: "fixture-binding", binding: remote })),
    prepareSource: vi.fn(async () => ({ ok: true as const, source })),
    getAlbum: vi.fn(async () => ({ status: "ready" as const, album: { id: "fixture-album", title: "fixture-title", isWriteable: true, mediaItemsCount: "2" } })),
    searchAlbumMediaItemsPage: vi.fn(async () => ({ status: "ready" as const, mediaItemIds: ["fixture-media-a", "fixture-media-b"], nextPageToken: null })),
  };
  const writes = { batchCreate: vi.fn(), createAlbum: vi.fn(), batchAdd: vi.fn(), batchRemove: vi.fn(), updateBinding: vi.fn(), requestOAuth: vi.fn() };
  const input = { accessToken: "fixture-drive-token", photosAccessToken: "fixture-photos-token" as string | null,
    selectedProjectId: projectId, workspaceId, projectsRootFolderId: "fixture-projects", project,
    signal: new AbortController().signal, isCurrent: () => true };
  return { remote, source, adapters, input, async run() {
    const result = await diagnoseGooglePhotosSyncPending(input, { ...adapters, ...writes });
    expect(remote).toEqual(original);
    for (const spy of Object.values(writes)) expect(spy).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    for (const secret of [projectId, workspaceId, fingerprint, "fixture-media", "fixture-album", "fixture-operation", "fixture-binding", "fixture-drive-token", "fixture-photos-token", "raw fixture error"])
      expect(JSON.stringify(result)).not.toContain(secret);
    return result;
  } };
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external API"); })));
afterEach(() => vi.unstubAllGlobals());

describe("read-only pending diagnostics", () => {
  it.each(GOOGLE_PHOTOS_SYNC_PENDING_PHASES)("classifies %s without claiming recovery", async phase => {
    const h = harness(phase);
    const result = await h.run();
    expect(result).toMatchObject({ ok: true, diagnostics: { phase, hasPending: true, autoResume: false, manualConfirmationRequired: true, sourceChanged: false } });
    if (result.ok) {
      expect(result.diagnostics.phaseExplanation.length).toBeGreaterThan(10);
      expect(result.diagnostics.membership.status).toBe(["creatingAlbum", "albumBound", "mediaCreating"].includes(phase) ? "indeterminate" : "match");
    }
  });
  it("diagnoses finalization left pending after the source changed", async () => {
    const h = harness(); h.source.sourceFingerprint = changedFingerprint;
    expect(await h.run()).toMatchObject({ ok: true, diagnostics: { phase: "finalizing", sourceChanged: true, targetCount: 2,
      previousManagedCount: 1, stableManagedCount: 1, membership: { status: "match" }, autoResume: false } });
  });
  it("detects changed title even if the source digest fixture matches", async () => {
    const h = harness(); h.source.targetAlbumTitle = "changed fixture title";
    expect(await h.run()).toMatchObject({ diagnostics: { sourceChanged: true } });
  });
  it.each([
    ["missing", ["fixture-media-a"], "missing", 1, 0, 0],
    ["previous managed extra", ["fixture-media-a", "fixture-media-b", "fixture-media-old"], "extra", 0, 1, 0],
    ["unmanaged photo", ["fixture-media-a", "fixture-unmanaged", "fixture-media-b"], "extra", 0, 1, 1],
    ["wrong order", ["fixture-media-b", "fixture-media-a"], "indeterminate", 0, 0, 0],
    ["missing plus unmanaged", ["fixture-media-a", "fixture-unmanaged"], "missing", 1, 1, 1],
  ] as const)("compares %s without removing or re-registering", async (_name, media, status, missingCount, extraCount, unmanagedCount) => {
    const h = harness(); vi.mocked(h.adapters.searchAlbumMediaItemsPage).mockResolvedValue({ status: "ready", mediaItemIds: [...media], nextPageToken: null });
    expect(await h.run()).toMatchObject({ diagnostics: { membership: { status, missingCount, extraCount, unmanagedCount } } });
  });
  it("does not treat empty targets in mediaCreating as a match", async () => {
    const h = harness("mediaCreating");
    expect(await h.run()).toMatchObject({ diagnostics: { targetCount: null, membership: { status: "indeterminate" } } });
    expect(h.adapters.getAlbum).not.toHaveBeenCalled();
  });
  it("rejects target-less late pending instead of matching an empty set", async () => {
    const h = harness(); h.remote.pending.targetItems = [];
    expect(await diagnoseGooglePhotosSyncPending(h.input, h.adapters)).toEqual({ ok: false, reason: "bindingInvalid" });
    expect(h.adapters.getAlbum).not.toHaveBeenCalled();
  });
  it("uses unavailable when no existing Photos token exists", async () => {
    const h = harness(); h.input.photosAccessToken = null;
    expect(await h.run()).toMatchObject({ diagnostics: { membership: { status: "unavailable", comparable: false } } });
    expect(h.adapters.getAlbum).not.toHaveBeenCalled(); expect(h.adapters.searchAlbumMediaItemsPage).not.toHaveBeenCalled();
  });
  it.each(["inaccessible", "notFound", "invalidResponse"] as const)("handles album read %s", async status => {
    const h = harness(); vi.mocked(h.adapters.getAlbum).mockResolvedValue({ status });
    expect(await h.run()).toMatchObject({ diagnostics: { membership: { status: "indeterminate" } } });
  });
  it("sanitizes a thrown Photos read error", async () => {
    const h = harness(); vi.mocked(h.adapters.getAlbum).mockRejectedValue(new Error("raw fixture error"));
    expect(await h.run()).toMatchObject({ diagnostics: { membership: { status: "indeterminate" } } });
  });
  it("fails closed for a different returned album", async () => {
    const h = harness(); vi.mocked(h.adapters.getAlbum).mockResolvedValue({ status: "ready", album: { id: "fixture-other-album", title: "fixture-title", isWriteable: true, mediaItemsCount: "2" } });
    expect(await h.run()).toMatchObject({ diagnostics: { membership: { status: "indeterminate" } } });
    expect(h.adapters.searchAlbumMediaItemsPage).not.toHaveBeenCalled();
  });
  it("does not classify a non-writeable album as a membership match", async () => {
    const h = harness(); vi.mocked(h.adapters.getAlbum).mockResolvedValue({ status: "ready", album: { id: "fixture-album", title: "fixture-title", isWriteable: false, mediaItemsCount: "2" } });
    expect(await h.run()).toMatchObject({ diagnostics: { membership: { status: "indeterminate" } } });
    expect(h.adapters.searchAlbumMediaItemsPage).not.toHaveBeenCalled();
  });
  it("waits for every page before comparing", async () => {
    const h = harness(); vi.mocked(h.adapters.searchAlbumMediaItemsPage)
      .mockResolvedValueOnce({ status: "ready", mediaItemIds: ["fixture-media-a"], nextPageToken: "fixture-page" })
      .mockResolvedValueOnce({ status: "ready", mediaItemIds: ["fixture-media-b"], nextPageToken: null });
    expect(await h.run()).toMatchObject({ diagnostics: { membership: { status: "match" } } });
    expect(h.adapters.searchAlbumMediaItemsPage).toHaveBeenCalledTimes(2);
  });
  it("does not classify partially retrieved pages as missing or match", async () => {
    const h = harness(); vi.mocked(h.adapters.searchAlbumMediaItemsPage)
      .mockResolvedValueOnce({ status: "ready", mediaItemIds: ["fixture-media-a"], nextPageToken: "fixture-page" })
      .mockResolvedValueOnce({ status: "inaccessible" });
    expect(await h.run()).toMatchObject({ diagnostics: { membership: { status: "indeterminate", missingCount: null } } });
  });
  it("rejects pagination cycles", async () => {
    const h = harness(); vi.mocked(h.adapters.searchAlbumMediaItemsPage)
      .mockResolvedValueOnce({ status: "ready", mediaItemIds: [], nextPageToken: "fixture-page" })
      .mockResolvedValueOnce({ status: "ready", mediaItemIds: [], nextPageToken: "fixture-page" });
    expect(await h.run()).toMatchObject({ diagnostics: { membership: { status: "indeterminate" } } });
  });
  it("keeps source comparison unknown after Drive source read fails", async () => {
    const h = harness(); vi.mocked(h.adapters.prepareSource).mockRejectedValue(new Error("raw fixture error"));
    expect(await h.run()).toMatchObject({ diagnostics: { sourceChanged: null } });
  });
  it.each(["readBinding", "prepareSource", "getAlbum", "searchAlbumMediaItemsPage"] as const)("discards an aborted %s result", async name => {
    const h = harness(); const controller = new AbortController(); h.input.signal = controller.signal;
    const original = h.adapters[name];
    vi.mocked(h.adapters[name]).mockImplementationOnce((async (...args: unknown[]) => {
      controller.abort();
      return (original as (...args: unknown[]) => Promise<unknown>)(...args);
    }) as never);
    expect(await h.run()).toEqual({ ok: false, reason: "cancelled" });
  });
  it("rejects changed binding ownership", async () => {
    const h = harness(); h.remote.workspaceId = "33333333-3333-4333-8333-333333333333";
    expect(await diagnoseGooglePhotosSyncPending(h.input, h.adapters)).toEqual({ ok: false, reason: "bindingInvalid" });
    expect(h.adapters.getAlbum).not.toHaveBeenCalled();
  });
  it("discards stale authority between pages", async () => {
    const h = harness(); let current = true; h.input.isCurrent = () => current;
    vi.mocked(h.adapters.searchAlbumMediaItemsPage).mockImplementationOnce(async () => {
      current = false; return { status: "ready", mediaItemIds: ["fixture-media-a"], nextPageToken: "fixture-next" };
    });
    expect(await h.run()).toEqual({ ok: false, reason: "cancelled" });
    expect(h.adapters.searchAlbumMediaItemsPage).toHaveBeenCalledOnce();
  });
  it("has no mutation, OAuth, persistence or logging capability", () => {
    const source = readFileSync(new URL("./sync-pending-diagnostics.ts", import.meta.url), "utf8");
    for (const name of ["updateBinding", "batchCreate", "batchAdd", "batchRemove", "createAlbum", "requestAccessToken", "console.", "localStorage", "sessionStorage", "indexedDB"])
      expect(source).not.toContain(name);
  });
});
