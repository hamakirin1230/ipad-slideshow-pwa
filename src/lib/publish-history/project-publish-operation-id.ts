const OPERATION_ID_PATTERN = /^pubop_\d{8}T\d{9}Z_[0-9a-f]{8}$/;
const RANDOM_SUFFIX_PATTERN = /^[0-9a-f]{8}$/;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function createProjectPublishOperationId(input: {
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
  return `pubop_${compactTimestamp}_${input.randomSuffix}`;
}

export function isValidProjectPublishOperationId(
  value: unknown,
): value is string {
  if (typeof value !== "string" || !OPERATION_ID_PATTERN.test(value)) {
    return false;
  }

  const timestamp = value.slice(6, 24);
  const isoTimestamp = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}.${timestamp.slice(15, 18)}Z`;
  return isValidProjectPublishIsoDateTime(isoTimestamp);
}

export function isValidProjectPublishIsoDateTime(
  value: unknown,
): value is string {
  if (typeof value !== "string" || !ISO_DATE_TIME_PATTERN.test(value)) {
    return false;
  }
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
