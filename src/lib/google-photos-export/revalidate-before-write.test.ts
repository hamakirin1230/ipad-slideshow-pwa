import { describe, expect, it, vi } from "vitest";
import type {
  DriveFileCandidate,
  DriveProjectSummary,
  ProjectManifest,
} from "../google-drive";
import { GOOGLE_PHOTOS_EXPORT_ERROR_MESSAGES } from "./contract";
import { prepareGooglePhotosExportSourceWithAdapter } from "./drive-source";
import type { GooglePhotosExportSourceAdapter } from "./drive-source";
import {
  commitGooglePhotosExportAfterFreshValidation,
  type GooglePhotosExportWriteAdapter,
} from "./workflow";
import type { GooglePhotosExportRuntime } from "./contract";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const IMAGE_ASSET_ID_B = "88888888-8888-4888-8888-888888888888";
const IMAGE_ASSET_ID_C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SLIDE_IDS = [
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
] as const;

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

describe("google photos export revalidation before write", () => {
  it("blocks caption changes before any Photos write", async () => {
    const source = createSource();
    const prepared = await preparePlan(source.adapter);
    source.manifest.slides[0] = {
      ...source.manifest.slides[0]!,
      caption: "夕方",
    };
    const write = createWriteAdapter();

    const result = await commitWith(prepared, source.adapter, write);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "sourceChanged" },
      canResume: false,
    });
    expectPhotosWriteNotStarted(write);
  });

  it("blocks image edit changes before any Photos write", async () => {
    const source = createSource();
    const prepared = await preparePlan(source.adapter);
    source.manifest.slides[0] = {
      ...source.manifest.slides[0]!,
      imageEdit: {
        rotation: 90,
        crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
      },
    };
    const write = createWriteAdapter();

    const result = await commitWith(prepared, source.adapter, write);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "sourceChanged" },
      canResume: false,
    });
    expectPhotosWriteNotStarted(write);
  });

  it("blocks slide reorder before any Photos write", async () => {
    const source = createSource();
    const prepared = await preparePlan(source.adapter);
    const [first, second] = source.manifest.slides;
    source.manifest.slides = [second!, first!];
    const write = createWriteAdapter();

    const result = await commitWith(prepared, source.adapter, write);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "sourceChanged" },
      canResume: false,
    });
    expectPhotosWriteNotStarted(write);
  });

  it("blocks asset changes before any Photos write", async () => {
    const source = createSource();
    const prepared = await preparePlan(source.adapter);
    source.manifest.slides[0] = {
      ...source.manifest.slides[0]!,
      assetId: IMAGE_ASSET_ID_C,
      assetFileId: "image-file-c",
      assetName: "other.jpg",
    };
    const write = createWriteAdapter();

    const result = await commitWith(prepared, source.adapter, write);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "sourceChanged" },
      canResume: false,
    });
    expectPhotosWriteNotStarted(write);
  });

  it("blocks project title changes before any Photos write", async () => {
    const source = createSource();
    const prepared = await preparePlan(source.adapter);
    source.manifest.title = "冬の記録";
    const write = createWriteAdapter();

    const result = await commitWith(prepared, source.adapter, write);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "sourceChanged" },
      canResume: false,
    });
    expectPhotosWriteNotStarted(write);
  });

  it("proceeds with the reviewed album title when the source is unchanged", async () => {
    const source = createSource();
    const prepared = await preparePlan(source.adapter);
    const write = createWriteAdapter();

    const result = await commitWith(prepared, source.adapter, write, {
      now: new Date("2026-08-16T02:05:00.000Z"),
    });

    expect(result).toEqual({
      ok: true,
      result: {
        albumTitle: prepared.plan.albumTitle,
        mediaItemCount: 2,
        completedAt: "2026-08-16T02:05:00.000Z",
        productUrl: "https://photos.google.com/lr/album/safe",
      },
    });
    expect(write.resumable.startSession).toHaveBeenCalled();
    expect(write.library.batchCreateMediaItems).toHaveBeenCalledTimes(1);
    expect(write.library.createAlbum).toHaveBeenCalledTimes(1);
  });

  it("passes fresh manifest captions through to batchCreate when unchanged", async () => {
    const source = createSource();
    const prepared = await preparePlan(source.adapter);
    const write = createWriteAdapter();

    const result = await commitWith(prepared, source.adapter, write);
    expect(result.ok).toBe(true);

    expect(write.library.batchCreateMediaItems).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({ description: "朝" }),
          expect.objectContaining({ description: "夜" }),
        ],
      }),
    );
    expect(prepared.plan.items.map((item) => item.description)).toEqual([
      source.manifest.slides[0]?.caption,
      source.manifest.slides[1]?.caption,
    ]);
  });

  it("does not resume an upload after the source caption changes", async () => {
    const source = createSource();
    const prepared = await preparePlan(source.adapter);
    source.manifest.slides[0] = {
      ...source.manifest.slides[0]!,
      caption: "夕方",
    };
    const write = createWriteAdapter();

    const result = await commitWith(
      {
        ...prepared,
        uploadTokens: ["already-uploaded-token"],
        currentUpload: {
          slideIndex: 1,
          sessionUrl: "https://photos.example/existing-session",
          chunkGranularity: 256 * 1024,
          offset: 4,
          payloadMimeType: "image/jpeg",
          payloadSizeBytes: 1000,
          payloadFileName: "dusk.jpg",
        },
      },
      source.adapter,
      write,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "sourceChanged" },
      canResume: false,
    });
    expectPhotosWriteNotStarted(write);
    expect(write.resumable.querySession).not.toHaveBeenCalled();
    expect(write.library.batchCreateMediaItems).not.toHaveBeenCalled();
    expect(write.renderImage).not.toHaveBeenCalled();
  });

  it("keeps the sourceChanged message free of IDs, checksums, URLs, and raw errors", async () => {
    const source = createSource();
    const prepared = await preparePlan(source.adapter);
    source.manifest.slides[0] = {
      ...source.manifest.slides[0]!,
      caption: "夕方",
    };
    const result = await commitWith(
      prepared,
      source.adapter,
      createWriteAdapter(),
    );

    expect(result).toMatchObject({ ok: false, error: { kind: "sourceChanged" } });
    if (result.ok) return;
    const serialized = JSON.stringify(result);
    expect(result.error.message).toBe(
      GOOGLE_PHOTOS_EXPORT_ERROR_MESSAGES.sourceChanged,
    );
    expect(result.error.message).toContain("書き出し前に確認");
    expect(serialized).not.toContain(PROJECT_ID);
    expect(serialized).not.toContain("project-folder");
    expect(serialized).not.toContain("image-file");
    expect(serialized).not.toContain(SLIDE_IDS[0]);
    expect(serialized).not.toContain(IMAGE_ASSET_ID);
    expect(serialized).not.toMatch(/checksum/i);
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("photoslibrary.googleapis.com");
    expect(serialized).not.toContain("drive-token-secret");
    expect(serialized).not.toContain("raw");
  });
});

async function preparePlan(adapter: GooglePhotosExportSourceAdapter) {
  const prepared = await prepareGooglePhotosExportSourceWithAdapter(
    sourceInput(),
    adapter,
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error("expected a prepared export plan");
  }
  return {
    plan: prepared.plan,
    uploadTokens: [] as string[],
    uploadedFileNames: [] as string[],
    currentUpload: null,
  } satisfies GooglePhotosExportRuntime;
}

async function commitWith(
  runtime: GooglePhotosExportRuntime,
  source: GooglePhotosExportSourceAdapter,
  write: GooglePhotosExportWriteAdapter,
  extra: { now?: Date } = {},
) {
  return commitGooglePhotosExportAfterFreshValidation(
    {
      driveAccessToken: "drive-token-secret",
      photosAccessToken: "photos-token-secret",
      selectedProjectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      projectsRootFolderId: "projects-root",
      project,
      runtime,
      signal: new AbortController().signal,
      onProgress: () => undefined,
      onRuntime: () => undefined,
      ...extra,
    },
    { source, write },
  );
}

function expectPhotosWriteNotStarted(write: GooglePhotosExportWriteAdapter) {
  expect(write.resumable.startSession).not.toHaveBeenCalled();
  expect(write.resumable.uploadChunk).not.toHaveBeenCalled();
  expect(write.openDriveAssetStream).not.toHaveBeenCalled();
  expect(write.renderImage).not.toHaveBeenCalled();
  expect(write.library.batchCreateMediaItems).not.toHaveBeenCalled();
  expect(write.library.createAlbum).not.toHaveBeenCalled();
  expect(write.library.batchAddMediaItems).not.toHaveBeenCalled();
}

function createWriteAdapter(): GooglePhotosExportWriteAdapter {
  return {
    openDriveAssetStream: vi.fn(async () => new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    })),
    renderImage: vi.fn(async ({ fileName }) => ({
      blob: new Blob([new Uint8Array(8)], { type: "image/jpeg" }),
      mimeType: "image/jpeg" as const,
      fileName,
    })),
    resumable: {
      startSession: vi.fn(async () => ({
        sessionUrl: "https://photos.example/session",
        chunkGranularity: 256 * 1024,
      })),
      uploadChunk: vi.fn(async (input) => (input.finalize ? "upload-token" : null)),
      querySession: vi.fn(async () => ({ ok: false as const })),
    },
    library: {
      batchCreateMediaItems: vi.fn(async () => ({
        ok: true as const,
        mediaItemIds: ["media-1", "media-2"],
      })),
      createAlbum: vi.fn(async () => ({
        ok: true as const,
        albumId: "album-secret",
        productUrl: "https://photos.google.com/lr/album/safe",
      })),
      batchAddMediaItems: vi.fn(async () => true),
    },
  };
}

function createSource() {
  const manifest = buildManifest();
  const files = defaultFiles();
  const adapter: GooglePhotosExportSourceAdapter = {
    readMetadata: vi.fn(async ({ fileId }) => {
      const metadata = files[fileId];
      if (!metadata) throw new Error("missing metadata");
      return metadata;
    }),
    readText: vi.fn(async () => JSON.stringify(manifest)),
  };
  return { manifest, files, adapter };
}

function sourceInput() {
  return {
    accessToken: "drive-token-secret",
    selectedProjectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    projectsRootFolderId: "projects-root",
    project,
    now: new Date(2026, 7, 16, 11, 5),
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
        slideId: SLIDE_IDS[0],
        assetId: IMAGE_ASSET_ID,
        assetFileId: "image-file",
        assetName: "beach.jpg",
        mimeType: "image/jpeg",
        fileSize: 1000,
        caption: "朝",
        durationSeconds: 10,
      }),
      slide({
        slideId: SLIDE_IDS[1],
        assetId: IMAGE_ASSET_ID_B,
        assetFileId: "image-file-b",
        assetName: "dusk.jpg",
        mimeType: "image/jpeg",
        fileSize: 1000,
        caption: "夜",
        durationSeconds: 12,
      }),
    ],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
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
    "image-file": file("image-file", "beach.jpg", "image/jpeg", "asset", {
      sizeBytes: 1000,
      appProperties: assetProperties(IMAGE_ASSET_ID),
    }),
    "image-file-b": file("image-file-b", "dusk.jpg", "image/jpeg", "asset", {
      sizeBytes: 1000,
      appProperties: assetProperties(IMAGE_ASSET_ID_B),
    }),
    "image-file-c": file("image-file-c", "other.jpg", "image/jpeg", "asset", {
      sizeBytes: 1000,
      appProperties: assetProperties(IMAGE_ASSET_ID_C),
    }),
  };
}

function slide(
  value: ProjectManifest["slides"][number],
): ProjectManifest["slides"][number] {
  return {
    source: "localFile",
    sourceMimeType: value.mimeType,
    sourceMediaItemId: "source",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    ...value,
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
