// src/lib/drive-offline-staging-snapshot.ts

import {
  fetchDriveProjectAssetBlob,
  readDriveTextFile,
  type DriveAssetMimeType,
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

type JsonRecord = Record<string, unknown>;

type DriveOfflineAssetMetadata = {
  id: string;
  name: string;
  mimeType: DriveAssetMimeType;
  modifiedTime?: string;
  sizeBytes: number;
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

    const blob = await fetchDriveProjectAssetBlob({
      accessToken: input.accessToken,
      assetFileId: slide.assetFileId,
      expectedMimeType: slide.mimeType,
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

    diagnostics.push(
      `manifest.json.slides[${order}] のasset metadata/blobを取得しました。`,
    );
  }

  const offlineProject = buildOfflineProject({
    project: input.project,
    manifest,
    syncedAt: input.syncedAt,
  });

  return {
    project: offlineProject,
    assetPairs,
    details: {
      project: input.project,
      slides: manifest.slides,
      slideCount: manifest.slides.length,
      assetCount: manifest.slides.length,
    },
    diagnostics: [
      ...diagnostics,
      "Drive offline staging snapshot の組み立てが完了しました。",
    ],
  };
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

  const sizeBytes = readRequiredSizeBytes({
    body: value,
    fileLabel: "Drive asset metadata",
    key: "size",
    diagnostics,
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

  if (rawMimeType && !isDriveAssetMimeType(rawMimeType)) {
    diagnostics.push("Drive asset metadata のmimeTypeが対応外です。");
  }

  if (
    diagnostics.length > 0 ||
    !id ||
    !name ||
    !rawMimeType ||
    !isDriveAssetMimeType(rawMimeType) ||
    typeof sizeBytes !== "number"
  ) {
    throw new DriveOfflineStagingSnapshotError(diagnostics);
  }

  return {
    id,
    name,
    mimeType: rawMimeType,
    modifiedTime,
    sizeBytes,
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

  if (rawMimeType && !isDriveAssetMimeType(rawMimeType)) {
    localDiagnostics.push(`${fileLabel} のmimeTypeが対応外です。`);
  }

  diagnostics.push(...localDiagnostics);

  if (
    localDiagnostics.length > 0 ||
    !slideId ||
    !assetId ||
    !assetFileId ||
    !assetName ||
    !rawMimeType ||
    !isDriveAssetMimeType(rawMimeType) ||
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
    mimeType: rawMimeType,
    source: "googlePhotosPicker",
    sourceMimeType,
    sourceMediaItemId,
    ...(sourceCreateTime ? { sourceCreateTime } : {}),
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
  syncedAt: IsoDateTimeString;
}): OfflineProject {
  return {
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    projectId: input.project.projectId,
    projectTitle: input.project.title,
    slides: input.manifest.slides.map(toOfflineProjectSlide),
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
    caption: slide.caption,
    durationSeconds: slide.durationSeconds,
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

function readRequiredSizeBytes(input: {
  body: JsonRecord;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): number | undefined {
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

  input.diagnostics.push(`${input.fileLabel} の${input.key}を安全なbyte数として読めません。`);
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateTimeString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value);
}

function isDriveAssetMimeType(value: string): value is DriveAssetMimeType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}
