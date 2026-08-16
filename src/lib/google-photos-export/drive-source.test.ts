import { describe, expect, it } from "vitest";
import { DRIVE_VIDEO_MAX_BYTES } from "../drive-video-policy";
import type {
  DriveFileCandidate,
  DriveProjectSummary,
  ProjectManifest,
} from "../google-drive";
import { prepareGooglePhotosExportSourceWithAdapter } from "./drive-source";
import type { GooglePhotosExportSourceAdapter } from "./drive-source";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const VIDEO_ASSET_ID = "44444444-4444-4444-8444-444444444444";
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
  it("keeps slide order and treats duplicate assets as separate export items", async () => {
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.items.map((item) => item.slideIndex)).toEqual([0, 1, 2]);
    expect(result.plan.items.map((item) => item.description)).toEqual([
      "朝",
      "夜",
      "",
    ]);
    expect(result.plan.totalBytes).toBe(3500);
    expect(result.plan.items[0]?.assetFileId).toBe(
      result.plan.items[1]?.assetFileId,
    );
    expect(JSON.stringify(result.plan)).not.toContain("durationSeconds");
    expect(JSON.stringify(result)).not.toContain("accessToken");
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

  it("blocks videos larger than the existing 5GiB limit", async () => {
    const files = defaultFiles();
    files["video-file"] = file("video-file", "clip.mp4", "video/mp4", "asset", {
      sizeBytes: DRIVE_VIDEO_MAX_BYTES + 1,
      appProperties: assetProperties(VIDEO_ASSET_ID),
    });
    const result = await prepareGooglePhotosExportSourceWithAdapter(
      input(),
      createAdapter({ files }),
    );

    expect(result).toMatchObject({
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
    async readMetadata({ fileId }) {
      const metadata = files[fileId];
      if (!metadata) throw new Error("missing metadata");
      return metadata;
    },
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
        assetId: IMAGE_ASSET_ID,
        assetFileId: "image-file",
        assetName: "beach.jpg",
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
