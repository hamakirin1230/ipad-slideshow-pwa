export const GOOGLE_PHOTOS_SYNC_RECOVERY_CHECKPOINT_STATUSES = [
  "not_started",
  "preflight_checkpointed",
  "in_progress",
  "result_unknown",
  "partial",
  "remote_reverification_required",
  "succeeded_verified",
  "stopped",
] as const;

export type GooglePhotosSyncRecoveryCheckpointStatus =
  (typeof GOOGLE_PHOTOS_SYNC_RECOVERY_CHECKPOINT_STATUSES)[number];

export type GooglePhotosSyncRecoveryCheckpointOperation =
  | "media_creation"
  | "membership_update";

export type GooglePhotosSyncRecoveryCheckpoint = {
  checkpointId: string;
  recoveryId: string;
  operation: GooglePhotosSyncRecoveryCheckpointOperation;
  expectedPhase: "MEDIA_CREATING" | "MEMBERSHIP_PLANNED";
  status: GooglePhotosSyncRecoveryCheckpointStatus;
  revision: number;
  journalRevision: number;
  targetIdentities: string[];
  confirmedResultIds: string[];
  automaticRetryAllowed: boolean;
};

export type GooglePhotosSyncRecoveryCheckpointEvent =
  | { type: "PREPARE" }
  | { type: "START" }
  | { type: "RESULT_UNKNOWN" }
  | { type: "PARTIAL_SUCCESS"; confirmedResultIds: string[] }
  | { type: "REQUIRE_REMOTE_REVERIFICATION" }
  | {
      type: "VERIFY_SUCCESS";
      confirmedResultIds: string[];
      proof: "direct_response" | "remote_snapshot";
    }
  | { type: "STOP" };

export type GooglePhotosSyncRecoveryCheckpointFailureReason =
  | "INVALID_CHECKPOINT"
  | "RECOVERY_ID_MISMATCH"
  | "OPERATION_MISMATCH"
  | "STALE_CHECKPOINT_REVISION"
  | "STALE_JOURNAL_REVISION"
  | "INVALID_CHECKPOINT_TRANSITION"
  | "REMOTE_REVERIFICATION_REQUIRED"
  | "INVALID_RESULT_SET";

export type GooglePhotosSyncRecoveryCheckpointResult =
  | { ok: true; checkpoint: GooglePhotosSyncRecoveryCheckpoint }
  | { ok: false; reason: GooglePhotosSyncRecoveryCheckpointFailureReason };

const CHECKPOINT_KEYS = [
  "checkpointId",
  "recoveryId",
  "operation",
  "expectedPhase",
  "status",
  "revision",
  "journalRevision",
  "targetIdentities",
  "confirmedResultIds",
  "automaticRetryAllowed",
] as const;

/**
 * Creates a local recovery checkpoint. This model intentionally carries no
 * Google Photos or Drive client and grants no production-write authority.
 */
export function createGooglePhotosSyncRecoveryCheckpoint(input: {
  checkpointId: string;
  recoveryId: string;
  operation: GooglePhotosSyncRecoveryCheckpointOperation;
  journalRevision: number;
  targetIdentities: string[];
}): GooglePhotosSyncRecoveryCheckpointResult {
  const checkpoint: GooglePhotosSyncRecoveryCheckpoint = {
    checkpointId: input.checkpointId,
    recoveryId: input.recoveryId,
    operation: input.operation,
    expectedPhase:
      input.operation === "media_creation" ? "MEDIA_CREATING" : "MEMBERSHIP_PLANNED",
    status: "not_started",
    revision: 0,
    journalRevision: input.journalRevision,
    targetIdentities: [...input.targetIdentities],
    confirmedResultIds: [],
    automaticRetryAllowed: true,
  };
  return parseGooglePhotosSyncRecoveryCheckpoint(checkpoint);
}

export function parseGooglePhotosSyncRecoveryCheckpoint(
  input: unknown,
): GooglePhotosSyncRecoveryCheckpointResult {
  if (!isJsonObject(input) || !hasExactKeys(input, CHECKPOINT_KEYS)) {
    return failure("INVALID_CHECKPOINT");
  }
  if (
    !isNonBlankString(input.checkpointId) ||
    !isNonBlankString(input.recoveryId) ||
    !isOperation(input.operation) ||
    !isExpectedPhase(input.expectedPhase) ||
    !isStatus(input.status) ||
    !isNonNegativeInteger(input.revision) ||
    !isPositiveInteger(input.journalRevision) ||
    !isUniqueNonBlankStringArray(input.targetIdentities) ||
    !isUniqueNonBlankStringArray(input.confirmedResultIds) ||
    typeof input.automaticRetryAllowed !== "boolean"
  ) {
    return failure("INVALID_CHECKPOINT");
  }
  const checkpoint: GooglePhotosSyncRecoveryCheckpoint = {
    checkpointId: input.checkpointId,
    recoveryId: input.recoveryId,
    operation: input.operation,
    expectedPhase: input.expectedPhase,
    status: input.status,
    revision: input.revision,
    journalRevision: input.journalRevision,
    targetIdentities: [...input.targetIdentities],
    confirmedResultIds: [...input.confirmedResultIds],
    automaticRetryAllowed: input.automaticRetryAllowed,
  };
  if (!checkpointInvariantsHold(checkpoint)) {
    return failure("INVALID_CHECKPOINT");
  }
  return { ok: true, checkpoint };
}

/**
 * Advances a checkpoint only when both checkpoint and journal revisions match.
 * Unknown or partial results can become successful only after a fresh remote
 * snapshot has been supplied by the caller.
 */
export function transitionGooglePhotosSyncRecoveryCheckpoint(input: {
  checkpoint: GooglePhotosSyncRecoveryCheckpoint;
  event: GooglePhotosSyncRecoveryCheckpointEvent;
  recoveryId: string;
  operation: GooglePhotosSyncRecoveryCheckpointOperation;
  expectedCheckpointRevision: number;
  expectedJournalRevision: number;
}): GooglePhotosSyncRecoveryCheckpointResult {
  const parsed = parseGooglePhotosSyncRecoveryCheckpoint(input.checkpoint);
  if (!parsed.ok) return parsed;
  const current = parsed.checkpoint;
  if (input.recoveryId !== current.recoveryId) {
    return failure("RECOVERY_ID_MISMATCH");
  }
  if (input.operation !== current.operation) {
    return failure("OPERATION_MISMATCH");
  }
  if (input.expectedCheckpointRevision !== current.revision) {
    return failure("STALE_CHECKPOINT_REVISION");
  }
  if (input.expectedJournalRevision !== current.journalRevision) {
    return failure("STALE_JOURNAL_REVISION");
  }

  let status: GooglePhotosSyncRecoveryCheckpointStatus;
  let confirmedResultIds = [...current.confirmedResultIds];
  switch (input.event.type) {
    case "PREPARE":
      if (current.status !== "not_started") return invalidTransition();
      status = "preflight_checkpointed";
      break;
    case "START":
      if (current.status !== "preflight_checkpointed") return invalidTransition();
      status = "in_progress";
      break;
    case "RESULT_UNKNOWN":
      if (current.status !== "in_progress") return invalidTransition();
      status = "result_unknown";
      confirmedResultIds = [];
      break;
    case "PARTIAL_SUCCESS":
      if (current.status !== "in_progress") return invalidTransition();
      if (!validResultIds(input.event.confirmedResultIds, false)) {
        return failure("INVALID_RESULT_SET");
      }
      status = "partial";
      confirmedResultIds = [...input.event.confirmedResultIds];
      break;
    case "REQUIRE_REMOTE_REVERIFICATION":
      if (
        current.status !== "result_unknown" &&
        current.status !== "partial"
      ) {
        return invalidTransition();
      }
      status = "remote_reverification_required";
      break;
    case "VERIFY_SUCCESS":
      if (
        (current.status === "result_unknown" ||
          current.status === "partial" ||
          current.status === "remote_reverification_required") &&
        input.event.proof !== "remote_snapshot"
      ) {
        return failure("REMOTE_REVERIFICATION_REQUIRED");
      }
      if (
        current.status !== "in_progress" &&
        current.status !== "result_unknown" &&
        current.status !== "partial" &&
        current.status !== "remote_reverification_required"
      ) {
        return invalidTransition();
      }
      if (!validResultIds(input.event.confirmedResultIds, true)) {
        return failure("INVALID_RESULT_SET");
      }
      if (
        current.operation === "media_creation" &&
        input.event.confirmedResultIds.length !== current.targetIdentities.length
      ) {
        return failure("INVALID_RESULT_SET");
      }
      status = "succeeded_verified";
      confirmedResultIds = [...input.event.confirmedResultIds];
      break;
    case "STOP":
      if (current.status === "succeeded_verified" || current.status === "stopped") {
        return invalidTransition();
      }
      status = "stopped";
      break;
  }

  const next: GooglePhotosSyncRecoveryCheckpoint = {
    ...current,
    status,
    revision: current.revision + 1,
    journalRevision: current.journalRevision + 1,
    confirmedResultIds,
    automaticRetryAllowed: status === "preflight_checkpointed",
  };
  return parseGooglePhotosSyncRecoveryCheckpoint(next);
}

function checkpointInvariantsHold(checkpoint: GooglePhotosSyncRecoveryCheckpoint) {
  if (
    (checkpoint.operation === "media_creation" &&
      checkpoint.expectedPhase !== "MEDIA_CREATING") ||
    (checkpoint.operation === "membership_update" &&
      checkpoint.expectedPhase !== "MEMBERSHIP_PLANNED")
  ) {
    return false;
  }
  const shouldAllowRetry =
    checkpoint.status === "not_started" ||
    checkpoint.status === "preflight_checkpointed";
  if (checkpoint.automaticRetryAllowed !== shouldAllowRetry) return false;
  if (
    checkpoint.journalRevision < checkpoint.revision + 1 ||
    checkpoint.revision < minimumRevisionForStatus(checkpoint.status) ||
    (checkpoint.status === "not_started" && checkpoint.revision !== 0)
  ) {
    return false;
  }
  if (
    [
      "not_started",
      "preflight_checkpointed",
      "in_progress",
      "result_unknown",
      "stopped",
    ].includes(
      checkpoint.status,
    ) &&
    checkpoint.confirmedResultIds.length !== 0
  ) {
    return false;
  }
  if (checkpoint.status === "succeeded_verified") {
    if (
      checkpoint.operation === "media_creation" &&
      checkpoint.confirmedResultIds.length !== checkpoint.targetIdentities.length
    ) {
      return false;
    }
    if (
      checkpoint.operation === "membership_update" &&
      checkpoint.targetIdentities.length > 0 &&
      checkpoint.confirmedResultIds.length === 0
    ) {
      return false;
    }
  }
  if (checkpoint.status === "partial") {
    if (checkpoint.confirmedResultIds.length === 0) return false;
    if (
      checkpoint.operation === "media_creation" &&
      checkpoint.targetIdentities.length > 0 &&
      checkpoint.confirmedResultIds.length >= checkpoint.targetIdentities.length
    ) {
      return false;
    }
  }
  return true;
}

/**
 * These minima reject impossible local snapshots. They do not prove that an
 * external operation occurred; only the journal and a verified remote snapshot
 * can provide that wider evidence.
 */
function minimumRevisionForStatus(
  status: GooglePhotosSyncRecoveryCheckpointStatus,
) {
  switch (status) {
    case "not_started":
      return 0;
    case "preflight_checkpointed":
    case "stopped":
      return 1;
    case "in_progress":
      return 2;
    case "result_unknown":
    case "partial":
    case "succeeded_verified":
      return 3;
    case "remote_reverification_required":
      return 4;
  }
}

function validResultIds(values: unknown, complete: boolean) {
  return (
    isUniqueNonBlankStringArray(values) &&
    (complete ? true : values.length > 0)
  );
}

function invalidTransition(): GooglePhotosSyncRecoveryCheckpointResult {
  return failure("INVALID_CHECKPOINT_TRANSITION");
}

function failure(
  reason: GooglePhotosSyncRecoveryCheckpointFailureReason,
): GooglePhotosSyncRecoveryCheckpointResult {
  return { ok: false, reason };
}

function isOperation(
  value: unknown,
): value is GooglePhotosSyncRecoveryCheckpointOperation {
  return value === "media_creation" || value === "membership_update";
}

function isExpectedPhase(
  value: unknown,
): value is GooglePhotosSyncRecoveryCheckpoint["expectedPhase"] {
  return value === "MEDIA_CREATING" || value === "MEMBERSHIP_PLANNED";
}

function isStatus(value: unknown): value is GooglePhotosSyncRecoveryCheckpointStatus {
  return (
    typeof value === "string" &&
    (GOOGLE_PHOTOS_SYNC_RECOVERY_CHECKPOINT_STATUSES as readonly string[]).includes(
      value,
    )
  );
}

function isUniqueNonBlankStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isNonBlankString(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
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

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}
