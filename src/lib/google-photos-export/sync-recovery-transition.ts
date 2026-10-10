import { recoveryTargetIdsAppearInRelativeOrder } from "./sync-recovery-plan";
import type {
  GooglePhotosSyncRecoveryAuthority,
  GooglePhotosSyncRecoveryClassification,
  GooglePhotosSyncRecoveryEvent,
  GooglePhotosSyncRecoveryManagedItem,
  GooglePhotosSyncRecoveryPendingSnapshot,
  GooglePhotosSyncRecoveryRetryPolicy,
  GooglePhotosSyncRecoveryStableSnapshot,
  GooglePhotosSyncRecoveryState,
  GooglePhotosSyncRecoveryStopReason,
} from "./sync-recovery-types";

export type CreateGooglePhotosSyncRecoveryStateResult =
  | { ok: true; state: GooglePhotosSyncRecoveryState }
  | {
      ok: false;
      reason:
        | "INVALID_INPUT"
        | "RECOVERY_SOURCE_NOT_CHANGED"
        | "STABLE_PENDING_MISMATCH"
        | "TARGET_CLASSIFICATION_MISMATCH";
    };

export function createGooglePhotosSyncRecoveryState(input: {
  recoveryId: string;
  originalStable: GooglePhotosSyncRecoveryStableSnapshot;
  originalPending: GooglePhotosSyncRecoveryPendingSnapshot;
  initialMembershipMediaItemIds: string[];
  recoverySourceFingerprint: string;
  orderedTargetSlideIds: string[];
  classifications: GooglePhotosSyncRecoveryClassification[];
}): CreateGooglePhotosSyncRecoveryStateResult {
  if (
    !isNonBlankTrimmedString(input.recoveryId) ||
    !isNonBlankTrimmedString(input.recoverySourceFingerprint) ||
    !validStable(input.originalStable) ||
    !validPending(input.originalPending) ||
    !uniqueNonBlank(input.initialMembershipMediaItemIds) ||
    !uniqueNonBlank(input.orderedTargetSlideIds)
  ) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  if (input.originalPending.sourceFingerprint === input.recoverySourceFingerprint) {
    return { ok: false, reason: "RECOVERY_SOURCE_NOT_CHANGED" };
  }
  const stableIds = input.originalStable?.items.map((item) => item.mediaItemId) ?? [];
  if (!arraysEqual(stableIds, input.originalPending.previousManagedMediaItemIds)) {
    return { ok: false, reason: "STABLE_PENDING_MISMATCH" };
  }
  if (
    input.classifications.length !== input.orderedTargetSlideIds.length ||
    input.classifications.some(
      (item, index) => item.slideId !== input.orderedTargetSlideIds[index],
    )
  ) {
    return { ok: false, reason: "TARGET_CLASSIFICATION_MISMATCH" };
  }

  return {
    ok: true,
    state: {
      recoveryId: input.recoveryId,
      phase: "PREFLIGHT",
      originalStable: cloneStable(input.originalStable),
      originalPending: clonePending(input.originalPending),
      baseStableGeneration: input.originalStable?.generation ?? 0,
      initialMembershipMediaItemIds: [...input.initialMembershipMediaItemIds],
      recoverySourceFingerprint: input.recoverySourceFingerprint,
      orderedTargetSlideIds: [...input.orderedTargetSlideIds],
      classifications: input.classifications.map(cloneClassification),
      mediaCreation: {
        requiredSlideIds: input.classifications.flatMap((item) =>
          item.classification === "CREATE_REQUIRED" ? [item.slideId] : [],
        ),
        confirmedItems: [],
      },
      membershipPlan: null,
      finalVerification: "not_started",
      canResume: true,
      retryPolicy: "SAFE_FROM_CHECKPOINT",
      stopReason: null,
    },
  };
}

/**
 * Pure recovery candidate transition. FINAL_READY means local prerequisites are
 * satisfied; it never writes or finalizes the production stable/pending binding.
 */
export function transitionGooglePhotosSyncRecovery(
  inputState: GooglePhotosSyncRecoveryState,
  event: GooglePhotosSyncRecoveryEvent,
): GooglePhotosSyncRecoveryState {
  const state = cloneState(inputState);
  if (!stateIntegrityIsValid(state)) {
    return stop(state, "STATE_INTEGRITY_FAILED", "AUTOMATIC_RETRY_FORBIDDEN");
  }
  if (state.phase === "RECOVERY_REQUIRED" || state.phase === "FINAL_READY") {
    return stop(state, "INVALID_PHASE", "AUTOMATIC_RETRY_FORBIDDEN");
  }

  const authorityFailure = inspectAuthority(state, event.authority);
  if (authorityFailure) {
    return stop(state, authorityFailure, "AUTOMATIC_RETRY_FORBIDDEN");
  }

  switch (event.type) {
    case "DUPLICATE_OPERATION_DETECTED":
      return stop(state, "DUPLICATE_OPERATION", "AUTOMATIC_RETRY_FORBIDDEN");
    case "MEMBERSHIP_DRIFT_DETECTED":
      return stop(state, "MEMBERSHIP_DRIFT", "AUTOMATIC_RETRY_FORBIDDEN");
    case "CHECKPOINT_FAILED":
      return stop(state, "CHECKPOINT_FAILED", "VERIFY_REMOTE_FIRST");
    case "INTERRUPTED_BEFORE_MEDIA":
      return state.phase === "PLANNED"
        ? stop(state, "PRE_MEDIA_INTERRUPTED", "SAFE_FROM_CHECKPOINT")
        : invalidPhase(state);
    case "UPLOAD_INTERRUPTED":
      return state.phase === "MEDIA_CREATING"
        ? stop(state, "UPLOAD_INTERRUPTED", "VERIFY_REMOTE_FIRST")
        : invalidPhase(state);
    case "MEDIA_CREATION_RESULT_UNKNOWN":
      return state.phase === "MEDIA_CREATING"
        ? stop(state, "MEDIA_CREATION_RESULT_UNKNOWN", "AUTOMATIC_RETRY_FORBIDDEN")
        : invalidPhase(state);
    case "MEDIA_CREATION_PARTIAL":
      return state.phase === "MEDIA_CREATING"
        ? stop(state, "MEDIA_CREATION_PARTIAL", "AUTOMATIC_RETRY_FORBIDDEN")
        : invalidPhase(state);
    case "MEMBERSHIP_RESULT_UNKNOWN":
      return state.phase === "MEMBERSHIP_PLANNED"
        ? stop(state, "MEMBERSHIP_RESULT_UNKNOWN", "VERIFY_REMOTE_FIRST")
        : invalidPhase(state);
    case "MEMBERSHIP_PARTIAL":
      return state.phase === "MEMBERSHIP_PLANNED"
        ? stop(state, "MEMBERSHIP_PARTIAL", "AUTOMATIC_RETRY_FORBIDDEN")
        : invalidPhase(state);
    case "MEMBERSHIP_VERIFIED_MISMATCH":
      return state.phase === "MEMBERSHIP_PLANNED"
        ? stop(state, "MEMBERSHIP_MISMATCH", "AUTOMATIC_RETRY_FORBIDDEN")
        : invalidPhase(state);
    case "FINAL_CANDIDATE_UNKNOWN":
      return state.phase === "MEMBERSHIP_VERIFIED"
        ? stop(state, "FINAL_CANDIDATE_UNKNOWN", "VERIFY_REMOTE_FIRST")
        : invalidPhase(state);
    case "PENDING_END_UNKNOWN":
      return state.phase === "MEMBERSHIP_VERIFIED"
        ? stop(state, "PENDING_END_UNKNOWN", "VERIFY_REMOTE_FIRST")
        : invalidPhase(state);
    case "PREFLIGHT_CONFIRMED":
      if (state.phase !== "PREFLIGHT") return invalidPhase(state);
      if (state.classifications.some((item) => item.classification === "INDETERMINATE")) {
        return stop(
          state,
          "CLASSIFICATION_INDETERMINATE",
          "AUTOMATIC_RETRY_FORBIDDEN",
        );
      }
      return advance(state, "PLANNED");
    case "MEDIA_CREATION_STARTED":
      if (state.phase !== "PLANNED" || state.mediaCreation.requiredSlideIds.length === 0) {
        return invalidPhase(state);
      }
      return advance(state, "MEDIA_CREATING");
    case "MEDIA_CREATION_NOT_REQUIRED":
      if (state.phase !== "PLANNED" || state.mediaCreation.requiredSlideIds.length !== 0) {
        return invalidPhase(state);
      }
      return advance(state, "MEDIA_VERIFIED");
    case "MEDIA_CREATION_CONFIRMED": {
      if (state.phase !== "MEDIA_CREATING") return invalidPhase(state);
      const created = normalizeCreatedItems(event.createdItems);
      if (
        !created ||
        !arraysEqual(
          created.map((item) => item.slideId),
          state.mediaCreation.requiredSlideIds,
        )
      ) {
        return stop(
          state,
          "CREATED_ITEMS_INCOMPLETE",
          "AUTOMATIC_RETRY_FORBIDDEN",
        );
      }
      return {
        ...advance(state, "MEDIA_VERIFIED"),
        mediaCreation: {
          requiredSlideIds: [...state.mediaCreation.requiredSlideIds],
          confirmedItems: created,
        },
      };
    }
    case "MEMBERSHIP_PLAN_CONFIRMED":
      if (state.phase !== "MEDIA_VERIFIED") return invalidPhase(state);
      return {
        ...advance(state, "MEMBERSHIP_PLANNED"),
        membershipPlan: cloneMembershipPlan(event.plan),
      };
    case "MEMBERSHIP_VERIFIED_MATCH": {
      if (state.phase !== "MEMBERSHIP_PLANNED" || state.membershipPlan === null) {
        return invalidPhase(state);
      }
      const observed = event.observedMediaItemIds;
      if (
        !uniqueNonBlank(observed) ||
        !membershipMatchesPlan(observed, state.membershipPlan)
      ) {
        return stop(state, "MEMBERSHIP_MISMATCH", "AUTOMATIC_RETRY_FORBIDDEN");
      }
      return advance(state, "MEMBERSHIP_VERIFIED");
    }
    case "FINAL_VERIFICATION_PASSED":
      if (state.phase !== "MEMBERSHIP_VERIFIED") return invalidPhase(state);
      return {
        ...advance(state, "FINAL_READY"),
        finalVerification: "passed",
        canResume: false,
      };
  }
}

function inspectAuthority(
  state: GooglePhotosSyncRecoveryState,
  authority: GooglePhotosSyncRecoveryAuthority,
): GooglePhotosSyncRecoveryStopReason | null {
  if (authority.recoveryId !== state.recoveryId) return "RECOVERY_ID_MISMATCH";
  if (authority.concurrentOperationDetected) return "CONCURRENT_OPERATION";
  if (authority.unexpectedMembershipChange) return "MEMBERSHIP_DRIFT";
  if (authority.sourceFingerprint !== state.recoverySourceFingerprint) return "SOURCE_DRIFT";
  if (!stableEqual(authority.observedStable, state.originalStable)) return "STABLE_CHANGED";
  if (!pendingEqual(authority.observedPending, state.originalPending)) return "PENDING_CHANGED";
  return null;
}

function membershipMatchesPlan(
  observed: string[],
  plan: NonNullable<GooglePhotosSyncRecoveryState["membershipPlan"]>,
) {
  const current = new Set(observed);
  const target = new Set(plan.expectedRelativeOrder);
  const protectedUnmanaged = new Set(plan.unmanagedMediaItemIds);
  return (
    plan.expectedRelativeOrder.every((id) => current.has(id)) &&
    plan.unmanagedMediaItemIds.every((id) => current.has(id)) &&
    observed.every((id) => target.has(id) || protectedUnmanaged.has(id)) &&
    recoveryTargetIdsAppearInRelativeOrder(observed, plan.expectedRelativeOrder)
  );
}

function stateIntegrityIsValid(state: GooglePhotosSyncRecoveryState) {
  if (
    !isNonBlankTrimmedString(state.recoveryId) ||
    !validStable(state.originalStable) ||
    !validPending(state.originalPending) ||
    state.baseStableGeneration !== (state.originalStable?.generation ?? 0) ||
    state.originalPending.sourceFingerprint === state.recoverySourceFingerprint ||
    !uniqueNonBlank(state.initialMembershipMediaItemIds) ||
    !uniqueNonBlank(state.orderedTargetSlideIds)
  ) {
    return false;
  }
  const stableIds = state.originalStable?.items.map((item) => item.mediaItemId) ?? [];
  return arraysEqual(stableIds, state.originalPending.previousManagedMediaItemIds);
}

function validStable(value: GooglePhotosSyncRecoveryStableSnapshot) {
  return (
    value === null ||
    (Number.isSafeInteger(value.generation) &&
      value.generation >= 0 &&
      validManagedItems(value.items))
  );
}

function validPending(value: GooglePhotosSyncRecoveryPendingSnapshot) {
  return (
    isNonBlankTrimmedString(value.pendingIdentity) &&
    isNonBlankTrimmedString(value.phase) &&
    isNonBlankTrimmedString(value.sourceFingerprint) &&
    uniqueNonBlank(value.previousManagedMediaItemIds) &&
    validManagedItems(value.targetItems)
  );
}

function validManagedItems(items: GooglePhotosSyncRecoveryManagedItem[]) {
  if (!Array.isArray(items)) return false;
  const slides = new Set<string>();
  const media = new Set<string>();
  for (const item of items) {
    if (
      !isNonBlankTrimmedString(item.slideId) ||
      !isNonBlankTrimmedString(item.renderKey) ||
      !isNonBlankTrimmedString(item.mediaItemId) ||
      slides.has(item.slideId) ||
      media.has(item.mediaItemId)
    ) {
      return false;
    }
    slides.add(item.slideId);
    media.add(item.mediaItemId);
  }
  return true;
}

function normalizeCreatedItems(items: Array<{ slideId: string; mediaItemId: string }>) {
  if (!Array.isArray(items)) return null;
  const slides = new Set<string>();
  const media = new Set<string>();
  const result: Array<{ slideId: string; mediaItemId: string }> = [];
  for (const item of items) {
    if (
      !isNonBlankTrimmedString(item.slideId) ||
      !isNonBlankTrimmedString(item.mediaItemId) ||
      slides.has(item.slideId) ||
      media.has(item.mediaItemId)
    ) {
      return null;
    }
    slides.add(item.slideId);
    media.add(item.mediaItemId);
    result.push({ ...item });
  }
  return result;
}

function advance(
  state: GooglePhotosSyncRecoveryState,
  phase: GooglePhotosSyncRecoveryState["phase"],
): GooglePhotosSyncRecoveryState {
  return {
    ...cloneState(state),
    phase,
    canResume: phase !== "FINAL_READY",
    retryPolicy: "SAFE_FROM_CHECKPOINT",
    stopReason: null,
  };
}

function invalidPhase(state: GooglePhotosSyncRecoveryState) {
  return stop(state, "INVALID_PHASE", "AUTOMATIC_RETRY_FORBIDDEN");
}

function stop(
  state: GooglePhotosSyncRecoveryState,
  reason: GooglePhotosSyncRecoveryStopReason,
  retryPolicy: GooglePhotosSyncRecoveryRetryPolicy,
): GooglePhotosSyncRecoveryState {
  return {
    ...cloneState(state),
    phase: "RECOVERY_REQUIRED",
    canResume: retryPolicy !== "AUTOMATIC_RETRY_FORBIDDEN",
    retryPolicy,
    stopReason: reason,
  };
}

function cloneState(state: GooglePhotosSyncRecoveryState): GooglePhotosSyncRecoveryState {
  return {
    ...state,
    originalStable: cloneStable(state.originalStable),
    originalPending: clonePending(state.originalPending),
    initialMembershipMediaItemIds: [...state.initialMembershipMediaItemIds],
    orderedTargetSlideIds: [...state.orderedTargetSlideIds],
    classifications: state.classifications.map(cloneClassification),
    mediaCreation: {
      requiredSlideIds: [...state.mediaCreation.requiredSlideIds],
      confirmedItems: state.mediaCreation.confirmedItems.map((item) => ({ ...item })),
    },
    membershipPlan: state.membershipPlan
      ? cloneMembershipPlan(state.membershipPlan)
      : null,
  };
}

function cloneStable(
  stable: GooglePhotosSyncRecoveryStableSnapshot,
): GooglePhotosSyncRecoveryStableSnapshot {
  return stable
    ? { generation: stable.generation, items: stable.items.map((item) => ({ ...item })) }
    : null;
}

function clonePending(
  pending: GooglePhotosSyncRecoveryPendingSnapshot,
): GooglePhotosSyncRecoveryPendingSnapshot {
  return {
    ...pending,
    previousManagedMediaItemIds: [...pending.previousManagedMediaItemIds],
    targetItems: pending.targetItems.map((item) => ({ ...item })),
  };
}

function cloneClassification(
  classification: GooglePhotosSyncRecoveryClassification,
): GooglePhotosSyncRecoveryClassification {
  return { ...classification };
}

function cloneMembershipPlan(
  plan: NonNullable<GooglePhotosSyncRecoveryState["membershipPlan"]>,
) {
  return {
    ...plan,
    retainMediaItemIds: [...plan.retainMediaItemIds],
    createSlideIds: [...plan.createSlideIds],
    removeMembershipMediaItemIds: [...plan.removeMembershipMediaItemIds],
    addMembershipMediaItemIds: [...plan.addMembershipMediaItemIds],
    unmanagedMediaItemIds: [...plan.unmanagedMediaItemIds],
    expectedRelativeOrder: [...plan.expectedRelativeOrder],
    libraryDeleteMediaItemIds: [] as [],
  };
}

function stableEqual(
  left: GooglePhotosSyncRecoveryStableSnapshot,
  right: GooglePhotosSyncRecoveryStableSnapshot,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pendingEqual(
  left: GooglePhotosSyncRecoveryPendingSnapshot,
  right: GooglePhotosSyncRecoveryPendingSnapshot,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueNonBlank(values: readonly string[]) {
  return (
    Array.isArray(values) &&
    values.every(isNonBlankTrimmedString) &&
    new Set(values).size === values.length
  );
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}
