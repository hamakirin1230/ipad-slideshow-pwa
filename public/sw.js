const APP_CACHE_NAME = "ipad-slideshow-pwa-app-shell-v1";
const DRIVE_VIDEO_STREAM_PATH_PREFIX = "/__drive-video-stream/";
const DRIVE_VIDEO_SESSION_MAX_TTL_MS = 45 * 60 * 1000;
const DRIVE_VIDEO_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const DRIVE_API_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_VIDEO_CONTENT_RANGE_SOURCE_HEADER =
  "X-Drive-Video-Content-Range-Source";
const DRIVE_VIDEO_ACCEPT_RANGES_SOURCE_HEADER =
  "X-Drive-Video-Accept-Ranges-Source";
const driveVideoSessions = new Map();

const APP_SHELL_URLS = [
  "/",
  "/settings/",
  "/admin/",
  "/player/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

function isSameOriginGetRequest(request) {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);
  return url.origin === self.location.origin;
}

function nowMs() {
  return Date.now();
}

function postMessageAck(event, payload) {
  const port = event.ports && event.ports[0];

  if (!port) {
    return;
  }

  port.postMessage(payload);
}

function normalizeFutureExpiry(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const latestAllowedExpiry = nowMs() + DRIVE_VIDEO_SESSION_MAX_TTL_MS;
  return Math.min(value, latestAllowedExpiry);
}

function normalizeDriveVideoFileSize(value) {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > DRIVE_VIDEO_MAX_FILE_SIZE_BYTES
  ) {
    return null;
  }

  return value;
}

function registerDriveVideoSession(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const {
    sessionId,
    assetFileId,
    accessToken,
    mimeType,
    fileSize,
    expiresAt,
  } = payload;
  const normalizedExpiresAt = normalizeFutureExpiry(expiresAt);
  const normalizedFileSize = normalizeDriveVideoFileSize(fileSize);

  if (
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    typeof assetFileId !== "string" ||
    assetFileId.length === 0 ||
    typeof accessToken !== "string" ||
    accessToken.length === 0 ||
    mimeType !== "video/mp4" ||
    normalizedFileSize === null ||
    normalizedExpiresAt === null ||
    normalizedExpiresAt <= nowMs()
  ) {
    return false;
  }

  driveVideoSessions.set(sessionId, {
    assetFileId,
    accessToken,
    mimeType,
    fileSize: normalizedFileSize,
    expiresAt: normalizedExpiresAt,
  });

  return true;
}

function unregisterDriveVideoSession(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const { sessionId } = payload;

  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return false;
  }

  return driveVideoSessions.delete(sessionId);
}

function clearExpiredDriveVideoSessions() {
  const currentTime = nowMs();

  for (const [sessionId, session] of driveVideoSessions.entries()) {
    if (session.expiresAt <= currentTime) {
      driveVideoSessions.delete(sessionId);
    }
  }
}

function buildSafeStreamErrorResponse(status, message) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function parseSingleByteRange(rangeHeader, fileSize) {
  if (!rangeHeader) {
    return { ok: false, reason: "missing" };
  }

  const normalizedRangeHeader = rangeHeader.trim();

  if (!normalizedRangeHeader.startsWith("bytes=")) {
    return { ok: false, reason: "invalid" };
  }

  const rangeValue = normalizedRangeHeader.slice("bytes=".length).trim();

  if (rangeValue.includes(",")) {
    return { ok: false, reason: "multiRange" };
  }

  const rangeMatch = /^(\d*)-(\d*)$/.exec(rangeValue);

  if (!rangeMatch) {
    return { ok: false, reason: "invalid" };
  }

  const [, rawStart, rawEnd] = rangeMatch;

  if (!rawStart && !rawEnd) {
    return { ok: false, reason: "invalid" };
  }

  if (!rawStart) {
    const suffixLength = Number(rawEnd);

    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { ok: false, reason: "invalid" };
    }

    return {
      ok: true,
      start: Math.max(fileSize - suffixLength, 0),
      requestedEnd: fileSize - 1,
      suffix: true,
    };
  }

  const start = Number(rawStart);

  if (!Number.isSafeInteger(start) || start < 0) {
    return { ok: false, reason: "invalid" };
  }

  const requestedEnd = rawEnd ? Number(rawEnd) : null;

  if (
    requestedEnd !== null &&
    (!Number.isSafeInteger(requestedEnd) || requestedEnd < 0)
  ) {
    return { ok: false, reason: "invalid" };
  }

  if (start >= fileSize || (requestedEnd !== null && start > requestedEnd)) {
    return { ok: false, reason: "unsatisfiable" };
  }

  return {
    ok: true,
    start,
    requestedEnd,
    suffix: false,
  };
}

function parseContentLength(value) {
  if (!value) {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

function buildSynthesizedContentRange(parsedRange, contentLength, fileSize) {
  if (!parsedRange.ok) {
    return null;
  }

  let end;

  if (parsedRange.requestedEnd !== null) {
    end = Math.min(parsedRange.requestedEnd, fileSize - 1);
  } else if (contentLength !== null) {
    end = Math.min(parsedRange.start + contentLength - 1, fileSize - 1);
  } else {
    end = fileSize - 1;
  }

  if (end < parsedRange.start) {
    return null;
  }

  return `bytes ${parsedRange.start}-${end}/${fileSize}`;
}

function buildDriveMediaResponseHeaders(response, request, session) {
  const headers = new Headers();
  const contentLength = response.headers.get("Content-Length");
  const contentRange = response.headers.get("Content-Range");
  const acceptRanges = response.headers.get("Accept-Ranges");
  const parsedRange = parseSingleByteRange(
    request.headers.get("Range"),
    session.fileSize,
  );
  const headerSources = {
    contentRange: "absent",
    acceptRanges: "absent",
  };

  headers.set(
    "Content-Type",
    response.headers.get("Content-Type") || session.mimeType,
  );

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  if (contentRange) {
    headers.set("Content-Range", contentRange);
    headerSources.contentRange = "present";
  } else if (response.status === 206) {
    const synthesizedContentRange = buildSynthesizedContentRange(
      parsedRange,
      parseContentLength(contentLength),
      session.fileSize,
    );

    if (synthesizedContentRange) {
      headers.set("Content-Range", synthesizedContentRange);
      headerSources.contentRange = "synthesized";
    }
  } else if (response.status === 416) {
    headers.set("Content-Range", `bytes */${session.fileSize}`);
    headerSources.contentRange = "synthesized";
  }

  if (acceptRanges) {
    headers.set("Accept-Ranges", acceptRanges);
    headerSources.acceptRanges = "present";
  } else {
    headers.set("Accept-Ranges", "bytes");
    headerSources.acceptRanges = "synthesized";
  }

  headers.set(
    DRIVE_VIDEO_CONTENT_RANGE_SOURCE_HEADER,
    headerSources.contentRange,
  );
  headers.set(
    DRIVE_VIDEO_ACCEPT_RANGES_SOURCE_HEADER,
    headerSources.acceptRanges,
  );
  headers.set("Cache-Control", "no-store");
  return { headers, headerSources };
}

function safeContentTypeLabel(contentType) {
  if (!contentType) {
    return "missing";
  }

  const normalizedContentType =
    contentType.split(";")[0]?.trim().toLowerCase() ?? "";

  return normalizedContentType === "video/mp4" ? "video/mp4" : "other";
}

function buildDriveVideoStreamStatusPayload(input) {
  const contentRange = input.headerSources
    ? input.headerSources.contentRange
    : input.response && input.response.headers.has("Content-Range")
      ? "present"
      : "absent";
  const acceptRanges = input.headerSources
    ? input.headerSources.acceptRanges
    : input.response && input.response.headers.has("Accept-Ranges")
      ? "present"
      : "absent";

  return {
    sessionId: input.sessionId,
    status: input.status,
    rangeRequest: input.request.headers.has("Range"),
    contentType: input.response
      ? safeContentTypeLabel(input.response.headers.get("Content-Type"))
      : "missing",
    contentRange,
    acceptRanges,
    hasContentRange: contentRange !== "absent",
    hasAcceptRanges: acceptRanges !== "absent",
    hasContentLength: input.response
      ? input.response.headers.has("Content-Length")
      : false,
    ...(input.upstreamError ? { upstreamError: input.upstreamError } : {}),
  };
}

function postDriveVideoStreamStatus(payload) {
  self.clients.matchAll({ type: "window" }).then((clients) => {
    for (const client of clients) {
      client.postMessage({
        type: "DRIVE_VIDEO_STREAM_STATUS",
        payload,
      });
    }
  });
}

async function handleDriveVideoStreamRequest(request, url) {
  if (request.method !== "GET") {
    return buildSafeStreamErrorResponse(405, "video stream method not allowed");
  }

  clearExpiredDriveVideoSessions();

  const sessionId = decodeURIComponent(
    url.pathname.slice(DRIVE_VIDEO_STREAM_PATH_PREFIX.length),
  );
  const session = driveVideoSessions.get(sessionId);

  if (!session) {
    postDriveVideoStreamStatus(
      buildDriveVideoStreamStatusPayload({
        sessionId,
        status: 404,
        request,
      }),
    );
    return buildSafeStreamErrorResponse(404, "video stream session not found");
  }

  if (session.expiresAt <= nowMs()) {
    driveVideoSessions.delete(sessionId);
    postDriveVideoStreamStatus(
      buildDriveVideoStreamStatusPayload({
        sessionId,
        status: 401,
        request,
      }),
    );
    return buildSafeStreamErrorResponse(401, "video stream session expired");
  }

  const headers = new Headers({
    Authorization: `Bearer ${session.accessToken}`,
  });
  const range = request.headers.get("Range");

  if (range) {
    headers.set("Range", range);
  }

  const parsedRange = parseSingleByteRange(range, session.fileSize);

  if (parsedRange.reason === "multiRange" || parsedRange.reason === "invalid") {
    return buildSafeStreamErrorResponse(416, "video stream range not satisfiable");
  }

  let response;

  try {
    response = await fetch(
      `${DRIVE_API_FILES_URL}/${encodeURIComponent(session.assetFileId)}?alt=media`,
      {
        method: "GET",
        headers,
        cache: "no-store",
        credentials: "omit",
      },
    );
  } catch {
    postDriveVideoStreamStatus(
      buildDriveVideoStreamStatusPayload({
        sessionId,
        status: 502,
        request,
        upstreamError: "fetchFailed",
      }),
    );
    return buildSafeStreamErrorResponse(
      502,
      "video stream upstream fetch failed",
    );
  }

  if (![200, 206, 403, 404, 416].includes(response.status)) {
    postDriveVideoStreamStatus(
      buildDriveVideoStreamStatusPayload({
        sessionId,
        status: response.status,
        request,
        response,
      }),
    );
    return buildSafeStreamErrorResponse(
      response.status,
      "video stream upstream response was not playable",
    );
  }

  if (![200, 206, 416].includes(response.status)) {
    postDriveVideoStreamStatus(
      buildDriveVideoStreamStatusPayload({
        sessionId,
        status: response.status,
        request,
        response,
      }),
    );
    return buildSafeStreamErrorResponse(
      response.status,
      "video stream upstream access failed",
    );
  }

  const { headers: responseHeaders, headerSources } =
    buildDriveMediaResponseHeaders(response, request, session);

  postDriveVideoStreamStatus(
    buildDriveVideoStreamStatusPayload({
      sessionId,
      status: response.status,
      request,
      response,
      headerSources,
    }),
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

self.addEventListener("message", (event) => {
  const message = event.data;

  if (!message || typeof message !== "object") {
    postMessageAck(event, { ok: false });
    return;
  }

  switch (message.type) {
    case "REGISTER_DRIVE_VIDEO_SESSION":
      postMessageAck(event, {
        ok: registerDriveVideoSession(message.payload),
      });
      return;
    case "UNREGISTER_DRIVE_VIDEO_SESSION":
      postMessageAck(event, {
        ok: unregisterDriveVideoSession(message.payload),
      });
      return;
    case "CLEAR_DRIVE_VIDEO_SESSIONS":
      driveVideoSessions.clear();
      postMessageAck(event, { ok: true });
      return;
    default:
      postMessageAck(event, { ok: false });
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== APP_CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith(DRIVE_VIDEO_STREAM_PATH_PREFIX)
  ) {
    event.respondWith(handleDriveVideoStreamRequest(request, url));
    return;
  }

  if (!isSameOriginGetRequest(request)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) =>
          caches.open(APP_CACHE_NAME).then((cache) => {
            cache.put(request, response.clone());
            return response;
          }),
        )
        .catch(() =>
          caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }

            return caches.match(url.pathname).then((pathCachedResponse) => {
              if (pathCachedResponse) {
                return pathCachedResponse;
              }

              return caches.match("/player/");
            });
          }),
        ),
    );

    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((response) => {
          if (!response.ok) {
            return response;
          }

          return caches.open(APP_CACHE_NAME).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      }),
    );
  }
});
