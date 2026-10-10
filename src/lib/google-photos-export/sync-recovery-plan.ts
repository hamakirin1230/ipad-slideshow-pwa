import type {
  GooglePhotosSyncRecoveryClassification,
  GooglePhotosSyncRecoveryClassificationFailureReason,
  GooglePhotosSyncRecoveryDesiredSlide,
  GooglePhotosSyncRecoveryFutureTarget,
  GooglePhotosSyncRecoveryManagedItem,
  GooglePhotosSyncRecoveryMembershipFailureReason,
  GooglePhotosSyncRecoveryMembershipPlan,
  GooglePhotosSyncVerifiedSuccessorRelation,
} from "./sync-recovery-types";

export type GooglePhotosSyncRecoveryClassificationResult =
  | { ok: true; classifications: GooglePhotosSyncRecoveryClassification[] }
  | { ok: false; reason: GooglePhotosSyncRecoveryClassificationFailureReason };

export type GooglePhotosSyncRecoveryMembershipPlanResult =
  | { ok: true; plan: GooglePhotosSyncRecoveryMembershipPlan }
  | { ok: false; reason: GooglePhotosSyncRecoveryMembershipFailureReason };

/**
 * Classifies app-owned mappings only. A matching renderKey identifies the
 * renderer inputs recorded by this app; it does not hash or prove remote pixels.
 */
export function classifyGooglePhotosSyncRecoveryTargets(input: {
  desiredSlides: GooglePhotosSyncRecoveryDesiredSlide[];
  stableItems: GooglePhotosSyncRecoveryManagedItem[];
  pendingTargetItems: GooglePhotosSyncRecoveryManagedItem[];
  albumMediaItemIds: string[];
  recoverySourceFingerprint: string;
  observedSourceFingerprint: string;
  confirmedPendingMediaItemIds: string[];
  verifiedSuccessorRelations: GooglePhotosSyncVerifiedSuccessorRelation[];
  ambiguousCreateSlideIds: string[];
}): GooglePhotosSyncRecoveryClassificationResult {
  if (
    !isNonBlankTrimmedString(input.recoverySourceFingerprint) ||
    !isNonBlankTrimmedString(input.observedSourceFingerprint) ||
    !arraysContainOnlyNonBlankStrings(input.confirmedPendingMediaItemIds) ||
    !arraysContainOnlyNonBlankStrings(input.ambiguousCreateSlideIds)
  ) {
    return failClassification("INVALID_INPUT");
  }
  if (input.recoverySourceFingerprint !== input.observedSourceFingerprint) {
    return failClassification("SOURCE_DRIFT");
  }

  const desiredValidation = validateDesired(input.desiredSlides);
  if (!desiredValidation.ok) return failClassification(desiredValidation.reason);
  const stableValidation = validateManagedItems(input.stableItems, "stable");
  if (!stableValidation.ok) return failClassification(stableValidation.reason);
  const pendingValidation = validateManagedItems(input.pendingTargetItems, "pending");
  if (!pendingValidation.ok) return failClassification(pendingValidation.reason);
  if (hasDuplicates(input.albumMediaItemIds)) {
    return failClassification("DUPLICATE_ALBUM_MEDIA_ID");
  }
  if (!arraysContainOnlyNonBlankStrings(input.albumMediaItemIds)) {
    return failClassification("INVALID_INPUT");
  }
  if (
    hasDuplicates(input.confirmedPendingMediaItemIds) ||
    hasDuplicates(input.ambiguousCreateSlideIds)
  ) {
    return failClassification("INVALID_INPUT");
  }

  const crossMediaOwner = new Map<string, string>();
  for (const item of [...input.stableItems, ...input.pendingTargetItems]) {
    const owner = crossMediaOwner.get(item.mediaItemId);
    if (owner !== undefined && owner !== item.slideId) {
      return failClassification("DUPLICATE_MANAGED_MEDIA_ID");
    }
    crossMediaOwner.set(item.mediaItemId, item.slideId);
  }

  const stableBySlide = new Map(input.stableItems.map((item) => [item.slideId, item]));
  const pendingBySlide = new Map(
    input.pendingTargetItems.map((item) => [item.slideId, item]),
  );
  const pendingMedia = new Set(input.pendingTargetItems.map((item) => item.mediaItemId));
  if (input.confirmedPendingMediaItemIds.some((id) => !pendingMedia.has(id))) {
    return failClassification("INVALID_INPUT");
  }
  const successorBySlide = validateSuccessorRelations(
    input.verifiedSuccessorRelations,
    stableBySlide,
    pendingBySlide,
  );
  if (!successorBySlide) return failClassification("INVALID_SUCCESSOR_RELATION");

  const albumMembership = new Set(input.albumMediaItemIds);
  const confirmedPending = new Set(input.confirmedPendingMediaItemIds);
  const ambiguousSlides = new Set(input.ambiguousCreateSlideIds);
  const classifications = input.desiredSlides.map((desired) => {
    const stable = stableBySlide.get(desired.slideId);
    const pending = pendingBySlide.get(desired.slideId);

    if (ambiguousSlides.has(desired.slideId)) {
      return indeterminate(desired, "AMBIGUOUS_MEDIA_CREATE");
    }

    const history = resolveHistory({
      stable,
      pending,
      successor: successorBySlide.get(desired.slideId),
      confirmedPending,
    });
    if (!history.ok) return indeterminate(desired, history.reason);
    if (!desired.reuseEligible) {
      return createRequired(desired, "REUSE_NOT_ELIGIBLE");
    }
    if (history.candidates.length === 0) {
      return createRequired(desired, "NO_MANAGED_CANDIDATE");
    }

    const matching = history.candidates.filter(
      (candidate) => candidate.renderKey === desired.renderKey,
    );
    if (matching.length === 0) {
      return createRequired(desired, "RENDER_KEY_CHANGED");
    }
    const selected =
      matching.find((candidate) => candidate.provenance === "pending") ?? matching[0]!;
    if (!albumMembership.has(selected.mediaItemId)) {
      return createRequired(desired, "CANDIDATE_MISSING_FROM_MEMBERSHIP");
    }
    return {
      classification: "REUSE_CANDIDATE" as const,
      reason: "PROVEN_MATCH_PRESENT" as const,
      slideId: desired.slideId,
      renderKey: desired.renderKey,
      mediaItemId: selected.mediaItemId,
      provenance: history.combined
        ? ("stable_and_pending" as const)
        : selected.provenance,
    };
  });

  return { ok: true, classifications };
}

export function planGooglePhotosSyncRecoveryMembership(input: {
  currentAlbumMediaItemIds: string[];
  stableItems: GooglePhotosSyncRecoveryManagedItem[];
  pendingTargetItems: GooglePhotosSyncRecoveryManagedItem[];
  futureTargetItems: GooglePhotosSyncRecoveryFutureTarget[];
  classifications: GooglePhotosSyncRecoveryClassification[];
  provenManagedMediaItemIds: string[];
  remoteOrderCapability: "unverified" | "request_order_documented" | "unsupported";
  differentIdContentDuplicateRisk: boolean;
}): GooglePhotosSyncRecoveryMembershipPlanResult {
  if (
    !arraysContainOnlyNonBlankStrings(input.currentAlbumMediaItemIds) ||
    !arraysContainOnlyNonBlankStrings(input.provenManagedMediaItemIds) ||
    typeof input.differentIdContentDuplicateRisk !== "boolean"
  ) {
    return failMembership("INVALID_INPUT");
  }
  if (hasDuplicates(input.currentAlbumMediaItemIds)) {
    return failMembership("DUPLICATE_ALBUM_MEDIA_ID");
  }
  if (hasDuplicates(input.provenManagedMediaItemIds)) {
    return failMembership("DUPLICATE_PROVEN_MEDIA_ID");
  }
  const stableValidation = validateManagedItems(input.stableItems, "stable");
  const pendingValidation = validateManagedItems(input.pendingTargetItems, "pending");
  if (!stableValidation.ok || !pendingValidation.ok) {
    return failMembership("INVALID_INPUT");
  }
  const futureValidation = validateFutureTargets(input.futureTargetItems);
  if (!futureValidation.ok) return failMembership(futureValidation.reason);
  if (input.classifications.some((item) => item.classification === "INDETERMINATE")) {
    return failMembership("CLASSIFICATION_INDETERMINATE");
  }
  if (input.differentIdContentDuplicateRisk) {
    return failMembership("CONTENT_DUPLICATION_UNVERIFIABLE");
  }

  const classificationsBySlide = new Map(
    input.classifications.map((item) => [item.slideId, item]),
  );
  if (
    classificationsBySlide.size !== input.classifications.length ||
    input.futureTargetItems.some((item) => !classificationsBySlide.has(item.slideId)) ||
    input.classifications.some(
      (item) => !input.futureTargetItems.some((target) => target.slideId === item.slideId),
    )
  ) {
    return failMembership("TARGET_CLASSIFICATION_MISMATCH");
  }

  const knownStable = new Map(input.stableItems.map((item) => [item.mediaItemId, item]));
  const knownPending = new Map(
    input.pendingTargetItems.map((item) => [item.mediaItemId, item]),
  );
  const futureByMedia = new Map(
    input.futureTargetItems.map((item) => [item.mediaItemId, item]),
  );
  const proven = new Set(input.provenManagedMediaItemIds);
  const knownManagedIds = new Set([...knownStable.keys(), ...knownPending.keys()]);
  if ([...knownManagedIds].some((id) => !proven.has(id))) {
    return failMembership("UNPROVEN_MANAGED_IDENTITY");
  }
  for (const target of input.futureTargetItems) {
    if (!proven.has(target.mediaItemId)) {
      return failMembership("FUTURE_TARGET_NOT_PROVEN");
    }
    if (
      target.provenance === "stable" &&
      knownStable.get(target.mediaItemId)?.slideId !== target.slideId
    ) {
      return failMembership("FUTURE_TARGET_NOT_PROVEN");
    }
    if (
      target.provenance === "pending" &&
      knownPending.get(target.mediaItemId)?.slideId !== target.slideId
    ) {
      return failMembership("FUTURE_TARGET_NOT_PROVEN");
    }
    if (
      target.provenance === "created_verified" &&
      (knownStable.has(target.mediaItemId) || knownPending.has(target.mediaItemId))
    ) {
      return failMembership("FUTURE_TARGET_NOT_PROVEN");
    }
  }
  if (
    input.provenManagedMediaItemIds.some(
      (id) => !knownManagedIds.has(id) && !futureByMedia.has(id),
    )
  ) {
    return failMembership("UNPROVEN_MANAGED_IDENTITY");
  }

  const targetIds = input.futureTargetItems.map((item) => item.mediaItemId);
  const targetSet = new Set(targetIds);
  const currentSet = new Set(input.currentAlbumMediaItemIds);
  const currentManaged = input.currentAlbumMediaItemIds.filter((id) => proven.has(id));
  const unmanaged = input.currentAlbumMediaItemIds.filter((id) => !proven.has(id));
  const managedComplete = targetIds.every((id) => currentSet.has(id));
  const obsoleteManagedAbsent = currentManaged.every((id) => targetSet.has(id));
  const ordered = recoveryTargetIdsAppearInRelativeOrder(
    input.currentAlbumMediaItemIds,
    targetIds,
  );
  const noMutationRequired = managedComplete && obsoleteManagedAbsent && ordered;

  if (!noMutationRequired && input.remoteOrderCapability === "unsupported") {
    return failMembership("REMOTE_ORDER_UNSUPPORTED");
  }

  return {
    ok: true,
    plan: {
      disposition: noMutationRequired
        ? "fully_provable_local_plan"
        : "requires_remote_verification",
      retainMediaItemIds: [...unmanaged],
      createSlideIds: input.classifications.flatMap((item) =>
        item.classification === "CREATE_REQUIRED" ? [item.slideId] : [],
      ),
      removeMembershipMediaItemIds: noMutationRequired ? [] : [...currentManaged],
      addMembershipMediaItemIds: noMutationRequired ? [] : [...targetIds],
      unmanagedMediaItemIds: [...unmanaged],
      expectedRelativeOrder: [...targetIds],
      verificationRequired: true,
      remoteOrderAssumption:
        input.remoteOrderCapability === "request_order_documented"
          ? "request_order_documented"
          : "unverified",
      libraryDeleteMediaItemIds: [],
    },
  };
}

export function recoveryTargetIdsAppearInRelativeOrder(
  currentIds: readonly string[],
  targetIds: readonly string[],
) {
  if (targetIds.length === 0 || new Set(targetIds).size !== targetIds.length) {
    return false;
  }
  let targetIndex = 0;
  for (const currentId of currentIds) {
    if (currentId === targetIds[targetIndex]) targetIndex += 1;
    if (targetIndex === targetIds.length) return true;
  }
  return false;
}

function resolveHistory(input: {
  stable: GooglePhotosSyncRecoveryManagedItem | undefined;
  pending: GooglePhotosSyncRecoveryManagedItem | undefined;
  successor: GooglePhotosSyncVerifiedSuccessorRelation | undefined;
  confirmedPending: Set<string>;
}):
  | {
      ok: true;
      candidates: Array<
        GooglePhotosSyncRecoveryManagedItem & { provenance: "stable" | "pending" }
      >;
      combined: boolean;
    }
  | {
      ok: false;
      reason: "CONFLICTING_MANAGED_HISTORY" | "UNVERIFIED_PENDING_PROVENANCE";
    } {
  if (!input.stable && !input.pending) {
    return { ok: true, candidates: [], combined: false };
  }
  if (input.stable && !input.pending) {
    return {
      ok: true,
      candidates: [{ ...input.stable, provenance: "stable" }],
      combined: false,
    };
  }
  if (!input.stable && input.pending) {
    if (!input.confirmedPending.has(input.pending.mediaItemId)) {
      return { ok: false, reason: "UNVERIFIED_PENDING_PROVENANCE" };
    }
    return {
      ok: true,
      candidates: [{ ...input.pending, provenance: "pending" }],
      combined: false,
    };
  }

  const stable = input.stable!;
  const pending = input.pending!;
  if (stable.mediaItemId === pending.mediaItemId) {
    if (stable.renderKey !== pending.renderKey) {
      return { ok: false, reason: "CONFLICTING_MANAGED_HISTORY" };
    }
    return {
      ok: true,
      candidates: [{ ...pending, provenance: "pending" }],
      combined: true,
    };
  }
  if (!input.successor) {
    return { ok: false, reason: "CONFLICTING_MANAGED_HISTORY" };
  }
  return {
    ok: true,
    candidates: [
      { ...stable, provenance: "stable" },
      { ...pending, provenance: "pending" },
    ],
    combined: false,
  };
}

function validateSuccessorRelations(
  relations: GooglePhotosSyncVerifiedSuccessorRelation[],
  stableBySlide: Map<string, GooglePhotosSyncRecoveryManagedItem>,
  pendingBySlide: Map<string, GooglePhotosSyncRecoveryManagedItem>,
) {
  if (!Array.isArray(relations)) return null;
  const bySlide = new Map<string, GooglePhotosSyncVerifiedSuccessorRelation>();
  for (const relation of relations) {
    if (
      !isNonBlankTrimmedString(relation.slideId) ||
      !isNonBlankTrimmedString(relation.stableMediaItemId) ||
      !isNonBlankTrimmedString(relation.pendingMediaItemId) ||
      bySlide.has(relation.slideId) ||
      relation.stableMediaItemId === relation.pendingMediaItemId ||
      stableBySlide.get(relation.slideId)?.mediaItemId !== relation.stableMediaItemId ||
      pendingBySlide.get(relation.slideId)?.mediaItemId !== relation.pendingMediaItemId
    ) {
      return null;
    }
    bySlide.set(relation.slideId, { ...relation });
  }
  return bySlide;
}

function validateDesired(
  items: GooglePhotosSyncRecoveryDesiredSlide[],
):
  | { ok: true }
  | { ok: false; reason: "INVALID_INPUT" | "DUPLICATE_DESIRED_SLIDE_ID" } {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, reason: "INVALID_INPUT" };
  const slideIds = new Set<string>();
  for (const item of items) {
    if (
      !isNonBlankTrimmedString(item.slideId) ||
      !isNonBlankTrimmedString(item.renderKey) ||
      typeof item.reuseEligible !== "boolean"
    ) {
      return { ok: false, reason: "INVALID_INPUT" };
    }
    if (slideIds.has(item.slideId)) {
      return { ok: false, reason: "DUPLICATE_DESIRED_SLIDE_ID" };
    }
    slideIds.add(item.slideId);
  }
  return { ok: true };
}

function validateManagedItems(
  items: GooglePhotosSyncRecoveryManagedItem[],
  kind: "stable" | "pending",
):
  | { ok: true }
  | {
      ok: false;
      reason:
        | "INVALID_INPUT"
        | "DUPLICATE_STABLE_SLIDE_ID"
        | "DUPLICATE_PENDING_SLIDE_ID"
        | "DUPLICATE_MANAGED_MEDIA_ID";
    } {
  if (!Array.isArray(items)) return { ok: false, reason: "INVALID_INPUT" };
  const slideIds = new Set<string>();
  const mediaIds = new Set<string>();
  for (const item of items) {
    if (
      !isNonBlankTrimmedString(item.slideId) ||
      !isNonBlankTrimmedString(item.renderKey) ||
      !isNonBlankTrimmedString(item.mediaItemId)
    ) {
      return { ok: false, reason: "INVALID_INPUT" };
    }
    if (slideIds.has(item.slideId)) {
      return {
        ok: false,
        reason:
          kind === "stable"
            ? "DUPLICATE_STABLE_SLIDE_ID"
            : "DUPLICATE_PENDING_SLIDE_ID",
      };
    }
    if (mediaIds.has(item.mediaItemId)) {
      return { ok: false, reason: "DUPLICATE_MANAGED_MEDIA_ID" };
    }
    slideIds.add(item.slideId);
    mediaIds.add(item.mediaItemId);
  }
  return { ok: true };
}

function validateFutureTargets(
  items: GooglePhotosSyncRecoveryFutureTarget[],
):
  | { ok: true }
  | {
      ok: false;
      reason:
        | "INVALID_INPUT"
        | "DUPLICATE_FUTURE_SLIDE_ID"
        | "DUPLICATE_FUTURE_MEDIA_ID";
    } {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, reason: "INVALID_INPUT" };
  const slides = new Set<string>();
  const media = new Set<string>();
  for (const item of items) {
    if (
      !isNonBlankTrimmedString(item.slideId) ||
      !isNonBlankTrimmedString(item.mediaItemId) ||
      !["stable", "pending", "created_verified"].includes(item.provenance)
    ) {
      return { ok: false, reason: "INVALID_INPUT" };
    }
    if (slides.has(item.slideId)) return { ok: false, reason: "DUPLICATE_FUTURE_SLIDE_ID" };
    if (media.has(item.mediaItemId)) return { ok: false, reason: "DUPLICATE_FUTURE_MEDIA_ID" };
    slides.add(item.slideId);
    media.add(item.mediaItemId);
  }
  return { ok: true };
}

function createRequired(
  desired: GooglePhotosSyncRecoveryDesiredSlide,
  reason: Extract<GooglePhotosSyncRecoveryClassification, { classification: "CREATE_REQUIRED" }>["reason"],
): GooglePhotosSyncRecoveryClassification {
  return {
    classification: "CREATE_REQUIRED",
    reason,
    slideId: desired.slideId,
    renderKey: desired.renderKey,
  };
}

function indeterminate(
  desired: GooglePhotosSyncRecoveryDesiredSlide,
  reason: Extract<GooglePhotosSyncRecoveryClassification, { classification: "INDETERMINATE" }>["reason"],
): GooglePhotosSyncRecoveryClassification {
  return {
    classification: "INDETERMINATE",
    reason,
    slideId: desired.slideId,
    renderKey: desired.renderKey,
  };
}

function arraysContainOnlyNonBlankStrings(values: unknown): values is string[] {
  return Array.isArray(values) && values.every(isNonBlankTrimmedString);
}

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function failClassification(
  reason: GooglePhotosSyncRecoveryClassificationFailureReason,
): GooglePhotosSyncRecoveryClassificationResult {
  return { ok: false, reason };
}

function failMembership(
  reason: GooglePhotosSyncRecoveryMembershipFailureReason,
): GooglePhotosSyncRecoveryMembershipPlanResult {
  return { ok: false, reason };
}
