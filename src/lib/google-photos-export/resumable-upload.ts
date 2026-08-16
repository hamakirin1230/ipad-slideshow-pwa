export const GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024;
export const GOOGLE_PHOTOS_UPLOADS_URL =
  "https://photoslibrary.googleapis.com/v1/uploads";

export type GooglePhotosResumableSession = {
  sessionUrl: string;
  offset: number;
};

export type GooglePhotosResumableUploadAdapter = {
  startSession: (input: {
    accessToken: string;
    mimeType: string;
    sizeBytes: number;
    fileName: string;
    signal: AbortSignal;
  }) => Promise<string>;
  uploadChunk: (input: {
    sessionUrl: string;
    chunk: Uint8Array;
    offset: number;
    finalize: boolean;
    signal: AbortSignal;
  }) => Promise<string | null>;
};

export async function startGooglePhotosResumableSession(input: {
  accessToken: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
  signal: AbortSignal;
}): Promise<string> {
  const response = await fetch(GOOGLE_PHOTOS_UPLOADS_URL, {
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
    signal: input.signal,
  });

  const sessionUrl = response.headers.get("X-Goog-Upload-URL");
  if (!response.ok || !sessionUrl) {
    throw new Error("photos-upload-session-failed");
  }
  return sessionUrl;
}

export async function uploadGooglePhotosResumableChunk(input: {
  sessionUrl: string;
  chunk: Uint8Array;
  offset: number;
  finalize: boolean;
  signal: AbortSignal;
}): Promise<string | null> {
  const response = await fetch(input.sessionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Goog-Upload-Command": input.finalize ? "upload, finalize" : "upload",
      "X-Goog-Upload-Offset": String(input.offset),
    },
    body: Uint8Array.from(input.chunk),
    cache: "no-store",
    credentials: "omit",
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error("photos-upload-chunk-failed");
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
  };
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

      while (pending.byteLength >= GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES) {
        const remainingAfterChunk =
          input.sizeBytes - offset - GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES;
        if (!done && remainingAfterChunk > 0) {
          const chunk = pending.slice(0, GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES);
          pending = pending.slice(GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES);
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

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const next = new Uint8Array(left.byteLength + right.byteLength);
  next.set(left, 0);
  next.set(right, left.byteLength);
  return next;
}
