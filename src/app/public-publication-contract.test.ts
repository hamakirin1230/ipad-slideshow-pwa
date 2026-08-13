import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = {
  providers: read("./app-providers.tsx"),
  routeShell: read("./app-route-shell.tsx"),
  viewer: read("./share/[shareId]/public-slideshow-viewer.tsx"),
  viewerPage: read("./share/[shareId]/page.tsx"),
  activation: read("./api/publication/activate/route.ts"),
  upload: read("./api/publication/upload/route.ts"),
  client: read("../lib/publication/public-publication-client.ts"),
  contract: read("../lib/publication/public-publication-contract.ts"),
  serviceWorker: read("../../public/sw.js"),
  nextConfig: read("../../next.config.ts"),
};

describe("public publication integration contract", () => {
  it("uses standard Next.js deployment with dynamic public routes", () => {
    expect(source.nextConfig).not.toContain('output: "export"');
    expect(source.viewerPage).toContain('dynamic = "force-dynamic"');
    expect(source.viewerPage).toContain("isValidPublicShareId(shareId)");
  });

  it("prepares artifacts before Drive commit and activates only afterward", () => {
    const publish = functionBody(
      source.providers,
      "async function commitPreparedProjectPublish",
      "function cancelPreparedProjectPublish",
    );
    expect(publish.indexOf("preparePublicPublicationArtifact")).toBeLessThan(
      publish.indexOf("executePreparedProjectPublish"),
    );
    expect(publish.indexOf("executePreparedProjectPublish")).toBeLessThan(
      publish.indexOf("activatePreparedPublicPublication"),
    );

    const rollback = functionBody(
      source.providers,
      "async function commitPreparedProjectRollback",
      "function cancelPreparedProjectRollback",
    );
    expect(rollback.indexOf("preparePublicPublicationArtifact")).toBeLessThan(
      rollback.indexOf("executePreparedProjectRollback"),
    );
    expect(rollback.indexOf("executePreparedProjectRollback")).toBeLessThan(
      rollback.indexOf("activatePreparedPublicPublication"),
    );
    expect(rollback).toContain("revisionId: input.revisionId");
  });

  it("requires a fresh matching Drive current revision for activation and retry", () => {
    const activation = functionBody(
      source.activation,
      "export async function POST",
      "function parseActivationInput",
    );
    expect(activation.indexOf("buildFreshPublicRevisionInput")).toBeLessThan(
      activation.indexOf("verifyPublicRevisionArtifact"),
    );
    expect(activation.indexOf("verifyPublicRevisionArtifact")).toBeLessThan(
      activation.indexOf("activatePublicRevision({"),
    );
    expect(source.activation).toContain(
      "Google Driveの現在の公開版と一致しないため",
    );
    const retry = functionBody(
      source.providers,
      "async function retryPendingPublicActivation",
      "function cancelPreparedProjectPublish",
    );
    expect(retry).toContain("activatePreparedPublicPublication");
    expect(retry).toContain("pendingPublicActivationRef.current ??");
    expect(source.activation).toContain("sourceModifiedTime");
    expect(source.activation.indexOf("const confirmed =")).toBeLessThan(
      source.activation.indexOf("activatePublicRevision({"),
    );
    expect(source.viewer).toContain('slide.mediaKind !== "image"');
    expect(source.viewer).toContain("video.play()");
    expect(source.viewer).toContain("video.pause()");
  });

  it("keeps the public viewer independent from Google state and admin chrome", () => {
    expect(source.viewer).not.toMatch(/useAppState|AppProviders|Google|Drive API/);
    expect(source.viewerPage).not.toMatch(/useAppState|AppProviders/);
    expect(source.routeShell).toContain('pathname.startsWith("/share/")');
    expect(source.routeShell.indexOf('pathname.startsWith("/share/")')).toBeLessThan(
      source.routeShell.indexOf("<AppProviders>"),
    );
  });

  it("constrains upload tokens and never persists the access token", () => {
    expect(source.upload).toContain("allowedContentTypes");
    expect(source.upload).toContain("maximumSizeInBytes");
    expect(source.upload).toContain("allowOverwrite: false");
    expect(source.upload).toContain("pathname !== expectedPathname");
    for (const publicationSource of [
      source.activation,
      source.upload,
      source.client,
      source.contract,
    ]) {
      expect(publicationSource).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie|console\./,
      );
    }
    expect(source.client).toContain(
      'headers: { Authorization: `Bearer ${input.accessToken}` }',
    );
    expect(source.client).not.toMatch(/accessToken.*searchParams|query.*accessToken/);
  });

  it("excludes public and API routes from the app-shell cache", () => {
    expect(source.serviceWorker).toContain('url.pathname.startsWith("/share/")');
    expect(source.serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(source.serviceWorker.indexOf("isPublicOrServerRoute(url)")).toBeLessThan(
      source.serviceWorker.indexOf('request.mode === "navigate"'),
    );
    const appShellUrls = source.serviceWorker.slice(
      source.serviceWorker.indexOf("const APP_SHELL_URLS"),
      source.serviceWorker.indexOf("];", source.serviceWorker.indexOf("const APP_SHELL_URLS")),
    );
    expect(appShellUrls).not.toContain("/share/");
  });
});

function functionBody(sourceText: string, start: string, end: string) {
  const startIndex = sourceText.indexOf(start);
  const endIndex = sourceText.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return sourceText.slice(startIndex, endIndex);
}

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
