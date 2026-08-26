import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const globalsSource = read("./globals.css");
const layoutSource = read("./layout.tsx");

const SYSTEM_SANS_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif';

describe("readable system font stack contract", () => {
  it("uses an OS sans-serif stack instead of a self-referential font variable", () => {
    expect(globalsSource).toContain(`--font-sans: ${SYSTEM_SANS_STACK};`);
    expect(globalsSource).toContain(`--font-heading: ${SYSTEM_SANS_STACK};`);
    expect(globalsSource).not.toContain("--font-sans: var(--font-sans);");
    expect(globalsSource).not.toContain("--font-heading: var(--font-sans);");
    expect(globalsSource).toContain("@apply font-sans");
  });

  it("keeps Geist Mono for mono UI and does not load Geist Sans for Japanese copy", () => {
    expect(layoutSource).toContain('import { Geist_Mono } from "next/font/google"');
    expect(layoutSource).not.toContain("import { Geist, Geist_Mono }");
    expect(layoutSource).not.toContain("--font-geist-sans");
    expect(layoutSource).toContain('variable: "--font-geist-mono"');
    expect(globalsSource).toContain("--font-mono: var(--font-geist-mono);");
  });
});
