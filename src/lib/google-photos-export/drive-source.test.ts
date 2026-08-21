import { describe, expect, it, vi } from "vitest";
import { DRIVE_VIDEO_MAX_BYTES } from "../drive-video-policy";
import type {
  DriveFileCandidate,
  DriveProjectSummary,
  ProjectManifest,
} from "../google-drive";
import { GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES } from "./contract";
import { prepareGooglePhotosExportSourceWithAdapter } from "./drive-source";
import type { GooglePhotosExportSourceAdapter } from "./drive-source";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const IMAGE_ASSET_ID_B = "88888888-8888-4888-8888-888888888888";
const VIDEO_ASSET_ID = "44444444-4444-4444-8444-444444444444";
const CHECKSUM_ASSET_ID = "99999999-9999-4999-8999-999999999999";
const SLIDE_IDS = [
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
  "77777777-7777-4777-8777-777777777777",
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

describe("google photos export drive source", () => {
  it("keeps slide order for unique assets", async () => {
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.items.map((item) => item.slideIndex)).toEqual([0, 1]);
    expect(result.plan.items.map((item) => item.mediaKind)).toEqual([
      "image",
      "image",
    ]);
    expect(result.plan.items.map((item) => item.description)).toEqual([
      "朝",
      "夜",
    ]);
    expect(result.plan.totalBytes).toBe(2000);
    expect(result.plan.sourceSlideCount).toBe(3);
    expect(result.plan.skippedVideoCount).toBe(1);
    expect(result.plan.items[0]?.assetFileId).not.toBe(
      result.plan.items[1]?.assetFileId,
    );
    expect(JSON.stringify(result.plan)).not.toContain("durationSeconds");
    expect(JSON.stringify(result)).not.toContain("accessToken");
  });

  it("keeps photo order when videos sit between photos", async () => {
    const manifest = buildManifest();
    const [photoA, photoB, video] = manifest.slides;
    manifest.slides = [photoA!, video!, photoB!];
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter({ manifest }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.items.map((item) => item.slideIndex)).toEqual([0, 2]);
    expect(result.plan.items.map((item) => item.description)).toEqual([
      "朝",
      "夜",
    ]);
    expect(result.plan.items.map((item) => item.fileName)).toEqual([
      "beach.jpg",
      "dusk.jpg",
    ]);
    expect(result.plan.skippedVideoCount).toBe(1);
    expect(result.plan.sourceSlideCount).toBe(3);
  });

  it("skips video-only duplicates instead of blocking export", async () => {
    const manifest = buildManifest();
    manifest.slides[1] = {
      ...manifest.slides[2]!,
      slideId: SLIDE_IDS[1],
      assetId: VIDEO_ASSET_ID,
      assetFileId: "video-file",
      assetName: "clip.mp4",
      type: "video",
      mimeType: "video/mp4",
    };
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter({ manifest }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.items).toHaveLength(1);
    expect(result.plan.items[0]?.mimeType).toBe("image/jpeg");
    expect(result.plan.skippedVideoCount).toBe(2);
  });

  it("blocks the same photo assetFileId used on multiple slides before a write plan", async () => {
    const manifest = buildManifest();
    manifest.slides[1] = {
      ...manifest.slides[1]!,
      assetId: IMAGE_ASSET_ID,
      assetFileId: "image-file",
      assetName: "beach.jpg",
    };
    const adapter = createAdapter({ manifest });
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "duplicateSlidesUnsupported" },
    });
    if (result.ok) return;
    expect(result.error.message).toContain("順番を正確に再現できません");
    expect(JSON.stringify(result)).not.toContain("image-file");
    expect(JSON.stringify(result)).not.toContain(IMAGE_ASSET_ID);
    expect(JSON.stringify(result)).not.toMatch(/checksum/i);
    expect(adapter.readMetadata).toHaveBeenCalledTimes(3);
  });

  it("blocks distinct asset files whose checksum, size, and MIME all match", async () => {
    const manifest = buildManifest();
    manifest.slides[1] = slide({
      slideId: SLIDE_IDS[1],
      assetId: CHECKSUM_ASSET_ID,
      assetFileId: "image-file-copy",
      assetName: "copy.jpg",
      mimeType: "image/jpeg",
      fileSize: 1000,
      caption: "夜",
      durationSeconds: 12,
    });
    const files = defaultFiles();
    files["image-file"] = file("image-file", "beach.jpg", "image/jpeg", "asset", {
      sizeBytes: 1000,
      checksum: "same-bytes-checksum",
      appProperties: assetProperties(IMAGE_ASSET_ID),
    });
    files["image-file-copy"] = file(
      "image-file-copy",
      "copy.jpg",
      "image/jpeg",
      "asset",
      {
        sizeBytes: 1000,
        checksum: "same-bytes-checksum",
        appProperties: assetProperties(CHECKSUM_ASSET_ID),
      },
    );
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter({ manifest, files }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "duplicateSlidesUnsupported" },
    });
    expect(JSON.stringify(result)).not.toContain("same-bytes-checksum");
    expect(JSON.stringify(result)).not.toContain("image-file-copy");
    expect(JSON.stringify(result)).not.toContain(CHECKSUM_ASSET_ID);
  });

  it("blocks unsupported MIME types before any Photos write plan is returned", async () => {
    const manifest = buildManifest();
    manifest.slides[0] = {
      ...manifest.slides[0]!,
      type: "video",
      mimeType: "video/webm",
      sourceMimeType: "video/webm",
    };
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter({ manifest }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unsupportedMedia" },
    });
    expect(JSON.stringify(result)).not.toContain("image-file");
  });

  it("does not apply the Drive 5GiB video limit on the Photos export plan", async () => {
    const files = defaultFiles();
    files["video-file"] = file("video-file", "clip.mp4", "video/mp4", "asset", {
      sizeBytes: DRIVE_VIDEO_MAX_BYTES + 1,
      appProperties: assetProperties(VIDEO_ASSET_ID),
    });
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter({ files }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.items.map((item) => item.mimeType)).toEqual([
      "image/jpeg",
      "image/jpeg",
    ]);
    expect(result.plan.skippedVideoCount).toBe(1);
    expect(result.plan.totalBytes).toBe(2000);
  });

  it("skips MOV videos without creating upload items", async () => {
    const manifest = buildManifest();
    manifest.slides[2] = {
      ...manifest.slides[2]!,
      type: "video",
      mimeType: "video/quicktime",
      sourceMimeType: "video/quicktime",
      assetName: "clip.mov",
    };
    const files = defaultFiles();
    files["video-file"] = file(
      "video-file",
      "clip.mov",
      "video/quicktime",
      "asset",
      {
        sizeBytes: 1500,
        appProperties: assetProperties(VIDEO_ASSET_ID),
      },
    );
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter({ manifest, files }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.items.every((item) => item.mediaKind === "image")).toBe(
      true,
    );
    expect(result.plan.skippedVideoCount).toBe(1);
    expect(JSON.stringify(result.plan.items)).not.toContain("video/quicktime");
  });

  it("does not start an export plan when the project has videos only", async () => {
    const manifest = buildManifest();
    manifest.slides = [
      {
        ...manifest.slides[2]!,
        slideId: SLIDE_IDS[0],
      },
    ];
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter({ manifest }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "noExportablePhotos" },
    });
    if (result.ok) return;
    expect(result.error.message).toBe(
      "Googleフォトへ書き出せる写真がありません。",
    );
  });

  it("accepts an image at the 200MiB Photos limit and rejects one byte over", async () => {
    const acceptedFiles = defaultFiles();
    acceptedFiles["image-file"] = file(
      "image-file",
      "beach.jpg",
      "image/jpeg",
      "asset",
      {
        sizeBytes: GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES,
        appProperties: assetProperties(IMAGE_ASSET_ID),
      },
    );
    const accepted = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter({ files: acceptedFiles }),
    );
    expect(accepted.ok).toBe(true);

    const rejectedFiles = defaultFiles();
    rejectedFiles["image-file"] = file(
      "image-file",
      "beach.jpg",
      "image/jpeg",
      "asset",
      {
        sizeBytes: GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES + 1,
        appProperties: assetProperties(IMAGE_ASSET_ID),
      },
    );
    const rejected = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter({ files: rejectedFiles }),
    );
    expect(rejected).toMatchObject({
      ok: false,
      error: { kind: "unsupportedMedia" },
    });
  });

  it("fails when the selected project no longer matches", async () => {
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input({ selectedProjectId: "other-project" }),
      createAdapter(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "drivePreflightFailed" },
    });
    expect(JSON.stringify(result)).not.toContain("other-project");
  });
});

function input(
  overrides: Partial<Parameters<typeof prepareGooglePhotosExportSourceWithAdapter>[0]> = {},
) {
  return {
    accessToken: "drive-token-secret",
    selectedProjectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    projectsRootFolderId: "projects-root",
    project,
    now: new Date(2026, 7, 16, 11, 5),
    signal: new AbortController().signal,
    ...overrides,
  };
}

function createAdapter(options?: {
  manifest?: ProjectManifest;
  files?: Record<string, DriveFileCandidate>;
}): GooglePhotosExportSourceAdapter {
  const manifest = options?.manifest ?? buildManifest();
  const files = options?.files ?? defaultFiles();
  return {
    readMetadata: vi.fn(async ({ fileId }) => {
      const metadata = files[fileId];
      if (!metadata) throw new Error("missing metadata");
      return metadata;
    }),
    async readText() {
      return JSON.stringify(manifest);
    },
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
      slide({
        slideId: SLIDE_IDS[2],
        assetId: VIDEO_ASSET_ID,
        assetFileId: "video-file",
        assetName: "clip.mp4",
        type: "video",
        mimeType: "video/mp4",
        fileSize: 1500,
        caption: "",
        durationSeconds: 15,
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
    "video-file": file("video-file", "clip.mp4", "video/mp4", "asset", {
      sizeBytes: 1500,
      appProperties: assetProperties(VIDEO_ASSET_ID),
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
