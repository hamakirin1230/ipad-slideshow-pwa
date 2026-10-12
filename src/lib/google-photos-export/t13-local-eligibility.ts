/**
 * Local consistency evaluator for synthetic T13 claims.
 *
 * The caller is responsible for obtaining these claims from future trusted
 * server-side boundaries. This module does not authenticate them, does not
 * authorize a provider request, and does not establish Google identity.
 * `eligible_local` means only that the supplied synthetic claims are
 * internally consistent at `evaluationTime`.
 */

export type T13LocalEligibilityOutcome =
  | "eligible_local"
  | "DENY"
  | "STOP"
  | "HOLD";

export type T13LocalEligibilityReason =
  | "eligible-local-claims-consistent"
  | "claims-invalid"
  | "app-session-inactive"
  | "app-session-expired"
  | "app-session-time-invalid"
  | "app-subject-mismatch"
  | "owner-candidate-missing"
  | "owner-candidate-ambiguous"
  | "app-owner-mismatch"
  | "workspace-permission-denied"
  | "workspace-acl-expired"
  | "workspace-acl-time-invalid"
  | "workspace-acl-version-mismatch"
  | "principal-candidate-missing"
  | "principal-candidate-ambiguous"
  | "google-principal-mismatch"
  | "binding-candidate-missing"
  | "binding-candidate-ambiguous"
  | "binding-revoked"
  | "binding-expired"
  | "binding-time-invalid"
  | "owner-principal-cross-binding-mismatch"
  | "binding-workspace-mismatch"
  | "binding-client-mismatch"
  | "provenance-unknown"
  | "provenance-invalid"
  | "provenance-time-invalid"
  | "historical-owner-client-unknown"
  | "provenance-owner-mismatch"
  | "provenance-principal-mismatch"
  | "provenance-workspace-mismatch"
  | "provenance-client-mismatch";

export type T13LocalEligibilityDecision = Readonly<{
  outcome: T13LocalEligibilityOutcome;
  reason: T13LocalEligibilityReason;
}>;

export type T13GooglePrincipal = Readonly<{
  issuer: string;
  subject: string;
}>;

export type T13AppSessionClaim = Readonly<{
  authenticatedSubjectId: string;
  active: boolean;
  issuedAt: number;
  expiresAt: number;
}>;

export type T13AppOwnerClaim = Readonly<{
  authenticatedSubjectId: string;
  resolvedOwnerId: string;
  candidateOwnerIds: readonly string[];
}>;

export type T13WorkspacePermissionClaim = Readonly<{
  workspaceId: string;
  ownerId: string;
  action: string;
  permission: "allow" | "deny";
  aclVersion: string;
  expectedAclVersion: string;
  issuedAt: number;
  expiresAt: number;
}>;

export type T13GooglePrincipalClaim = Readonly<{
  resolvedPrincipal: T13GooglePrincipal;
  candidatePrincipals: readonly T13GooglePrincipal[];
}>;

export type T13OwnerPrincipalBindingClaim = Readonly<{
  bindingId: string;
  ownerId: string;
  workspaceId: string;
  clientId: string;
  principal: T13GooglePrincipal;
  active: boolean;
  revoked: boolean;
  issuedAt: number;
  expiresAt: number;
}>;

export type T13ResourceProvenanceClaim = Readonly<{
  state: "verified" | "unknown" | "missing" | "invalid";
  workspaceId: string;
  clientId: string;
  historicalOriginalOwnerId: string | null;
  historicalOriginalClientId: string | null;
  principal: T13GooglePrincipal | null;
  recordedAt: number | null;
}>;

export type T13LocalEligibilityInput = Readonly<{
  evaluationTime: number;
  requestedAction: string;
  appSession: T13AppSessionClaim;
  appOwner: T13AppOwnerClaim;
  workspacePermission: T13WorkspacePermissionClaim;
  googlePrincipal: T13GooglePrincipalClaim;
  clientId: string;
  bindingCandidates: readonly T13OwnerPrincipalBindingClaim[];
  resourceProvenance: T13ResourceProvenanceClaim;
}>;

/**
 * Priority is deterministic: malformed claims deny; candidate ambiguity stops;
 * expired, revoked, missing, or inconsistent current claims deny; unknown
 * historical provenance holds; invalid provenance stops. The function never
 * reads the clock or any external state, and never mutates its argument.
 */
export function evaluateT13LocalEligibility(
  input: unknown,
): T13LocalEligibilityDecision {
  if (!isInput(input)) {
    return deny("claims-invalid");
  }

  if (!hasExactlyOne(input.appOwner.candidateOwnerIds)) {
    return input.appOwner.candidateOwnerIds.length === 0
      ? deny("owner-candidate-missing")
      : stop("owner-candidate-ambiguous");
  }

  if (!hasExactlyOne(input.googlePrincipal.candidatePrincipals)) {
    return input.googlePrincipal.candidatePrincipals.length === 0
      ? deny("principal-candidate-missing")
      : stop("principal-candidate-ambiguous");
  }

  if (!hasExactlyOne(input.bindingCandidates)) {
    return input.bindingCandidates.length === 0
      ? deny("binding-candidate-missing")
      : stop("binding-candidate-ambiguous");
  }

  if (!input.appSession.active) {
    return deny("app-session-inactive");
  }
  if (!isValidTimeRange(input.appSession.issuedAt, input.appSession.expiresAt)) {
    return deny("app-session-time-invalid");
  }
  if (input.appSession.issuedAt > input.evaluationTime) {
    return deny("app-session-time-invalid");
  }
  if (input.appSession.expiresAt <= input.evaluationTime) {
    return deny("app-session-expired");
  }

  const ownerId = input.appOwner.resolvedOwnerId;
  const principal = input.googlePrincipal.resolvedPrincipal;
  const binding = input.bindingCandidates[0];

  if (input.appOwner.authenticatedSubjectId !== input.appSession.authenticatedSubjectId) {
    return deny("app-subject-mismatch");
  }
  if (input.appOwner.candidateOwnerIds[0] !== ownerId) {
    return deny("app-owner-mismatch");
  }
  if (!samePrincipal(input.googlePrincipal.candidatePrincipals[0], principal)) {
    return deny("google-principal-mismatch");
  }

  if (input.workspacePermission.ownerId !== ownerId) {
    return deny("app-owner-mismatch");
  }
  if (input.workspacePermission.permission !== "allow") {
    return deny("workspace-permission-denied");
  }
  if (input.workspacePermission.action !== input.requestedAction) {
    return deny("workspace-permission-denied");
  }
  if (
    !isValidTimeRange(
      input.workspacePermission.issuedAt,
      input.workspacePermission.expiresAt,
    )
  ) {
    return deny("workspace-acl-time-invalid");
  }
  if (input.workspacePermission.issuedAt > input.evaluationTime) {
    return deny("workspace-acl-time-invalid");
  }
  if (input.workspacePermission.expiresAt <= input.evaluationTime) {
    return deny("workspace-acl-expired");
  }
  if (
    input.workspacePermission.aclVersion !==
    input.workspacePermission.expectedAclVersion
  ) {
    return deny("workspace-acl-version-mismatch");
  }

  if (!binding.active || binding.revoked) {
    return deny("binding-revoked");
  }
  if (!isValidTimeRange(binding.issuedAt, binding.expiresAt)) {
    return deny("binding-time-invalid");
  }
  if (binding.issuedAt > input.evaluationTime) {
    return deny("binding-time-invalid");
  }
  if (binding.expiresAt <= input.evaluationTime) {
    return deny("binding-expired");
  }
  if (binding.ownerId !== ownerId || !samePrincipal(binding.principal, principal)) {
    return deny("owner-principal-cross-binding-mismatch");
  }
  if (binding.workspaceId !== input.workspacePermission.workspaceId) {
    return deny("binding-workspace-mismatch");
  }
  if (binding.clientId !== input.clientId) {
    return deny("binding-client-mismatch");
  }

  const provenance = input.resourceProvenance;
  if (provenance.state === "invalid") {
    return stop("provenance-invalid");
  }
  if (provenance.state === "unknown" || provenance.state === "missing") {
    return hold("provenance-unknown");
  }
  if (
    provenance.historicalOriginalOwnerId === null ||
    provenance.historicalOriginalClientId === null
  ) {
    return hold("historical-owner-client-unknown");
  }
  if (provenance.principal === null || provenance.recordedAt === null) {
    return stop("provenance-invalid");
  }
  if (!isFiniteTime(provenance.recordedAt) || provenance.recordedAt > input.evaluationTime) {
    return stop("provenance-time-invalid");
  }
  if (provenance.historicalOriginalOwnerId !== ownerId) {
    return stop("provenance-owner-mismatch");
  }
  if (!samePrincipal(provenance.principal, principal)) {
    return stop("provenance-principal-mismatch");
  }
  if (provenance.workspaceId !== input.workspacePermission.workspaceId) {
    return stop("provenance-workspace-mismatch");
  }
  if (provenance.clientId !== input.clientId) {
    return stop("provenance-client-mismatch");
  }
  if (provenance.historicalOriginalClientId !== input.clientId) {
    return stop("provenance-client-mismatch");
  }

  return { outcome: "eligible_local", reason: "eligible-local-claims-consistent" };
}

function deny(reason: T13LocalEligibilityReason): T13LocalEligibilityDecision {
  return { outcome: "DENY", reason };
}

function stop(reason: T13LocalEligibilityReason): T13LocalEligibilityDecision {
  return { outcome: "STOP", reason };
}

function hold(reason: T13LocalEligibilityReason): T13LocalEligibilityDecision {
  return { outcome: "HOLD", reason };
}

function hasExactlyOne<T>(values: readonly T[]): values is readonly [T] {
  return values.length === 1;
}

function isInput(value: unknown): value is T13LocalEligibilityInput {
  if (!isRecord(value) || !isFiniteTime(value.evaluationTime)) {
    return false;
  }

  return (
    isAppSession(value.appSession) &&
    isNonEmptyString(value.requestedAction) &&
    isAppOwner(value.appOwner) &&
    isWorkspacePermission(value.workspacePermission) &&
    isGooglePrincipalClaim(value.googlePrincipal) &&
    isNonEmptyString(value.clientId) &&
    Array.isArray(value.bindingCandidates) &&
    value.bindingCandidates.every(isBinding) &&
    isProvenance(value.resourceProvenance)
  );
}

function isAppSession(value: unknown): value is T13AppSessionClaim {
  return (
    isRecord(value) &&
    isNonEmptyString(value.authenticatedSubjectId) &&
    typeof value.active === "boolean" &&
    isFiniteTime(value.issuedAt) &&
    isFiniteTime(value.expiresAt)
  );
}

function isAppOwner(value: unknown): value is T13AppOwnerClaim {
  return (
    isRecord(value) &&
    isNonEmptyString(value.authenticatedSubjectId) &&
    isNonEmptyString(value.resolvedOwnerId) &&
    Array.isArray(value.candidateOwnerIds) &&
    value.candidateOwnerIds.every(isNonEmptyString)
  );
}

function isWorkspacePermission(
  value: unknown,
): value is T13WorkspacePermissionClaim {
  return (
    isRecord(value) &&
    isNonEmptyString(value.workspaceId) &&
    isNonEmptyString(value.ownerId) &&
    isNonEmptyString(value.action) &&
    (value.permission === "allow" || value.permission === "deny") &&
    isNonEmptyString(value.aclVersion) &&
    isNonEmptyString(value.expectedAclVersion) &&
    isFiniteTime(value.issuedAt) &&
    isFiniteTime(value.expiresAt)
  );
}

function isGooglePrincipalClaim(
  value: unknown,
): value is T13GooglePrincipalClaim {
  return (
    isRecord(value) &&
    isPrincipal(value.resolvedPrincipal) &&
    Array.isArray(value.candidatePrincipals) &&
    value.candidatePrincipals.every(isPrincipal)
  );
}

function isBinding(value: unknown): value is T13OwnerPrincipalBindingClaim {
  return (
    isRecord(value) &&
    isNonEmptyString(value.bindingId) &&
    isNonEmptyString(value.ownerId) &&
    isNonEmptyString(value.workspaceId) &&
    isNonEmptyString(value.clientId) &&
    isPrincipal(value.principal) &&
    typeof value.active === "boolean" &&
    typeof value.revoked === "boolean" &&
    isFiniteTime(value.issuedAt) &&
    isFiniteTime(value.expiresAt)
  );
}

function isProvenance(value: unknown): value is T13ResourceProvenanceClaim {
  return (
    isRecord(value) &&
    (value.state === "verified" ||
      value.state === "unknown" ||
      value.state === "missing" ||
      value.state === "invalid") &&
    isNonEmptyString(value.workspaceId) &&
    isNonEmptyString(value.clientId) &&
    (value.historicalOriginalOwnerId === null ||
      isNonEmptyString(value.historicalOriginalOwnerId)) &&
    (value.historicalOriginalClientId === null ||
      isNonEmptyString(value.historicalOriginalClientId)) &&
    (value.principal === null || isPrincipal(value.principal)) &&
    (value.recordedAt === null || isFiniteTime(value.recordedAt))
  );
}

function isPrincipal(value: unknown): value is T13GooglePrincipal {
  return (
    isRecord(value) &&
    isNonEmptyString(value.issuer) &&
    isNonEmptyString(value.subject)
  );
}

function samePrincipal(left: T13GooglePrincipal, right: T13GooglePrincipal) {
  return left.issuer === right.issuer && left.subject === right.subject;
}

function isValidTimeRange(issuedAt: number, expiresAt: number) {
  return isFiniteTime(issuedAt) && isFiniteTime(expiresAt) && issuedAt <= expiresAt;
}

function isFiniteTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
