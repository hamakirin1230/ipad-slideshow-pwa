import { describe, expect, it } from "vitest";
import { parseProjectManifestPublication } from "./project-manifest-publication";
import {
  createProjectRollbackOperationId,
  isValidProjectRollbackOperationId,
} from "./project-rollback-operation-id";

const REVISION_ID = "rev_20260728T123456789Z_abcdef12";
const HASH = "fnv1a64:1234567890abcdef";

describe("project rollback operation IDs", () => {
  it("creates and validates the dedicated rbop format", () => {
    const value = createProjectRollbackOperationId({
      startedAt: "2026-07-28T12:34:56.789Z",
      randomSuffix: "12ab34cd",
    });
    expect(value).toBe("rbop_20260728T123456789Z_12ab34cd");
    expect(isValidProjectRollbackOperationId(value)).toBe(true);
    expect(isValidProjectRollbackOperationId(value.replace("rbop_", "pubop_"))).toBe(
      false,
    );
  });

  it("rejects invalid timestamps and non-lowercase suffixes", () => {
    expect(() =>
      createProjectRollbackOperationId({
        startedAt: "2026-02-30T00:00:00.000Z",
        randomSuffix: "12ab34cd",
      }),
    ).toThrow();
    expect(() =>
      createProjectRollbackOperationId({
        startedAt: "2026-07-28T12:34:56.789Z",
        randomSuffix: "12AB34CD",
      }),
    ).toThrow();
  });
});

describe("publication operation prefix pairing", () => {
  const base = {
    schemaVersion: 1,
    currentRevisionId: REVISION_ID,
    publishedAt: "2026-07-28T12:34:56.789Z",
    contentCanonicalHash: HASH,
  };

  it("accepts publish/pubop and rollback/rbop pairs", () => {
    expect(
      parseProjectManifestPublication({
        ...base,
        operation: "publish",
        operationId: "pubop_20260728T123456789Z_12ab34cd",
      }).ok,
    ).toBe(true);
    expect(
      parseProjectManifestPublication({
        ...base,
        operation: "rollback",
        operationId: "rbop_20260728T123456789Z_12ab34cd",
      }).ok,
    ).toBe(true);
  });

  it("rejects cross-prefix pairs", () => {
    expect(
      parseProjectManifestPublication({
        ...base,
        operation: "publish",
        operationId: "rbop_20260728T123456789Z_12ab34cd",
      }).ok,
    ).toBe(false);
    expect(
      parseProjectManifestPublication({
        ...base,
        operation: "rollback",
        operationId: "pubop_20260728T123456789Z_12ab34cd",
      }).ok,
    ).toBe(false);
  });
});
