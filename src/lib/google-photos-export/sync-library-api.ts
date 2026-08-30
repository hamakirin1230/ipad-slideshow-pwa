import { GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH } from "./contract";
import { GOOGLE_PHOTOS_LIBRARY_API_BASE } from "./library-api";

export { GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH } from "./contract";

export const GOOGLE_PHOTOS_ALBUM_LIST_PAGE_SIZE_MAX = 50;
export const GOOGLE_PHOTOS_MEDIA_SEARCH_PAGE_SIZE_MAX = 100;
export const GOOGLE_PHOTOS_MEMBERSHIP_BATCH_SIZE_MAX = 50;

export type GooglePhotosSyncAlbum = {
  id: string;
  title: string;
  isWriteable: boolean | null;
  mediaItemsCount: string | null;
};

export type GooglePhotosSyncAlbumReadResult =
  | { status: "ready"; album: GooglePhotosSyncAlbum }
  | { status: "notFound" }
  | { status: "inaccessible" }
  | { status: "invalidResponse" };

export type GooglePhotosSyncAlbumPageResult =
  | {
      status: "ready";
      albums: GooglePhotosSyncAlbum[];
      nextPageToken: string | null;
    }
  | { status: "invalidInput" }
  | { status: "inaccessible" }
  | { status: "invalidResponse" };

export type GooglePhotosSyncMediaItemPageResult =
  | {
      status: "ready";
      mediaItemIds: string[];
      nextPageToken: string | null;
    }
  | { status: "invalidInput" }
  | { status: "inaccessible" }
  | { status: "invalidResponse" };

export type GooglePhotosSyncAlbumUpdateResult =
  | { status: "updated"; album: GooglePhotosSyncAlbum }
  | { status: "invalidInput" }
  | { status: "failed" }
  | { status: "invalidResponse" };

export type GooglePhotosMembershipMutationResult =
  | { status: "completed" }
  | { status: "invalidInput" }
  | { status: "failed" };

export type GooglePhotosMembershipChunksResult =
  | { ok: true; chunks: string[][] }
  | { ok: false };

export type GooglePhotosMembershipSerialResult =
  | { status: "completed"; completedCount: number }
  | { status: "invalidInput"; completedCount: 0 }
  | { status: "failed"; completedCount: number };

export type GooglePhotosSyncLibraryAdapter = {
  getAlbum: typeof getGooglePhotosSyncAlbum;
  listAlbumsPage: typeof listGooglePhotosSyncAlbumsPage;
  searchAlbumMediaItemsPage: typeof searchGooglePhotosSyncAlbumMediaItemsPage;
  updateAlbumTitle: typeof updateGooglePhotosSyncAlbumTitle;
  batchAddMediaItems: typeof batchAddGooglePhotosSyncMediaItems;
  batchRemoveMediaItems: typeof batchRemoveGooglePhotosSyncMediaItems;
};

export const googlePhotosSyncLibraryAdapter: GooglePhotosSyncLibraryAdapter = {
  getAlbum: getGooglePhotosSyncAlbum,
  listAlbumsPage: listGooglePhotosSyncAlbumsPage,
  searchAlbumMediaItemsPage: searchGooglePhotosSyncAlbumMediaItemsPage,
  updateAlbumTitle: updateGooglePhotosSyncAlbumTitle,
  batchAddMediaItems: batchAddGooglePhotosSyncMediaItems,
  batchRemoveMediaItems: batchRemoveGooglePhotosSyncMediaItems,
};

export async function getGooglePhotosSyncAlbum(input: {
  accessToken: string;
  albumId: string;
  signal: AbortSignal;
}): Promise<GooglePhotosSyncAlbumReadResult> {
  if (!isNonBlankTrimmedString(input.albumId)) {
    return { status: "inaccessible" };
  }
  const response = await requestGooglePhotosSyncLibraryApi({
    accessToken: input.accessToken,
    url: `${GOOGLE_PHOTOS_LIBRARY_API_BASE}/albums/${encodeURIComponent(input.albumId)}`,
    method: "GET",
    signal: input.signal,
  });
  if (!response) return { status: "inaccessible" };
  if (response.status === 404) return { status: "notFound" };
  if (!response.ok) return { status: "inaccessible" };

  const body = await readJson(response);
  if (!body.ok) return { status: "invalidResponse" };
  const album = parseGooglePhotosSyncAlbum(body.value);
  return album ? { status: "ready", album } : { status: "invalidResponse" };
}

export async function listGooglePhotosSyncAlbumsPage(input: {
  accessToken: string;
  pageSize?: number;
  pageToken?: string;
  signal: AbortSignal;
}): Promise<GooglePhotosSyncAlbumPageResult> {
  const pageSize = input.pageSize ?? GOOGLE_PHOTOS_ALBUM_LIST_PAGE_SIZE_MAX;
  if (
    !isPageSize(pageSize, GOOGLE_PHOTOS_ALBUM_LIST_PAGE_SIZE_MAX) ||
    !isOptionalNonBlankString(input.pageToken)
  ) {
    return { status: "invalidInput" };
  }
  const search = new URLSearchParams({
    excludeNonAppCreatedData: "true",
    pageSize: String(pageSize),
  });
  if (input.pageToken !== undefined) search.set("pageToken", input.pageToken);

  const response = await requestGooglePhotosSyncLibraryApi({
    accessToken: input.accessToken,
    url: `${GOOGLE_PHOTOS_LIBRARY_API_BASE}/albums?${search.toString()}`,
    method: "GET",
    signal: input.signal,
  });
  if (!response || !response.ok) return { status: "inaccessible" };

  const body = await readJson(response);
  if (!body.ok || !isRecord(body.value)) {
    return { status: "invalidResponse" };
  }
  const albumsValue = body.value.albums;
  if (albumsValue !== undefined && !Array.isArray(albumsValue)) {
    return { status: "invalidResponse" };
  }
  const albums: GooglePhotosSyncAlbum[] = [];
  for (const value of albumsValue ?? []) {
    const album = parseGooglePhotosSyncAlbum(value);
    if (!album) return { status: "invalidResponse" };
    albums.push(album);
  }
  const nextPageToken = parseNextPageToken(body.value);
  if (!nextPageToken.ok) return { status: "invalidResponse" };
  return { status: "ready", albums, nextPageToken: nextPageToken.value };
}

export async function searchGooglePhotosSyncAlbumMediaItemsPage(input: {
  accessToken: string;
  albumId: string;
  pageSize?: number;
  pageToken?: string;
  signal: AbortSignal;
}): Promise<GooglePhotosSyncMediaItemPageResult> {
  const pageSize = input.pageSize ?? GOOGLE_PHOTOS_MEDIA_SEARCH_PAGE_SIZE_MAX;
  if (
    !isNonBlankTrimmedString(input.albumId) ||
    !isPageSize(pageSize, GOOGLE_PHOTOS_MEDIA_SEARCH_PAGE_SIZE_MAX) ||
    !isOptionalNonBlankString(input.pageToken)
  ) {
    return { status: "invalidInput" };
  }
  const body: { albumId: string; pageSize: number; pageToken?: string } = {
    albumId: input.albumId,
    pageSize,
  };
  if (input.pageToken !== undefined) body.pageToken = input.pageToken;

  const response = await requestGooglePhotosSyncLibraryApi({
    accessToken: input.accessToken,
    url: `${GOOGLE_PHOTOS_LIBRARY_API_BASE}/mediaItems:search`,
    method: "POST",
    body,
    signal: input.signal,
  });
  if (!response || !response.ok) return { status: "inaccessible" };

  const responseBody = await readJson(response);
  if (!responseBody.ok || !isRecord(responseBody.value)) {
    return { status: "invalidResponse" };
  }
  const mediaItemsValue = responseBody.value.mediaItems;
  if (mediaItemsValue !== undefined && !Array.isArray(mediaItemsValue)) {
    return { status: "invalidResponse" };
  }
  const mediaItemIds: string[] = [];
  const seen = new Set<string>();
  for (const value of mediaItemsValue ?? []) {
    if (!isRecord(value) || !isNonBlankTrimmedString(value.id) || seen.has(value.id)) {
      return { status: "invalidResponse" };
    }
    seen.add(value.id);
    mediaItemIds.push(value.id);
  }
  const nextPageToken = parseNextPageToken(responseBody.value);
  if (!nextPageToken.ok) return { status: "invalidResponse" };
  return {
    status: "ready",
    mediaItemIds,
    nextPageToken: nextPageToken.value,
  };
}

export async function updateGooglePhotosSyncAlbumTitle(input: {
  accessToken: string;
  albumId: string;
  title: string;
  signal: AbortSignal;
}): Promise<GooglePhotosSyncAlbumUpdateResult> {
  if (
    !isNonBlankTrimmedString(input.albumId) ||
    !isNonBlankTrimmedString(input.title) ||
    [...input.title].length > GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH
  ) {
    return { status: "invalidInput" };
  }
  const response = await requestGooglePhotosSyncLibraryApi({
    accessToken: input.accessToken,
    url: `${GOOGLE_PHOTOS_LIBRARY_API_BASE}/albums/${encodeURIComponent(input.albumId)}?updateMask=title`,
    method: "PATCH",
    body: { title: input.title },
    signal: input.signal,
  });
  if (!response || !response.ok) return { status: "failed" };

  const body = await readJson(response);
  if (!body.ok) return { status: "invalidResponse" };
  const album = parseGooglePhotosSyncAlbum(body.value);
  return album ? { status: "updated", album } : { status: "invalidResponse" };
}

export async function batchAddGooglePhotosSyncMediaItems(input: {
  accessToken: string;
  albumId: string;
  mediaItemIds: string[];
  signal: AbortSignal;
}): Promise<GooglePhotosMembershipMutationResult> {
  return mutateGooglePhotosAlbumMembership({ ...input, operation: "add" });
}

export async function batchRemoveGooglePhotosSyncMediaItems(input: {
  accessToken: string;
  albumId: string;
  mediaItemIds: string[];
  signal: AbortSignal;
}): Promise<GooglePhotosMembershipMutationResult> {
  return mutateGooglePhotosAlbumMembership({ ...input, operation: "remove" });
}

export function chunkGooglePhotosMediaItemIds(
  mediaItemIds: readonly string[],
): GooglePhotosMembershipChunksResult {
  if (!mediaItemIds.every(isNonBlankTrimmedString)) return { ok: false };
  const uniqueIds = new Set(mediaItemIds);
  if (uniqueIds.size !== mediaItemIds.length) return { ok: false };
  const chunks: string[][] = [];
  for (
    let index = 0;
    index < mediaItemIds.length;
    index += GOOGLE_PHOTOS_MEMBERSHIP_BATCH_SIZE_MAX
  ) {
    chunks.push(
      mediaItemIds.slice(
        index,
        index + GOOGLE_PHOTOS_MEMBERSHIP_BATCH_SIZE_MAX,
      ),
    );
  }
  return { ok: true, chunks };
}

export async function updateGooglePhotosAlbumMembershipSerially(
  input: {
    operation: "add" | "remove";
    accessToken: string;
    albumId: string;
    mediaItemIds: string[];
    signal: AbortSignal;
  },
  adapter: Pick<
    GooglePhotosSyncLibraryAdapter,
    "batchAddMediaItems" | "batchRemoveMediaItems"
  > = googlePhotosSyncLibraryAdapter,
): Promise<GooglePhotosMembershipSerialResult> {
  if (!isNonBlankTrimmedString(input.albumId)) {
    return { status: "invalidInput", completedCount: 0 };
  }
  const chunked = chunkGooglePhotosMediaItemIds(input.mediaItemIds);
  if (!chunked.ok) return { status: "invalidInput", completedCount: 0 };
  let completedCount = 0;
  for (const mediaItemIds of chunked.chunks) {
    const write =
      input.operation === "add"
        ? adapter.batchAddMediaItems
        : adapter.batchRemoveMediaItems;
    const result = await write({
      accessToken: input.accessToken,
      albumId: input.albumId,
      mediaItemIds,
      signal: input.signal,
    });
    if (result.status !== "completed") {
      return { status: "failed", completedCount };
    }
    completedCount += mediaItemIds.length;
  }
  return { status: "completed", completedCount };
}

async function mutateGooglePhotosAlbumMembership(input: {
  operation: "add" | "remove";
  accessToken: string;
  albumId: string;
  mediaItemIds: string[];
  signal: AbortSignal;
}): Promise<GooglePhotosMembershipMutationResult> {
  if (
    !isNonBlankTrimmedString(input.albumId) ||
    input.mediaItemIds.length === 0 ||
    input.mediaItemIds.length > GOOGLE_PHOTOS_MEMBERSHIP_BATCH_SIZE_MAX ||
    !chunkGooglePhotosMediaItemIds(input.mediaItemIds).ok
  ) {
    return { status: "invalidInput" };
  }
  const suffix =
    input.operation === "add"
      ? "batchAddMediaItems"
      : "batchRemoveMediaItems";
  const response = await requestGooglePhotosSyncLibraryApi({
    accessToken: input.accessToken,
    url: `${GOOGLE_PHOTOS_LIBRARY_API_BASE}/albums/${encodeURIComponent(input.albumId)}:${suffix}`,
    method: "POST",
    body: { mediaItemIds: input.mediaItemIds },
    signal: input.signal,
  });
  return response?.ok ? { status: "completed" } : { status: "failed" };
}

async function requestGooglePhotosSyncLibraryApi(input: {
  accessToken: string;
  url: string;
  method: "GET" | "POST" | "PATCH";
  body?: Record<string, unknown>;
  signal: AbortSignal;
}): Promise<Response | null> {
  if (input.signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  try {
    return await fetch(input.url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      cache: "no-store",
      credentials: "omit",
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal.aborted || isAbortError(error)) throw error;
    return null;
  }
}

function parseGooglePhotosSyncAlbum(value: unknown): GooglePhotosSyncAlbum | null {
  if (
    !isRecord(value) ||
    !isNonBlankTrimmedString(value.id) ||
    typeof value.title !== "string"
  ) {
    return null;
  }
  const isWriteable =
    value.isWriteable === undefined
      ? null
      : typeof value.isWriteable === "boolean"
        ? value.isWriteable
        : undefined;
  if (isWriteable === undefined) return null;
  const mediaItemsCount =
    value.mediaItemsCount === undefined
      ? null
      : typeof value.mediaItemsCount === "string" &&
          /^(?:0|[1-9]\d*)$/.test(value.mediaItemsCount)
        ? value.mediaItemsCount
        : undefined;
  if (mediaItemsCount === undefined) return null;
  return { id: value.id, title: value.title, isWriteable, mediaItemsCount };
}

function parseNextPageToken(
  value: Record<string, unknown>,
): { ok: true; value: string | null } | { ok: false } {
  if (value.nextPageToken === undefined) return { ok: true, value: null };
  return isNonBlankTrimmedString(value.nextPageToken)
    ? { ok: true, value: value.nextPageToken }
    : { ok: false };
}

async function readJson(
  response: Response,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: (await response.json()) as unknown };
  } catch {
    return { ok: false };
  }
}

function isPageSize(value: number, maximum: number) {
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}

function isOptionalNonBlankString(value: string | undefined) {
  return value === undefined || isNonBlankTrimmedString(value);
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
