const APP_CACHE_NAME = "ipad-slideshow-pwa-app-shell-v1";
const DRIVE_VIDEO_STREAM_PATH_PREFIX = "/__drive-video-stream/";
const DRIVE_VIDEO_SESSION_MAX_TTL_MS = 45 * 60 * 1000;
const DRIVE_API_FILES_URL = "https://www.googleapis.com/drive/v3/files";
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

function registerDriveVideoSession(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const {
    sessionId,
    assetFileId,
    accessToken,
    mimeType,
    expiresAt,
  } = payload;
  const normalizedExpiresAt = normalizeFutureExpiry(expiresAt);

  if (
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    typeof assetFileId !== "string" ||
    assetFileId.length === 0 ||
    typeof accessToken !== "string" ||
    accessToken.length === 0 ||
    mimeType !== "video/mp4" ||
    normalizedExpiresAt === null ||
    normalizedExpiresAt <= nowMs()
  ) {
    return false;
  }

  driveVideoSessions.set(sessionId, {
    assetFileId,
    accessToken,
    mimeType,
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

function buildDriveMediaResponseHeaders(response) {
  const headers = new Headers();

  for (const headerName of [
    "Content-Type",
    "Content-Length",
    "Content-Range",
    "Accept-Ranges",
  ]) {
    const value = response.headers.get(headerName);

    if (value) {
      headers.set(headerName, value);
    }
  }

  headers.set("Cache-Control", "no-store");
  return headers;
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
  return {
    sessionId: input.sessionId,
    status: input.status,
    rangeRequest: input.request.headers.has("Range"),
    contentType: input.response
      ? safeContentTypeLabel(input.response.headers.get("Content-Type"))
      : "missing",
    hasContentRange: input.response
      ? input.response.headers.has("Content-Range")
      : false,
    hasAcceptRanges: input.response
      ? input.response.headers.has("Accept-Ranges")
      : false,
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

  postDriveVideoStreamStatus(
    buildDriveVideoStreamStatusPayload({
      sessionId,
      status: response.status,
      request,
      response,
    }),
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: buildDriveMediaResponseHeaders(response),
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
