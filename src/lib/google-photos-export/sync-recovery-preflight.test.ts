import { describe, expect, it } from "vitest";
import { createFakeRecoveryDriveJournalPort } from "./sync-recovery-drive-port";
import { validateRecoveryPhotosObservation } from "./sync-recovery-photos-port";
import { preflightGooglePhotosRecovery } from "./sync-recovery-preflight";
import { advanceGooglePhotosSyncRecoverySimulation } from "./sync-recovery-simulation";
import { stage2bFixture, stage2bPreflightInput } from "./sync-recovery-stage2b.test-fixtures";

describe("Stage 2B read-only preflight", () => {
  it("T15 accepts a complete 13-image mock despite the protected old pending source", async () => {
    const input = await stage2bPreflightInput();
    const report = preflightGooglePhotosRecovery(input);
    expect(report).toMatchObject({ verdict: "pass_local", stopReasons: [], sourceChangedSincePending: true,
      journalRevision: 1, operationState: "PREFLIGHT", classifications: { reuse: 13, createRequired: 0, indeterminate: 0 },
      membership: { observed: 13, missing: 0, extra: 0, duplicates: 0 },
      orderStatus: "matched", orderBasis: "pending_snapshot", productionWriteAllowed: false, atomicCommitProven: false });
  });

  it.each([
    ["T11", "sourceFingerprint", "fixture-changed-source", "SOURCE_DRIFT"],
    ["T12", "stableGeneration", 8, "STABLE_CHANGED"],
    ["T13", "pendingIdentity", "fixture-changed-pending", "PENDING_CHANGED"],
    ["operation identity", "recoveryId", "fixture-other-recovery", "RECOVERY_ID_MISMATCH"],
    ["concurrent operation", "concurrentOperationDetected", true, "CONCURRENT_OPERATION"],
  ] as const)("%s stops on authority drift", async (_label, key, value, reason) => {
    const input = await stage2bPreflightInput();
    const report = preflightGooglePhotosRecovery({ ...input, authority: { ...input.authority, [key]: value } });
    expect(report.verdict).toBe("stopped");
    expect(report.stopReasons).toContain(reason);
    expect(report.productionWriteAllowed).toBe(false);
  });

  it("T14 detects membership drift independently of caller expected values", async () => {
    const f = stage2bFixture();
    f.observation.pages[0].items.reverse();
    const report = preflightGooglePhotosRecovery(await stage2bPreflightInput(f));
    expect(report.stopReasons).toContain("MEMBERSHIP_DRIFT");
    expect(report.verdict).toBe("stopped");
  });

  it("T16 identifies just the changed-render image as a regeneration candidate", async () => {
    const input = await stage2bPreflightInput(stage2bFixture("caption_changed"));
    const report = preflightGooglePhotosRecovery(input);
    expect(report).toMatchObject({ verdict: "pass_local", classifications: { reuse: 12, createRequired: 1, indeterminate: 0 },
      regenerateCandidateCount: 1, orderStatus: "matched", productionWriteAllowed: false });
  });

  it("T17 protects an interleaved unmanaged image without counting it as extra", async () => {
    const report = preflightGooglePhotosRecovery(await stage2bPreflightInput(stage2bFixture("unmanaged")));
    expect(report).toMatchObject({ verdict: "pass_local", managedCount: 13, protectedUnmanagedCount: 1,
      membership: { observed: 14, missing: 0, extra: 0 }, orderStatus: "matched" });
  });

  it("T18 stops on unknown ownership or an app-owned claim lacking recorded provenance", async () => {
    for (const variant of ["unknown", "unrecorded"] as const) {
      const f = stage2bFixture();
      if (variant === "unknown") f.observation.pages[0].items[0].ownership = "unknown";
      else f.observation.pages[0].items.push({ mediaItemId: "fixture-unrecorded-created", ownership: "app_managed", createdProvenance: null });
      const report = preflightGooglePhotosRecovery(await stage2bPreflightInput(f));
      expect(report.stopReasons).toContain("OWNERSHIP_UNKNOWN");
      expect(report.unprovenProvenanceCount).toBeGreaterThan(0);
      expect(report.verdict).toBe("stopped");
    }
  });

  it("T20 detects reversed order and stops when order evidence is unknown", async () => {
    const f = stage2bFixture();
    f.observation.pages[0].items.reverse();
    let report = preflightGooglePhotosRecovery(await stage2bPreflightInput(f));
    expect(report.orderStatus).toBe("mismatched");
    expect(report.stopReasons).toContain("ORDER_MISMATCH");
    f.observation.pages[0].items.reverse();
    f.observation.pages[0].orderEvidence = "unknown";
    report = preflightGooglePhotosRecovery(await stage2bPreflightInput(f));
    expect(report.orderStatus).toBe("unknown");
    expect(report.stopReasons).toContain("ORDER_UNVERIFIED");
    expect(report.verdict).toBe("stopped");
  });

  it("T21 reports missing and extra membership without managing the extra image", async () => {
    const f = stage2bFixture();
    f.observation.pages[0].items.pop();
    f.observation.pages[0].items.push({ mediaItemId: "fixture-extra-image", ownership: "unmanaged", createdProvenance: null });
    const report = preflightGooglePhotosRecovery(await stage2bPreflightInput(f));
    expect(report.membership).toEqual({ observed: 13, missing: 1, extra: 1, duplicates: 0 });
    expect(report.stopReasons).toContain("MEMBERSHIP_INCOMPLETE");
    expect(report.orderStatus).toBe("unknown");
  });

  it("T19/T22 hides incomplete counts but reports validated duplicate counts", async () => {
    const f = stage2bFixture();
    f.observation.pages[0].nextPageToken = "fixture-unread-page";
    let report = preflightGooglePhotosRecovery(await stage2bPreflightInput(f));
    expect(report.stopReasons).toContain("INVALID_PAGING");
    expect(report.membership.observed).toBeNull();
    expect(report.classifications).toBeNull();
    f.observation.pages[0].nextPageToken = null;
    f.observation.pages[0].items.push(f.observation.pages[0].items[0]);
    report = preflightGooglePhotosRecovery(await stage2bPreflightInput(f));
    expect(report.stopReasons).toContain("DUPLICATE_MEDIA_ID");
    expect(report.membership).toEqual({ observed: null, missing: null, extra: null, duplicates: 1 });
  });

  it("T10 requires explicit reconciliation after a save response is lost", async () => {
    const f = stage2bFixture();
    const port = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [f.journal], saveFault: "lose_response_after_save" });
    const advanced = advanceGooglePhotosSyncRecoverySimulation({ journal: f.journal, expectedRevision: 1,
      now: "2026-10-11T00:01:00.000Z", event: { type: "PREFLIGHT_CONFIRMED" } });
    if (!advanced.ok) throw new Error("fixture transition rejected");
    await port.save({ recoveryId: f.journal.recoveryId, expectedRevision: 1, nextJournal: advanced.journal, writerId: "fixture-writer" });
    const input = await stage2bPreflightInput(f);
    const stopped = preflightGooglePhotosRecovery({ ...input, journal: advanced.journal, drive: await port.read() });
    expect(stopped.stopReasons).toContain("RECONCILIATION_REQUIRED");
    expect(stopped.remoteReverificationRequired).toBe(true);
    expect(await port.reconcile()).toEqual({ status: "matched", automaticReplayAllowed: false });
    expect(preflightGooglePhotosRecovery({ ...input, journal: advanced.journal, drive: await port.read() }).verdict).toBe("pass_local");
  });

  it("keeps an interrupted operation stopped even with complete matching observations", async () => {
    const f = stage2bFixture("caption_changed");
    for (const type of ["PREFLIGHT_CONFIRMED", "MEDIA_PREPARED", "MEDIA_STARTED", "MEDIA_RESULT_UNKNOWN"] as const) {
      const next = advanceGooglePhotosSyncRecoverySimulation({ journal: f.journal, expectedRevision: f.journal.revision,
        now: "2026-10-11T00:01:00.000Z", event: { type } });
      if (!next.ok) throw new Error("fixture transition rejected");
      f.journal = next.journal;
    }
    const report = preflightGooglePhotosRecovery(await stage2bPreflightInput(f));
    expect(report.operationState).toBe("RECOVERY_REQUIRED");
    expect(report.stopReasons).toContain("OPERATION_STOPPED");
    expect(report.remoteReverificationRequired).toBe(true);
    expect(report.productionWriteAllowed).toBe(false);
  });

  it("rejects fabricated/mutated snapshots, journal revision drift and changed slide order", async () => {
    const input = await stage2bPreflightInput();
    expect(preflightGooglePhotosRecovery({ ...input, drive: structuredClone(input.drive) }).stopReasons).toContain("UNVERIFIED_DRIVE_SNAPSHOT");
    expect(preflightGooglePhotosRecovery({ ...input, photos: structuredClone(input.photos) }).stopReasons).toContain("UNVERIFIED_PHOTOS_SNAPSHOT");
    expect(preflightGooglePhotosRecovery({ ...input, authority: { ...input.authority, desiredSlides: [...input.authority.desiredSlides].reverse() } }).stopReasons).toContain("TARGET_SLIDES_CHANGED");
    const f = stage2bFixture();
    const next = advanceGooglePhotosSyncRecoverySimulation({ journal: f.journal, expectedRevision: 1,
      now: "2026-10-11T00:01:00.000Z", event: { type: "PREFLIGHT_CONFIRMED" } });
    if (!next.ok) throw new Error("fixture transition rejected");
    expect(preflightGooglePhotosRecovery({ ...input, journal: next.journal }).stopReasons).toContain("JOURNAL_DRIFT");
  });

  it("stops safely on an absent binding album and refuses cyclic snapshot mutations", async () => {
    const f = stage2bFixture();
    f.journal.sourceBinding.album = null;
    const input = await stage2bPreflightInput(f);
    expect(preflightGooglePhotosRecovery(input).stopReasons).toContain("SCOPE_MISMATCH");
    if (input.drive.status !== "verified" || input.photos.status !== "verified") throw new Error("fixture read failed");
    Object.assign(input.drive.snapshot, { cyclic: input.drive.snapshot });
    Object.assign(input.photos.snapshot, { cyclic: input.photos.snapshot });
    const report = preflightGooglePhotosRecovery(input);
    expect(report.stopReasons).toContain("UNVERIFIED_DRIVE_SNAPSHOT");
    expect(report.stopReasons).toContain("UNVERIFIED_PHOTOS_SNAPSHOT");
  });

  it("checks creation provenance against recorded slide and recovery identity", async () => {
    const f = stage2bFixture("caption_changed");
    let journal = f.journal;
    for (const type of ["PREFLIGHT_CONFIRMED", "MEDIA_PREPARED", "MEDIA_STARTED"] as const) {
      const next = advanceGooglePhotosSyncRecoverySimulation({ journal, expectedRevision: journal.revision,
        now: "2026-10-11T00:01:00.000Z", event: { type } });
      if (!next.ok) throw new Error("fixture transition rejected");
      journal = next.journal;
    }
    const created = advanceGooglePhotosSyncRecoverySimulation({ journal, expectedRevision: journal.revision,
      now: "2026-10-11T00:02:00.000Z", event: { type: "MEDIA_VERIFIED", createdItems: [{
        slideId: f.desiredSlides[11].slideId, mediaItemId: "fixture-new-media" }], proof: "direct_response" } });
    if (!created.ok) throw new Error("fixture create rejected");
    const input = await stage2bPreflightInput({ ...f, journal: created.journal });
    const observation = structuredClone(f.observation);
    observation.pages[0].items.push({ mediaItemId: "fixture-new-media", ownership: "app_managed",
      createdProvenance: { recoveryId: "fixture-wrong-recovery", slideId: f.desiredSlides[11].slideId } });
    input.photos = validateRecoveryPhotosObservation(observation, f.photosScope);
    expect(preflightGooglePhotosRecovery(input).stopReasons).toContain("CREATED_PROVENANCE_UNVERIFIED");
  });
});
