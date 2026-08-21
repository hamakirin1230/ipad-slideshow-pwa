import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET, POST, dynamic, runtime } from "./api/session-probe/route";

const routeSource = readFileSync(
  new URL("./api/session-probe/route.ts", import.meta.url),
  "utf8",
);

async function expectFixedProbeResponse(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toMatch(/application\/json/);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    kind: "google-session-app-router-probe",
  });
}

describe("google session App Router probe contract", () => {
  it("keeps a sanitized Node Route Handler without secrets", () => {
    expect(
      existsSync(new URL("./api/session-probe/route.ts", import.meta.url)),
    ).toBe(true);
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(routeSource).toContain('export const runtime = "nodejs"');
    expect(routeSource).toContain('export const dynamic = "force-dynamic"');
    expect(routeSource).toContain("export function GET()");
    expect(routeSource).toContain("export function POST()");
    expect(routeSource).toContain('kind: "google-session-app-router-probe"');
    expect(routeSource).toContain('"Cache-Control": "no-store"');
    expect(routeSource).not.toContain("process.env");
    expect(routeSource).not.toContain("console.log");
    expect(routeSource).not.toContain("cookie");
    expect(routeSource).not.toContain("cookies(");
    expect(routeSource).not.toContain("Redis");
    expect(routeSource).not.toContain("Upstash");
    expect(routeSource).not.toContain("access_token");
    expect(routeSource).not.toContain("refresh_token");
    expect(routeSource).not.toContain("googleapis");
    expect(routeSource).not.toContain("accounts.google.com");
    expect(routeSource).not.toContain("request.");
    expect(routeSource).not.toContain("Request");
  });

  it("returns the same fixed JSON for GET and POST", async () => {
    await expectFixedProbeResponse(GET());
    await expectFixedProbeResponse(POST());
  });
});
