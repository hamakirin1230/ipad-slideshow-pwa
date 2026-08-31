import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  beginGooglePhotosSyncPending,
  bindGooglePhotosSyncCreatedAlbum,
  completeGooglePhotosSyncMembership,
  completeGooglePhotosSyncTitleUpdate,
  finalizeGooglePhotosSyncPending,
  getGooglePhotosSyncExpectedStableGeneration,
  inspectGooglePhotosSyncPendingContinuation,
  recordGooglePhotosSyncCreatedMediaPrepared,
  recordGooglePhotosSyncMediaPrepared,
  skipGooglePhotosSyncMembership,
  transitionGooglePhotosSyncToMembershipAdding,
  transitionGooglePhotosSyncToMembershipRemoving,
  transitionGooglePhotosSyncToMediaCreating,
  type GooglePhotosSyncPendingTransitionResult,
} from "./sync-pending";
import {
  buildEmptyGooglePhotosSyncBinding,
  parseGooglePhotosSyncBinding,
  stringifyGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
  type GooglePhotosSyncManagedItem,
} from "./sync-binding";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const EXPECTED = { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID };
const OPERATION_ID = "operation-current";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const OTHER_FINGERPRINT = `sha256:${"b".repeat(64)}`;
const STARTED_AT = "2026-08-31T01:00:00.000Z";
const COMPLETED_AT = "2026-08-31T01:30:00.000Z";
const TITLE = "夏の作品";
const KEY_A = `sha256:${"c".repeat(64)}`;
const KEY_B = `sha256:${"d".repeat(64)}`;
const SNAPSHOT = {
  mediaKind: "image" as const,
  displayName: "素材.jpg",
  caption: "caption",
  durationMs: 10_000,
};

const TARGET_ITEMS: GooglePhotosSyncManagedItem[] = [
  { slideId: "slide-2", renderKey: KEY_B, mediaItemId: "media-2", snapshot: SNAPSHOT },
  { slideId: "slide-1", renderKey: KEY_A, mediaItemId: "media-1", snapshot: SNAPSHOT },
];

function emptyBinding(): GooglePhotosSyncBinding {
  return buildEmptyGooglePhotosSyncBinding(EXPECTED);
}

function boundBinding(generation = 2): GooglePhotosSyncBinding {
  return {
    ...emptyBinding(),
    album: {
      albumId: "album-existing",
      createdAt: "2026-08-30T01:00:00.000Z",
      lastKnownTitle: "以前の作品",
    },
    stable: {
      generation,
      completedAt: "2026-08-30T01:30:00.000Z",
      rendererVersion: 1,
      items: [
        { slideId: "slide-old-1", renderKey: KEY_A, mediaItemId: "media-old-1", snapshot: null },
        { slideId: "slide-old-2", renderKey: KEY_B, mediaItemId: "media-old-2", snapshot: null },
      ],
    },
  };
}

function begin(binding = boundBinding()): GooglePhotosSyncBinding {
  return success(
    beginGooglePhotosSyncPending({
      binding,
      operationId: OPERATION_ID,
      startedAt: STARTED_AT,
      sourceFingerprint: FINGERPRINT,
      targetTitle: TITLE,
    }),
  );
}

function prepared(binding = begin()): GooglePhotosSyncBinding {
  return success(
    recordGooglePhotosSyncMediaPrepared({
      binding,
      ...guard(),
      targetItems: TARGET_ITEMS,
    }),
  );
}

function mediaCreating(binding = begin()): GooglePhotosSyncBinding {
  return success(
    transitionGooglePhotosSyncToMediaCreating({
      binding,
      ...guard(),
    }),
  );
}

function guard() {
  return {
    expectedOperationId: OPERATION_ID,
    expectedSourceFingerprint: FINGERPRINT,
  };
}

function success(result: GooglePhotosSyncPendingTransitionResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`fixture failed: ${result.reason}`);
  expect(parseGooglePhotosSyncBinding(result.binding, EXPECTED).ok).toBe(true);
  expect(() => stringifyGooglePhotosSyncBinding(result.binding)).not.toThrow();
  return result.binding;
}

describe("Google Photos sync pending begin contract", () => {
  it("begins an unbound sync at creatingAlbum without changing stable generation", () => {
    const input = emptyBinding();
    const result = begin(input);

    expect(result.album).toBeNull();
    expect(result.stable).toBeNull();
    expect(result.pending).toEqual({
      operationId: OPERATION_ID,
      startedAt: STARTED_AT,
      phase: "creatingAlbum",
      sourceFingerprint: FINGERPRINT,
      targetTitle: TITLE,
      previousManagedMediaItemIds: [],
      targetItems: [],
    });
    expect(input.pending).toBeNull();
    expect(getGooglePhotosSyncExpectedStableGeneration(result)).toBe(0);
  });

  it("begins an existing album sync at albumBound and copies stable IDs in order", () => {
    const input = boundBinding();
    const result = begin(input);

    expect(result.pending?.phase).toBe("albumBound");
    expect(result.pending?.previousManagedMediaItemIds).toEqual([
      "media-old-1",
      "media-old-2",
    ]);
    expect(result.pending?.targetItems).toEqual([]);
    expect(result.stable?.generation).toBe(2);
    expect(result.album).toEqual(input.album);
  });

  it("rejects an existing pending operation instead of overwriting it", () => {
    expect(
      beginGooglePhotosSyncPending({
        binding: begin(),
        operationId: "operation-new",
        startedAt: STARTED_AT,
        sourceFingerprint: OTHER_FINGERPRINT,
        targetTitle: "別の作品",
      }),
    ).toEqual({ ok: false, reason: "pendingExists" });
  });

  it("rejects an impossible unbound binding with stable state", () => {
    const input = boundBinding();
    input.album = null;
    expect(
      beginGooglePhotosSyncPending({
        binding: input,
        operationId: OPERATION_ID,
        startedAt: STARTED_AT,
        sourceFingerprint: FINGERPRINT,
        targetTitle: TITLE,
      }),
    ).toEqual({ ok: false, reason: "invalidState" });
  });

  it.each([
    ["blank operation", { operationId: " " }],
    ["untrimmed operation", { operationId: " operation " }],
    ["invalid timestamp", { startedAt: "2026-02-30T01:00:00.000Z" }],
    ["invalid fingerprint", { sourceFingerprint: `sha256:${"A".repeat(64)}` }],
    ["blank title", { targetTitle: "" }],
    ["untrimmed title", { targetTitle: " title " }],
    ["long title", { targetTitle: "あ".repeat(501) }],
  ])("rejects %s", (_label, override) => {
    expect(
      beginGooglePhotosSyncPending({
        binding: emptyBinding(),
        operationId: OPERATION_ID,
        startedAt: STARTED_AT,
        sourceFingerprint: FINGERPRINT,
        targetTitle: TITLE,
        ...override,
      }),
    ).toEqual({ ok: false, reason: "invalidInput" });
  });
});

describe("Google Photos sync created album binding", () => {
  function creatingAlbum() {
    return begin(emptyBinding());
  }

  it("binds an explicitly returned album and advances only to albumBound", () => {
    const input = creatingAlbum();
    const result = success(
      bindGooglePhotosSyncCreatedAlbum({
        binding: input,
        ...guard(),
        albumId: "album-created",
        createdAt: "2026-08-31T01:05:00.000Z",
        lastKnownTitle: TITLE,
      }),
    );

    expect(result.album).toEqual({
      albumId: "album-created",
      createdAt: "2026-08-31T01:05:00.000Z",
      lastKnownTitle: TITLE,
    });
    expect(result.pending?.phase).toBe("albumBound");
    expect(result.pending?.targetItems).toEqual([]);
    expect(result.stable).toBeNull();
  });

  it.each([
    ["staleOperation", { expectedOperationId: "stale-operation" }],
    ["sourceChanged", { expectedSourceFingerprint: OTHER_FINGERPRINT }],
  ])("rejects a %s guard", (reason, override) => {
    expect(
      bindGooglePhotosSyncCreatedAlbum({
        binding: creatingAlbum(),
        ...guard(),
        ...override,
        albumId: "album-created",
        createdAt: "2026-08-31T01:05:00.000Z",
        lastKnownTitle: TITLE,
      }),
    ).toEqual({ ok: false, reason });
  });

  it("rejects the wrong phase, an existing album, and a title mismatch", () => {
    const values = [
      begin(),
      { ...creatingAlbum(), album: boundBinding().album },
    ];
    for (const binding of values) {
      expect(
        bindGooglePhotosSyncCreatedAlbum({
          binding,
          ...guard(),
          albumId: "album-created",
          createdAt: "2026-08-31T01:05:00.000Z",
          lastKnownTitle: TITLE,
        }),
      ).toEqual({ ok: false, reason: "invalidState" });
    }
    expect(
      bindGooglePhotosSyncCreatedAlbum({
        binding: creatingAlbum(),
        ...guard(),
        albumId: "album-created",
        createdAt: "2026-08-31T01:05:00.000Z",
        lastKnownTitle: "別の作品",
      }),
    ).toEqual({ ok: false, reason: "invalidState" });
  });

  it.each([
    [{ albumId: " " }, "invalidInput"],
    [{ createdAt: "not-a-date" }, "invalidInput"],
  ])("rejects invalid album creation input", (override, reason) => {
    expect(
      bindGooglePhotosSyncCreatedAlbum({
        binding: creatingAlbum(),
        ...guard(),
        albumId: "album-created",
        createdAt: "2026-08-31T01:05:00.000Z",
        lastKnownTitle: TITLE,
        ...override,
      }),
    ).toEqual({ ok: false, reason });
  });
});

describe("Google Photos sync media preparation", () => {
  it("keeps the no-create albumBound path for a complete reuse-only mapping", () => {
    const input = begin();
    const result = prepared(input);

    expect(result.pending?.phase).toBe("mediaPrepared");
    expect(result.pending?.targetItems).toEqual(TARGET_ITEMS);
    expect(result.pending?.previousManagedMediaItemIds).toEqual([
      "media-old-1",
      "media-old-2",
    ]);
    expect(result.stable).toEqual(input.stable);
  });

  it.each([
    ["empty", []],
    ["duplicate slide", [TARGET_ITEMS[0]!, { ...TARGET_ITEMS[1]!, slideId: "slide-2" }]],
    ["duplicate media", [TARGET_ITEMS[0]!, { ...TARGET_ITEMS[1]!, mediaItemId: "media-2" }]],
    ["invalid render key", [{ ...TARGET_ITEMS[0]!, renderKey: "render-key" }]],
  ])("rejects %s target items", (_label, targetItems) => {
    expect(
      recordGooglePhotosSyncMediaPrepared({
        binding: begin(),
        ...guard(),
        targetItems,
      }),
    ).toEqual({ ok: false, reason: "invalidTargetItems" });
  });

  it("rejects preparation outside albumBound", () => {
    expect(
      recordGooglePhotosSyncMediaPrepared({
        binding: prepared(),
        ...guard(),
        targetItems: TARGET_ITEMS,
      }),
    ).toEqual({ ok: false, reason: "invalidState" });
  });
});

describe("Google Photos sync media creation ambiguity checkpoint", () => {
  it("advances albumBound to mediaCreating without changing persisted context", () => {
    const input = begin();
    const before = structuredClone(input);
    const result = mediaCreating(input);

    expect(result.pending?.phase).toBe("mediaCreating");
    expect(result.pending?.targetItems).toEqual([]);
    expect(result.pending?.previousManagedMediaItemIds).toEqual(
      input.pending?.previousManagedMediaItemIds,
    );
    expect(result.album).toEqual(input.album);
    expect(result.stable).toEqual(input.stable);
    expect(result.stable?.generation).toBe(2);
    expect(input).toEqual(before);
  });

  it.each([
    ["staleOperation", { expectedOperationId: "old-operation" }],
    ["sourceChanged", { expectedSourceFingerprint: OTHER_FINGERPRINT }],
  ])("fails closed with %s before mediaCreating", (reason, override) => {
    expect(
      transitionGooglePhotosSyncToMediaCreating({
        binding: begin(),
        ...guard(),
        ...override,
      }),
    ).toEqual({ ok: false, reason });
  });

  it("allows only albumBound to enter mediaCreating and forbids backward replay", () => {
    expect(
      transitionGooglePhotosSyncToMediaCreating({ binding: prepared(), ...guard() }),
    ).toEqual({ ok: false, reason: "invalidState" });
    expect(
      transitionGooglePhotosSyncToMediaCreating({ binding: mediaCreating(), ...guard() }),
    ).toEqual({ ok: false, reason: "invalidState" });
  });

  it("records complete ordered created media IDs only from mediaCreating", () => {
    const input = mediaCreating();
    const result = success(
      recordGooglePhotosSyncCreatedMediaPrepared({
        binding: input,
        ...guard(),
        targetItems: TARGET_ITEMS,
      }),
    );
    expect(result.pending?.phase).toBe("mediaPrepared");
    expect(result.pending?.targetItems).toEqual(TARGET_ITEMS);
    expect(result.pending?.previousManagedMediaItemIds).toEqual(
      input.pending?.previousManagedMediaItemIds,
    );
    expect(result.album).toEqual(input.album);
    expect(result.stable).toEqual(input.stable);
    expect(result.stable?.generation).toBe(2);
  });

  it.each([
    ["empty", []],
    ["duplicate slide", [TARGET_ITEMS[0]!, { ...TARGET_ITEMS[1]!, slideId: "slide-2" }]],
    ["duplicate media", [TARGET_ITEMS[0]!, { ...TARGET_ITEMS[1]!, mediaItemId: "media-2" }]],
    ["invalid render key", [{ ...TARGET_ITEMS[0]!, renderKey: "render-key" }]],
  ])("rejects %s created target items", (_label, targetItems) => {
    expect(
      recordGooglePhotosSyncCreatedMediaPrepared({
        binding: mediaCreating(),
        ...guard(),
        targetItems,
      }),
    ).toEqual({ ok: false, reason: "invalidTargetItems" });
  });

  it("keeps no-create and created-media preparation paths distinct", () => {
    expect(
      recordGooglePhotosSyncMediaPrepared({
        binding: mediaCreating(),
        ...guard(),
        targetItems: TARGET_ITEMS,
      }),
    ).toEqual({ ok: false, reason: "invalidState" });
    expect(
      recordGooglePhotosSyncCreatedMediaPrepared({
        binding: begin(),
        ...guard(),
        targetItems: TARGET_ITEMS,
      }),
    ).toEqual({ ok: false, reason: "invalidState" });
  });

  it("cannot skip mediaPrepared or enter membership/title/finalizing phases", () => {
    const input = mediaCreating();
    expect(
      transitionGooglePhotosSyncToMembershipRemoving({ binding: input, ...guard() }),
    ).toEqual({ ok: false, reason: "invalidState" });
    expect(
      transitionGooglePhotosSyncToMembershipAdding({ binding: input, ...guard() }),
    ).toEqual({ ok: false, reason: "invalidState" });
    expect(
      skipGooglePhotosSyncMembership({
        binding: input,
        ...guard(),
        titleNeedsUpdate: true,
      }),
    ).toEqual({ ok: false, reason: "invalidState" });
    expect(
      skipGooglePhotosSyncMembership({
        binding: input,
        ...guard(),
        titleNeedsUpdate: false,
      }),
    ).toEqual({ ok: false, reason: "invalidState" });
    expect(
      completeGooglePhotosSyncTitleUpdate({ binding: input, ...guard() }),
    ).toEqual({ ok: false, reason: "invalidState" });
  });

  it.each(["album", "targetItems", "previousIds"] as const)(
    "rejects malformed mediaCreating logical state: %s",
    (change) => {
      const malformed = mediaCreating();
      if (change === "album") malformed.album = null;
      if (change === "targetItems") {
        malformed.pending!.targetItems = structuredClone(TARGET_ITEMS);
      }
      if (change === "previousIds") {
        malformed.pending!.previousManagedMediaItemIds.reverse();
      }
      expect(
        inspectGooglePhotosSyncPendingContinuation({ binding: malformed, ...guard() }),
      ).toEqual({ ok: false, reason: "invalidState" });
    },
  );

  it("classifies mediaCreating for manual continuation without repair", () => {
    const input = mediaCreating();
    expect(
      inspectGooglePhotosSyncPendingContinuation({
        binding: input,
        ...guard(),
        expectedTargetTitle: TITLE,
      }),
    ).toEqual({ ok: true, phase: "mediaCreating" });
    expect(
      inspectGooglePhotosSyncPendingContinuation({
        binding: input,
        expectedOperationId: "stale-operation",
        expectedSourceFingerprint: FINGERPRINT,
      }),
    ).toEqual({ ok: false, reason: "staleOperation" });
    expect(
      inspectGooglePhotosSyncPendingContinuation({
        binding: input,
        expectedOperationId: OPERATION_ID,
        expectedSourceFingerprint: OTHER_FINGERPRINT,
      }),
    ).toEqual({ ok: false, reason: "sourceChanged" });
    expect(input.pending?.phase).toBe("mediaCreating");
  });
});

describe("Google Photos sync phase graph", () => {
  it("supports the membership rebuild path and title update", () => {
    const removing = success(
      transitionGooglePhotosSyncToMembershipRemoving({
        binding: prepared(),
        ...guard(),
      }),
    );
    expect(removing.pending?.phase).toBe("membershipRemoving");
    const adding = success(
      transitionGooglePhotosSyncToMembershipAdding({ binding: removing, ...guard() }),
    );
    expect(adding.pending?.phase).toBe("membershipAdding");
    const title = success(
      completeGooglePhotosSyncMembership({
        binding: adding,
        ...guard(),
        titleNeedsUpdate: true,
      }),
    );
    expect(title.pending?.phase).toBe("titleUpdating");
    expect(
      success(completeGooglePhotosSyncTitleUpdate({ binding: title, ...guard() }))
        .pending?.phase,
    ).toBe("finalizing");
  });

  it("supports membership rebuild without title update", () => {
    const removing = success(
      transitionGooglePhotosSyncToMembershipRemoving({ binding: prepared(), ...guard() }),
    );
    const adding = success(
      transitionGooglePhotosSyncToMembershipAdding({ binding: removing, ...guard() }),
    );
    expect(
      success(
        completeGooglePhotosSyncMembership({
          binding: adding,
          ...guard(),
          titleNeedsUpdate: false,
        }),
      ).pending?.phase,
    ).toBe("finalizing");
  });

  it.each([
    [true, "titleUpdating"],
    [false, "finalizing"],
  ])("skips membership work only to the required next phase", (titleNeedsUpdate, phase) => {
    expect(
      success(
        skipGooglePhotosSyncMembership({
          binding: prepared(),
          ...guard(),
          titleNeedsUpdate,
        }),
      ).pending?.phase,
    ).toBe(phase);
  });

  it("rejects backward transitions and arbitrary phase jumps", () => {
    expect(
      transitionGooglePhotosSyncToMembershipAdding({ binding: prepared(), ...guard() }),
    ).toEqual({ ok: false, reason: "invalidState" });
    const finalizing = success(
      skipGooglePhotosSyncMembership({
        binding: prepared(),
        ...guard(),
        titleNeedsUpdate: false,
      }),
    );
    expect(
      transitionGooglePhotosSyncToMembershipRemoving({ binding: finalizing, ...guard() }),
    ).toEqual({ ok: false, reason: "invalidState" });
    expect(
      completeGooglePhotosSyncTitleUpdate({ binding: prepared(), ...guard() }),
    ).toEqual({ ok: false, reason: "invalidState" });
  });

  it("preserves pending mappings across every phase transition", () => {
    const initial = prepared();
    const removing = success(
      transitionGooglePhotosSyncToMembershipRemoving({ binding: initial, ...guard() }),
    );
    const adding = success(
      transitionGooglePhotosSyncToMembershipAdding({ binding: removing, ...guard() }),
    );
    const finalizing = success(
      completeGooglePhotosSyncMembership({
        binding: adding,
        ...guard(),
        titleNeedsUpdate: false,
      }),
    );
    for (const binding of [removing, adding, finalizing]) {
      expect(binding.pending?.targetItems).toEqual(initial.pending?.targetItems);
      expect(binding.pending?.previousManagedMediaItemIds).toEqual(
        initial.pending?.previousManagedMediaItemIds,
      );
    }
  });
});

describe("Google Photos sync continuation guard", () => {
  it("accepts the current operation, fingerprint, and optional title", () => {
    expect(
      inspectGooglePhotosSyncPendingContinuation({
        binding: prepared(),
        ...guard(),
        expectedTargetTitle: TITLE,
      }),
    ).toEqual({ ok: true, phase: "mediaPrepared" });
  });

  it.each([
    ["staleOperation", { expectedOperationId: "old-operation" }],
    ["sourceChanged", { expectedSourceFingerprint: OTHER_FINGERPRINT }],
    ["sourceChanged", { expectedTargetTitle: "renamed" }],
  ])("fails closed with %s", (reason, override) => {
    expect(
      inspectGooglePhotosSyncPendingContinuation({
        binding: prepared(),
        ...guard(),
        ...override,
      }),
    ).toEqual({ ok: false, reason });
  });

  it("rejects no pending and malformed logical phase state", () => {
    expect(
      inspectGooglePhotosSyncPendingContinuation({ binding: boundBinding(), ...guard() }),
    ).toEqual({ ok: false, reason: "noPending" });

    const malformed = prepared();
    malformed.pending!.phase = "albumBound";
    expect(
      inspectGooglePhotosSyncPendingContinuation({ binding: malformed, ...guard() }),
    ).toEqual({ ok: false, reason: "invalidState" });
  });

  it("rejects a pending previous-ID list that no longer matches stable state", () => {
    const malformed = prepared();
    malformed.pending!.previousManagedMediaItemIds.reverse();
    expect(
      inspectGooglePhotosSyncPendingContinuation({ binding: malformed, ...guard() }),
    ).toEqual({ ok: false, reason: "invalidState" });
  });
});

describe("Google Photos sync finalization", () => {
  function finalizing(binding = prepared()) {
    return success(
      skipGooglePhotosSyncMembership({
        binding,
        ...guard(),
        titleNeedsUpdate: false,
      }),
    );
  }

  it("creates generation one and keeps exact target order for a first sync", () => {
    const created = success(
      bindGooglePhotosSyncCreatedAlbum({
        binding: begin(emptyBinding()),
        ...guard(),
        albumId: "album-created",
        createdAt: "2026-08-31T01:05:00.000Z",
        lastKnownTitle: TITLE,
      }),
    );
    const result = success(
      finalizeGooglePhotosSyncPending({
        binding: finalizing(prepared(created)),
        ...guard(),
        completedAt: COMPLETED_AT,
        rendererVersion: 3,
      }),
    );
    expect(result.stable).toEqual({
      generation: 1,
      completedAt: COMPLETED_AT,
      rendererVersion: 3,
      items: TARGET_ITEMS,
    });
    expect(result.pending).toBeNull();
  });

  it("increments stable generation only at finalization and updates known title", () => {
    const before = finalizing();
    expect(before.stable?.generation).toBe(2);
    const result = success(
      finalizeGooglePhotosSyncPending({
        binding: before,
        ...guard(),
        completedAt: COMPLETED_AT,
        rendererVersion: 2,
      }),
    );
    expect(result.stable?.generation).toBe(3);
    expect(result.stable?.items).toEqual(TARGET_ITEMS);
    expect(result.album?.lastKnownTitle).toBe(TITLE);
    expect(result.album?.albumId).toBe("album-existing");
    expect(result.pending).toBeNull();
    expect(
      finalizeGooglePhotosSyncPending({
        binding: result,
        ...guard(),
        completedAt: COMPLETED_AT,
        rendererVersion: 2,
      }),
    ).toEqual({ ok: false, reason: "noPending" });
  });

  it("fails closed on generation overflow", () => {
    expect(
      finalizeGooglePhotosSyncPending({
        binding: finalizing(prepared(begin(boundBinding(Number.MAX_SAFE_INTEGER)))),
        ...guard(),
        completedAt: COMPLETED_AT,
        rendererVersion: 1,
      }),
    ).toEqual({ ok: false, reason: "generationOverflow" });
  });
});

describe("Google Photos sync pending immutability and security", () => {
  it("does not mutate or alias input binding and item arrays", () => {
    const binding = begin();
    const before = structuredClone(binding);
    const targetItems = structuredClone(TARGET_ITEMS);
    const result = success(
      recordGooglePhotosSyncMediaPrepared({
        binding,
        ...guard(),
        targetItems,
      }),
    );

    expect(binding).toEqual(before);
    expect(result).not.toBe(binding);
    expect(result.album).not.toBe(binding.album);
    expect(result.stable).not.toBe(binding.stable);
    expect(result.stable?.items).not.toBe(binding.stable?.items);
    expect(result.pending).not.toBe(binding.pending);
    expect(result.pending?.previousManagedMediaItemIds).not.toBe(
      binding.pending?.previousManagedMediaItemIds,
    );
    targetItems[0]!.mediaItemId = "changed-after-call";
    binding.pending!.previousManagedMediaItemIds[0] = "changed-input";
    expect(result.pending?.targetItems[0]?.mediaItemId).toBe("media-2");
    expect(result.pending?.previousManagedMediaItemIds[0]).toBe("media-old-1");
  });

  it("returns safe categorical failures without identifiers or hashes", () => {
    const result = inspectGooglePhotosSyncPendingContinuation({
      binding: prepared(),
      expectedOperationId: "secret-operation-id",
      expectedSourceFingerprint: OTHER_FINGERPRINT,
    });
    expect(result).toEqual({ ok: false, reason: "staleOperation" });
    expect(JSON.stringify(result)).not.toMatch(/secret-operation|sha256:|media-|album-/);
  });

  it("contains no network, credential, browser storage, logging, or timer code", () => {
    const source = readFileSync(new URL("./sync-pending.ts", import.meta.url), "utf8");
    for (const forbidden of [
      /\bfetch\s*\(/,
      /accessToken/,
      /Authorization/,
      /localStorage/,
      /sessionStorage/,
      /indexedDB/,
      /document\.cookie/,
      /console\.(?:log|error|warn)/,
      /setTimeout/,
      /https?:\/\//,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });
});
