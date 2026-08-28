import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PUBLICATION_WRITE_LOCKED_CODE,
  PUBLICATION_WRITE_LOCKED_MESSAGE,
} from "@/lib/publish-history/project-publication-write-lock";

const providers = readFileSync(
  fileURLToPath(new URL("./app-providers.tsx", import.meta.url)),
  "utf8",
);

function extractFunction(startMarker: string, endMarker: string) {
  const start = providers.indexOf(startMarker);
  const end = providers.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return providers.slice(start, end);
}

describe("publication write multi-tab lock contract", () => {
  it("takes the project lock before a publish Drive write", () => {
    const implementation = extractFunction(
      "async function commitPreparedProjectPublish(",
      "function cancelPreparedProjectPublish(",
    );
    const lockIndex = implementation.indexOf("runWithProjectPublicationWriteLock");
    const writeIndex = implementation.indexOf("executePreparedProjectPublish({");
    const blockedIndex = implementation.indexOf("PUBLICATION_WRITE_LOCKED_CODE");

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(writeIndex).toBeGreaterThan(lockIndex);
    expect(blockedIndex).toBeGreaterThan(writeIndex);
    expect(implementation).toContain("{ projectId: input.projectId }");
    expect(implementation).toContain("if (!locked.acquired)");
    expect(implementation).toContain("PUBLICATION_WRITE_LOCKED_MESSAGE");
    expect(implementation).toContain("canRetry: false");
  });

  it("takes the project lock before a rollback Drive write", () => {
    const implementation = extractFunction(
      "async function commitPreparedProjectRollback(",
      "function cancelPreparedProjectRollback(",
    );
    const lockIndex = implementation.indexOf("runWithProjectPublicationWriteLock");
    const writeIndex = implementation.indexOf(
      "executePreparedProjectRollback({",
    );
    const blockedIndex = implementation.indexOf("PUBLICATION_WRITE_LOCKED_CODE");

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(writeIndex).toBeGreaterThan(lockIndex);
    expect(blockedIndex).toBeGreaterThan(writeIndex);
    expect(implementation).toContain("{ projectId: input.projectId }");
    expect(implementation).toContain("if (!locked.acquired)");
    expect(implementation).toContain("PUBLICATION_WRITE_LOCKED_MESSAGE");
    expect(implementation).toContain("canRetry: false");
  });

  it("does not extend the lock to non-publication writes", () => {
    const lockUsages = providers.split("runWithProjectPublicationWriteLock(");
    expect(lockUsages).toHaveLength(3);

    const preparePublish = extractFunction(
      "async function prepareProjectPublishReview(",
      "async function commitPreparedProjectPublish(",
    );
    const prepareRollback = extractFunction(
      "async function prepareProjectRollbackExecutionReview(",
      "async function commitPreparedProjectRollback(",
    );
    const localImage = extractFunction(
      "async function startLocalImageFileImport",
      "async function fetchProjectSlidePreviewBlob",
    );

    expect(preparePublish).not.toContain("runWithProjectPublicationWriteLock");
    expect(prepareRollback).not.toContain("runWithProjectPublicationWriteLock");
    expect(localImage).not.toContain("runWithProjectPublicationWriteLock");
    expect(providers).toContain("projectPublicationWriteInFlightRef");
    expect(PUBLICATION_WRITE_LOCKED_CODE).toBe("publicationWriteLocked");
    expect(PUBLICATION_WRITE_LOCKED_MESSAGE).toContain("別のタブで公開操作を実行中です");
  });
});
