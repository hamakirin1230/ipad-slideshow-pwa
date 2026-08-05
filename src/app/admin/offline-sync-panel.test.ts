import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./offline-sync-panel.tsx", import.meta.url),
  "utf8",
);

describe("offline sync panel progress accessibility", () => {
  it("uses a polite status region for in-flight progress", () => {
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
  });

  it("renders percent only when the sanitized progress defines it", () => {
    expect(source).toContain(
      "progressView?.percent !== undefined",
    );
    expect(source).toContain("<progress");
  });
});
