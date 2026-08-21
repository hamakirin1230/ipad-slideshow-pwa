import {
  DRIVE_FILE_SCOPE,
  type GoogleTokenResponse,
} from "../google-auth";

export const GOOGLE_SESSION_CREATE_PATH = "/api/google-session/create/";
export const GOOGLE_SESSION_RESTORE_PATH = "/api/google-session/restore/";
export const GOOGLE_SESSION_DELETE_PATH = "/api/google-session/delete/";

const SESSION_FETCH_INIT = {
  method: "POST" as const,
  credentials: "same-origin" as const,
  cache: "no-store" as const,
};

export type GoogleSessionClientController = {
  invalidate(): void;
  dispose(): void;
  restoreOnPageLoad(): Promise<void>;
  persistAfterManualConnect(tokenResponse: GoogleTokenResponse): Promise<void>;
  deleteAfterLocalDisconnect(): void;
};

export function createGoogleSessionClientController(input: {
  fetch?: typeof fetch;
  onRestored: (accessToken: string) => void;
  onCreateFailed?: () => void;
}): GoogleSessionClientController {
  const fetchImpl = input.fetch ?? fetch;
  let epoch = 0;
  let pendingRestoreAbort: AbortController | null = null;
  let pendingCreateAbort: AbortController | null = null;
  let pendingDeleteAbort: AbortController | null = null;

  function currentEpoch() {
    return epoch;
  }

  function abortPendingRestore() {
    pendingRestoreAbort?.abort();
    pendingRestoreAbort = null;
  }

  function abortPendingCreate() {
    pendingCreateAbort?.abort();
    pendingCreateAbort = null;
  }

  function abortPendingDelete() {
    pendingDeleteAbort?.abort();
    pendingDeleteAbort = null;
  }

  function invalidate() {
    epoch += 1;
    abortPendingRestore();
    abortPendingCreate();
    abortPendingDelete();
  }

  function dispose() {
    epoch += 1;
    abortPendingRestore();
    abortPendingCreate();
  }

  async function restoreOnPageLoad() {
    abortPendingRestore();
    const restoreAbort = new AbortController();
    pendingRestoreAbort = restoreAbort;
    const startedEpoch = currentEpoch();
    const result = await postRestore(fetchImpl, restoreAbort.signal);
    if (pendingRestoreAbort === restoreAbort) {
      pendingRestoreAbort = null;
    }
    if (
      restoreAbort.signal.aborted ||
      startedEpoch !== currentEpoch()
    ) {
      return;
    }
    if (result.kind === "restored") {
      input.onRestored(result.accessToken);
    }
  }

  async function persistAfterManualConnect(
    tokenResponse: GoogleTokenResponse,
  ) {
    abortPendingCreate();
    const createAbort = new AbortController();
    pendingCreateAbort = createAbort;
    const startedEpoch = currentEpoch();
    const outcome = await postCreate(
      fetchImpl,
      tokenResponse,
      createAbort.signal,
    );
    if (pendingCreateAbort === createAbort) {
      pendingCreateAbort = null;
    }
    if (startedEpoch !== currentEpoch()) {
      return;
    }
    if (outcome === "aborted") {
      return;
    }
    if (outcome === "failed") {
      input.onCreateFailed?.();
    }
  }

  function deleteAfterLocalDisconnect() {
    abortPendingDelete();
    const deleteAbort = new AbortController();
    pendingDeleteAbort = deleteAbort;
    void postDelete(fetchImpl, deleteAbort.signal).finally(() => {
      if (pendingDeleteAbort === deleteAbort) {
        pendingDeleteAbort = null;
      }
    });
  }

  return {
    invalidate,
    dispose,
    restoreOnPageLoad,
    persistAfterManualConnect,
    deleteAfterLocalDisconnect,
  };
}

async function postRestore(
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<
  | { kind: "restored"; accessToken: string; expiresAtMs: number }
  | { kind: "notConnected" }
> {
  try {
    const response = await fetchImpl(GOOGLE_SESSION_RESTORE_PATH, {
      ...SESSION_FETCH_INIT,
      signal,
    });
    if (signal.aborted) {
      return { kind: "notConnected" };
    }
    const payload: unknown = await response.json();
    return parseRestorePayload(payload);
  } catch {
    return { kind: "notConnected" };
  }
}

async function postCreate(
  fetchImpl: typeof fetch,
  tokenResponse: GoogleTokenResponse,
  signal: AbortSignal,
): Promise<"created" | "failed" | "aborted"> {
  const body = createSessionRequestBody(tokenResponse);
  if (body === null) {
    return signal.aborted ? "aborted" : "failed";
  }

  try {
    const response = await fetchImpl(GOOGLE_SESSION_CREATE_PATH, {
      ...SESSION_FETCH_INIT,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (signal.aborted) {
      return "aborted";
    }
    if (!response.ok) {
      return "failed";
    }
    const payload: unknown = await response.json();
    if (signal.aborted) {
      return "aborted";
    }
    return isCreatedPayload(payload) ? "created" : "failed";
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      return "aborted";
    }
    return "failed";
  }
}

async function postDelete(fetchImpl: typeof fetch, signal: AbortSignal) {
  try {
    await fetchImpl(GOOGLE_SESSION_DELETE_PATH, {
      ...SESSION_FETCH_INIT,
      signal,
    });
  } catch {
    return;
  }
}

function createSessionRequestBody(tokenResponse: GoogleTokenResponse) {
  const accessToken = tokenResponse.access_token;
  const expiresInSeconds = tokenResponse.expires_in;
  const scope =
    typeof tokenResponse.scope === "string" && tokenResponse.scope.trim() !== ""
      ? tokenResponse.scope
      : DRIVE_FILE_SCOPE;

  if (
    typeof accessToken !== "string" ||
    accessToken.trim() === "" ||
    typeof expiresInSeconds !== "number" ||
    !Number.isFinite(expiresInSeconds) ||
    includesRejectedPhotosScope(scope)
  ) {
    return null;
  }

  return {
    accessToken,
    expiresInSeconds,
    scope,
  };
}

function parseRestorePayload(payload: unknown):
  | { kind: "restored"; accessToken: string; expiresAtMs: number }
  | { kind: "notConnected" } {
  if (!isPlainObject(payload)) {
    return { kind: "notConnected" };
  }
  if (payload.kind === "restored") {
    if (
      typeof payload.accessToken === "string" &&
      payload.accessToken.trim() !== "" &&
      typeof payload.expiresAtMs === "number" &&
      Number.isFinite(payload.expiresAtMs)
    ) {
      return {
        kind: "restored",
        accessToken: payload.accessToken,
        expiresAtMs: payload.expiresAtMs,
      };
    }
    return { kind: "notConnected" };
  }
  return { kind: "notConnected" };
}

function isCreatedPayload(payload: unknown) {
  return isPlainObject(payload) && payload.kind === "created";
}

function includesRejectedPhotosScope(scope: string) {
  return scope.includes("photoslibrary") || scope.includes("photospicker");
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
