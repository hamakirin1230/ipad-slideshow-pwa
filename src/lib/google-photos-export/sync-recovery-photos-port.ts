import type { RecoveryScope } from "./sync-recovery-drive-port";

export type RecoveryPhotosScope = RecoveryScope & { albumIdentity: string };
export type RecoveryPhotosItem = {
  mediaItemId: string;
  ownership: "app_managed" | "unmanaged" | "unknown";
  createdProvenance: { recoveryId: string; slideId: string } | null;
};
export type RecoveryPhotosPage = {
  scope: RecoveryPhotosScope;
  observationRevision: number;
  requestPageToken: string | null;
  nextPageToken: string | null;
  orderEvidence: "album_order" | "unknown";
  items: RecoveryPhotosItem[];
};
export type RecoveryPhotosObservation = {
  scope: RecoveryPhotosScope;
  albumExists: true;
  pages: RecoveryPhotosPage[];
};
export type RecoveryPhotosSnapshot = {
  scope: RecoveryPhotosScope;
  items: RecoveryPhotosItem[];
  observationRevision: number;
  orderEvidence: "album_order" | "unknown";
  complete: true;
};
export type RecoveryPhotosReadResult =
  | { status: "verified"; snapshot: RecoveryPhotosSnapshot }
  | { status: "album_absent" | "permission_denied" | "unreadable" | "response_unknown" }
  | {
      status: "invalid_observation";
      reason: "INVALID_RESPONSE" | "INVALID_PAGING" | "DUPLICATE_MEDIA_ID";
      duplicateCount: number | null;
    };

/** Read-only by construction: this interface has no mutation methods. */
export interface RecoveryPhotosReadPort {
  readAlbum(): Promise<RecoveryPhotosReadResult>;
}

const issuedSnapshots = new WeakMap<object, string>();
export function isVerifiedRecoveryPhotosSnapshot(
  value: unknown,
): value is RecoveryPhotosSnapshot {
  if (typeof value !== "object" || value === null || !issuedSnapshots.has(value)) return false;
  try { return issuedSnapshots.get(value) === JSON.stringify(value); }
  catch { return false; }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
function nonblank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}
function token(value: unknown) { return value === null || nonblank(value); }
function scopeValid(value: unknown): value is RecoveryPhotosScope {
  return record(value) && exact(value, ["workspaceId", "projectId", "albumIdentity"]) &&
    nonblank(value.workspaceId) && nonblank(value.projectId) && nonblank(value.albumIdentity);
}
function sameScope(left: RecoveryPhotosScope, right: RecoveryPhotosScope) {
  return left.workspaceId === right.workspaceId && left.projectId === right.projectId &&
    left.albumIdentity === right.albumIdentity;
}
function itemValid(value: unknown): value is RecoveryPhotosItem {
  if (!record(value) || !exact(value, ["mediaItemId", "ownership", "createdProvenance"]) ||
      !nonblank(value.mediaItemId) || typeof value.ownership !== "string" ||
      !["app_managed", "unmanaged", "unknown"].includes(value.ownership)) return false;
  const provenance = value.createdProvenance;
  return provenance === null || (value.ownership === "app_managed" && record(provenance) &&
    exact(provenance, ["recoveryId", "slideId"]) && nonblank(provenance.recoveryId) &&
    nonblank(provenance.slideId));
}

/**
 * Validates mock observation structure, page chain, revision consistency and
 * uniqueness. This proves a complete mock read, never remote pixels or real API
 * ownership. Pages retain their order; no sorting or deduplication is performed.
 */
export function validateRecoveryPhotosObservation(
  input: unknown,
  expected: RecoveryPhotosScope,
): RecoveryPhotosReadResult {
  const invalid = (reason: "INVALID_RESPONSE" | "INVALID_PAGING" | "DUPLICATE_MEDIA_ID",
    duplicateCount: number | null = null): RecoveryPhotosReadResult =>
    ({ status: "invalid_observation", reason, duplicateCount });
  if (!record(input) || !exact(input, ["scope", "albumExists", "pages"]) ||
      !scopeValid(input.scope) || !sameScope(input.scope, expected) || input.albumExists !== true ||
      !Array.isArray(input.pages) || input.pages.length === 0) return invalid("INVALID_RESPONSE");
  const items: RecoveryPhotosItem[] = [];
  const seenTokens = new Set<string>();
  let expectedToken: string | null = null;
  let revision: number | null = null;
  let orderEvidence: "album_order" | "unknown" = "album_order";
  for (const [index, page] of input.pages.entries()) {
    if (!record(page) || !exact(page, ["scope", "observationRevision", "requestPageToken",
      "nextPageToken", "orderEvidence", "items"]) || !scopeValid(page.scope) ||
      !sameScope(page.scope, expected) || !Number.isSafeInteger(page.observationRevision) ||
      (page.observationRevision as number) < 1 || !token(page.requestPageToken) ||
      !token(page.nextPageToken) || typeof page.orderEvidence !== "string" ||
      !["album_order", "unknown"].includes(page.orderEvidence) ||
      !Array.isArray(page.items) || !page.items.every(itemValid)) return invalid("INVALID_RESPONSE");
    if (page.requestPageToken !== expectedToken ||
        (revision !== null && revision !== page.observationRevision) ||
        (page.nextPageToken === null && index !== input.pages.length - 1)) return invalid("INVALID_PAGING");
    if (page.nextPageToken !== null) {
      if (seenTokens.has(page.nextPageToken as string)) return invalid("INVALID_PAGING");
      seenTokens.add(page.nextPageToken as string);
    }
    revision = page.observationRevision as number;
    expectedToken = page.nextPageToken as string | null;
    if (page.orderEvidence === "unknown") orderEvidence = "unknown";
    items.push(...structuredClone(page.items as RecoveryPhotosItem[]));
  }
  if (expectedToken !== null) return invalid("INVALID_PAGING");
  const duplicateCount = items.length - new Set(items.map((item) => item.mediaItemId)).size;
  if (duplicateCount > 0) return invalid("DUPLICATE_MEDIA_ID", duplicateCount);
  const snapshot: RecoveryPhotosSnapshot = {
    scope: structuredClone(expected), items, observationRevision: revision!, orderEvidence, complete: true,
  };
  issuedSnapshots.set(snapshot, JSON.stringify(snapshot));
  return { status: "verified", snapshot };
}

/** Fixture-only fake: no Google client or authentication dependencies. */
export function createFakeRecoveryPhotosReadPort(options: {
  scope: RecoveryPhotosScope;
  observation?: unknown;
  fault?: "album_absent" | "permission_denied" | "unreadable" | "response_unknown";
}): RecoveryPhotosReadPort {
  const observation = structuredClone(options.observation);
  const scope = structuredClone(options.scope);
  const fault = options.fault;
  return { async readAlbum() {
    return fault ? { status: fault } : validateRecoveryPhotosObservation(observation, scope);
  } };
}

/** Lower execution boundary remains denied regardless of caller/UI state. */
export function rejectRecoveryPhotosWrite(): { status: "forbidden"; productionWriteAllowed: false } {
  return { status: "forbidden", productionWriteAllowed: false };
}
