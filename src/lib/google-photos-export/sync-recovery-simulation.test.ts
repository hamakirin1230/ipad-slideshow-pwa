import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyGooglePhotosSyncRecoveryTargets } from "./sync-recovery-plan";
import {
  createGooglePhotosSyncRecoveryJournalV3FromBinding,
  parseGooglePhotosSyncRecoveryJournalV3,
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
    now: new Date(Date.parse(INITIAL_TIME) + tick * 1_000).toISOString(),
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

function finalReadyJournal() {
  let journal = toMediaCreating();
  journal = advanceOk(journal, {
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
  return advanceOk(journal, {
    type: "FINAL_VERIFY",
    observedMediaItemIds: finalMembership(),
  });
}

function toMembershipPlanned() {
  let journal = toMediaCreating();
  journal = advanceOk(journal, {
    type: "MEDIA_VERIFIED",
    createdItems: [createdItem()],
    proof: "direct_response",
  });
  journal = advanceOk(journal, { type: "MEMBERSHIP_PREPARED" });
  return advanceOk(journal, { type: "MEMBERSHIP_STARTED" });
}

function nextTimestamp() {
  tick += 1;
  return new Date(Date.parse(INITIAL_TIME) + tick * 1_000).toISOString();
}

function expectParserValidCasMutationRejected(
  current: GooglePhotosSyncRecoveryJournalV3,
  mutate: (next: GooglePhotosSyncRecoveryJournalV3) => void,
) {
  const store = createInMemoryGooglePhotosSyncRecoveryJournalStore();
  expect(store.initialize(current)).toEqual({ ok: true });
  const next = structuredClone(current);
  next.revision = current.revision + 1;
  next.updatedAt = nextTimestamp();
  mutate(next);
  expect(parseGooglePhotosSyncRecoveryJournalV3(next).ok).toBe(true);
  expect(
    store.compareAndSwap({
      recoveryId: current.recoveryId,
      expectedRevision: current.revision,
      nextJournal: next,
      writerId: "device-a",
    }),
  ).toEqual({
    outcome: "rejected",
    reason: "INVALID_STATE_TRANSITION",
  });
  expect(store.read(current.recoveryId)).toEqual(current);
}

function commitSimulationEvent(
  store: ReturnType<typeof createInMemoryGooglePhotosSyncRecoveryJournalStore>,
  current: GooglePhotosSyncRecoveryJournalV3,
  event: GooglePhotosSyncRecoverySimulationEvent,
) {
  const next = advanceOk(current, event);
  expect(
    store.compareAndSwap({
      recoveryId: current.recoveryId,
      expectedRevision: current.revision,
      nextJournal: next,
      writerId: "device-a",
    }).outcome,
  ).toBe("committed");
  expect(store.read(current.recoveryId)).toEqual(next);
  return next;
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

  it.each([
    [
      "unrelated IDs",
      () => Array.from({ length: 14 }, (_, index) => `unrelated-media-${index}`),
    ],
    [
      "a missing target",
      () => finalMembership().filter((id) => id !== mediaId(1)),
    ],
    [
      "a missing unmanaged item",
      () => finalMembership().filter((id) => id !== "fixture-unmanaged-media"),
    ],
    ["reversed target order", () => [...finalMembership()].reverse()],
    ["an unexpected extra", () => [...finalMembership(), "fixture-extra-media"]],
  ] as const)("rejects FINAL_READY with %s", (_label, replacement) => {
    const candidate = structuredClone(finalReadyJournal());
    const observed = replacement();
    candidate.verifiedMembershipMediaItemIds = observed;
    candidate.membershipCheckpoint.confirmedResultIds = observed;
    candidate.finalCandidate.observedMembershipMediaItemIds = observed;
    expect(parseGooglePhotosSyncRecoveryJournalV3(candidate)).toEqual({
      ok: false,
      reason: "INVALID_INVARIANT",
    });
  });

  it("accepts the untampered FINAL_READY journal", () => {
    const journal = finalReadyJournal();
    expect(parseGooglePhotosSyncRecoveryJournalV3(journal)).toEqual({
      ok: true,
      journal,
    });
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
  it("T1/T6 rejects a parser-valid checkpoint reset despite a valid journal revision", () => {
    let current = journalFixture();
    current = advanceOk(current, { type: "PREFLIGHT_CONFIRMED" });
    current = advanceOk(current, { type: "MEDIA_PREPARED" });
    expect(current.mediaCheckpoint.status).toBe("preflight_checkpointed");

    expectParserValidCasMutationRejected(current, (next) => {
      next.mediaCheckpoint.status = "not_started";
      next.mediaCheckpoint.revision = 0;
      next.mediaCheckpoint.journalRevision = next.revision;
      next.mediaCheckpoint.confirmedResultIds = [];
      next.mediaCheckpoint.automaticRetryAllowed = true;
    });
  });

  it("T2 rejects in-progress to preflight checkpoint rollback", () => {
    const current = toMediaCreating();
    expectParserValidCasMutationRejected(current, (next) => {
      next.mediaCheckpoint.status = "preflight_checkpointed";
      next.mediaCheckpoint.revision = 1;
      next.mediaCheckpoint.journalRevision = next.revision;
      next.mediaCheckpoint.confirmedResultIds = [];
      next.mediaCheckpoint.automaticRetryAllowed = true;
    });
  });

  it("T3 rejects succeeded checkpoint rollback", () => {
    let current = toMediaCreating();
    current = advanceOk(current, {
      type: "MEDIA_VERIFIED",
      createdItems: [createdItem()],
      proof: "direct_response",
    });
    expectParserValidCasMutationRejected(current, (next) => {
      next.mediaCheckpoint.status = "in_progress";
      next.mediaCheckpoint.revision = 2;
      next.mediaCheckpoint.journalRevision = next.revision;
      next.mediaCheckpoint.confirmedResultIds = [];
      next.mediaCheckpoint.automaticRetryAllowed = false;
    });
  });

  it("T4 rejects unknown, partial, and reverify states returning to auto-retry", () => {
    const unknown = advanceOk(toMediaCreating(), { type: "MEDIA_RESULT_UNKNOWN" });
    const partial = advanceOk(toMembershipPlanned(), {
      type: "MEMBERSHIP_PARTIAL",
      observedMediaItemIds: [mediaId(1)],
    });
    const reverify = advanceOk(partial, {
      type: "MEMBERSHIP_REMOTE_REVERIFICATION_REQUIRED",
    });
    const cases = [
      ["unknown", unknown, "mediaCheckpoint"],
      ["partial", partial, "membershipCheckpoint"],
      ["reverify", reverify, "membershipCheckpoint"],
    ] as const;

    for (const [, current, checkpointKey] of cases) {
      expectParserValidCasMutationRejected(current, (next) => {
        const checkpoint = next[checkpointKey];
        checkpoint.status = "preflight_checkpointed";
        checkpoint.revision = 1;
        checkpoint.journalRevision = next.revision;
        checkpoint.confirmedResultIds = [];
        checkpoint.automaticRetryAllowed = true;
        next.canResume = false;
      });
    }
  });

  it("T5 rejects deletion or replacement of confirmed result IDs", () => {
    const current = advanceOk(toMembershipPlanned(), {
      type: "MEMBERSHIP_PARTIAL",
      observedMediaItemIds: [mediaId(1)],
    });

    expectParserValidCasMutationRejected(current, (next) => {
      next.membershipCheckpoint.status = "result_unknown";
      next.membershipCheckpoint.revision += 1;
      next.membershipCheckpoint.journalRevision = next.revision;
      next.membershipCheckpoint.confirmedResultIds = [];
      next.membershipCheckpoint.automaticRetryAllowed = false;
    });
    expectParserValidCasMutationRejected(current, (next) => {
      next.membershipCheckpoint.revision += 1;
      next.membershipCheckpoint.journalRevision = next.revision;
      next.membershipCheckpoint.confirmedResultIds = [mediaId(2)];
    });
  });

  it("T8 accepts canonical prepare and start transitions through CAS", () => {
    const store = createInMemoryGooglePhotosSyncRecoveryJournalStore();
    let current = journalFixture();
    expect(store.initialize(current)).toEqual({ ok: true });
    current = commitSimulationEvent(store, current, {
      type: "PREFLIGHT_CONFIRMED",
    });
    current = commitSimulationEvent(store, current, { type: "MEDIA_PREPARED" });
    current = commitSimulationEvent(store, current, { type: "MEDIA_STARTED" });
    expect(current).toMatchObject({
      phase: "MEDIA_CREATING",
      mediaCheckpoint: { status: "in_progress", revision: 2 },
      productionWriteAllowed: false,
    });
  });

  it("T8 preserves response-unknown restart and remote verification through CAS", () => {
    const store = createInMemoryGooglePhotosSyncRecoveryJournalStore();
    let current = journalFixture();
    expect(store.initialize(current)).toEqual({ ok: true });
    current = commitSimulationEvent(store, current, {
      type: "PREFLIGHT_CONFIRMED",
    });
    current = commitSimulationEvent(store, current, { type: "MEDIA_PREPARED" });
    current = commitSimulationEvent(store, current, { type: "MEDIA_STARTED" });
    current = commitSimulationEvent(store, current, {
      type: "MEDIA_RESULT_UNKNOWN",
    });
    expect(current).toMatchObject({
      phase: "RECOVERY_REQUIRED",
      mediaCheckpoint: {
        status: "result_unknown",
        automaticRetryAllowed: false,
      },
    });

    const restarted = store.read(current.recoveryId);
    expect(restarted).not.toBeNull();
    if (restarted === null) throw new Error("stored recovery journal is missing");
    current = commitSimulationEvent(store, restarted, {
      type: "MEDIA_REMOTE_REVERIFICATION_REQUIRED",
    });
    current = commitSimulationEvent(store, current, {
      type: "MEDIA_VERIFIED",
      createdItems: [createdItem()],
      proof: "remote_snapshot",
    });
    expect(current).toMatchObject({
      phase: "MEDIA_VERIFIED",
      mediaCheckpoint: {
        status: "succeeded_verified",
        automaticRetryAllowed: false,
      },
      productionWriteAllowed: false,
    });
  });

  it("T9 accepts verified checkpoints and final verification through CAS", () => {
    const store = createInMemoryGooglePhotosSyncRecoveryJournalStore();
    let current = journalFixture();
    expect(store.initialize(current)).toEqual({ ok: true });
    current = commitSimulationEvent(store, current, {
      type: "PREFLIGHT_CONFIRMED",
    });
    current = commitSimulationEvent(store, current, { type: "MEDIA_PREPARED" });
    current = commitSimulationEvent(store, current, { type: "MEDIA_STARTED" });
    current = commitSimulationEvent(store, current, {
      type: "MEDIA_VERIFIED",
      createdItems: [createdItem()],
      proof: "direct_response",
    });
    current = commitSimulationEvent(store, current, {
      type: "MEMBERSHIP_PREPARED",
    });
    current = commitSimulationEvent(store, current, {
      type: "MEMBERSHIP_STARTED",
    });
    current = commitSimulationEvent(store, current, {
      type: "MEMBERSHIP_VERIFIED",
      observedMediaItemIds: finalMembership(),
      proof: "direct_response",
    });
    current = commitSimulationEvent(store, current, {
      type: "FINAL_VERIFY",
      observedMediaItemIds: finalMembership(),
    });
    expect(current).toMatchObject({
      phase: "FINAL_READY",
      mediaCheckpoint: { status: "succeeded_verified" },
      membershipCheckpoint: { status: "succeeded_verified" },
      finalCandidate: { status: "final_candidate" },
      productionWriteAllowed: false,
      atomicCommitProven: false,
    });
  });

  it("T11 rejects a parser-valid phase and checkpoint mismatch", () => {
    const current = toMediaCreating();
    expectParserValidCasMutationRejected(current, (next) => {
      next.phase = "PLANNED";
    });
  });

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

  it.each([
    [
      "stable snapshot",
      (journal: GooglePhotosSyncRecoveryJournalV3) => {
        journal.sourceBinding.stable!.generation += 1;
        journal.originalStable!.generation += 1;
        journal.baseStableGeneration += 1;
      },
    ],
    [
      "pending snapshot",
      (journal: GooglePhotosSyncRecoveryJournalV3) => {
        journal.sourceBinding.pending!.operationId = "fixture-replaced-pending";
        journal.originalPending.pendingIdentity = "fixture-replaced-pending";
      },
    ],
    [
      "initial membership",
      (journal: GooglePhotosSyncRecoveryJournalV3) => {
        journal.initialMembershipMediaItemIds.push("fixture-new-unmanaged");
        journal.protectedUnmanagedMediaItemIds.push("fixture-new-unmanaged");
      },
    ],
    [
      "classification result",
      (journal: GooglePhotosSyncRecoveryJournalV3) => {
        const changed = journal.classifications.find(
          (item) => item.classification === "CREATE_REQUIRED",
        );
        if (changed) changed.renderKey = "fixture-reclassified-render";
      },
    ],
  ] as const)("rejects CAS that rewrites the immutable %s", (_label, mutate) => {
    const store = createInMemoryGooglePhotosSyncRecoveryJournalStore();
    const initial = journalFixture();
    store.initialize(initial);
    const next = advanceOk(initial, { type: "PREFLIGHT_CONFIRMED" });
    mutate(next);
    expect(
      store.compareAndSwap({
        recoveryId: initial.recoveryId,
        expectedRevision: initial.revision,
        nextJournal: next,
        writerId: "device-a",
      }),
    ).toEqual({
      outcome: "rejected",
      reason: "IMMUTABLE_SNAPSHOT_CHANGED",
    });
  });

  it("rejects a second recovery identity for the same workspace and project", () => {
    const store = createInMemoryGooglePhotosSyncRecoveryJournalStore();
    const first = journalFixture();
    const second = structuredClone(first);
    second.recoveryId = "fixture-recovery-stage2a-other-device";
    second.mediaCheckpoint.recoveryId = second.recoveryId;
    second.membershipCheckpoint.recoveryId = second.recoveryId;
    expect(store.initialize(first)).toEqual({ ok: true });
    expect(store.initialize(second)).toEqual({
      ok: false,
      reason: "WORKSPACE_PROJECT_CONFLICT",
    });
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

  it("does not let caller-supplied expected membership hide drift", () => {
    const journal = journalFixture();
    const changed = ["fixture-caller-controlled-membership"];
    expect(
      inspectGooglePhotosSyncRecoveryConflicts({
        journal,
        observedRecoveryId: journal.recoveryId,
        observedSourceFingerprint: journal.recoverySourceFingerprint,
        observedStableGeneration: journal.baseStableGeneration,
        observedPendingIdentity: journal.originalPending.pendingIdentity,
        expectedMembershipMediaItemIds: changed,
        observedMembershipMediaItemIds: changed,
        concurrentOperationDetected: false,
      }),
    ).toEqual({
      conflicts: ["MEMBERSHIP_DRIFT"],
      simulationMayContinue: false,
      productionWriteAllowed: false,
      atomicCommitProven: false,
    });
  });

  it("allows a matching authoritative observation but fails closed mid-update", () => {
    const journal = journalFixture();
    expect(
      inspectGooglePhotosSyncRecoveryConflicts({
        journal,
        observedRecoveryId: journal.recoveryId,
        observedSourceFingerprint: journal.recoverySourceFingerprint,
        observedStableGeneration: journal.baseStableGeneration,
        observedPendingIdentity: journal.originalPending.pendingIdentity,
        expectedMembershipMediaItemIds: journal.initialMembershipMediaItemIds,
        observedMembershipMediaItemIds: journal.initialMembershipMediaItemIds,
        concurrentOperationDetected: false,
      }),
    ).toEqual({
      conflicts: [],
      simulationMayContinue: true,
      productionWriteAllowed: false,
      atomicCommitProven: false,
    });

    let updating = toMediaCreating();
    updating = advanceOk(updating, {
      type: "MEDIA_VERIFIED",
      createdItems: [createdItem()],
      proof: "direct_response",
    });
    updating = advanceOk(updating, { type: "MEMBERSHIP_PREPARED" });
    updating = advanceOk(updating, { type: "MEMBERSHIP_STARTED" });
    expect(
      inspectGooglePhotosSyncRecoveryConflicts({
        journal: updating,
        observedRecoveryId: updating.recoveryId,
        observedSourceFingerprint: updating.recoverySourceFingerprint,
        observedStableGeneration: updating.baseStableGeneration,
        observedPendingIdentity: updating.originalPending.pendingIdentity,
        expectedMembershipMediaItemIds: finalMembership(),
        observedMembershipMediaItemIds: finalMembership(),
        concurrentOperationDetected: false,
      }),
    ).toMatchObject({
      conflicts: ["REMOTE_STATE_UNVERIFIED"],
      simulationMayContinue: false,
      productionWriteAllowed: false,
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
