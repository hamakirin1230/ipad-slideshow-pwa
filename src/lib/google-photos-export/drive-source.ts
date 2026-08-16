import {
  parseProjectManifest,
  type DriveFileCandidate,
  type DriveProjectSummary,
  type ProjectManifest,
} from "../google-drive";
import {
  buildGooglePhotosAlbumTitle,
  buildGooglePhotosExportFileName,
  createSanitizedGooglePhotosExportError,
  getGooglePhotosExportMediaKind,
  GOOGLE_PHOTOS_EXPORT_MAX_SLIDE_COUNT,
  isGooglePhotosExportFileSizeAllowed,
  isGooglePhotosExportMimeType,
  toGooglePhotosDescription,
  type GooglePhotosExportPlan,
  type SanitizedGooglePhotosExportError,
} from "./contract";

const APP_ID = "ipad-slideshow-pwa";
const SCHEMA_VERSION = "1";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const JSON_MIME_TYPE = "application/json";

export type GooglePhotosExportSourceAdapter = {
  readMetadata: (input: {
    accessToken: string;
    fileId: string;
    signal: AbortSignal;
  }) => Promise<DriveFileCandidate>;
  readText: (
    accessToken: string,
    fileId: string,
    signal: AbortSignal,
  ) => Promise<string>;
};

export type GooglePhotosExportSourceResult =
  | { ok: true; plan: GooglePhotosExportPlan }
  | { ok: false; error: SanitizedGooglePhotosExportError };

export async function prepareGooglePhotosExportSourceWithAdapter(
  input: {
    accessToken: string;
    selectedProjectId: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: DriveProjectSummary;
    now?: Date;
    signal: AbortSignal;
  },
  adapter: GooglePhotosExportSourceAdapter,
): Promise<GooglePhotosExportSourceResult> {
  if (input.selectedProjectId !== input.project.projectId) {
    return fail(
      "drivePreflightFailed",
      "選択中の作品が変わったため、書き出し前確認を中止しました。",
    );
  }

  try {
    const [projectFolder, manifestFile, assetsFolder, manifestText] =
      await Promise.all([
        adapter.readMetadata({
          accessToken: input.accessToken,
          fileId: input.project.projectFolderId,
          signal: input.signal,
        }),
        adapter.readMetadata({
          accessToken: input.accessToken,
          fileId: input.project.manifestFileId,
          signal: input.signal,
        }),
        adapter.readMetadata({
          accessToken: input.accessToken,
          fileId: input.project.assetsFolderId,
          signal: input.signal,
        }),
        adapter.readText(
          input.accessToken,
          input.project.manifestFileId,
          input.signal,
        ),
      ]);

    if (
      !matchesManagedFile(projectFolder, {
        id: input.project.projectFolderId,
        name: input.project.projectId,
        mimeType: FOLDER_MIME_TYPE,
        role: "projectRoot",
        parentId: input.projectsRootFolderId,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
      }) ||
      !matchesManagedFile(manifestFile, {
        id: input.project.manifestFileId,
        name: "manifest.json",
        mimeType: JSON_MIME_TYPE,
        role: "projectManifest",
        parentId: input.project.projectFolderId,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
      }) ||
      !matchesManagedFile(assetsFolder, {
        id: input.project.assetsFolderId,
        name: "assets",
        mimeType: FOLDER_MIME_TYPE,
        role: "assetsRoot",
        parentId: input.project.projectFolderId,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
      })
    ) {
      return fail("drivePreflightFailed");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(manifestText);
    } catch {
      return fail("drivePreflightFailed");
    }

    if (hasUnsupportedExportMimeType(parsedJson)) {
      return fail("unsupportedMedia");
    }

    const parsed = parseProjectManifest(parsedJson);
    if (
      !parsed.ok ||
      parsed.value.projectId !== input.project.projectId ||
      parsed.value.workspaceId !== input.workspaceId
    ) {
      return fail("drivePreflightFailed");
    }

    return buildPlanFromManifest({
      manifest: parsed.value,
      project: input.project,
      workspaceId: input.workspaceId,
      now: input.now,
      adapter,
      accessToken: input.accessToken,
      signal: input.signal,
    });
  } catch {
    return fail("drivePreflightFailed");
  }
}

async function buildPlanFromManifest(input: {
  manifest: ProjectManifest;
  project: DriveProjectSummary;
  workspaceId: string;
  now?: Date;
  adapter: GooglePhotosExportSourceAdapter;
  accessToken: string;
  signal: AbortSignal;
}): Promise<GooglePhotosExportSourceResult> {
  if (
    input.manifest.slides.length === 0 ||
    input.manifest.slides.length > GOOGLE_PHOTOS_EXPORT_MAX_SLIDE_COUNT
  ) {
    return fail("drivePreflightFailed");
  }

  const items: GooglePhotosExportPlan["items"] = [];
  for (const [slideIndex, slide] of input.manifest.slides.entries()) {
    if (!isGooglePhotosExportMimeType(slide.mimeType)) {
      return fail("unsupportedMedia");
    }

    let metadata: DriveFileCandidate;
    try {
      metadata = await input.adapter.readMetadata({
        accessToken: input.accessToken,
        fileId: slide.assetFileId,
        signal: input.signal,
      });
    } catch {
      return fail("drivePreflightFailed");
    }

    if (
      metadata.id !== slide.assetFileId ||
      metadata.trashed === true ||
      metadata.mimeType !== slide.mimeType ||
      metadata.appProperties.app !== APP_ID ||
      metadata.appProperties.role !== "asset" ||
      metadata.appProperties.schemaVersion !== SCHEMA_VERSION ||
      metadata.appProperties.workspaceId !== input.workspaceId ||
      metadata.appProperties.projectId !== input.project.projectId ||
      metadata.appProperties.assetId !== slide.assetId ||
      metadata.parents?.length !== 1 ||
      metadata.parents[0] !== input.project.assetsFolderId
    ) {
      return fail("drivePreflightFailed");
    }

    const sizeBytes = metadata.sizeBytes ?? slide.fileSize ?? null;
    if (
      !isGooglePhotosExportFileSizeAllowed({
        mimeType: slide.mimeType,
        sizeBytes,
      })
    ) {
      return sizeBytes !== null &&
        sizeBytes > 0 &&
        slide.mimeType.startsWith("video/")
        ? fail("unsupportedMedia")
        : fail("drivePreflightFailed");
    }

    items.push({
      slideIndex,
      slideId: slide.slideId,
      assetFileId: slide.assetFileId,
      mediaKind: getGooglePhotosExportMediaKind(slide.mimeType),
      mimeType: slide.mimeType,
      sizeBytes,
      description: toGooglePhotosDescription(slide.caption),
      fileName: buildGooglePhotosExportFileName({
        slideIndex,
        assetName: slide.assetName,
        mimeType: slide.mimeType,
      }),
    });
  }

  const projectTitle = input.manifest.title.trim() || "名称未設定";
  return {
    ok: true,
    plan: {
      projectId: input.project.projectId,
      projectTitle,
      albumTitle: buildGooglePhotosAlbumTitle({
        projectTitle,
        now: input.now,
      }),
      totalBytes: items.reduce((total, item) => total + item.sizeBytes, 0),
      items,
    },
  };
}

function hasUnsupportedExportMimeType(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("slides" in value) ||
    !Array.isArray(value.slides)
  ) {
    return false;
  }
  return value.slides.some((slide) => {
    if (typeof slide !== "object" || slide === null || !("mimeType" in slide)) {
      return false;
    }
    return (
      typeof slide.mimeType === "string" &&
      !isGooglePhotosExportMimeType(slide.mimeType)
    );
  });
}

function matchesManagedFile(
  file: DriveFileCandidate,
  expected: {
    id: string;
    name: string;
    mimeType: string;
    role: string;
    parentId: string;
    workspaceId: string;
    projectId: string;
  },
) {
  return (
    file.id === expected.id &&
    file.name === expected.name &&
    file.mimeType === expected.mimeType &&
    file.trashed !== true &&
    file.parents?.length === 1 &&
    file.parents[0] === expected.parentId &&
    file.appProperties.app === APP_ID &&
    file.appProperties.role === expected.role &&
    file.appProperties.schemaVersion === SCHEMA_VERSION &&
    file.appProperties.workspaceId === expected.workspaceId &&
    file.appProperties.projectId === expected.projectId
  );
}

function fail(
  kind: SanitizedGooglePhotosExportError["kind"],
  message?: string,
): GooglePhotosExportSourceResult {
  return {
    ok: false,
    error: createSanitizedGooglePhotosExportError(kind, message),
  };
}
