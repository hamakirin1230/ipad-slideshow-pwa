import type { GooglePhotosExportMimeType } from "./contract";

const DRIVE_API_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export async function openDriveProjectAssetStream(input: {
  accessToken: string;
  assetFileId: string;
  expectedMimeType: GooglePhotosExportMimeType;
  expectedSizeBytes: number;
  startByte?: number;
  signal: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const startByte = input.startByte ?? 0;
  if (
    !Number.isSafeInteger(startByte) ||
    startByte < 0 ||
    !Number.isSafeInteger(input.expectedSizeBytes) ||
    input.expectedSizeBytes <= 0 ||
    startByte >= input.expectedSizeBytes
  ) {
    throw new Error("drive-asset-stream-failed");
  }

  const params = new URLSearchParams({ alt: "media" });
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
  };
  if (startByte > 0) {
    headers.Range = `bytes=${startByte}-`;
  }

  const response = await fetch(
    `${DRIVE_API_FILES_URL}/${encodeURIComponent(input.assetFileId)}?${params.toString()}`,
    {
      method: "GET",
      headers,
      cache: "no-store",
      credentials: "omit",
      signal: input.signal,
    },
  );

  validateDriveAssetStreamResponse({
    response,
    expectedMimeType: input.expectedMimeType,
    expectedSizeBytes: input.expectedSizeBytes,
    startByte,
  });

  if (!response.body) {
    throw new Error("drive-asset-stream-missing");
  }

  return response.body;
}

export function parseBytesContentRange(value: string | null) {
  if (value == null) {
    return null;
  }
  const match = value.trim().match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total =
    match[3] === "*" ? null : Number(match[3]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    (total !== null && (!Number.isSafeInteger(total) || total <= 0))
  ) {
    return null;
  }
  return { start, end, total };
}

export function normalizeDriveAssetContentType(value: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function validateDriveAssetStreamResponse(input: {
  response: Response;
  expectedMimeType: GooglePhotosExportMimeType;
  expectedSizeBytes: number;
  startByte: number;
}) {
  const contentType = normalizeDriveAssetContentType(
    input.response.headers.get("Content-Type"),
  );
  if (contentType !== input.expectedMimeType) {
    throw new Error("drive-asset-stream-failed");
  }

  const contentLength = parseContentLength(
    input.response.headers.get("Content-Length"),
  );

  if (input.startByte === 0) {
    if (input.response.status !== 200) {
      throw new Error("drive-asset-stream-failed");
    }
    if (contentLength !== null && contentLength !== input.expectedSizeBytes) {
      throw new Error("drive-asset-stream-failed");
    }
    return;
  }

  if (input.response.status !== 206) {
    throw new Error("drive-asset-stream-failed");
  }

  const range = parseBytesContentRange(
    input.response.headers.get("Content-Range"),
  );
  if (!range || range.start !== input.startByte) {
    throw new Error("drive-asset-stream-failed");
  }
  if (range.total !== null && range.total !== input.expectedSizeBytes) {
    throw new Error("drive-asset-stream-failed");
  }

  const remainingBytes = input.expectedSizeBytes - input.startByte;
  if (range.end - range.start + 1 !== remainingBytes) {
    throw new Error("drive-asset-stream-failed");
  }
  if (contentLength !== null && contentLength !== remainingBytes) {
    throw new Error("drive-asset-stream-failed");
  }
}

function parseContentLength(value: string | null) {
  if (value == null || value.trim() === "") {
    return null;
  }
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error("drive-asset-stream-failed");
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("drive-asset-stream-failed");
  }
  return parsed;
}
