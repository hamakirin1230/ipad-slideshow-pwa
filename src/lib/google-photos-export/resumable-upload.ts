export const GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024;
export const GOOGLE_PHOTOS_UPLOAD_WATCHDOG_TIMEOUT_MS = 180_000;
export const GOOGLE_PHOTOS_UPLOADS_URL =
  "https://photoslibrary.googleapis.com/v1/uploads";

export type GooglePhotosUploadFailureCategory =
  | "network"
  | "timeout"
  | "http429"
  | "http5xx"
  | "otherHttp";

export class GooglePhotosUploadRequestError extends Error {
  readonly category: GooglePhotosUploadFailureCategory;

  constructor(category: GooglePhotosUploadFailureCategory) {
    super("photos-upload-request-failed");
    this.name = "GooglePhotosUploadRequestError";
    this.category = category;
  }
}

export type GooglePhotosStartedSession = {
  sessionUrl: string;
  chunkGranularity: number;
};

export type GooglePhotosResumableSession = GooglePhotosStartedSession & {
  offset: number;
};

export type GooglePhotosSessionQueryResult =
  | { ok: true; status: "active"; offset: number }
  | { ok: false };

export type GooglePhotosResumableUploadAdapter = {
  startSession: (input: {
    accessToken: string;
    mimeType: string;
    sizeBytes: number;
    fileName: string;
    signal: AbortSignal;
  }) => Promise<GooglePhotosStartedSession>;
  uploadChunk: (input: {
    sessionUrl: string;
    chunk: Uint8Array;
    offset: number;
    finalize: boolean;
    signal: AbortSignal;
  }) => Promise<string | null>;
  querySession: (input: {
    sessionUrl: string;
    signal: AbortSignal;
  }) => Promise<GooglePhotosSessionQueryResult>;
};

export function parseGooglePhotosChunkGranularity(value: string | null) {
  return parseHeaderSafeInteger(value, { min: 1 });
}

export function resolveGooglePhotosResumableChunkSize(chunkGranularity: number) {
  if (!Number.isSafeInteger(chunkGranularity) || chunkGranularity <= 0) {
    throw new Error("photos-upload-granularity-invalid");
  }
  const multiple = Math.floor(
    GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES / chunkGranularity,
  );
  return multiple >= 1 ? multiple * chunkGranularity : chunkGranularity;
}

export function parseGooglePhotosUploadSessionQuery(
  headers: Headers,
): GooglePhotosSessionQueryResult {
  const status = headers.get("X-Goog-Upload-Status")?.trim().toLowerCase();
  const offset = parseHeaderSafeInteger(
    headers.get("X-Goog-Upload-Size-Received"),
    { min: 0 },
  );
  if (status !== "active" || offset === null) {
    return { ok: false };
  }
  return { ok: true, status: "active", offset };
}

export function isGooglePhotosResumeOffsetValid(
  offset: number,
  sizeBytes: number,
) {
  return (
    Number.isSafeInteger(offset) &&
    Number.isSafeInteger(sizeBytes) &&
    offset >= 0 &&
    offset <= sizeBytes
  );
}

export async function startGooglePhotosResumableSession(input: {
  accessToken: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
  signal: AbortSignal;
}): Promise<GooglePhotosStartedSession> {
  const response = await fetchGooglePhotosUploadRequest(
    GOOGLE_PHOTOS_UPLOADS_URL,
    {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Length": "0",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Content-Type": input.mimeType,
      "X-Goog-Upload-File-Name": input.fileName,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Raw-Size": String(input.sizeBytes),
    },
    cache: "no-store",
    credentials: "omit",
    },
    input.signal,
  );

  const sessionUrl = response.headers.get("X-Goog-Upload-URL");
  const chunkGranularity = parseGooglePhotosChunkGranularity(
    response.headers.get("X-Goog-Upload-Chunk-Granularity"),
  );
  if (!response.ok || !sessionUrl) {
    throw new GooglePhotosUploadRequestError(
      classifyGooglePhotosUploadHttpStatus(response.status),
    );
  }
  if (chunkGranularity === null) {
    throw new Error("photos-upload-granularity-invalid");
  }
  return { sessionUrl, chunkGranularity };
}

export async function queryGooglePhotosResumableSession(input: {
  sessionUrl: string;
  signal: AbortSignal;
}): Promise<GooglePhotosSessionQueryResult> {
  try {
    const response = await fetchGooglePhotosUploadRequest(input.sessionUrl, {
      method: "POST",
      headers: {
        "Content-Length": "0",
        "X-Goog-Upload-Command": "query",
      },
      cache: "no-store",
      credentials: "omit",
    }, input.signal);
    if (!response.ok) {
      return { ok: false };
    }
    return parseGooglePhotosUploadSessionQuery(response.headers);
  } catch {
    return { ok: false };
  }
}

export async function uploadGooglePhotosResumableChunk(input: {
  sessionUrl: string;
  chunk: Uint8Array;
  offset: number;
  finalize: boolean;
  signal: AbortSignal;
}): Promise<string | null> {
  const response = await fetchGooglePhotosUploadRequest(input.sessionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Goog-Upload-Command": input.finalize ? "upload, finalize" : "upload",
      "X-Goog-Upload-Offset": String(input.offset),
    },
    body: Uint8Array.from(input.chunk),
    cache: "no-store",
    credentials: "omit",
  }, input.signal);

  if (!response.ok) {
    throw new GooglePhotosUploadRequestError(
      classifyGooglePhotosUploadHttpStatus(response.status),
    );
  }

  if (!input.finalize) {
    return null;
  }

  const uploadToken = (await response.text()).trim();
  if (!uploadToken) {
    throw new Error("photos-upload-token-missing");
  }
  return uploadToken;
}

async function fetchGooglePhotosUploadRequest(
  url: string,
  init: RequestInit,
  parentSignal: AbortSignal,
) {
  if (parentSignal.aborted) {
    throw new DOMException("aborted", "AbortError");
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  parentSignal.addEventListener("abort", abortFromParent, { once: true });
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GOOGLE_PHOTOS_UPLOAD_WATCHDOG_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (parentSignal.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    if (timedOut) {
      throw new GooglePhotosUploadRequestError("timeout");
    }
    if (error instanceof GooglePhotosUploadRequestError) {
      throw error;
    }
    throw new GooglePhotosUploadRequestError("network");
  } finally {
    clearTimeout(timeoutId);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}

function classifyGooglePhotosUploadHttpStatus(
  status: number,
): GooglePhotosUploadFailureCategory {
  if (status === 429) {
    return "http429";
  }
  if (status >= 500 && status <= 599) {
    return "http5xx";
  }
  return "otherHttp";
}

export async function uploadGooglePhotosResumableStream(input: {
  stream: ReadableStream<Uint8Array>;
  session: GooglePhotosResumableSession;
  sizeBytes: number;
  signal: AbortSignal;
  adapter?: GooglePhotosResumableUploadAdapter;
  onOffset: (offset: number) => void;
}): Promise<string> {
  const adapter = input.adapter ?? {
    startSession: startGooglePhotosResumableSession,
    uploadChunk: uploadGooglePhotosResumableChunk,
    querySession: queryGooglePhotosResumableSession,
  };
  const chunkSize = resolveGooglePhotosResumableChunkSize(
    input.session.chunkGranularity,
  );
  const reader = input.stream.getReader();
  let offset = input.session.offset;
  let pending = new Uint8Array(0);

  try {
    while (true) {
      if (input.signal.aborted) {
        throw new DOMException("aborted", "AbortError");
      }

      const { done, value } = await reader.read();
      if (value && value.byteLength > 0) {
        pending = concatBytes(pending, value);
      }

      while (pending.byteLength >= chunkSize) {
        const remainingAfterChunk = input.sizeBytes - offset - chunkSize;
        if (!done && remainingAfterChunk > 0) {
          const chunk = pending.slice(0, chunkSize);
          pending = pending.slice(chunkSize);
          await adapter.uploadChunk({
            sessionUrl: input.session.sessionUrl,
            chunk,
            offset,
            finalize: false,
            signal: input.signal,
          });
          offset += chunk.byteLength;
          input.onOffset(offset);
          continue;
        }
        break;
      }

      if (!done) {
        continue;
      }

      const uploadToken = await adapter.uploadChunk({
        sessionUrl: input.session.sessionUrl,
        chunk: pending,
        offset,
        finalize: true,
        signal: input.signal,
      });
      offset += pending.byteLength;
      input.onOffset(offset);
      if (!uploadToken) {
        throw new Error("photos-upload-token-missing");
      }
      return uploadToken;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseHeaderSafeInteger(
  value: string | null,
  options: { min: number },
) {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < options.min) {
    return null;
  }
  return parsed;
}

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const next = new Uint8Array(left.byteLength + right.byteLength);
  next.set(left, 0);
  next.set(right, left.byteLength);
  return next;
}
