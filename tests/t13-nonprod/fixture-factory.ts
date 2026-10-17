import type { T13LocalEligibilityInput } from "../../src/lib/google-photos-export/t13-local-eligibility";

export const FIXED_SEED = 13;
export const FIXED_CLOCK = 1_700_000_000_000;

/** Synthetic aliases only; no identity or provider authentication is performed. */
export function createFixture(): T13LocalEligibilityInput {
  const principal = { issuer: "issuer.synthetic", subject: `P-A-${FIXED_SEED}` };
  const ownerId = `O-A-${FIXED_SEED}`;
  const workspaceId = `W-A-${FIXED_SEED}`;
  const clientId = `C-A-${FIXED_SEED}`;
  const times = { issuedAt: FIXED_CLOCK - 1_000, expiresAt: FIXED_CLOCK + 1_000 };
  return {
    evaluationTime: FIXED_CLOCK,
    requestedAction: "X-A",
    appSession: { authenticatedSubjectId: "U-A", active: true, ...times },
    appOwner: {
      authenticatedSubjectId: "U-A", resolvedOwnerId: ownerId,
      candidateOwnerIds: [ownerId],
    },
    workspacePermission: {
      workspaceId, ownerId, action: "X-A", permission: "allow",
      aclVersion: "20", expectedAclVersion: "20", ...times,
    },
    googlePrincipal: { resolvedPrincipal: principal, candidatePrincipals: [{ ...principal }] },
    clientId,
    bindingCandidates: [{
      bindingId: "B-A", ownerId, workspaceId, clientId,
      principal: { ...principal }, active: true, revoked: false, ...times,
    }],
    resourceProvenance: {
      state: "verified", workspaceId, clientId,
      historicalOriginalOwnerId: ownerId, historicalOriginalClientId: clientId,
      principal: { ...principal }, recordedAt: FIXED_CLOCK - 1_000,
    },
  };
}
