import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { DRIVE_VIDEO_MAX_BYTES } from "./drive-video-policy";

type ServiceWorkerHarness = {
  run<T>(expression: string): T;
  listeners: Map<string, (...args: unknown[]) => unknown>;
  source: string;
};

function loadServiceWorkerHarness(): ServiceWorkerHarness {
  const source = readFileSync(
    fileURLToPath(new URL("../../public/sw.js", import.meta.url)),
    "utf8",
  );
  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const serviceWorkerGlobal = {
    location: { origin: "https://app.example" },
    addEventListener(
      type: string,
      listener: (...args: unknown[]) => unknown,
    ) {
      listeners.set(type, listener);
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => []),
    },
  };
  const context = createContext({
    self: serviceWorkerGlobal,
    caches: {
      open: vi.fn(),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
      match: vi.fn(),
    },
    fetch: vi.fn(),
    Headers,
    Request,
    Response,
    URL,
  });

  runInContext(source, context);

  return {
    source,
    listeners,
    run<T>(expression: string) {
      return runInContext(expression, context) as T;
    },
  };
}

function validSession(mimeType: string, fileSize = 1024) {
  return {
    sessionId: `session-${mimeType}`,
    assetFileId: "drive-file-sensitive-fixture",
    accessToken: "access-token-sensitive-fixture",
    mimeType,
    fileSize,
    expiresAt: Date.now() + 60_000,
  };
}

describe("Drive video Service Worker policy", () => {
  it.each(["video/mp4", "video/quicktime"])(
    "accepts a %s session and preserves its actual MIME",
    (mimeType) => {
      const harness = loadServiceWorkerHarness();
      const register = harness.run<(payload: unknown) => boolean>(
        "registerDriveVideoSession",
      );

      expect(register(validSession(mimeType))).toBe(true);
      expect(
        harness.run<{ mimeType: string }>(
          `driveVideoSessions.get(${JSON.stringify(`session-${mimeType}`)})`,
        ).mimeType,
      ).toBe(mimeType);
    },
  );

  it("rejects an unsupported video MIME", () => {
    const harness = loadServiceWorkerHarness();
    const register = harness.run<(payload: unknown) => boolean>(
      "registerDriveVideoSession",
    );
    expect(register(validSession("video/webm"))).toBe(false);
  });

  it("accepts exactly 5 GiB and rejects 5 GiB plus one byte", () => {
    const harness = loadServiceWorkerHarness();
    const register = harness.run<(payload: unknown) => boolean>(
      "registerDriveVideoSession",
    );
    expect(register(validSession("video/mp4", DRIVE_VIDEO_MAX_BYTES))).toBe(
      true,
    );
    expect(
      register(validSession("video/quicktime", DRIVE_VIDEO_MAX_BYTES + 1)),
    ).toBe(false);
  });

  it("keeps range start and end above 2 GiB as safe Numbers", () => {
    const harness = loadServiceWorkerHarness();
    const parse = harness.run<
      (range: string, fileSize: number) => {
        ok: boolean;
        start: number;
        requestedEnd: number;
      }
    >("parseSingleByteRange");
    const buildWindow = harness.run<
      (
        range: { ok: boolean; start: number; requestedEnd: number },
        fileSize: number,
      ) => { start: number; end: number }
    >("buildSafeRangeWindow");
    const start = 3 * 1024 * 1024 * 1024;
    const end = start + 1023;
    const parsed = parse(`bytes=${start}-${end}`, DRIVE_VIDEO_MAX_BYTES);

    expect(parsed.start).toBe(start);
    expect(parsed.requestedEnd).toBe(end);
    expect(buildWindow(parsed, DRIVE_VIDEO_MAX_BYTES)).toMatchObject({
      start,
      end,
    });
  });

  it("builds a correct Content-Range near 5 GiB", () => {
    const harness = loadServiceWorkerHarness();
    const build = harness.run<
      (
        range: { start: number; end: number },
        contentLength: number,
        fileSize: number,
      ) => { value: string; length: number }
    >("buildContentRangeForWindow");
    const start = DRIVE_VIDEO_MAX_BYTES - 1024;

    expect(
      build(
        { start, end: DRIVE_VIDEO_MAX_BYTES - 1 },
        1024,
        DRIVE_VIDEO_MAX_BYTES,
      ),
    ).toEqual({
      value: `bytes ${start}-${DRIVE_VIDEO_MAX_BYTES - 1}/${DRIVE_VIDEO_MAX_BYTES}`,
      length: 1024,
    });
  });

  it.each(["video/mp4", "video/quicktime"] as const)(
    "uses session MIME %s as the response Content-Type fallback",
    (mimeType) => {
      const harness = loadServiceWorkerHarness();
      const build = harness.run<
        (
          response: Response,
          session: { mimeType: string; fileSize: number },
          range: { start: number; end: number; kind: string; window: string },
        ) => { headers: Headers }
      >("buildDriveMediaResponseHeaders");
      const result = build(
        new Response(null, {
          status: 206,
          headers: { "Content-Length": "1024" },
        }),
        { mimeType, fileSize: 1024 },
        { start: 0, end: 1023, kind: "start-end", window: "full" },
      );

      expect(result.headers.get("Content-Type")).toBe(mimeType);
    },
  );

  it("classifies QuickTime diagnostics separately from other content", () => {
    const harness = loadServiceWorkerHarness();
    const classify = harness.run<(contentType: string | null) => string>(
      "safeContentTypeLabel",
    );
    expect(classify("video/mp4; charset=binary")).toBe("video/mp4");
    expect(classify("video/quicktime")).toBe("video/quicktime");
    expect(classify(null)).toBe("missing");
    expect(classify("video/webm")).toBe("other");
  });

  it("keeps app-shell cache and lifecycle registration unchanged", () => {
    const harness = loadServiceWorkerHarness();
    expect(harness.run<string>("APP_CACHE_NAME")).toBe(
      "ipad-slideshow-pwa-app-shell-v1",
    );
    expect(harness.run<string[]>("APP_SHELL_URLS")).toEqual([
      "/",
      "/settings/",
      "/admin/",
      "/player/",
      "/manifest.json",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
    ]);
    expect([...harness.listeners.keys()].sort()).toEqual([
      "activate",
      "fetch",
      "install",
      "message",
    ]);
  });

  it("does not expose credentials, Drive IDs, URLs, or raw bodies in diagnostics", () => {
    const harness = loadServiceWorkerHarness();
    const build = harness.run<
      (input: {
        sessionId: string;
        status: number;
        request: Request;
        response: Response;
      }) => unknown
    >("buildDriveVideoStreamStatusPayload");
    const token = "access-token-sensitive-fixture";
    const driveFileId = "drive-file-sensitive-fixture";
    const rawBody = "raw-response-body-sensitive-fixture";
    const request = new Request(
      `https://app.example/__drive-video-stream/session-safe?file=${driveFileId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Range: "bytes=0-1023",
        },
      },
    );
    const response = new Response(rawBody, {
      status: 206,
      headers: { "Content-Type": "video/quicktime" },
    });
    const serialized = JSON.stringify(
      build({ sessionId: "session-safe", status: 206, request, response }),
    );

    expect(serialized).toContain("video/quicktime");
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain(driveFileId);
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain(rawBody);
  });

  it("does not introduce bitwise range arithmetic", () => {
    const harness = loadServiceWorkerHarness();
    const start = harness.source.indexOf("function parseSingleByteRange");
    const end = harness.source.indexOf("function buildRangeHeader", start);
    expect(harness.source.slice(start, end)).not.toMatch(/<<|>>>?|~~/);
  });
});
