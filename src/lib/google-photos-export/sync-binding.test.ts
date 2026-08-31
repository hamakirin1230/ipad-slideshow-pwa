import { describe, expect, it } from "vitest";
import {
  buildEmptyGooglePhotosSyncBinding,
  GOOGLE_PHOTOS_SYNC_PENDING_PHASES,
  parseGooglePhotosSyncBinding,
  parseGooglePhotosSyncBindingJson,
  stringifyGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
} from "./sync-binding";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const EXPECTED = { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID };
const SNAPSHOT = {
  mediaKind: "image" as const,
  displayName: "海辺.jpg",
  caption: "海辺の写真",
  durationMs: 10_000,
  imageEdit: { rotation: 90 as const },
};

function validBinding(): GooglePhotosSyncBinding {
  return {
    ...buildEmptyGooglePhotosSyncBinding(EXPECTED),
    album: {
      albumId: "photos-album",
      createdAt: "2026-08-30T01:00:00.000Z",
      lastKnownTitle: "作品",
    },
    stable: {
      generation: 2,
      completedAt: "2026-08-30T01:05:00.000Z",
      rendererVersion: 1,
      items: [
        {
          slideId: "slide-1",
          renderKey: "render-1",
          mediaItemId: "media-1",
          snapshot: SNAPSHOT,
        },
        {
          slideId: "slide-2",
          renderKey: "render-2",
          mediaItemId: "media-2",
          snapshot: {
            mediaKind: "image",
            displayName: "山.jpg",
            caption: "山の写真",
            durationMs: 8_000,
          },
        },
      ],
    },
    pending: {
      operationId: "operation-1",
      startedAt: "2026-08-30T02:00:00.000Z",
      phase: "mediaPrepared",
      sourceFingerprint: "source-fingerprint",
      targetTitle: "更新後",
      previousManagedMediaItemIds: ["media-1", "media-2"],
      targetItems: [
        {
          slideId: "slide-1",
          renderKey: "render-1",
          mediaItemId: "media-1",
          snapshot: SNAPSHOT,
        },
        {
          slideId: "slide-3",
          renderKey: "render-3",
          mediaItemId: "media-3",
          snapshot: { ...SNAPSHOT, displayName: "森.jpg" },
        },
      ],
    },
  };
}

function v1Fixture() {
  const value = JSON.parse(JSON.stringify(validBinding())) as Record<string, unknown>;
  value.schemaVersion = 1;
  const stable = value.stable as Record<string, unknown>;
  const pending = value.pending as Record<string, unknown>;
  for (const item of stable.items as Array<Record<string, unknown>>) {
    delete item.snapshot;
  }
  for (const item of pending.targetItems as Array<Record<string, unknown>>) {
    delete item.snapshot;
  }
  return value;
}

function mutateBinding(
  mutate: (value: Record<string, unknown>) => void,
): unknown {
  const value = JSON.parse(JSON.stringify(validBinding())) as Record<string, unknown>;
  mutate(value);
  return value;
}

describe("Google Photos sync binding schema evolution", () => {
  it("parses exact v1 and normalizes missing snapshots to null", () => {
    const parsed = parseGooglePhotosSyncBinding(v1Fixture(), EXPECTED);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("fixture failed");

    expect(parsed.value.schemaVersion).toBe(2);
    expect(parsed.value.stable?.items.map((item) => item.snapshot)).toEqual([
      null,
      null,
    ]);
    expect(parsed.value.pending?.targetItems.map((item) => item.snapshot)).toEqual([
      null,
      null,
    ]);
  });

  it("canonicalizes parsed v1 to v2 only when stringify is explicitly called", () => {
    const parsed = parseGooglePhotosSyncBinding(v1Fixture(), EXPECTED);
    if (!parsed.ok) throw new Error("fixture failed");
    const text = stringifyGooglePhotosSyncBinding(parsed.value);
    const body = JSON.parse(text);

    expect(body.schemaVersion).toBe(2);
    expect(body.stable.items[0]).toHaveProperty("snapshot", null);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("parses and round-trips canonical v2 snapshots", () => {
    const binding = validBinding();
    expect(parseGooglePhotosSyncBindingJson(
      stringifyGooglePhotosSyncBinding(binding),
      EXPECTED,
    )).toEqual({ ok: true, value: binding });
  });

  it("retains every pending phase", () => {
    expect(GOOGLE_PHOTOS_SYNC_PENDING_PHASES).toEqual([
      "creatingAlbum",
      "albumBound",
      "mediaCreating",
      "mediaPrepared",
      "membershipRemoving",
      "membershipAdding",
      "titleUpdating",
      "finalizing",
    ]);
    for (const phase of GOOGLE_PHOTOS_SYNC_PENDING_PHASES) {
      const binding = validBinding();
      binding.pending!.phase = phase;
      expect(parseGooglePhotosSyncBinding(binding, EXPECTED).ok).toBe(true);
    }
  });

  it.each([
    ["malformed", { ...SNAPSHOT, durationMs: Number.NaN }],
    ["video", { ...SNAPSHOT, mediaKind: "video" }],
    ["unknown field", { ...SNAPSHOT, assetIdentity: "secret" }],
  ])("rejects a %s v2 snapshot", (_label, snapshot) => {
    const candidate = mutateBinding((binding) => {
      const stable = binding.stable as Record<string, unknown>;
      const items = stable.items as Array<Record<string, unknown>>;
      items[0]!.snapshot = snapshot;
    });
    expect(parseGooglePhotosSyncBinding(candidate, EXPECTED)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects missing v2 snapshots and unknown managed item properties", () => {
    for (const mutate of [
      (item: Record<string, unknown>) => delete item.snapshot,
      (item: Record<string, unknown>) => {
        item.extra = true;
        return true;
      },
    ]) {
      const candidate = mutateBinding((binding) => {
        const stable = binding.stable as Record<string, unknown>;
        mutate((stable.items as Array<Record<string, unknown>>)[0]!);
      });
      expect(parseGooglePhotosSyncBinding(candidate, EXPECTED)).toEqual({
        ok: false,
        reason: "unknownProperty",
      });
    }
  });

  it("rejects schema v3 and preserves exact ownership checks", () => {
    const version = mutateBinding((binding) => {
      binding.schemaVersion = 3;
    });
    expect(parseGooglePhotosSyncBinding(version, EXPECTED)).toEqual({
      ok: false,
      reason: "schemaVersionMismatch",
    });

    const workspace = mutateBinding((binding) => {
      binding.workspaceId = "33333333-3333-4333-8333-333333333333";
    });
    expect(parseGooglePhotosSyncBinding(workspace, EXPECTED)).toEqual({
      ok: false,
      reason: "workspaceMismatch",
    });
  });
});

describe("Google Photos sync binding validation", () => {
  it.each([
    ["app", "other-app", "appMismatch"],
    ["role", "other-role", "roleMismatch"],
    ["projectId", "44444444-4444-4444-8444-444444444444", "projectMismatch"],
  ])("rejects invalid top-level %s", (key, value, reason) => {
    const candidate = mutateBinding((binding) => {
      binding[key] = value;
    });
    expect(parseGooglePhotosSyncBinding(candidate, EXPECTED)).toEqual({
      ok: false,
      reason,
    });
  });

  it.each([
    ["generation", 0, "invalidGeneration"],
    ["rendererVersion", -1, "invalidRendererVersion"],
  ])("rejects invalid stable %s", (key, value, reason) => {
    const candidate = mutateBinding((binding) => {
      (binding.stable as Record<string, unknown>)[key] = value;
    });
    expect(parseGooglePhotosSyncBinding(candidate, EXPECTED)).toEqual({
      ok: false,
      reason,
    });
  });

  it.each([
    ["slideId", "slide-1", "duplicateSlideId"],
    ["mediaItemId", "media-1", "duplicateMediaItemId"],
  ])("rejects duplicate stable %s", (key, value, reason) => {
    const candidate = mutateBinding((binding) => {
      const stable = binding.stable as Record<string, unknown>;
      const items = stable.items as Array<Record<string, unknown>>;
      items[1]![key] = value;
    });
    expect(parseGooglePhotosSyncBinding(candidate, EXPECTED)).toEqual({
      ok: false,
      reason,
    });
  });

  it.each([
    ["slideId", "slide-1", "duplicateSlideId"],
    ["mediaItemId", "media-1", "duplicateMediaItemId"],
  ])("rejects duplicate pending %s", (key, value, reason) => {
    const candidate = mutateBinding((binding) => {
      const pending = binding.pending as Record<string, unknown>;
      const items = pending.targetItems as Array<Record<string, unknown>>;
      items[1]![key] = value;
    });
    expect(parseGooglePhotosSyncBinding(candidate, EXPECTED)).toEqual({
      ok: false,
      reason,
    });
  });

  it("rejects invalid timestamps and malformed item collections", () => {
    const timestamp = mutateBinding((binding) => {
      (binding.album as Record<string, unknown>).createdAt =
        "2026-02-30T01:00:00.000Z";
    });
    expect(parseGooglePhotosSyncBinding(timestamp, EXPECTED)).toEqual({
      ok: false,
      reason: "invalidTimestamp",
    });
    const collection = mutateBinding((binding) => {
      (binding.stable as Record<string, unknown>).items = {};
    });
    expect(parseGooglePhotosSyncBinding(collection, EXPECTED)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects malformed JSON, unsupported phases, and unknown fields", () => {
    expect(parseGooglePhotosSyncBindingJson("{", EXPECTED)).toEqual({
      ok: false,
      reason: "malformed",
    });
    const phase = mutateBinding((binding) => {
      (binding.pending as Record<string, unknown>).phase = "automaticRepair";
    });
    expect(parseGooglePhotosSyncBinding(phase, EXPECTED)).toEqual({
      ok: false,
      reason: "unsupportedPendingPhase",
    });
    const unknown = mutateBinding((binding) => {
      binding.extra = true;
    });
    expect(parseGooglePhotosSyncBinding(unknown, EXPECTED)).toEqual({
      ok: false,
      reason: "unknownProperty",
    });
  });

  it("does not serialize forbidden snapshot fields", () => {
    const text = stringifyGooglePhotosSyncBinding(validBinding());
    for (const field of [
      "accessToken",
      "uploadToken",
      "sessionUrl",
      "assetFileId",
      "assetIdentity",
      "projectFolderId",
      "revisionId",
      "rawUrl",
    ]) {
      expect(text).not.toContain(`\"${field}\"`);
    }
  });

  it.each([
    "accessToken",
    "uploadToken",
    "sessionUrl",
    "rawGoogleError",
    "sourceMediaBlob",
  ])("rejects forbidden top-level field %s", (field) => {
    const candidate = mutateBinding((binding) => {
      binding[field] = "forbidden";
    });
    expect(parseGooglePhotosSyncBinding(candidate, EXPECTED)).toEqual({
      ok: false,
      reason: "unknownProperty",
    });
  });
});
