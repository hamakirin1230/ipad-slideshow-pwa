import {
  parseProjectManifest,
  type DriveFileCandidate,
  type DriveProjectSummary,
  type ProjectManifest,
} from "../google-drive";
import {
  buildSafeSlideDiagnostic,
  classifyManagedDriveFileMismatch,
  classifyPhotosExportAssetMetadataMismatch,
  DRIVE_PREFLIGHT_APP_ID,
  DRIVE_PREFLIGHT_SCHEMA_VERSION,
  type DriveManagedFileMismatchDetail,
  type DriveManagedFileRole,
  type SafeSlideDiagnostic,
} from "../drive-preflight-diagnostics";
import {
  buildGooglePhotosAlbumTitle,
  buildGooglePhotosExportFileName,
  createSanitizedGooglePhotosExportError,
  getGooglePhotosExportMediaKind,
  GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES,
  GOOGLE_PHOTOS_EXPORT_MAX_SLIDE_COUNT,
  isDriveProjectExportableMimeType,
  isGooglePhotosExportFileSizeAllowed,
  isGooglePhotosExportMimeType,
  isGooglePhotosExportSkippedVideoMimeType,
  toGooglePhotosDescription,
  type GooglePhotosExportPlan,
  type SanitizedGooglePhotosExportError,
} from "./contract";

const APP_ID = DRIVE_PREFLIGHT_APP_ID;
const SCHEMA_VERSION = DRIVE_PREFLIGHT_SCHEMA_VERSION;
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const JSON_MIME_TYPE = "application/json";

export type GooglePhotosExportPreflightDiagnosticKind =
  | "selectedProjectMismatch"
  | "projectRootMetadataMismatch"
  | "manifestMetadataMismatch"
  | "assetsRootMetadataMismatch"
  | "manifestJsonParseFailure"
  | "invalidManifest"
  | "manifestProjectMismatch"
  | "manifestWorkspaceMismatch"
  | "invalidSlideCount"
  | "slideAssetMetadataReadFailure"
  | "assetFileIdMismatch"
  | "trashedAsset"
  | "assetMimeTypeMismatch"
  | "assetAppMismatch"
  | "assetRoleMismatch"
  | "assetSchemaVersionMismatch"
  | "assetWorkspaceMismatch"
  | "assetProjectMismatch"
  | "assetIdMismatch"
  | "assetParentCountMismatch"
  | "assetParentMismatch"
  | "assetSizeMissing"
  | "assetSizeInvalid"
  | "unsupportedMedia"
  | "duplicateSlidesUnsupported"
  | "noExportablePhotos"
  | "driveReadFailed";

export type GooglePhotosExportSlideDiagnostic =
  SafeSlideDiagnostic<GooglePhotosExportPreflightDiagnosticKind>;

export type GooglePhotosExportPreflightDiagnostics = {
  kind: GooglePhotosExportPreflightDiagnosticKind;
  locationKind?: DriveManagedFileRole;
  locationDetail?: DriveManagedFileMismatchDetail;
  slide?: GooglePhotosExportSlideDiagnostic;
};

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
  | {
      ok: false;
      error: SanitizedGooglePhotosExportError;
      diagnostics: GooglePhotosExportPreflightDiagnostics;
    };

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
    return fail("drivePreflightFailed", {
      kind: "selectedProjectMismatch",
    }, "選択中のアルバムが変わったため、書き出し前確認を中止しました。");
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

    const projectRootMismatch = classifyManagedDriveFileMismatch(
      projectFolder,
      {
        id: input.project.projectFolderId,
        name: input.project.projectId,
        mimeType: FOLDER_MIME_TYPE,
        role: "projectRoot",
        parentId: input.projectsRootFolderId,
        app: APP_ID,
        schemaVersion: SCHEMA_VERSION,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
      },
    );
    if (projectRootMismatch) {
      return failManagedFile("projectRoot", projectRootMismatch);
    }

    const manifestMetadataMismatch = classifyManagedDriveFileMismatch(
      manifestFile,
      {
        id: input.project.manifestFileId,
        name: "manifest.json",
        mimeType: JSON_MIME_TYPE,
        role: "projectManifest",
        parentId: input.project.projectFolderId,
        app: APP_ID,
        schemaVersion: SCHEMA_VERSION,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
      },
    );
    if (manifestMetadataMismatch) {
      return failManagedFile("projectManifest", manifestMetadataMismatch);
    }

    const assetsRootMismatch = classifyManagedDriveFileMismatch(assetsFolder, {
      id: input.project.assetsFolderId,
      name: "assets",
      mimeType: FOLDER_MIME_TYPE,
      role: "assetsRoot",
      parentId: input.project.projectFolderId,
      app: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      workspaceId: input.workspaceId,
      projectId: input.project.projectId,
    });
    if (assetsRootMismatch) {
      return failManagedFile("assetsRoot", assetsRootMismatch);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(manifestText);
    } catch {
      return fail("drivePreflightFailed", { kind: "manifestJsonParseFailure" });
    }

    if (hasUnsupportedExportMimeType(parsedJson)) {
      return fail("unsupportedMedia", { kind: "unsupportedMedia" });
    }

    const parsed = parseProjectManifest(parsedJson);
    if (!parsed.ok) {
      return fail("drivePreflightFailed", { kind: "invalidManifest" });
    }
    if (parsed.value.projectId !== input.project.projectId) {
      return fail("drivePreflightFailed", { kind: "manifestProjectMismatch" });
    }
    if (parsed.value.workspaceId !== input.workspaceId) {
      return fail("drivePreflightFailed", {
        kind: "manifestWorkspaceMismatch",
      });
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
    return fail("drivePreflightFailed", { kind: "driveReadFailed" });
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
    return fail("drivePreflightFailed", { kind: "invalidSlideCount" });
  }

  const photoAssetFileIds = input.manifest.slides
    .filter((slide) => isGooglePhotosExportMimeType(slide.mimeType))
    .map((slide) => slide.assetFileId);
  if (new Set(photoAssetFileIds).size !== photoAssetFileIds.length) {
    return fail("duplicateSlidesUnsupported", {
      kind: "duplicateSlidesUnsupported",
    });
  }

  const items: GooglePhotosExportPlan["items"] = [];
  const seenContentFingerprints = new Map<string, string>();
  let skippedVideoCount = 0;
  for (const [slideIndex, slide] of input.manifest.slides.entries()) {
    if (!isDriveProjectExportableMimeType(slide.mimeType)) {
      return fail("unsupportedMedia", {
        kind: "unsupportedMedia",
        slide: slideDiagnostic(slideIndex, slide, "unsupportedMedia"),
      });
    }

    let metadata: DriveFileCandidate;
    try {
      metadata = await input.adapter.readMetadata({
        accessToken: input.accessToken,
        fileId: slide.assetFileId,
        signal: input.signal,
      });
    } catch {
      return fail("drivePreflightFailed", {
        kind: "slideAssetMetadataReadFailure",
        slide: slideDiagnostic(
          slideIndex,
          slide,
          "slideAssetMetadataReadFailure",
        ),
      });
    }

    const assetMismatch = classifyPhotosExportAssetMetadataMismatch({
      metadata,
      expected: {
        fileId: slide.assetFileId,
        mimeType: slide.mimeType,
        parentId: input.project.assetsFolderId,
        app: APP_ID,
        role: "asset",
        schemaVersion: SCHEMA_VERSION,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
        assetId: slide.assetId,
      },
    });
    if (assetMismatch) {
      return fail("drivePreflightFailed", {
        kind: assetMismatch,
        slide: slideDiagnostic(slideIndex, slide, assetMismatch),
      });
    }

    if (isGooglePhotosExportSkippedVideoMimeType(slide.mimeType)) {
      const skippedSizeBytes = metadata.sizeBytes ?? slide.fileSize ?? null;
      const sizeKind = classifyExportSize(skippedSizeBytes);
      if (sizeKind) {
        return fail("drivePreflightFailed", {
          kind: sizeKind,
          slide: slideDiagnostic(slideIndex, slide, sizeKind),
        });
      }
      skippedVideoCount += 1;
      continue;
    }

    if (!isGooglePhotosExportMimeType(slide.mimeType)) {
      return fail("unsupportedMedia", {
        kind: "unsupportedMedia",
        slide: slideDiagnostic(slideIndex, slide, "unsupportedMedia"),
      });
    }

    const sizeBytes = metadata.sizeBytes ?? slide.fileSize ?? null;
    if (
      typeof sizeBytes !== "number" ||
      !isGooglePhotosExportFileSizeAllowed({
        mimeType: slide.mimeType,
        sizeBytes,
      })
    ) {
      const sizeKind = classifyExportSize(sizeBytes) ?? "assetSizeInvalid";
      return isOversizedExportImage(slide.mimeType, sizeBytes)
        ? fail("unsupportedMedia", {
            kind: "unsupportedMedia",
            slide: slideDiagnostic(slideIndex, slide, "unsupportedMedia"),
          })
        : fail("drivePreflightFailed", {
            kind: sizeKind,
            slide: slideDiagnostic(slideIndex, slide, sizeKind),
          });
    }

    const fingerprint = googlePhotosExportContentFingerprint(metadata);
    if (fingerprint) {
      const existingFileId = seenContentFingerprints.get(fingerprint);
      if (existingFileId && existingFileId !== metadata.id) {
        return fail("duplicateSlidesUnsupported", {
          kind: "duplicateSlidesUnsupported",
          slide: slideDiagnostic(
            slideIndex,
            slide,
            "duplicateSlidesUnsupported",
          ),
        });
      }
      seenContentFingerprints.set(fingerprint, metadata.id);
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

  if (items.length === 0) {
    return fail("noExportablePhotos", { kind: "noExportablePhotos" });
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
      sourceSlideCount: input.manifest.slides.length,
      skippedVideoCount,
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
      !isDriveProjectExportableMimeType(slide.mimeType)
    );
  });
}

function googlePhotosExportContentFingerprint(metadata: DriveFileCandidate) {
  const checksum = metadata.checksum?.trim();
  if (!checksum) {
    return null;
  }
  if (
    typeof metadata.sizeBytes !== "number" ||
    !Number.isSafeInteger(metadata.sizeBytes) ||
    metadata.sizeBytes <= 0
  ) {
    return null;
  }
  return `${checksum}\0${metadata.sizeBytes}\0${metadata.mimeType}`;
}

function isOversizedExportImage(
  mimeType: string,
  sizeBytes: number | null,
) {
  if (typeof sizeBytes !== "number" || sizeBytes <= 0) {
    return false;
  }
  if (!isGooglePhotosExportMimeType(mimeType)) {
    return false;
  }
  return sizeBytes > GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES;
}

function classifyExportSize(
  sizeBytes: number | null,
): "assetSizeMissing" | "assetSizeInvalid" | null {
  if (typeof sizeBytes !== "number") {
    return "assetSizeMissing";
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return "assetSizeInvalid";
  }
  return null;
}

function slideDiagnostic(
  slideIndex: number,
  slide: Pick<ProjectManifest["slides"][number], "assetName" | "mimeType">,
  kind: GooglePhotosExportPreflightDiagnosticKind,
): GooglePhotosExportSlideDiagnostic {
  return buildSafeSlideDiagnostic({
    slideIndex,
    assetName: slide.assetName,
    mimeType: slide.mimeType,
    kind,
  });
}

function failManagedFile(
  role: DriveManagedFileRole,
  detail: DriveManagedFileMismatchDetail,
): GooglePhotosExportSourceResult {
  const kind =
    role === "projectRoot"
      ? "projectRootMetadataMismatch"
      : role === "projectManifest"
        ? "manifestMetadataMismatch"
        : "assetsRootMetadataMismatch";
  return fail("drivePreflightFailed", {
    kind,
    locationKind: role,
    locationDetail: detail,
  });
}

function fail(
  kind: SanitizedGooglePhotosExportError["kind"],
  diagnostics: GooglePhotosExportPreflightDiagnostics,
  message?: string,
): GooglePhotosExportSourceResult {
  return {
    ok: false,
    error: createSanitizedGooglePhotosExportError(kind, message),
    diagnostics,
  };
}
