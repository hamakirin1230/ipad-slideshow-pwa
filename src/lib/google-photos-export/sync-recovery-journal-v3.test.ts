import { describe, expect, it } from "vitest";
import { classifyGooglePhotosSyncRecoveryTargets } from "./sync-recovery-plan";
import {
  createGooglePhotosSyncRecoveryJournalV3FromBinding,
  parseGooglePhotosSyncRecoveryJournalV3,
  parseGooglePhotosSyncRecoveryJournalV3Json,
  stringifyGooglePhotosSyncRecoveryJournalV3,
} from "./sync-recovery-journal-v3";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-10-10T00:00:00.000Z";
const OLD_SOURCE = "fixture-source-before-edit";
const CURRENT_SOURCE = "fixture-source-after-edit";

function slideId(index: number) {
  return `fixture-slide-${index}`;
}

function mediaId(index: number) {
  return `fixture-media-${index}`;
}

function renderKey(index: number, suffix = "original") {
  return `fixture-render-${index}-${suffix}`;
}

function bindingFixture() {
  const stableItems = Array.from({ length: 11 }, (_, offset) => {
    const index = offset + 1;
    return {
      slideId: slideId(index),
      renderKey: renderKey(index),
      mediaItemId: mediaId(index),
      snapshot: null,
    };
  });
  const pendingItems = Array.from({ length: 13 }, (_, offset) => {
    const index = offset + 1;
    return {
      slideId: slideId(index),
      renderKey: renderKey(index),
      mediaItemId: mediaId(index),
      snapshot: null,
    };
  });
  return {
    app: "ipad-slideshow-pwa",
    role: "googlePhotosSync",
    schemaVersion: 2,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    album: {
      albumId: "fixture-album",
      createdAt: "2026-10-01T00:00:00.000Z",
      lastKnownTitle: "fixture album",
    },
    stable: {
      generation: 7,
      completedAt: "2026-10-01T00:00:00.000Z",
      rendererVersion: 3,
      items: stableItems,
    },
    pending: {
      operationId: "fixture-pending-operation",
      startedAt: "2026-10-02T00:00:00.000Z",
      phase: "membershipAdding",
      sourceFingerprint: OLD_SOURCE,
      targetTitle: "fixture album",
      previousManagedMediaItemIds: stableItems.map((item) => item.mediaItemId),
      targetItems: pendingItems,
    },
  };
}

function classificationFixture() {
  const binding = bindingFixture();
  const desiredSlides = Array.from({ length: 13 }, (_, offset) => {
    const index = offset + 1;
    return {
      slideId: slideId(index),
      renderKey: index === 12 ? renderKey(index, "caption-edited") : renderKey(index),
      reuseEligible: true,
    };
  });
  const result = classifyGooglePhotosSyncRecoveryTargets({
    desiredSlides,
    stableItems: binding.stable.items.map((item) => ({
      slideId: item.slideId,
      renderKey: item.renderKey,
      mediaItemId: item.mediaItemId,
    })),
    pendingTargetItems: binding.pending.targetItems.map((item) => ({
      slideId: item.slideId,
      renderKey: item.renderKey,
      mediaItemId: item.mediaItemId,
    })),
    albumMediaItemIds: [
      mediaId(13),
      ...Array.from({ length: 12 }, (_, offset) => mediaId(offset + 1)),
    ],
    recoverySourceFingerprint: CURRENT_SOURCE,
    observedSourceFingerprint: CURRENT_SOURCE,
    confirmedPendingMediaItemIds: [mediaId(12), mediaId(13)],
    verifiedSuccessorRelations: [],
    ambiguousCreateSlideIds: [],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("classification fixture failed");
  return result.classifications;
}

function journalFixture(unmanaged = false) {
  const membership = [
    mediaId(13),
    ...Array.from({ length: 12 }, (_, offset) => mediaId(offset + 1)),
  ];
  if (unmanaged) membership.splice(4, 0, "fixture-unmanaged-media");
  const result = createGooglePhotosSyncRecoveryJournalV3FromBinding({
    binding: bindingFixture(),
    expected: { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID },
    recoveryId: "fixture-recovery-stage2a",
    now: NOW,
    recoverySourceFingerprint: CURRENT_SOURCE,
    initialMembershipMediaItemIds: membership,
    confirmedPendingMediaItemIds: [mediaId(12), mediaId(13)],
    orderedTargetSlideIds: Array.from({ length: 13 }, (_, offset) =>
      slideId(offset + 1),
    ),
    classifications: classificationFixture(),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`journal fixture failed: ${result.reason}`);
  return result.journal;
}

describe("Google Photos recovery journal v3", () => {
  it("converts a valid schema-v2 binding without modifying the v2 contract", () => {
    const binding = deepFreeze(bindingFixture());
    const before = structuredClone(binding);
    const converted = createGooglePhotosSyncRecoveryJournalV3FromBinding({
      binding,
      expected: { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID },
      recoveryId: "fixture-recovery-stage2a",
      now: NOW,
      recoverySourceFingerprint: CURRENT_SOURCE,
      initialMembershipMediaItemIds: [
        mediaId(13),
        ...Array.from({ length: 12 }, (_, offset) => mediaId(offset + 1)),
      ],
      confirmedPendingMediaItemIds: [mediaId(12), mediaId(13)],
      orderedTargetSlideIds: Array.from({ length: 13 }, (_, offset) =>
        slideId(offset + 1),
      ),
      classifications: classificationFixture(),
    });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const journal = converted.journal;
    expect(binding).toEqual(before);
    expect(journal).toMatchObject({
      schemaVersion: 3,
      revision: 1,
      phase: "PREFLIGHT",
      baseStableGeneration: 7,
      originalStable: { generation: 7, items: expect.any(Array) },
      originalPending: {
        pendingIdentity: "fixture-pending-operation",
        phase: "membershipAdding",
        sourceFingerprint: OLD_SOURCE,
      },
      recoverySourceFingerprint: CURRENT_SOURCE,
      remotePixelEquality: "unknown",
      canResume: true,
      productionWriteAllowed: false,
      atomicCommitProven: false,
    });
    expect(journal.originalStable?.items).toHaveLength(11);
    expect(journal.originalPending.targetItems).toHaveLength(13);
    expect(journal.mediaCheckpoint.targetIdentities).toEqual([slideId(12)]);
  });

  it("retains and protects unmanaged membership separately", () => {
    const journal = journalFixture(true);
    expect(journal.protectedUnmanagedMediaItemIds).toEqual([
      "fixture-unmanaged-media",
    ]);
  });

  it("round-trips through the strict serializer without exposing write authority", () => {
    const journal = journalFixture();
    const serialized = stringifyGooglePhotosSyncRecoveryJournalV3(journal);
    const parsed = parseGooglePhotosSyncRecoveryJournalV3Json(serialized);
    expect(parsed).toEqual({ ok: true, journal });
    expect(serialized).toContain('"productionWriteAllowed": false');
  });

  it.each([
    ["unknown top-level key", (value: Record<string, unknown>) => (value.extra = true), "UNKNOWN_PROPERTY"],
    ["wrong schema", (value: Record<string, unknown>) => (value.schemaVersion = 2), "UNSUPPORTED_SCHEMA"],
    ["write authority", (value: Record<string, unknown>) => (value.productionWriteAllowed = true), "PRODUCTION_WRITE_AUTHORITY_FORBIDDEN"],
    ["stable loss", (value: Record<string, unknown>) => (value.originalStable = null), "SNAPSHOT_MISMATCH"],
    ["bad phase", (value: Record<string, unknown>) => (value.phase = "complete"), "MALFORMED"],
  ] as const)("rejects %s", (_label, mutate, reason) => {
    const candidate = structuredClone(journalFixture()) as unknown as Record<string, unknown>;
    mutate(candidate);
    expect(parseGooglePhotosSyncRecoveryJournalV3(candidate)).toEqual({
      ok: false,
      reason,
    });
  });

  it("strictly rejects unknown nested checkpoint properties", () => {
    const candidate = structuredClone(journalFixture()) as unknown as {
      mediaCheckpoint: Record<string, unknown>;
    };
    candidate.mediaCheckpoint.extra = true;
    expect(parseGooglePhotosSyncRecoveryJournalV3(candidate)).toEqual({
      ok: false,
      reason: "INVALID_CHECKPOINT",
    });
  });

  it("rejects duplicate target and membership identities", () => {
    const targetDuplicate = structuredClone(journalFixture());
    targetDuplicate.orderedTargetSlideIds[1] = targetDuplicate.orderedTargetSlideIds[0]!;
    expect(parseGooglePhotosSyncRecoveryJournalV3(targetDuplicate)).toEqual({
      ok: false,
      reason: "MALFORMED",
    });

    const membershipDuplicate = structuredClone(journalFixture());
    membershipDuplicate.initialMembershipMediaItemIds.push(
      membershipDuplicate.initialMembershipMediaItemIds[0]!,
    );
    expect(parseGooglePhotosSyncRecoveryJournalV3(membershipDuplicate)).toEqual({
      ok: false,
      reason: "MALFORMED",
    });
  });

  it("rejects invalid or absent v2 pending input with fixed reason codes", () => {
    const invalid = bindingFixture() as unknown as Record<string, unknown>;
    invalid.extra = true;
    expect(
      createGooglePhotosSyncRecoveryJournalV3FromBinding({
        binding: invalid,
        expected: { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID },
        recoveryId: "fixture-recovery-stage2a",
        now: NOW,
        recoverySourceFingerprint: CURRENT_SOURCE,
        initialMembershipMediaItemIds: Array.from({ length: 13 }, (_, offset) =>
          mediaId(offset + 1),
        ),
        confirmedPendingMediaItemIds: [mediaId(12), mediaId(13)],
        orderedTargetSlideIds: Array.from({ length: 13 }, (_, offset) =>
          slideId(offset + 1),
        ),
        classifications: classificationFixture(),
      }),
    ).toEqual({ ok: false, reason: "INVALID_V2_BINDING" });

    const legacy = bindingFixture();
    legacy.schemaVersion = 1;
    expect(
      createGooglePhotosSyncRecoveryJournalV3FromBinding({
        binding: legacy,
        expected: { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID },
        recoveryId: "fixture-recovery-stage2a",
        now: NOW,
        recoverySourceFingerprint: CURRENT_SOURCE,
        initialMembershipMediaItemIds: Array.from({ length: 13 }, (_, offset) =>
          mediaId(offset + 1),
        ),
        confirmedPendingMediaItemIds: [mediaId(12), mediaId(13)],
        orderedTargetSlideIds: Array.from({ length: 13 }, (_, offset) =>
          slideId(offset + 1),
        ),
        classifications: classificationFixture(),
      }),
    ).toEqual({ ok: false, reason: "INVALID_V2_BINDING" });

    const withoutPending = bindingFixture();
    withoutPending.pending = null as never;
    expect(
      createGooglePhotosSyncRecoveryJournalV3FromBinding({
        binding: withoutPending,
        expected: { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID },
        recoveryId: "fixture-recovery-stage2a",
        now: NOW,
        recoverySourceFingerprint: CURRENT_SOURCE,
        initialMembershipMediaItemIds: [],
        confirmedPendingMediaItemIds: [],
        orderedTargetSlideIds: [],
        classifications: [],
      }),
    ).toEqual({ ok: false, reason: "INVALID_V2_BINDING" });
  });

  it("does not leak fixture IDs through fixed parser error reasons", () => {
    const candidate = structuredClone(journalFixture());
    candidate.sourceBinding.pending!.targetItems.push({
      ...candidate.sourceBinding.pending!.targetItems[0]!,
    });
    const result = parseGooglePhotosSyncRecoveryJournalV3(candidate);
    expect(result).toEqual({ ok: false, reason: "INVALID_V2_BINDING" });
    expect(JSON.stringify(result)).not.toContain(mediaId(1));
  });
});

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
