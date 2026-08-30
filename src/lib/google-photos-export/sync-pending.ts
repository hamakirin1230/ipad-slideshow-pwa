import { GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH } from "./contract";
import {
  parseGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
  type GooglePhotosSyncManagedItem,
  type GooglePhotosSyncPendingPhase,
} from "./sync-binding";

export type GooglePhotosSyncPendingFailureReason =
  | "noPending"
  | "pendingExists"
  | "invalidBinding"
  | "invalidInput"
  | "invalidState"
  | "staleOperation"
  | "sourceChanged"
  | "invalidTargetItems"
  | "generationOverflow";

export type GooglePhotosSyncPendingTransitionResult =
  | { ok: true; binding: GooglePhotosSyncBinding }
  | { ok: false; reason: GooglePhotosSyncPendingFailureReason };

export type GooglePhotosSyncPendingContinuationResult =
  | { ok: true; phase: GooglePhotosSyncPendingPhase }
  | { ok: false; reason: GooglePhotosSyncPendingFailureReason };

type PendingGuard = {
  expectedOperationId: string;
  expectedSourceFingerprint: string;
};

const SHA256_IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_8601_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function beginGooglePhotosSyncPending(input: {
  binding: GooglePhotosSyncBinding;
  operationId: string;
  startedAt: string;
  sourceFingerprint: string;
  targetTitle: string;
}): GooglePhotosSyncPendingTransitionResult {
  const binding = cloneValidBinding(input.binding);
  if (!binding) return fail("invalidBinding");
  if (
    !isNonBlankTrimmedString(input.operationId) ||
    !isValidTimestamp(input.startedAt) ||
    !isSha256Identity(input.sourceFingerprint) ||
    !isValidTargetTitle(input.targetTitle)
  ) {
    return fail("invalidInput");
  }
  if (binding.pending !== null) return fail("pendingExists");
  if (binding.album === null && binding.stable !== null) {
    return fail("invalidState");
  }

  return validateResult({
    ...binding,
    pending: {
      operationId: input.operationId,
      startedAt: input.startedAt,
      phase: binding.album === null ? "creatingAlbum" : "albumBound",
      sourceFingerprint: input.sourceFingerprint,
      targetTitle: input.targetTitle,
      previousManagedMediaItemIds:
        binding.stable?.items.map((item) => item.mediaItemId) ?? [],
      targetItems: [],
    },
  });
}

/**
 * Captures the stable generation used for best-effort stale-write detection.
 * This value is not an atomic compare-and-swap or a multi-device lock.
 */
export function getGooglePhotosSyncExpectedStableGeneration(
  binding: GooglePhotosSyncBinding,
): number {
  return binding.stable?.generation ?? 0;
}

export function bindGooglePhotosSyncCreatedAlbum(input: {
  binding: GooglePhotosSyncBinding;
  expectedOperationId: string;
  expectedSourceFingerprint: string;
  albumId: string;
  createdAt: string;
  lastKnownTitle: string;
}): GooglePhotosSyncPendingTransitionResult {
  if (
    !isNonBlankTrimmedString(input.albumId) ||
    !isValidTimestamp(input.createdAt) ||
    !isValidTargetTitle(input.lastKnownTitle)
  ) {
    return fail("invalidInput");
  }
  const checked = checkContinuation(input.binding, input);
  if (!checked.ok) return checked;
  const { binding, pending } = checked;
  if (
    pending.phase !== "creatingAlbum" ||
    binding.album !== null ||
    binding.stable !== null ||
    input.lastKnownTitle !== pending.targetTitle
  ) {
    return fail("invalidState");
  }

  return validateResult({
    ...binding,
    album: {
      albumId: input.albumId,
      createdAt: input.createdAt,
      lastKnownTitle: input.lastKnownTitle,
    },
    pending: { ...pending, phase: "albumBound" },
  });
}

export function recordGooglePhotosSyncMediaPrepared(input: {
  binding: GooglePhotosSyncBinding;
  expectedOperationId: string;
  expectedSourceFingerprint: string;
  targetItems: GooglePhotosSyncManagedItem[];
}): GooglePhotosSyncPendingTransitionResult {
  const targetItems = cloneTargetItems(input.targetItems);
  if (!targetItems) return fail("invalidTargetItems");
  const checked = checkContinuation(input.binding, input);
  if (!checked.ok) return checked;
  const { binding, pending } = checked;
  if (pending.phase !== "albumBound" || binding.album === null) {
    return fail("invalidState");
  }

  return validateResult({
    ...binding,
    pending: { ...pending, phase: "mediaPrepared", targetItems },
  });
}

export function inspectGooglePhotosSyncPendingContinuation(input: {
  binding: GooglePhotosSyncBinding;
  expectedOperationId: string;
  expectedSourceFingerprint: string;
  expectedTargetTitle?: string;
}): GooglePhotosSyncPendingContinuationResult {
  if (
    input.expectedTargetTitle !== undefined &&
    !isValidTargetTitle(input.expectedTargetTitle)
  ) {
    return fail("invalidInput");
  }
  const checked = checkContinuation(input.binding, input);
  if (!checked.ok) return checked;
  if (
    input.expectedTargetTitle !== undefined &&
    checked.pending.targetTitle !== input.expectedTargetTitle
  ) {
    return fail("sourceChanged");
  }
  return { ok: true, phase: checked.pending.phase };
}

export function transitionGooglePhotosSyncToMembershipRemoving(
  input: { binding: GooglePhotosSyncBinding } & PendingGuard,
): GooglePhotosSyncPendingTransitionResult {
  return transitionPhase(input, "mediaPrepared", "membershipRemoving");
}

export function transitionGooglePhotosSyncToMembershipAdding(
  input: { binding: GooglePhotosSyncBinding } & PendingGuard,
): GooglePhotosSyncPendingTransitionResult {
  return transitionPhase(input, "membershipRemoving", "membershipAdding");
}

export function skipGooglePhotosSyncMembership(input: {
  binding: GooglePhotosSyncBinding;
  expectedOperationId: string;
  expectedSourceFingerprint: string;
  titleNeedsUpdate: boolean;
}): GooglePhotosSyncPendingTransitionResult {
  if (typeof input.titleNeedsUpdate !== "boolean") return fail("invalidInput");
  return transitionPhase(
    input,
    "mediaPrepared",
    input.titleNeedsUpdate ? "titleUpdating" : "finalizing",
  );
}

export function completeGooglePhotosSyncMembership(input: {
  binding: GooglePhotosSyncBinding;
  expectedOperationId: string;
  expectedSourceFingerprint: string;
  titleNeedsUpdate: boolean;
}): GooglePhotosSyncPendingTransitionResult {
  if (typeof input.titleNeedsUpdate !== "boolean") return fail("invalidInput");
  return transitionPhase(
    input,
    "membershipAdding",
    input.titleNeedsUpdate ? "titleUpdating" : "finalizing",
  );
}

export function completeGooglePhotosSyncTitleUpdate(
  input: { binding: GooglePhotosSyncBinding } & PendingGuard,
): GooglePhotosSyncPendingTransitionResult {
  return transitionPhase(input, "titleUpdating", "finalizing");
}

export function finalizeGooglePhotosSyncPending(input: {
  binding: GooglePhotosSyncBinding;
  expectedOperationId: string;
  expectedSourceFingerprint: string;
  completedAt: string;
  rendererVersion: number;
}): GooglePhotosSyncPendingTransitionResult {
  if (
    !isValidTimestamp(input.completedAt) ||
    !isPositiveSafeInteger(input.rendererVersion)
  ) {
    return fail("invalidInput");
  }
  const checked = checkContinuation(input.binding, input);
  if (!checked.ok) return checked;
  const { binding, pending } = checked;
  if (
    pending.phase !== "finalizing" ||
    binding.album === null ||
    pending.targetItems.length === 0
  ) {
    return fail("invalidState");
  }
  const previousGeneration = getGooglePhotosSyncExpectedStableGeneration(binding);
  if (previousGeneration >= Number.MAX_SAFE_INTEGER) {
    return fail("generationOverflow");
  }

  return validateResult({
    ...binding,
    album: { ...binding.album, lastKnownTitle: pending.targetTitle },
    stable: {
      generation: previousGeneration + 1,
      completedAt: input.completedAt,
      rendererVersion: input.rendererVersion,
      items: pending.targetItems.map((item) => ({ ...item })),
    },
    pending: null,
  });
}

function transitionPhase(
  input: { binding: GooglePhotosSyncBinding } & PendingGuard,
  expectedPhase: GooglePhotosSyncPendingPhase,
  nextPhase: GooglePhotosSyncPendingPhase,
): GooglePhotosSyncPendingTransitionResult {
  const checked = checkContinuation(input.binding, input);
  if (!checked.ok) return checked;
  if (checked.pending.phase !== expectedPhase) return fail("invalidState");
  return validateResult({
    ...checked.binding,
    pending: { ...checked.pending, phase: nextPhase },
  });
}

function checkContinuation(
  inputBinding: GooglePhotosSyncBinding,
  guard: PendingGuard,
):
  | {
      ok: true;
      binding: GooglePhotosSyncBinding;
      pending: NonNullable<GooglePhotosSyncBinding["pending"]>;
    }
  | { ok: false; reason: GooglePhotosSyncPendingFailureReason } {
  if (
    !isNonBlankTrimmedString(guard.expectedOperationId) ||
    !isSha256Identity(guard.expectedSourceFingerprint)
  ) {
    return fail("invalidInput");
  }
  const binding = cloneValidBinding(inputBinding);
  if (!binding) return fail("invalidBinding");
  const pending = binding.pending;
  if (pending === null) return fail("noPending");
  if (pending.operationId !== guard.expectedOperationId) {
    return fail("staleOperation");
  }
  if (pending.sourceFingerprint !== guard.expectedSourceFingerprint) {
    return fail("sourceChanged");
  }
  if (!hasValidPendingLogicalState(binding)) return fail("invalidState");
  return { ok: true, binding, pending };
}

function hasValidPendingLogicalState(binding: GooglePhotosSyncBinding): boolean {
  const pending = binding.pending;
  if (
    pending === null ||
    !isNonBlankTrimmedString(pending.operationId) ||
    !isSha256Identity(pending.sourceFingerprint) ||
    !isValidTargetTitle(pending.targetTitle)
  ) {
    return false;
  }
  const stableIds = binding.stable?.items.map((item) => item.mediaItemId) ?? [];
  if (!arraysEqual(pending.previousManagedMediaItemIds, stableIds)) return false;

  switch (pending.phase) {
    case "creatingAlbum":
      return (
        binding.album === null &&
        binding.stable === null &&
        pending.targetItems.length === 0
      );
    case "albumBound":
      return binding.album !== null && pending.targetItems.length === 0;
    case "mediaPrepared":
    case "membershipRemoving":
    case "membershipAdding":
    case "titleUpdating":
    case "finalizing":
      return binding.album !== null && pending.targetItems.length > 0;
  }
}

function cloneValidBinding(
  input: GooglePhotosSyncBinding,
): GooglePhotosSyncBinding | null {
  if (!isObject(input)) return null;
  const workspaceId = input.workspaceId;
  const projectId = input.projectId;
  if (typeof workspaceId !== "string" || typeof projectId !== "string") {
    return null;
  }
  const parsed = parseGooglePhotosSyncBinding(input, { workspaceId, projectId });
  return parsed.ok ? parsed.value : null;
}

function validateResult(
  binding: GooglePhotosSyncBinding,
): GooglePhotosSyncPendingTransitionResult {
  const parsed = parseGooglePhotosSyncBinding(binding, {
    workspaceId: binding.workspaceId,
    projectId: binding.projectId,
  });
  if (!parsed.ok || (parsed.value.pending && !hasValidPendingLogicalState(parsed.value))) {
    return fail("invalidState");
  }
  return { ok: true, binding: parsed.value };
}

function cloneTargetItems(
  input: GooglePhotosSyncManagedItem[],
): GooglePhotosSyncManagedItem[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const slideIds = new Set<string>();
  const mediaItemIds = new Set<string>();
  const result: GooglePhotosSyncManagedItem[] = [];
  for (const item of input) {
    if (
      !isObject(item) ||
      !hasExactKeys(item, ["slideId", "renderKey", "mediaItemId"]) ||
      !isNonBlankTrimmedString(item.slideId) ||
      !isSha256Identity(item.renderKey) ||
      !isNonBlankTrimmedString(item.mediaItemId) ||
      slideIds.has(item.slideId) ||
      mediaItemIds.has(item.mediaItemId)
    ) {
      return null;
    }
    slideIds.add(item.slideId);
    mediaItemIds.add(item.mediaItemId);
    result.push({
      slideId: item.slideId,
      renderKey: item.renderKey,
      mediaItemId: item.mediaItemId,
    });
  }
  return result;
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isValidTargetTitle(value: unknown): value is string {
  return (
    isNonBlankTrimmedString(value) &&
    [...value].length <= GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH
  );
}

function isSha256Identity(value: unknown): value is string {
  return typeof value === "string" && SHA256_IDENTITY_PATTERN.test(value);
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_8601_UTC_PATTERN.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return new Date(timestamp).toISOString() === normalized;
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(
  reason: GooglePhotosSyncPendingFailureReason,
): { ok: false; reason: GooglePhotosSyncPendingFailureReason } {
  return { ok: false, reason };
}
