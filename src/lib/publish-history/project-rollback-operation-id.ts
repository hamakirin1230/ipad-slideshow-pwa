import { isValidProjectPublishIsoDateTime } from "./project-publish-operation-id";

const OPERATION_ID_PATTERN = /^rbop_\d{8}T\d{9}Z_[0-9a-f]{8}$/;
const RANDOM_SUFFIX_PATTERN = /^[0-9a-f]{8}$/;

export function createProjectRollbackOperationId(input: {
  startedAt: string;
  randomSuffix: string;
}): string {
  if (!isValidProjectPublishIsoDateTime(input.startedAt)) {
    throw new TypeError("startedAt must be a valid ISO 8601 datetime");
  }
  if (!RANDOM_SUFFIX_PATTERN.test(input.randomSuffix)) {
    throw new TypeError(
      "randomSuffix must contain exactly 8 lowercase hex characters",
    );
  }

  const compactTimestamp = new Date(input.startedAt)
    .toISOString()
    .replace(/[-:.]/g, "");
  return `rbop_${compactTimestamp}_${input.randomSuffix}`;
}

export function isValidProjectRollbackOperationId(
  value: unknown,
): value is string {
  if (typeof value !== "string" || !OPERATION_ID_PATTERN.test(value)) {
    return false;
  }

  const timestamp = value.slice(5, 23);
  const isoTimestamp = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}.${timestamp.slice(15, 18)}Z`;
  return isValidProjectPublishIsoDateTime(isoTimestamp);
}
