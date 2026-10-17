import { evaluateT13LocalEligibility } from "../../src/lib/google-photos-export/t13-local-eligibility";
import type { T13LocalEligibilityDecision, T13LocalEligibilityInput } from "../../src/lib/google-photos-export/t13-local-eligibility";
import { FIXED_SEED } from "./fixture-factory";
import type { Step, Worker } from "./scheduler";

export type Fault = "none" | "read-failure" | "write-failure" | "commit-response-lost" | "incomplete-candidates" | "stale-snapshot";
type Binding = T13LocalEligibilityInput["bindingCandidates"][number];
export type ScopedBinding = Binding & Readonly<{ action: string }>;
type Snapshot = Readonly<{
  revision: number;
  complete: boolean;
  commitOutcome: "known" | "unknown";
  claim: T13LocalEligibilityInput;
  bindings: readonly ScopedBinding[];
}>;
export type Decision =
  | Readonly<{ source: "m1"; decision: T13LocalEligibilityDecision }>
  | Readonly<{ source: "assembler"; decision: { outcome: "STOP"; reason: "authority-unavailable" | "candidates-incomplete" | "authority-conflict" | "commit-unknown" | "write-failed" } }>;

function stopped(reason: Extract<Decision, { source: "assembler" }>["decision"]["reason"]): Decision {
  return { source: "assembler", decision: { outcome: "STOP", reason } };
}

/** A test model only. It establishes no database atomicity or persistence. */
export class AuthorityModel {
  private state: Snapshot;
  private previous: Snapshot;

  constructor(claim: T13LocalEligibilityInput, bindings: readonly ScopedBinding[] = claim.bindingCandidates.map(binding => ({ ...binding, action: claim.requestedAction }))) {
    this.state = structuredClone({ revision: 10, complete: true, commitOutcome: "known", claim, bindings });
    this.previous = structuredClone(this.state);
  }

  read(fault: Fault = "none"): Snapshot | null {
    if (fault === "read-failure") return null;
    const snapshot = structuredClone(fault === "stale-snapshot" ? this.previous : this.state);
    return fault === "incomplete-candidates" ? { ...snapshot, complete: false } : snapshot;
  }

  /** Synchronous synthetic CAS; no external store or transaction is exercised. */
  write(expectedRevision: number, bindings: readonly ScopedBinding[], fault: Fault = "none"): Decision | null {
    if (this.state.commitOutcome === "unknown") return stopped("commit-unknown");
    if (fault === "write-failure") return stopped("write-failed");
    if (expectedRevision !== this.state.revision) return stopped("authority-conflict");
    this.previous = structuredClone(this.state);
    this.state = {
      ...this.state, revision: this.state.revision + 1,
      bindings: structuredClone(bindings),
      commitOutcome: fault === "commit-response-lost" ? "unknown" : "known",
    };
    return fault === "commit-response-lost" ? stopped("commit-unknown") : null;
  }

  evaluate(snapshot: Snapshot | null): Decision {
    if (!snapshot) return stopped("authority-unavailable");
    if (this.state.commitOutcome === "unknown" || snapshot.commitOutcome === "unknown") return stopped("commit-unknown");
    if (!snapshot.complete) return stopped("candidates-incomplete");
    if (snapshot.revision !== this.state.revision) return stopped("authority-conflict");
    const claim = snapshot.claim;
    // Complete scope first. Principal/client attributes are compared only by M1.
    const candidates = snapshot.bindings.filter(binding =>
      binding.ownerId === claim.appOwner.resolvedOwnerId &&
      binding.workspaceId === claim.workspacePermission.workspaceId &&
      binding.action === claim.requestedAction && binding.active && !binding.revoked,
    );
    return { source: "m1", decision: evaluateT13LocalEligibility({ ...claim, bindingCandidates: candidates }) };
  }
}

export type CaseName = "T01" | "T02" | "T03" | "T04" | "T05" | "T06" | "T07" | "T08" | "T09" | "T10";
export type Evidence = Readonly<{
  caseName: CaseName; worker: Worker; seed: typeof FIXED_SEED;
  barrierOrder: readonly Step[]; revision: number; candidateCount: number;
  fault: Fault; m1: T13LocalEligibilityDecision | null;
}>;

/** Closed field projection: authority rows and raw errors cannot be serialized here. */
export function collectEvidence(input: Omit<Evidence, "seed" | "m1">, result: Decision): Evidence {
  return {
    caseName: input.caseName, worker: input.worker, seed: FIXED_SEED,
    barrierOrder: input.barrierOrder.map(step => ({ worker: step.worker, barrier: step.barrier })),
    revision: input.revision, candidateCount: input.candidateCount, fault: input.fault,
    m1: result.source === "m1" ? { outcome: result.decision.outcome, reason: result.decision.reason } : null,
  };
}
