import {
  parseProjectManifest,
  type ProjectManifest,
} from "../google-drive";

export const PROJECT_PUBLISH_REVISION_SCHEMA_VERSION = 1 as const;

const REVISION_ID_PATTERN = /^rev_\d{8}T\d{9}Z_[0-9a-f]{8}$/;
const RANDOM_SUFFIX_PATTERN = /^[0-9a-f]{8}$/;
const CANONICAL_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export type ProjectPublishOperation = "publish" | "rollback";

export type ProjectPublishAssetReference = {
  assetId: string;
  driveFileId: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  checksum: string | null;
  remoteOnly: boolean;
};

export type ProjectPublishRevisionSummary = {
  slideCount: number;
  assetCount: number;
  remoteOnlyAssetCount: number;
};

export type ProjectPublishRevision = {
  schemaVersion: typeof PROJECT_PUBLISH_REVISION_SCHEMA_VERSION;
  revisionId: string;
  projectId: string;
  publishedAt: string;
  operation: ProjectPublishOperation;
  restoredFromRevisionId?: string;
  sourceManifestModifiedTime: string | null;
  sourceManifestCanonicalHash: string;
  previousRevisionId: string | null;
  summary: ProjectPublishRevisionSummary;
  assets: ProjectPublishAssetReference[];
  manifest: ProjectManifest;
};

export type ProjectPublishRevisionValidationError = {
  path: string;
  message: string;
};

export type ProjectPublishRevisionParseResult =
  | { ok: true; value: ProjectPublishRevision }
  | { ok: false; errors: ProjectPublishRevisionValidationError[] };

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "revisionId",
  "projectId",
  "publishedAt",
  "operation",
  "restoredFromRevisionId",
  "sourceManifestModifiedTime",
  "sourceManifestCanonicalHash",
  "previousRevisionId",
  "summary",
  "assets",
  "manifest",
]);
const SUMMARY_KEYS = new Set([
  "slideCount",
  "assetCount",
  "remoteOnlyAssetCount",
]);
const ASSET_KEYS = new Set([
  "assetId",
  "driveFileId",
  "mimeType",
  "sizeBytes",
  "modifiedTime",
  "checksum",
  "remoteOnly",
]);

export function deriveProjectPublishRevisionSummary(
  manifest: ProjectManifest,
  assets: readonly ProjectPublishAssetReference[],
): ProjectPublishRevisionSummary {
  return {
    slideCount: manifest.slides.length,
    assetCount: assets.length,
    remoteOnlyAssetCount: assets.filter((asset) => asset.remoteOnly).length,
  };
}

export function createProjectPublishRevisionId(input: {
  publishedAt: string;
  randomSuffix: string;
}): string {
  if (!isValidIsoDateTime(input.publishedAt)) {
    throw new TypeError("publishedAt must be a valid ISO 8601 datetime");
  }

  if (!RANDOM_SUFFIX_PATTERN.test(input.randomSuffix)) {
    throw new TypeError("randomSuffix must contain exactly 8 lowercase hex characters");
  }

  const compactTimestamp = new Date(input.publishedAt)
    .toISOString()
    .replace(/[-:.]/g, "")
    .replace("Z", "Z");

  return `rev_${compactTimestamp}_${input.randomSuffix}`;
}

export function isValidProjectPublishRevisionId(
  value: unknown,
): value is string {
  if (typeof value !== "string" || !REVISION_ID_PATTERN.test(value)) {
    return false;
  }

  const timestamp = value.slice(4, 22);
  const isoTimestamp = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}.${timestamp.slice(15, 18)}Z`;
  return isValidIsoDateTime(isoTimestamp);
}

export function stringifyCanonicalJson(value: CanonicalJsonValue): string {
  const seen = new Set<object>();

  function serialize(current: unknown): string {
    if (current === null || typeof current === "boolean") {
      return JSON.stringify(current);
    }

    if (typeof current === "string") {
      return JSON.stringify(current);
    }

    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new TypeError("canonical JSON numbers must be finite");
      }
      return JSON.stringify(current);
    }

    if (typeof current !== "object") {
      throw new TypeError("canonical JSON accepts plain JSON values only");
    }

    if (seen.has(current)) {
      throw new TypeError("canonical JSON does not accept cyclic values");
    }
    seen.add(current);

    try {
      if (Array.isArray(current)) {
        return `[${current.map((item) => serialize(item)).join(",")}]`;
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("canonical JSON accepts plain objects only");
      }

      const record = current as Record<string, unknown>;
      const entries = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`);
      return `{${entries.join(",")}}`;
    } finally {
      seen.delete(current);
    }
  }

  return serialize(value);
}

/**
 * Deterministic non-cryptographic hash for change detection only.
 * Do not use this hash for signatures, authentication, or tamper protection.
 */
export function hashCanonicalJson(value: CanonicalJsonValue): string {
  const bytes = new TextEncoder().encode(stringifyCanonicalJson(value));
  const offsetBasis = BigInt("14695981039346656037");
  const prime = BigInt("1099511628211");
  const mask = BigInt("18446744073709551615");
  let hash = offsetBasis;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }

  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

export function getProjectManifestCanonicalHash(
  manifest: ProjectManifest,
): string {
  return hashCanonicalJson(manifest as unknown as CanonicalJsonValue);
}

export function stringifyProjectPublishRevisionCanonical(
  revision: ProjectPublishRevision,
): string {
  return stringifyCanonicalJson(revision as unknown as CanonicalJsonValue);
}

export function getProjectPublishRevisionCanonicalHash(
  revision: ProjectPublishRevision,
): string {
  return hashCanonicalJson(revision as unknown as CanonicalJsonValue);
}

export function parseProjectPublishRevision(
  input: unknown,
): ProjectPublishRevisionParseResult {
  const errors: ProjectPublishRevisionValidationError[] = [];

  if (!isPlainRecord(input)) {
    return failure("$", "revision must be a JSON object");
  }

  rejectUnknownKeys(input, TOP_LEVEL_KEYS, "$", errors);

  const schemaVersion = input.schemaVersion;
  if (schemaVersion !== PROJECT_PUBLISH_REVISION_SCHEMA_VERSION) {
    addError(errors, "schemaVersion", "schemaVersion must be 1");
  }

  const revisionId = readNonEmptyString(input, "revisionId", errors);
  if (revisionId && !isValidProjectPublishRevisionId(revisionId)) {
    addError(errors, "revisionId", "revisionId has an invalid format");
  }

  const projectId = readNonEmptyString(input, "projectId", errors);
  const publishedAt = readIsoDateTime(input, "publishedAt", errors);
  const operation = readOperation(input.operation, errors);
  const restoredFromRevisionId = readOptionalRevisionId(
    input,
    "restoredFromRevisionId",
    errors,
  );
  const previousRevisionId = readNullableRevisionId(
    input,
    "previousRevisionId",
    errors,
  );
  const sourceManifestModifiedTime = readNullableIsoDateTime(
    input,
    "sourceManifestModifiedTime",
    errors,
  );
  const sourceManifestCanonicalHash = readNonEmptyString(
    input,
    "sourceManifestCanonicalHash",
    errors,
  );
  if (
    sourceManifestCanonicalHash &&
    !CANONICAL_HASH_PATTERN.test(sourceManifestCanonicalHash)
  ) {
    addError(
      errors,
      "sourceManifestCanonicalHash",
      "sourceManifestCanonicalHash has an invalid format",
    );
  }

  if (operation === "publish" && hasOwn(input, "restoredFromRevisionId")) {
    addError(
      errors,
      "restoredFromRevisionId",
      "restoredFromRevisionId must be omitted for publish",
    );
  }
  if (operation === "rollback" && !restoredFromRevisionId) {
    addError(
      errors,
      "restoredFromRevisionId",
      "restoredFromRevisionId is required for rollback",
    );
  }
  if (revisionId && restoredFromRevisionId === revisionId) {
    addError(
      errors,
      "restoredFromRevisionId",
      "restoredFromRevisionId must not equal revisionId",
    );
  }
  if (revisionId && previousRevisionId === revisionId) {
    addError(
      errors,
      "previousRevisionId",
      "previousRevisionId must not equal revisionId",
    );
  }

  const summary = parseSummary(input.summary, errors);
  const assets = parseAssets(input.assets, errors);
  const manifestResult = parseProjectManifest(input.manifest);
  const manifest = manifestResult.ok ? manifestResult.value : null;

  if (!manifestResult.ok) {
    for (const message of manifestResult.errors) {
      addError(errors, "manifest", message);
    }
  }

  if (manifest && projectId && manifest.projectId !== projectId) {
    addError(errors, "manifest.projectId", "manifest.projectId must match projectId");
  }

  if (
    manifest &&
    sourceManifestCanonicalHash &&
    sourceManifestCanonicalHash !== getProjectManifestCanonicalHash(manifest)
  ) {
    addError(
      errors,
      "sourceManifestCanonicalHash",
      "sourceManifestCanonicalHash must match manifest",
    );
  }

  if (manifest && assets) {
    validateAssetCoverage(manifest, assets, errors);
  }

  if (manifest && assets && summary) {
    const derived = deriveProjectPublishRevisionSummary(manifest, assets);
    for (const key of SUMMARY_KEYS) {
      const summaryKey = key as keyof ProjectPublishRevisionSummary;
      if (summary[summaryKey] !== derived[summaryKey]) {
        addError(errors, `summary.${key}`, `summary.${key} does not match derived value`);
      }
    }
  }

  if (
    errors.length > 0 ||
    schemaVersion !== PROJECT_PUBLISH_REVISION_SCHEMA_VERSION ||
    !revisionId ||
    !projectId ||
    !publishedAt ||
    !operation ||
    sourceManifestModifiedTime === undefined ||
    !sourceManifestCanonicalHash ||
    previousRevisionId === undefined ||
    !summary ||
    !assets ||
    !manifest
  ) {
    return { ok: false, errors };
  }

  const value: ProjectPublishRevision = {
    schemaVersion,
    revisionId,
    projectId,
    publishedAt,
    operation,
    ...(restoredFromRevisionId ? { restoredFromRevisionId } : {}),
    sourceManifestModifiedTime,
    sourceManifestCanonicalHash,
    previousRevisionId,
    summary: { ...summary },
    assets: assets.map((asset) => ({ ...asset })),
    manifest: structuredClone(manifest),
  };

  return { ok: true, value };
}

function parseSummary(
  value: unknown,
  errors: ProjectPublishRevisionValidationError[],
): ProjectPublishRevisionSummary | null {
  if (!isPlainRecord(value)) {
    addError(errors, "summary", "summary must be a JSON object");
    return null;
  }
  rejectUnknownKeys(value, SUMMARY_KEYS, "summary", errors);
  const slideCount = readNonNegativeSafeInteger(value, "slideCount", "summary", errors);
  const assetCount = readNonNegativeSafeInteger(value, "assetCount", "summary", errors);
  const remoteOnlyAssetCount = readNonNegativeSafeInteger(
    value,
    "remoteOnlyAssetCount",
    "summary",
    errors,
  );
  return slideCount === null || assetCount === null || remoteOnlyAssetCount === null
    ? null
    : { slideCount, assetCount, remoteOnlyAssetCount };
}

function parseAssets(
  value: unknown,
  errors: ProjectPublishRevisionValidationError[],
): ProjectPublishAssetReference[] | null {
  if (!Array.isArray(value)) {
    addError(errors, "assets", "assets must be an array");
    return null;
  }

  const assets: ProjectPublishAssetReference[] = [];
  const assetIds = new Set<string>();
  const driveFileIds = new Set<string>();

  value.forEach((item, index) => {
    const path = `assets[${index}]`;
    if (!isPlainRecord(item)) {
      addError(errors, path, `${path} must be a JSON object`);
      return;
    }
    rejectUnknownKeys(item, ASSET_KEYS, path, errors);
    const assetId = readNonEmptyString(item, "assetId", errors, path);
    const driveFileId = readNonEmptyString(item, "driveFileId", errors, path);
    const mimeType = readNonEmptyString(item, "mimeType", errors, path);
    const sizeBytes = readNullableNonNegativeSafeInteger(item, "sizeBytes", path, errors);
    const modifiedTime = readNullableIsoDateTime(item, "modifiedTime", errors, path);
    const checksum = readNullableNonEmptyString(item, "checksum", errors, path);
    const remoteOnly = item.remoteOnly;
    if (typeof remoteOnly !== "boolean") {
      addError(errors, `${path}.remoteOnly`, `${path}.remoteOnly must be a boolean`);
    }

    if (assetId) {
      if (assetIds.has(assetId)) {
        addError(errors, `${path}.assetId`, `${path}.assetId must be unique`);
      }
      assetIds.add(assetId);
    }
    if (driveFileId) {
      if (driveFileIds.has(driveFileId)) {
        addError(errors, `${path}.driveFileId`, `${path}.driveFileId must be unique`);
      }
      driveFileIds.add(driveFileId);
    }

    if (
      assetId &&
      driveFileId &&
      mimeType &&
      sizeBytes !== undefined &&
      modifiedTime !== undefined &&
      checksum !== undefined &&
      typeof remoteOnly === "boolean"
    ) {
      assets.push({
        assetId,
        driveFileId,
        mimeType,
        sizeBytes,
        modifiedTime,
        checksum,
        remoteOnly,
      });
    }
  });

  return assets;
}

function validateAssetCoverage(
  manifest: ProjectManifest,
  assets: readonly ProjectPublishAssetReference[],
  errors: ProjectPublishRevisionValidationError[],
) {
  const referencedAssetIds = new Set(
    manifest.slides.map((slide) => slide.assetId),
  );
  const listed = new Map(assets.map((asset) => [asset.assetId, asset.driveFileId]));

  for (const slide of manifest.slides) {
    if (!listed.has(slide.assetId)) {
      addError(errors, "assets", "assets must include every manifest asset reference");
    } else if (listed.get(slide.assetId) !== slide.assetFileId) {
      addError(errors, "assets", "asset driveFileId must match the manifest reference");
    }
  }
  for (const assetId of listed.keys()) {
    if (!referencedAssetIds.has(assetId)) {
      addError(errors, "assets", "assets must not include unreferenced assets");
    }
  }
}

function readOperation(
  value: unknown,
  errors: ProjectPublishRevisionValidationError[],
): ProjectPublishOperation | null {
  if (value === "publish" || value === "rollback") return value;
  addError(errors, "operation", "operation must be publish or rollback");
  return null;
}

function readNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  errors: ProjectPublishRevisionValidationError[],
  parent = "",
): string | null {
  const path = parent ? `${parent}.${key}` : key;
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    addError(errors, path, `${path} must be a non-empty string`);
    return null;
  }
  return value;
}

function readIsoDateTime(
  record: Record<string, unknown>,
  key: string,
  errors: ProjectPublishRevisionValidationError[],
  parent = "",
): string | null {
  const value = readNonEmptyString(record, key, errors, parent);
  const path = parent ? `${parent}.${key}` : key;
  if (value && !isValidIsoDateTime(value)) {
    addError(errors, path, `${path} must be a valid ISO 8601 datetime`);
    return null;
  }
  return value;
}

function readNullableIsoDateTime(
  record: Record<string, unknown>,
  key: string,
  errors: ProjectPublishRevisionValidationError[],
  parent = "",
): string | null | undefined {
  const path = parent ? `${parent}.${key}` : key;
  if (!hasOwn(record, key)) {
    addError(errors, path, `${path} is required`);
    return undefined;
  }
  if (record[key] === null) return null;
  return readIsoDateTime(record, key, errors, parent) ?? undefined;
}

function readNullableNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  errors: ProjectPublishRevisionValidationError[],
  parent = "",
): string | null | undefined {
  const path = parent ? `${parent}.${key}` : key;
  if (!hasOwn(record, key)) {
    addError(errors, path, `${path} is required`);
    return undefined;
  }
  if (record[key] === null) return null;
  return readNonEmptyString(record, key, errors, parent) ?? undefined;
}

function readOptionalRevisionId(
  record: Record<string, unknown>,
  key: string,
  errors: ProjectPublishRevisionValidationError[],
): string | undefined {
  if (!hasOwn(record, key)) return undefined;
  const value = readNonEmptyString(record, key, errors) ?? undefined;
  if (value && !isValidProjectPublishRevisionId(value)) {
    addError(errors, key, `${key} has an invalid format`);
    return undefined;
  }
  return value;
}

function readNullableRevisionId(
  record: Record<string, unknown>,
  key: string,
  errors: ProjectPublishRevisionValidationError[],
): string | null | undefined {
  if (!hasOwn(record, key)) {
    addError(errors, key, `${key} is required`);
    return undefined;
  }
  if (record[key] === null) return null;
  return readOptionalRevisionId(record, key, errors);
}

function readNonNegativeSafeInteger(
  record: Record<string, unknown>,
  key: string,
  parent: string,
  errors: ProjectPublishRevisionValidationError[],
): number | null {
  const path = `${parent}.${key}`;
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    addError(errors, path, `${path} must be a non-negative safe integer`);
    return null;
  }
  return value as number;
}

function readNullableNonNegativeSafeInteger(
  record: Record<string, unknown>,
  key: string,
  parent: string,
  errors: ProjectPublishRevisionValidationError[],
): number | null | undefined {
  const path = `${parent}.${key}`;
  if (!hasOwn(record, key)) {
    addError(errors, path, `${path} is required`);
    return undefined;
  }
  if (record[key] === null) return null;
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    addError(errors, path, `${path} must be null or a non-negative safe integer`);
    return undefined;
  }
  return value as number;
}

function isValidIsoDateTime(value: string): boolean {
  if (!ISO_DATE_TIME_PATTERN.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const probe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    probe.getUTCFullYear() === Number(year) &&
    probe.getUTCMonth() === Number(month) - 1 &&
    probe.getUTCDate() === Number(day)
  );
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  parent: string,
  errors: ProjectPublishRevisionValidationError[],
) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      const path = parent === "$" ? key : `${parent}.${key}`;
      addError(errors, path, `${path} is not allowed in schemaVersion 1`);
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function addError(
  errors: ProjectPublishRevisionValidationError[],
  path: string,
  message: string,
) {
  errors.push({ path, message });
}

function failure(path: string, message: string): ProjectPublishRevisionParseResult {
  return { ok: false, errors: [{ path, message }] };
}
