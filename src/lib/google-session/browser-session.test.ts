import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DRIVE_FILE_SCOPE } from "../google-auth";
import {
  createGoogleSessionClientController,
  GOOGLE_SESSION_CREATE_PATH,
  GOOGLE_SESSION_DELETE_PATH,
  GOOGLE_SESSION_RESTORE_PATH,
} from "./browser-session";

const source = readFileSync(
  new URL("./browser-session.ts", import.meta.url),
  "utf8",
);

const RESTORED_TOKEN = "ya29.restored-drive-token";
const MANUAL_TOKEN = "ya29.manual-drive-token";
const TOKEN_B = "ya29.manual-connect-b";
const PHOTOS_SCOPE =
  "https://www.googleapis.com/auth/photoslibrary.appendonly";

describe("google session browser client", () => {
  it("restores notConnected without calling GIS or storing a token", async () => {
    const { controller, accessToken, status, fetchMock, gisCalls } =
      createHarness();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ kind: "notConnected" }),
    );

    await controller.restoreOnPageLoad();

    expect(accessToken.current).toBeNull();
    expect(status.current).toBe("disconnected");
    expect(gisCalls).toHaveLength(0);
    expect(fetchUrls(fetchMock)).toEqual([GOOGLE_SESSION_RESTORE_PATH]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeDefined();
    expect(
      ((fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal)
        .aborted,
    ).toBe(false);
  });

  it("stores a restored token in the ref-like holder without GIS", async () => {
    const {
      controller,
      accessToken,
      status,
      driveFileGranted,
      fetchMock,
      gisCalls,
    } = createHarness();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        kind: "restored",
        accessToken: RESTORED_TOKEN,
        expiresAtMs: 1_700_000_000_000,
      }),
    );

    await controller.restoreOnPageLoad();

    expect(accessToken.current).toBe(RESTORED_TOKEN);
    expect(status.current).toBe("connected");
    expect(driveFileGranted.current).toBe(true);
    expect(gisCalls).toHaveLength(0);
    expect(fetchUrls(fetchMock)).toEqual([GOOGLE_SESSION_RESTORE_PATH]);
  });

  it("does not let a late restore overwrite a manual connect token", async () => {
    const accessToken = { current: null as string | null };
    const status = { current: "disconnected" as "disconnected" | "connected" };
    const restore = deferred<Response>();
    const restoreSignals: AbortSignal[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === GOOGLE_SESSION_RESTORE_PATH) {
          if (init?.signal) {
            restoreSignals.push(init.signal);
          }
          return restore.promise;
        }
        return jsonResponse({ kind: "created", expiresAtMs: 1 });
      },
    );
    const controller = createGoogleSessionClientController({
      fetch: fetchMock as typeof fetch,
      onRestored(token) {
        accessToken.current = token;
        status.current = "connected";
      },
    });

    const restoreDone = controller.restoreOnPageLoad();
    controller.invalidate();
    accessToken.current = MANUAL_TOKEN;
    status.current = "connected";
    restore.resolve(
      jsonResponse({
        kind: "restored",
        accessToken: RESTORED_TOKEN,
        expiresAtMs: 1_700_000_000_000,
      }),
    );
    await restoreDone;

    expect(restoreSignals[0]?.aborted).toBe(true);
    expect(accessToken.current).toBe(MANUAL_TOKEN);
    expect(status.current).toBe("connected");
  });

  it("does not let a late restore revive a disconnected session", async () => {
    const accessToken = { current: null as string | null };
    const status = { current: "disconnected" as "disconnected" | "connected" };
    const restore = deferred<Response>();
    const restoreSignals: AbortSignal[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === GOOGLE_SESSION_RESTORE_PATH) {
          if (init?.signal) {
            restoreSignals.push(init.signal);
          }
          return restore.promise;
        }
        return jsonResponse({ kind: "disconnected" });
      },
    );
    const controller = createGoogleSessionClientController({
      fetch: fetchMock as typeof fetch,
      onRestored(token) {
        accessToken.current = token;
        status.current = "connected";
      },
    });

    const restoreDone = controller.restoreOnPageLoad();
    controller.invalidate();
    accessToken.current = null;
    status.current = "disconnected";
    restore.resolve(
      jsonResponse({
        kind: "restored",
        accessToken: RESTORED_TOKEN,
        expiresAtMs: 1_700_000_000_000,
      }),
    );
    await restoreDone;

    expect(restoreSignals[0]?.aborted).toBe(true);
    expect(accessToken.current).toBeNull();
    expect(status.current).toBe("disconnected");
  });

  it("aborts a stale restore before create so a late notConnected cannot change B", async () => {
    const createFailed = vi.fn();
    const accessToken = { current: null as string | null };
    const status = { current: "disconnected" as "disconnected" | "connected" };
    const restoreA = deferred<Response>();
    const restoreSignals: AbortSignal[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === GOOGLE_SESSION_RESTORE_PATH) {
          if (init?.signal) {
            restoreSignals.push(init.signal);
          }
          return restoreA.promise;
        }
        return jsonResponse({ kind: "created", expiresAtMs: 1 });
      },
    );
    const controller = createGoogleSessionClientController({
      fetch: fetchMock as typeof fetch,
      onRestored(token) {
        accessToken.current = token;
        status.current = "connected";
      },
      onCreateFailed: createFailed,
    });

    const restoreDone = controller.restoreOnPageLoad();
    await Promise.resolve();

    controller.invalidate();
    accessToken.current = TOKEN_B;
    status.current = "connected";
    const persistB = controller.persistAfterManualConnect({
      access_token: TOKEN_B,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });

    expect(restoreSignals[0]?.aborted).toBe(true);
    restoreA.resolve(jsonResponse({ kind: "notConnected" }));
    await restoreDone;
    await persistB;

    expect(accessToken.current).toBe(TOKEN_B);
    expect(status.current).toBe("connected");
    expect(createFailed).not.toHaveBeenCalled();
    expect(fetchUrls(fetchMock)).toEqual([
      GOOGLE_SESSION_RESTORE_PATH,
      GOOGLE_SESSION_CREATE_PATH,
    ]);
  });

  it("keeps memory connected after a successful session create", async () => {
    const { controller, accessToken, status, fetchMock } = createHarness();
    accessToken.current = MANUAL_TOKEN;
    status.current = "connected";
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ kind: "created", expiresAtMs: 1_700_000_000_000 }),
    );

    await controller.persistAfterManualConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });

    expect(accessToken.current).toBe(MANUAL_TOKEN);
    expect(status.current).toBe("connected");
    expect(fetchUrls(fetchMock)).toEqual([GOOGLE_SESSION_CREATE_PATH]);
    const createInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(createInit).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(JSON.parse(String(createInit.body))).toEqual({
      accessToken: MANUAL_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
    });
  });

  it("keeps memory connected when session create fails and does not retry", async () => {
    const createFailed = vi.fn();
    const { controller, accessToken, status, fetchMock } = createHarness({
      onCreateFailed: createFailed,
    });
    accessToken.current = MANUAL_TOKEN;
    status.current = "connected";
    fetchMock.mockResolvedValueOnce(jsonResponse({ kind: "unavailable" }, 503));

    await controller.persistAfterManualConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });

    expect(accessToken.current).toBe(MANUAL_TOKEN);
    expect(status.current).toBe("connected");
    expect(createFailed).toHaveBeenCalledTimes(1);
    expect(fetchUrls(fetchMock)).toEqual([GOOGLE_SESSION_CREATE_PATH]);
  });

  it("clears memory first, sends one delete, and does not abort that delete", async () => {
    const { controller, accessToken, status, fetchMock } = createHarness();
    accessToken.current = MANUAL_TOKEN;
    status.current = "connected";
    const deleteSignals: AbortSignal[] = [];
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === GOOGLE_SESSION_DELETE_PATH) {
          if (init?.signal) {
            deleteSignals.push(init.signal);
          }
          return jsonResponse({ kind: "disconnected" });
        }
        return jsonResponse({ kind: "unavailable" }, 503);
      },
    );

    controller.invalidate();
    accessToken.current = null;
    status.current = "disconnected";
    controller.deleteAfterLocalDisconnect();
    await Promise.resolve();

    expect(accessToken.current).toBeNull();
    expect(status.current).toBe("disconnected");
    expect(deleteSignals).toHaveLength(1);
    expect(deleteSignals[0]?.aborted).toBe(false);
    expect(fetchUrls(fetchMock)).toEqual([GOOGLE_SESSION_DELETE_PATH]);
  });

  it("clears memory first and still disconnects when delete fails without retry", async () => {
    const { controller, accessToken, status, fetchMock } = createHarness();
    accessToken.current = MANUAL_TOKEN;
    status.current = "connected";
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    controller.invalidate();
    accessToken.current = null;
    status.current = "disconnected";
    controller.deleteAfterLocalDisconnect();
    await Promise.resolve();

    expect(accessToken.current).toBeNull();
    expect(status.current).toBe("disconnected");
    expect(fetchUrls(fetchMock)).toEqual([GOOGLE_SESSION_DELETE_PATH]);
  });

  it("aborts pending restore, create, and prior delete on Drive 401/403 without GIS", async () => {
    const createFailed = vi.fn();
    const { controller, accessToken, status, fetchMock, gisCalls } =
      createHarness({ onCreateFailed: createFailed });
    const restorePending = deferred<Response>();
    const createPending = deferred<Response>();
    const priorDelete = deferred<Response>();
    const restoreSignals: AbortSignal[] = [];
    const createSignals: AbortSignal[] = [];
    const deleteSignals: AbortSignal[] = [];
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === GOOGLE_SESSION_RESTORE_PATH) {
          if (init?.signal) {
            restoreSignals.push(init.signal);
          }
          return restorePending.promise;
        }
        if (url === GOOGLE_SESSION_CREATE_PATH) {
          if (init?.signal) {
            createSignals.push(init.signal);
          }
          return createPending.promise;
        }
        if (init?.signal) {
          deleteSignals.push(init.signal);
        }
        if (deleteSignals.length === 1) {
          return priorDelete.promise;
        }
        return jsonResponse({ kind: "disconnected" });
      },
    );

    const restoreDone = controller.restoreOnPageLoad();
    accessToken.current = MANUAL_TOKEN;
    status.current = "connected";
    const persistDone = controller.persistAfterManualConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });
    controller.deleteAfterLocalDisconnect();
    await Promise.resolve();

    controller.invalidate();
    accessToken.current = null;
    status.current = "disconnected";
    controller.deleteAfterLocalDisconnect();
    await Promise.resolve();

    expect(restoreSignals[0]?.aborted).toBe(true);
    expect(createSignals[0]?.aborted).toBe(true);
    expect(deleteSignals[0]?.aborted).toBe(true);
    expect(deleteSignals[1]?.aborted).toBe(false);
    expect(gisCalls).toHaveLength(0);

    restorePending.resolve(jsonResponse({ kind: "notConnected" }));
    createPending.resolve(jsonResponse({ kind: "created", expiresAtMs: 1 }));
    priorDelete.resolve(jsonResponse({ kind: "disconnected" }));
    await restoreDone;
    await persistDone;

    expect(accessToken.current).toBeNull();
    expect(status.current).toBe("disconnected");
    expect(createFailed).not.toHaveBeenCalled();
    expect(fetchUrls(fetchMock)).toEqual([
      GOOGLE_SESSION_RESTORE_PATH,
      GOOGLE_SESSION_CREATE_PATH,
      GOOGLE_SESSION_DELETE_PATH,
      GOOGLE_SESSION_DELETE_PATH,
    ]);
  });

  it("aborts pending create A when a newer manual connect B starts", async () => {
    const createFailed = vi.fn();
    const tokenA = "ya29.manual-connect-a";
    const accessToken = { current: tokenA as string | null };
    const status = { current: "connected" as "disconnected" | "connected" };
    const createA = deferred<Response>();
    const createSignals: AbortSignal[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === GOOGLE_SESSION_CREATE_PATH) {
          if (init?.signal) {
            createSignals.push(init.signal);
          }
          if (createSignals.length === 1) {
            return createA.promise;
          }
          return jsonResponse({ kind: "created", expiresAtMs: 1 });
        }
        return jsonResponse({ kind: "disconnected" });
      },
    );
    const controller = createGoogleSessionClientController({
      fetch: fetchMock as typeof fetch,
      onRestored() {
        return;
      },
      onCreateFailed: createFailed,
    });

    const persistA = controller.persistAfterManualConnect({
      access_token: tokenA,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });
    await Promise.resolve();

    controller.invalidate();
    accessToken.current = TOKEN_B;
    status.current = "connected";
    const persistB = controller.persistAfterManualConnect({
      access_token: TOKEN_B,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });

    expect(createSignals[0]?.aborted).toBe(true);
    createA.resolve(jsonResponse({ kind: "created", expiresAtMs: 1 }));
    await persistA;
    await persistB;

    expect(accessToken.current).toBe(TOKEN_B);
    expect(status.current).toBe("connected");
    expect(createFailed).not.toHaveBeenCalled();
    expect(
      fetchUrls(fetchMock).filter((url) => url === GOOGLE_SESSION_CREATE_PATH),
    ).toHaveLength(2);
  });

  it("aborts pending create on disconnect and ignores a late create result", async () => {
    const createFailed = vi.fn();
    const { controller, accessToken, status, fetchMock } = createHarness({
      onCreateFailed: createFailed,
    });
    accessToken.current = MANUAL_TOKEN;
    status.current = "connected";
    const createPending = deferred<Response>();
    const createSignals: AbortSignal[] = [];
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === GOOGLE_SESSION_CREATE_PATH) {
          if (init?.signal) {
            createSignals.push(init.signal);
          }
          return createPending.promise;
        }
        return jsonResponse({ kind: "disconnected" });
      },
    );

    const persistDone = controller.persistAfterManualConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });
    await Promise.resolve();

    controller.invalidate();
    accessToken.current = null;
    status.current = "disconnected";
    controller.deleteAfterLocalDisconnect();
    await Promise.resolve();

    expect(createSignals[0]?.aborted).toBe(true);
    createPending.resolve(
      jsonResponse({ kind: "created", expiresAtMs: 1_700_000_000_000 }),
    );
    await persistDone;

    expect(accessToken.current).toBeNull();
    expect(status.current).toBe("disconnected");
    expect(createFailed).not.toHaveBeenCalled();
    expect(fetchUrls(fetchMock)).toEqual([
      GOOGLE_SESSION_CREATE_PATH,
      GOOGLE_SESSION_DELETE_PATH,
    ]);
  });

  it("aborts a pending delete when a newer manual connect starts", async () => {
    const createFailed = vi.fn();
    const { controller, accessToken, status, fetchMock } = createHarness({
      onCreateFailed: createFailed,
    });
    accessToken.current = MANUAL_TOKEN;
    status.current = "connected";
    const deleteA = deferred<Response>();
    const deleteSignals: AbortSignal[] = [];
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === GOOGLE_SESSION_DELETE_PATH) {
          if (init?.signal) {
            deleteSignals.push(init.signal);
          }
          return deleteA.promise;
        }
        return jsonResponse({ kind: "created", expiresAtMs: 1 });
      },
    );

    controller.invalidate();
    accessToken.current = null;
    status.current = "disconnected";
    controller.deleteAfterLocalDisconnect();
    await Promise.resolve();

    controller.invalidate();
    accessToken.current = TOKEN_B;
    status.current = "connected";
    const persistB = controller.persistAfterManualConnect({
      access_token: TOKEN_B,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });

    expect(deleteSignals[0]?.aborted).toBe(true);
    deleteA.resolve(jsonResponse({ kind: "disconnected" }));
    await persistB;

    expect(accessToken.current).toBe(TOKEN_B);
    expect(status.current).toBe("connected");
    expect(createFailed).not.toHaveBeenCalled();
    expect(fetchUrls(fetchMock)).toEqual([
      GOOGLE_SESSION_DELETE_PATH,
      GOOGLE_SESSION_CREATE_PATH,
    ]);
  });

  it("aborts pending create on Drive 401/403 without GIS and ignores stale create", async () => {
    const createFailed = vi.fn();
    const { controller, accessToken, status, fetchMock, gisCalls } =
      createHarness({ onCreateFailed: createFailed });
    accessToken.current = MANUAL_TOKEN;
    status.current = "connected";
    const createPending = deferred<Response>();
    const createSignals: AbortSignal[] = [];
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === GOOGLE_SESSION_CREATE_PATH) {
          if (init?.signal) {
            createSignals.push(init.signal);
          }
          return createPending.promise;
        }
        return jsonResponse({ kind: "disconnected" });
      },
    );

    const persistDone = controller.persistAfterManualConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });
    await Promise.resolve();

    controller.invalidate();
    accessToken.current = null;
    status.current = "disconnected";
    controller.deleteAfterLocalDisconnect();
    await Promise.resolve();

    expect(createSignals[0]?.aborted).toBe(true);
    expect(gisCalls).toHaveLength(0);
    createPending.resolve(jsonResponse({ kind: "unavailable" }, 503));
    await persistDone;

    expect(accessToken.current).toBeNull();
    expect(status.current).toBe("disconnected");
    expect(createFailed).not.toHaveBeenCalled();
    expect(fetchUrls(fetchMock)).toEqual([
      GOOGLE_SESSION_CREATE_PATH,
      GOOGLE_SESSION_DELETE_PATH,
    ]);
  });

  it("aborts pending restore and create on dispose but leaves a started delete running", async () => {
    const createFailed = vi.fn();
    const { controller, fetchMock } = createHarness({
      onCreateFailed: createFailed,
    });
    const restorePending = deferred<Response>();
    const createPending = deferred<Response>();
    const deletePending = deferred<Response>();
    const restoreSignals: AbortSignal[] = [];
    const createSignals: AbortSignal[] = [];
    const deleteSignals: AbortSignal[] = [];
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === GOOGLE_SESSION_RESTORE_PATH) {
          if (init?.signal) {
            restoreSignals.push(init.signal);
          }
          return restorePending.promise;
        }
        if (url === GOOGLE_SESSION_CREATE_PATH) {
          if (init?.signal) {
            createSignals.push(init.signal);
          }
          return createPending.promise;
        }
        if (init?.signal) {
          deleteSignals.push(init.signal);
        }
        return deletePending.promise;
      },
    );

    const restoreDone = controller.restoreOnPageLoad();
    const persistDone = controller.persistAfterManualConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });
    controller.deleteAfterLocalDisconnect();
    await Promise.resolve();
    controller.dispose();

    expect(restoreSignals[0]?.aborted).toBe(true);
    expect(createSignals[0]?.aborted).toBe(true);
    expect(deleteSignals[0]?.aborted).toBe(false);

    restorePending.resolve(jsonResponse({ kind: "restored", accessToken: RESTORED_TOKEN, expiresAtMs: 1 }));
    createPending.resolve(jsonResponse({ kind: "created", expiresAtMs: 1 }));
    deletePending.resolve(jsonResponse({ kind: "disconnected" }));
    await restoreDone;
    await persistDone;
    expect(createFailed).not.toHaveBeenCalled();
  });

  it("does not post a Photos scope to session create", async () => {
    const { controller, fetchMock } = createHarness();
    await controller.persistAfterManualConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 1200,
      scope: `${DRIVE_FILE_SCOPE} ${PHOTOS_SCOPE}`,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses trailing-slash session API paths only", () => {
    expect(GOOGLE_SESSION_CREATE_PATH).toBe("/api/google-session/create/");
    expect(GOOGLE_SESSION_RESTORE_PATH).toBe("/api/google-session/restore/");
    expect(GOOGLE_SESSION_DELETE_PATH).toBe("/api/google-session/delete/");
    expect(source).not.toContain("/api/google-session/create\"");
    expect(source).not.toContain("/api/google-session/restore\"");
    expect(source).not.toContain("/api/google-session/delete\"");
  });

  it("does not persist tokens in storage, state, or GIS silent prompts", () => {
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "useState",
      "createContext",
      'prompt: ""',
      'prompt: "none"',
      "requestAccessToken",
      "tokeninfo",
      "console.log",
      "console.error",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

function createHarness(
  options: { onCreateFailed?: () => void } = {},
) {
  const tokenBox = { current: null as string | null };
  const statusBox = { current: "disconnected" as "disconnected" | "connected" };
  const grantedBox = { current: null as boolean | null };
  const gisCalls: unknown[] = [];
  const fetchMock = vi.fn();
  const controller = createGoogleSessionClientController({
    fetch: fetchMock as typeof fetch,
    onRestored(token) {
      tokenBox.current = token;
      statusBox.current = "connected";
      grantedBox.current = true;
    },
    onCreateFailed: options.onCreateFailed,
  });
  return {
    controller,
    fetchMock,
    gisCalls,
    accessToken: tokenBox,
    status: statusBox,
    driveFileGranted: grantedBox,
  };
}

function fetchUrls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
