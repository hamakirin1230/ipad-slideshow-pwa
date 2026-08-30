import { DRIVE_PREFLIGHT_APP_ID } from "../drive-preflight-diagnostics";

export const GOOGLE_PHOTOS_SYNC_BINDING_FILE_NAME = "google-photos-sync.json";
export const GOOGLE_PHOTOS_SYNC_BINDING_ROLE = "googlePhotosSync";
export const GOOGLE_PHOTOS_SYNC_BINDING_SCHEMA_VERSION = 1;
export const GOOGLE_PHOTOS_SYNC_BINDING_SCHEMA_VERSION_PROPERTY = "1";

export const GOOGLE_PHOTOS_SYNC_PENDING_PHASES = [
  "creatingAlbum",
  "albumBound",
  "mediaPrepared",
  "membershipRemoving",
  "membershipAdding",
  "titleUpdating",
  "finalizing",
] as const;

export type GooglePhotosSyncPendingPhase =
  (typeof GOOGLE_PHOTOS_SYNC_PENDING_PHASES)[number];

export type GooglePhotosSyncManagedItem = {
  slideId: string;
  renderKey: string;
  mediaItemId: string;
};

export type GooglePhotosSyncBinding = {
  app: typeof DRIVE_PREFLIGHT_APP_ID;
  role: typeof GOOGLE_PHOTOS_SYNC_BINDING_ROLE;
  schemaVersion: typeof GOOGLE_PHOTOS_SYNC_BINDING_SCHEMA_VERSION;
  workspaceId: string;
  projectId: string;
  album: {
    albumId: string;
    createdAt: string;
    lastKnownTitle: string;
  } | null;
  stable: {
    generation: number;
    completedAt: string;
    rendererVersion: number;
    items: GooglePhotosSyncManagedItem[];
  } | null;
  pending: {
    operationId: string;
    startedAt: string;
    phase: GooglePhotosSyncPendingPhase;
    sourceFingerprint: string;
    targetTitle: string;
    previousManagedMediaItemIds: string[];
    targetItems: GooglePhotosSyncManagedItem[];
  } | null;
};

export type GooglePhotosSyncBindingValidationFailureReason =
  | "malformed"
  | "unknownProperty"
  | "appMismatch"
  | "roleMismatch"
  | "schemaVersionMismatch"
  | "workspaceMismatch"
  | "projectMismatch"
  | "invalidTimestamp"
  | "invalidGeneration"
  | "invalidRendererVersion"
  | "duplicateSlideId"
  | "duplicateMediaItemId"
  | "unsupportedPendingPhase";

export type GooglePhotosSyncBindingParseResult =
  | { ok: true; value: GooglePhotosSyncBinding }
  | { ok: false; reason: GooglePhotosSyncBindingValidationFailureReason };

const TOP_LEVEL_KEYS = [
  "app",
  "role",
  "schemaVersion",
  "workspaceId",
  "projectId",
  "album",
  "stable",
  "pending",
] as const;
const ALBUM_KEYS = ["albumId", "createdAt", "lastKnownTitle"] as const;
const STABLE_KEYS = [
  "generation",
  "completedAt",
  "rendererVersion",
  "items",
] as const;
const PENDING_KEYS = [
  "operationId",
  "startedAt",
  "phase",
  "sourceFingerprint",
  "targetTitle",
  "previousManagedMediaItemIds",
  "targetItems",
] as const;
const MANAGED_ITEM_KEYS = ["slideId", "renderKey", "mediaItemId"] as const;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function parseGooglePhotosSyncBinding(
  input: unknown,
  expected: { workspaceId: string; projectId: string },
): GooglePhotosSyncBindingParseResult {
  if (!isJsonObject(input)) return fail("malformed");
  if (!hasExactKeys(input, TOP_LEVEL_KEYS)) return fail("unknownProperty");
  if (input.app !== DRIVE_PREFLIGHT_APP_ID) return fail("appMismatch");
  if (input.role !== GOOGLE_PHOTOS_SYNC_BINDING_ROLE) return fail("roleMismatch");
  if (input.schemaVersion !== GOOGLE_PHOTOS_SYNC_BINDING_SCHEMA_VERSION) {
    return fail("schemaVersionMismatch");
  }
  if (!isUuidV4(input.workspaceId) || input.workspaceId !== expected.workspaceId) {
    return fail("workspaceMismatch");
  }
  if (!isUuidV4(input.projectId) || input.projectId !== expected.projectId) {
    return fail("projectMismatch");
  }

  const album = parseAlbum(input.album);
  if (!album.ok) return album;
  const stable = parseStable(input.stable);
  if (!stable.ok) return stable;
  const pending = parsePending(input.pending);
  if (!pending.ok) return pending;

  return {
    ok: true,
    value: {
      app: DRIVE_PREFLIGHT_APP_ID,
      role: GOOGLE_PHOTOS_SYNC_BINDING_ROLE,
      schemaVersion: GOOGLE_PHOTOS_SYNC_BINDING_SCHEMA_VERSION,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      album: album.value,
      stable: stable.value,
      pending: pending.value,
    },
  };
}

export function parseGooglePhotosSyncBindingJson(
  text: string,
  expected: { workspaceId: string; projectId: string },
): GooglePhotosSyncBindingParseResult {
  try {
    return parseGooglePhotosSyncBinding(JSON.parse(text) as unknown, expected);
  } catch {
    return fail("malformed");
  }
}

export function stringifyGooglePhotosSyncBinding(
  binding: GooglePhotosSyncBinding,
) {
  const parsed = parseGooglePhotosSyncBinding(binding, {
    workspaceId: binding.workspaceId,
    projectId: binding.projectId,
  });
  if (!parsed.ok) {
    throw new TypeError("Invalid Google Photos sync binding.");
  }
  return `${JSON.stringify(parsed.value, null, 2)}\n`;
}

export function buildEmptyGooglePhotosSyncBinding(input: {
  workspaceId: string;
  projectId: string;
}): GooglePhotosSyncBinding {
  const candidate: GooglePhotosSyncBinding = {
    app: DRIVE_PREFLIGHT_APP_ID,
    role: GOOGLE_PHOTOS_SYNC_BINDING_ROLE,
    schemaVersion: GOOGLE_PHOTOS_SYNC_BINDING_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    album: null,
    stable: null,
    pending: null,
  };
  const parsed = parseGooglePhotosSyncBinding(candidate, input);
  if (!parsed.ok) throw new TypeError("Invalid Google Photos sync ownership.");
  return parsed.value;
}

function parseAlbum(
  input: unknown,
):
  | { ok: true; value: GooglePhotosSyncBinding["album"] }
  | { ok: false; reason: GooglePhotosSyncBindingValidationFailureReason } {
  if (input === null) return { ok: true, value: null };
  if (!isJsonObject(input)) return fail("malformed");
  if (!hasExactKeys(input, ALBUM_KEYS)) return fail("unknownProperty");
  if (!isNonBlankString(input.albumId)) return fail("malformed");
  if (!isValidTimestamp(input.createdAt)) return fail("invalidTimestamp");
  if (!isNonBlankString(input.lastKnownTitle)) return fail("malformed");
  return {
    ok: true,
    value: {
      albumId: input.albumId,
      createdAt: input.createdAt,
      lastKnownTitle: input.lastKnownTitle,
    },
  };
}

function parseStable(
  input: unknown,
):
  | { ok: true; value: GooglePhotosSyncBinding["stable"] }
  | { ok: false; reason: GooglePhotosSyncBindingValidationFailureReason } {
  if (input === null) return { ok: true, value: null };
  if (!isJsonObject(input)) return fail("malformed");
  if (!hasExactKeys(input, STABLE_KEYS)) return fail("unknownProperty");
  if (!isPositiveInteger(input.generation)) return fail("invalidGeneration");
  if (!isValidTimestamp(input.completedAt)) return fail("invalidTimestamp");
  if (!isPositiveInteger(input.rendererVersion)) {
    return fail("invalidRendererVersion");
  }
  const items = parseManagedItems(input.items);
  if (!items.ok) return items;
  return {
    ok: true,
    value: {
      generation: input.generation,
      completedAt: input.completedAt,
      rendererVersion: input.rendererVersion,
      items: items.value,
    },
  };
}

function parsePending(
  input: unknown,
):
  | { ok: true; value: GooglePhotosSyncBinding["pending"] }
  | { ok: false; reason: GooglePhotosSyncBindingValidationFailureReason } {
  if (input === null) return { ok: true, value: null };
  if (!isJsonObject(input)) return fail("malformed");
  if (!hasExactKeys(input, PENDING_KEYS)) return fail("unknownProperty");
  if (
    !isNonBlankString(input.operationId) ||
    !isNonBlankString(input.sourceFingerprint) ||
    !isNonBlankString(input.targetTitle)
  ) {
    return fail("malformed");
  }
  if (!isValidTimestamp(input.startedAt)) return fail("invalidTimestamp");
  if (!isPendingPhase(input.phase)) return fail("unsupportedPendingPhase");
  const previousIds = parseUniqueNonBlankStrings(
    input.previousManagedMediaItemIds,
  );
  if (!previousIds.ok) return previousIds;
  const targetItems = parseManagedItems(input.targetItems);
  if (!targetItems.ok) return targetItems;
  return {
    ok: true,
    value: {
      operationId: input.operationId,
      startedAt: input.startedAt,
      phase: input.phase,
      sourceFingerprint: input.sourceFingerprint,
      targetTitle: input.targetTitle,
      previousManagedMediaItemIds: previousIds.value,
      targetItems: targetItems.value,
    },
  };
}

function parseManagedItems(
  input: unknown,
):
  | { ok: true; value: GooglePhotosSyncManagedItem[] }
  | { ok: false; reason: GooglePhotosSyncBindingValidationFailureReason } {
  if (!Array.isArray(input)) return fail("malformed");
  const items: GooglePhotosSyncManagedItem[] = [];
  const slideIds = new Set<string>();
  const mediaItemIds = new Set<string>();
  for (const value of input) {
    if (!isJsonObject(value)) return fail("malformed");
    if (!hasExactKeys(value, MANAGED_ITEM_KEYS)) return fail("unknownProperty");
    if (
      !isNonBlankString(value.slideId) ||
      !isNonBlankString(value.renderKey) ||
      !isNonBlankString(value.mediaItemId)
    ) {
      return fail("malformed");
    }
    if (slideIds.has(value.slideId)) return fail("duplicateSlideId");
    if (mediaItemIds.has(value.mediaItemId)) {
      return fail("duplicateMediaItemId");
    }
    slideIds.add(value.slideId);
    mediaItemIds.add(value.mediaItemId);
    items.push({
      slideId: value.slideId,
      renderKey: value.renderKey,
      mediaItemId: value.mediaItemId,
    });
  }
  return { ok: true, value: items };
}

function parseUniqueNonBlankStrings(
  input: unknown,
):
  | { ok: true; value: string[] }
  | { ok: false; reason: GooglePhotosSyncBindingValidationFailureReason } {
  if (!Array.isArray(input)) return fail("malformed");
  const values: string[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (!isNonBlankString(value)) return fail("malformed");
    if (seen.has(value)) return fail("duplicateMediaItemId");
    seen.add(value);
    values.push(value);
  }
  return { ok: true, value: values };
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isPendingPhase(value: unknown): value is GooglePhotosSyncPendingPhase {
  return (
    typeof value === "string" &&
    (GOOGLE_PHOTOS_SYNC_PENDING_PHASES as readonly string[]).includes(value)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_8601_UTC_PATTERN.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  const normalizedInput = value.includes(".") ? value : value.replace("Z", ".000Z");
  return new Date(timestamp).toISOString() === normalizedInput;
}

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(
  reason: GooglePhotosSyncBindingValidationFailureReason,
): { ok: false; reason: GooglePhotosSyncBindingValidationFailureReason } {
  return { ok: false, reason };
}
