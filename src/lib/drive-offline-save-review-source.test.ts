import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  readDriveOfflineSaveReviewSource,
  type DriveOfflineSaveReviewSourceAdapters,
} from "./drive-offline-save-review-source";
import { DRIVE_VIDEO_OFFLINE_MAX_BYTES } from "./drive-video-policy";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const VIDEO_ASSET_ID = "44444444-4444-4444-8444-444444444444";
const implementation = readFileSync(
  new URL("./drive-offline-save-review-source.ts", import.meta.url),
  "utf8",
);

const project = {
  projectId: PROJECT_ID,
  title: "Album",
  projectFolderId: "project-folder",
  manifestFileId: "manifest-file",
  assetsFolderId: "assets-folder",
  manifestPath: "manifest.json",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
};

const readyContext = {
  workspaceId: WORKSPACE_ID,
  workspaceRootFolderId: "root-folder",
  workspaceJsonFileId: "workspace-file",
  indexJsonFileId: "index-file",
  projectsRootFolderId: "projects-folder",
  indexJsonText: "{}",
};

function slide(input: {
  slideId: string;
  assetId: string;
  assetFileId: string;
  assetName: string;
  mimeType: string;
  type?: "image" | "video";
}) {
  return {
    slideId: input.slideId,
    assetId: input.assetId,
    assetFileId: input.assetFileId,
    assetName: input.assetName,
    ...(input.type ? { type: input.type } : {}),
    mimeType: input.mimeType,
    source: "localFile" as const,
    sourceMimeType: input.mimeType,
    sourceMediaItemId: `source-${input.assetId}`,
    caption: "",
    durationSeconds: 10,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function manifest(slides: ReturnType<typeof slide>[]) {
  return {
    app: "ipad-slideshow-pwa" as const,
    role: "projectManifest" as const,
    schemaVersion: 1 as const,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: project.title,
    slides,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function manifestMetadata(modifiedTime = "2026-08-31T00:01:00.000Z") {
  return {
    id: project.manifestFileId,
    name: "manifest.json",
    mimeType: "application/json",
    modifiedTime,
    parents: [project.projectFolderId],
    appProperties: {
      app: "ipad-slideshow-pwa",
      role: "projectManifest",
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    },
  };
}

function assetMetadata(input: {
  assetId: string;
  fileId: string;
  mimeType: string;
  sizeBytes: number;
}) {
  return {
    id: input.fileId,
    name: input.fileId,
    mimeType: input.mimeType,
    modifiedTime: "2026-08-31T00:00:00.000Z",
    sizeBytes: input.sizeBytes,
    checksum: `checksum-${input.assetId}`,
    parents: [project.assetsFolderId],
    appProperties: {
      app: "ipad-slideshow-pwa",
      role: "asset",
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      assetId: input.assetId,
    },
  };
}

function adapters(input: {
  slides: ReturnType<typeof slide>[];
  metadata: unknown[];
  finalManifest?: unknown;
}): DriveOfflineSaveReviewSourceAdapters & {
  readMetadata: ReturnType<typeof vi.fn>;
  readText: ReturnType<typeof vi.fn>;
} {
  const metadata = [...input.metadata];
  return {
    readMetadata: vi.fn(async () => metadata.shift() as never),
    readText: vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(manifest(input.slides)))
      .mockResolvedValueOnce(
        JSON.stringify(input.finalManifest ?? manifest(input.slides)),
      ),
  };
}

describe("Drive offline save review source", () => {
  it("has no asset-body, staging-write, promotion, or IndexedDB mutation dependency", () => {
    expect(implementation).not.toContain("fetchDriveProjectAssetBlob");
    expect(implementation).not.toContain("writeCompleteOfflineStagingSnapshot");
    expect(implementation).not.toContain("promoteOfflineStagingForSyncRun");
    expect(implementation).not.toContain("runOfflineTransaction");
  });

  it("reads manifest and metadata only while separating local and large-video policy", async () => {
    const image = slide({
      slideId: "55555555-5555-4555-8555-555555555555",
      assetId: IMAGE_ASSET_ID,
      assetFileId: "image-file",
      assetName: "photo.jpg",
      mimeType: "image/jpeg",
      type: "image",
    });
    const video = slide({
      slideId: "66666666-6666-4666-8666-666666666666",
      assetId: VIDEO_ASSET_ID,
      assetFileId: "video-file",
      assetName: "large.mov",
      mimeType: "video/quicktime",
      type: "video",
    });
    const host = adapters({
      slides: [image, video],
      metadata: [
        manifestMetadata(),
        manifestMetadata(),
        assetMetadata({
          assetId: IMAGE_ASSET_ID,
          fileId: image.assetFileId,
          mimeType: image.mimeType,
          sizeBytes: 4,
        }),
        assetMetadata({
          assetId: VIDEO_ASSET_ID,
          fileId: video.assetFileId,
          mimeType: video.mimeType,
          sizeBytes: DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1,
        }),
        manifestMetadata(),
        manifestMetadata(),
      ],
    });

    const result = await readDriveOfflineSaveReviewSource(
      {
        accessToken: "token-secret",
        readyContext,
        project,
        signal: new AbortController().signal,
      },
      host,
    );

    expect(result.slides.map((item) => item.transfer.requiresBlob)).toEqual([
      true,
      false,
    ]);
    expect(host.readText).toHaveBeenCalledTimes(2);
    expect(host.readMetadata).toHaveBeenCalledTimes(6);
    expect(Object.keys(host).sort()).toEqual(["readMetadata", "readText"]);
  });

  it("fails closed when the manifest changes during review", async () => {
    const image = slide({
      slideId: "55555555-5555-4555-8555-555555555555",
      assetId: IMAGE_ASSET_ID,
      assetFileId: "image-file",
      assetName: "photo.jpg",
      mimeType: "image/jpeg",
    });
    const host = adapters({
      slides: [image],
      finalManifest: { ...manifest([image]), title: "Changed" },
      metadata: [
        manifestMetadata(),
        manifestMetadata(),
        assetMetadata({
          assetId: IMAGE_ASSET_ID,
          fileId: image.assetFileId,
          mimeType: image.mimeType,
          sizeBytes: 4,
        }),
        manifestMetadata(),
        manifestMetadata(),
      ],
    });

    await expect(
      readDriveOfflineSaveReviewSource(
        {
          accessToken: "token-secret",
          readyContext,
          project,
          signal: new AbortController().signal,
        },
        host,
      ),
    ).rejects.toBeInstanceOf(Error);
  });

  it("accepts fresh mutable manifest fields when the project identity matches", async () => {
    const image = slide({
      slideId: "55555555-5555-4555-8555-555555555555",
      assetId: IMAGE_ASSET_ID,
      assetFileId: "image-file",
      assetName: "photo.jpg",
      mimeType: "image/jpeg",
    });
    const freshManifest = {
      ...manifest([image]),
      title: "Fresh album title",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const host = adapters({
      slides: [image],
      finalManifest: freshManifest,
      metadata: [
        manifestMetadata(),
        manifestMetadata(),
        assetMetadata({
          assetId: IMAGE_ASSET_ID,
          fileId: image.assetFileId,
          mimeType: image.mimeType,
          sizeBytes: 4,
        }),
        manifestMetadata(),
        manifestMetadata(),
      ],
    });
    host.readText.mockReset();
    host.readText.mockResolvedValue(JSON.stringify(freshManifest));

    const result = await readDriveOfflineSaveReviewSource(
      {
        accessToken: "token-secret",
        readyContext,
        project,
        signal: new AbortController().signal,
      },
      host,
    );

    expect(result.projectTitle).toBe("Fresh album title");
  });
});
