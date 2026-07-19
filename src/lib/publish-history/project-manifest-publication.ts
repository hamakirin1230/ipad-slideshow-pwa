import { isValidProjectPublishOperationId } from "./project-publish-operation-id";
import { isValidProjectPublishRevisionId } from "./project-publish-revision-id";

export const PROJECT_MANIFEST_PUBLICATION_SCHEMA_VERSION = 1 as const;

const CANONICAL_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const PUBLICATION_KEYS = new Set([
  "schemaVersion",
  "currentRevisionId",
  "publishedAt",
  "operation",
  "operationId",
  "contentCanonicalHash",
]);

export type ProjectManifestPublication = {
  schemaVersion: typeof PROJECT_MANIFEST_PUBLICATION_SCHEMA_VERSION;
  currentRevisionId: string;
  publishedAt: string;
  operation: "publish" | "rollback";
  operationId: string;
  contentCanonicalHash: string;
};

export type ProjectManifestPublicationParseResult =
  | { ok: true; value: ProjectManifestPublication }
  | { ok: false; errors: string[] };

export function parseProjectManifestPublication(
  input: unknown,
): ProjectManifestPublicationParseResult {
  if (!isRecord(input)) {
    return { ok: false, errors: ["publication must be a JSON object"] };
  }

  const errors: string[] = [];
  for (const key of Object.keys(input)) {
    if (!PUBLICATION_KEYS.has(key)) errors.push(`publication.${key} is not allowed`);
  }

  if (input.schemaVersion !== PROJECT_MANIFEST_PUBLICATION_SCHEMA_VERSION) {
    errors.push("publication.schemaVersion must be 1");
  }

  const currentRevisionId = readNonEmptyString(
    input.currentRevisionId,
    "publication.currentRevisionId",
    errors,
  );
  if (
    currentRevisionId &&
    !isValidProjectPublishRevisionId(currentRevisionId)
  ) {
    errors.push("publication.currentRevisionId has an invalid format");
  }

  const publishedAt = readNonEmptyString(
    input.publishedAt,
    "publication.publishedAt",
    errors,
  );
  if (publishedAt && !isValidIsoDateTime(publishedAt)) {
    errors.push("publication.publishedAt must be a valid ISO 8601 datetime");
  }

  const operation =
    input.operation === "publish" || input.operation === "rollback"
      ? input.operation
      : null;
  if (!operation) errors.push("publication.operation must be publish or rollback");

  const operationId = readNonEmptyString(
    input.operationId,
    "publication.operationId",
    errors,
  );
  if (
    operation === "publish" &&
    operationId &&
    !isValidProjectPublishOperationId(operationId)
  ) {
    errors.push("publication.operationId has an invalid publish format");
  }

  const contentCanonicalHash = readNonEmptyString(
    input.contentCanonicalHash,
    "publication.contentCanonicalHash",
    errors,
  );
  if (
    contentCanonicalHash &&
    !CANONICAL_HASH_PATTERN.test(contentCanonicalHash)
  ) {
    errors.push("publication.contentCanonicalHash has an invalid format");
  }

  if (
    errors.length > 0 ||
    input.schemaVersion !== PROJECT_MANIFEST_PUBLICATION_SCHEMA_VERSION ||
    !currentRevisionId ||
    !publishedAt ||
    !operation ||
    !operationId ||
    !contentCanonicalHash
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      schemaVersion: PROJECT_MANIFEST_PUBLICATION_SCHEMA_VERSION,
      currentRevisionId,
      publishedAt,
      operation,
      operationId,
      contentCanonicalHash,
    },
  };
}

function readNonEmptyString(
  value: unknown,
  path: string,
  errors: string[],
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string`);
    return null;
  }
  return value;
}

function isValidIsoDateTime(value: string) {
  if (!ISO_DATE_TIME_PATTERN.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!match) return false;
  const probe = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return (
    probe.getUTCFullYear() === Number(match[1]) &&
    probe.getUTCMonth() === Number(match[2]) - 1 &&
    probe.getUTCDate() === Number(match[3])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
