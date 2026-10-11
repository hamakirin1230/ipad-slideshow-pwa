import { describe, expect, it } from "vitest";
import {
  createGooglePhotosSyncRecoveryCheckpoint,
  parseGooglePhotosSyncRecoveryCheckpoint,
  transitionGooglePhotosSyncRecoveryCheckpoint,
  type GooglePhotosSyncRecoveryCheckpoint,
  type GooglePhotosSyncRecoveryCheckpointEvent,
} from "./sync-recovery-checkpoint";

function checkpoint() {
  const result = createGooglePhotosSyncRecoveryCheckpoint({
    checkpointId: "fixture-recovery:media",
    recoveryId: "fixture-recovery",
    operation: "media_creation",
    journalRevision: 1,
    targetIdentities: ["slide-12"],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("checkpoint fixture failed");
  return result.checkpoint;
}

function advance(
  current: GooglePhotosSyncRecoveryCheckpoint,
  event: GooglePhotosSyncRecoveryCheckpointEvent,
) {
  return transitionGooglePhotosSyncRecoveryCheckpoint({
    checkpoint: current,
    event,
    recoveryId: current.recoveryId,
    operation: current.operation,
    expectedCheckpointRevision: current.revision,
    expectedJournalRevision: current.journalRevision,
  });
}

function advanceOk(
  current: GooglePhotosSyncRecoveryCheckpoint,
  event: GooglePhotosSyncRecoveryCheckpointEvent,
) {
  const result = advance(current, event);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("checkpoint transition failed");
  return result.checkpoint;
}

describe("Google Photos recovery checkpoint", () => {
  it("creates an immutable local checkpoint with no production authority", () => {
    const targets = ["slide-12"];
    const result = createGooglePhotosSyncRecoveryCheckpoint({
      checkpointId: "fixture-recovery:media",
      recoveryId: "fixture-recovery",
      operation: "media_creation",
      journalRevision: 1,
      targetIdentities: targets,
    });
    expect(result).toMatchObject({
      ok: true,
      checkpoint: {
        status: "not_started",
        revision: 0,
        automaticRetryAllowed: true,
      },
    });
    targets[0] = "mutated";
    expect(result.ok && result.checkpoint.targetIdentities).toEqual(["slide-12"]);
  });

  it("advances through prepared, started, and direct verified success", () => {
    const ready = advanceOk(checkpoint(), { type: "PREPARE" });
    const inProgress = advanceOk(ready, { type: "START" });
    const verified = advanceOk(inProgress, {
      type: "VERIFY_SUCCESS",
      confirmedResultIds: ["created-media-12"],
      proof: "direct_response",
    });
    expect(verified).toMatchObject({
      status: "succeeded_verified",
      revision: 3,
      automaticRetryAllowed: false,
      confirmedResultIds: ["created-media-12"],
    });
  });

  it("requires a fresh remote snapshot after an unknown response", () => {
    const inProgress = advanceOk(advanceOk(checkpoint(), { type: "PREPARE" }), {
      type: "START",
    });
    const unknown = advanceOk(inProgress, { type: "RESULT_UNKNOWN" });
    expect(advance(unknown, {
      type: "VERIFY_SUCCESS",
      confirmedResultIds: ["created-media-12"],
      proof: "direct_response",
    })).toEqual({ ok: false, reason: "REMOTE_REVERIFICATION_REQUIRED" });

    const needsRemote = advanceOk(unknown, {
      type: "REQUIRE_REMOTE_REVERIFICATION",
    });
    expect(
      advanceOk(needsRemote, {
        type: "VERIFY_SUCCESS",
        confirmedResultIds: ["created-media-12"],
        proof: "remote_snapshot",
      }).status,
    ).toBe("succeeded_verified");
  });

  it("keeps partial success non-retryable until remote reverification", () => {
    const source = checkpoint();
    source.targetIdentities = ["slide-11", "slide-12"];
    const inProgress = advanceOk(advanceOk(source, { type: "PREPARE" }), {
      type: "START",
    });
    const partial = advanceOk(inProgress, {
      type: "PARTIAL_SUCCESS",
      confirmedResultIds: ["created-media-11"],
    });
    expect(partial).toMatchObject({
      status: "partial",
      automaticRetryAllowed: false,
    });
    expect(advance(partial, { type: "START" })).toEqual({
      ok: false,
      reason: "INVALID_CHECKPOINT_TRANSITION",
    });
  });

  it("rejects a revision-zero forged success snapshot", () => {
    expect(
      parseGooglePhotosSyncRecoveryCheckpoint({
        ...checkpoint(),
        status: "succeeded_verified",
        confirmedResultIds: ["created-media-12"],
        automaticRetryAllowed: false,
      }),
    ).toEqual({ ok: false, reason: "INVALID_CHECKPOINT" });
  });

  it("rejects incomplete or duplicate media success results", () => {
    const source = checkpoint();
    source.targetIdentities = ["slide-11", "slide-12"];
    const inProgress = advanceOk(advanceOk(source, { type: "PREPARE" }), {
      type: "START",
    });
    expect(
      advance(inProgress, {
        type: "VERIFY_SUCCESS",
        confirmedResultIds: ["created-media-11"],
        proof: "direct_response",
      }),
    ).toEqual({ ok: false, reason: "INVALID_RESULT_SET" });
    expect(
      advance(inProgress, {
        type: "VERIFY_SUCCESS",
        confirmedResultIds: ["created-media-11", "created-media-11"],
        proof: "direct_response",
      }),
    ).toEqual({ ok: false, reason: "INVALID_RESULT_SET" });
  });

  it.each([
    ["recovery", { recoveryId: "other" }, "RECOVERY_ID_MISMATCH"],
    ["operation", { operation: "membership_update" }, "OPERATION_MISMATCH"],
    ["checkpoint revision", { expectedCheckpointRevision: 99 }, "STALE_CHECKPOINT_REVISION"],
    ["journal revision", { expectedJournalRevision: 99 }, "STALE_JOURNAL_REVISION"],
  ] as const)("rejects a stale or mismatched %s", (_label, override, reason) => {
    const current = checkpoint();
    const result = transitionGooglePhotosSyncRecoveryCheckpoint({
      checkpoint: current,
      event: { type: "PREPARE" },
      recoveryId: current.recoveryId,
      operation: current.operation,
      expectedCheckpointRevision: current.revision,
      expectedJournalRevision: current.journalRevision,
      ...override,
    });
    expect(result).toEqual({ ok: false, reason });
  });

  it("strictly rejects unknown fields, duplicate IDs, and inconsistent flags", () => {
    expect(
      parseGooglePhotosSyncRecoveryCheckpoint({ ...checkpoint(), extra: true }),
    ).toEqual({ ok: false, reason: "INVALID_CHECKPOINT" });
    expect(
      parseGooglePhotosSyncRecoveryCheckpoint({
        ...checkpoint(),
        targetIdentities: ["slide-12", "slide-12"],
      }),
    ).toEqual({ ok: false, reason: "INVALID_CHECKPOINT" });
    expect(
      parseGooglePhotosSyncRecoveryCheckpoint({
        ...checkpoint(),
        automaticRetryAllowed: false,
      }),
    ).toEqual({ ok: false, reason: "INVALID_CHECKPOINT" });
  });
});
