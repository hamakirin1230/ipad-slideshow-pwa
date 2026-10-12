import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { evaluateT13LocalEligibility } from "./t13-local-eligibility";

const evaluationTime = 1_700_000_000_000;

function createInput() {
  const principal = { issuer: "issuer.synthetic", subject: "account-i" };

  return {
    evaluationTime,
    requestedAction: "recovery",
    appSession: {
      authenticatedSubjectId: "subject-i",
      active: true,
      issuedAt: evaluationTime - 1_000,
      expiresAt: evaluationTime + 1_000,
    },
    appOwner: {
      authenticatedSubjectId: "subject-i",
      resolvedOwnerId: "owner-i",
      candidateOwnerIds: ["owner-i"],
    },
    workspacePermission: {
      workspaceId: "workspace-i",
      ownerId: "owner-i",
      action: "recovery",
      permission: "allow",
      aclVersion: "acl-v1",
      expectedAclVersion: "acl-v1",
      issuedAt: evaluationTime - 1_000,
      expiresAt: evaluationTime + 1_000,
    },
    googlePrincipal: {
      resolvedPrincipal: principal,
      candidatePrincipals: [{ ...principal }],
    },
    clientId: "client-i",
    bindingCandidates: [
      {
        bindingId: "binding-i",
        ownerId: "owner-i",
        workspaceId: "workspace-i",
        clientId: "client-i",
        principal: { ...principal },
        active: true,
        revoked: false,
        issuedAt: evaluationTime - 1_000,
        expiresAt: evaluationTime + 1_000,
      },
    ],
    resourceProvenance: {
      state: "verified",
      workspaceId: "workspace-i",
      clientId: "client-i",
      historicalOriginalOwnerId: "owner-i",
      historicalOriginalClientId: "client-i",
      principal: { ...principal },
      recordedAt: evaluationTime - 1_000,
    },
  };
}

function expectOutcome(input: unknown, outcome: "DENY" | "STOP" | "HOLD") {
  expect(evaluateT13LocalEligibility(input).outcome).toBe(outcome);
  expect(evaluateT13LocalEligibility(input).outcome).not.toBe("eligible_local");
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

describe("T13 local eligibility", () => {
  it("A01 returns eligible_local only for complete matching synthetic claims", () => {
    expect(evaluateT13LocalEligibility(createInput())).toEqual({
      outcome: "eligible_local",
      reason: "eligible-local-claims-consistent",
    });
  });

  it("A02 denies a Google principal mismatch", () => {
    const input = createInput();
    input.googlePrincipal.candidatePrincipals = [
      { issuer: "issuer.synthetic", subject: "account-j" },
    ];

    expectOutcome(input, "DENY");
  });

  it("A03 denies app subject and app owner mismatches", () => {
    const subjectMismatch = createInput();
    subjectMismatch.appOwner.authenticatedSubjectId = "subject-j";
    expectOutcome(subjectMismatch, "DENY");

    const ownerMismatch = createInput();
    ownerMismatch.workspacePermission.ownerId = "owner-j";
    expectOutcome(ownerMismatch, "DENY");
  });

  it("A04 denies a missing workspace permission", () => {
    const input = createInput();
    input.workspacePermission.permission = "deny";

    expectOutcome(input, "DENY");
  });

  it("A05 stops for multiple owner, principal, or binding candidates", () => {
    const ownerAmbiguity = createInput();
    ownerAmbiguity.appOwner.candidateOwnerIds = ["owner-i", "owner-j"];
    expectOutcome(ownerAmbiguity, "STOP");

    const principalAmbiguity = createInput();
    principalAmbiguity.googlePrincipal.candidatePrincipals = [
      { issuer: "issuer.synthetic", subject: "account-i" },
      { issuer: "issuer.synthetic", subject: "account-j" },
    ];
    expectOutcome(principalAmbiguity, "STOP");

    const bindingAmbiguity = createInput();
    bindingAmbiguity.bindingCandidates = [
      bindingAmbiguity.bindingCandidates[0],
      { ...bindingAmbiguity.bindingCandidates[0], bindingId: "binding-j" },
    ];
    expectOutcome(bindingAmbiguity, "STOP");
  });

  it("A06 holds when historical original owner or client is unknown", () => {
    const input = createInput();
    input.resourceProvenance.historicalOriginalOwnerId = null;

    expectOutcome(input, "HOLD");
  });

  it("denies missing, malformed, empty, NaN, Infinity, and unknown claims", () => {
    expectOutcome(undefined, "DENY");

    const emptyClient = createInput();
    emptyClient.clientId = "";
    expectOutcome(emptyClient, "DENY");

    const nanTime = createInput();
    nanTime.evaluationTime = Number.NaN;
    expectOutcome(nanTime, "DENY");

    const infiniteTime = createInput();
    infiniteTime.appSession.expiresAt = Number.POSITIVE_INFINITY;
    expectOutcome(infiniteTime, "DENY");

    const unknownProvenance = createInput();
    unknownProvenance.resourceProvenance.state = "unrecognized";
    expectOutcome(unknownProvenance, "DENY");
  });

  it("denies expired, inactive, and future-issued sessions", () => {
    const expired = createInput();
    expired.appSession.expiresAt = evaluationTime;
    expectOutcome(expired, "DENY");

    const inactive = createInput();
    inactive.appSession.active = false;
    expectOutcome(inactive, "DENY");

    const futureIssued = createInput();
    futureIssued.appSession.issuedAt = evaluationTime + 1;
    futureIssued.appSession.expiresAt = evaluationTime + 2;
    expectOutcome(futureIssued, "DENY");
  });

  it("denies expired or stale workspace ACL claims and workspace-owner mismatch", () => {
    const expired = createInput();
    expired.workspacePermission.expiresAt = evaluationTime;
    expectOutcome(expired, "DENY");

    const stale = createInput();
    stale.workspacePermission.expectedAclVersion = "acl-v2";
    expectOutcome(stale, "DENY");

    const ownerMismatch = createInput();
    ownerMismatch.workspacePermission.ownerId = "owner-j";
    expectOutcome(ownerMismatch, "DENY");
  });

  it("denies revoked, expired, cross-workspace, and cross-client bindings", () => {
    const revoked = createInput();
    revoked.bindingCandidates[0].revoked = true;
    expectOutcome(revoked, "DENY");

    const expired = createInput();
    expired.bindingCandidates[0].expiresAt = evaluationTime;
    expectOutcome(expired, "DENY");

    const workspaceMismatch = createInput();
    workspaceMismatch.bindingCandidates[0].workspaceId = "workspace-j";
    expectOutcome(workspaceMismatch, "DENY");

    const clientMismatch = createInput();
    clientMismatch.bindingCandidates[0].clientId = "client-j";
    expectOutcome(clientMismatch, "DENY");
  });

  it("stops for invalid or incompatible provenance and holds for unknown provenance", () => {
    const invalid = createInput();
    invalid.resourceProvenance.state = "invalid";
    expectOutcome(invalid, "STOP");

    const unknown = createInput();
    unknown.resourceProvenance.state = "unknown";
    expectOutcome(unknown, "HOLD");

    const ownerMismatch = createInput();
    ownerMismatch.resourceProvenance.historicalOriginalOwnerId = "owner-j";
    expectOutcome(ownerMismatch, "STOP");

    const clientMismatch = createInput();
    clientMismatch.resourceProvenance.historicalOriginalClientId = "client-j";
    expectOutcome(clientMismatch, "STOP");

    const principalMismatch = createInput();
    principalMismatch.resourceProvenance.principal = {
      issuer: "issuer.synthetic",
      subject: "account-j",
    };
    expectOutcome(principalMismatch, "STOP");

    const futureRecorded = createInput();
    futureRecorded.resourceProvenance.recordedAt = evaluationTime + 1;
    expectOutcome(futureRecorded, "STOP");
  });

  it("denies zero candidates and gives malformed input priority over ambiguity", () => {
    const noOwner = createInput();
    noOwner.appOwner.candidateOwnerIds = [];
    expectOutcome(noOwner, "DENY");

    const noPrincipal = createInput();
    noPrincipal.googlePrincipal.candidatePrincipals = [];
    expectOutcome(noPrincipal, "DENY");

    const noBinding = createInput();
    noBinding.bindingCandidates = [];
    expectOutcome(noBinding, "DENY");

    const malformedAndAmbiguous = createInput();
    malformedAndAmbiguous.appOwner.candidateOwnerIds = ["owner-i", "owner-j"];
    malformedAndAmbiguous.bindingCandidates = [{}];
    expect(evaluateT13LocalEligibility(malformedAndAmbiguous)).toEqual({
      outcome: "DENY",
      reason: "claims-invalid",
    });
  });

  it("is deterministic and does not mutate frozen nested input", () => {
    const input = deepFreeze(createInput());
    const before = JSON.stringify(input);
    const first = evaluateT13LocalEligibility(input);
    const second = evaluateT13LocalEligibility(input);

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    expect(first.outcome).toBe("eligible_local");
  });

  it("has no imports or forbidden external-state references", () => {
    const source = readFileSync(
      new URL("./t13-local-eligibility.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(
      /fetch\(|XMLHttpRequest|process\.env|\bwindow\b|localStorage|sessionStorage|\bcookie\b|Date\.now|console\./,
    );
  });
});
