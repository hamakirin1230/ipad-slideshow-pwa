import {
  parseGooglePhotosSyncRecoveryJournalV3,
  type GooglePhotosSyncRecoveryJournalV3,
} from "./sync-recovery-journal-v3";
import { createInMemoryGooglePhotosSyncRecoveryJournalStore } from "./sync-recovery-simulation";

export type RecoveryScope = { workspaceId: string; projectId: string };
export type RecoveryDriveSnapshot = {
  scope: RecoveryScope;
  journal: GooglePhotosSyncRecoveryJournalV3;
  reconciliationRequired: boolean;
  productionWriteAllowed: false;
  atomicCommitProven: false;
};
export type RecoveryDriveReadResult =
  | { status: "verified"; snapshot: RecoveryDriveSnapshot }
  | { status: "absent" | "invalid_journal" | "unreadable" | "duplicate_candidates" };
export type RecoveryDriveSaveResult =
  | { status: "saved_mock"; snapshot: RecoveryDriveSnapshot }
  | { status: "rejected"; reason: string }
  | { status: "failed_before_save" }
  | { status: "save_result_unknown"; reconciliationRequired: true };
export type RecoveryDriveReconcileResult = {
  status: "matched" | "not_committed" | "conflict" | "unavailable" | "not_required";
  automaticReplayAllowed: false;
};

/** Future persistence contract; Stage 2B supplies only an in-memory fake. */
export interface RecoveryDriveJournalPort {
  readonly productionWriteAllowed: false;
  readonly atomicCommitProven: false;
  read(): Promise<RecoveryDriveReadResult>;
  initialize(journal: unknown): Promise<RecoveryDriveSaveResult>;
  save(input: {
    recoveryId: string;
    expectedRevision: number;
    nextJournal: unknown;
    writerId: string;
  }): Promise<RecoveryDriveSaveResult>;
  reconcile(): Promise<RecoveryDriveReconcileResult>;
}

const issuedSnapshots = new WeakMap<object, string>();

/** Reject fabricated or mutated port snapshots even when a type was cast. */
export function isVerifiedRecoveryDriveSnapshot(
  value: unknown,
): value is RecoveryDriveSnapshot {
  if (typeof value !== "object" || value === null || !issuedSnapshots.has(value)) return false;
  try { return issuedSnapshots.get(value) === JSON.stringify(value); }
  catch { return false; }
}

function snapshot(journal: GooglePhotosSyncRecoveryJournalV3, required: boolean) {
  const value: RecoveryDriveSnapshot = {
    scope: { workspaceId: journal.workspaceId, projectId: journal.projectId },
    journal: structuredClone(journal),
    reconciliationRequired: required,
    productionWriteAllowed: false,
    atomicCommitProven: false,
  };
  issuedSnapshots.set(value, JSON.stringify(value));
  return value;
}

/** No credential, URL, filesystem, or provider-client input is accepted. */
export function createFakeRecoveryDriveJournalPort(options: {
  scope: RecoveryScope;
  candidates?: unknown[];
  readFault?: "unreadable";
  saveFault?: "fail_before_save" | "lose_response_after_save" | "unknown_without_save";
}): RecoveryDriveJournalPort {
  const scope = structuredClone(options.scope);
  const candidates = structuredClone(options.candidates ?? []);
  const store = createInMemoryGooglePhotosSyncRecoveryJournalStore();
  const readFault = options.readFault;
  let initialError: "invalid_journal" | "duplicate_candidates" | null = null;
  let recoveryId: string | null = null;
  let saveFault = options.saveFault;
  let uncertain: {
    before: GooglePhotosSyncRecoveryJournalV3 | null;
    proposed: GooglePhotosSyncRecoveryJournalV3;
  } | null = null;
  const matchesScope = (journal: GooglePhotosSyncRecoveryJournalV3) =>
    journal.workspaceId === scope.workspaceId && journal.projectId === scope.projectId;
  if (candidates.length > 1) initialError = "duplicate_candidates";
  else if (candidates.length === 1) {
    const parsed = parseGooglePhotosSyncRecoveryJournalV3(candidates[0]);
    if (!parsed.ok || !matchesScope(parsed.journal)) initialError = "invalid_journal";
    else {
      store.initialize(parsed.journal);
      recoveryId = parsed.journal.recoveryId;
    }
  }

  async function read(): Promise<RecoveryDriveReadResult> {
    if (readFault) return { status: "unreadable" };
    if (initialError) return { status: initialError };
    if (recoveryId === null) return { status: "absent" };
    const record = store.read(recoveryId);
    if (record === null) return { status: "absent" };
    const parsed = parseGooglePhotosSyncRecoveryJournalV3(record);
    return parsed.ok && matchesScope(parsed.journal)
      ? { status: "verified", snapshot: snapshot(parsed.journal, uncertain !== null) }
      : { status: "invalid_journal" };
  }

  return {
    productionWriteAllowed: false,
    atomicCommitProven: false,
    read,
    async initialize(input) {
      if (readFault || initialError || uncertain) {
        return { status: "rejected", reason: "STORE_UNAVAILABLE" };
      }
      const parsed = parseGooglePhotosSyncRecoveryJournalV3(input);
      if (!parsed.ok || !matchesScope(parsed.journal)) {
        return { status: "rejected", reason: "INVALID_JOURNAL" };
      }
      if (recoveryId !== null) {
        return { status: "rejected", reason: recoveryId === parsed.journal.recoveryId
          ? "ALREADY_EXISTS" : "WORKSPACE_PROJECT_CONFLICT" };
      }
      const fault = saveFault;
      saveFault = undefined;
      if (fault === "fail_before_save") return { status: "failed_before_save" };
      if (fault === "unknown_without_save") {
        recoveryId = parsed.journal.recoveryId;
        uncertain = { before: null, proposed: parsed.journal };
        return { status: "save_result_unknown", reconciliationRequired: true };
      }
      const result = store.initialize(parsed.journal);
      if (!result.ok) return { status: "rejected", reason: result.reason };
      recoveryId = parsed.journal.recoveryId;
      if (fault === "lose_response_after_save") {
        uncertain = { before: null, proposed: parsed.journal };
        return { status: "save_result_unknown", reconciliationRequired: true };
      }
      return { status: "saved_mock", snapshot: snapshot(parsed.journal, false) };
    },
    async save(input) {
      if (readFault || initialError) {
        return { status: "rejected", reason: "STORE_UNAVAILABLE" };
      }
      if (uncertain) return { status: "rejected", reason: "RECONCILIATION_REQUIRED" };
      const parsed = parseGooglePhotosSyncRecoveryJournalV3(input.nextJournal);
      if (!parsed.ok || !matchesScope(parsed.journal)) {
        return { status: "rejected", reason: "INVALID_JOURNAL" };
      }
      const before = store.read(input.recoveryId);
      if (before && (!before.createdItems.every((item, index) =>
        item.slideId === parsed.journal.createdItems[index]?.slideId &&
        item.mediaItemId === parsed.journal.createdItems[index]?.mediaItemId) ||
        !before.mediaCheckpoint.confirmedResultIds.every((id) => parsed.journal.mediaCheckpoint.confirmedResultIds.includes(id)))) {
        return { status: "rejected", reason: "CONFIRMED_RESULTS_CHANGED" };
      }
      const fault = saveFault;
      const result = store.compareAndSwap({
        ...input,
        nextJournal: parsed.journal,
        fault: fault === "lose_response_after_save"
          ? "lose_response_after_commit"
          : fault === "fail_before_save" || fault === "unknown_without_save"
            ? "fail_before_commit" : "none",
      });
      if (result.outcome === "rejected" && result.reason !== "STORE_FAILURE") {
        return { status: "rejected", reason: result.reason };
      }
      saveFault = undefined;
      if (result.outcome === "rejected" && fault === "fail_before_save") {
        return { status: "failed_before_save" };
      }
      if (result.outcome === "commit_result_unknown" || fault === "unknown_without_save") {
        if (before === null) return { status: "rejected", reason: "NOT_FOUND" };
        uncertain = { before, proposed: parsed.journal };
        return { status: "save_result_unknown", reconciliationRequired: true };
      }
      if (result.outcome !== "committed") {
        return { status: "rejected", reason: "STORE_FAILURE" };
      }
      return { status: "saved_mock", snapshot: snapshot(result.journal, false) };
    },
    async reconcile() {
      const pending = uncertain;
      if (pending === null) return { status: "not_required", automaticReplayAllowed: false };
      const observed = await read();
      if (uncertain !== pending) return { status: "conflict", automaticReplayAllowed: false };
      if (observed.status === "absent" && pending.before === null) {
        uncertain = null;
        recoveryId = null;
        return { status: "not_committed", automaticReplayAllowed: false };
      }
      if (observed.status !== "verified") {
        return { status: "unavailable", automaticReplayAllowed: false };
      }
      const content = JSON.stringify(observed.snapshot.journal);
      const status = content === JSON.stringify(pending.proposed) ? "matched"
        : content === JSON.stringify(pending.before) ? "not_committed" : "conflict";
      if (status === "matched" || status === "not_committed") uncertain = null;
      return { status, automaticReplayAllowed: false };
    },
  };
}
