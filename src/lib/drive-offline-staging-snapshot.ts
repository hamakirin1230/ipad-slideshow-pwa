// src/lib/drive-offline-staging-snapshot.ts

import {
  fetchDriveProjectAssetBlob,
  readDriveTextFile,
  type DriveAssetType,
  type DriveAssetUnsupportedReason,
  type DriveProjectReadyDetails,
  type DriveProjectSummary,
  type DriveSlideSummary,
  type DriveWorkspaceReadyContext,
} from "@/lib/google-drive";
import {
  OFFLINE_SCHEMA_VERSION,
  type IsoDateTimeString,
  type OfflineAsset,
  type OfflineAssetBlobRecord,
  type OfflineProject,
  type OfflineProjectSlide,
} from "@/lib/offline-schema";
import type { OfflineStagingAssetPairInput } from "@/lib/offline-staging-write";

const DRIVE_API_FILES_URL = "https://www.googleapis.com/drive/v3/files";

const DRIVE_WORKSPACE_APP_ID = "ipad-slideshow-pwa";
const DRIVE_SCHEMA_VERSION = 1;
const DRIVE_SCHEMA_VERSION_PROPERTY = "1";
const DRIVE_ASSET_ROLE = "asset";
const DRIVE_PROJECT_MAX_SLIDE_COUNT = 50;
const DRIVE_VIDEO_OFFLINE_MAX_BYTES = 50 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

type DriveOfflineAssetMetadata = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  sizeBytes?: number;
  parents?: string[];
  appProperties: Record<string, string>;
};

type DriveOfflineProjectManifest = {
  workspaceId: string;
  projectId: string;
  title: string;
  slides: DriveSlideSummary[];
  createdAt: string;
  updatedAt: string;
};

export type FetchDriveOfflineStagingSnapshotInput = {
  accessToken: string;
  readyContext: DriveWorkspaceReadyContext;
  project: DriveProjectSummary;
  syncedAt: IsoDateTimeString;
  signal: AbortSignal;
};

export type DriveOfflineStagingSnapshot = {
  project: OfflineProject;
  assetPairs: OfflineStagingAssetPairInput[];
  details: DriveProjectReadyDetails;
  diagnostics: string[];
};

export class DriveOfflineStagingSnapshotError extends Error {
  readonly diagnostics: string[];

  constructor(diagnostics: string[]) {
    super("Drive offline staging snapshot fetch failed.");
    this.name = "DriveOfflineStagingSnapshotError";
    this.diagnostics = [...diagnostics];
  }
}

export async function fetchDriveOfflineStagingSnapshot(
  input: FetchDriveOfflineStagingSnapshotInput,
): Promise<DriveOfflineStagingSnapshot> {
  assertFetchDriveOfflineSnapshotInput(input);

  const manifestJsonText = await readDriveTextFile(
    input.accessToken,
    input.project.manifestFileId,
    input.signal,
  );

  const manifest = parseDriveOfflineProjectManifest({
    manifestJsonText,
    expectedWorkspaceId: input.readyContext.workspaceId,
    expectedProject: input.project,
  });

  const assetPairs: OfflineStagingAssetPairInput[] = [];
  const offlineSlides: DriveSlideSummary[] = [];
  let imageSyncCandidateCount = 0;
  let videoSyncCandidateCount = 0;
  let videoSyncedCount = 0;
  let videoSkippedCount = 0;
  let videoTooLargeSkippedCount = 0;
  let unsupportedAssetCount = 0;
  const diagnostics: string[] = [
    "Drive manifest.json をoffline staging snapshot用に読み取りました。",
  ];

  for (const [order, slide] of manifest.slides.entries()) {
    const assetMetadata = await fetchDriveOfflineAssetMetadata({
      accessToken: input.accessToken,
      assetFileId: slide.assetFileId,
      signal: input.signal,
    });

    validateDriveOfflineAssetMetadata({
      metadata: assetMetadata,
      slide,
      expectedWorkspaceId: input.readyContext.workspaceId,
      expectedProjectId: input.project.projectId,
      expectedAssetsFolderId: input.project.assetsFolderId,
      slideIndex: order,
    });

    const slideAssetKind = getDriveOfflineStagingAssetKind(slide);

    if (slideAssetKind === "unsupported") {
      unsupportedAssetCount += 1;
      diagnostics.push(
        `manifest.json.slides[${order}] はoffline sync対象外としてskipしました。mimeType: ${slide.mimeType}`,
      );
      continue;
    }

    if (slideAssetKind === "video-unsupported") {
      videoSkippedCount += 1;
      unsupportedAssetCount += 1;
      diagnostics.push(buildVideoSkipDiagnostic(order, slide));
      continue;
    }

    if (slideAssetKind === "video-mp4") {
      if (typeof assetMetadata.sizeBytes !== "number") {
        videoSkippedCount += 1;
        diagnostics.push(
          `manifest.json.slides[${order}] のvideo/mp4 asset はDrive metadata sizeがないためoffline保存をskipしました。`,
        );
        continue;
      }

      if (assetMetadata.sizeBytes > DRIVE_VIDEO_OFFLINE_MAX_BYTES) {
        videoSkippedCount += 1;
        videoTooLargeSkippedCount += 1;
        diagnostics.push(
          `manifest.json.slides[${order}] のvideo/mp4 asset はoffline保存上限を超えるためskipしました。`,
        );
        continue;
      }

      videoSyncCandidateCount += 1;

      const blob = await fetchDriveVideoAssetBlobForOfflineStaging({
        accessToken: input.accessToken,
        assetFileId: slide.assetFileId,
        expectedSizeBytes: assetMetadata.sizeBytes,
        signal: input.signal,
        slideIndex: order,
        diagnostics,
      });

      if (!blob) {
        videoSkippedCount += 1;
        continue;
      }

      assetPairs.push(
        buildOfflineStagingAssetPair({
          projectId: input.project.projectId,
          slide,
          assetMetadata,
          blob,
          syncedAt: input.syncedAt,
        }),
      );
      offlineSlides.push(slide);
      videoSyncedCount += 1;

      diagnostics.push(
        `manifest.json.slides[${order}] のvideo/mp4 asset metadata/blobをoffline保存対象として取得しました。`,
      );
      continue;
    }

    if (typeof assetMetadata.sizeBytes !== "number") {
      throw new DriveOfflineStagingSnapshotError([
        `manifest.json.slides[${order}] のDrive asset metadata sizeを安全なbyte数として読めません。`,
      ]);
    }

    imageSyncCandidateCount += 1;

    const expectedImageMimeType = slide.mimeType;

    if (!isDriveOfflineImageMimeType(expectedImageMimeType)) {
      throw new DriveOfflineStagingSnapshotError([
        `manifest.json.slides[${order}] のimage MIME typeがoffline保存対象外です。`,
      ]);
    }

    const blob = await fetchDriveProjectAssetBlob({
      accessToken: input.accessToken,
      assetFileId: slide.assetFileId,
      expectedMimeType: expectedImageMimeType,
      signal: input.signal,
    });

    if (blob.size !== assetMetadata.sizeBytes) {
      throw new DriveOfflineStagingSnapshotError([
        `manifest.json.slides[${order}] のDrive asset Blob sizeがmetadata sizeと一致していません。`,
      ]);
    }

    assetPairs.push(
      buildOfflineStagingAssetPair({
        projectId: input.project.projectId,
        slide,
        assetMetadata,
        blob,
        syncedAt: input.syncedAt,
      }),
    );
    offlineSlides.push(slide);

    diagnostics.push(
      `manifest.json.slides[${order}] のasset metadata/blobを取得しました。`,
    );
  }

  const offlineProject = buildOfflineProject({
    project: input.project,
    manifest,
    slides: offlineSlides,
    syncedAt: input.syncedAt,
  });

  return {
    project: offlineProject,
    assetPairs,
    details: {
      project: input.project,
      slides: offlineSlides,
      slideCount: offlineSlides.length,
      assetCount: assetPairs.length,
      manifestSlideCount: manifest.slides.length,
      imageSyncCandidateCount,
      videoSyncCandidateCount,
      videoSyncedCount,
      videoSkippedCount,
      videoTooLargeSkippedCount,
      unsupportedAssetCount,
      offlineStagingSlideCount: offlineSlides.length,
    },
    diagnostics: [
      ...diagnostics,
      `manifest slide count: ${manifest.slides.length}`,
      `image sync candidate count: ${imageSyncCandidateCount}`,
      `video sync candidate count: ${videoSyncCandidateCount}`,
      `video synced count: ${videoSyncedCount}`,
      `video skipped count: ${videoSkippedCount}`,
      `video too large skipped count: ${videoTooLargeSkippedCount}`,
      `unsupported asset count: ${unsupportedAssetCount}`,
      `offline staging slide count: ${offlineSlides.length}`,
      "Drive offline staging snapshot の組み立てが完了しました。",
    ],
  };
}

type DriveOfflineStagingAssetKind =
  | "image"
  | "video-mp4"
  | "video-unsupported"
  | "unsupported";

function getDriveOfflineStagingAssetKind(
  slide: DriveSlideSummary,
): DriveOfflineStagingAssetKind {
  if (isDriveOfflineImageMimeType(slide.mimeType)) {
    return "image";
  }

  if (slide.type === "video" && slide.mimeType === "video/mp4") {
    return slide.unsupportedReason ? "video-unsupported" : "video-mp4";
  }

  if (slide.type === "video" || slide.mimeType.toLowerCase().startsWith("video/")) {
    return "video-unsupported";
  }

  return "unsupported";
}

function buildVideoSkipDiagnostic(order: number, slide: DriveSlideSummary) {
  const unsupportedReasonDiagnostic = slide.unsupportedReason
    ? ` / unsupportedReason: ${slide.unsupportedReason}`
    : "";

  return `manifest.json.slides[${order}] のvideo assetはoffline保存対象外としてskipしました。mimeType: ${slide.mimeType}${unsupportedReasonDiagnostic}`;
}

async function fetchDriveVideoAssetBlobForOfflineStaging(input: {
  accessToken: string;
  assetFileId: string;
  expectedSizeBytes: number;
  signal: AbortSignal;
  slideIndex: number;
  diagnostics: string[];
}): Promise<Blob | null> {
  let blob: Blob;

  try {
    blob = await fetchDriveProjectAssetBlob({
      accessToken: input.accessToken,
      assetFileId: input.assetFileId,
      expectedMimeType: "video/mp4",
      maxBytes: DRIVE_VIDEO_OFFLINE_MAX_BYTES,
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal.aborted || isAbortError(error)) {
      throw error;
    }

    input.diagnostics.push(
      `manifest.json.slides[${input.slideIndex}] のvideo/mp4 asset のoffline保存に失敗したため、このvideoだけskipしました。`,
    );
    return null;
  }

  if (blob.type && normalizeBlobMimeType(blob.type) !== "video/mp4") {
    input.diagnostics.push(
      `manifest.json.slides[${input.slideIndex}] のvideo/mp4 asset Blob MIME typeが一致しないため、このvideoだけskipしました。`,
    );
    return null;
  }

  if (blob.size !== input.expectedSizeBytes) {
    input.diagnostics.push(
      `manifest.json.slides[${input.slideIndex}] のvideo/mp4 asset Blob sizeがmetadata sizeと一致しないため、このvideoだけskipしました。`,
    );
    return null;
  }

  if (blob.size > DRIVE_VIDEO_OFFLINE_MAX_BYTES) {
    input.diagnostics.push(
      `manifest.json.slides[${input.slideIndex}] のvideo/mp4 asset Blob sizeがoffline保存上限を超えるため、このvideoだけskipしました。`,
    );
    return null;
  }

  return blob;
}

function normalizeBlobMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function assertFetchDriveOfflineSnapshotInput(
  input: FetchDriveOfflineStagingSnapshotInput,
): void {
  const diagnostics: string[] = [];

  if (!isNonEmptyString(input.accessToken)) {
    diagnostics.push("Drive offline snapshot用のaccessTokenがありません。");
  }

  if (!isNonEmptyString(input.readyContext.workspaceId)) {
    diagnostics.push("Drive workspaceIdが空です。");
  }

  if (!isNonEmptyString(input.project.projectId)) {
    diagnostics.push("Drive projectIdが空です。");
  }

  if (!isNonEmptyString(input.project.manifestFileId)) {
    diagnostics.push("Drive manifestFileIdが空です。");
  }

  if (!isNonEmptyString(input.project.assetsFolderId)) {
    diagnostics.push("Drive assetsFolderIdが空です。");
  }

  if (!isNonEmptyString(input.syncedAt)) {
    diagnostics.push("offline snapshot syncedAtが空です。");
  }

  if (diagnostics.length > 0) {
    throw new DriveOfflineStagingSnapshotError(diagnostics);
  }
}

async function fetchDriveOfflineAssetMetadata(input: {
  accessToken: string;
  assetFileId: string;
  signal: AbortSignal;
}): Promise<DriveOfflineAssetMetadata> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,modifiedTime,appProperties,size,parents",
  });

  const response = await fetch(
    `${DRIVE_API_FILES_URL}/${encodeURIComponent(input.assetFileId)}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
      cache: "no-store",
      credentials: "omit",
      signal: input.signal,
    },
  );

  if (!response.ok) {
    throw new DriveOfflineStagingSnapshotError([
      "Drive asset metadata の取得に失敗しました。",
      `Drive API status: ${response.status}`,
    ]);
  }

  return normalizeDriveOfflineAssetMetadata(await response.json());
}

function normalizeDriveOfflineAssetMetadata(
  value: unknown,
): DriveOfflineAssetMetadata {
  if (!isRecord(value)) {
    throw new DriveOfflineStagingSnapshotError([
      "Drive asset metadata response はJSON objectである必要があります。",
    ]);
  }

  const diagnostics: string[] = [];

  const id = readRequiredNonEmptyString({
    body: value,
    fileLabel: "Drive asset metadata",
    key: "id",
    diagnostics,
  });

  const name = readRequiredNonEmptyString({
    body: value,
    fileLabel: "Drive asset metadata",
    key: "name",
    diagnostics,
  });

  const rawMimeType = readRequiredNonEmptyString({
    body: value,
    fileLabel: "Drive asset metadata",
    key: "mimeType",
    diagnostics,
  });

  const sizeBytes = readOptionalSizeBytes({
    body: value,
    fileLabel: "Drive asset metadata",
    key: "size",
  });

  const modifiedTime = readOptionalIsoDateString({
    body: value,
    fileLabel: "Drive asset metadata",
    key: "modifiedTime",
    diagnostics,
  });

  const appProperties = normalizeStringRecord(
    value.appProperties,
    "Drive asset metadata.appProperties",
    diagnostics,
  );

  const parents = normalizeOptionalStringArray({
    value: value.parents,
    fileLabel: "Drive asset metadata",
    key: "parents",
    diagnostics,
  });

  if (
    diagnostics.length > 0 ||
    !id ||
    !name ||
    !rawMimeType
  ) {
    throw new DriveOfflineStagingSnapshotError(diagnostics);
  }

  return {
    id,
    name,
    mimeType: rawMimeType,
    modifiedTime,
    ...(typeof sizeBytes === "number" ? { sizeBytes } : {}),
    parents,
    appProperties,
  };
}

function validateDriveOfflineAssetMetadata(input: {
  metadata: DriveOfflineAssetMetadata;
  slide: DriveSlideSummary;
  expectedWorkspaceId: string;
  expectedProjectId: string;
  expectedAssetsFolderId: string;
  slideIndex: number;
}): void {
  const { metadata, slide } = input;
  const label = `manifest.json.slides[${input.slideIndex}]`;
  const diagnostics: string[] = [];

  if (metadata.id !== slide.assetFileId) {
    diagnostics.push(`${label} のassetFileIdがDrive metadata idと一致していません。`);
  }

  if (metadata.mimeType !== slide.mimeType) {
    diagnostics.push(`${label} のmimeTypeがDrive asset MIME typeと一致していません。`);
  }

  if (!metadata.parents?.includes(input.expectedAssetsFolderId)) {
    diagnostics.push(`${label} のDrive asset parentがassets/ folderと一致していません。`);
  }

  if (metadata.appProperties.app !== DRIVE_WORKSPACE_APP_ID) {
    diagnostics.push(`${label} のDrive asset appProperties.appが不正です。`);
  }

  if (metadata.appProperties.role !== DRIVE_ASSET_ROLE) {
    diagnostics.push(`${label} のDrive asset appProperties.roleが不正です。`);
  }

  if (metadata.appProperties.schemaVersion !== DRIVE_SCHEMA_VERSION_PROPERTY) {
    diagnostics.push(`${label} のDrive asset appProperties.schemaVersionが不正です。`);
  }

  if (metadata.appProperties.workspaceId !== input.expectedWorkspaceId) {
    diagnostics.push(`${label} のDrive asset workspaceIdがworkspaceと一致していません。`);
  }

  if (metadata.appProperties.projectId !== input.expectedProjectId) {
    diagnostics.push(`${label} のDrive asset projectIdがprojectと一致していません。`);
  }

  if (metadata.appProperties.assetId !== slide.assetId) {
    diagnostics.push(`${label} のDrive asset assetIdがmanifest slideと一致していません。`);
  }

  if (diagnostics.length > 0) {
    throw new DriveOfflineStagingSnapshotError(diagnostics);
  }
}

function parseDriveOfflineProjectManifest(input: {
  manifestJsonText: string;
  expectedWorkspaceId: string;
  expectedProject: DriveProjectSummary;
}): DriveOfflineProjectManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input.manifestJsonText) as unknown;
  } catch {
    throw new DriveOfflineStagingSnapshotError([
      "manifest.json のJSON parseに失敗しました。",
    ]);
  }

  if (!isRecord(parsed)) {
    throw new DriveOfflineStagingSnapshotError([
      "manifest.json はJSON objectである必要があります。",
    ]);
  }

  const diagnostics: string[] = [];

  validateRequiredLiteral({
    body: parsed,
    fileLabel: "manifest.json",
    key: "app",
    expectedValue: DRIVE_WORKSPACE_APP_ID,
    diagnostics,
  });

  validateRequiredLiteral({
    body: parsed,
    fileLabel: "manifest.json",
    key: "role",
    expectedValue: "projectManifest",
    diagnostics,
  });

  validateRequiredLiteral({
    body: parsed,
    fileLabel: "manifest.json",
    key: "schemaVersion",
    expectedValue: DRIVE_SCHEMA_VERSION,
    diagnostics,
  });

  const workspaceId = readRequiredNonEmptyString({
    body: parsed,
    fileLabel: "manifest.json",
    key: "workspaceId",
    diagnostics,
  });

  const projectId = readRequiredNonEmptyString({
    body: parsed,
    fileLabel: "manifest.json",
    key: "projectId",
    diagnostics,
  });

  const title = readRequiredNonEmptyString({
    body: parsed,
    fileLabel: "manifest.json",
    key: "title",
    diagnostics,
  });

  const createdAt = readRequiredIsoDateString({
    body: parsed,
    fileLabel: "manifest.json",
    key: "createdAt",
    diagnostics,
  });

  const updatedAt = readRequiredIsoDateString({
    body: parsed,
    fileLabel: "manifest.json",
    key: "updatedAt",
    diagnostics,
  });

  const slides = readDriveOfflineManifestSlides(parsed, diagnostics);

  if (workspaceId && workspaceId !== input.expectedWorkspaceId) {
    diagnostics.push("manifest.json のworkspaceIdがreadyContextと一致していません。");
  }

  if (projectId && projectId !== input.expectedProject.projectId) {
    diagnostics.push("manifest.json のprojectIdがindex.json.projects[0]と一致していません。");
  }

  if (title && title !== input.expectedProject.title) {
    diagnostics.push("manifest.json のtitleがindex.json.projects[0]と一致していません。");
  }

  if (createdAt && createdAt !== input.expectedProject.createdAt) {
    diagnostics.push("manifest.json のcreatedAtがindex.json.projects[0]と一致していません。");
  }

  if (updatedAt && updatedAt !== input.expectedProject.updatedAt) {
    diagnostics.push("manifest.json のupdatedAtがindex.json.projects[0]と一致していません。");
  }

  validateNoDuplicateSlideValues(slides, diagnostics);

  if (
    diagnostics.length > 0 ||
    !workspaceId ||
    !projectId ||
    !title ||
    !createdAt ||
    !updatedAt
  ) {
    throw new DriveOfflineStagingSnapshotError(diagnostics);
  }

  return {
    workspaceId,
    projectId,
    title,
    slides,
    createdAt,
    updatedAt,
  };
}

function readDriveOfflineManifestSlides(
  body: JsonRecord,
  diagnostics: string[],
): DriveSlideSummary[] {
  if (!Array.isArray(body.slides)) {
    diagnostics.push("manifest.json のslidesは配列である必要があります。");
    return [];
  }

  if (body.slides.length > DRIVE_PROJECT_MAX_SLIDE_COUNT) {
    diagnostics.push(
      `manifest.json のslidesが上限 ${DRIVE_PROJECT_MAX_SLIDE_COUNT} 件を超えています。`,
    );
  }

  return body.slides
    .map((slide, index) =>
      normalizeDriveOfflineManifestSlide(slide, index, diagnostics),
    )
    .filter((slide): slide is DriveSlideSummary => slide !== null);
}

function normalizeDriveOfflineManifestSlide(
  value: unknown,
  index: number,
  diagnostics: string[],
): DriveSlideSummary | null {
  const fileLabel = `manifest.json.slides[${index}]`;
  const localDiagnostics: string[] = [];

  if (!isRecord(value)) {
    diagnostics.push(`${fileLabel} はJSON objectである必要があります。`);
    return null;
  }

  const slideId = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "slideId",
    diagnostics: localDiagnostics,
  });

  const assetId = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "assetId",
    diagnostics: localDiagnostics,
  });

  const assetFileId = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "assetFileId",
    diagnostics: localDiagnostics,
  });

  const assetName = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "assetName",
    diagnostics: localDiagnostics,
  });

  const rawMimeType = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "mimeType",
    diagnostics: localDiagnostics,
  });
  const assetType = readOptionalDriveAssetType({
    body: value,
    fileLabel,
    key: "type",
    diagnostics: localDiagnostics,
  });
  const normalizedAssetType = assetType ?? "image";
  const fileSize = readOptionalNonNegativeNumber({
    body: value,
    fileLabel,
    key: "fileSize",
    diagnostics: localDiagnostics,
  });
  const durationMs = readOptionalPositiveNumber({
    body: value,
    fileLabel,
    key: "durationMs",
    diagnostics: localDiagnostics,
  });
  const explicitUnsupportedReason = readOptionalDriveAssetUnsupportedReason({
    body: value,
    fileLabel,
    key: "unsupportedReason",
    diagnostics: localDiagnostics,
  });
  const mimeTypeUnsupportedReason = rawMimeType
    ? validateDriveManifestAssetMimeType({
        assetType: normalizedAssetType,
        mimeType: rawMimeType,
        fileLabel,
        diagnostics: localDiagnostics,
      })
    : undefined;
  const unsupportedReason = mimeTypeUnsupportedReason ?? explicitUnsupportedReason;

  const source = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "source",
    diagnostics: localDiagnostics,
  });

  const sourceMimeType = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "sourceMimeType",
    diagnostics: localDiagnostics,
  });

  const sourceMediaItemId = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "sourceMediaItemId",
    diagnostics: localDiagnostics,
  });

  const durationSeconds = readRequiredPositiveNumber({
    body: value,
    fileLabel,
    key: "durationSeconds",
    diagnostics: localDiagnostics,
  });

  const caption = readRequiredString({
    body: value,
    fileLabel,
    key: "caption",
    diagnostics: localDiagnostics,
  });

  const createdAt = readRequiredIsoDateString({
    body: value,
    fileLabel,
    key: "createdAt",
    diagnostics: localDiagnostics,
  });

  const updatedAt = readRequiredIsoDateString({
    body: value,
    fileLabel,
    key: "updatedAt",
    diagnostics: localDiagnostics,
  });

  const sourceCreateTime = readOptionalIsoDateString({
    body: value,
    fileLabel,
    key: "sourceCreateTime",
    diagnostics: localDiagnostics,
  });

  if (source !== "googlePhotosPicker") {
    localDiagnostics.push(`${fileLabel} のsourceが想定と一致していません。`);
  }

  diagnostics.push(...localDiagnostics);

  if (
    localDiagnostics.length > 0 ||
    !slideId ||
    !assetId ||
    !assetFileId ||
    !assetName ||
    !rawMimeType ||
    source !== "googlePhotosPicker" ||
    !sourceMimeType ||
    !sourceMediaItemId ||
    typeof durationSeconds !== "number" ||
    typeof caption !== "string" ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    slideId,
    assetId,
    assetFileId,
    assetName,
    ...(assetType ? { type: assetType } : {}),
    mimeType: rawMimeType,
    source: "googlePhotosPicker",
    sourceMimeType,
    sourceMediaItemId,
    ...(sourceCreateTime ? { sourceCreateTime } : {}),
    ...(typeof fileSize === "number" ? { fileSize } : {}),
    ...(typeof durationMs === "number" ? { durationMs } : {}),
    ...(unsupportedReason ? { unsupportedReason } : {}),
    durationSeconds,
    caption,
    createdAt,
    updatedAt,
  };
}

function validateNoDuplicateSlideValues(
  slides: DriveSlideSummary[],
  diagnostics: string[],
): void {
  validateNoDuplicateValues(
    slides.map((slide) => slide.slideId),
    "manifest.json.slides[].slideId",
    diagnostics,
  );

  validateNoDuplicateValues(
    slides.map((slide) => slide.assetId),
    "manifest.json.slides[].assetId",
    diagnostics,
  );

  validateNoDuplicateValues(
    slides.map((slide) => slide.assetFileId),
    "manifest.json.slides[].assetFileId",
    diagnostics,
  );
}

function validateNoDuplicateValues(
  values: string[],
  label: string,
  diagnostics: string[],
): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      diagnostics.push(`${label} に重複があります。`);
      return;
    }

    seen.add(value);
  }
}

function buildOfflineProject(input: {
  project: DriveProjectSummary;
  manifest: DriveOfflineProjectManifest;
  slides: DriveSlideSummary[];
  syncedAt: IsoDateTimeString;
}): OfflineProject {
  return {
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    projectId: input.project.projectId,
    projectTitle: input.project.title,
    slides: input.slides.map(toOfflineProjectSlide),
    sourceManifestFileId: input.project.manifestFileId,
    sourceUpdatedAt: input.manifest.updatedAt,
    syncedAt: input.syncedAt,
  };
}

function toOfflineProjectSlide(
  slide: DriveSlideSummary,
  order: number,
): OfflineProjectSlide {
  return {
    slideId: slide.slideId,
    assetId: slide.assetId,
    ...(slide.type ? { type: slide.type } : {}),
    caption: slide.caption,
    durationSeconds: slide.durationSeconds,
    ...(typeof slide.durationMs === "number" ? { durationMs: slide.durationMs } : {}),
    ...(slide.unsupportedReason
      ? { unsupportedReason: slide.unsupportedReason }
      : {}),
    order,
    createdAt: slide.createdAt,
    updatedAt: slide.updatedAt,
  };
}

function buildOfflineStagingAssetPair(input: {
  projectId: string;
  slide: DriveSlideSummary;
  assetMetadata: DriveOfflineAssetMetadata;
  blob: Blob;
  syncedAt: IsoDateTimeString;
}): OfflineStagingAssetPairInput {
  const asset: OfflineAsset = {
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    assetId: input.slide.assetId,
    projectId: input.projectId,
    sourceDriveFileId: input.slide.assetFileId,
    sourceName: input.assetMetadata.name,
    sourceMimeType: input.assetMetadata.mimeType,
    sourceSizeBytes: input.assetMetadata.sizeBytes,
    sourceUpdatedAt: input.assetMetadata.modifiedTime,
    ...(input.slide.type ? { type: input.slide.type } : {}),
    ...(typeof input.slide.durationMs === "number"
      ? { durationMs: input.slide.durationMs }
      : {}),
    ...(input.slide.unsupportedReason
      ? { unsupportedReason: input.slide.unsupportedReason }
      : {}),
    blobMimeType: input.slide.mimeType,
    blobSizeBytes: input.blob.size,
    blobVariant: "original",
    blobStatus: "ready",
    syncedAt: input.syncedAt,
  };

  const assetBlobRecord: OfflineAssetBlobRecord = {
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    assetId: input.slide.assetId,
    projectId: input.projectId,
    blob: input.blob,
    blobMimeType: input.slide.mimeType,
    blobSizeBytes: input.blob.size,
    blobVariant: "original",
    syncedAt: input.syncedAt,
  };

  return {
    asset,
    assetBlobRecord,
  };
}

function validateRequiredLiteral(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  expectedValue: string | number;
  diagnostics: string[];
}): void {
  if (input.body[input.key] !== input.expectedValue) {
    input.diagnostics.push(
      `${input.fileLabel} の${input.key}が想定値と一致していません。`,
    );
  }
}

function readRequiredNonEmptyString(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): string | undefined {
  const value = input.body[input.key];

  if (!isNonEmptyString(value)) {
    input.diagnostics.push(`${input.fileLabel} の${input.key}は非空文字列である必要があります。`);
    return undefined;
  }

  return value;
}

function readRequiredString(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): string | undefined {
  const value = input.body[input.key];

  if (typeof value !== "string") {
    input.diagnostics.push(`${input.fileLabel} の${input.key}は文字列である必要があります。`);
    return undefined;
  }

  return value;
}

function readRequiredPositiveNumber(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): number | undefined {
  const value = input.body[input.key];

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    input.diagnostics.push(`${input.fileLabel} の${input.key}は正のnumberである必要があります。`);
    return undefined;
  }

  return value;
}

function readRequiredIsoDateString(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): string | undefined {
  const value = readRequiredNonEmptyString(input);

  if (!value) {
    return undefined;
  }

  if (!isIsoDateTimeString(value)) {
    input.diagnostics.push(`${input.fileLabel} の${input.key}はISO日時文字列である必要があります。`);
    return undefined;
  }

  return value;
}

function readOptionalIsoDateString(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (typeof value !== "string") {
    input.diagnostics.push(`${input.fileLabel} の${input.key}は文字列である必要があります。`);
    return undefined;
  }

  if (!isIsoDateTimeString(value)) {
    input.diagnostics.push(`${input.fileLabel} の${input.key}はISO日時文字列である必要があります。`);
    return undefined;
  }

  return value;
}

function readOptionalSizeBytes(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
}): number | undefined {
  if (!hasOwnKey(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);

    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeStringRecord(
  value: unknown,
  label: string,
  diagnostics: string[],
): Record<string, string> {
  if (!isRecord(value)) {
    diagnostics.push(`${label} はJSON objectである必要があります。`);
    return {};
  }

  const record: Record<string, string> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue === "string") {
      record[key] = entryValue;
    }
  }

  return record;
}

function normalizeOptionalStringArray(input: {
  value: unknown;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): string[] | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  if (
    !Array.isArray(input.value) ||
    input.value.some((item) => typeof item !== "string")
  ) {
    input.diagnostics.push(`${input.fileLabel} の${input.key}は文字列配列である必要があります。`);
    return undefined;
  }

  return [...input.value];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnKey(record: JsonRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateTimeString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value);
}

function isDriveOfflineImageMimeType(
  value: string,
): value is "image/jpeg" | "image/png" | "image/webp" {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function isVideoMimeType(value: string) {
  return value.toLowerCase().startsWith("video/");
}

function validateDriveManifestAssetMimeType(input: {
  assetType: DriveAssetType;
  mimeType: string;
  fileLabel: string;
  diagnostics: string[];
}): DriveAssetUnsupportedReason | undefined {
  if (input.assetType === "image") {
    if (!isDriveOfflineImageMimeType(input.mimeType)) {
      input.diagnostics.push(`${input.fileLabel} のmimeTypeが対応外です。`);
      return "unsupportedMimeType";
    }

    return undefined;
  }

  if (input.mimeType === "video/mp4") {
    return undefined;
  }

  if (isVideoMimeType(input.mimeType)) {
    return "unsupportedVideoMimeType";
  }

  input.diagnostics.push(`${input.fileLabel} のvideo mimeTypeが対応外です。`);
  return "unsupportedMimeType";
}

function readOptionalDriveAssetType(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): DriveAssetType | undefined {
  if (!hasOwnKey(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (value === "image" || value === "video") {
    return value;
  }

  input.diagnostics.push(
    `${input.fileLabel} の${input.key}はimageまたはvideoである必要があります。`,
  );
  return undefined;
}

function readOptionalDriveAssetUnsupportedReason(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): DriveAssetUnsupportedReason | undefined {
  if (!hasOwnKey(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (
    value === "videoPlaybackNotImplemented" ||
    value === "unsupportedVideoMimeType" ||
    value === "unsupportedMimeType"
  ) {
    return value;
  }

  input.diagnostics.push(`${input.fileLabel} の${input.key}が対応外です。`);
  return undefined;
}

function readOptionalPositiveNumber(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}) {
  if (!hasOwnKey(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    input.diagnostics.push(`${input.fileLabel} の${input.key}が不正です。`);
    return undefined;
  }

  return value;
}

function readOptionalNonNegativeNumber(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}) {
  if (!hasOwnKey(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    input.diagnostics.push(`${input.fileLabel} の${input.key}が不正です。`);
    return undefined;
  }

  return value;
}
