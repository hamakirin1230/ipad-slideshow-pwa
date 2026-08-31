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
        },
        {
          slideId: "slide-2",
          renderKey: "render-2",
          mediaItemId: "media-2",
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
        },
        {
          slideId: "slide-3",
          renderKey: "render-3",
          mediaItemId: "media-3",
        },
      ],
    },
  };
}

function mutateBinding(
  mutate: (value: Record<string, unknown>) => void,
): unknown {
  const value = JSON.parse(JSON.stringify(validBinding())) as Record<
    string,
    unknown
  >;
  mutate(value);
  return value;
}

describe("Google Photos sync binding schema v1", () => {
  it("accepts an empty unbound body and round-trips canonical JSON", () => {
    const binding = buildEmptyGooglePhotosSyncBinding(EXPECTED);
    const text = stringifyGooglePhotosSyncBinding(binding);

    expect(parseGooglePhotosSyncBindingJson(text, EXPECTED)).toEqual({
      ok: true,
      value: binding,
    });
    expect(text.endsWith("\n")).toBe(true);
  });

  it("accepts album, stable mapping, and every supported pending phase", () => {
    for (const phase of GOOGLE_PHOTOS_SYNC_PENDING_PHASES) {
      const binding = validBinding();
      binding.pending!.phase = phase;
      expect(parseGooglePhotosSyncBinding(binding, EXPECTED)).toEqual({
        ok: true,
        value: binding,
      });
    }
  });

  it("places mediaCreating between albumBound and mediaPrepared in schema v1", () => {
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
    const binding = validBinding();
    binding.pending = {
      ...binding.pending!,
      phase: "mediaCreating",
      targetItems: [],
    };
    const text = stringifyGooglePhotosSyncBinding(binding);
    expect(parseGooglePhotosSyncBindingJson(text, EXPECTED)).toEqual({
      ok: true,
      value: binding,
    });
    expect(binding.schemaVersion).toBe(1);
    expect(Object.keys(binding.pending).sort()).toEqual([
      "operationId",
      "phase",
      "previousManagedMediaItemIds",
      "sourceFingerprint",
      "startedAt",
      "targetItems",
      "targetTitle",
    ]);
  });

  it.each([
    ["schemaVersion", 2, "schemaVersionMismatch"],
    ["app", "other-app", "appMismatch"],
    ["role", "other-role", "roleMismatch"],
    ["workspaceId", "33333333-3333-4333-8333-333333333333", "workspaceMismatch"],
    ["projectId", "44444444-4444-4444-8444-444444444444", "projectMismatch"],
  ])("rejects invalid top-level %s", (key, value, reason) => {
    const input = mutateBinding((binding) => {
      binding[key] = value;
    });
    expect(parseGooglePhotosSyncBinding(input, EXPECTED)).toEqual({
      ok: false,
      reason,
    });
  });

  it("rejects invalid timestamps", () => {
    const input = mutateBinding((binding) => {
      (binding.album as Record<string, unknown>).createdAt = "not-a-date";
    });
    expect(parseGooglePhotosSyncBinding(input, EXPECTED)).toEqual({
      ok: false,
      reason: "invalidTimestamp",
    });

    const impossibleDate = mutateBinding((binding) => {
      (binding.album as Record<string, unknown>).createdAt =
        "2026-02-30T01:00:00.000Z";
    });
    expect(parseGooglePhotosSyncBinding(impossibleDate, EXPECTED)).toEqual({
      ok: false,
      reason: "invalidTimestamp",
    });
  });

  it.each([
    ["generation", 0, "invalidGeneration"],
    ["rendererVersion", -1, "invalidRendererVersion"],
  ])("rejects invalid stable %s", (key, value, reason) => {
    const input = mutateBinding((binding) => {
      (binding.stable as Record<string, unknown>)[key] = value;
    });
    expect(parseGooglePhotosSyncBinding(input, EXPECTED)).toEqual({
      ok: false,
      reason,
    });
  });

  it.each([
    ["slideId", "slide-1", "duplicateSlideId"],
    ["mediaItemId", "media-1", "duplicateMediaItemId"],
  ])("rejects duplicate stable %s", (key, value, reason) => {
    const input = mutateBinding((binding) => {
      const items = (binding.stable as Record<string, unknown>).items as Array<
        Record<string, unknown>
      >;
      items[1]![key] = value;
    });
    expect(parseGooglePhotosSyncBinding(input, EXPECTED)).toEqual({
      ok: false,
      reason,
    });
  });

  it.each([
    ["slideId", "slide-1", "duplicateSlideId"],
    ["mediaItemId", "media-1", "duplicateMediaItemId"],
  ])("rejects duplicate pending target %s", (key, value, reason) => {
    const input = mutateBinding((binding) => {
      const items = (binding.pending as Record<string, unknown>)
        .targetItems as Array<Record<string, unknown>>;
      items[1]![key] = value;
    });
    expect(parseGooglePhotosSyncBinding(input, EXPECTED)).toEqual({
      ok: false,
      reason,
    });
  });

  it("rejects an unsupported pending phase", () => {
    const input = mutateBinding((binding) => {
      (binding.pending as Record<string, unknown>).phase = "automaticRepair";
    });
    expect(parseGooglePhotosSyncBinding(input, EXPECTED)).toEqual({
      ok: false,
      reason: "unsupportedPendingPhase",
    });
  });

  it("rejects malformed objects, arrays, empty identifiers, and unknown fields", () => {
    expect(parseGooglePhotosSyncBindingJson("{", EXPECTED)).toEqual({
      ok: false,
      reason: "malformed",
    });
    const malformedArray = mutateBinding((binding) => {
      (binding.stable as Record<string, unknown>).items = {};
    });
    expect(parseGooglePhotosSyncBinding(malformedArray, EXPECTED)).toEqual({
      ok: false,
      reason: "malformed",
    });
    const emptyId = mutateBinding((binding) => {
      (binding.album as Record<string, unknown>).albumId = "";
    });
    expect(parseGooglePhotosSyncBinding(emptyId, EXPECTED)).toEqual({
      ok: false,
      reason: "malformed",
    });
    const unknown = mutateBinding((binding) => {
      binding.extra = true;
    });
    expect(parseGooglePhotosSyncBinding(unknown, EXPECTED)).toEqual({
      ok: false,
      reason: "unknownProperty",
    });
  });

  it.each([
    "accessToken",
    "uploadToken",
    "sessionUrl",
    "resumableOffset",
    "rawGoogleError",
    "oauthResponse",
    "productUrl",
    "renderedBlob",
    "sourceMediaBlob",
  ])("does not admit forbidden field %s", (field) => {
    const input = mutateBinding((binding) => {
      binding[field] = "forbidden";
    });
    expect(parseGooglePhotosSyncBinding(input, EXPECTED)).toEqual({
      ok: false,
      reason: "unknownProperty",
    });
    expect(stringifyGooglePhotosSyncBinding(validBinding())).not.toContain(
      `"${field}"`,
    );
  });
});
