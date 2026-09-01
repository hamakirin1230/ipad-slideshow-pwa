import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./app-providers.tsx", import.meta.url),
  "utf8",
);

function extractFunction(name: string) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const syncNext = source.indexOf("\n  function ", start + 1);
  const asyncNext = source.indexOf("\n  async function ", start + 1);
  const candidates = [syncNext, asyncNext].filter((index) => index !== -1);
  const end = candidates.length === 0 ? undefined : Math.min(...candidates);
  return source.slice(start, end);
}

describe("AppProviders offline save review contract", () => {
  it("prepares a Drive and confirmed-store review without executing save", () => {
    const review = extractFunction("prepareOfflineSaveReview");
    expect(review).toContain("await prepareOfflineSaveUiReview({");
    expect(review).toContain("accessToken,");
    expect(review).toContain("readyContext,");
    expect(review).toContain("project: readyProject,");
    expect(review).toContain("signal,");
    expect(review).not.toContain("runtime.run");
    expect(review).not.toContain("writeCompleteOfflineStagingSnapshot");
    expect(review).not.toContain("promoteOfflineStagingForSyncRun");
    expect(review).not.toContain("fetchDriveProjectAssetBlob");
  });

  it("keeps actual save on the existing fresh orchestration runtime", () => {
    const actual = extractFunction("startOfflineSync");
    expect(actual).toContain("await runtime.run({");
    expect(actual).toContain("accessToken,");
    expect(actual).toContain("readyContext,");
    expect(actual).toContain("project: readyProject,");
    expect(actual).not.toContain("OfflineSaveUiReview");
  });

  it("rejects stale review authority without exposing identifiers", () => {
    const review = extractFunction("prepareOfflineSaveReview");
    expect(review).toContain("accessTokenRef.current !== accessToken");
    expect(review).toContain(
      "currentAuthority.project?.projectId !== readyProject.projectId",
    );
    expect(review).toContain(
      "currentAuthority.selectedProjectId !== readyProject.projectId",
    );
    expect(review).toContain('reason: "sourceChanged"');
    expect(review).not.toContain("JSON.stringify");
  });
});
