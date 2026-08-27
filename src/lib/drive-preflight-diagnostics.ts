import type { DriveFileCandidate } from "./google-drive";
import { sanitizeUserFacingDiagnostic } from "./user-facing-diagnostics";

export const DRIVE_PREFLIGHT_APP_ID = "ipad-slideshow-pwa";
export const DRIVE_PREFLIGHT_SCHEMA_VERSION = "1";

export type DriveManagedFileRole = "projectRoot" | "projectManifest" | "assetsRoot";

export type DriveManagedFileMismatchDetail =
  | "fileIdMismatch"
  | "nameMismatch"
  | "mimeTypeMismatch"
  | "trashed"
  | "parentCountMismatch"
  | "parentMismatch"
  | "appMismatch"
  | "roleMismatch"
  | "schemaVersionMismatch"
  | "workspaceIdMismatch"
  | "projectIdMismatch";

export type DriveAssetMetadataMismatchKind =
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
  | "assetParentMismatch";

export type SafeSlideDiagnostic<TKind extends string = string> = {
  slideIndex: number;
  assetName: string;
  mimeType: string;
  kind: TKind;
};

export type ManagedDriveFileExpectation = {
  id: string;
  name: string;
  mimeType: string;
  role: string;
  parentId: string;
  app: string;
  schemaVersion: string;
  workspaceId: string;
  projectId: string;
};

export type DriveAssetMetadataExpectation = {
  fileId: string;
  mimeType: string;
  parentId: string;
  app: string;
  role: string;
  schemaVersion: string;
  workspaceId: string;
  projectId: string;
  assetId: string;
};

export function classifyManagedDriveFileMismatch(
  file: DriveFileCandidate,
  expected: ManagedDriveFileExpectation,
): DriveManagedFileMismatchDetail | null {
  if (file.id !== expected.id) return "fileIdMismatch";
  if (file.name !== expected.name) return "nameMismatch";
  if (file.mimeType !== expected.mimeType) return "mimeTypeMismatch";
  if (file.trashed === true) return "trashed";
  if (file.parents?.length !== 1) return "parentCountMismatch";
  if (file.parents[0] !== expected.parentId) return "parentMismatch";
  if (file.appProperties.app !== expected.app) return "appMismatch";
  if (file.appProperties.role !== expected.role) return "roleMismatch";
  if (file.appProperties.schemaVersion !== expected.schemaVersion) {
    return "schemaVersionMismatch";
  }
  if (file.appProperties.workspaceId !== expected.workspaceId) {
    return "workspaceIdMismatch";
  }
  if (file.appProperties.projectId !== expected.projectId) {
    return "projectIdMismatch";
  }
  return null;
}

export function classifyPublishAssetMetadataMismatch(input: {
  metadata: DriveFileCandidate;
  expected: DriveAssetMetadataExpectation;
}): Exclude<DriveAssetMetadataMismatchKind, "trashedAsset"> | null {
  const { metadata, expected } = input;
  if (metadata.id !== expected.fileId) return "assetFileIdMismatch";
  if (metadata.mimeType !== expected.mimeType) return "assetMimeTypeMismatch";
  if (metadata.parents?.length !== 1) return "assetParentCountMismatch";
  if (metadata.parents[0] !== expected.parentId) return "assetParentMismatch";
  if (metadata.appProperties.app !== expected.app) return "assetAppMismatch";
  if (metadata.appProperties.role !== expected.role) return "assetRoleMismatch";
  if (metadata.appProperties.schemaVersion !== expected.schemaVersion) {
    return "assetSchemaVersionMismatch";
  }
  if (metadata.appProperties.workspaceId !== expected.workspaceId) {
    return "assetWorkspaceMismatch";
  }
  if (metadata.appProperties.projectId !== expected.projectId) {
    return "assetProjectMismatch";
  }
  if (metadata.appProperties.assetId !== expected.assetId) {
    return "assetIdMismatch";
  }
  return null;
}

export function classifyPhotosExportAssetMetadataMismatch(input: {
  metadata: DriveFileCandidate;
  expected: DriveAssetMetadataExpectation;
}): DriveAssetMetadataMismatchKind | null {
  const { metadata, expected } = input;
  if (metadata.id !== expected.fileId) return "assetFileIdMismatch";
  if (metadata.trashed === true) return "trashedAsset";
  if (metadata.mimeType !== expected.mimeType) return "assetMimeTypeMismatch";
  if (metadata.appProperties.app !== expected.app) return "assetAppMismatch";
  if (metadata.appProperties.role !== expected.role) return "assetRoleMismatch";
  if (metadata.appProperties.schemaVersion !== expected.schemaVersion) {
    return "assetSchemaVersionMismatch";
  }
  if (metadata.appProperties.workspaceId !== expected.workspaceId) {
    return "assetWorkspaceMismatch";
  }
  if (metadata.appProperties.projectId !== expected.projectId) {
    return "assetProjectMismatch";
  }
  if (metadata.appProperties.assetId !== expected.assetId) {
    return "assetIdMismatch";
  }
  if (metadata.parents?.length !== 1) return "assetParentCountMismatch";
  if (metadata.parents[0] !== expected.parentId) return "assetParentMismatch";
  return null;
}

export function buildSafeSlideDiagnostic<TKind extends string>(input: {
  slideIndex: number;
  assetName: string;
  mimeType: string;
  kind: TKind;
}): SafeSlideDiagnostic<TKind> {
  return {
    slideIndex: input.slideIndex,
    assetName: sanitizeUserFacingDiagnostic(input.assetName),
    mimeType: sanitizeUserFacingDiagnostic(input.mimeType),
    kind: input.kind,
  };
}

export function findFirstSlideContext(
  slides: readonly {
    assetId: string;
    assetName: string;
    mimeType: string;
  }[],
  assetId: string,
): { slideIndex: number; assetName: string; mimeType: string } | null {
  const slideIndex = slides.findIndex((slide) => slide.assetId === assetId);
  if (slideIndex < 0) return null;
  const slide = slides[slideIndex];
  if (!slide) return null;
  return {
    slideIndex,
    assetName: slide.assetName,
    mimeType: slide.mimeType,
  };
}
