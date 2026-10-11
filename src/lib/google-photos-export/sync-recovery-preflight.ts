import {
  isVerifiedRecoveryDriveSnapshot,
  type RecoveryDriveReadResult,
  type RecoveryScope,
} from "./sync-recovery-drive-port";
import {
  parseGooglePhotosSyncRecoveryJournalV3,
  type GooglePhotosSyncRecoveryJournalV3,
} from "./sync-recovery-journal-v3";
import {
  isVerifiedRecoveryPhotosSnapshot,
  type RecoveryPhotosReadResult,
} from "./sync-recovery-photos-port";
import { classifyGooglePhotosSyncRecoveryTargets, recoveryTargetIdsAppearInRelativeOrder } from "./sync-recovery-plan";
import { inspectGooglePhotosSyncRecoveryConflicts } from "./sync-recovery-simulation";
import type { GooglePhotosSyncRecoveryDesiredSlide, GooglePhotosSyncRecoveryPhase } from "./sync-recovery-types";

export type RecoveryPreflightInput = {
  journal: unknown;
  scope: RecoveryScope;
  drive: RecoveryDriveReadResult;
  photos: RecoveryPhotosReadResult;
  authority: {
    recoveryId: string;
    sourceFingerprint: string;
    stableGeneration: number;
    pendingIdentity: string;
    desiredSlides: GooglePhotosSyncRecoveryDesiredSlide[];
    concurrentOperationDetected: boolean;
  };
};
export type RecoveryPreflightReason =
  | "INVALID_JOURNAL" | "DRIVE_UNAVAILABLE" | "PHOTOS_UNAVAILABLE"
  | "UNVERIFIED_DRIVE_SNAPSHOT" | "UNVERIFIED_PHOTOS_SNAPSHOT"
  | "SCOPE_MISMATCH" | "JOURNAL_DRIFT" | "RECONCILIATION_REQUIRED"
  | "RECOVERY_ID_MISMATCH" | "SOURCE_DRIFT" | "STABLE_CHANGED" | "PENDING_CHANGED"
  | "MEMBERSHIP_DRIFT" | "REMOTE_STATE_UNVERIFIED" | "CONCURRENT_OPERATION"
  | "TARGET_SLIDES_CHANGED" | "CLASSIFICATION_UNVERIFIED" | "OWNERSHIP_UNKNOWN"
  | "CREATED_PROVENANCE_UNVERIFIED" | "ORDER_UNVERIFIED" | "ORDER_MISMATCH"
  | "MEMBERSHIP_INCOMPLETE" | "INVALID_PAGING" | "DUPLICATE_MEDIA_ID"
  | "OPERATION_STOPPED";

/** Redacted DTO: counts and fixed reason codes only, never provider identities. */
export type RecoveryPreflightReport = {
  verdict: "pass_local" | "stopped";
  stopReasons: RecoveryPreflightReason[];
  operationState: GooglePhotosSyncRecoveryPhase | "unknown";
  journalRevision: number | null;
  sourceChangedSincePending: boolean | null;
  classifications: { reuse: number; createRequired: number; indeterminate: number } | null;
  regenerateCandidateCount: number | null;
  protectedUnmanagedCount: number | null;
  managedCount: number | null;
  membership: { observed: number | null; missing: number | null; extra: number | null; duplicates: number | null };
  orderStatus: "matched" | "mismatched" | "unknown";
  orderBasis: "pending_snapshot" | "recovery_target" | "unknown";
  unprovenProvenanceCount: number | null;
  remoteReverificationRequired: boolean;
  productionWriteAllowed: false;
  atomicCommitProven: false;
  productionBlockReasons: ["STAGE2B_LOCAL_ONLY", "DRIVE_ATOMICITY_UNPROVEN", "NO_PRODUCTION_ADAPTER"];
};

function equal(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right); }

/** Read-only; PASS certifies a mock preflight, never authorizes provider writes. */
export function preflightGooglePhotosRecovery(input: RecoveryPreflightInput): RecoveryPreflightReport {
  const report: RecoveryPreflightReport = {
    verdict: "stopped", stopReasons: [], operationState: "unknown", journalRevision: null,
    sourceChangedSincePending: null, classifications: null, regenerateCandidateCount: null,
    protectedUnmanagedCount: null, managedCount: null,
    membership: { observed: null, missing: null, extra: null, duplicates: null },
    orderStatus: "unknown", orderBasis: "unknown", unprovenProvenanceCount: null,
    remoteReverificationRequired: true, productionWriteAllowed: false, atomicCommitProven: false,
    productionBlockReasons: ["STAGE2B_LOCAL_ONLY", "DRIVE_ATOMICITY_UNPROVEN", "NO_PRODUCTION_ADAPTER"],
  };
  const stop = (reason: RecoveryPreflightReason) => {
    if (!report.stopReasons.includes(reason)) report.stopReasons.push(reason);
  };
  const parsed = parseGooglePhotosSyncRecoveryJournalV3(input.journal);
  if (!parsed.ok) { stop("INVALID_JOURNAL"); return report; }
  const journal = parsed.journal;
  report.operationState = journal.phase;
  report.journalRevision = journal.revision;
  report.sourceChangedSincePending = journal.originalPending.sourceFingerprint !== journal.recoverySourceFingerprint;
  if (journal.workspaceId !== input.scope.workspaceId || journal.projectId !== input.scope.projectId) stop("SCOPE_MISMATCH");

  if (input.drive.status !== "verified") stop("DRIVE_UNAVAILABLE");
  else if (!isVerifiedRecoveryDriveSnapshot(input.drive.snapshot)) stop("UNVERIFIED_DRIVE_SNAPSHOT");
  else {
    if (input.drive.snapshot.scope.workspaceId !== input.scope.workspaceId ||
        input.drive.snapshot.scope.projectId !== input.scope.projectId) stop("SCOPE_MISMATCH");
    if (!equal(input.drive.snapshot.journal, journal)) stop("JOURNAL_DRIFT");
    if (input.drive.snapshot.reconciliationRequired) stop("RECONCILIATION_REQUIRED");
  }
  if (input.photos.status !== "verified") {
    if (input.photos.status === "invalid_observation" && input.photos.reason === "DUPLICATE_MEDIA_ID") {
      stop("DUPLICATE_MEDIA_ID"); report.membership.duplicates = input.photos.duplicateCount;
    } else if (input.photos.status === "invalid_observation" && input.photos.reason === "INVALID_PAGING") stop("INVALID_PAGING");
    else stop("PHOTOS_UNAVAILABLE");
    return report;
  }
  if (!isVerifiedRecoveryPhotosSnapshot(input.photos.snapshot)) { stop("UNVERIFIED_PHOTOS_SNAPSHOT"); return report; }
  const photos = input.photos.snapshot;
  if (photos.scope.workspaceId !== journal.workspaceId || photos.scope.projectId !== journal.projectId ||
      journal.sourceBinding.album === null ||
      photos.scope.albumIdentity !== journal.sourceBinding.album.albumId) stop("SCOPE_MISMATCH");
  const ids = photos.items.map((item) => item.mediaItemId);
  report.membership.observed = ids.length;
  report.membership.duplicates = 0;
  const guarded = inspectGooglePhotosSyncRecoveryConflicts({
    journal, observedRecoveryId: input.authority.recoveryId,
    observedSourceFingerprint: input.authority.sourceFingerprint,
    observedStableGeneration: input.authority.stableGeneration,
    observedPendingIdentity: input.authority.pendingIdentity,
    expectedMembershipMediaItemIds: journal.membershipCheckpoint.status === "succeeded_verified"
      ? journal.verifiedMembershipMediaItemIds ?? [] : journal.initialMembershipMediaItemIds,
    observedMembershipMediaItemIds: ids,
    concurrentOperationDetected: input.authority.concurrentOperationDetected,
  });
  guarded.conflicts.forEach(stop);
  if (journal.phase === "RECOVERY_REQUIRED") stop("OPERATION_STOPPED");

  const desired = input.authority.desiredSlides;
  if (!equal(desired.map((slide) => slide.slideId), journal.orderedTargetSlideIds) ||
      !equal(desired.map((slide) => slide.renderKey), journal.classifications.map((item) => item.renderKey))) stop("TARGET_SLIDES_CHANGED");
  const classified = classifyGooglePhotosSyncRecoveryTargets({
    desiredSlides: desired, stableItems: journal.originalStable?.items ?? [],
    pendingTargetItems: journal.originalPending.targetItems, albumMediaItemIds: ids,
    recoverySourceFingerprint: journal.recoverySourceFingerprint,
    observedSourceFingerprint: input.authority.sourceFingerprint,
    confirmedPendingMediaItemIds: journal.confirmedPendingMediaItemIds,
    verifiedSuccessorRelations: [], ambiguousCreateSlideIds: [],
  });
  if (!classified.ok) stop("CLASSIFICATION_UNVERIFIED");
  else {
    const classifications = classified.classifications;
    report.classifications = {
      reuse: classifications.filter((item) => item.classification === "REUSE_CANDIDATE").length,
      createRequired: classifications.filter((item) => item.classification === "CREATE_REQUIRED").length,
      indeterminate: classifications.filter((item) => item.classification === "INDETERMINATE").length,
    };
    report.regenerateCandidateCount = report.classifications.createRequired;
    if (report.classifications.indeterminate > 0 || !equal(classifications, journal.classifications)) stop("CLASSIFICATION_UNVERIFIED");
  }

  const historical = new Set([...(journal.originalStable?.items.map((item) => item.mediaItemId) ?? []),
    ...journal.originalPending.targetItems.map((item) => item.mediaItemId)]);
  const created = new Map(journal.createdItems.map((item) => [item.mediaItemId, item.slideId]));
  let unproven = 0;
  for (const item of photos.items) {
    const known = historical.has(item.mediaItemId) || created.has(item.mediaItemId);
    if (item.ownership === "unknown" || (item.ownership === "app_managed") !== known) {
      stop("OWNERSHIP_UNKNOWN"); unproven += 1;
    }
    if (created.has(item.mediaItemId) && (historical.has(item.mediaItemId) ||
        journal.initialMembershipMediaItemIds.includes(item.mediaItemId) ||
        item.createdProvenance?.recoveryId !== journal.recoveryId ||
        item.createdProvenance?.slideId !== created.get(item.mediaItemId))) {
      stop("CREATED_PROVENANCE_UNVERIFIED"); unproven += 1;
    } else if (!created.has(item.mediaItemId) && item.createdProvenance !== null) {
      stop("CREATED_PROVENANCE_UNVERIFIED"); unproven += 1;
    }
  }
  for (const id of created.keys()) {
    if (!ids.includes(id)) { stop("CREATED_PROVENANCE_UNVERIFIED"); unproven += 1; }
  }
  report.unprovenProvenanceCount = unproven + (report.classifications?.indeterminate ?? 0);
  report.protectedUnmanagedCount = journal.protectedUnmanagedMediaItemIds.filter((id) => ids.includes(id)).length;
  report.managedCount = ids.filter((id) => historical.has(id) || created.has(id)).length;

  const target = membershipTargets(journal);
  report.orderBasis = journal.expectedTargetMediaItemIds === null ? "pending_snapshot" : "recovery_target";
  const allowed = new Set([...target, ...journal.protectedUnmanagedMediaItemIds]);
  report.membership.missing = [...allowed].filter((id) => !ids.includes(id)).length;
  report.membership.extra = ids.filter((id) => !allowed.has(id)).length;
  if (report.membership.missing > 0 || report.membership.extra > 0) stop("MEMBERSHIP_INCOMPLETE");
  if (photos.orderEvidence !== "album_order" || target.length !== journal.orderedTargetSlideIds.length ||
      target.some((id) => !ids.includes(id))) stop("ORDER_UNVERIFIED");
  else {
    report.orderStatus = recoveryTargetIdsAppearInRelativeOrder(ids, target) ? "matched" : "mismatched";
    if (report.orderStatus === "mismatched") stop("ORDER_MISMATCH");
  }
  report.verdict = report.stopReasons.length === 0 ? "pass_local" : "stopped";
  report.remoteReverificationRequired = report.verdict === "stopped";
  return report;
}

function membershipTargets(journal: GooglePhotosSyncRecoveryJournalV3) {
  if (journal.expectedTargetMediaItemIds !== null) return journal.expectedTargetMediaItemIds;
  const pending = new Map(journal.originalPending.targetItems.map((item) => [item.slideId, item.mediaItemId]));
  return journal.orderedTargetSlideIds.flatMap((slideId) => {
    const mediaItemId = pending.get(slideId);
    return mediaItemId === undefined ? [] : [mediaItemId];
  });
}
