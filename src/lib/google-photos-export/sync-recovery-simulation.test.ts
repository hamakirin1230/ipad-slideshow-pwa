import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyGooglePhotosSyncRecoveryTargets } from "./sync-recovery-plan";
import {
  createGooglePhotosSyncRecoveryJournalV3FromBinding,
  parseGooglePhotosSyncRecoveryJournalV3Json,
  stringifyGooglePhotosSyncRecoveryJournalV3,
  type GooglePhotosSyncRecoveryJournalV3,
} from "./sync-recovery-journal-v3";
import {
  advanceGooglePhotosSyncRecoverySimulation,
  createInMemoryGooglePhotosSyncRecoveryJournalStore,
  inspectGooglePhotosSyncRecoveryConflicts,
  type GooglePhotosSyncRecoverySimulationEvent,
} from "./sync-recovery-simulation";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OLD_SOURCE = "fixture-source-before-edit";
const CURRENT_SOURCE = "fixture-source-after-edit";
const INITIAL_TIME = "2026-10-10T00:00:00.000Z";

const slideId = (index: number) => `fixture-slide-${index}`;
const mediaId = (index: number) => `fixture-media-${index}`;
const renderKey = (index: number, suffix = "original") =>
  `fixture-render-${index}-${suffix}`;

function bindingFixture() {
  const stableItems = Array.from({ length: 11 }, (_, offset) => ({
    slideId: slideId(offset + 1),
    renderKey: renderKey(offset + 1),
    mediaItemId: mediaId(offset + 1),
    snapshot: null,
  }));
  const pendingItems = Array.from({ length: 13 }, (_, offset) => ({
    slideId: slideId(offset + 1),
    renderKey: renderKey(offset + 1),
    mediaItemId: mediaId(offset + 1),
    snapshot: null,
  }));
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

function journalFixture() {
  const binding = bindingFixture();
  const membership = [
    mediaId(13),
    mediaId(1),
    mediaId(2),
    "fixture-unmanaged-media",
    ...Array.from({ length: 10 }, (_, offset) => mediaId(offset + 3)),
  ];
  const classified = classifyGooglePhotosSyncRecoveryTargets({
    desiredSlides: Array.from({ length: 13 }, (_, offset) => ({
      slideId: slideId(offset + 1),
      renderKey:
        offset + 1 === 12
          ? renderKey(offset + 1, "caption-edited")
          : renderKey(offset + 1),
      reuseEligible: true,
    })),
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
    albumMediaItemIds: membership.filter((id) => id !== "fixture-unmanaged-media"),
    recoverySourceFingerprint: CURRENT_SOURCE,
    observedSourceFingerprint: CURRENT_SOURCE,
    confirmedPendingMediaItemIds: [mediaId(12), mediaId(13)],
    verifiedSuccessorRelations: [],
    ambiguousCreateSlideIds: [],
  });
  expect(classified.ok).toBe(true);
  if (!classified.ok) throw new Error("classification fixture failed");
  const result = createGooglePhotosSyncRecoveryJournalV3FromBinding({
    binding,
    expected: { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID },
    recoveryId: "fixture-recovery-stage2a",
    now: INITIAL_TIME,
    recoverySourceFingerprint: CURRENT_SOURCE,
    initialMembershipMediaItemIds: membership,
    confirmedPendingMediaItemIds: [mediaId(12), mediaId(13)],
    orderedTargetSlideIds: Array.from({ length: 13 }, (_, offset) =>
      slideId(offset + 1),
    ),
    classifications: classified.classifications,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("journal fixture failed");
  return result.journal;
}

let tick = 0;
function advance(
  journal: GooglePhotosSyncRecoveryJournalV3,
  event: GooglePhotosSyncRecoverySimulationEvent,
) {
  tick += 1;
  return advanceGooglePhotosSyncRecoverySimulation({
    journal,
    expectedRevision: journal.revision,
    now: `2026-10-10T00:00:${String(tick).padStart(2, "0")}.000Z`,
    event,
  });
}

function advanceOk(
  journal: GooglePhotosSyncRecoveryJournalV3,
  event: GooglePhotosSyncRecoverySimulationEvent,
) {
  const result = advance(journal, event);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`simulation transition failed: ${result.reason}`);
  return result.journal;
}

function toMediaCreating() {
  let journal = journalFixture();
  journal = advanceOk(journal, { type: "PREFLIGHT_CONFIRMED" });
  journal = advanceOk(journal, { type: "MEDIA_PREPARED" });
  return advanceOk(journal, { type: "MEDIA_STARTED" });
}

function createdItem() {
  return { slideId: slideId(12), mediaItemId: "fixture-created-media-12" };
}

function finalMembership() {
  return [
    mediaId(1),
    mediaId(2),
    "fixture-unmanaged-media",
    ...Array.from({ length: 9 }, (_, offset) => mediaId(offset + 3)),
    "fixture-created-media-12",
    mediaId(13),
  ];
}

describe("Google Photos Stage 2A local recovery simulation", () => {
  it("restarts from serialized journal and reaches only a local final candidate", () => {
    let journal = toMediaCreating();
    const restarted = parseGooglePhotosSyncRecoveryJournalV3Json(
      stringifyGooglePhotosSyncRecoveryJournalV3(journal),
    );
    expect(restarted.ok).toBe(true);
    if (!restarted.ok) return;
    journal = advanceOk(restarted.journal, {
      type: "MEDIA_VERIFIED",
      createdItems: [createdItem()],
      proof: "direct_response",
    });
    journal = advanceOk(journal, { type: "MEMBERSHIP_PREPARED" });
    journal = advanceOk(journal, { type: "MEMBERSHIP_STARTED" });
    journal = advanceOk(journal, {
      type: "MEMBERSHIP_VERIFIED",
      observedMediaItemIds: finalMembership(),
      proof: "direct_response",
    });
    journal = advanceOk(journal, {
      type: "FINAL_VERIFY",
      observedMediaItemIds: finalMembership(),
    });
    expect(journal).toMatchObject({
      phase: "FINAL_READY",
      finalCandidate: { status: "final_candidate" },
      productionWriteAllowed: false,
      atomicCommitProven: false,
      sourceBinding: {
        stable: { generation: 7 },
        pending: { operationId: "fixture-pending-operation" },
      },
    });
    expect(journal.expectedTargetMediaItemIds).toHaveLength(13);
    expect(journal.finalCandidate.observedMembershipMediaItemIds).toEqual(
      finalMembership(),
    );
  });

  it("does not turn response loss into an automatic media-create replay", () => {
    let journal = toMediaCreating();
    journal = advanceOk(journal, { type: "MEDIA_RESULT_UNKNOWN" });
    expect(journal).toMatchObject({
      phase: "RECOVERY_REQUIRED",
      stopReason: "MEDIA_CREATION_RESULT_UNKNOWN",
      mediaCheckpoint: {
        status: "result_unknown",
        automaticRetryAllowed: false,
      },
      canResume: false,
    });
    expect(
      advance(journal, {
        type: "MEDIA_VERIFIED",
        createdItems: [createdItem()],
        proof: "direct_response",
      }),
    ).toEqual({ ok: false, reason: "CHECKPOINT_REJECTED" });
    journal = advanceOk(journal, {
      type: "MEDIA_REMOTE_REVERIFICATION_REQUIRED",
    });
    expect(journal.canResume).toBe(true);
    journal = advanceOk(journal, {
      type: "MEDIA_VERIFIED",
      createdItems: [createdItem()],
      proof: "remote_snapshot",
    });
    expect(journal.phase).toBe("MEDIA_VERIFIED");
  });

  it("persists partial media evidence but prohibits an unsafe retry", () => {
    const journal = toMediaCreating();
    expect(
      advance(journal, { type: "MEDIA_PARTIAL", createdItems: [] }),
    ).toEqual({ ok: false, reason: "INVALID_RESULT_SET" });
    expect(
      advance(journal, {
        type: "MEDIA_VERIFIED",
        createdItems: [{ ...createdItem(), mediaItemId: mediaId(1) }],
        proof: "direct_response",
      }),
    ).toEqual({ ok: false, reason: "INVALID_RESULT_SET" });
  });

  it("rejects wrong order, missing unmanaged media, and unexpected extras", () => {
    let journal = toMediaCreating();
    journal = advanceOk(journal, {
      type: "MEDIA_VERIFIED",
      createdItems: [createdItem()],
      proof: "direct_response",
    });
    journal = advanceOk(journal, { type: "MEMBERSHIP_PREPARED" });
    journal = advanceOk(journal, { type: "MEMBERSHIP_STARTED" });

    const reversed = [...finalMembership()].reverse();
    expect(
      advance(journal, {
        type: "MEMBERSHIP_VERIFIED",
        observedMediaItemIds: reversed,
        proof: "direct_response",
      }),
    ).toEqual({ ok: false, reason: "INVALID_RESULT_SET" });
    expect(
      advance(journal, {
        type: "MEMBERSHIP_VERIFIED",
        observedMediaItemIds: finalMembership().filter(
          (id) => id !== "fixture-unmanaged-media",
        ),
        proof: "direct_response",
      }),
    ).toEqual({ ok: false, reason: "INVALID_RESULT_SET" });
    expect(
      advance(journal, {
        type: "MEMBERSHIP_VERIFIED",
        observedMediaItemIds: [...finalMembership(), "fixture-unexpected-extra"],
        proof: "direct_response",
      }),
    ).toEqual({ ok: false, reason: "INVALID_RESULT_SET" });
  });

  it("rejects stale journal revisions", () => {
    const journal = journalFixture();
    expect(
      advanceGooglePhotosSyncRecoverySimulation({
        journal,
        expectedRevision: journal.revision - 1,
        now: INITIAL_TIME,
        event: { type: "PREFLIGHT_CONFIRMED" },
      }),
    ).toEqual({ ok: false, reason: "STALE_JOURNAL_REVISION" });
  });
});

describe("Stage 2A in-memory CAS and conflict guards", () => {
  it("models pre-commit failure without changing the stored journal", () => {
    const store = createInMemoryGooglePhotosSyncRecoveryJournalStore();
    const initial = journalFixture();
    expect(store.initialize(initial)).toEqual({ ok: true });
    const next = advanceOk(initial, { type: "PREFLIGHT_CONFIRMED" });
    expect(
      store.compareAndSwap({
        recoveryId: initial.recoveryId,
        expectedRevision: initial.revision,
        nextJournal: next,
        writerId: "device-a",
        fault: "fail_before_commit",
      }),
    ).toEqual({ outcome: "rejected", reason: "STORE_FAILURE" });
    expect(store.read(initial.recoveryId)?.revision).toBe(initial.revision);
  });

  it("models response loss after commit and resolves it by read, not replay", () => {
    const store = createInMemoryGooglePhotosSyncRecoveryJournalStore();
    const initial = journalFixture();
    store.initialize(initial);
    const next = advanceOk(initial, { type: "PREFLIGHT_CONFIRMED" });
    expect(
      store.compareAndSwap({
        recoveryId: initial.recoveryId,
        expectedRevision: initial.revision,
        nextJournal: next,
        writerId: "device-a",
        fault: "lose_response_after_commit",
      }),
    ).toEqual({ outcome: "commit_result_unknown" });
    expect(store.read(initial.recoveryId)?.revision).toBe(next.revision);
    expect(
      store.compareAndSwap({
        recoveryId: initial.recoveryId,
        expectedRevision: initial.revision,
        nextJournal: next,
        writerId: "device-a",
      }),
    ).toEqual({ outcome: "rejected", reason: "REVISION_CONFLICT" });
  });

  it("allows only one of two device writers at the same revision", () => {
    const store = createInMemoryGooglePhotosSyncRecoveryJournalStore();
    const initial = journalFixture();
    store.initialize(initial);
    const next = advanceOk(initial, { type: "PREFLIGHT_CONFIRMED" });
    expect(
      store.compareAndSwap({
        recoveryId: initial.recoveryId,
        expectedRevision: initial.revision,
        nextJournal: next,
        writerId: "device-a",
      }).outcome,
    ).toBe("committed");
    expect(
      store.compareAndSwap({
        recoveryId: initial.recoveryId,
        expectedRevision: initial.revision,
        nextJournal: next,
        writerId: "device-b",
      }),
    ).toEqual({ outcome: "rejected", reason: "REVISION_CONFLICT" });
  });

  it("fails closed on recovery, source, stable, pending, membership, and concurrency drift", () => {
    const journal = journalFixture();
    const inspection = inspectGooglePhotosSyncRecoveryConflicts({
      journal,
      observedRecoveryId: "other-recovery",
      observedSourceFingerprint: "changed-source",
      observedStableGeneration: journal.baseStableGeneration + 1,
      observedPendingIdentity: "other-pending",
      expectedMembershipMediaItemIds: journal.initialMembershipMediaItemIds,
      observedMembershipMediaItemIds: ["changed-membership"],
      concurrentOperationDetected: true,
    });
    expect(inspection).toEqual({
      conflicts: [
        "RECOVERY_ID_MISMATCH",
        "SOURCE_DRIFT",
        "STABLE_CHANGED",
        "PENDING_CHANGED",
        "MEMBERSHIP_DRIFT",
        "CONCURRENT_OPERATION",
      ],
      simulationMayContinue: false,
      productionWriteAllowed: false,
      atomicCommitProven: false,
    });
  });

  it("does not import API clients, emit logs, or accept credential fields", () => {
    const sources = [
      "sync-recovery-journal-v3.ts",
      "sync-recovery-checkpoint.ts",
      "sync-recovery-simulation.ts",
    ].map((file) =>
      readFileSync(new URL(`./${file}`, import.meta.url), "utf8"),
    );
    for (const source of sources) {
      expect(source).not.toMatch(/from ["'].+library-api/);
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/\bconsole\./);
      expect(source).not.toMatch(/accessToken|refreshToken|authorizationHeader/);
    }
  });
});
