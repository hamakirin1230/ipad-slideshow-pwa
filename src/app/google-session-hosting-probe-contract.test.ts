import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

const probeSource = readFileSync(
  new URL("../../api/session-probe.ts", import.meta.url),
  "utf8",
);
const nextConfigSource = readFileSync(
  new URL("../../next.config.ts", import.meta.url),
  "utf8",
);
const serviceWorkerSource = readFileSync(
  new URL("../../public/sw.js", import.meta.url),
  "utf8",
);

describe("google session hosting probe contract", () => {
  it("keeps a sanitized root Vercel Function probe without secrets", () => {
    expect(
      existsSync(new URL("../../api/session-probe.ts", import.meta.url)),
    ).toBe(true);
    expect(probeSource).toContain('kind: "google-session-hosting-probe"');
    expect(probeSource).toContain('ok: true');
    expect(probeSource).toContain('"Cache-Control": NO_STORE');
    expect(probeSource).toContain('const NO_STORE = "no-store"');
    expect(probeSource).toContain("request.method !== \"GET\"");
    expect(probeSource).toContain("status: 405");
    expect(probeSource).not.toContain("console.log");
    expect(probeSource).not.toContain("process.env");
    expect(probeSource).not.toContain("cookie");
    expect(probeSource).not.toContain("Cookie");
    expect(probeSource).not.toContain("Redis");
    expect(probeSource).not.toContain("Upstash");
    expect(probeSource).not.toContain("access_token");
    expect(probeSource).not.toContain("refresh_token");
    expect(probeSource).not.toContain("googleapis");
    expect(probeSource).not.toContain("accounts.google.com");
    expect(probeSource).not.toContain("request.url");
    expect(probeSource).not.toContain("request.headers");
    expect(probeSource).not.toContain("request.json");
    expect(probeSource).not.toContain("request.text");
  });

  it("does not change static export hosting or add vercel.json", () => {
    expect(nextConfig).toMatchObject({
      output: "export",
      trailingSlash: true,
    });
    expect(nextConfigSource).toContain('output: "export"');
    expect(nextConfigSource).toContain("trailingSlash: true");
    expect(
      existsSync(new URL("../../vercel.json", import.meta.url)),
    ).toBe(false);
  });

  it("does not add the probe to the Service Worker app shell cache", () => {
    expect(serviceWorkerSource).not.toContain("/api/session-probe");
    expect(serviceWorkerSource).not.toContain("/api/");
  });
});
