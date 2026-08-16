import type { GooglePhotosExportPlanItem } from "./contract";

export const GOOGLE_PHOTOS_LIBRARY_API_BASE =
  "https://photoslibrary.googleapis.com/v1";

export type GooglePhotosBatchCreateResult =
  | { ok: true; mediaItemIds: string[] }
  | { ok: false; kind: "mediaCreatePartial" };

export type GooglePhotosAlbumCreateResult =
  | { ok: true; albumId: string; productUrl: string | null }
  | { ok: false };

export type GooglePhotosLibraryAdapter = {
  batchCreateMediaItems: (input: {
    accessToken: string;
    items: Array<{
      description: string;
      fileName: string;
      uploadToken: string;
    }>;
    signal: AbortSignal;
  }) => Promise<GooglePhotosBatchCreateResult>;
  createAlbum: (input: {
    accessToken: string;
    title: string;
    signal: AbortSignal;
  }) => Promise<GooglePhotosAlbumCreateResult>;
  batchAddMediaItems: (input: {
    accessToken: string;
    albumId: string;
    mediaItemIds: string[];
    signal: AbortSignal;
  }) => Promise<boolean>;
};

export function buildBatchCreateMediaItems(input: {
  items: GooglePhotosExportPlanItem[];
  uploadTokens: string[];
}) {
  return input.items.map((item, index) => {
    const body: {
      description?: string;
      simpleMediaItem: { fileName: string; uploadToken: string };
    } = {
      simpleMediaItem: {
        fileName: item.fileName,
        uploadToken: input.uploadTokens[index] ?? "",
      },
    };
    if (item.description) {
      body.description = item.description;
    }
    return body;
  });
}

export function inspectBatchCreateResponse(input: {
  httpStatus: number;
  body: unknown;
}): GooglePhotosBatchCreateResult {
  if (input.httpStatus !== 200 && input.httpStatus !== 207) {
    return { ok: false, kind: "mediaCreatePartial" };
  }
  if (!isRecord(input.body) || !Array.isArray(input.body.newMediaItemResults)) {
    return { ok: false, kind: "mediaCreatePartial" };
  }

  const mediaItemIds: string[] = [];
  for (const result of input.body.newMediaItemResults) {
    if (!isRecord(result) || !isRecord(result.mediaItem)) {
      return { ok: false, kind: "mediaCreatePartial" };
    }
    if (typeof result.mediaItem.id !== "string" || result.mediaItem.id.trim() === "") {
      return { ok: false, kind: "mediaCreatePartial" };
    }
    const status = isRecord(result.status) ? result.status : null;
    if (
      status &&
      typeof status.code === "number" &&
      status.code !== 0
    ) {
      return { ok: false, kind: "mediaCreatePartial" };
    }
    mediaItemIds.push(result.mediaItem.id);
  }

  if (mediaItemIds.length === 0) {
    return { ok: false, kind: "mediaCreatePartial" };
  }
  return { ok: true, mediaItemIds };
}

export function sanitizeGooglePhotosProductUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "photos.google.com") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function batchCreateGooglePhotosMediaItems(input: {
  accessToken: string;
  items: Array<{
    description: string;
    fileName: string;
    uploadToken: string;
  }>;
  signal: AbortSignal;
}): Promise<GooglePhotosBatchCreateResult> {
  const response = await fetch(
    `${GOOGLE_PHOTOS_LIBRARY_API_BASE}/mediaItems:batchCreate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        newMediaItems: input.items.map((item) => {
          const next: {
            description?: string;
            simpleMediaItem: { fileName: string; uploadToken: string };
          } = {
            simpleMediaItem: {
              fileName: item.fileName,
              uploadToken: item.uploadToken,
            },
          };
          if (item.description) {
            next.description = item.description;
          }
          return next;
        }),
      }),
      cache: "no-store",
      credentials: "omit",
      signal: input.signal,
    },
  );

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return inspectBatchCreateResponse({
    httpStatus: response.status,
    body,
  });
}

export async function createGooglePhotosAlbum(input: {
  accessToken: string;
  title: string;
  signal: AbortSignal;
}): Promise<GooglePhotosAlbumCreateResult> {
  const response = await fetch(`${GOOGLE_PHOTOS_LIBRARY_API_BASE}/albums`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ album: { title: input.title } }),
    cache: "no-store",
    credentials: "omit",
    signal: input.signal,
  });

  if (!response.ok) {
    return { ok: false };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return { ok: false };
  }
  if (!isRecord(body) || typeof body.id !== "string" || body.id.trim() === "") {
    return { ok: false };
  }
  return {
    ok: true,
    albumId: body.id,
    productUrl: sanitizeGooglePhotosProductUrl(body.productUrl),
  };
}

export async function batchAddGooglePhotosMediaItems(input: {
  accessToken: string;
  albumId: string;
  mediaItemIds: string[];
  signal: AbortSignal;
}): Promise<boolean> {
  const response = await fetch(
    `${GOOGLE_PHOTOS_LIBRARY_API_BASE}/albums/${encodeURIComponent(input.albumId)}:batchAddMediaItems`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mediaItemIds: input.mediaItemIds }),
      cache: "no-store",
      credentials: "omit",
      signal: input.signal,
    },
  );
  return response.ok;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
