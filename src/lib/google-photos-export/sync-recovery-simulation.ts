import {
  parseGooglePhotosSyncRecoveryCheckpoint,
  transitionGooglePhotosSyncRecoveryCheckpoint,
  type GooglePhotosSyncRecoveryCheckpoint,
  type GooglePhotosSyncRecoveryCheckpointEvent,
} from "./sync-recovery-checkpoint";
import {
  parseGooglePhotosSyncRecoveryJournalV3,
  type GooglePhotosSyncRecoveryJournalV3,
} from "./sync-recovery-journal-v3";
import { recoveryTargetIdsAppearInRelativeOrder } from "./sync-recovery-plan";
import type {
  GooglePhotosSyncRecoveryCreatedItem,
  GooglePhotosSyncRecoveryStopReason,
} from "./sync-recovery-types";

export type GooglePhotosSyncRecoveryConflictReason =
  | "RECOVERY_ID_MISMATCH"
  | "SOURCE_DRIFT"
  | "STABLE_CHANGED"
  | "PENDING_CHANGED"
  | "MEMBERSHIP_DRIFT"
  | "REMOTE_STATE_UNVERIFIED"
  | "CONCURRENT_OPERATION";

export type GooglePhotosSyncRecoveryConflictInspection = {
  conflicts: GooglePhotosSyncRecoveryConflictReason[];
  simulationMayContinue: boolean;
  productionWriteAllowed: false;
  atomicCommitProven: false;
};

export type GooglePhotosSyncRecoverySimulationEvent =
  | { type: "PREFLIGHT_CONFIRMED" }
  | { type: "MEDIA_PREPARED" }
  | { type: "MEDIA_STARTED" }
  | { type: "MEDIA_RESULT_UNKNOWN" }
  | { type: "MEDIA_PARTIAL"; createdItems: GooglePhotosSyncRecoveryCreatedItem[] }
  | { type: "MEDIA_REMOTE_REVERIFICATION_REQUIRED" }
  | {
      type: "MEDIA_VERIFIED";
      createdItems: GooglePhotosSyncRecoveryCreatedItem[];
      proof: "direct_response" | "remote_snapshot";
    }
  | { type: "MEMBERSHIP_PREPARED" }
  | { type: "MEMBERSHIP_STARTED" }
  | { type: "MEMBERSHIP_RESULT_UNKNOWN" }
  | { type: "MEMBERSHIP_PARTIAL"; observedMediaItemIds: string[] }
  | { type: "MEMBERSHIP_REMOTE_REVERIFICATION_REQUIRED" }
  | {
      type: "MEMBERSHIP_VERIFIED";
      observedMediaItemIds: string[];
      proof: "direct_response" | "remote_snapshot";
    }
  | { type: "FINAL_VERIFY"; observedMediaItemIds: string[] }
  | { type: "STOP"; reason: GooglePhotosSyncRecoveryStopReason };

export type GooglePhotosSyncRecoverySimulationResult =
  | { ok: true; journal: GooglePhotosSyncRecoveryJournalV3 }
  | {
      ok: false;
      reason:
        | "INVALID_JOURNAL"
        | "STALE_JOURNAL_REVISION"
        | "INVALID_PHASE"
        | "CHECKPOINT_REJECTED"
        | "INVALID_RESULT_SET"
        | "FINAL_VERIFICATION_FAILED";
    };

/** Pure, fail-closed conflict inspection for local Stage 2A simulations. */
export function inspectGooglePhotosSyncRecoveryConflicts(input: {
  journal: GooglePhotosSyncRecoveryJournalV3;
  observedRecoveryId: string;
  observedSourceFingerprint: string;
  observedStableGeneration: number;
  observedPendingIdentity: string;
  expectedMembershipMediaItemIds: string[];
  observedMembershipMediaItemIds: string[];
  concurrentOperationDetected: boolean;
}): GooglePhotosSyncRecoveryConflictInspection {
  const parsed = parseGooglePhotosSyncRecoveryJournalV3(input.journal);
  const conflicts: GooglePhotosSyncRecoveryConflictReason[] = [];
  if (!parsed.ok || input.observedRecoveryId !== input.journal.recoveryId) {
    conflicts.push("RECOVERY_ID_MISMATCH");
  }
  if (input.observedSourceFingerprint !== input.journal.recoverySourceFingerprint) {
    conflicts.push("SOURCE_DRIFT");
  }
  if (input.observedStableGeneration !== input.journal.baseStableGeneration) {
    conflicts.push("STABLE_CHANGED");
  }
  if (input.observedPendingIdentity !== input.journal.originalPending.pendingIdentity) {
    conflicts.push("PENDING_CHANGED");
  }
  const authoritativeMembership = parsed.ok
    ? authoritativeMembershipSnapshot(parsed.journal)
    : null;
  if (authoritativeMembership === null) {
    conflicts.push("REMOTE_STATE_UNVERIFIED");
  } else if (
    !arraysEqual(input.expectedMembershipMediaItemIds, authoritativeMembership) ||
    !arraysEqual(input.observedMembershipMediaItemIds, authoritativeMembership)
  ) {
    conflicts.push("MEMBERSHIP_DRIFT");
  }
  if (input.concurrentOperationDetected) conflicts.push("CONCURRENT_OPERATION");
  const unique = [...new Set(conflicts)];
  return {
    conflicts: unique,
    simulationMayContinue: unique.length === 0,
    productionWriteAllowed: false,
    atomicCommitProven: false,
  };
}

function authoritativeMembershipSnapshot(
  journal: GooglePhotosSyncRecoveryJournalV3,
) {
  switch (journal.membershipCheckpoint.status) {
    case "in_progress":
    case "result_unknown":
    case "partial":
    case "remote_reverification_required":
      return null;
    case "succeeded_verified":
      return journal.verifiedMembershipMediaItemIds;
    case "not_started":
    case "preflight_checkpointed":
    case "stopped":
      return journal.initialMembershipMediaItemIds;
  }
}

/**
 * Advances only the isolated journal. This function has no production binding,
 * API, OAuth, filesystem, or network dependency.
 */
export function advanceGooglePhotosSyncRecoverySimulation(input: {
  journal: GooglePhotosSyncRecoveryJournalV3;
  expectedRevision: number;
  now: string;
  event: GooglePhotosSyncRecoverySimulationEvent;
}): GooglePhotosSyncRecoverySimulationResult {
  const parsed = parseGooglePhotosSyncRecoveryJournalV3(input.journal);
  if (!parsed.ok) return { ok: false, reason: "INVALID_JOURNAL" };
  const current = parsed.journal;
  if (input.expectedRevision !== current.revision) {
    return { ok: false, reason: "STALE_JOURNAL_REVISION" };
  }

  const next = structuredClone(current);
  next.revision = current.revision + 1;
  next.updatedAt = input.now;

  switch (input.event.type) {
    case "PREFLIGHT_CONFIRMED":
      if (
        current.phase !== "PREFLIGHT" ||
        current.classifications.some(
          (item) => item.classification === "INDETERMINATE",
        )
      ) {
        return invalidPhase();
      }
      next.phase = "PLANNED";
      next.canResume = true;
      break;
    case "MEDIA_PREPARED": {
      if (current.phase !== "PLANNED") return invalidPhase();
      const transitioned = transitionCheckpoint(current, "media", {
        type: "PREPARE",
      });
      if (!transitioned) return checkpointRejected();
      next.mediaCheckpoint = transitioned;
      break;
    }
    case "MEDIA_STARTED": {
      if (current.phase !== "PLANNED") return invalidPhase();
      const transitioned = transitionCheckpoint(current, "media", { type: "START" });
      if (!transitioned) return checkpointRejected();
      next.mediaCheckpoint = transitioned;
      next.phase = "MEDIA_CREATING";
      next.canResume = true;
      break;
    }
    case "MEDIA_RESULT_UNKNOWN": {
      if (current.phase !== "MEDIA_CREATING") return invalidPhase();
      const transitioned = transitionCheckpoint(current, "media", {
        type: "RESULT_UNKNOWN",
      });
      if (!transitioned) return checkpointRejected();
      next.mediaCheckpoint = transitioned;
      stop(next, "MEDIA_CREATION_RESULT_UNKNOWN");
      break;
    }
    case "MEDIA_PARTIAL": {
      if (current.phase !== "MEDIA_CREATING") return invalidPhase();
      if (!validCreatedPrefix(current, input.event.createdItems, false)) {
        return { ok: false, reason: "INVALID_RESULT_SET" };
      }
      const transitioned = transitionCheckpoint(current, "media", {
        type: "PARTIAL_SUCCESS",
        confirmedResultIds: input.event.createdItems.map((item) => item.mediaItemId),
      });
      if (!transitioned) return checkpointRejected();
      next.mediaCheckpoint = transitioned;
      next.createdItems = cloneCreatedItems(input.event.createdItems);
      stop(next, "MEDIA_CREATION_PARTIAL");
      break;
    }
    case "MEDIA_REMOTE_REVERIFICATION_REQUIRED": {
      if (current.phase !== "RECOVERY_REQUIRED") return invalidPhase();
      const transitioned = transitionCheckpoint(current, "media", {
        type: "REQUIRE_REMOTE_REVERIFICATION",
      });
      if (!transitioned) return checkpointRejected();
      next.mediaCheckpoint = transitioned;
      next.canResume = true;
      break;
    }
    case "MEDIA_VERIFIED": {
      if (
        current.phase !== "MEDIA_CREATING" &&
        current.phase !== "RECOVERY_REQUIRED"
      ) {
        return invalidPhase();
      }
      if (!validCreatedPrefix(current, input.event.createdItems, true)) {
        return { ok: false, reason: "INVALID_RESULT_SET" };
      }
      const transitioned = transitionCheckpoint(current, "media", {
        type: "VERIFY_SUCCESS",
        confirmedResultIds: input.event.createdItems.map((item) => item.mediaItemId),
        proof: input.event.proof,
      });
      if (!transitioned) return checkpointRejected();
      next.mediaCheckpoint = transitioned;
      next.createdItems = cloneCreatedItems(input.event.createdItems);
      next.expectedTargetMediaItemIds = deriveTargetIds(next);
      if (next.expectedTargetMediaItemIds === null) {
        return { ok: false, reason: "INVALID_RESULT_SET" };
      }
      next.phase = "MEDIA_VERIFIED";
      next.stopReason = null;
      next.canResume = true;
      break;
    }
    case "MEMBERSHIP_PREPARED": {
      if (
        current.phase !== "MEDIA_VERIFIED" ||
        current.expectedTargetMediaItemIds === null
      ) {
        return invalidPhase();
      }
      const transitioned = transitionCheckpoint(current, "membership", {
        type: "PREPARE",
      });
      if (!transitioned) return checkpointRejected();
      next.membershipCheckpoint = transitioned;
      break;
    }
    case "MEMBERSHIP_STARTED": {
      if (current.phase !== "MEDIA_VERIFIED") return invalidPhase();
      const transitioned = transitionCheckpoint(current, "membership", {
        type: "START",
      });
      if (!transitioned) return checkpointRejected();
      next.membershipCheckpoint = transitioned;
      next.phase = "MEMBERSHIP_PLANNED";
      next.canResume = true;
      break;
    }
    case "MEMBERSHIP_RESULT_UNKNOWN": {
      if (current.phase !== "MEMBERSHIP_PLANNED") return invalidPhase();
      const transitioned = transitionCheckpoint(current, "membership", {
        type: "RESULT_UNKNOWN",
      });
      if (!transitioned) return checkpointRejected();
      next.membershipCheckpoint = transitioned;
      stop(next, "MEMBERSHIP_RESULT_UNKNOWN");
      break;
    }
    case "MEMBERSHIP_PARTIAL": {
      if (current.phase !== "MEMBERSHIP_PLANNED") return invalidPhase();
      const transitioned = transitionCheckpoint(current, "membership", {
        type: "PARTIAL_SUCCESS",
        confirmedResultIds: input.event.observedMediaItemIds,
      });
      if (!transitioned) return checkpointRejected();
      next.membershipCheckpoint = transitioned;
      stop(next, "MEMBERSHIP_PARTIAL");
      break;
    }
    case "MEMBERSHIP_REMOTE_REVERIFICATION_REQUIRED": {
      if (current.phase !== "RECOVERY_REQUIRED") return invalidPhase();
      const transitioned = transitionCheckpoint(current, "membership", {
        type: "REQUIRE_REMOTE_REVERIFICATION",
      });
      if (!transitioned) return checkpointRejected();
      next.membershipCheckpoint = transitioned;
      next.canResume = true;
      break;
    }
    case "MEMBERSHIP_VERIFIED": {
      if (
        current.phase !== "MEMBERSHIP_PLANNED" &&
        current.phase !== "RECOVERY_REQUIRED"
      ) {
        return invalidPhase();
      }
      if (!membershipIsFinalCandidate(current, input.event.observedMediaItemIds)) {
        return { ok: false, reason: "INVALID_RESULT_SET" };
      }
      const transitioned = transitionCheckpoint(current, "membership", {
        type: "VERIFY_SUCCESS",
        confirmedResultIds: input.event.observedMediaItemIds,
        proof: input.event.proof,
      });
      if (!transitioned) return checkpointRejected();
      next.membershipCheckpoint = transitioned;
      next.verifiedMembershipMediaItemIds = [...input.event.observedMediaItemIds];
      next.phase = "MEMBERSHIP_VERIFIED";
      next.stopReason = null;
      next.canResume = true;
      break;
    }
    case "FINAL_VERIFY":
      if (
        current.phase !== "MEMBERSHIP_VERIFIED" ||
        current.membershipCheckpoint.status !== "succeeded_verified" ||
        !membershipIsFinalCandidate(current, input.event.observedMediaItemIds) ||
        current.verifiedMembershipMediaItemIds === null ||
        !arraysEqual(
          current.verifiedMembershipMediaItemIds,
          input.event.observedMediaItemIds,
        )
      ) {
        return { ok: false, reason: "FINAL_VERIFICATION_FAILED" };
      }
      next.phase = "FINAL_READY";
      next.finalCandidate = {
        status: "final_candidate",
        observedMembershipMediaItemIds: [...input.event.observedMediaItemIds],
      };
      next.canResume = false;
      break;
    case "STOP":
      if (current.phase === "FINAL_READY") return invalidPhase();
      stop(next, input.event.reason);
      break;
  }

  const validated = parseGooglePhotosSyncRecoveryJournalV3(next);
  return validated.ok
    ? { ok: true, journal: validated.journal }
    : { ok: false, reason: "INVALID_JOURNAL" };
}

export type InMemoryGooglePhotosSyncRecoveryJournalStore = ReturnType<
  typeof createInMemoryGooglePhotosSyncRecoveryJournalStore
>;

/**
 * In-memory compare-and-swap simulation only. It models conflicts and response
 * loss but does not claim Google Drive provides an atomic CAS primitive.
 */
export function createInMemoryGooglePhotosSyncRecoveryJournalStore() {
  const records = new Map<string, GooglePhotosSyncRecoveryJournalV3>();

  return {
    initialize(journal: GooglePhotosSyncRecoveryJournalV3) {
      const parsed = parseGooglePhotosSyncRecoveryJournalV3(journal);
      if (!parsed.ok) return { ok: false as const, reason: "INVALID_JOURNAL" as const };
      if (records.has(parsed.journal.recoveryId)) {
        return { ok: false as const, reason: "ALREADY_EXISTS" as const };
      }
      if (
        [...records.values()].some(
          (record) =>
            record.workspaceId === parsed.journal.workspaceId &&
            record.projectId === parsed.journal.projectId,
        )
      ) {
        return {
          ok: false as const,
          reason: "WORKSPACE_PROJECT_CONFLICT" as const,
        };
      }
      records.set(parsed.journal.recoveryId, structuredClone(parsed.journal));
      return { ok: true as const };
    },

    read(recoveryId: string) {
      const record = records.get(recoveryId);
      return record ? structuredClone(record) : null;
    },

    compareAndSwap(input: {
      recoveryId: string;
      expectedRevision: number;
      nextJournal: GooglePhotosSyncRecoveryJournalV3;
      writerId: string;
      fault?: "none" | "fail_before_commit" | "lose_response_after_commit";
    }) {
      if (input.writerId.trim().length === 0) {
        return { outcome: "rejected" as const, reason: "INVALID_WRITER" as const };
      }
      const parsed = parseGooglePhotosSyncRecoveryJournalV3(input.nextJournal);
      if (!parsed.ok) {
        return { outcome: "rejected" as const, reason: "INVALID_JOURNAL" as const };
      }
      const current = records.get(input.recoveryId);
      if (!current) {
        return { outcome: "rejected" as const, reason: "NOT_FOUND" as const };
      }
      if (
        parsed.journal.recoveryId !== input.recoveryId ||
        current.recoveryId !== input.recoveryId
      ) {
        return { outcome: "rejected" as const, reason: "RECOVERY_ID_MISMATCH" as const };
      }
      if (!immutableJournalAuthorityMatches(current, parsed.journal)) {
        return {
          outcome: "rejected" as const,
          reason: "IMMUTABLE_SNAPSHOT_CHANGED" as const,
        };
      }
      if (
        current.revision !== input.expectedRevision ||
        parsed.journal.revision !== input.expectedRevision + 1
      ) {
        return { outcome: "rejected" as const, reason: "REVISION_CONFLICT" as const };
      }
      if (!journalCasTransitionAllowed(current, parsed.journal)) {
        return {
          outcome: "rejected" as const,
          reason: "INVALID_STATE_TRANSITION" as const,
        };
      }
      if (input.fault === "fail_before_commit") {
        return { outcome: "rejected" as const, reason: "STORE_FAILURE" as const };
      }
      records.set(input.recoveryId, structuredClone(parsed.journal));
      if (input.fault === "lose_response_after_commit") {
        return { outcome: "commit_result_unknown" as const };
      }
      return {
        outcome: "committed" as const,
        journal: structuredClone(parsed.journal),
      };
    },
  };
}

/**
 * A parser validates one journal snapshot. CAS must additionally prove that the
 * next snapshot is the exact result of one supported transition from the stored
 * snapshot. Replaying the pure transition keeps phase, checkpoint revision,
 * confirmed results, retry policy, and stop/resume state monotonic together.
 */
function journalCasTransitionAllowed(
  current: GooglePhotosSyncRecoveryJournalV3,
  next: GooglePhotosSyncRecoveryJournalV3,
) {
  return casTransitionCandidates(next).some((event) => {
    const advanced = advanceGooglePhotosSyncRecoverySimulation({
      journal: current,
      expectedRevision: current.revision,
      now: next.updatedAt,
      event,
    });
    return advanced.ok && deepEqual(advanced.journal, next);
  });
}

function casTransitionCandidates(
  next: GooglePhotosSyncRecoveryJournalV3,
): GooglePhotosSyncRecoverySimulationEvent[] {
  const candidates: GooglePhotosSyncRecoverySimulationEvent[] = [
    { type: "PREFLIGHT_CONFIRMED" },
    { type: "MEDIA_PREPARED" },
    { type: "MEDIA_STARTED" },
    { type: "MEDIA_RESULT_UNKNOWN" },
    { type: "MEDIA_REMOTE_REVERIFICATION_REQUIRED" },
    { type: "MEMBERSHIP_PREPARED" },
    { type: "MEMBERSHIP_STARTED" },
    { type: "MEMBERSHIP_RESULT_UNKNOWN" },
    { type: "MEMBERSHIP_REMOTE_REVERIFICATION_REQUIRED" },
  ];

  if (next.createdItems.length > 0) {
    candidates.push({
      type: "MEDIA_PARTIAL",
      createdItems: cloneCreatedItems(next.createdItems),
    });
  }
  candidates.push(
    {
      type: "MEDIA_VERIFIED",
      createdItems: cloneCreatedItems(next.createdItems),
      proof: "direct_response",
    },
    {
      type: "MEDIA_VERIFIED",
      createdItems: cloneCreatedItems(next.createdItems),
      proof: "remote_snapshot",
    },
  );

  if (next.membershipCheckpoint.confirmedResultIds.length > 0) {
    candidates.push({
      type: "MEMBERSHIP_PARTIAL",
      observedMediaItemIds: [...next.membershipCheckpoint.confirmedResultIds],
    });
  }
  if (next.verifiedMembershipMediaItemIds !== null) {
    candidates.push(
      {
        type: "MEMBERSHIP_VERIFIED",
        observedMediaItemIds: [...next.verifiedMembershipMediaItemIds],
        proof: "direct_response",
      },
      {
        type: "MEMBERSHIP_VERIFIED",
        observedMediaItemIds: [...next.verifiedMembershipMediaItemIds],
        proof: "remote_snapshot",
      },
    );
  }
  if (next.finalCandidate.status === "final_candidate") {
    candidates.push({
      type: "FINAL_VERIFY",
      observedMediaItemIds: [
        ...next.finalCandidate.observedMembershipMediaItemIds,
      ],
    });
  }
  if (next.stopReason !== null) {
    candidates.push({ type: "STOP", reason: next.stopReason });
  }
  return candidates;
}

function immutableJournalAuthorityMatches(
  current: GooglePhotosSyncRecoveryJournalV3,
  next: GooglePhotosSyncRecoveryJournalV3,
) {
  return (
    current.workspaceId === next.workspaceId &&
    current.projectId === next.projectId &&
    current.createdAt === next.createdAt &&
    current.baseStableGeneration === next.baseStableGeneration &&
    current.recoverySourceFingerprint === next.recoverySourceFingerprint &&
    current.remotePixelEquality === next.remotePixelEquality &&
    deepEqual(current.sourceBinding, next.sourceBinding) &&
    deepEqual(current.originalStable, next.originalStable) &&
    deepEqual(current.originalPending, next.originalPending) &&
    deepEqual(
      current.initialMembershipMediaItemIds,
      next.initialMembershipMediaItemIds,
    ) &&
    deepEqual(
      current.confirmedPendingMediaItemIds,
      next.confirmedPendingMediaItemIds,
    ) &&
    deepEqual(current.orderedTargetSlideIds, next.orderedTargetSlideIds) &&
    deepEqual(current.classifications, next.classifications) &&
    deepEqual(
      current.protectedUnmanagedMediaItemIds,
      next.protectedUnmanagedMediaItemIds,
    ) &&
    checkpointAuthorityMatches(current.mediaCheckpoint, next.mediaCheckpoint) &&
    checkpointAuthorityMatches(
      current.membershipCheckpoint,
      next.membershipCheckpoint,
    )
  );
}

function checkpointAuthorityMatches(
  current: GooglePhotosSyncRecoveryCheckpoint,
  next: GooglePhotosSyncRecoveryCheckpoint,
) {
  return (
    current.checkpointId === next.checkpointId &&
    current.recoveryId === next.recoveryId &&
    current.operation === next.operation &&
    current.expectedPhase === next.expectedPhase &&
    deepEqual(current.targetIdentities, next.targetIdentities)
  );
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function transitionCheckpoint(
  journal: GooglePhotosSyncRecoveryJournalV3,
  which: "media" | "membership",
  event: GooglePhotosSyncRecoveryCheckpointEvent,
) {
  const source =
    which === "media" ? journal.mediaCheckpoint : journal.membershipCheckpoint;
  const rebased: GooglePhotosSyncRecoveryCheckpoint = {
    ...source,
    journalRevision: journal.revision,
  };
  const parsed = parseGooglePhotosSyncRecoveryCheckpoint(rebased);
  if (!parsed.ok) return null;
  const result = transitionGooglePhotosSyncRecoveryCheckpoint({
    checkpoint: parsed.checkpoint,
    event,
    recoveryId: journal.recoveryId,
    operation: which === "media" ? "media_creation" : "membership_update",
    expectedCheckpointRevision: parsed.checkpoint.revision,
    expectedJournalRevision: journal.revision,
  });
  return result.ok ? result.checkpoint : null;
}

function validCreatedPrefix(
  journal: GooglePhotosSyncRecoveryJournalV3,
  createdItems: GooglePhotosSyncRecoveryCreatedItem[],
  complete: boolean,
) {
  const required = journal.mediaCheckpoint.targetIdentities;
  if (
    !Array.isArray(createdItems) ||
    (complete
      ? createdItems.length !== required.length
      : createdItems.length === 0 || createdItems.length >= required.length)
  ) {
    return false;
  }
  const historical = new Set([
    ...(journal.originalStable?.items.map((item) => item.mediaItemId) ?? []),
    ...journal.originalPending.targetItems.map((item) => item.mediaItemId),
    ...journal.initialMembershipMediaItemIds,
  ]);
  const media = new Set<string>();
  return createdItems.every(
    (item, index) =>
      item.slideId === required[index] &&
      item.mediaItemId.trim().length > 0 &&
      !historical.has(item.mediaItemId) &&
      !media.has(item.mediaItemId) &&
      Boolean(media.add(item.mediaItemId)),
  );
}

function deriveTargetIds(journal: GooglePhotosSyncRecoveryJournalV3) {
  const created = new Map(
    journal.createdItems.map((item) => [item.slideId, item.mediaItemId]),
  );
  const result: string[] = [];
  for (const item of journal.classifications) {
    if (item.classification === "INDETERMINATE") return null;
    if (item.classification === "REUSE_CANDIDATE") result.push(item.mediaItemId);
    else {
      const id = created.get(item.slideId);
      if (!id) return null;
      result.push(id);
    }
  }
  return new Set(result).size === result.length ? result : null;
}

function membershipIsFinalCandidate(
  journal: GooglePhotosSyncRecoveryJournalV3,
  observed: string[],
) {
  const target = journal.expectedTargetMediaItemIds;
  if (!target || !uniqueNonBlank(observed)) return false;
  const allowed = new Set([...target, ...journal.protectedUnmanagedMediaItemIds]);
  return (
    observed.length === allowed.size &&
    observed.every((id) => allowed.has(id)) &&
    target.every((id) => observed.includes(id)) &&
    journal.protectedUnmanagedMediaItemIds.every((id) => observed.includes(id)) &&
    recoveryTargetIdsAppearInRelativeOrder(observed, target)
  );
}

function stop(
  journal: GooglePhotosSyncRecoveryJournalV3,
  reason: GooglePhotosSyncRecoveryStopReason,
) {
  journal.phase = "RECOVERY_REQUIRED";
  journal.stopReason = reason;
  journal.canResume = [
    "PRE_MEDIA_INTERRUPTED",
    "UPLOAD_INTERRUPTED",
    "CHECKPOINT_FAILED",
    "MEMBERSHIP_RESULT_UNKNOWN",
    "FINAL_CANDIDATE_UNKNOWN",
    "PENDING_END_UNKNOWN",
  ].includes(reason);
}

function cloneCreatedItems(items: GooglePhotosSyncRecoveryCreatedItem[]) {
  return items.map((item) => ({ ...item }));
}

function uniqueNonBlank(values: unknown): values is string[] {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.every(
      (value) =>
        typeof value === "string" && value.length > 0 && value === value.trim(),
    ) &&
    new Set(values).size === values.length
  );
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidPhase(): GooglePhotosSyncRecoverySimulationResult {
  return { ok: false, reason: "INVALID_PHASE" };
}

function checkpointRejected(): GooglePhotosSyncRecoverySimulationResult {
  return { ok: false, reason: "CHECKPOINT_REJECTED" };
}
