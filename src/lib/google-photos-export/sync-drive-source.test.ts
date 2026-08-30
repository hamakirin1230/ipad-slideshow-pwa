import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type {
  DriveFileCandidate,
  DriveProjectSummary,
  ProjectManifest,
} from "../google-drive";
import type { GooglePhotosExportSourceAdapter } from "./drive-source";
import {
  prepareGooglePhotosSyncSourceWithAdapter,
  type GooglePhotosSyncSourcePreparationHost,
} from "./sync-drive-source";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ASSET_ID_A = "33333333-3333-4333-8333-333333333333";
const IMAGE_ASSET_ID_B = "44444444-4444-4444-8444-444444444444";
const VIDEO_ASSET_ID = "55555555-5555-4555-8555-555555555555";
const SLIDE_ID_A = "66666666-6666-4666-8666-666666666666";
const SLIDE_ID_B = "77777777-7777-4777-8777-777777777777";
const VIDEO_SLIDE_ID = "88888888-8888-4888-8888-888888888888";

const project: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: "夏の記録",
  projectFolderId: "project-folder",
  manifestFileId: "manifest-file",
  assetsFolderId: "assets-folder",
  manifestPath: `projects/${PROJECT_ID}/manifest.json`,
  createdAt: "2026-08-16T01:00:00.000Z",
  updatedAt: "2026-08-16T02:00:00.000Z",
};

function input() {
  return {
    accessToken: "drive-token-secret",
    selectedProjectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    projectsRootFolderId: "projects-root",
    project,
    signal: new AbortController().signal,
  };
}

function buildManifest(): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: "夏の記録",
    slides: [
      slide({
        slideId: SLIDE_ID_A,
        assetId: IMAGE_ASSET_ID_A,
        assetFileId: "image-a",
        assetName: "beach.jpg",
        mimeType: "image/jpeg",
        fileSize: 1000,
        durationSeconds: 10,
        caption: "  朝  ",
        imageEdit: { rotation: 90 },
      }),
      slide({
        slideId: SLIDE_ID_B,
        assetId: IMAGE_ASSET_ID_B,
        assetFileId: "image-b",
        assetName: "dusk.png",
        mimeType: "image/png",
        fileSize: 1200,
        durationSeconds: 12,
        caption: "夜",
      }),
      slide({
        slideId: VIDEO_SLIDE_ID,
        assetId: VIDEO_ASSET_ID,
        assetFileId: "video-file",
        assetName: "clip.mp4",
        type: "video",
        mimeType: "video/mp4",
        fileSize: 1500,
        durationSeconds: 15,
        caption: "",
      }),
    ],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function slide(
  value: ProjectManifest["slides"][number],
): ProjectManifest["slides"][number] {
  return {
    source: "localFile",
    sourceMimeType: value.mimeType,
    sourceMediaItemId: "source-media",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    ...value,
  };
}

function defaultFiles(): Record<string, DriveFileCandidate> {
  return {
    "project-folder": file(
      "project-folder",
      PROJECT_ID,
      "application/vnd.google-apps.folder",
      "projectRoot",
      { parents: ["projects-root"] },
    ),
    "manifest-file": file(
      "manifest-file",
      "manifest.json",
      "application/json",
      "projectManifest",
      { parents: ["project-folder"] },
    ),
    "assets-folder": file(
      "assets-folder",
      "assets",
      "application/vnd.google-apps.folder",
      "assetsRoot",
      { parents: ["project-folder"] },
    ),
    "image-a": file("image-a", "beach.jpg", "image/jpeg", "asset", {
      sizeBytes: 1000,
      checksum: "checksum-a",
      modifiedTime: "2026-08-16T03:00:00.000Z",
      appProperties: assetProperties(IMAGE_ASSET_ID_A),
    }),
    "image-b": file("image-b", "dusk.png", "image/png", "asset", {
      sizeBytes: 1200,
      checksum: "checksum-b",
      modifiedTime: "2026-08-16T03:01:00.000Z",
      appProperties: assetProperties(IMAGE_ASSET_ID_B),
    }),
    "video-file": file("video-file", "clip.mp4", "video/mp4", "asset", {
      sizeBytes: 1500,
      checksum: "video-checksum",
      modifiedTime: "2026-08-16T03:02:00.000Z",
      appProperties: assetProperties(VIDEO_ASSET_ID),
    }),
  };
}

function file(
  id: string,
  name: string,
  mimeType: string,
  role: string,
  extra: Partial<DriveFileCandidate> = {},
): DriveFileCandidate {
  const { appProperties, ...rest } = extra;
  return {
    id,
    name,
    mimeType,
    trashed: false,
    parents: ["assets-folder"],
    appProperties: {
      app: "ipad-slideshow-pwa",
      role,
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      ...appProperties,
    },
    ...rest,
  };
}

function assetProperties(assetId: string) {
  return {
    app: "ipad-slideshow-pwa",
    role: "asset",
    schemaVersion: "1",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    assetId,
  };
}

function createAdapter(options: {
  manifest?: ProjectManifest;
  manifestText?: string;
  files?: Record<string, DriveFileCandidate>;
  readError?: Error;
} = {}): GooglePhotosExportSourceAdapter & {
  readMetadata: ReturnType<typeof vi.fn>;
  readText: ReturnType<typeof vi.fn>;
} {
  const manifest = options.manifest ?? buildManifest();
  const files = options.files ?? defaultFiles();
  return {
    readMetadata: vi.fn(async ({ fileId }) => {
      if (options.readError) throw options.readError;
      const metadata = files[fileId];
      if (!metadata) throw new Error("raw missing metadata identifier");
      return metadata;
    }),
    readText: vi.fn(async () =>
      options.manifestText ?? JSON.stringify(manifest),
    ),
  };
}

describe("Google Photos sync Drive source", () => {
  it("reuses export preflight and prepares ordered sync identities from cached metadata", async () => {
    const adapter = createAdapter();
    const result = await prepareGooglePhotosSyncSourceWithAdapter(input(), adapter);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toMatchObject({
      projectId: PROJECT_ID,
      projectTitle: "夏の記録",
      targetAlbumTitle: "夏の記録",
      sourceSlideCount: 3,
      skippedVideoCount: 1,
      totalBytes: 2200,
      rendererVersion: 1,
    });
    expect(result.source.targetAlbumTitle).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(result.source.targetAlbumTitle).not.toContain(PROJECT_ID);
    expect(result.source.items.map((item) => item.slideId)).toEqual([
      SLIDE_ID_A,
      SLIDE_ID_B,
    ]);
    expect(result.source.items[0]).toMatchObject({
      slideIndex: 0,
      assetFileId: "image-a",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      description: "朝",
      imageEdit: { rotation: 90 },
      sourceChecksum: "checksum-a",
      sourceModifiedTime: "2026-08-16T03:00:00.000Z",
      outputMimeType: "image/jpeg",
      reuseEligible: true,
    });
    expect(result.source.items[0]?.renderKey).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.source.desiredSlides).toEqual(
      result.source.items.map(({ slideId, renderKey, reuseEligible }) => ({
        slideId,
        renderKey,
        reuseEligible,
      })),
    );
    expect(result.source.sourceFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(adapter.readMetadata).toHaveBeenCalledTimes(6);
    for (const fileId of [
      "project-folder",
      "manifest-file",
      "assets-folder",
      "image-a",
      "image-b",
      "video-file",
    ]) {
      expect(
        adapter.readMetadata.mock.calls.filter(([call]) => call.fileId === fileId),
      ).toHaveLength(1);
    }
    expect(JSON.stringify(result)).not.toContain("drive-token-secret");
  });

  it("uses the saved manifest title directly and changes fingerprint on rename", async () => {
    const original = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter(),
    );
    const renamedManifest = buildManifest();
    renamedManifest.title = "秋の記録";
    const renamed = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ manifest: renamedManifest }),
    );
    expect(original.ok).toBe(true);
    expect(renamed.ok).toBe(true);
    if (!original.ok || !renamed.ok) return;
    expect(renamed.source.targetAlbumTitle).toBe("秋の記録");
    expect(renamed.source.sourceFingerprint).not.toBe(
      original.source.sourceFingerprint,
    );
  });

  it("trims the saved title and preserves existing empty-title validation", async () => {
    const trimmedManifest = buildManifest();
    trimmedManifest.title = "  作品  ";
    const trimmed = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ manifest: trimmedManifest }),
    );
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) return;
    expect(trimmed.source.targetAlbumTitle).toBe("作品");

    const unnamedManifest = buildManifest();
    unnamedManifest.title = "";
    const unnamed = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ manifest: unnamedManifest }),
    );
    expect(unnamed).toMatchObject({
      ok: false,
      error: { kind: "drivePreflightFailed" },
      diagnostics: { kind: "invalidManifest" },
    });
  });

  it("keeps render identity independent from reordered slideIndex and fileName fallback", async () => {
    const first = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter(),
    );
    const reorderedManifest = buildManifest();
    reorderedManifest.slides = [
      reorderedManifest.slides[1]!,
      reorderedManifest.slides[0]!,
      reorderedManifest.slides[2]!,
    ];
    const reordered = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ manifest: reorderedManifest }),
    );
    expect(first.ok).toBe(true);
    expect(reordered.ok).toBe(true);
    if (!first.ok || !reordered.ok) return;
    const firstKeys = new Map(
      first.source.items.map((item) => [item.slideId, item.renderKey]),
    );
    for (const item of reordered.source.items) {
      expect(item.renderKey).toBe(firstKeys.get(item.slideId));
    }
    expect(reordered.source.desiredSlides.map((item) => item.slideId)).toEqual([
      SLIDE_ID_B,
      SLIDE_ID_A,
    ]);
    expect(reordered.source.sourceFingerprint).not.toBe(
      first.source.sourceFingerprint,
    );
  });

  it("keeps fingerprint unchanged for duration and transition-only changes", async () => {
    const original = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter(),
    );
    const presentationChanged = buildManifest();
    presentationChanged.slides[0]!.durationSeconds = 99;
    presentationChanged.transition = "fade";
    presentationChanged.transitionStrength = "strong";
    const changed = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ manifest: presentationChanged }),
    );
    expect(original.ok).toBe(true);
    expect(changed.ok).toBe(true);
    if (!original.ok || !changed.ok) return;
    expect(changed.source.sourceFingerprint).toBe(
      original.source.sourceFingerprint,
    );
  });

  it("marks checksum-missing metadata non-reusable when modifiedTime is valid", async () => {
    const files = defaultFiles();
    delete files["image-a"]!.checksum;
    const result = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ files }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.items[0]).toMatchObject({
      sourceChecksum: null,
      sourceModifiedTime: "2026-08-16T03:00:00.000Z",
      reuseEligible: false,
    });
  });

  it.each([
    ["missing modifiedTime", (file: DriveFileCandidate) => {
      delete file.checksum;
      delete file.modifiedTime;
    }],
    ["malformed modifiedTime", (file: DriveFileCandidate) => {
      delete file.checksum;
      file.modifiedTime = "not-a-time";
    }],
    ["blank checksum", (file: DriveFileCandidate) => {
      file.checksum = " ";
    }],
    ["missing metadata size", (file: DriveFileCandidate) => {
      delete file.sizeBytes;
    }],
  ])("fails closed for %s", async (_label, mutate) => {
    const files = defaultFiles();
    mutate(files["image-a"]!);
    const result = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ files }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "drivePreflightFailed" },
      reason: "sourceMetadataUnavailable",
    });
    expect(JSON.stringify(result)).not.toContain("image-a");
  });

  it("maps render identity and fingerprint failures to safe reasons", async () => {
    const renderHost: GooglePhotosSyncSourcePreparationHost = {
      createRenderIdentity: vi.fn(async () => ({
        ok: false,
        reason: "digestUnavailable",
      })),
    };
    const renderFailure = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter(),
      renderHost,
    );
    expect(renderFailure).toMatchObject({
      ok: false,
      error: { kind: "imageRenderFailed" },
      reason: "renderIdentityFailed",
    });

    const fingerprintHost: GooglePhotosSyncSourcePreparationHost = {
      createSourceFingerprint: vi.fn(async () => ({
        ok: false,
        reason: "digestUnavailable",
      })),
    };
    const fingerprintFailure = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter(),
      fingerprintHost,
    );
    expect(fingerprintFailure).toMatchObject({
      ok: false,
      error: { kind: "drivePreflightFailed" },
      reason: "sourceFingerprintFailed",
    });
  });
});

describe("Google Photos sync source keeps existing preflight semantics", () => {
  it("preserves selected project mismatch", async () => {
    const adapter = createAdapter();
    const result = await prepareGooglePhotosSyncSourceWithAdapter(
      { ...input(), selectedProjectId: "other-project" },
      adapter,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "drivePreflightFailed" },
      diagnostics: { kind: "selectedProjectMismatch" },
    });
    expect(adapter.readMetadata).not.toHaveBeenCalled();
  });

  it("preserves malformed manifest and metadata mismatch failures", async () => {
    const malformed = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ manifestText: "{" }),
    );
    expect(malformed).toMatchObject({
      ok: false,
      diagnostics: { kind: "manifestJsonParseFailure" },
    });

    const files = defaultFiles();
    files["image-a"]!.mimeType = "image/png";
    const mismatch = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ files }),
    );
    expect(mismatch).toMatchObject({
      ok: false,
      diagnostics: { kind: "assetMimeTypeMismatch" },
    });
  });

  it("preserves unsupported media and duplicate content restrictions", async () => {
    const unsupportedManifest = buildManifest();
    unsupportedManifest.slides[0]!.mimeType = "image/gif";
    unsupportedManifest.slides[0]!.sourceMimeType = "image/gif";
    const unsupported = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ manifest: unsupportedManifest }),
    );
    expect(unsupported).toMatchObject({
      ok: false,
      error: { kind: "unsupportedMedia" },
    });

    const files = defaultFiles();
    files["image-b"]!.checksum = "checksum-a";
    files["image-b"]!.sizeBytes = 1000;
    const duplicateManifest = buildManifest();
    duplicateManifest.slides[1]!.fileSize = 1000;
    duplicateManifest.slides[1]!.mimeType = "image/jpeg";
    duplicateManifest.slides[1]!.sourceMimeType = "image/jpeg";
    duplicateManifest.slides[1]!.assetName = "copy.jpg";
    files["image-b"]!.mimeType = "image/jpeg";
    files["image-b"]!.name = "copy.jpg";
    const duplicate = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ manifest: duplicateManifest, files }),
    );
    expect(duplicate).toMatchObject({
      ok: false,
      error: { kind: "duplicateSlidesUnsupported" },
    });
  });

  it("preserves no-photos and sanitized Drive read failures", async () => {
    const videoOnly = buildManifest();
    videoOnly.slides = [videoOnly.slides[2]!];
    const noPhotos = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ manifest: videoOnly }),
    );
    expect(noPhotos).toMatchObject({
      ok: false,
      error: { kind: "noExportablePhotos" },
      diagnostics: { kind: "noExportablePhotos" },
    });

    const raw = "raw Drive URL token file ID and project ID";
    const readFailure = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ readError: new Error(raw) }),
    );
    expect(readFailure).toMatchObject({
      ok: false,
      diagnostics: { kind: "driveReadFailed" },
    });
    expect(JSON.stringify(readFailure)).not.toContain(raw);
    expect(JSON.stringify(readFailure)).not.toContain(PROJECT_ID);
  });

  it("fails closed before sync preparation for over-limit or invalid saved titles", async () => {
    const overLimit = buildManifest();
    overLimit.title = "x".repeat(501);
    const result = await prepareGooglePhotosSyncSourceWithAdapter(
      input(),
      createAdapter({ manifest: overLimit }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "drivePreflightFailed" },
      reason: "invalidTargetTitle",
    });
  });
});

describe("Google Photos sync source security contract", () => {
  it("adds no Photos API, binding write, storage, logging, or token persistence", () => {
    const source = readFileSync(
      new URL("./sync-drive-source.ts", import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      "photoslibrary.googleapis.com",
      "readDrivePhotosSyncBinding",
      "createDrivePhotosSyncBinding",
      "updateDrivePhotosSyncBinding",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "console.log",
      "console.error",
      "console.warn",
      "setTimeout",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
