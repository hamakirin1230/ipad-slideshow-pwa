import {
  parseGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
} from "./sync-binding";
import {
  createGooglePhotosSyncRecoveryCheckpoint,
  parseGooglePhotosSyncRecoveryCheckpoint,
  type GooglePhotosSyncRecoveryCheckpoint,
} from "./sync-recovery-checkpoint";
import { recoveryTargetIdsAppearInRelativeOrder } from "./sync-recovery-plan";
import { createGooglePhotosSyncRecoveryState } from "./sync-recovery-transition";
import type {
  GooglePhotosSyncRecoveryClassification,
  GooglePhotosSyncRecoveryCreatedItem,
  GooglePhotosSyncRecoveryManagedItem,
  GooglePhotosSyncRecoveryPendingSnapshot,
  GooglePhotosSyncRecoveryPhase,
  GooglePhotosSyncRecoveryStableSnapshot,
  GooglePhotosSyncRecoveryStopReason,
} from "./sync-recovery-types";

export const GOOGLE_PHOTOS_SYNC_RECOVERY_JOURNAL_SCHEMA_VERSION = 3;

export type GooglePhotosSyncRecoveryJournalFinalCandidate = {
  status: "not_ready" | "final_candidate";
  observedMembershipMediaItemIds: string[];
};

/**
 * An isolated recovery journal. It is deliberately not a replacement for the
 * production schema-v2 binding and carries an explicit deny bit for writes.
 */
export type GooglePhotosSyncRecoveryJournalV3 = {
  schemaVersion: typeof GOOGLE_PHOTOS_SYNC_RECOVERY_JOURNAL_SCHEMA_VERSION;
  recoveryId: string;
  workspaceId: string;
  projectId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  sourceBinding: GooglePhotosSyncBinding;
  originalStable: GooglePhotosSyncRecoveryStableSnapshot;
  originalPending: GooglePhotosSyncRecoveryPendingSnapshot;
  baseStableGeneration: number;
  recoverySourceFingerprint: string;
  remotePixelEquality: "unknown";
  initialMembershipMediaItemIds: string[];
  confirmedPendingMediaItemIds: string[];
  orderedTargetSlideIds: string[];
  classifications: GooglePhotosSyncRecoveryClassification[];
  createdItems: GooglePhotosSyncRecoveryCreatedItem[];
  protectedUnmanagedMediaItemIds: string[];
  expectedTargetMediaItemIds: string[] | null;
  verifiedMembershipMediaItemIds: string[] | null;
  phase: GooglePhotosSyncRecoveryPhase;
  mediaCheckpoint: GooglePhotosSyncRecoveryCheckpoint;
  membershipCheckpoint: GooglePhotosSyncRecoveryCheckpoint;
  finalCandidate: GooglePhotosSyncRecoveryJournalFinalCandidate;
  stopReason: GooglePhotosSyncRecoveryStopReason | null;
  canResume: boolean;
  productionWriteAllowed: false;
  atomicCommitProven: false;
};

export type GooglePhotosSyncRecoveryJournalFailureReason =
  | "MALFORMED"
  | "UNKNOWN_PROPERTY"
  | "UNSUPPORTED_SCHEMA"
  | "INVALID_TIMESTAMP"
  | "DUPLICATE_ID"
  | "INVALID_V2_BINDING"
  | "SNAPSHOT_MISMATCH"
  | "INVALID_RECOVERY_STATE"
  | "INVALID_CHECKPOINT"
  | "INVALID_INVARIANT"
  | "PRODUCTION_WRITE_AUTHORITY_FORBIDDEN";

export type GooglePhotosSyncRecoveryJournalResult =
  | { ok: true; journal: GooglePhotosSyncRecoveryJournalV3 }
  | { ok: false; reason: GooglePhotosSyncRecoveryJournalFailureReason };

const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "recoveryId",
  "workspaceId",
  "projectId",
  "revision",
  "createdAt",
  "updatedAt",
  "sourceBinding",
  "originalStable",
  "originalPending",
  "baseStableGeneration",
  "recoverySourceFingerprint",
  "remotePixelEquality",
  "initialMembershipMediaItemIds",
  "confirmedPendingMediaItemIds",
  "orderedTargetSlideIds",
  "classifications",
  "createdItems",
  "protectedUnmanagedMediaItemIds",
  "expectedTargetMediaItemIds",
  "verifiedMembershipMediaItemIds",
  "phase",
  "mediaCheckpoint",
  "membershipCheckpoint",
  "finalCandidate",
  "stopReason",
  "canResume",
  "productionWriteAllowed",
  "atomicCommitProven",
] as const;
const STABLE_KEYS = ["generation", "items"] as const;
const PENDING_KEYS = [
  "pendingIdentity",
  "phase",
  "sourceFingerprint",
  "previousManagedMediaItemIds",
  "targetItems",
] as const;
const MANAGED_ITEM_KEYS = ["slideId", "renderKey", "mediaItemId"] as const;
const CREATED_ITEM_KEYS = ["slideId", "mediaItemId"] as const;
const FINAL_CANDIDATE_KEYS = [
  "status",
  "observedMembershipMediaItemIds",
] as const;
const ISO_8601_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const PHASES: readonly GooglePhotosSyncRecoveryPhase[] = [
  "PREFLIGHT",
  "PLANNED",
  "MEDIA_CREATING",
  "MEDIA_VERIFIED",
  "MEMBERSHIP_PLANNED",
  "MEMBERSHIP_VERIFIED",
  "FINAL_READY",
  "RECOVERY_REQUIRED",
];

const STOP_REASONS: readonly GooglePhotosSyncRecoveryStopReason[] = [
  "CLASSIFICATION_INDETERMINATE",
  "PRE_MEDIA_INTERRUPTED",
  "UPLOAD_INTERRUPTED",
  "MEDIA_CREATION_RESULT_UNKNOWN",
  "MEDIA_CREATION_PARTIAL",
  "CREATED_ITEMS_INCOMPLETE",
  "CREATED_ITEM_CONFLICT",
  "CHECKPOINT_FAILED",
  "MEMBERSHIP_RESULT_UNKNOWN",
  "MEMBERSHIP_PARTIAL",
  "MEMBERSHIP_MISMATCH",
  "MEMBERSHIP_PLAN_INVALID",
  "MEMBERSHIP_DRIFT",
  "SOURCE_DRIFT",
  "STABLE_CHANGED",
  "PENDING_CHANGED",
  "CONCURRENT_OPERATION",
  "DUPLICATE_OPERATION",
  "RECOVERY_ID_MISMATCH",
  "FINAL_CANDIDATE_UNKNOWN",
  "PENDING_END_UNKNOWN",
  "INVALID_PHASE",
  "STATE_INTEGRITY_FAILED",
];

export function createGooglePhotosSyncRecoveryJournalV3FromBinding(input: {
  binding: unknown;
  expected: { workspaceId: string; projectId: string };
  recoveryId: string;
  now: string;
  recoverySourceFingerprint: string;
  initialMembershipMediaItemIds: string[];
  confirmedPendingMediaItemIds: string[];
  orderedTargetSlideIds: string[];
  classifications: GooglePhotosSyncRecoveryClassification[];
}): GooglePhotosSyncRecoveryJournalResult {
  if (
    !isJsonObject(input.binding) ||
    input.binding.schemaVersion !== 2
  ) {
    return failure("INVALID_V2_BINDING");
  }
  const parsedBinding = parseGooglePhotosSyncBinding(input.binding, input.expected);
  if (!parsedBinding.ok || parsedBinding.value.pending === null) {
    return failure("INVALID_V2_BINDING");
  }
  if (!isNonBlankString(input.recoveryId) || !isValidTimestamp(input.now)) {
    return failure("MALFORMED");
  }
  const sourceBinding = parsedBinding.value;
  const originalStable = toRecoveryStable(sourceBinding);
  const originalPending = toRecoveryPending(sourceBinding);
  if (originalPending === null) return failure("INVALID_V2_BINDING");

  const stateResult = createGooglePhotosSyncRecoveryState({
    recoveryId: input.recoveryId,
    originalStable,
    originalPending,
    initialMembershipMediaItemIds: input.initialMembershipMediaItemIds,
    confirmedPendingMediaItemIds: input.confirmedPendingMediaItemIds,
    recoverySourceFingerprint: input.recoverySourceFingerprint,
    orderedTargetSlideIds: input.orderedTargetSlideIds,
    classifications: input.classifications,
  });
  if (!stateResult.ok) return failure("INVALID_RECOVERY_STATE");

  const historicalManaged = new Set([
    ...(originalStable?.items.map((item) => item.mediaItemId) ?? []),
    ...originalPending.targetItems.map((item) => item.mediaItemId),
  ]);
  const protectedUnmanagedMediaItemIds = input.initialMembershipMediaItemIds.filter(
    (id) => !historicalManaged.has(id),
  );
  const mediaCheckpoint = createGooglePhotosSyncRecoveryCheckpoint({
    checkpointId: `${input.recoveryId}:media`,
    recoveryId: input.recoveryId,
    operation: "media_creation",
    journalRevision: 1,
    targetIdentities: stateResult.state.mediaCreation.requiredSlideIds,
  });
  const membershipCheckpoint = createGooglePhotosSyncRecoveryCheckpoint({
    checkpointId: `${input.recoveryId}:membership`,
    recoveryId: input.recoveryId,
    operation: "membership_update",
    journalRevision: 1,
    targetIdentities: input.orderedTargetSlideIds,
  });
  if (!mediaCheckpoint.ok || !membershipCheckpoint.ok) {
    return failure("INVALID_CHECKPOINT");
  }

  return parseGooglePhotosSyncRecoveryJournalV3({
    schemaVersion: GOOGLE_PHOTOS_SYNC_RECOVERY_JOURNAL_SCHEMA_VERSION,
    recoveryId: input.recoveryId,
    workspaceId: sourceBinding.workspaceId,
    projectId: sourceBinding.projectId,
    revision: 1,
    createdAt: input.now,
    updatedAt: input.now,
    sourceBinding,
    originalStable,
    originalPending,
    baseStableGeneration: originalStable?.generation ?? 0,
    recoverySourceFingerprint: input.recoverySourceFingerprint,
    remotePixelEquality: "unknown",
    initialMembershipMediaItemIds: [...input.initialMembershipMediaItemIds],
    confirmedPendingMediaItemIds: [...input.confirmedPendingMediaItemIds],
    orderedTargetSlideIds: [...input.orderedTargetSlideIds],
    classifications: input.classifications.map((item) => ({ ...item })),
    createdItems: [],
    protectedUnmanagedMediaItemIds,
    expectedTargetMediaItemIds: null,
    verifiedMembershipMediaItemIds: null,
    phase: "PREFLIGHT",
    mediaCheckpoint: mediaCheckpoint.checkpoint,
    membershipCheckpoint: membershipCheckpoint.checkpoint,
    finalCandidate: {
      status: "not_ready",
      observedMembershipMediaItemIds: [],
    },
    stopReason: null,
    canResume: true,
    productionWriteAllowed: false,
    atomicCommitProven: false,
  });
}

export function parseGooglePhotosSyncRecoveryJournalV3(
  input: unknown,
): GooglePhotosSyncRecoveryJournalResult {
  if (!isJsonObject(input)) return failure("MALFORMED");
  if (!hasExactKeys(input, TOP_LEVEL_KEYS)) return failure("UNKNOWN_PROPERTY");
  if (input.schemaVersion !== GOOGLE_PHOTOS_SYNC_RECOVERY_JOURNAL_SCHEMA_VERSION) {
    return failure("UNSUPPORTED_SCHEMA");
  }
  if (input.productionWriteAllowed !== false || input.atomicCommitProven !== false) {
    return failure("PRODUCTION_WRITE_AUTHORITY_FORBIDDEN");
  }
  if (
    !isNonBlankString(input.recoveryId) ||
    !isNonBlankString(input.workspaceId) ||
    !isNonBlankString(input.projectId) ||
    !isPositiveInteger(input.revision) ||
    !isNonBlankString(input.recoverySourceFingerprint) ||
    input.remotePixelEquality !== "unknown" ||
    !isPhase(input.phase) ||
    (input.stopReason !== null && !isStopReason(input.stopReason)) ||
    typeof input.canResume !== "boolean" ||
    !isUniqueStrings(input.initialMembershipMediaItemIds, false) ||
    !isUniqueStrings(input.confirmedPendingMediaItemIds, true) ||
    !isUniqueStrings(input.orderedTargetSlideIds, false) ||
    !isUniqueStrings(input.protectedUnmanagedMediaItemIds, true)
  ) {
    return failure("MALFORMED");
  }
  if (!isValidTimestamp(input.createdAt) || !isValidTimestamp(input.updatedAt)) {
    return failure("INVALID_TIMESTAMP");
  }
  if (Date.parse(input.updatedAt) < Date.parse(input.createdAt)) {
    return failure("INVALID_TIMESTAMP");
  }

  if (
    !isJsonObject(input.sourceBinding) ||
    input.sourceBinding.schemaVersion !== 2
  ) {
    return failure("INVALID_V2_BINDING");
  }
  const binding = parseGooglePhotosSyncBinding(input.sourceBinding, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });
  if (!binding.ok || binding.value.pending === null) {
    return failure("INVALID_V2_BINDING");
  }
  const stable = parseStableSnapshot(input.originalStable);
  const pending = parsePendingSnapshot(input.originalPending);
  if (!stable.ok || !pending.ok) return failure("MALFORMED");
  if (
    !deepEqual(stable.value, toRecoveryStable(binding.value)) ||
    !deepEqual(pending.value, toRecoveryPending(binding.value))
  ) {
    return failure("SNAPSHOT_MISMATCH");
  }
  if (
    !Number.isSafeInteger(input.baseStableGeneration) ||
    input.baseStableGeneration !== (stable.value?.generation ?? 0)
  ) {
    return failure("SNAPSHOT_MISMATCH");
  }

  const classifications = parseClassifications(input.classifications);
  const createdItems = parseCreatedItems(input.createdItems);
  const expectedTargetMediaItemIds = parseNullableUniqueStrings(
    input.expectedTargetMediaItemIds,
  );
  const verifiedMembershipMediaItemIds = parseNullableUniqueStrings(
    input.verifiedMembershipMediaItemIds,
  );
  const finalCandidate = parseFinalCandidate(input.finalCandidate);
  if (
    !classifications.ok ||
    !createdItems.ok ||
    !expectedTargetMediaItemIds.ok ||
    !verifiedMembershipMediaItemIds.ok ||
    !finalCandidate.ok
  ) {
    return failure("MALFORMED");
  }

  const mediaCheckpoint = parseGooglePhotosSyncRecoveryCheckpoint(
    input.mediaCheckpoint,
  );
  const membershipCheckpoint = parseGooglePhotosSyncRecoveryCheckpoint(
    input.membershipCheckpoint,
  );
  if (!mediaCheckpoint.ok || !membershipCheckpoint.ok) {
    return failure("INVALID_CHECKPOINT");
  }

  const journal: GooglePhotosSyncRecoveryJournalV3 = {
    schemaVersion: GOOGLE_PHOTOS_SYNC_RECOVERY_JOURNAL_SCHEMA_VERSION,
    recoveryId: input.recoveryId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    revision: input.revision,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    sourceBinding: binding.value,
    originalStable: stable.value,
    originalPending: pending.value,
    baseStableGeneration: input.baseStableGeneration,
    recoverySourceFingerprint: input.recoverySourceFingerprint,
    remotePixelEquality: "unknown",
    initialMembershipMediaItemIds: [...input.initialMembershipMediaItemIds],
    confirmedPendingMediaItemIds: [...input.confirmedPendingMediaItemIds],
    orderedTargetSlideIds: [...input.orderedTargetSlideIds],
    classifications: classifications.value,
    createdItems: createdItems.value,
    protectedUnmanagedMediaItemIds: [...input.protectedUnmanagedMediaItemIds],
    expectedTargetMediaItemIds: expectedTargetMediaItemIds.value,
    verifiedMembershipMediaItemIds: verifiedMembershipMediaItemIds.value,
    phase: input.phase,
    mediaCheckpoint: mediaCheckpoint.checkpoint,
    membershipCheckpoint: membershipCheckpoint.checkpoint,
    finalCandidate: finalCandidate.value,
    stopReason: input.stopReason,
    canResume: input.canResume,
    productionWriteAllowed: false,
    atomicCommitProven: false,
  };

  if (!journalInvariantsHold(journal)) return failure("INVALID_INVARIANT");
  return { ok: true, journal };
}

export function parseGooglePhotosSyncRecoveryJournalV3Json(
  text: string,
): GooglePhotosSyncRecoveryJournalResult {
  try {
    return parseGooglePhotosSyncRecoveryJournalV3(JSON.parse(text) as unknown);
  } catch {
    return failure("MALFORMED");
  }
}

export function stringifyGooglePhotosSyncRecoveryJournalV3(
  journal: GooglePhotosSyncRecoveryJournalV3,
) {
  const parsed = parseGooglePhotosSyncRecoveryJournalV3(journal);
  if (!parsed.ok) throw new TypeError("Invalid Google Photos recovery journal.");
  return `${JSON.stringify(parsed.journal, null, 2)}\n`;
}

function journalInvariantsHold(journal: GooglePhotosSyncRecoveryJournalV3) {
  if (
    journal.workspaceId !== journal.sourceBinding.workspaceId ||
    journal.projectId !== journal.sourceBinding.projectId ||
    journal.mediaCheckpoint.recoveryId !== journal.recoveryId ||
    journal.membershipCheckpoint.recoveryId !== journal.recoveryId ||
    journal.mediaCheckpoint.checkpointId ===
      journal.membershipCheckpoint.checkpointId ||
    journal.mediaCheckpoint.operation !== "media_creation" ||
    journal.membershipCheckpoint.operation !== "membership_update" ||
    journal.mediaCheckpoint.journalRevision > journal.revision ||
    journal.membershipCheckpoint.journalRevision > journal.revision
  ) {
    return false;
  }
  const state = createGooglePhotosSyncRecoveryState({
    recoveryId: journal.recoveryId,
    originalStable: journal.originalStable,
    originalPending: journal.originalPending,
    initialMembershipMediaItemIds: journal.initialMembershipMediaItemIds,
    confirmedPendingMediaItemIds: journal.confirmedPendingMediaItemIds,
    recoverySourceFingerprint: journal.recoverySourceFingerprint,
    orderedTargetSlideIds: journal.orderedTargetSlideIds,
    classifications: journal.classifications,
  });
  if (!state.ok) return false;
  const reuseMediaItemIds = journal.classifications.flatMap((item) =>
    item.classification === "REUSE_CANDIDATE" ? [item.mediaItemId] : [],
  );
  if (new Set(reuseMediaItemIds).size !== reuseMediaItemIds.length) return false;
  if (
    !arraysEqual(
      journal.mediaCheckpoint.targetIdentities,
      state.state.mediaCreation.requiredSlideIds,
    ) ||
    !arraysEqual(
      journal.membershipCheckpoint.targetIdentities,
      journal.orderedTargetSlideIds,
    )
  ) {
    return false;
  }
  const historicalManaged = new Set([
    ...(journal.originalStable?.items.map((item) => item.mediaItemId) ?? []),
    ...journal.originalPending.targetItems.map((item) => item.mediaItemId),
  ]);
  const expectedUnmanaged = journal.initialMembershipMediaItemIds.filter(
    (id) => !historicalManaged.has(id),
  );
  if (!arraysEqual(journal.protectedUnmanagedMediaItemIds, expectedUnmanaged)) {
    return false;
  }
  const required = state.state.mediaCreation.requiredSlideIds;
  if (
    journal.createdItems.some(
      (item, index) => item.slideId !== required[index],
    ) ||
    journal.createdItems.length > required.length
  ) {
    return false;
  }
  if (
    journal.mediaCheckpoint.status === "succeeded_verified" &&
    (journal.createdItems.length !== required.length ||
      !arraysEqual(
        journal.mediaCheckpoint.confirmedResultIds,
        journal.createdItems.map((item) => item.mediaItemId),
      ))
  ) {
    return false;
  }
  const derivedTargetIds = deriveTargetMediaItemIds(journal);
  if (
    journal.expectedTargetMediaItemIds !== null &&
    (!derivedTargetIds ||
      !arraysEqual(journal.expectedTargetMediaItemIds, derivedTargetIds))
  ) {
    return false;
  }
  const membershipSucceeded =
    journal.membershipCheckpoint.status === "succeeded_verified";
  if (
    membershipSucceeded !== (journal.verifiedMembershipMediaItemIds !== null) ||
    (membershipSucceeded &&
      (!arraysEqual(
        journal.membershipCheckpoint.confirmedResultIds,
        journal.verifiedMembershipMediaItemIds ?? [],
      ) ||
        !membershipSnapshotMatchesExpected(
          journal,
          journal.verifiedMembershipMediaItemIds ?? [],
        )))
  ) {
    return false;
  }
  const finalReady = journal.finalCandidate.status === "final_candidate";
  if (
    finalReady !== (journal.phase === "FINAL_READY") ||
    (finalReady &&
      (journal.mediaCheckpoint.status !== "succeeded_verified" ||
        journal.membershipCheckpoint.status !== "succeeded_verified" ||
        journal.expectedTargetMediaItemIds === null ||
        journal.verifiedMembershipMediaItemIds === null ||
        !membershipSnapshotMatchesExpected(
          journal,
          journal.finalCandidate.observedMembershipMediaItemIds,
        ) ||
        !arraysEqual(
          journal.finalCandidate.observedMembershipMediaItemIds,
          journal.verifiedMembershipMediaItemIds,
        )))
  ) {
    return false;
  }
  if (
    journal.phase === "RECOVERY_REQUIRED" ? journal.stopReason === null : journal.stopReason !== null
  ) {
    return false;
  }
  if (journal.canResume !== expectedCanResume(journal)) return false;
  return true;
}

function membershipSnapshotMatchesExpected(
  journal: GooglePhotosSyncRecoveryJournalV3,
  observed: string[],
) {
  const target = journal.expectedTargetMediaItemIds;
  if (target === null) return false;
  const protectedUnmanaged = journal.protectedUnmanagedMediaItemIds;
  const allowed = new Set([...target, ...protectedUnmanaged]);
  if (allowed.size !== target.length + protectedUnmanaged.length) return false;
  return (
    observed.length === allowed.size &&
    observed.every((id) => allowed.has(id)) &&
    target.every((id) => observed.includes(id)) &&
    protectedUnmanaged.every((id) => observed.includes(id)) &&
    recoveryTargetIdsAppearInRelativeOrder(observed, target)
  );
}

function expectedCanResume(journal: GooglePhotosSyncRecoveryJournalV3) {
  if (journal.phase === "FINAL_READY") return false;
  if (journal.phase !== "RECOVERY_REQUIRED") return true;
  if (
    journal.mediaCheckpoint.status === "remote_reverification_required" ||
    journal.membershipCheckpoint.status === "remote_reverification_required"
  ) {
    return true;
  }
  return [
    "PRE_MEDIA_INTERRUPTED",
    "UPLOAD_INTERRUPTED",
    "CHECKPOINT_FAILED",
    "MEMBERSHIP_RESULT_UNKNOWN",
    "FINAL_CANDIDATE_UNKNOWN",
    "PENDING_END_UNKNOWN",
  ].includes(journal.stopReason ?? "");
}

function deriveTargetMediaItemIds(journal: GooglePhotosSyncRecoveryJournalV3) {
  const createdBySlide = new Map(
    journal.createdItems.map((item) => [item.slideId, item.mediaItemId]),
  );
  const values: string[] = [];
  for (const item of journal.classifications) {
    if (item.classification === "INDETERMINATE") return null;
    if (item.classification === "REUSE_CANDIDATE") {
      values.push(item.mediaItemId);
    } else {
      const created = createdBySlide.get(item.slideId);
      if (!created) return null;
      values.push(created);
    }
  }
  return new Set(values).size === values.length ? values : null;
}

function toRecoveryStable(
  binding: GooglePhotosSyncBinding,
): GooglePhotosSyncRecoveryStableSnapshot {
  return binding.stable
    ? {
        generation: binding.stable.generation,
        items: binding.stable.items.map(toManagedItem),
      }
    : null;
}

function toRecoveryPending(
  binding: GooglePhotosSyncBinding,
): GooglePhotosSyncRecoveryPendingSnapshot | null {
  return binding.pending
    ? {
        pendingIdentity: binding.pending.operationId,
        phase: binding.pending.phase,
        sourceFingerprint: binding.pending.sourceFingerprint,
        previousManagedMediaItemIds: [
          ...binding.pending.previousManagedMediaItemIds,
        ],
        targetItems: binding.pending.targetItems.map(toManagedItem),
      }
    : null;
}

function toManagedItem(item: {
  slideId: string;
  renderKey: string;
  mediaItemId: string;
}): GooglePhotosSyncRecoveryManagedItem {
  return {
    slideId: item.slideId,
    renderKey: item.renderKey,
    mediaItemId: item.mediaItemId,
  };
}

type Parsed<T> = { ok: true; value: T } | { ok: false };

function parseStableSnapshot(input: unknown): Parsed<GooglePhotosSyncRecoveryStableSnapshot> {
  if (input === null) return { ok: true, value: null };
  if (!isJsonObject(input) || !hasExactKeys(input, STABLE_KEYS)) return { ok: false };
  if (!isNonNegativeInteger(input.generation)) return { ok: false };
  const items = parseManagedItems(input.items);
  return items.ok
    ? { ok: true, value: { generation: input.generation, items: items.value } }
    : { ok: false };
}

function parsePendingSnapshot(input: unknown): Parsed<GooglePhotosSyncRecoveryPendingSnapshot> {
  if (!isJsonObject(input) || !hasExactKeys(input, PENDING_KEYS)) return { ok: false };
  if (
    !isNonBlankString(input.pendingIdentity) ||
    !isNonBlankString(input.phase) ||
    !isNonBlankString(input.sourceFingerprint) ||
    !isUniqueStrings(input.previousManagedMediaItemIds, true)
  ) {
    return { ok: false };
  }
  const items = parseManagedItems(input.targetItems);
  return items.ok
    ? {
        ok: true,
        value: {
          pendingIdentity: input.pendingIdentity,
          phase: input.phase,
          sourceFingerprint: input.sourceFingerprint,
          previousManagedMediaItemIds: [...input.previousManagedMediaItemIds],
          targetItems: items.value,
        },
      }
    : { ok: false };
}

function parseManagedItems(input: unknown): Parsed<GooglePhotosSyncRecoveryManagedItem[]> {
  if (!Array.isArray(input)) return { ok: false };
  const values: GooglePhotosSyncRecoveryManagedItem[] = [];
  const slides = new Set<string>();
  const media = new Set<string>();
  for (const item of input) {
    if (
      !isJsonObject(item) ||
      !hasExactKeys(item, MANAGED_ITEM_KEYS) ||
      !isNonBlankString(item.slideId) ||
      !isNonBlankString(item.renderKey) ||
      !isNonBlankString(item.mediaItemId) ||
      slides.has(item.slideId) ||
      media.has(item.mediaItemId)
    ) {
      return { ok: false };
    }
    slides.add(item.slideId);
    media.add(item.mediaItemId);
    values.push({
      slideId: item.slideId,
      renderKey: item.renderKey,
      mediaItemId: item.mediaItemId,
    });
  }
  return { ok: true, value: values };
}

function parseCreatedItems(input: unknown): Parsed<GooglePhotosSyncRecoveryCreatedItem[]> {
  if (!Array.isArray(input)) return { ok: false };
  const values: GooglePhotosSyncRecoveryCreatedItem[] = [];
  const slides = new Set<string>();
  const media = new Set<string>();
  for (const item of input) {
    if (
      !isJsonObject(item) ||
      !hasExactKeys(item, CREATED_ITEM_KEYS) ||
      !isNonBlankString(item.slideId) ||
      !isNonBlankString(item.mediaItemId) ||
      slides.has(item.slideId) ||
      media.has(item.mediaItemId)
    ) {
      return { ok: false };
    }
    slides.add(item.slideId);
    media.add(item.mediaItemId);
    values.push({ slideId: item.slideId, mediaItemId: item.mediaItemId });
  }
  return { ok: true, value: values };
}

function parseClassifications(
  input: unknown,
): Parsed<GooglePhotosSyncRecoveryClassification[]> {
  if (!Array.isArray(input)) return { ok: false };
  const values: GooglePhotosSyncRecoveryClassification[] = [];
  const slides = new Set<string>();
  for (const item of input) {
    if (!isJsonObject(item) || !isNonBlankString(item.classification)) {
      return { ok: false };
    }
    if (!isNonBlankString(item.slideId) || !isNonBlankString(item.renderKey)) {
      return { ok: false };
    }
    if (slides.has(item.slideId)) return { ok: false };
    slides.add(item.slideId);
    if (item.classification === "REUSE_CANDIDATE") {
      if (
        !hasExactKeys(item, [
          "classification",
          "reason",
          "slideId",
          "renderKey",
          "mediaItemId",
          "provenance",
        ]) ||
        item.reason !== "PROVEN_MATCH_PRESENT" ||
        !isNonBlankString(item.mediaItemId) ||
        !["stable", "pending", "stable_and_pending"].includes(
          String(item.provenance),
        )
      ) {
        return { ok: false };
      }
      values.push({
        classification: "REUSE_CANDIDATE",
        reason: "PROVEN_MATCH_PRESENT",
        slideId: item.slideId,
        renderKey: item.renderKey,
        mediaItemId: item.mediaItemId,
        provenance: item.provenance as "stable" | "pending" | "stable_and_pending",
      });
      continue;
    }
    if (
      !hasExactKeys(item, ["classification", "reason", "slideId", "renderKey"])
    ) {
      return { ok: false };
    }
    if (item.classification === "CREATE_REQUIRED") {
      if (
        ![
          "NO_MANAGED_CANDIDATE",
          "RENDER_KEY_CHANGED",
          "REUSE_NOT_ELIGIBLE",
          "CANDIDATE_MISSING_FROM_MEMBERSHIP",
        ].includes(String(item.reason))
      ) {
        return { ok: false };
      }
      values.push({
        classification: "CREATE_REQUIRED",
        reason: item.reason as Extract<
          GooglePhotosSyncRecoveryClassification,
          { classification: "CREATE_REQUIRED" }
        >["reason"],
        slideId: item.slideId,
        renderKey: item.renderKey,
      });
      continue;
    }
    if (item.classification === "INDETERMINATE") {
      if (
        ![
          "AMBIGUOUS_MEDIA_CREATE",
          "CONFLICTING_MANAGED_HISTORY",
          "UNVERIFIED_PENDING_PROVENANCE",
        ].includes(String(item.reason))
      ) {
        return { ok: false };
      }
      values.push({
        classification: "INDETERMINATE",
        reason: item.reason as Extract<
          GooglePhotosSyncRecoveryClassification,
          { classification: "INDETERMINATE" }
        >["reason"],
        slideId: item.slideId,
        renderKey: item.renderKey,
      });
      continue;
    }
    return { ok: false };
  }
  return { ok: true, value: values };
}

function parseFinalCandidate(
  input: unknown,
): Parsed<GooglePhotosSyncRecoveryJournalFinalCandidate> {
  if (!isJsonObject(input) || !hasExactKeys(input, FINAL_CANDIDATE_KEYS)) {
    return { ok: false };
  }
  if (
    (input.status !== "not_ready" && input.status !== "final_candidate") ||
    !isUniqueStrings(input.observedMembershipMediaItemIds, true) ||
    (input.status === "not_ready" && input.observedMembershipMediaItemIds.length > 0)
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      status: input.status,
      observedMembershipMediaItemIds: [
        ...input.observedMembershipMediaItemIds,
      ],
    },
  };
}

function parseNullableUniqueStrings(input: unknown): Parsed<string[] | null> {
  if (input === null) return { ok: true, value: null };
  return isUniqueStrings(input, false)
    ? { ok: true, value: [...input] }
    : { ok: false };
}

function isUniqueStrings(value: unknown, allowEmpty: boolean): value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isNonBlankString(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_8601_UTC_PATTERN.test(value)) return false;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return new Date(timestamp).toISOString() === normalized;
}

function isPhase(value: unknown): value is GooglePhotosSyncRecoveryPhase {
  return typeof value === "string" && (PHASES as readonly string[]).includes(value);
}

function isStopReason(value: unknown): value is GooglePhotosSyncRecoveryStopReason {
  return (
    typeof value === "string" &&
    (STOP_REASONS as readonly string[]).includes(value)
  );
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function failure(
  reason: GooglePhotosSyncRecoveryJournalFailureReason,
): GooglePhotosSyncRecoveryJournalResult {
  return { ok: false, reason };
}
