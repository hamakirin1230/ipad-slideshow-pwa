const PHOTOS_PICKER_API_BASE_URL = "https://photospicker.googleapis.com/v1";
const PICKED_PHOTO_SIZE_SUFFIX = "=w2732-h2732";

export const PICKED_PHOTO_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
export const PHOTOS_PICKER_DEFAULT_POLL_INTERVAL_SECONDS = 3;
export const PHOTOS_PICKER_MIN_POLL_INTERVAL_SECONDS = 1;
export const PHOTOS_PICKER_DEFAULT_TIMEOUT_SECONDS = 120;
export const PHOTOS_PICKER_MAX_APP_WAIT_SECONDS = 300;

export type PhotosDownloadedAssetMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type PhotosPickerSelectionFailureStatus =
  | "cancelled"
  | "invalid"
  | "error";

export type PhotosPickerApiOperation =
  | "createSession"
  | "getSession"
  | "listMediaItems"
  | "deleteSession"
  | "fetchPhotoBytes";

export type PhotosPickerResolvedPollingTiming = {
  pollIntervalSeconds: number;
  timeoutInSeconds: number;
  diagnostics: string[];
};

export type PhotosPickerCreatedSession = {
  id: string;
  pickerUri: string;
  mediaItemsSet: boolean;
  pollingTiming: PhotosPickerResolvedPollingTiming;
  diagnostics: string[];
};

export type PhotosPickerSessionSnapshot = {
  id: string;
  pickerUri: string | null;
  mediaItemsSet: boolean;
  pollingTiming: PhotosPickerResolvedPollingTiming;
  diagnostics: string[];
};

export type PhotosPickedMediaItemsList = {
  mediaItems: unknown[];
  nextPageToken: string | null;
  diagnostics: string[];
};

export type PhotosPickedMediaItem = {
  id: string;
  type: "PHOTO";
  mediaFile: {
    baseUrl: string;
    mimeType: string;
    filename: string | null;
  };
  createTime: string | null;
  diagnostics: string[];
};

export type PhotosPickedPhotoDownloadResult = {
  blob: Blob;
  downloadedContentType: PhotosDownloadedAssetMimeType;
  downloadedSizeBytes: number;
  sizeLimitBytes: number;
  diagnostics: string[];
};

export class PhotosPickerApiError extends Error {
  readonly status: number;
  readonly operation: PhotosPickerApiOperation;
  readonly diagnostics: string[];

  constructor(
    status: number,
    operation: PhotosPickerApiOperation,
    diagnostics: string[] = [],
  ) {
    super("Photos Picker API request failed.");
    this.name = "PhotosPickerApiError";
    this.status = status;
    this.operation = operation;
    this.diagnostics = [...diagnostics];
  }
}

async function createPhotosPickerApiError(
  response: Response,
  operation: PhotosPickerApiOperation,
) {
  const diagnostics = [
    `Photos Picker API operation: ${operation}`,
    `Photos Picker API status: ${response.status}`,
  ];

  try {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.toLowerCase().includes("application/json")) {
      const body = (await response.json()) as unknown;
      diagnostics.push(...extractPhotosPickerApiErrorDiagnostics(body));
    } else {
      const text = sanitizePhotosPickerApiErrorText(await response.text());

      if (text) {
        diagnostics.push(`Photos Picker API error body: ${text}`);
      }
    }
  } catch {
    diagnostics.push("Photos Picker API error body could not be read.");
  }

  return new PhotosPickerApiError(response.status, operation, diagnostics);
}

function extractPhotosPickerApiErrorDiagnostics(body: unknown) {
  if (!isRecord(body)) {
    return ["Photos Picker API error body was not an object."];
  }

  const error = isRecord(body.error) ? body.error : null;

  if (!error) {
    return ["Photos Picker API error body did not include error object."];
  }

  const diagnostics: string[] = [];
  const status = readNonEmptyString(error.status);
  const message = readNonEmptyString(error.message);

  if (status) {
    diagnostics.push(`Google API error status: ${status}`);
  }

  if (message) {
    diagnostics.push(
      `Google API error message: ${sanitizePhotosPickerApiErrorText(message)}`,
    );
  }

  if (diagnostics.length === 0) {
    diagnostics.push("Google API error object did not include status or message.");
  }

  return diagnostics;
}

function sanitizePhotosPickerApiErrorText(value: string) {
  return value
    .replace(/https?:\/\/\S+/g, "[url omitted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}


export class PhotosPickerSelectionError extends Error {
  readonly status: PhotosPickerSelectionFailureStatus;
  readonly diagnostics: string[];
  override readonly cause?: unknown;

  constructor(input: {
    status: PhotosPickerSelectionFailureStatus;
    message: string;
    diagnostics: string[];
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "PhotosPickerSelectionError";
    this.status = input.status;
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

const allowedDownloadedAssetMimeTypes = new Set<PhotosDownloadedAssetMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function createPhotosPickerSession(
  accessToken: string,
  signal: AbortSignal,
  maxItemCount = 1,
): Promise<PhotosPickerCreatedSession> {
  const response = await fetch(`${PHOTOS_PICKER_API_BASE_URL}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pickingConfig: {
        maxItemCount: String(Math.max(1, Math.floor(maxItemCount))),
      },
    }),
    cache: "no-store",
    credentials: "omit",
    signal,
  });

  if (!response.ok) {
    throw await createPhotosPickerApiError(response, "createSession");
  }

  return normalizeCreatedPickingSessionResponse(
    (await response.json()) as unknown,
  );
}

export async function getPhotosPickerSession(
  accessToken: string,
  sessionId: string,
  signal: AbortSignal,
): Promise<PhotosPickerSessionSnapshot> {
  const response = await fetch(
    `${PHOTOS_PICKER_API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      credentials: "omit",
      signal,
    },
  );

  if (!response.ok) {
    throw await createPhotosPickerApiError(response, "getSession");
  }

  return normalizePickingSessionSnapshotResponse(
    (await response.json()) as unknown,
  );
}

export async function deletePhotosPickerSession(
  accessToken: string,
  sessionId: string,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${PHOTOS_PICKER_API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      credentials: "omit",
      signal,
    },
  );

  if (!response.ok) {
    throw await createPhotosPickerApiError(response, "deleteSession");
  }
}

export async function listPickedMediaItems(
  accessToken: string,
  sessionId: string,
  signal: AbortSignal,
  pageSize = 2,
): Promise<PhotosPickedMediaItemsList> {
  const params = new URLSearchParams({
    sessionId,
    pageSize: String(Math.max(1, Math.floor(pageSize))),
  });

  const response = await fetch(
    `${PHOTOS_PICKER_API_BASE_URL}/mediaItems?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      credentials: "omit",
      signal,
    },
  );

  if (!response.ok) {
    throw await createPhotosPickerApiError(response, "listMediaItems");
  }

  return normalizePickedMediaItemsResponse((await response.json()) as unknown);
}

export function extractSinglePickedMediaItem(
  list: PhotosPickedMediaItemsList,
): unknown {
  if (list.nextPageToken) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Picked media item list included nextPageToken.",
      diagnostics: [
        "Photos Picker selection returned nextPageToken even though maxItemCount was 1.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  if (list.mediaItems.length === 0) {
    throw new PhotosPickerSelectionError({
      status: "cancelled",
      message: "No media item was selected.",
      diagnostics: [
        "Photos Picker selection returned 0 media items.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  if (list.mediaItems.length > 1) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "More than one media item was selected.",
      diagnostics: [
        "Photos Picker selection returned more than 1 media item.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  return list.mediaItems[0];
}

export function extractPickedMediaItems(
  list: PhotosPickedMediaItemsList,
  maxCount: number,
): unknown[] {
  if (list.nextPageToken) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Picked media item list included nextPageToken.",
      diagnostics: [
        "Photos Picker selection returned nextPageToken even though the batch page size matched the requested limit.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  if (list.mediaItems.length === 0) {
    throw new PhotosPickerSelectionError({
      status: "cancelled",
      message: "No media item was selected.",
      diagnostics: [
        "Photos Picker selection returned 0 media items.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  return list.mediaItems.slice(0, Math.max(1, Math.floor(maxCount)));
}

export async function fetchAndValidatePickedPhoto(input: {
  accessToken: string;
  baseUrl: string;
  signal: AbortSignal;
  sizeLimitBytes?: number;
}): Promise<PhotosPickedPhotoDownloadResult> {
  const sizeLimitBytes = input.sizeLimitBytes ?? PICKED_PHOTO_SIZE_LIMIT_BYTES;
  const diagnostics: string[] = [];

  const response = await fetch(buildPickedPhotoDownloadUrl(input.baseUrl), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    cache: "no-store",
    credentials: "omit",
    signal: input.signal,
  });

  if (!response.ok) {
    throw await createPhotosPickerApiError(response, "fetchPhotoBytes");
  }

  const normalizedContentType = normalizeContentType(
    response.headers.get("content-type"),
  );

  if (!isPhotosDownloadedAssetMimeType(normalizedContentType)) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Downloaded photo Content-Type was not supported.",
      diagnostics: [
        normalizedContentType
          ? `Downloaded Content-Type was ${normalizedContentType}.`
          : "Downloaded Content-Type was empty.",
        "Allowed downloaded Content-Type: image/jpeg, image/png, image/webp.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  const contentLengthBytes = parseContentLengthBytes(
    response.headers.get("content-length"),
  );

  if (contentLengthBytes === "invalid") {
    diagnostics.push("Content-Length header was invalid and was ignored.");
  }

  if (
    typeof contentLengthBytes === "number" &&
    contentLengthBytes > sizeLimitBytes
  ) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Downloaded photo exceeded the size limit.",
      diagnostics: [
        `Content-Length bytes: ${contentLengthBytes}`,
        `Size limit bytes: ${sizeLimitBytes}`,
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  const blob = await response.blob();

  if (blob.size > sizeLimitBytes) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Downloaded photo exceeded the size limit.",
      diagnostics: [
        `Downloaded size bytes: ${blob.size}`,
        `Size limit bytes: ${sizeLimitBytes}`,
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  return {
    blob,
    downloadedContentType: normalizedContentType,
    downloadedSizeBytes: blob.size,
    sizeLimitBytes,
    diagnostics,
  };
}

export function normalizeCreatedPickingSessionResponse(
  responseBody: unknown,
): PhotosPickerCreatedSession {
  const normalized = normalizePickingSessionResponse(responseBody, {
    requirePickerUri: true,
  });

  if (!normalized.pickerUri) {
    throw new PhotosPickerSelectionError({
      status: "error",
      message: "Photos Picker session response did not include pickerUri.",
      diagnostics: ["Photos Picker session response did not include pickerUri."],
    });
  }

  return {
    id: normalized.id,
    pickerUri: normalized.pickerUri,
    mediaItemsSet: normalized.mediaItemsSet,
    pollingTiming: normalized.pollingTiming,
    diagnostics: normalized.diagnostics,
  };
}

export function normalizePickingSessionSnapshotResponse(
  responseBody: unknown,
): PhotosPickerSessionSnapshot {
  return normalizePickingSessionResponse(responseBody, {
    requirePickerUri: false,
  });
}

export function normalizePickedMediaItemsResponse(
  responseBody: unknown,
): PhotosPickedMediaItemsList {
  if (!isRecord(responseBody)) {
    throw new PhotosPickerSelectionError({
      status: "error",
      message: "Picked media items response was not an object.",
      diagnostics: ["Picked media items response was not an object."],
    });
  }

  const rawMediaItems = responseBody.mediaItems;
  const rawNextPageToken = responseBody.nextPageToken;

  if (rawMediaItems !== undefined && !Array.isArray(rawMediaItems)) {
    throw new PhotosPickerSelectionError({
      status: "error",
      message: "Picked media items response mediaItems was not an array.",
      diagnostics: ["Picked media items response mediaItems was not an array."],
    });
  }

  if (
    rawNextPageToken !== undefined &&
    typeof rawNextPageToken !== "string"
  ) {
    throw new PhotosPickerSelectionError({
      status: "error",
      message: "Picked media items response nextPageToken was not a string.",
      diagnostics: [
        "Picked media items response nextPageToken was not a string.",
      ],
    });
  }

  return {
    mediaItems: rawMediaItems ?? [],
    nextPageToken: readNonEmptyString(rawNextPageToken),
    diagnostics: [],
  };
}

export function normalizePickedMediaItem(
  mediaItem: unknown,
): PhotosPickedMediaItem {
  const diagnostics: string[] = [];

  if (!isRecord(mediaItem)) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Picked media item was not an object.",
      diagnostics: [
        "Picked media item was not an object.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  const id = readNonEmptyString(mediaItem.id);

  if (!id) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Picked media item did not include id.",
      diagnostics: [
        "Picked media item did not include id.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  if (mediaItem.type !== "PHOTO") {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Picked media item type was not PHOTO.",
      diagnostics: [
        `Picked media item type was ${formatDiagnosticValue(mediaItem.type)}.`,
        "第4-3初期実装では静止画像だけ対応しています。",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  if (!isRecord(mediaItem.mediaFile)) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Picked media item did not include mediaFile.",
      diagnostics: [
        "Picked media item did not include mediaFile.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  const baseUrl = readNonEmptyString(mediaItem.mediaFile.baseUrl);
  const mimeType = readNonEmptyString(mediaItem.mediaFile.mimeType);
  const filename = readNonEmptyString(mediaItem.mediaFile.filename);

  if (!baseUrl) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Picked media item mediaFile did not include baseUrl.",
      diagnostics: [
        "Picked media item mediaFile did not include baseUrl.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  if (!mimeType) {
    throw new PhotosPickerSelectionError({
      status: "invalid",
      message: "Picked media item mediaFile did not include mimeType.",
      diagnostics: [
        "Picked media item mediaFile did not include mimeType.",
        "Drive保存: 未実行",
        "manifest反映: 未実行",
      ],
    });
  }

  const createTime = normalizeOptionalCreateTime(mediaItem.createTime);

  if (mediaItem.createTime === undefined || mediaItem.createTime === null) {
    diagnostics.push("sourceCreateTime は取得できませんでした。");
  } else if (!createTime) {
    diagnostics.push(
      "sourceCreateTime は形式不正のため採用しませんでした。",
    );
  }

  return {
    id,
    type: "PHOTO",
    mediaFile: {
      baseUrl,
      mimeType,
      filename,
    },
    createTime,
    diagnostics,
  };
}

export function normalizeContentType(contentType: string | null) {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isPhotosDownloadedAssetMimeType(
  contentType: string,
): contentType is PhotosDownloadedAssetMimeType {
  return allowedDownloadedAssetMimeTypes.has(
    contentType as PhotosDownloadedAssetMimeType,
  );
}

export function parseGoogleDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d+)(?:\.(\d{1,9}))?s$/.exec(value);

  if (!match) {
    return null;
  }

  const wholeSeconds = Number(match[1]);
  const fractionalSeconds = match[2] ? Number(`0.${match[2]}`) : 0;
  const totalSeconds = wholeSeconds + fractionalSeconds;

  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return null;
  }

  return totalSeconds;
}

export function resolvePollingTiming(
  pollingConfig: unknown,
): PhotosPickerResolvedPollingTiming {
  const diagnostics: string[] = [];
  const config = isRecord(pollingConfig) ? pollingConfig : null;

  if (!config) {
    diagnostics.push("pollingConfig was missing or invalid; fallback was used.");
  }

  const rawPollIntervalSeconds = parseGoogleDurationSeconds(
    config?.pollInterval,
  );
  const rawTimeoutInSeconds = parseGoogleDurationSeconds(config?.timeoutIn);

  if (rawPollIntervalSeconds === null) {
    diagnostics.push("pollingConfig.pollInterval was invalid; fallback was used.");
  }

  if (rawTimeoutInSeconds === null) {
    diagnostics.push("pollingConfig.timeoutIn was invalid; fallback was used.");
  }

  const pollIntervalSeconds = Math.max(
    rawPollIntervalSeconds ?? PHOTOS_PICKER_DEFAULT_POLL_INTERVAL_SECONDS,
    PHOTOS_PICKER_MIN_POLL_INTERVAL_SECONDS,
  );

  const timeoutInSeconds = Math.min(
    rawTimeoutInSeconds ?? PHOTOS_PICKER_DEFAULT_TIMEOUT_SECONDS,
    PHOTOS_PICKER_MAX_APP_WAIT_SECONDS,
  );

  return {
    pollIntervalSeconds,
    timeoutInSeconds,
    diagnostics,
  };
}

function normalizePickingSessionResponse(
  responseBody: unknown,
  options: {
    requirePickerUri: boolean;
  },
): PhotosPickerSessionSnapshot {
  if (!isRecord(responseBody)) {
    throw new PhotosPickerSelectionError({
      status: "error",
      message: "Photos Picker session response was not an object.",
      diagnostics: ["Photos Picker session response was not an object."],
    });
  }

  const id = readNonEmptyString(responseBody.id);
  const pickerUri = readNonEmptyString(responseBody.pickerUri);
  const mediaItemsSet =
    typeof responseBody.mediaItemsSet === "boolean"
      ? responseBody.mediaItemsSet
      : false;
  const diagnostics: string[] = [];

  if (!id) {
    throw new PhotosPickerSelectionError({
      status: "error",
      message: "Photos Picker session response did not include id.",
      diagnostics: ["Photos Picker session response did not include id."],
    });
  }

  if (options.requirePickerUri && !pickerUri) {
    throw new PhotosPickerSelectionError({
      status: "error",
      message: "Photos Picker session response did not include pickerUri.",
      diagnostics: ["Photos Picker session response did not include pickerUri."],
    });
  }

  if (typeof responseBody.mediaItemsSet !== "boolean") {
    diagnostics.push(
      "Photos Picker session response mediaItemsSet was missing or invalid; false was used.",
    );
  }

  const pollingTiming = resolvePollingTiming(responseBody.pollingConfig);

  return {
    id,
    pickerUri,
    mediaItemsSet,
    pollingTiming,
    diagnostics: [...diagnostics, ...pollingTiming.diagnostics],
  };
}

function buildPickedPhotoDownloadUrl(baseUrl: string) {
  return `${baseUrl}${PICKED_PHOTO_SIZE_SUFFIX}`;
}

function parseContentLengthBytes(contentLength: string | null) {
  if (contentLength === null) {
    return null;
  }

  if (!/^\d+$/.test(contentLength)) {
    return "invalid" as const;
  }

  const parsed = Number(contentLength);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return "invalid" as const;
  }

  return parsed;
}

function normalizeOptionalCreateTime(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  if (!isRfc3339UtcTimestamp(value)) {
    return null;
  }

  return value;
}

function isRfc3339UtcTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(
    value,
  );
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDiagnosticValue(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (value === undefined) {
    return "undefined";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}
