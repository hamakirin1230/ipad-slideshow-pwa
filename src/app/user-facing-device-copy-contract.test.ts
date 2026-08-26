import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = fileURLToPath(new URL("../", import.meta.url));
const manifestSource = readFileSync(
  new URL("../../public/manifest.json", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

const allowedIpadSubstrings = [
  "iPad Slideshow PWA Workspace",
  'userAgent.includes("iPad")',
  "Some iPad/Safari contexts ignore programmatic volume changes.",
];

function collectProductionSources(dir: string): Array<{ path: string; source: string }> {
  const files: Array<{ path: string; source: string }> = [];

  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectProductionSources(fullPath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) {
      continue;
    }

    files.push({
      path: fullPath,
      source: readFileSync(fullPath, "utf8"),
    });
  }

  return files;
}

describe("user-facing device copy", () => {
  const productionSources = collectProductionSources(srcRoot);

  it("does not keep このiPadに保存 in product UI source", () => {
    expect(manifestSource).not.toContain("このiPadに保存");
    expect(layoutSource).not.toContain("このiPadに保存");

    for (const file of productionSources) {
      expect(file.source, file.path).not.toContain("このiPadに保存");
    }
  });

  it("does not keep leftover このiPad labels outside technical identifiers", () => {
    for (const file of productionSources) {
      let source = file.source;
      for (const allowed of allowedIpadSubstrings) {
        source = source.replaceAll(allowed, "");
      }
      expect(source, file.path).not.toContain("このiPad");
    }
  });

  it("uses a device-common install metadata description", () => {
    expect(layoutSource).toContain(
      "写真や動画を端末で安定して再生するためのスライドショーPWAです。",
    );
    expect(manifestSource).toContain(
      "写真や動画を端末で安定して再生するためのスライドショーPWAです。",
    );
    expect(manifestSource).not.toContain("iPadで安定して再生するためのスライドショーPWAです。");
  });
});
