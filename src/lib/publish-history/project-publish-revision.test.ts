import { describe, expect, it } from "vitest";
import { parseProjectManifest, type ProjectManifest } from "../google-drive";
import { parseProjectManifestPublication } from "./project-manifest-publication";
import {
  createProjectPublishRevisionId,
  deriveProjectPublishRevisionSummary,
  getProjectManifestCanonicalHash,
  getProjectManifestContentCanonicalHash,
  getProjectManifestPublishableContent,
  hashCanonicalJson,
  isValidProjectPublishRevisionId,
  parseProjectPublishRevision,
  stringifyCanonicalJson,
  type CanonicalJsonValue,
  type ProjectPublishRevision,
} from "./project-publish-revision";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const VIDEO_ASSET_ID = "44444444-4444-4444-8444-444444444444";
const IMAGE_SLIDE_ID = "55555555-5555-4555-8555-555555555555";
const VIDEO_SLIDE_ID = "66666666-6666-4666-8666-666666666666";
const IMAGE_DRIVE_FILE_ID = "drive-file-image-a";
const VIDEO_DRIVE_FILE_ID = "drive-file-video-a";
const REVISION_ID = "rev_20260712T123456789Z_ab12cd34";
const PREVIOUS_REVISION_ID = "rev_20260711T123456789Z_cd34ef56";
const OPERATION_ID = "pubop_20260712T123300000Z_1234abcd";

function buildManifest() {
  return {
    app: "ipad-slideshow-pwa" as const,
    role: "projectManifest" as const,
    schemaVersion: 1 as const,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: "Fixture project",
    slides: [
      {
        slideId: IMAGE_SLIDE_ID,
        assetId: IMAGE_ASSET_ID,
        assetFileId: IMAGE_DRIVE_FILE_ID,
        assetName: "image-a.jpg",
        type: "image" as const,
        mimeType: "image/jpeg",
        source: "localFile" as const,
        sourceMimeType: "image/jpeg",
        sourceMediaItemId: "source-image-a",
        fileSize: 1200,
        durationSeconds: 10,
        caption: "Opening caption",
        createdAt: "2026-07-12T12:00:00.000Z",
        updatedAt: "2026-07-12T12:00:00.000Z",
      },
      {
        slideId: VIDEO_SLIDE_ID,
        assetId: VIDEO_ASSET_ID,
        assetFileId: VIDEO_DRIVE_FILE_ID,
        assetName: "video-a.mp4",
        type: "video" as const,
        mimeType: "video/mp4",
        source: "localFile" as const,
        sourceMimeType: "video/mp4",
        sourceMediaItemId: "source-video-a",
        fileSize: 80 * 1024 * 1024,
        durationMs: 30_000,
        durationSeconds: 12,
        caption: "Video caption",
        createdAt: "2026-07-12T12:00:00.000Z",
        updatedAt: "2026-07-12T12:00:00.000Z",
      },
    ],
    createdAt: "2026-07-12T12:00:00.000Z",
    updatedAt: "2026-07-12T12:34:56.789Z",
  };
}

function buildRevision(): ProjectPublishRevision {
  const manifest = buildManifest();
  const assets = [
    {
      assetId: IMAGE_ASSET_ID,
      driveFileId: IMAGE_DRIVE_FILE_ID,
      mimeType: "image/jpeg",
      sizeBytes: 1200,
      modifiedTime: "2026-07-12T12:00:00Z",
      checksum: "checksum-image-a",
      remoteOnly: false,
    },
    {
      assetId: VIDEO_ASSET_ID,
      driveFileId: VIDEO_DRIVE_FILE_ID,
      mimeType: "video/mp4",
      sizeBytes: 80 * 1024 * 1024,
      modifiedTime: "2026-07-12T21:00:00+09:00",
      checksum: null,
      remoteOnly: true,
    },
  ];
  return {
    schemaVersion: 1,
    revisionId: REVISION_ID,
    projectId: PROJECT_ID,
    publishedAt: "2026-07-12T21:34:56.789+09:00",
    operation: "publish",
    sourceManifestModifiedTime: "2026-07-12T12:34:56.789Z",
    sourceManifestCanonicalHash: getProjectManifestCanonicalHash(manifest),
    previousRevisionId: PREVIOUS_REVISION_ID,
    summary: deriveProjectPublishRevisionSummary(manifest, assets),
    assets,
    manifest,
  };
}

function parseErrors(value: unknown) {
  const result = parseProjectPublishRevision(value);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}

function buildPublication() {
  return {
    schemaVersion: 1 as const,
    currentRevisionId: REVISION_ID,
    publishedAt: "2026-07-12T12:34:56.789Z",
    operation: "publish" as const,
    operationId: OPERATION_ID,
    contentCanonicalHash: getProjectManifestContentCanonicalHash(buildManifest()),
  };
}

describe("project manifest publication schema", () => {
  it("keeps publication optional for legacy manifests", () => {
    const result = parseProjectManifest(buildManifest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.publication).toBeUndefined();
  });

  it("parses valid publish publication metadata", () => {
    expect(parseProjectManifestPublication(buildPublication())).toEqual({
      ok: true,
      value: buildPublication(),
    });
  });

  it("preserves valid publication through the formal manifest parser", () => {
    const result = parseProjectManifest({
      ...buildManifest(),
      publication: buildPublication(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.publication).toEqual(buildPublication());
  });

  it("parses rollback publication metadata without imposing publish ID format", () => {
    expect(
      parseProjectManifestPublication({
        ...buildPublication(),
        operation: "rollback",
        operationId: "rollback-operation-a",
      }).ok,
    ).toBe(true);
  });

  it.each([
    ["missing schema", { schemaVersion: undefined }],
    ["string schema", { schemaVersion: "1" }],
    ["unsupported schema", { schemaVersion: 2 }],
    ["revision ID", { currentRevisionId: "bad" }],
    ["operation", { operation: "other" }],
    ["publish operation ID", { operationId: "bad" }],
    ["publishedAt", { publishedAt: "2026-07-12" }],
    ["content hash", { contentCanonicalHash: "bad" }],
  ])("rejects invalid publication %s", (_label, override) => {
    const candidate = { ...buildPublication(), ...override } as Record<string, unknown>;
    if ("schemaVersion" in override && override.schemaVersion === undefined) {
      delete candidate.schemaVersion;
    }
    expect(parseProjectManifestPublication(candidate).ok).toBe(false);
  });

  it("rejects unknown publication fields", () => {
    expect(
      parseProjectManifestPublication({ ...buildPublication(), extra: true }).ok,
    ).toBe(false);
  });

  it("does not echo a raw invalid value in parser errors", () => {
    const raw = "Bearer raw-sensitive-value";
    const result = parseProjectManifestPublication({
      ...buildPublication(),
      operationId: raw,
    });
    expect(JSON.stringify(result)).not.toContain(raw);
  });
});

describe("publishable manifest content", () => {
  it("removes publication without mutating the input", () => {
    const manifest: ProjectManifest = {
      ...buildManifest(),
      publication: buildPublication(),
    };
    const before = structuredClone(manifest);
    const content = getProjectManifestPublishableContent(manifest);
    expect(content).not.toHaveProperty("publication");
    expect(manifest).toEqual(before);
  });

  it("keeps the same content hash when only publication differs", () => {
    const left: ProjectManifest = { ...buildManifest(), publication: buildPublication() };
    const right: ProjectManifest = {
      ...buildManifest(),
      publication: { ...buildPublication(), operationId: "pubop_20260712T123300000Z_abcdef12" },
    };
    expect(getProjectManifestContentCanonicalHash(left)).toBe(
      getProjectManifestContentCanonicalHash(right),
    );
    expect(getProjectManifestCanonicalHash(left)).not.toBe(
      getProjectManifestCanonicalHash(right),
    );
  });

  it.each([
    ["slide content", (manifest: ProjectManifest) => { manifest.slides[0].assetName = "changed.jpg"; }],
    ["slide order", (manifest: ProjectManifest) => { manifest.slides.reverse(); }],
    ["caption", (manifest: ProjectManifest) => { manifest.slides[0].caption = "Changed"; }],
    ["duration", (manifest: ProjectManifest) => { manifest.slides[0].durationSeconds = 99; }],
  ])("changes content hash for %s changes", async (_label, mutate) => {
    const left: ProjectManifest = buildManifest();
    const right: ProjectManifest = buildManifest();
    mutate(right);
    expect(getProjectManifestContentCanonicalHash(left)).not.toBe(
      getProjectManifestContentCanonicalHash(right),
    );
  });

  it("rejects publication metadata inside an immutable revision manifest", () => {
    const revision = buildRevision() as ProjectPublishRevision & {
      manifest: ProjectManifest;
    };
    revision.manifest.publication = buildPublication();
    expect(
      parseErrors(revision).some(
        (error) => error.path === "manifest.publication",
      ),
    ).toBe(true);
  });
});

describe("parseProjectPublishRevision", () => {
  it("parses a publish revision with image, remote video, caption, and duration", () => {
    const result = parseProjectPublishRevision(buildRevision());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.manifest.slides[1]).toMatchObject({
      type: "video",
      durationMs: 30_000,
      durationSeconds: 12,
      caption: "Video caption",
    });
    expect(result.value.assets[1].remoteOnly).toBe(true);
  });

  it("parses a rollback revision", () => {
    const revision = {
      ...buildRevision(),
      operation: "rollback",
      restoredFromRevisionId: "rev_20260710T123456789Z_1234abcd",
    };
    expect(parseProjectPublishRevision(revision).ok).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["string", "1"],
    ["zero", 0],
    ["unsupported", 2],
    ["decimal", 1.5],
    ["NaN", Number.NaN],
  ])("rejects %s schemaVersion", (_label, schemaVersion) => {
    const revision = { ...buildRevision(), schemaVersion } as Record<string, unknown>;
    if (schemaVersion === undefined) delete revision.schemaVersion;
    expect(parseErrors(revision).some((error) => error.path === "schemaVersion")).toBe(true);
  });

  it("rejects unknown top-level fields", () => {
    expect(parseErrors({ ...buildRevision(), typo: true })[0].path).toBe("typo");
  });

  it.each([
    ["unknown operation", { operation: "replace" }],
    [
      "publish with rollback source",
      { restoredFromRevisionId: "rev_20260710T123456789Z_1234abcd" },
    ],
    ["rollback without source", { operation: "rollback" }],
    [
      "rollback from self",
      { operation: "rollback", restoredFromRevisionId: REVISION_ID },
    ],
    ["previous self", { previousRevisionId: REVISION_ID }],
  ])("rejects %s", (_label, override) => {
    expect(parseProjectPublishRevision({ ...buildRevision(), ...override }).ok).toBe(false);
  });

  it("returns a defensive copy", () => {
    const input = buildRevision();
    const result = parseProjectPublishRevision(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.manifest.slides[0].caption = "Changed";
    expect(input.manifest.slides[0].caption).toBe("Opening caption");
  });

  it("rejects an invalid or stale manifest canonical hash", () => {
    const invalid = buildRevision();
    invalid.sourceManifestCanonicalHash = "not-a-canonical-hash";
    expect(parseProjectPublishRevision(invalid).ok).toBe(false);

    const stale = buildRevision();
    stale.manifest.slides[0].caption = "Changed after hashing";
    expect(parseProjectPublishRevision(stale).ok).toBe(false);
  });
});

describe("summary and asset consistency", () => {
  it("derives slide, unique asset, and remote-only counts", () => {
    const revision = buildRevision();
    expect(deriveProjectPublishRevisionSummary(revision.manifest, revision.assets)).toEqual({
      slideCount: 2,
      assetCount: 2,
      remoteOnlyAssetCount: 1,
    });
  });

  it.each(["slideCount", "assetCount", "remoteOnlyAssetCount"] as const)(
    "rejects a mismatched %s",
    (key) => {
      const revision = buildRevision();
      revision.summary[key] += 1;
      expect(parseErrors(revision).some((error) => error.path === `summary.${key}`)).toBe(true);
    },
  );

  it.each([
    ["duplicate assetId", (revision: ProjectPublishRevision) => {
      revision.assets[1].assetId = revision.assets[0].assetId;
    }],
    ["duplicate driveFileId", (revision: ProjectPublishRevision) => {
      revision.assets[1].driveFileId = revision.assets[0].driveFileId;
    }],
    ["missing manifest asset", (revision: ProjectPublishRevision) => {
      revision.assets.pop();
      revision.summary.assetCount = 1;
      revision.summary.remoteOnlyAssetCount = 0;
    }],
    ["unreferenced asset", (revision: ProjectPublishRevision) => {
      revision.assets.push({
        ...revision.assets[0],
        assetId: "77777777-7777-4777-8777-777777777777",
        driveFileId: "drive-file-unused",
      });
      revision.summary.assetCount = 3;
    }],
    ["negative size", (revision: ProjectPublishRevision) => {
      revision.assets[0].sizeBytes = -1;
    }],
    ["decimal size", (revision: ProjectPublishRevision) => {
      revision.assets[0].sizeBytes = 1.5;
    }],
    ["invalid modifiedTime", (revision: ProjectPublishRevision) => {
      revision.assets[0].modifiedTime = "2026-02-30T12:00:00Z";
    }],
    ["empty MIME type", (revision: ProjectPublishRevision) => {
      revision.assets[0].mimeType = "";
    }],
    ["empty checksum", (revision: ProjectPublishRevision) => {
      revision.assets[0].checksum = "";
    }],
  ] as const)("rejects %s", (_label, mutate) => {
    const revision = buildRevision();
    mutate(revision);
    expect(parseProjectPublishRevision(revision).ok).toBe(false);
  });

  it("rejects a drive file mismatch without exposing its value", () => {
    const revision = buildRevision();
    const secretFixtureValue = "drive-file-sensitive-fixture";
    revision.assets[0].driveFileId = secretFixtureValue;
    const errors = parseErrors(revision);
    expect(JSON.stringify(errors)).not.toContain(secretFixtureValue);
    expect(JSON.stringify(errors)).not.toContain(JSON.stringify(revision));
  });
});

describe("date and revision ID helpers", () => {
  it.each([
    "2026-07-12T12:34:56.789Z",
    "2026-07-12T21:34:56.789+09:00",
  ])("accepts valid datetime %s", (publishedAt) => {
    expect(parseProjectPublishRevision({ ...buildRevision(), publishedAt }).ok).toBe(true);
  });

  it.each(["2026-02-30T12:00:00Z", "2026-07-12", ""])(
    "rejects invalid datetime %s",
    (publishedAt) => {
      expect(parseProjectPublishRevision({ ...buildRevision(), publishedAt }).ok).toBe(false);
    },
  );

  it("creates a deterministic compact revision ID", () => {
    const input = {
      publishedAt: "2026-07-12T21:34:56.789+09:00",
      randomSuffix: "ab12cd34",
    };
    expect(createProjectPublishRevisionId(input)).toBe(REVISION_ID);
    expect(createProjectPublishRevisionId(input)).toBe(createProjectPublishRevisionId(input));
  });

  it("changes the ID when timestamp or suffix changes", () => {
    expect(
      createProjectPublishRevisionId({
        publishedAt: "2026-07-12T12:34:56.790Z",
        randomSuffix: "ab12cd34",
      }),
    ).not.toBe(REVISION_ID);
    expect(
      createProjectPublishRevisionId({
        publishedAt: "2026-07-12T12:34:56.789Z",
        randomSuffix: "ab12cd35",
      }),
    ).not.toBe(REVISION_ID);
  });

  it.each([
    REVISION_ID,
    "rev_20260712T123456789Z_ab12cd3",
    "rev_20260712T123456789Z_ab12cd345",
    "rev_20260712T123456789Z_ab12/g34",
    "rev_20260712T123456789Z_ab12 cd34",
  ])("validates revision ID format for %s", (value) => {
    expect(isValidProjectPublishRevisionId(value)).toBe(value === REVISION_ID);
  });
});

describe("canonical JSON and FNV-1a 64-bit hash", () => {
  it("ignores object key order recursively", () => {
    const left = { z: 1, nested: { b: 2, a: 1 } };
    const right = { nested: { a: 1, b: 2 }, z: 1 };
    expect(stringifyCanonicalJson(left)).toBe(stringifyCanonicalJson(right));
    expect(hashCanonicalJson(left)).toBe(hashCanonicalJson(right));
  });

  it("preserves array order", () => {
    expect(stringifyCanonicalJson([1, 2])).not.toBe(stringifyCanonicalJson([2, 1]));
    expect(hashCanonicalJson([1, 2])).not.toBe(hashCanonicalJson([2, 1]));
  });

  it("does not mutate input", () => {
    const input = { z: 1, a: { d: 4, c: 3 } };
    const before = JSON.stringify(input);
    stringifyCanonicalJson(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["Date", new Date("2026-07-12T12:00:00Z")],
    ["Map", new Map()],
    ["Set", new Set()],
  ])("rejects unsupported %s", (_label, value) => {
    expect(() => stringifyCanonicalJson(value as CanonicalJsonValue)).toThrow(TypeError);
  });

  it("rejects class instances and cyclic objects", () => {
    class Fixture {}
    expect(() => stringifyCanonicalJson(new Fixture() as CanonicalJsonValue)).toThrow(TypeError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => stringifyCanonicalJson(cyclic as CanonicalJsonValue)).toThrow(TypeError);
  });

  it("uses a stable fixed hash format", () => {
    expect(hashCanonicalJson({ hello: "world" })).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(hashCanonicalJson({})).toBe("fnv1a64:08f44b07b5901a25");
    expect(hashCanonicalJson({ hello: "world" })).toBe(
      hashCanonicalJson({ hello: "world" }),
    );
  });

  it("changes manifest hash when slide order changes", () => {
    const left = buildManifest();
    const right = buildManifest();
    right.slides.reverse();
    expect(getProjectManifestCanonicalHash(left)).not.toBe(
      getProjectManifestCanonicalHash(right),
    );
  });

  it("changes manifest hash when content changes", () => {
    const left = buildManifest();
    const right = buildManifest();
    right.slides[0].caption = "Changed caption";
    expect(getProjectManifestCanonicalHash(left)).not.toBe(
      getProjectManifestCanonicalHash(right),
    );
  });
});
