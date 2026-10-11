import { describe, expect, it } from "vitest";
import { createFakeRecoveryDriveJournalPort, isVerifiedRecoveryDriveSnapshot } from "./sync-recovery-drive-port";
import { advanceGooglePhotosSyncRecoverySimulation } from "./sync-recovery-simulation";
import { stage2bFixture } from "./sync-recovery-stage2b.test-fixtures";

function advance(journal: ReturnType<typeof stage2bFixture>["journal"], type: "PREFLIGHT_CONFIRMED" | "MEDIA_PREPARED") {
  const result = advanceGooglePhotosSyncRecoverySimulation({ journal, expectedRevision: journal.revision,
    now: "2026-10-11T00:01:00.000Z", event: { type } });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("fixture transition rejected");
  return result.journal;
}
function saveInput(journal: ReturnType<typeof stage2bFixture>["journal"], nextJournal = advance(journal, "PREFLIGHT_CONFIRMED")) {
  return { recoveryId: journal.recoveryId, expectedRevision: journal.revision, nextJournal, writerId: "fixture-writer-a" };
}

describe("Stage 2B fake Drive journal port", () => {
  it("T01 reads strict v3, and reports absent, unreadable and duplicate candidates", async () => {
    const f = stage2bFixture();
    const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [f.journal] });
    const read = await port.read();
    expect(read.status).toBe("verified");
    if (read.status !== "verified") throw new Error("fixture read failed");
    expect(isVerifiedRecoveryDriveSnapshot(read.snapshot)).toBe(true);
    expect(read.snapshot.journal).toEqual(f.journal);
    expect(await createFakeRecoveryDriveJournalPort({ scope: f.scope }).read()).toEqual({ status: "absent" });
    expect(await createFakeRecoveryDriveJournalPort({ scope: f.scope, readFault: "unreadable" }).read()).toEqual({ status: "unreadable" });
    expect(await createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [f.journal, f.journal] }).read()).toEqual({ status: "duplicate_candidates" });
  });

  it("T02 refuses unknown properties, invalid journals and wrong workspace", async () => {
    const f = stage2bFixture();
    for (const candidate of [{ ...f.journal, unexpected: true }, { schemaVersion: 3 }, { ...f.journal, workspaceId: "wrong" }]) {
      const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [candidate] });
      expect(await port.read()).toEqual({ status: "invalid_journal" });
      expect((await port.save(saveInput(f.journal))).status).toBe("rejected");
    }
  });

  it("T03 preserves stable/pending and isolates read snapshots from storage", async () => {
    const f = stage2bFixture();
    const original = structuredClone(f.binding);
    Object.freeze(f.binding.stable); Object.freeze(f.binding.pending);
    const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [f.journal] });
    expect((await port.save(saveInput(f.journal))).status).toBe("saved_mock");
    const read = await port.read();
    if (read.status !== "verified") throw new Error("fixture read failed");
    expect(read.snapshot.journal.sourceBinding).toEqual(original);
    read.snapshot.journal.originalPending.targetItems.length = 0;
    expect(isVerifiedRecoveryDriveSnapshot(read.snapshot)).toBe(false);
    const again = await port.read();
    if (again.status !== "verified") throw new Error("fixture reread failed");
    expect(again.snapshot.journal.originalPending.targetItems).toHaveLength(13);
    expect(f.binding).toEqual(original);
  });

  it("T04/T06 two writers on one store cannot commit the same revision", async () => {
    const f = stage2bFixture();
    const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [f.journal] });
    const reads = await Promise.all([port.read(), port.read()]);
    expect(reads.every((read) => read.status === "verified")).toBe(true);
    const first = saveInput(f.journal);
    const results = await Promise.all([port.save(first), port.save({ ...first, writerId: "fixture-writer-b" })]);
    expect(results.map((result) => result.status)).toEqual(["saved_mock", "rejected"]);
    expect(results[1]).toEqual({ status: "rejected", reason: "REVISION_CONFLICT" });
    expect(await port.save(first)).toEqual({ status: "rejected", reason: "REVISION_CONFLICT" });
  });

  it("T05 rejects a simultaneous second recovery on the same workspace/project", async () => {
    const f = stage2bFixture();
    const other = structuredClone(f.journal);
    other.recoveryId = "fixture-other-recovery";
    other.mediaCheckpoint.recoveryId = other.recoveryId;
    other.membershipCheckpoint.recoveryId = other.recoveryId;
    const port = createFakeRecoveryDriveJournalPort({ scope: f.scope });
    const results = await Promise.all([port.initialize(f.journal), port.initialize(other)]);
    expect(results.map((result) => result.status)).toEqual(["saved_mock", "rejected"]);
    expect(results[1]).toEqual({ status: "rejected", reason: "WORKSPACE_PROJECT_CONFLICT" });
  });

  it("T07/T08 rejects checkpoint rollback and retains the entire stored snapshot", async () => {
    const f = stage2bFixture();
    const current = advance(advance(f.journal, "PREFLIGHT_CONFIRMED"), "MEDIA_PREPARED");
    const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [current] });
    const forged = structuredClone(current);
    forged.revision += 1;
    forged.mediaCheckpoint.status = "not_started";
    forged.mediaCheckpoint.revision = 0;
    forged.mediaCheckpoint.journalRevision = forged.revision;
    expect(await port.save(saveInput(current, forged))).toEqual({ status: "rejected", reason: "INVALID_STATE_TRANSITION" });
    const read = await port.read();
    if (read.status !== "verified") throw new Error("fixture read failed");
    expect(read.snapshot.journal).toEqual(current);
  });

  it("T09/T10 distinguishes pre-save failure, lost response and unknown no-save", async () => {
    const f = stage2bFixture();
    for (const fault of ["fail_before_save", "lose_response_after_save", "unknown_without_save"] as const) {
      const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [f.journal], saveFault: fault });
      const result = await port.save(saveInput(f.journal));
      if (fault === "fail_before_save") {
        expect(result).toEqual({ status: "failed_before_save" });
        const read = await port.read();
        if (read.status !== "verified") throw new Error("fixture read failed");
        expect(read.snapshot.journal).toEqual(f.journal);
      } else {
        expect(result).toEqual({ status: "save_result_unknown", reconciliationRequired: true });
        expect(await port.save(saveInput(f.journal))).toEqual({ status: "rejected", reason: "RECONCILIATION_REQUIRED" });
        const read = await port.read();
        if (read.status !== "verified") throw new Error("fixture read failed");
        expect(read.snapshot.reconciliationRequired).toBe(true);
        expect(await port.reconcile()).toEqual({ status: fault === "lose_response_after_save" ? "matched" : "not_committed", automaticReplayAllowed: false });
      }
    }
  });

  it("T09/T10 also protects an ambiguous initial journal save", async () => {
    const f = stage2bFixture();
    for (const saveFault of ["fail_before_save", "lose_response_after_save", "unknown_without_save"] as const) {
      const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, saveFault });
      const initialized = await port.initialize(f.journal);
      if (saveFault === "fail_before_save") {
        expect(initialized).toEqual({ status: "failed_before_save" });
        expect(await port.read()).toEqual({ status: "absent" });
      } else {
        expect(initialized.status).toBe("save_result_unknown");
        expect((await port.initialize(f.journal)).status).toBe("rejected");
        expect(await port.reconcile()).toEqual({ status: saveFault === "lose_response_after_save"
          ? "matched" : "not_committed", automaticReplayAllowed: false });
        if (saveFault === "unknown_without_save") expect((await port.initialize(f.journal)).status).toBe("saved_mock");
      }
    }
  });

  it("T10 handles simultaneous reconciliation without clearing another attempt", async () => {
    const f = stage2bFixture();
    const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [f.journal], saveFault: "lose_response_after_save" });
    await port.save(saveInput(f.journal));
    const results = await Promise.all([port.reconcile(), port.reconcile()]);
    expect(results.map((result) => result.status)).toEqual(["matched", "conflict"]);
    expect(results.every((result) => result.automaticReplayAllowed === false)).toBe(true);
  });

  it("T25 permits canonical mock saves and keeps production/atomic authority closed", async () => {
    const f = stage2bFixture();
    const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [f.journal] });
    const next = advance(f.journal, "PREFLIGHT_CONFIRMED");
    const result = await port.save(saveInput(f.journal, next));
    expect(result.status).toBe("saved_mock");
    expect(port.productionWriteAllowed).toBe(false);
    expect(port.atomicCommitProven).toBe(false);
    if (result.status !== "saved_mock") throw new Error("fixture save failed");
    expect(result.snapshot.journal).toEqual(next);
    expect(result.snapshot.productionWriteAllowed).toBe(false);
  });

  it("retains partial created mappings when later verified results arrive", async () => {
    const f = stage2bFixture("two_captions");
    let current = f.journal;
    for (const type of ["PREFLIGHT_CONFIRMED", "MEDIA_PREPARED", "MEDIA_STARTED"] as const) {
      const result = advanceGooglePhotosSyncRecoverySimulation({ journal: current, expectedRevision: current.revision,
        now: "2026-10-11T00:01:00.000Z", event: { type } });
      if (!result.ok) throw new Error("fixture transition rejected");
      current = result.journal;
    }
    const first = { slideId: f.desiredSlides[10].slideId, mediaItemId: "fixture-first-created" };
    const second = { slideId: f.desiredSlides[11].slideId, mediaItemId: "fixture-second-created" };
    const partial = advanceGooglePhotosSyncRecoverySimulation({ journal: current, expectedRevision: current.revision,
      now: "2026-10-11T00:02:00.000Z", event: { type: "MEDIA_PARTIAL", createdItems: [first] } });
    if (!partial.ok) throw new Error("fixture partial rejected");
    current = partial.journal;
    const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [current] });
    const forged = advanceGooglePhotosSyncRecoverySimulation({ journal: current, expectedRevision: current.revision,
      now: "2026-10-11T00:03:00.000Z", event: { type: "MEDIA_VERIFIED", proof: "remote_snapshot",
        createdItems: [{ ...first, mediaItemId: "fixture-replaced-created" }, second] } });
    if (!forged.ok) throw new Error("fixture success rejected");
    expect(await port.save(saveInput(current, forged.journal))).toEqual({ status: "rejected", reason: "CONFIRMED_RESULTS_CHANGED" });
    const read = await port.read();
    if (read.status !== "verified") throw new Error("fixture read failed");
    expect(read.snapshot.journal).toEqual(current);
    const legitimate = advanceGooglePhotosSyncRecoverySimulation({ journal: current, expectedRevision: current.revision,
      now: "2026-10-11T00:03:00.000Z", event: { type: "MEDIA_VERIFIED", proof: "remote_snapshot", createdItems: [first, second] } });
    if (!legitimate.ok) throw new Error("fixture verification rejected");
    expect((await port.save(saveInput(current, legitimate.journal))).status).toBe("saved_mock");
  });
});
