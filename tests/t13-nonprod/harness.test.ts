import { describe, expect, it } from "vitest";
import { createFixture, FIXED_SEED } from "./fixture-factory";
import { AuthorityModel, collectEvidence } from "./harness";
import { Scheduler } from "./scheduler";
import type { Worker } from "./scheduler";

function normal() {
  const model = new AuthorityModel(createFixture());
  expect(model.evaluate(model.read())).toEqual({ source: "m1", decision: { outcome: "eligible_local", reason: "eligible-local-claims-consistent" } });
}

describe("T13 P1 synthetic-only harness", () => {
  it("T01 complete claims are repeatable and independent", () => {
    normal();
    expect(createFixture()).toEqual(createFixture());
    expect(createFixture()).not.toBe(createFixture());
  });

  it("T02 complete empty binding scope denies", () => {
    normal();
    const model = new AuthorityModel(createFixture(), []);
    expect(model.evaluate(model.read()).decision).toEqual({ outcome: "DENY", reason: "binding-candidate-missing" });
  });

  it("T03 differing principal/client duplicate remains visible", () => {
    normal();
    const claim = createFixture();
    const first = { ...claim.bindingCandidates[0], action: claim.requestedAction };
    const second = { ...first, bindingId: "B-B", clientId: "C-B", principal: { issuer: "issuer.synthetic", subject: "P-B" } };
    const model = new AuthorityModel(claim, [first, second]);
    expect(model.evaluate(model.read()).decision).toEqual({ outcome: "STOP", reason: "binding-candidate-ambiguous" });
    const unrelated = { ...second, action: "X-B" };
    const scoped = new AuthorityModel(claim, [first, unrelated]);
    expect(scoped.evaluate(scoped.read()).decision.outcome).toBe("eligible_local");
    const revoked = new AuthorityModel(claim, [first, { ...second, revoked: true }]);
    expect(revoked.evaluate(revoked.read()).decision.outcome).toBe("eligible_local");
  });

  it("T04 a singleton principal or client mismatch denies", () => {
    normal();
    for (const mismatch of [{ principal: { issuer: "issuer.synthetic", subject: "P-B" } }, { clientId: "C-B" }]) {
      const claim = createFixture();
      const model = new AuthorityModel(claim, [{ ...claim.bindingCandidates[0], ...mismatch, action: claim.requestedAction }]);
      expect(model.evaluate(model.read()).decision.outcome).toBe("DENY");
    }
  });

  it("T05 read failure and incomplete empty sets stop", () => {
    normal();
    const model = new AuthorityModel(createFixture(), []);
    for (const fault of ["read-failure", "incomplete-candidates"] as const) {
      expect(model.evaluate(model.read(fault)).decision.outcome).toBe("STOP");
    }
  });

  it("T06 old revision and stale authority cannot reuse an allow", () => {
    normal();
    const model = new AuthorityModel(createFixture());
    const old = model.read();
    expect(model.write(10, [])).toBeNull();
    expect(model.evaluate(old).decision.outcome).toBe("STOP");
    expect(model.evaluate(model.read("stale-snapshot")).decision.outcome).toBe("STOP");
    expect(model.write(10, [])?.decision.outcome).toBe("STOP");
    expect(model.evaluate(model.read()).decision.outcome).toBe("DENY");
  });

  it("T07 unknown provenance holds", () => {
    normal();
    const claim = createFixture();
    const model = new AuthorityModel({ ...claim, resourceProvenance: { ...claim.resourceProvenance, state: "unknown" } });
    expect(model.evaluate(model.read()).decision).toEqual({ outcome: "HOLD", reason: "provenance-unknown" });
  });

  it("T08 assembled ACL version mismatch preserves M1 DENY", () => {
    normal();
    const claim = createFixture();
    const model = new AuthorityModel({ ...claim, workspacePermission: { ...claim.workspacePermission, expectedAclVersion: "19" } });
    expect(model.evaluate(model.read())).toEqual({ source: "m1", decision: { outcome: "DENY", reason: "workspace-acl-version-mismatch" } });
  });

  it("T09 unknown commit stops even if synthetic state changed; write failure preserves state", () => {
    normal();
    const model = new AuthorityModel(createFixture());
    expect(model.write(10, [], "commit-response-lost")?.decision.outcome).toBe("STOP");
    expect(model.read()?.revision).toBe(11);
    expect(model.evaluate(model.read()).decision.outcome).toBe("STOP");
    expect(model.write(11, [])?.decision.outcome).toBe("STOP");
    const failed = new AuthorityModel(createFixture());
    expect(failed.write(10, [], "write-failure")?.decision.outcome).toBe("STOP");
    expect(failed.read()?.revision).toBe(10);
    expect(failed.evaluate(failed.read()).decision.outcome).toBe("eligible_local");
  });

  it("T10 deterministic A/B and 8-worker barriers collect only anonymous evidence", async () => {
    normal();
    for (const workers of [["B", "A"], ["H", "G", "F", "E", "D", "C", "B", "A"]] as Worker[][]) {
      const plan = workers.map(worker => ({ worker, barrier: "read" as const }));
      const scheduler = new Scheduler(plan);
      const completed: Worker[] = [];
      const tasks = [...plan].reverse().map(async step => {
        await scheduler.wait(step);
        completed.push(step.worker);
      });
      for (const _ of plan) await scheduler.releaseNext();
      await Promise.all(tasks);
      expect(completed).toEqual(workers);
      expect(scheduler.trace()).toEqual(plan);
      const model = new AuthorityModel(createFixture());
      const evidence = collectEvidence({ caseName: "T10", worker: "A", barrierOrder: scheduler.trace(), revision: 10, candidateCount: 1, fault: "none" }, model.evaluate(model.read()));
      expect(evidence).toEqual({ caseName: "T10", worker: "A", seed: FIXED_SEED, barrierOrder: plan, revision: 10, candidateCount: 1, fault: "none", m1: { outcome: "eligible_local", reason: "eligible-local-claims-consistent" } });
      expect(Object.keys(evidence).sort()).toEqual(["barrierOrder", "candidateCount", "caseName", "fault", "m1", "revision", "seed", "worker"]);
    }
  });
});
