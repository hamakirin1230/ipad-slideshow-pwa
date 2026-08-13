import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

type WebAppManifest = {
  start_url: string;
  scope: string;
  icons: Array<{ src: string }>;
};

const nextConfigSource = readFileSync(
  new URL("../../next.config.ts", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(
  readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8"),
) as WebAppManifest;
const serviceWorkerRegistrationSource = readFileSync(
  new URL("./service-worker-registration.tsx", import.meta.url),
  "utf8",
);

describe("root deployment contract", () => {
  it("keeps a root standard deployment without a hosting-specific base path", () => {
    expect(nextConfig).toMatchObject({
      trailingSlash: true,
      images: {
        unoptimized: true,
      },
    });
    expect(nextConfig).not.toHaveProperty("output");
    expect(nextConfig).not.toHaveProperty("basePath");
    expect(nextConfigSource).not.toContain("GITHUB_PAGES");
    expect(nextConfigSource).not.toContain("/ipad-slideshow-pwa");
  });

  it("keeps manifest, icons, and Service Worker on root paths", () => {
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
    ]);
    expect(serviceWorkerRegistrationSource).toContain(
      'navigator.serviceWorker.register("/sw.js")',
    );
  });

  it("retires the Pages workflow while preserving the CI workflow", () => {
    expect(
      existsSync(new URL("../../.github/workflows/deploy.yml", import.meta.url)),
    ).toBe(false);

    const ciWorkflow = readFileSync(
      new URL("../../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );

    for (const contract of [
      "push:",
      "pull_request:",
      "workflow_dispatch:",
      "pnpm test",
      "pnpm lint",
      "pnpm build",
    ]) {
      expect(ciWorkflow).toContain(contract);
    }
  });
});
