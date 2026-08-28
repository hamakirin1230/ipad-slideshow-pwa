"use client";

import Script from "next/script";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DRIVE_AND_PHOTOS_PICKER_SCOPES,
  DRIVE_FILE_SCOPE,
  type GoogleConnectionStatus,
  type GoogleTokenClient,
  type GoogleTokenError,
  type GoogleTokenResponse,
  getGoogleClientId,
  hasGoogleClientId,
  hasGrantedDriveFileAndPhotosPickerScopes,
  hasGrantedDriveFileScope,
} from "@/lib/google-auth";
import { createGoogleSessionClientController } from "@/lib/google-session/browser-session";
import { createGooglePhotosPickerSessionClientController } from "@/lib/google-photos-picker-session/browser-session";
import {
  GOOGLE_PHOTOS_EXPORT_SCOPE,
  tokenResponseGrantsPhotosLibraryAppendonly,
} from "@/lib/google-photos-export/authorization";
import {
  createGooglePhotosExportAuthorizationError,
  commitGooglePhotosExportAfterFreshValidation,
  prepareGooglePhotosExportReviewInDrive,
  toGooglePhotosExportReviewResult,
  type CommitGooglePhotosExportResult,
  type GooglePhotosRenderedImageHolder,
  type PrepareGooglePhotosExportReviewResult,
} from "@/lib/google-photos-export/workflow";
import {
  assertGooglePhotosExportPlanIsImageOnly,
  type GooglePhotosExportPlan,
  type GooglePhotosExportProgress,
  type GooglePhotosExportRuntime,
  type SanitizedGooglePhotosExportSuccess,
} from "@/lib/google-photos-export/contract";
import {
  listProjectPublishRevisions,
  loadProjectPublishRevision,
  type ListProjectPublishRevisionsResult,
  type LoadProjectPublishRevisionResult,
} from "@/lib/publish-history/project-publish-revision-loader";
import {
  loadProjectPublishHistoryOverviewInDrive,
  type LoadProjectPublishHistoryOverviewResult,
} from "@/lib/publish-history/project-publish-history-overview";
import {
  prepareProjectPublishReviewInDrive,
} from "@/lib/publish-history/project-publish-review";
import {
  createPrepareProjectRollbackPreviewFailure,
  type PrepareProjectRollbackPreviewResult,
} from "@/lib/publish-history/project-rollback-review";
import { prepareProjectRollbackPreviewGuardInDrive } from "@/lib/publish-history/project-rollback-preview-guard";
import {
  prepareProjectRollbackExecutionReviewInDrive,
} from "@/lib/publish-history/project-rollback-execution-preflight";
import {
  type PrepareProjectRollbackExecutionReviewResult,
} from "@/lib/publish-history/project-rollback-execution-review";
import {
  buildProjectRollbackCommitFailure,
  buildSanitizedRollbackSuccess,
  pendingProjectRollbackOwnerMatches,
  type CommitPreparedProjectRollbackResult,
} from "@/lib/publish-history/project-rollback-ui";
import { executePreparedProjectRollback } from "@/lib/publish-history/project-rollback-workflow";
import type {
  ProjectRollbackPreviewGuard,
  ProjectRollbackWritePlan,
} from "@/lib/publish-history/project-rollback-write-plan";
import {
  buildSanitizedPublishSuccess,
  createPrepareReviewFailure,
  mapPublishWorkflowError,
  pendingProjectPublishOwnerMatches,
  shouldDiscardPendingPlan,
  type CommitPreparedProjectPublishResult,
  type PendingProjectPublishOwner,
  type PrepareProjectPublishReviewResult,
} from "@/lib/publish-history/project-publish-ui";
import {
  PUBLICATION_WRITE_LOCKED_CODE,
  PUBLICATION_WRITE_LOCKED_MESSAGE,
  runWithProjectPublicationWriteLock,
} from "@/lib/publish-history/project-publication-write-lock";
import { executePreparedProjectPublish } from "@/lib/publish-history/project-publish-workflow";
import type { ProjectPublishWritePlan } from "@/lib/publish-history/project-publish-write-plan";
import {
  DRIVE_PROJECT_TITLE_MAX_LENGTH,
  DriveApiError,
  DriveProjectAssetSaveError,
  DriveProjectCreateError,
  DriveProjectManifestBatchAppendError,
  DriveProjectManifestAppendError,
  DriveProjectSlideCaptionUpdateError,
  DriveProjectSlideDeleteError,
  DriveProjectSlideDurationUpdateError,
  DriveProjectSlideDuplicateError,
  DriveProjectSlideReorderError,
  DriveProjectTitleUpdateError,
  DriveProjectUnusedAssetDeletePreflightError,
  DriveProjectUnusedAssetPreviewError,
  DriveWorkspaceCreateError,
  appendDriveProjectAssetsToManifest,
  createDriveProject,
  createDriveWorkspace,
  deleteDriveProjectSlides,
  duplicateDriveProjectSlide,
  fetchDriveProjectAssetBlob,
  findWorkspaceChildCandidatesByRole,
  findWorkspaceRootCandidates,
  preflightDriveProjectUnusedAssetDeletion,
  previewDriveProjectUnusedAssets,
  preflightDriveProjectDeletion,
  listActiveDriveProjectRootsForProject,
  readDriveProjectRootMetadataForDeletion,
  readDriveTextFile,
  trashDriveProjectRootFolder,
  writeDriveProjectIndexForDeletion,
  reorderDriveProjectSlides,
  saveDriveProjectAsset,
  updateDriveProjectTitle,
  updateDriveProjectSlideCaption,
  updateDriveProjectSlideDuration,
  validateIndexJsonProjects,
  validateDriveProjectDetails,
  validateWorkspaceJsonBodies,
  validateWorkspaceMetadata,
  type DriveCreatedWorkspaceItemRole,
  type DriveProjectChangedItem,
  type DriveProjectChangedItemRole,
  type DriveProjectReadyDetails,
  type DriveProjectSavedAsset,
  type DriveProjectSummary,
  type DriveAssetMimeType,
  type DriveProjectUnusedAssetDeletePreflightResult,
  type DriveProjectUnusedAssetPreviewResult,
  type DriveWorkspaceChildRole,
  type DriveWorkspaceReadyContext,
  type DriveWorkspaceRootCandidate,
} from "@/lib/google-drive";
import { DUPLICATE_PROJECT_TITLE_MESSAGE } from "@/lib/project-title-uniqueness";
import { hydrateDriveProjectCounts } from "@/lib/drive-project-summary-hydration";
import {
  countProjectMedia,
  nullableProjectMediaCounts,
} from "@/lib/project-media-counts";
import {
  buildDriveProjectUnusedAssetDeleteOwner,
  deleteDriveProjectAssetFile,
  driveProjectUnusedAssetDeleteOwnerMatches,
  executeDriveProjectUnusedAssetDeletion,
  prepareDriveProjectUnusedAssetDeletion,
  type DriveProjectUnusedAssetDeleteOwner,
  type DriveProjectUnusedAssetDeletePlan,
  type DriveProjectUnusedAssetDeleteResult,
  type DriveProjectUnusedAssetDeleteReview,
} from "@/lib/drive-project-unused-asset-delete";
import {
  buildDriveProjectDeleteOwner,
  prepareDriveProjectDeletion,
  type DriveProjectDeletePlan,
  type DriveProjectDeleteReview,
} from "@/lib/drive-project-delete";
import {
  closePendingProjectDeleteConfirmation,
  executeProjectDeleteDriveWorkflow,
  finalizeProjectDeleteLocalCopyAfterDriveState,
  releaseOwnedProjectDeleteConfirmLocks,
  removeDeletedProjectFromList,
  sanitizeProjectDeleteDiagnostics,
  type ProjectDeletePublicResult,
  type ProjectDeleteUiStatus,
} from "@/lib/project-delete-app-workflow";
import { clearLocalOfflineProjectData } from "@/lib/offline-local-project-clear";
import type { ProjectDeleteLocalCopyStatus } from "@/lib/project-delete-local-finalization";
import {
  PHOTOS_PICKER_MAX_APP_WAIT_SECONDS,
  PHOTOS_PICKER_PHOTO_ONLY_MESSAGE,
  assertPickedMediaItemDownloadReady,
  createPhotosPickerSession,
  deletePhotosPickerSession,
  extractPickedMediaItems,
  fetchAndValidatePickedPhoto,
  getPhotosPickerSession,
  listPickedMediaItems,
  normalizePickedMediaItem,
  PhotosPickerApiError,
  PhotosPickerSelectionError,
  type PhotosDownloadedAssetMimeType,
  type PhotosPickedMediaItem,
  type PhotosPickerCreatedSession,
  type PhotosPickerResolvedPollingTiming,
  type PhotosPickerSessionSnapshot,
} from "@/lib/google-photos-picker";
import {
  DRIVE_VIDEO_UPLOAD_TYPE,
  getDriveVideoStorageDisposition,
  getLocalDriveVideoFileValidationCodes,
  isDriveVideoFileSizeWithinLimit,
  isSupportedDriveVideoMimeType,
  resolveLocalDriveVideoMimeType,
  type SupportedDriveVideoMimeType,
} from "@/lib/drive-video-policy";
import {
  getLocalDriveImageFileValidationCodes,
  resolveLocalImageFileMimeType,
  type SupportedDriveImageMimeType,
} from "@/lib/drive-image-policy";
import {
  createDriveOfflineStagingSyncRuntime,
  type DriveOfflineStagingSyncRuntime,
  type DriveOfflineStagingSyncRuntimeResult,
} from "@/lib/drive-offline-staging-sync-runtime";
import {
  OFFLINE_SYNC_CANCELLED_MESSAGE,
  OFFLINE_SYNC_COMPLETED_MESSAGE,
  OFFLINE_SYNC_STALE_MANIFEST_MESSAGE,
  type OfflineSyncProgress,
} from "@/lib/offline-sync-progress";
import {
  getUserFacingOperationFailureMessage,
  sanitizeUserFacingDiagnostic,
} from "@/lib/user-facing-diagnostics";

const DRIVE_OPERATION_TIMEOUT_MS = 15_000;
const GOOGLE_DRIVE_TOKEN_REQUEST_TIMEOUT_MS = 45_000;
const ASSET_IMPORT_MAX_SLIDE_COUNT = 50;
const ASSET_IMPORT_MAX_BATCH_COUNT = 10;
const PHOTOS_TOKEN_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const PHOTOS_EXPORT_TOKEN_REQUEST_TIMEOUT_MS = 45_000;
const PHOTOS_PICKER_CLEANUP_TIMEOUT_MS = 10_000;
const ASSET_IMPORT_DIAGNOSTIC_MAX_LENGTH = 160;
const OFFLINE_SYNC_DIAGNOSTIC_MAX_LENGTH = 160;
const ASSET_CLEANUP_PREVIEW_DIAGNOSTIC_MAX_LENGTH = 160;

const unsafeAssetImportDiagnosticPatterns = [
  /access[_-]?token/i,
  /authorization/i,
  /bearer/i,
  /baseurl/i,
  /pickeruri/i,
  /sessionid/i,
  /mediaitem\.id/i,
  /photospicker\.googleapis\.com/i,
  /https?:\/\//i,
];

export type DriveWorkspaceStatus =
  | "unchecked"
  | "checking"
  | "creating"
  | "notCreated"
  | "ready"
  | "multipleCandidates"
  | "invalidWorkspace"
  | "unsupportedVersion"
  | "authRequired"
  | "operationFailed";

type DriveWorkspaceCheckStatus = Exclude<
  DriveWorkspaceStatus,
  "unchecked" | "checking" | "creating"
>;

export type ProjectStatus =
  | "idle"
  | "checking"
  | "notCreated"
  | "ready"
  | "creating"
  | "invalid"
  | "error";

export type AssetImportStatus =
  | "idle"
  | "validatingLocalFiles"
  | "requestingPhotosPermission"
  | "openingPicker"
  | "waitingForSelection"
  | "downloadingFromPhotos"
  | "selected"
  | "uploadingToDrive"
  | "savedToDrive"
  | "updatingManifest"
  | "verifying"
  | "completed"
  | "cancelled"
  | "invalid"
  | "error";

export type OfflineSyncStatus =
  | "idle"
  | "syncing"
  | "ready"
  | "stale"
  | "failed"
  | "cancelled"
  | "blocked";

export type SlideReorderStatus =
  | "idle"
  | "saving"
  | "completed"
  | "blocked"
  | "invalid"
  | "error";

export type SlideEditStatus =
  | "idle"
  | "reordering"
  | "deleting"
  | "duplicating"
  | "completed"
  | "blocked"
  | "invalid"
  | "error";

export type AssetCleanupPreviewStatus =
  | "idle"
  | "checking"
  | "ready"
  | "blocked"
  | "invalid"
  | "error";

export type AssetCleanupDeletePreflightStatus =
  | "idle"
  | "checking"
  | "ready"
  | "blocked"
  | "invalid"
  | "error";

export type AssetCleanupDeleteStatus =
  | "idle"
  | "confirming"
  | "deleting"
  | "completed"
  | "partialFailure"
  | "blocked"
  | "cancelled"
  | "error";

export type ProjectDeleteStatus = ProjectDeleteUiStatus;

export type DriveCandidateSummary = {
  name: string;
  createdTime: string;
  modifiedTime: string;
  workspaceIdPart: string;
};

export type ProjectSummary = {
  projectId: string;
  projectIdPart: string;
  title: string;
  manifestPath: string;
  createdAt: string;
  updatedAt: string;
  slideCount: number | null;
  assetCount: number | null;
  photoCount: number | null;
  videoCount: number | null;
  otherCount: number | null;
};

export type ProjectSlideSummary = {
  slideId: string;
  slideIdPart: string;
  assetId: string;
  assetIdPart: string;
  assetFileId: string;
  assetName: string;
  type?: "image" | "video";
  mimeType: string;
  sourceMimeType: string;
  sourceCreateTime: string | null;
  fileSize?: number;
  durationMs?: number;
  unsupportedReason?: string;
  durationSeconds: number;
  caption: string;
  verified: boolean;
};

export type AssetImportBatchItemStatus =
  | "selected"
  | "downloading"
  | "downloaded"
  | "uploading"
  | "savedToDrive"
  | "manifestUpdated"
  | "failed"
  | "skipped";

export type AssetImportBatchItem = {
  clientItemId: string;
  mediaItemIdPart: string;
  filename: string;
  sourceMimeType: string;
  sourceCreateTime: string | null;
  status: AssetImportBatchItemStatus;
  downloadedContentType?: DriveAssetMimeType;
  downloadedSizeBytes?: number;
  driveFilename?: string;
  assetId?: string;
  assetIdPart?: string;
  assetFileId?: string;
  assetFileIdPart?: string;
  slideIdPart?: string;
  errorMessage?: string;
};

export type AssetImportBatchSummary = {
  selectedCount: number;
  savedCount: number;
  manifestUpdatedCount: number;
  failedCount: number;
  skippedCount: number;
};

export type ProjectDetails = {
  slideCount: number;
  assetCount: number;
  slides: ProjectSlideSummary[];
};

type AssetImportSelectionBase = {
  mediaItemIdPart: string;
  mediaItemType: "PHOTO" | "VIDEO";
  filename: string;
  sourceMimeType: string;
  sourceCreateTime: string | null;
  downloadedContentType: PhotosDownloadedAssetMimeType;
  downloadedSizeBytes: number;
  sizeLimitBytes: number;
};

type AssetImportSelectionSavedAsset = AssetImportSelectionBase & {
  driveSaved: true;
  assetId: string;
  assetIdPart: string;
  assetFileId: string;
  assetFileIdPart: string;
  driveFilename: string;
  driveMimeType: PhotosDownloadedAssetMimeType;
  driveSizeBytes: number;
};

export type AssetImportSelection =
  | (AssetImportSelectionBase & {
      driveSaved: false;
      manifestUpdated: false;
    })
  | (AssetImportSelectionSavedAsset & {
      manifestUpdated: false;
    })
  | (AssetImportSelectionSavedAsset & {
      manifestUpdated: true;
      slideIdPart: string;
    });

type LocalVideoAssetImportItem = {
  clientItemId: string;
  sourceMediaItemId: string;
  filename: string;
  file: File;
  mimeType: SupportedDriveVideoMimeType | null;
};

type LocalImageAssetImportItem = {
  clientItemId: string;
  sourceMediaItemId: string;
  filename: string;
  file: File;
  mimeType: SupportedDriveImageMimeType | null;
};

type PendingProjectPublish = {
  owner: PendingProjectPublishOwner;
  plan: ProjectPublishWritePlan;
};

type PendingProjectRollback = {
  owner: {
    projectId: string;
    targetRevisionId: string;
    revisionId: string;
    requestSequence: number;
  };
  plan: ProjectRollbackWritePlan;
};

type DriveWorkspaceCheckResult = {
  status: DriveWorkspaceCheckStatus;
  message: string;
  candidates: DriveCandidateSummary[];
  diagnostics: string[];
  readyContext?: DriveWorkspaceReadyContext;
};

type PendingPhotosTokenRequest = {
  requestId: number;
  timeoutId: ReturnType<typeof setTimeout>;
  resolve: (accessToken: string) => void;
  reject: (error: unknown) => void;
};

type TokenRequestKind = "drive" | "photos" | "photosExport" | null;

type PhotosTokenRequestFailureStatus = "cancelled" | "error";

class PhotosTokenRequestError extends Error {
  readonly status: PhotosTokenRequestFailureStatus;
  readonly diagnostics: string[];

  constructor(input: {
    status: PhotosTokenRequestFailureStatus;
    message: string;
    diagnostics: string[];
  }) {
    super(input.message);
    this.name = "PhotosTokenRequestError";
    this.status = input.status;
    this.diagnostics = [...input.diagnostics];
  }
}

const childRoles: DriveWorkspaceChildRole[] = [
  "workspace",
  "index",
  "projectsRoot",
];

const driveCreateStepMessages = [
  "Driveの保存領域を作成しています。",
  "保存領域の設定を作成しています。",
  "プロジェクト一覧を作成しています。",
  "プロジェクトの保存場所を作成しています。",
];

const projectCreateStepMessages = [
  "作成前にプロジェクト一覧を再確認しています。",
  "プロジェクトの保存場所を作成しています。",
  "プロジェクト設定を作成しています。",
  "素材の保存場所を作成しています。",
  "プロジェクト一覧の更新直前に競合を確認しています。",
  "プロジェクト一覧の更新内容を作成しています。",
  "プロジェクト一覧を更新しています。",
  "更新後のプロジェクト一覧を再確認しています。",
  "作成したプロジェクトを確認しています。",
];

const createdRoleLabels: Record<DriveCreatedWorkspaceItemRole, string> = {
  workspaceRoot: "Driveの保存領域",
  workspace: "保存領域の設定",
  index: "プロジェクト一覧",
  projectsRoot: "プロジェクトの保存場所",
};

const projectChangedItemRoleLabels: Record<DriveProjectChangedItemRole, string> =
  {
    projectRoot: "プロジェクトの保存場所",
    projectManifest: "プロジェクト設定",
    assetsRoot: "素材の保存場所",
    index: "プロジェクト一覧",
  };

type AppContextValue = {
  googleStatus: GoogleConnectionStatus;
  googleStatusLabel: string;
  googleMessage: string;
  driveFileGranted: boolean | null;

  driveStatus: DriveWorkspaceStatus;
  driveStatusLabel: string;
  driveMessage: string;
  driveCandidates: DriveCandidateSummary[];
  driveDiagnostics: string[];
  isDriveOperationInFlight: boolean;

  projectStatus: ProjectStatus;
  projectStatusLabel: string;
  projectMessage: string;
  driveProjects: ProjectSummary[];
  selectedProjectId: string | null;
  selectedProjectSummary: ProjectSummary | null;
  selectedProjectDetails: ProjectDetails | null;
  projectSummary: ProjectSummary | null;
  projectDiagnostics: string[];
  projectDetails: ProjectDetails | null;

  canImportAssets: boolean;
  assetImportStatus: AssetImportStatus;
  assetImportStatusLabel: string;
  assetImportMessage: string;
  assetImportDiagnostics: string[];
  assetImportSelection: AssetImportSelection | null;
  assetImportBatch: AssetImportBatchItem[];
  assetImportBatchSummary: AssetImportBatchSummary;
  remainingSlideSlots: number;
  assetImportMaxBatchCount: number;
  isAssetImportInFlight: boolean;
  canStartAssetImport: boolean;
  assetImportBlockedReason: string | null;
  captionUpdateSlideId: string | null;
  captionUpdateMessage: string | null;
  captionUpdateDiagnostics: string[];
  durationUpdateSlideId: string | null;
  durationUpdateMessage: string | null;
  durationUpdateDiagnostics: string[];
  slideReorderStatus: SlideReorderStatus;
  slideReorderMessage: string | null;
  slideReorderDiagnostics: string[];
  isSlideReorderInFlight: boolean;
  slideReorderBlockedReason: string | null;
  slideEditStatus: SlideEditStatus;
  slideEditMessage: string | null;
  slideEditDiagnostics: string[];
  isSlideEditInFlight: boolean;
  isSlideDeleteInFlight: boolean;
  isSlideDuplicateInFlight: boolean;
  slideEditBlockedReason: string | null;

  assetCleanupPreviewStatus: AssetCleanupPreviewStatus;
  assetCleanupPreviewMessage: string | null;
  assetCleanupPreviewDiagnostics: string[];
  assetCleanupPreviewResult: DriveProjectUnusedAssetPreviewResult | null;
  isAssetCleanupPreviewInFlight: boolean;
  assetCleanupPreviewBlockedReason: string | null;
  assetCleanupDeletePreflightStatus: AssetCleanupDeletePreflightStatus;
  assetCleanupDeletePreflightMessage: string | null;
  assetCleanupDeletePreflightDiagnostics: string[];
  assetCleanupDeletePreflightResult:
    | DriveProjectUnusedAssetDeletePreflightResult
    | null;
  isAssetCleanupDeletePreflightInFlight: boolean;
  assetCleanupDeletePreflightBlockedReason: string | null;
  assetCleanupDeleteStatus: AssetCleanupDeleteStatus;
  assetCleanupDeleteMessage: string | null;
  assetCleanupDeleteDiagnostics: string[];
  assetCleanupDeleteReview: DriveProjectUnusedAssetDeleteReview | null;
  assetCleanupDeleteResult: DriveProjectUnusedAssetDeleteResult | null;
  assetCleanupDeleteProgress: { current: number; total: number } | null;
  isAssetCleanupDeleteInFlight: boolean;
  assetCleanupDeleteBlockedReason: string | null;

  projectDeleteStatus: ProjectDeleteStatus;
  projectDeleteMessage: string | null;
  projectDeleteDiagnostics: string[];
  projectDeleteReview: DriveProjectDeleteReview | null;
  projectDeleteResult: ProjectDeletePublicResult | null;
  projectDeleteLocalCopyStatus: ProjectDeleteLocalCopyStatus;
  isProjectDeleteInFlight: boolean;
  projectDeleteBlockedReason: string | null;
  prepareProjectDeletion: () => Promise<void>;
  cancelProjectDeletion: () => void;
  confirmProjectDeletion: () => Promise<void>;

  offlineSyncStatus: OfflineSyncStatus;
  offlineSyncStatusLabel: string;
  offlineSyncMessage: string;
  offlineSyncProgress: OfflineSyncProgress | null;
  offlineSyncDiagnostics: string[];
  offlineSyncLastResult: DriveOfflineStagingSyncRuntimeResult | null;
  isOfflineSyncInFlight: boolean;
  canStartOfflineSync: boolean;
  offlineSyncBlockedReason: string | null;

  connectGoogle: () => void;
  resetGoogleAuthFlow: () => void;
  disconnectGoogle: () => void;
  checkDriveWorkspace: () => void;
  createWorkspace: () => void;
  checkProject: () => void;
  selectProject: (projectId: string) => void;
  listProjectPublishRevisionsForProject: (
    projectId: string,
    signal: AbortSignal,
  ) => Promise<ListProjectPublishRevisionsResult>;
  loadProjectPublishRevisionForProject: (
    projectId: string,
    revisionId: string,
    signal: AbortSignal,
  ) => Promise<LoadProjectPublishRevisionResult>;
  loadProjectPublishHistoryOverviewForProject: (
    projectId: string,
    signal: AbortSignal,
  ) => Promise<LoadProjectPublishHistoryOverviewResult>;
  prepareProjectRollbackPreview: (
    projectId: string,
    targetRevisionId: string,
    signal: AbortSignal,
  ) => Promise<PrepareProjectRollbackPreviewResult>;
  prepareProjectRollbackExecutionReview: (
    projectId: string,
    targetRevisionId: string,
  ) => Promise<PrepareProjectRollbackExecutionReviewResult>;
  commitPreparedProjectRollback: (input: {
    projectId: string;
    targetRevisionId: string;
    revisionId: string;
  }) => Promise<CommitPreparedProjectRollbackResult>;
  cancelPreparedProjectRollback: () => void;
  prepareProjectPublishReview: (
    projectId: string,
  ) => Promise<PrepareProjectPublishReviewResult>;
  commitPreparedProjectPublish: (input: {
    projectId: string;
    revisionId: string;
  }) => Promise<CommitPreparedProjectPublishResult>;
  cancelPreparedProjectPublish: () => void;
  isProjectPublishInFlight: boolean;
  prepareGooglePhotosExportReview: (
    projectId: string,
  ) => Promise<PrepareGooglePhotosExportReviewResult>;
  commitPreparedGooglePhotosExport: () => Promise<CommitGooglePhotosExportResult>;
  cancelPreparedGooglePhotosExport: () => void;
  abortGooglePhotosExport: () => void;
  isGooglePhotosExportInFlight: boolean;
  googlePhotosExportProgress: GooglePhotosExportProgress | null;
  googlePhotosExportResult: SanitizedGooglePhotosExportSuccess | null;
  canResumeGooglePhotosExport: boolean;
  isProjectRollbackInFlight: boolean;
  createProject: (title: string) => void;
  updateSelectedProjectTitle: (title: string) => void;
  updateProjectSlideCaption: (slideId: string, caption: string) => void;
  updateProjectSlideDuration: (
    slideId: string,
    durationSeconds: number,
  ) => void;
  moveProjectSlide: (slideId: string, direction: "up" | "down") => Promise<boolean>;
  reorderProjectSlidesByDrag: (orderedSlideIds: string[]) => Promise<boolean>;
  deleteProjectSlides: (slideIds: string[]) => Promise<boolean>;
  duplicateProjectSlide: (slideId: string) => Promise<boolean>;
  previewUnusedProjectAssets: () => void;
  preflightUnusedAssetDeletion: (assetFileIds: string[]) => Promise<void>;
  clearAssetCleanupDeletePreflight: () => void;
  prepareUnusedAssetDeletion: (assetFileIds: string[]) => void;
  confirmUnusedAssetDeletion: () => Promise<void>;
  cancelUnusedAssetDeletion: () => void;
  startAssetImport: () => void;
  startLocalImageFileImport: (files: FileList | File[]) => void;
  startLocalVideoFileImport: (files: FileList | File[]) => void;
  cancelAssetImport: () => void;
  startOfflineSync: () => void;
  cancelOfflineSync: () => void;
  registerDriveVideoPlaybackSession: (
    input: DriveVideoPlaybackSessionRegistrationInput,
  ) => Promise<DriveVideoPlaybackSessionRegistrationResult>;
  unregisterDriveVideoPlaybackSession: (sessionId: string) => void;
  clearDriveVideoPlaybackSessions: () => void;
  fetchProjectSlidePreviewBlob: (
    assetFileId: string,
    expectedMimeType: ProjectSlideSummary["mimeType"],
    signal: AbortSignal,
  ) => Promise<Blob>;
};

export type DriveVideoPlaybackSessionRegistrationInput = {
  sessionId: string;
  assetFileId: string;
  mimeType: SupportedDriveVideoMimeType;
  fileSize: number;
  expiresAt: number;
};

export type DriveVideoPlaybackSessionRegistrationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "accessTokenMissing"
        | "serviceWorkerUnavailable"
        | "serviceWorkerNotReady"
        | "messageFailed";
    };

const googleStatusLabels: Record<GoogleConnectionStatus, string> = {
  scriptLoading: "Google認証の準備中",
  notConnected: "Google未接続",
  missingClientId: "Google Client ID未設定",
  connecting: "Google接続中",
  connected: "Google接続済み",
  scopeMissing: "Google Driveへのアクセス許可不足",
  error: "Google認証エラー",
};

const driveStatusLabels: Record<DriveWorkspaceStatus, string> = {
  unchecked: "このセッションではDrive未確認",
  checking: "Drive確認中",
  creating: "Driveの保存領域を作成中",
  notCreated: "Driveの保存領域は未作成",
  ready: "Driveの保存領域を利用可能",
  multipleCandidates: "Driveの保存領域が複数あり要確認",
  invalidWorkspace: "Driveの保存領域に問題あり",
  unsupportedVersion: "保存形式のバージョン非対応",
  authRequired: "Google再接続が必要",
  operationFailed: "Drive操作失敗",
};

const projectStatusLabels: Record<ProjectStatus, string> = {
  idle: "プロジェクト未確認",
  checking: "プロジェクト確認中",
  notCreated: "プロジェクト未作成",
  ready: "プロジェクト登録確認済み",
  creating: "プロジェクト作成中",
  invalid: "プロジェクト情報に問題あり",
  error: "プロジェクト操作失敗",
};

const assetImportStatusLabels: Record<AssetImportStatus, string> = {
  idle: "素材追加待機中",
  validatingLocalFiles: "端末のファイルを確認中",
  requestingPhotosPermission: "Photos権限確認中",
  openingPicker: "Photos Picker起動中",
  waitingForSelection: "素材選択待ち",
  downloadingFromPhotos: "Photosから取得中",
  selected: "素材選択・検証済み",
  uploadingToDrive: "Drive保存中",
  savedToDrive: "Drive保存済み",
  updatingManifest: "プロジェクトへ反映中",
  verifying: "素材追加結果確認中",
  completed: "素材追加完了",
  cancelled: "素材追加キャンセル",
  invalid: "素材追加条件に問題あり",
  error: "素材追加失敗",
};

const offlineSyncStatusLabels: Record<OfflineSyncStatus, string> = {
  idle: "ローカルへの保存待ち",
  syncing: "ローカルに保存中",
  ready: "ローカルへの保存完了",
  stale: "今回の保存結果が古い",
  failed: "ローカルへの保存失敗",
  cancelled: "ローカルへの保存中止",
  blocked: "ローカルへの保存を開始できない",
};

const initialDriveMessage =
  "このセッションでは、まだDriveの保存領域を確認していません。";

const initialProjectMessage =
  "Driveの保存領域を確認した後に、プロジェクト状態を確認します。";

const initialAssetImportMessage =
  "Driveプロジェクトを確認した後に、素材を追加できます。";

const initialOfflineSyncMessage =
  "Google Driveのアルバムを確認した後に、ローカルへ保存できます。";

const initialSlideReorderMessage =
  "Driveプロジェクトを確認した後に、スライドの順番を変更できます。";

const initialSlideEditMessage =
  "Driveプロジェクトを確認した後に、スライドの順番変更・削除・複製ができます。";

const initialAssetCleanupPreviewMessage =
  "Driveプロジェクトを確認した後に、未使用素材の削除候補を確認できます。";

const initialAssetCleanupDeletePreflightMessage =
  "未使用素材を選択すると削除前の最新確認を実行できます。";

const AppContext = createContext<AppContextValue | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const clientId = getGoogleClientId();
  const hasClientId = hasGoogleClientId();
  const shouldLoadGoogleIdentityScript = hasClientId;

  const accessTokenRef = useRef<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const tokenRequestKindRef = useRef<TokenRequestKind>(null);
  const googleAuthTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const driveOperationAbortRef = useRef<AbortController | null>(null);
  const driveOperationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const driveOperationRequestIdRef = useRef(0);
  const driveOperationInFlightRef = useRef(false);
  const googleConnectionGenerationRef = useRef(0);
  const driveWorkspaceAutoCheckGenerationRef = useRef(-1);
  const queueDriveWorkspaceAutoCheckRef = useRef<() => void>(() => {});
  const pendingProjectPublishRef = useRef<PendingProjectPublish | null>(null);
  const projectPublishAbortRef = useRef<AbortController | null>(null);
  const projectPublishRequestSequenceRef = useRef(0);
  const projectPublishInFlightRef = useRef(false);
  const projectPublicationWriteInFlightRef = useRef(false);
  const projectRollbackPreviewGuardRef =
    useRef<ProjectRollbackPreviewGuard | null>(null);
  const pendingProjectRollbackRef = useRef<PendingProjectRollback | null>(null);
  const projectRollbackAbortRef = useRef<AbortController | null>(null);
  const projectRollbackRequestSequenceRef = useRef(0);
  const projectRollbackInFlightRef = useRef(false);

  const pendingPhotosTokenRequestRef =
    useRef<PendingPhotosTokenRequest | null>(null);
  const photosExportAccessTokenRef = useRef<string | null>(null);
  const photosExportTokenClientRef = useRef<GoogleTokenClient | null>(null);
  const pendingPhotosExportTokenRequestRef =
    useRef<PendingPhotosTokenRequest | null>(null);
  const pendingGooglePhotosExportRef = useRef<GooglePhotosExportPlan | null>(
    null,
  );
  const googlePhotosExportRuntimeRef = useRef<GooglePhotosExportRuntime | null>(
    null,
  );
  const googlePhotosRenderedImageRef =
    useRef<GooglePhotosRenderedImageHolder | null>(null);
  const googlePhotosExportAbortRef = useRef<AbortController | null>(null);
  const googlePhotosExportRequestSequenceRef = useRef(0);
  const googlePhotosExportInFlightRef = useRef(false);
  const photosPickerAccessTokenRef = useRef<string | null>(null);
  const currentAssetImportAccessTokenRef = useRef<string | null>(null);
  const currentAssetImportSessionIdRef = useRef<string | null>(null);
  const assetImportAbortRef = useRef<AbortController | null>(null);
  const assetImportRequestIdRef = useRef(0);
  const assetImportInFlightRef = useRef(false);
  const assetImportPickerWindowRef = useRef<Window | null>(null);

  const offlineSyncRuntimeRef =
    useRef<DriveOfflineStagingSyncRuntime | null>(null);
  const offlineSyncRequestIdRef = useRef(0);
  const offlineSyncInFlightRef = useRef(false);
  const assetCleanupPreviewInFlightRef = useRef(false);
  const assetCleanupDeletePreflightInFlightRef = useRef(false);
  const assetCleanupDeletePreflightOwnerRef =
    useRef<DriveProjectUnusedAssetDeleteOwner | null>(null);
  const pendingAssetCleanupDeletePlanRef =
    useRef<DriveProjectUnusedAssetDeletePlan | null>(null);
  const assetCleanupDeleteRequestIdRef = useRef(0);
  const assetCleanupDeleteInFlightRef = useRef(false);
  const pendingProjectDeletePlanRef =
    useRef<DriveProjectDeletePlan | null>(null);
  const projectDeleteRequestIdRef = useRef(0);
  const projectDeleteInFlightRef = useRef(false);

  if (offlineSyncRuntimeRef.current === null) {
    offlineSyncRuntimeRef.current = createDriveOfflineStagingSyncRuntime();
  }

  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus>(
    hasClientId ? "scriptLoading" : "missingClientId",
  );
  const [googleMessage, setGoogleMessage] = useState(
    hasClientId
      ? "Google認証ライブラリを読み込んでいます。"
      : "NEXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です。",
  );
  const [driveFileGranted, setDriveFileGranted] = useState<boolean | null>(null);

  const googleSessionControllerRef =
    useRef<ReturnType<typeof createGoogleSessionClientController> | null>(null);
  if (googleSessionControllerRef.current === null) {
    googleSessionControllerRef.current = createGoogleSessionClientController({
      onRestored(accessToken) {
        accessTokenRef.current = accessToken;
        setDriveFileGranted(true);
        setGoogleStatus("connected");
        setGoogleMessage(
          "Google接続済みです。認証情報は画面表示や永続保存を行いません。",
        );
        queueDriveWorkspaceAutoCheckRef.current();
      },
      onCreateFailed() {
        setGoogleMessage(
          "Google接続済みです。次回再読み込み後は再接続が必要になる可能性があります。",
        );
      },
    });
  }

  const photosPickerSessionControllerRef =
    useRef<ReturnType<
      typeof createGooglePhotosPickerSessionClientController
    > | null>(null);
  if (photosPickerSessionControllerRef.current === null) {
    photosPickerSessionControllerRef.current =
      createGooglePhotosPickerSessionClientController({
        onRestored(accessToken) {
          photosPickerAccessTokenRef.current = accessToken;
        },
      });
  }

  const [driveStatus, setDriveStatus] =
    useState<DriveWorkspaceStatus>("unchecked");
  const [driveMessage, setDriveMessage] = useState(initialDriveMessage);
  const [driveCandidates, setDriveCandidates] = useState<
    DriveCandidateSummary[]
  >([]);
  const [driveDiagnostics, setDriveDiagnostics] = useState<string[]>([]);
  const [isDriveOperationInFlight, setIsDriveOperationInFlight] =
    useState(false);

  const [workspaceReadyContext, setWorkspaceReadyContext] =
    useState<DriveWorkspaceReadyContext | null>(null);

  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("idle");
  const [projectMessage, setProjectMessage] = useState(initialProjectMessage);
  const [driveProjects, setDriveProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [projectSummary, setProjectSummary] = useState<ProjectSummary | null>(
    null,
  );
  const [projectDiagnostics, setProjectDiagnostics] = useState<string[]>([]);
  const [driveProjectReadyContext, setDriveProjectReadyContext] =
    useState<DriveProjectSummary | null>(null);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(
    null,
  );
  const [isProjectPublishInFlight, setIsProjectPublishInFlight] =
    useState(false);
  const [isProjectRollbackInFlight, setIsProjectRollbackInFlight] =
    useState(false);
  const [isGooglePhotosExportInFlight, setIsGooglePhotosExportInFlight] =
    useState(false);
  const [googlePhotosExportProgress, setGooglePhotosExportProgress] =
    useState<GooglePhotosExportProgress | null>(null);
  const [googlePhotosExportResult, setGooglePhotosExportResult] =
    useState<SanitizedGooglePhotosExportSuccess | null>(null);
  const [canResumeGooglePhotosExport, setCanResumeGooglePhotosExport] =
    useState(false);

  const [assetImportStatus, setAssetImportStatus] =
    useState<AssetImportStatus>("idle");
  const [assetImportMessage, setAssetImportMessage] = useState(
    initialAssetImportMessage,
  );
  const [assetImportDiagnostics, setAssetImportDiagnostics] = useState<
    string[]
  >([]);
  const [assetImportSelection, setAssetImportSelection] =
    useState<AssetImportSelection | null>(null);
  const [assetImportBatch, setAssetImportBatch] = useState<
    AssetImportBatchItem[]
  >([]);
  const [isAssetImportInFlight, setIsAssetImportInFlight] = useState(false);
  const [captionUpdateSlideId, setCaptionUpdateSlideId] = useState<string | null>(
    null,
  );
  const [captionUpdateMessage, setCaptionUpdateMessage] = useState<string | null>(
    null,
  );
  const [captionUpdateDiagnostics, setCaptionUpdateDiagnostics] = useState<
    string[]
  >([]);
  const [durationUpdateSlideId, setDurationUpdateSlideId] = useState<
    string | null
  >(null);
  const [durationUpdateMessage, setDurationUpdateMessage] = useState<
    string | null
  >(null);
  const [durationUpdateDiagnostics, setDurationUpdateDiagnostics] = useState<
    string[]
  >([]);
  const [slideReorderStatus, setSlideReorderStatus] =
    useState<SlideReorderStatus>("idle");
  const [slideReorderMessage, setSlideReorderMessage] = useState<string | null>(
    initialSlideReorderMessage,
  );
  const [slideReorderDiagnostics, setSlideReorderDiagnostics] = useState<
    string[]
  >([]);
  const [isSlideReorderInFlight, setIsSlideReorderInFlight] = useState(false);
  const [slideEditStatus, setSlideEditStatus] =
    useState<SlideEditStatus>("idle");
  const [slideEditMessage, setSlideEditMessage] = useState<string | null>(
    initialSlideEditMessage,
  );
  const [slideEditDiagnostics, setSlideEditDiagnostics] = useState<string[]>([]);
  const [isSlideDeleteInFlight, setIsSlideDeleteInFlight] = useState(false);
  const [isSlideDuplicateInFlight, setIsSlideDuplicateInFlight] =
    useState(false);
  const [assetCleanupPreviewStatus, setAssetCleanupPreviewStatus] =
    useState<AssetCleanupPreviewStatus>("idle");
  const [assetCleanupPreviewMessage, setAssetCleanupPreviewMessage] = useState<
    string | null
  >(initialAssetCleanupPreviewMessage);
  const [assetCleanupPreviewDiagnostics, setAssetCleanupPreviewDiagnostics] =
    useState<string[]>([]);
  const [assetCleanupPreviewResult, setAssetCleanupPreviewResult] =
    useState<DriveProjectUnusedAssetPreviewResult | null>(null);
  const [
    isAssetCleanupPreviewInFlight,
    setIsAssetCleanupPreviewInFlight,
  ] = useState(false);
  const [
    assetCleanupDeletePreflightStatus,
    setAssetCleanupDeletePreflightStatus,
  ] = useState<AssetCleanupDeletePreflightStatus>("idle");
  const [
    assetCleanupDeletePreflightMessage,
    setAssetCleanupDeletePreflightMessage,
  ] = useState<string | null>(initialAssetCleanupDeletePreflightMessage);
  const [
    assetCleanupDeletePreflightDiagnostics,
    setAssetCleanupDeletePreflightDiagnostics,
  ] = useState<string[]>([]);
  const [
    assetCleanupDeletePreflightResult,
    setAssetCleanupDeletePreflightResult,
  ] = useState<DriveProjectUnusedAssetDeletePreflightResult | null>(null);
  const [
    isAssetCleanupDeletePreflightInFlight,
    setIsAssetCleanupDeletePreflightInFlight,
  ] = useState(false);
  const [assetCleanupDeleteStatus, setAssetCleanupDeleteStatus] =
    useState<AssetCleanupDeleteStatus>("idle");
  const [assetCleanupDeleteMessage, setAssetCleanupDeleteMessage] = useState<
    string | null
  >(null);
  const [assetCleanupDeleteDiagnostics, setAssetCleanupDeleteDiagnostics] =
    useState<string[]>([]);
  const [assetCleanupDeleteReview, setAssetCleanupDeleteReview] =
    useState<DriveProjectUnusedAssetDeleteReview | null>(null);
  const [assetCleanupDeleteResult, setAssetCleanupDeleteResult] =
    useState<DriveProjectUnusedAssetDeleteResult | null>(null);
  const [assetCleanupDeleteProgress, setAssetCleanupDeleteProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [isAssetCleanupDeleteInFlight, setIsAssetCleanupDeleteInFlight] =
    useState(false);
  const [projectDeleteStatus, setProjectDeleteStatus] =
    useState<ProjectDeleteStatus>("idle");
  const [projectDeleteMessage, setProjectDeleteMessage] = useState<
    string | null
  >(null);
  const [projectDeleteDiagnostics, setProjectDeleteDiagnostics] = useState<
    string[]
  >([]);
  const [projectDeleteReview, setProjectDeleteReview] =
    useState<DriveProjectDeleteReview | null>(null);
  const [projectDeleteResult, setProjectDeleteResult] =
    useState<ProjectDeletePublicResult | null>(null);
  const [projectDeleteLocalCopyStatus, setProjectDeleteLocalCopyStatus] =
    useState<ProjectDeleteLocalCopyStatus>("notAttempted");
  const [isProjectDeleteInFlight, setIsProjectDeleteInFlight] = useState(false);

  const [offlineSyncStatus, setOfflineSyncStatus] =
    useState<OfflineSyncStatus>("idle");
  const [offlineSyncMessage, setOfflineSyncMessage] = useState(
    initialOfflineSyncMessage,
  );
  const [offlineSyncProgress, setOfflineSyncProgress] =
    useState<OfflineSyncProgress | null>(null);
  const [offlineSyncDiagnostics, setOfflineSyncDiagnostics] = useState<string[]>(
    [],
  );
  const [offlineSyncLastResult, setOfflineSyncLastResult] =
    useState<DriveOfflineStagingSyncRuntimeResult | null>(null);
  const [isOfflineSyncInFlight, setIsOfflineSyncInFlight] = useState(false);

  useEffect(() => {
    return () => {
      projectPublishRequestSequenceRef.current += 1;
      pendingProjectPublishRef.current = null;
      projectPublishAbortRef.current?.abort();
      projectPublishAbortRef.current = null;
      projectPublishInFlightRef.current = false;
      projectPublicationWriteInFlightRef.current = false;
      projectRollbackRequestSequenceRef.current += 1;
      projectRollbackPreviewGuardRef.current = null;
      pendingProjectRollbackRef.current = null;
      projectRollbackAbortRef.current?.abort();
      projectRollbackAbortRef.current = null;
      projectRollbackInFlightRef.current = false;
      assetCleanupDeleteRequestIdRef.current += 1;
      pendingAssetCleanupDeletePlanRef.current = null;
      assetCleanupDeletePreflightOwnerRef.current = null;
      assetCleanupDeleteInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = googleSessionControllerRef.current;
    const photosController = photosPickerSessionControllerRef.current;
    if (!controller) {
      return;
    }
    void controller.restoreOnPageLoad();
    void photosController?.restoreOnPageLoad();
    return () => {
      controller.dispose();
      photosController?.dispose();
    };
  }, []);

  const canImportAssets =
    projectStatus === "ready" && driveProjectReadyContext !== null;
  const remainingSlideSlots = Math.max(
    0,
    ASSET_IMPORT_MAX_SLIDE_COUNT - (projectDetails?.slideCount ?? 0),
  );
  const assetImportMaxBatchCount = Math.min(
    ASSET_IMPORT_MAX_BATCH_COUNT,
    remainingSlideSlots,
  );
  const assetImportBatchSummary = summarizeAssetImportBatch(assetImportBatch);
  const isSlideEditInFlight =
    isSlideReorderInFlight || isSlideDeleteInFlight || isSlideDuplicateInFlight;
  const assetImportBlockedReason = getAssetImportBlockedReason();
  const canStartAssetImport = assetImportBlockedReason === null;

  const offlineSyncBlockedReason = getOfflineSyncBlockedReason();
  const canStartOfflineSync = offlineSyncBlockedReason === null;
  const slideReorderBlockedReason = getSlideReorderBlockedReason();
  const slideEditBlockedReason = getSlideEditBlockedReason();
  const assetCleanupPreviewBlockedReason =
    getAssetCleanupPreviewBlockedReason();
  const assetCleanupDeletePreflightBlockedReason =
    getAssetCleanupDeletePreflightBlockedReason();
  const assetCleanupDeleteBlockedReason =
    getAssetCleanupDeleteBlockedReason();
  const projectDeleteBlockedReason = getProjectDeleteBlockedReason();

  function setDriveOperationInFlight(value: boolean) {
    driveOperationInFlightRef.current = value;
    setIsDriveOperationInFlight(value);
  }

  function clearDriveOperationTimeout() {
    if (driveOperationTimeoutRef.current) {
      clearTimeout(driveOperationTimeoutRef.current);
      driveOperationTimeoutRef.current = null;
    }
  }

  function clearGoogleAuthTimeout() {
    if (googleAuthTimeoutRef.current) {
      clearTimeout(googleAuthTimeoutRef.current);
      googleAuthTimeoutRef.current = null;
    }
  }

  function getGoogleAuthPopupFailureMessage(error?: GoogleTokenError) {
    switch (error?.type) {
      case "popup_failed_to_open":
        return "Google認証のポップアップを開けませんでした。ポップアップ許可、または残っている認証画面を確認してください。";

      case "popup_closed":
        return "Google認証画面が完了前に閉じられました。残っているGoogle認証画面があれば閉じてから、認証状態をリセットして再試行してください。";

      case "unknown":
        return "Google認証で不明なpopupエラーが発生しました。残っているGoogle認証画面があれば閉じてから、認証状態をリセットして再試行してください。";

      default:
        return "Google認証のポップアップを開けない、または認証画面が閉じられた可能性があります。残っているGoogle認証画面があれば閉じてから、認証状態をリセットして再試行してください。";
    }
  }

  function setAssetImportInFlightState(value: boolean) {
    assetImportInFlightRef.current = value;
    setIsAssetImportInFlight(value);
  }

  function setOfflineSyncInFlightState(value: boolean) {
    offlineSyncInFlightRef.current = value;
    setIsOfflineSyncInFlight(value);
  }

  function setSlideReorderInFlightState(value: boolean) {
    setIsSlideReorderInFlight(value);
  }

  function setSlideDeleteInFlightState(value: boolean) {
    setIsSlideDeleteInFlight(value);
  }

  function setSlideDuplicateInFlightState(value: boolean) {
    setIsSlideDuplicateInFlight(value);
  }

  function setAssetCleanupPreviewInFlightState(value: boolean) {
    assetCleanupPreviewInFlightRef.current = value;
    setIsAssetCleanupPreviewInFlight(value);
  }

  function setAssetCleanupDeletePreflightInFlightState(value: boolean) {
    assetCleanupDeletePreflightInFlightRef.current = value;
    setIsAssetCleanupDeletePreflightInFlight(value);
  }

  function setAssetCleanupDeleteInFlightState(value: boolean) {
    assetCleanupDeleteInFlightRef.current = value;
    setIsAssetCleanupDeleteInFlight(value);
  }

  function clearPendingPhotosTokenRequest(reason?: PhotosTokenRequestError) {
    const pendingRequest = pendingPhotosTokenRequestRef.current;

    if (!pendingRequest) {
      return;
    }

    clearTimeout(pendingRequest.timeoutId);
    pendingPhotosTokenRequestRef.current = null;

    if (reason) {
      pendingRequest.reject(reason);
    }
  }

  function closeAssetImportPickerWindow() {
    const pickerWindow = assetImportPickerWindowRef.current;
    assetImportPickerWindowRef.current = null;

    if (!pickerWindow || pickerWindow.closed) {
      return;
    }

    try {
      pickerWindow.close();
    } catch {
      // Window cleanup must not replace the main asset import result.
    }
  }

  function clearAssetImportRuntimeRefs(options: {
    abort: boolean;
    rejectPendingPhotosTokenRequest: boolean;
  }) {
    clearPendingPhotosTokenRequest(
      options.rejectPendingPhotosTokenRequest
        ? new PhotosTokenRequestError({
            status: "cancelled",
            message: "Photos token request was cancelled.",
            diagnostics: ["素材追加処理を中止しました。"],
          })
        : undefined,
    );
    currentAssetImportAccessTokenRef.current = null;
    currentAssetImportSessionIdRef.current = null;

    if (options.abort && assetImportAbortRef.current) {
      assetImportAbortRef.current.abort();
    }

    assetImportAbortRef.current = null;
    closeAssetImportPickerWindow();
  }

  function invalidatePhotosPickerSession() {
    photosPickerAccessTokenRef.current = null;
    photosPickerSessionControllerRef.current?.invalidate();
    photosPickerSessionControllerRef.current?.deleteAfterLocalDisconnect();
  }

  function requestPhotosAccessToken(requestId: number) {
    const restoredPhotosAccessToken = photosPickerAccessTokenRef.current;
    if (restoredPhotosAccessToken) {
      return Promise.resolve(restoredPhotosAccessToken);
    }

    const tokenClient = tokenClientRef.current;

    if (!tokenClient) {
      return Promise.reject(
        new PhotosTokenRequestError({
          status: "error",
          message: "Google token client was not ready.",
          diagnostics: [
            "Google認証ライブラリの準備が完了していません。",
            "Drive保存: 未実行",
            "プロジェクト反映: 未実行",
          ],
        }),
      );
    }

    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const pendingRequest = pendingPhotosTokenRequestRef.current;

        if (!pendingRequest || pendingRequest.requestId !== requestId) {
          return;
        }

        pendingPhotosTokenRequestRef.current = null;
        tokenRequestKindRef.current = null;
        reject(
          new PhotosTokenRequestError({
            status: "cancelled",
            message: "Photos token request timed out.",
            diagnostics: [
              "Google Photosの利用許可または素材選択待ちが30分でタイムアウトしました。",
              "Drive保存: 未実行",
              "プロジェクト反映: 未実行",
            ],
          }),
        );
      }, PHOTOS_TOKEN_REQUEST_TIMEOUT_MS);

      pendingPhotosTokenRequestRef.current = {
        requestId,
        timeoutId,
        resolve,
        reject,
      };

      tokenRequestKindRef.current = "photos";

      try {
        tokenClient.requestAccessToken({
          scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
          include_granted_scopes: true,
          prompt: "consent",
        });
      } catch {
        const pendingRequest = pendingPhotosTokenRequestRef.current;

        if (pendingRequest?.requestId === requestId) {
          clearTimeout(pendingRequest.timeoutId);
          pendingPhotosTokenRequestRef.current = null;
        }

        tokenRequestKindRef.current = null;
        reject(
          new PhotosTokenRequestError({
            status: "error",
            message: "Photos token request could not be started.",
            diagnostics: [
              "Google Photosの利用許可要求を開始できませんでした。",
              "Drive保存: 未実行",
              "プロジェクト反映: 未実行",
            ],
          }),
        );
      }
    });
  }

  function handlePhotosTokenResponse(tokenResponse: GoogleTokenResponse) {
    const pendingRequest = pendingPhotosTokenRequestRef.current;

    if (!pendingRequest) {
      if (
        tokenRequestKindRef.current === "photos" ||
        tokenResponseIncludesPhotosPickerScope(tokenResponse)
      ) {
        tokenRequestKindRef.current = null;
        return true;
      }

      return false;
    }

    if (pendingRequest.requestId !== assetImportRequestIdRef.current) {
      clearTimeout(pendingRequest.timeoutId);
      pendingPhotosTokenRequestRef.current = null;
      tokenRequestKindRef.current = null;
      return true;
    }

    clearTimeout(pendingRequest.timeoutId);
    pendingPhotosTokenRequestRef.current = null;
    tokenRequestKindRef.current = null;

    if (tokenResponse.error === "access_denied") {
      pendingRequest.reject(
        new PhotosTokenRequestError({
          status: "cancelled",
          message: "Photos permission was cancelled.",
          diagnostics: [
            "Google Photosの利用許可がキャンセルされました。",
            "Drive保存: 未実行",
            "プロジェクト反映: 未実行",
          ],
        }),
      );
      return true;
    }

    if (tokenResponse.error) {
      pendingRequest.reject(
        new PhotosTokenRequestError({
          status: "error",
          message: "Photos token request returned an error.",
          diagnostics: [
            "Google Photosの利用許可でエラーが返されました。",
            "Drive保存: 未実行",
            "プロジェクト反映: 未実行",
          ],
        }),
      );
      return true;
    }

    if (!tokenResponse.access_token) {
      pendingRequest.reject(
        new PhotosTokenRequestError({
          status: "error",
          message: "Photos access token was missing.",
          diagnostics: [
            "Google Photos用の認証情報を受け取れませんでした。",
            "Drive保存: 未実行",
            "プロジェクト反映: 未実行",
          ],
        }),
      );
      return true;
    }

    if (!hasGrantedDriveFileAndPhotosPickerScopes(tokenResponse)) {
      pendingRequest.reject(
        new PhotosTokenRequestError({
          status: "error",
          message: "Photos Picker scopes were not granted.",
          diagnostics: [
            "Google Photos Pickerに必要なscopeを確認できませんでした。",
            "Drive保存: 未実行",
            "プロジェクト反映: 未実行",
          ],
        }),
      );
      return true;
    }

    photosPickerAccessTokenRef.current = tokenResponse.access_token;
    void photosPickerSessionControllerRef.current?.persistAfterPhotosPickerConnect(
      tokenResponse,
    );
    pendingRequest.resolve(tokenResponse.access_token);
    return true;
  }

  function handlePhotosTokenErrorCallback() {
    const pendingRequest = pendingPhotosTokenRequestRef.current;

    if (!pendingRequest) {
      if (tokenRequestKindRef.current === "photos") {
        tokenRequestKindRef.current = null;
        return true;
      }

      return false;
    }

    clearTimeout(pendingRequest.timeoutId);
    pendingPhotosTokenRequestRef.current = null;
    tokenRequestKindRef.current = null;
    pendingRequest.reject(
      new PhotosTokenRequestError({
        status: "cancelled",
        message: "Photos permission did not complete.",
        diagnostics: [
          "Google Photosの利用許可が完了しませんでした。",
          "Drive保存: 未実行",
          "プロジェクト反映: 未実行",
        ],
      }),
    );

    return true;
  }

  function requestPhotosExportAccessToken(requestId: number) {
    const existingToken = photosExportAccessTokenRef.current;
    if (existingToken) {
      return Promise.resolve(existingToken);
    }

    const tokenClient = photosExportTokenClientRef.current;
    if (!tokenClient) {
      return Promise.reject(
        new PhotosTokenRequestError({
          status: "error",
          message: "Google token client was not ready.",
          diagnostics: ["Google認証ライブラリの準備が完了していません。"],
        }),
      );
    }

    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const pendingRequest = pendingPhotosExportTokenRequestRef.current;
        if (!pendingRequest || pendingRequest.requestId !== requestId) {
          return;
        }
        pendingPhotosExportTokenRequestRef.current = null;
        tokenRequestKindRef.current = null;
        reject(
          new PhotosTokenRequestError({
            status: "cancelled",
            message: "Photos export token request timed out.",
            diagnostics: ["Googleフォトへの書き出し許可待ちがタイムアウトしました。"],
          }),
        );
      }, PHOTOS_EXPORT_TOKEN_REQUEST_TIMEOUT_MS);

      pendingPhotosExportTokenRequestRef.current = {
        requestId,
        timeoutId,
        resolve,
        reject,
      };
      tokenRequestKindRef.current = "photosExport";

      try {
        tokenClient.requestAccessToken({
          scope: GOOGLE_PHOTOS_EXPORT_SCOPE,
          include_granted_scopes: false,
          prompt: "consent",
        });
      } catch {
        const pendingRequest = pendingPhotosExportTokenRequestRef.current;
        if (pendingRequest?.requestId === requestId) {
          clearTimeout(pendingRequest.timeoutId);
          pendingPhotosExportTokenRequestRef.current = null;
        }
        tokenRequestKindRef.current = null;
        reject(
          new PhotosTokenRequestError({
            status: "error",
            message: "Photos export token request could not be started.",
            diagnostics: ["Googleフォトへの書き出し許可要求を開始できませんでした。"],
          }),
        );
      }
    });
  }

  function handlePhotosExportTokenResponse(tokenResponse: GoogleTokenResponse) {
    const pendingRequest = pendingPhotosExportTokenRequestRef.current;
    if (!pendingRequest) {
      if (tokenRequestKindRef.current === "photosExport") {
        tokenRequestKindRef.current = null;
        return true;
      }
      return false;
    }

    clearTimeout(pendingRequest.timeoutId);
    pendingPhotosExportTokenRequestRef.current = null;
    tokenRequestKindRef.current = null;

    if (tokenResponse.error === "access_denied") {
      pendingRequest.reject(
        new PhotosTokenRequestError({
          status: "cancelled",
          message: "Photos export permission was cancelled.",
          diagnostics: ["Googleフォトへの書き出し許可がキャンセルされました。"],
        }),
      );
      return true;
    }

    if (tokenResponse.error || !tokenResponse.access_token) {
      pendingRequest.reject(
        new PhotosTokenRequestError({
          status: "error",
          message: "Photos export token request returned an error.",
          diagnostics: ["Googleフォトへの書き出し許可でエラーが返されました。"],
        }),
      );
      return true;
    }

    if (!tokenResponseGrantsPhotosLibraryAppendonly(tokenResponse)) {
      pendingRequest.reject(
        new PhotosTokenRequestError({
          status: "error",
          message: "Photos Library appendonly scope was not granted.",
          diagnostics: ["Googleフォトへの書き出しに必要な許可を確認できませんでした。"],
        }),
      );
      return true;
    }

    photosExportAccessTokenRef.current = tokenResponse.access_token;
    pendingRequest.resolve(tokenResponse.access_token);
    return true;
  }

  function handlePhotosExportTokenErrorCallback() {
    const pendingRequest = pendingPhotosExportTokenRequestRef.current;
    if (!pendingRequest) {
      if (tokenRequestKindRef.current === "photosExport") {
        tokenRequestKindRef.current = null;
        return true;
      }
      return false;
    }

    clearTimeout(pendingRequest.timeoutId);
    pendingPhotosExportTokenRequestRef.current = null;
    tokenRequestKindRef.current = null;
    pendingRequest.reject(
      new PhotosTokenRequestError({
        status: "cancelled",
        message: "Photos export permission did not complete.",
        diagnostics: ["Googleフォトへの書き出し許可が完了しませんでした。"],
      }),
    );
    return true;
  }

  function discardPendingGooglePhotosExport() {
    googlePhotosExportRequestSequenceRef.current += 1;
    googlePhotosExportAbortRef.current?.abort();
    googlePhotosExportAbortRef.current = null;
    pendingGooglePhotosExportRef.current = null;
    googlePhotosExportRuntimeRef.current = null;
    googlePhotosRenderedImageRef.current = null;
    googlePhotosExportInFlightRef.current = false;
    setIsGooglePhotosExportInFlight(false);
    setGooglePhotosExportProgress(null);
    setCanResumeGooglePhotosExport(false);
  }

  function clearPhotosExportAuthorization() {
    const pendingRequest = pendingPhotosExportTokenRequestRef.current;
    if (pendingRequest) {
      clearTimeout(pendingRequest.timeoutId);
      pendingPhotosExportTokenRequestRef.current = null;
      pendingRequest.reject(
        new PhotosTokenRequestError({
          status: "cancelled",
          message: "Photos export permission was cleared.",
          diagnostics: ["Googleフォトへの書き出し許可を破棄しました。"],
        }),
      );
    }
    photosExportAccessTokenRef.current = null;
  }

  function getAssetImportBlockedReason() {
    if (assetImportInFlightRef.current || isAssetImportInFlight) {
      return "素材追加処理中です。";
    }

    if (isSlideEditInFlight) {
      return "スライド編集中のため、素材追加は開始できません。";
    }

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Drive操作中のため、素材追加は開始できません。";
    }

    if (offlineSyncInFlightRef.current || isOfflineSyncInFlight) {
      return "ローカルへの保存中のため、素材追加は開始できません。";
    }

    if (
      assetImportBatch.some((item) => item.status === "savedToDrive") ||
      (assetImportSelection?.driveSaved === true &&
        !assetImportSelection.manifestUpdated)
    ) {
      return "Drive保存済みの素材がプロジェクトへ未反映、または反映完了を確認できていません。Drive状態を再確認するまで、追加の素材追加は開始できません。";
    }

    if (!canImportAssets) {
      return "Driveプロジェクトの確認が完了していないため、素材追加は開始できません。";
    }

    if (!workspaceReadyContext) {
      return "Driveの保存領域を確認できないため、素材追加は開始できません。";
    }

    if (!projectDetails) {
      return "プロジェクト詳細を確認できないため、素材追加は開始できません。";
    }

    if (projectDetails.slideCount >= ASSET_IMPORT_MAX_SLIDE_COUNT) {
      return "本編スライド数が上限の50件に達しています。";
    }

    return null;
  }

  function setSafeAssetImportDiagnostics(diagnostics: string[]) {
    setAssetImportDiagnostics(sanitizeAssetImportDiagnostics(diagnostics));
  }

  function updateAssetImportBatchItem(
    clientItemId: string,
    patch: Partial<AssetImportBatchItem>,
  ) {
    setAssetImportBatch((currentItems) =>
      currentItems.map((item) =>
        item.clientItemId === clientItemId ? { ...item, ...patch } : item,
      ),
    );
  }

  function getOfflineSyncBlockedReason() {
    if (offlineSyncInFlightRef.current || isOfflineSyncInFlight) {
      return "ローカルへの保存を実行中です。";
    }

    if (isSlideEditInFlight) {
      return "スライド編集中のため、ローカルへの保存は開始できません。";
    }

    if (assetImportInFlightRef.current || isAssetImportInFlight) {
      return "素材追加処理中のため、ローカルへの保存は開始できません。";
    }

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Google Driveの操作中のため、ローカルへの保存は開始できません。";
    }

    if (googleStatus !== "connected" || driveFileGranted !== true) {
      return "Google接続とGoogle Driveへのアクセス許可が必要です。";
    }

    if (!accessTokenRef.current) {
      return "Google認証情報を確認できません。Googleへ再接続してください。";
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      return "Driveの保存領域を確認してください。";
    }

    if (projectStatus !== "ready" || !driveProjectReadyContext) {
      return "Driveプロジェクトを確認してください。";
    }

    return null;
  }

  function getSlideReorderBlockedReason() {
    const editBlockedReason = getSlideEditBlockedReason({
      allowSingleSlide: false,
    });

    if (editBlockedReason) {
      return editBlockedReason;
    }

    if (projectDetails && projectDetails.slides.length <= 1) {
      return "スライド順変更には2枚以上のスライドが必要です。";
    }

    return null;
  }

  function getSlideEditBlockedReason(options?: { allowSingleSlide?: boolean }) {
    if (isSlideEditInFlight) {
      return "スライド編集中です。";
    }

    if (offlineSyncInFlightRef.current || isOfflineSyncInFlight) {
      return "ローカルへの保存中のため、スライド編集はできません。";
    }

    if (assetImportInFlightRef.current || isAssetImportInFlight) {
      return "素材追加処理中のため、スライド編集はできません。";
    }

    if (captionUpdateSlideId !== null) {
      return "テロップ保存中のため、スライド編集はできません。";
    }

    if (durationUpdateSlideId !== null) {
      return "表示時間保存中のため、スライド編集はできません。";
    }

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Drive操作中のため、スライド編集はできません。";
    }

    if (googleStatus !== "connected" || driveFileGranted !== true) {
      return "Google接続とGoogle Driveへのアクセス許可が必要です。";
    }

    if (!accessTokenRef.current) {
      return "Google認証情報を確認できません。Googleへ再接続してください。";
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      return "Driveの保存領域を確認してください。";
    }

    if (projectStatus !== "ready" || !driveProjectReadyContext || !projectDetails) {
      return "Driveプロジェクトを確認してください。";
    }

    if (options?.allowSingleSlide !== true && projectDetails.slides.length <= 0) {
      return "編集対象のスライドがありません。";
    }

    return null;
  }

  function getAssetCleanupPreviewBlockedReason() {
    if (
      assetCleanupDeleteInFlightRef.current ||
      isAssetCleanupDeleteInFlight
    ) {
      return "未使用素材を削除中です。";
    }

    if (
      assetCleanupPreviewInFlightRef.current ||
      isAssetCleanupPreviewInFlight
    ) {
      return "未使用素材の削除候補を確認中です。";
    }

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Drive操作中のため、未使用素材の確認は開始できません。";
    }

    if (assetImportInFlightRef.current || isAssetImportInFlight) {
      return "素材追加処理中のため、未使用素材の確認は開始できません。";
    }

    if (offlineSyncInFlightRef.current || isOfflineSyncInFlight) {
      return "ローカルへの保存中のため、未使用素材の確認は開始できません。";
    }

    if (
      isSlideEditInFlight ||
      captionUpdateSlideId !== null ||
      durationUpdateSlideId !== null
    ) {
      return "プロジェクト編集中のため、未使用素材の確認は開始できません。";
    }

    if (googleStatus !== "connected" || driveFileGranted !== true) {
      return "Google接続とGoogle Driveへのアクセス許可が必要です。";
    }

    if (!accessTokenRef.current) {
      return "Google認証情報を確認できません。Googleへ再接続してください。";
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      return "Driveの保存領域を確認してください。";
    }

    if (projectStatus !== "ready" || !driveProjectReadyContext) {
      return "Driveプロジェクトを確認してください。";
    }

    return null;
  }

  function getAssetCleanupDeletePreflightBlockedReason() {
    if (
      assetCleanupDeletePreflightInFlightRef.current ||
      isAssetCleanupDeletePreflightInFlight
    ) {
      return "未使用素材の削除前確認を実行中です。";
    }

    if (assetCleanupPreviewInFlightRef.current || isAssetCleanupPreviewInFlight) {
      return "未使用素材の確認中のため、削除前確認は開始できません。";
    }

    return getAssetCleanupPreviewBlockedReason();
  }

  function getAssetCleanupDeleteBlockedReason() {
    if (
      assetCleanupDeleteInFlightRef.current ||
      isAssetCleanupDeleteInFlight
    ) {
      return "未使用素材を削除中です。";
    }

    if (
      projectPublishInFlightRef.current ||
      projectRollbackInFlightRef.current ||
      projectPublicationWriteInFlightRef.current
    ) {
      return "公開またはロールバック処理中のため、未使用素材を削除できません。";
    }

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Drive操作中のため、未使用素材を削除できません。";
    }

    if (assetCleanupDeletePreflightResult) {
      const preflightOwner = assetCleanupDeletePreflightOwnerRef.current;
      if (
        !preflightOwner ||
        !workspaceReadyContext ||
        !driveProjectReadyContext ||
        !driveProjectUnusedAssetDeleteOwnerMatches(
          preflightOwner,
          buildDriveProjectUnusedAssetDeleteOwner({
            workspaceId: workspaceReadyContext.workspaceId,
            project: driveProjectReadyContext,
          }),
        )
      ) {
        return "Driveの保存領域またはプロジェクトが削除前確認時から変わりました。";
      }
    }

    if (
      assetCleanupDeletePreflightInFlightRef.current ||
      isAssetCleanupDeletePreflightInFlight
    ) {
      return "未使用素材の削除前確認を実行中です。";
    }

    return getAssetCleanupPreviewBlockedReason();
  }

  function getProjectDeleteBlockedReason() {
    if (projectDeleteInFlightRef.current || isProjectDeleteInFlight) {
      return "アルバムを削除中です。";
    }

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Drive操作中のため、アルバムを削除できません。";
    }

    if (assetImportInFlightRef.current || isAssetImportInFlight) {
      return "素材追加処理中のため、アルバムを削除できません。";
    }

    if (offlineSyncInFlightRef.current || isOfflineSyncInFlight) {
      return "ローカルへの保存中のため、アルバムを削除できません。";
    }

    if (
      isSlideEditInFlight ||
      captionUpdateSlideId !== null ||
      durationUpdateSlideId !== null
    ) {
      return "スライド編集中のため、アルバムを削除できません。";
    }

    if (
      assetCleanupPreviewInFlightRef.current ||
      isAssetCleanupPreviewInFlight ||
      assetCleanupDeletePreflightInFlightRef.current ||
      isAssetCleanupDeletePreflightInFlight ||
      assetCleanupDeleteInFlightRef.current ||
      isAssetCleanupDeleteInFlight
    ) {
      return "未使用素材の確認または削除中のため、アルバムを削除できません。";
    }

    if (
      projectPublishInFlightRef.current ||
      projectRollbackInFlightRef.current ||
      projectPublicationWriteInFlightRef.current
    ) {
      return "公開またはロールバック処理中のため、アルバムを削除できません。";
    }

    if (googlePhotosExportInFlightRef.current || isGooglePhotosExportInFlight) {
      return "Googleフォトへの書き出し中のため、アルバムを削除できません。";
    }

    if (googleStatus !== "connected" || driveFileGranted !== true) {
      return "Google接続とGoogle Driveへのアクセス許可が必要です。";
    }

    if (!accessTokenRef.current) {
      return "Google認証情報を確認できません。Googleへ再接続してください。";
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      return "Driveの保存領域を確認してください。";
    }

    if (projectStatus !== "ready" || !driveProjectReadyContext) {
      return "Driveプロジェクトを確認してください。";
    }

    if (
      !selectedProjectId ||
      selectedProjectId !== driveProjectReadyContext.projectId
    ) {
      return "削除するアルバムを選択してください。";
    }

    return null;
  }

  function setSafeOfflineSyncDiagnostics(diagnostics: string[]) {
    setOfflineSyncDiagnostics(sanitizeOfflineSyncDiagnostics(diagnostics));
  }

  function setSafeAssetCleanupPreviewDiagnostics(diagnostics: string[]) {
    setAssetCleanupPreviewDiagnostics(
      sanitizeAssetCleanupPreviewDiagnostics(diagnostics),
    );
  }

  function setSafeAssetCleanupDeletePreflightDiagnostics(diagnostics: string[]) {
    setAssetCleanupDeletePreflightDiagnostics(
      sanitizeAssetCleanupPreviewDiagnostics(diagnostics),
    );
  }

  function setSafeAssetCleanupDeleteDiagnostics(diagnostics: string[]) {
    setAssetCleanupDeleteDiagnostics(
      sanitizeAssetCleanupPreviewDiagnostics(diagnostics),
    );
  }

  function resetOfflineSyncState() {
    offlineSyncRequestIdRef.current += 1;
    offlineSyncRuntimeRef.current?.cancelCurrentRun();
    setOfflineSyncInFlightState(false);
    setOfflineSyncStatus("idle");
    setOfflineSyncMessage(initialOfflineSyncMessage);
    setOfflineSyncProgress(null);
    setSafeOfflineSyncDiagnostics([]);
    setOfflineSyncLastResult(null);
  }

  function resetAssetImportState() {
    assetImportRequestIdRef.current += 1;
    clearAssetImportRuntimeRefs({
      abort: true,
      rejectPendingPhotosTokenRequest: true,
    });
    setAssetImportInFlightState(false);
    setAssetImportSelection(null);
    setAssetImportBatch([]);
    setAssetImportStatus("idle");
    setAssetImportMessage(initialAssetImportMessage);
    setSafeAssetImportDiagnostics([]);
  }

  function resetCaptionUpdateState() {
    setCaptionUpdateSlideId(null);
    setCaptionUpdateMessage(null);
    setCaptionUpdateDiagnostics([]);
  }

  function resetSlideReorderState() {
    setSlideReorderInFlightState(false);
    setSlideReorderStatus("idle");
    setSlideReorderMessage(initialSlideReorderMessage);
    setSlideReorderDiagnostics([]);
  }

  function resetSlideEditState() {
    setSlideReorderInFlightState(false);
    setSlideDeleteInFlightState(false);
    setSlideDuplicateInFlightState(false);
    setSlideEditStatus("idle");
    setSlideEditMessage(initialSlideEditMessage);
    setSlideEditDiagnostics([]);
  }

  function resetAssetCleanupPreviewState() {
    setAssetCleanupPreviewInFlightState(false);
    setAssetCleanupPreviewStatus("idle");
    setAssetCleanupPreviewMessage(initialAssetCleanupPreviewMessage);
    setSafeAssetCleanupPreviewDiagnostics([]);
    setAssetCleanupPreviewResult(null);
    clearAssetCleanupDeletePreflight();
  }

  function resetAssetCleanupDeleteState() {
    assetCleanupDeleteRequestIdRef.current += 1;
    pendingAssetCleanupDeletePlanRef.current = null;
    setAssetCleanupDeleteInFlightState(false);
    setAssetCleanupDeleteStatus("idle");
    setAssetCleanupDeleteMessage(null);
    setSafeAssetCleanupDeleteDiagnostics([]);
    setAssetCleanupDeleteReview(null);
    setAssetCleanupDeleteResult(null);
    setAssetCleanupDeleteProgress(null);
  }

  function invalidatePendingProjectDeletion() {
    projectDeleteRequestIdRef.current += 1;
    pendingProjectDeletePlanRef.current = null;
  }

  function discardPendingProjectDeleteConfirmation() {
    const closed = closePendingProjectDeleteConfirmation({
      status: projectDeleteStatus,
    });
    pendingProjectDeletePlanRef.current = null;
    if (closed.shouldClearReview) {
      setProjectDeleteReview(null);
    }
    if (closed.shouldResetPendingUi) {
      projectDeleteRequestIdRef.current += 1;
      setProjectDeleteStatus("idle");
      setProjectDeleteMessage(null);
      setProjectDeleteDiagnostics([]);
      setProjectDeleteResult(null);
      setProjectDeleteLocalCopyStatus("notAttempted");
    }
  }

  function resetProjectDeleteState() {
    invalidatePendingProjectDeletion();
    projectDeleteInFlightRef.current = false;
    setIsProjectDeleteInFlight(false);
    setProjectDeleteStatus("idle");
    setProjectDeleteMessage(null);
    setProjectDeleteDiagnostics([]);
    setProjectDeleteReview(null);
    setProjectDeleteResult(null);
    setProjectDeleteLocalCopyStatus("notAttempted");
  }

  function setSafeProjectDeleteDiagnostics(diagnostics: string[]) {
    setProjectDeleteDiagnostics(sanitizeProjectDeleteDiagnostics(diagnostics));
  }

  function clearAssetCleanupDeletePreflight() {
    assetCleanupDeletePreflightOwnerRef.current = null;
    setAssetCleanupDeletePreflightInFlightState(false);
    setAssetCleanupDeletePreflightStatus("idle");
    setAssetCleanupDeletePreflightMessage(
      initialAssetCleanupDeletePreflightMessage,
    );
    setSafeAssetCleanupDeletePreflightDiagnostics([]);
    setAssetCleanupDeletePreflightResult(null);
    resetAssetCleanupDeleteState();
  }

  function discardPendingProjectPublish(options?: {
    abort?: boolean;
    updateState?: boolean;
  }) {
    const wasInFlight = projectPublishInFlightRef.current;
    projectPublishRequestSequenceRef.current += 1;
    pendingProjectPublishRef.current = null;

    if (options?.abort !== false && projectPublishAbortRef.current) {
      projectPublishAbortRef.current.abort();
    }
    projectPublishAbortRef.current = null;
    projectPublishInFlightRef.current = false;
    if (wasInFlight) projectPublicationWriteInFlightRef.current = false;
    if (options?.updateState !== false) {
      setIsProjectPublishInFlight(false);
    }
  }

  function discardPendingProjectRollback(options?: {
    abort?: boolean;
    discardGuard?: boolean;
    updateState?: boolean;
  }) {
    const wasInFlight = projectRollbackInFlightRef.current;
    projectRollbackRequestSequenceRef.current += 1;
    pendingProjectRollbackRef.current = null;
    if (options?.discardGuard !== false) {
      projectRollbackPreviewGuardRef.current = null;
    }
    if (options?.abort !== false) {
      projectRollbackAbortRef.current?.abort();
    }
    projectRollbackAbortRef.current = null;
    projectRollbackInFlightRef.current = false;
    if (wasInFlight) projectPublicationWriteInFlightRef.current = false;
    if (options?.updateState !== false) {
      setIsProjectRollbackInFlight(false);
    }
  }

  function clearProjectReadyDetails() {
    discardPendingProjectPublish();
    discardPendingProjectRollback();
    setDriveProjectReadyContext(null);
    setProjectDetails(null);
    setProjectSummary(null);
    resetAssetImportState();
    resetCaptionUpdateState();
    resetSlideReorderState();
    resetSlideEditState();
    resetAssetCleanupPreviewState();
    resetOfflineSyncState();
  }

  function applyDriveProjects(projects: DriveProjectSummary[]) {
    setDriveProjects(projects.map((project) => toProjectSummary(project)));
  }

  function applyProjectReadyState(
    project: DriveProjectSummary,
    details: ProjectDetails = buildEmptyProjectDetails(),
    options?: {
      preserveProjectPublish?: boolean;
      preserveProjectRollback?: boolean;
    },
  ) {
    if (!options?.preserveProjectPublish) {
      discardPendingProjectPublish();
    }
    if (!options?.preserveProjectRollback) {
      discardPendingProjectRollback();
    }
    setSelectedProjectId(project.projectId);
    setDriveProjectReadyContext(project);
    setProjectDetails(details);
    const summary = toProjectSummary(project, details);
    setProjectSummary(summary);
    setDriveProjects((currentProjects) => {
      if (
        !currentProjects.some(
          (currentProject) => currentProject.projectId === project.projectId,
        )
      ) {
        return [...currentProjects, summary];
      }

      return currentProjects.map((currentProject) =>
        currentProject.projectId === project.projectId ? summary : currentProject,
      );
    });
    resetAssetImportState();
    resetAssetCleanupPreviewState();
    setAssetImportMessage(
      "写真と動画はこの端末から選べます。",
    );
  }

  function resetProjectState() {
    clearDriveVideoPlaybackSessions();
    setProjectStatus("idle");
    setProjectMessage(initialProjectMessage);
    setDriveProjects([]);
    setSelectedProjectId(null);
    setProjectDiagnostics([]);
    clearProjectReadyDetails();
    resetProjectDeleteState();
  }

  function abortDriveOperation() {
    driveOperationRequestIdRef.current += 1;
    clearDriveOperationTimeout();

    if (driveOperationAbortRef.current) {
      driveOperationAbortRef.current.abort();
      driveOperationAbortRef.current = null;
    }

    setDriveOperationInFlight(false);
  }

  function resetDriveState() {
    setDriveStatus("unchecked");
    setDriveMessage(initialDriveMessage);
    setDriveCandidates([]);
    setDriveDiagnostics([]);
    setWorkspaceReadyContext(null);
    resetProjectState();
  }

  function invalidateGoogleSessionForConnectionChange() {
    googleConnectionGenerationRef.current += 1;
    googleSessionControllerRef.current?.invalidate();
  }

  function resetGoogleAfterDriveAuthFailure() {
    invalidateGoogleSessionForConnectionChange();
    clearDriveVideoPlaybackSessions();
    clearGoogleAuthTimeout();
    tokenRequestKindRef.current = null;
    accessTokenRef.current = null;
    setDriveFileGranted(null);
    setGoogleStatus(hasClientId ? "notConnected" : "missingClientId");
    setGoogleMessage(
      "Drive APIの認証に失敗しました。Googleへ再接続してください。",
    );
    setWorkspaceReadyContext(null);
    resetProjectState();
    googleSessionControllerRef.current?.deleteAfterLocalDisconnect();
  }

  function applyDriveCheckResult(result: DriveWorkspaceCheckResult) {
    if (result.status === "authRequired") {
      resetGoogleAfterDriveAuthFailure();
    }

    if (result.status === "ready" && result.readyContext) {
      setWorkspaceReadyContext(result.readyContext);
      resetProjectState();
    } else {
      setWorkspaceReadyContext(null);
      resetProjectState();
    }

    setDriveStatus(result.status);
    setDriveMessage(result.message);
    setDriveCandidates(result.candidates);
    setDriveDiagnostics(result.diagnostics);
  }

  async function runDriveOperationStep<T>(
    requestId: number,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    driveOperationAbortRef.current = controller;

    clearDriveOperationTimeout();
    driveOperationTimeoutRef.current = setTimeout(() => {
      controller.abort();
    }, DRIVE_OPERATION_TIMEOUT_MS);

    try {
      return await operation(controller.signal);
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
      }
    }
  }

  function handleScriptReady() {
    if (!hasClientId) {
      accessTokenRef.current = null;
      tokenClientRef.current = null;
      photosExportTokenClientRef.current = null;
      setDriveFileGranted(null);
      setGoogleStatus("missingClientId");
      setGoogleMessage("NEXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です。");
      abortDriveOperation();
      resetDriveState();
      return;
    }

    const oauth2 = window.google?.accounts?.oauth2;

    if (!oauth2) {
      accessTokenRef.current = null;
      tokenClientRef.current = null;
      photosExportTokenClientRef.current = null;
      setDriveFileGranted(null);
      setGoogleStatus("error");
      setGoogleMessage("Google認証ライブラリを利用できませんでした。");
      abortDriveOperation();
      resetDriveState();
      return;
    }

    tokenClientRef.current = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      prompt: "select_account",
      include_granted_scopes: false,
      callback: (tokenResponse) => {
        if (handlePhotosTokenResponse(tokenResponse)) {
          return;
        }

        clearGoogleAuthTimeout();
        tokenRequestKindRef.current = null;

        if (tokenResponse.error) {
          accessTokenRef.current = null;
          setDriveFileGranted(null);
          setGoogleStatus("error");
          setGoogleMessage(
            "Google認証でエラーが返されました。残っているGoogle認証画面があれば閉じてから、認証状態をリセットして再試行してください。",
          );
          abortDriveOperation();
          resetDriveState();
          return;
        }

        if (!tokenResponse.access_token) {
          accessTokenRef.current = null;
          setDriveFileGranted(null);
          setGoogleStatus("error");
          setGoogleMessage(
            "Google認証情報を受け取れませんでした。認証状態をリセットしてから再試行してください。",
          );
          abortDriveOperation();
          resetDriveState();
          return;
        }

        const granted = hasGrantedDriveFileScope(tokenResponse);

        if (!granted) {
          accessTokenRef.current = null;
          setDriveFileGranted(false);
          setGoogleStatus("scopeMissing");
          setGoogleMessage(
            "Google Driveの権限を確認できませんでした。認証状態をリセットしてから再試行してください。",
          );
          abortDriveOperation();
          resetDriveState();
          return;
        }

        accessTokenRef.current = tokenResponse.access_token;
        setDriveFileGranted(true);
        setGoogleStatus("connected");
        setGoogleMessage(
          "Google接続済みです。認証情報は画面表示や永続保存を行いません。",
        );
        abortDriveOperation();
        resetDriveState();
        void googleSessionControllerRef.current?.persistAfterManualConnect(
          tokenResponse,
        );
        queueDriveWorkspaceAutoCheckRef.current();
      },
      error_callback: (error) => {
        if (handlePhotosTokenErrorCallback()) {
          return;
        }

        clearGoogleAuthTimeout();
        tokenRequestKindRef.current = null;
        accessTokenRef.current = null;
        setDriveFileGranted(null);
        setGoogleStatus("error");
        setGoogleMessage(getGoogleAuthPopupFailureMessage(error));
        abortDriveOperation();
        resetDriveState();
      },
    });

    photosExportTokenClientRef.current = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_PHOTOS_EXPORT_SCOPE,
      prompt: "consent",
      include_granted_scopes: false,
      callback: (tokenResponse) => {
        handlePhotosExportTokenResponse(tokenResponse);
      },
      error_callback: () => {
        handlePhotosExportTokenErrorCallback();
      },
    });

    if (accessTokenRef.current) {
      setDriveFileGranted(true);
      setGoogleStatus("connected");
      setGoogleMessage(
        "Google接続済みです。認証情報は画面表示や永続保存を行いません。",
      );
    } else {
      abortDriveOperation();
      resetDriveState();
      setGoogleStatus("notConnected");
      setGoogleMessage("Google接続を開始できます。");
    }
  }

   function connectGoogle() {
    abortDriveOperation();
    clearGoogleAuthTimeout();
    invalidateGoogleSessionForConnectionChange();

    if (!hasClientId) {
      accessTokenRef.current = null;
      tokenRequestKindRef.current = null;
      setDriveFileGranted(null);
      setGoogleStatus("missingClientId");
      setGoogleMessage("NEXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です。");
      resetDriveState();
      return;
    }

    if (!tokenClientRef.current) {
      accessTokenRef.current = null;
      tokenRequestKindRef.current = null;
      setGoogleStatus("scriptLoading");
      setGoogleMessage(
        "Google認証ライブラリの準備がまだ終わっていません。少し待ってから再試行してください。",
      );
      resetDriveState();
      return;
    }

    accessTokenRef.current = null;
    setDriveFileGranted(null);
    setGoogleStatus("connecting");
    setGoogleMessage(
      "Googleアカウント選択と許可確認を行っています。認証画面が戻らない場合は、残っている認証画面を閉じてから、認証状態をリセットしてください。",
    );
    resetDriveState();
    tokenRequestKindRef.current = "drive";

    googleAuthTimeoutRef.current = setTimeout(() => {
      if (tokenRequestKindRef.current !== "drive") {
        return;
      }

      tokenRequestKindRef.current = null;
      accessTokenRef.current = null;
      setDriveFileGranted(null);
      setGoogleStatus("error");
      setGoogleMessage(
        "Google認証が時間内に完了しませんでした。残っているGoogle認証画面があれば閉じてから、認証状態をリセットして再試行してください。",
      );
      abortDriveOperation();
      resetDriveState();
    }, GOOGLE_DRIVE_TOKEN_REQUEST_TIMEOUT_MS);

    try {
      tokenClientRef.current.requestAccessToken({
        prompt: "select_account",
      });
    } catch {
      clearGoogleAuthTimeout();
      tokenRequestKindRef.current = null;
      accessTokenRef.current = null;
      setDriveFileGranted(null);
      setGoogleStatus("error");
      setGoogleMessage(
        "Google認証要求を開始できませんでした。残っているGoogle認証画面があれば閉じてから、認証状態をリセットして再試行してください。",
      );
      resetDriveState();
    }
  }
  function resetGoogleAuthFlow() {
    invalidateGoogleSessionForConnectionChange();
    clearDriveVideoPlaybackSessions();
    clearGoogleAuthTimeout();
    tokenRequestKindRef.current = null;
    accessTokenRef.current = null;
    clearPhotosExportAuthorization();
    discardPendingGooglePhotosExport();
    setDriveFileGranted(null);
    abortDriveOperation();
    resetDriveState();

    setGoogleStatus(hasClientId ? "notConnected" : "missingClientId");
    setGoogleMessage(
      hasClientId
        ? "Google認証状態をリセットしました。残っているGoogle認証画面があれば閉じてから、もう一度Google接続を開始してください。"
        : "NEXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です。",
    );
    googleSessionControllerRef.current?.deleteAfterLocalDisconnect();
  }

  function disconnectGoogle() {
    invalidateGoogleSessionForConnectionChange();
    clearDriveVideoPlaybackSessions();
    abortDriveOperation();
    clearGoogleAuthTimeout();
    tokenRequestKindRef.current = null;
    accessTokenRef.current = null;
    clearPhotosExportAuthorization();
    discardPendingGooglePhotosExport();
    setDriveFileGranted(null);
    setGoogleStatus(hasClientId ? "notConnected" : "missingClientId");
    setGoogleMessage(
      hasClientId
        ? "このセッションのGoogle接続を解除しました。Google側の許可取り消しは行っていません。"
        : "NEXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です。",
    );
    resetDriveState();
    googleSessionControllerRef.current?.deleteAfterLocalDisconnect();
  }

  async function startAssetImport() {
    const blockedReason = getAssetImportBlockedReason();

    assetImportRequestIdRef.current += 1;
    const requestId = assetImportRequestIdRef.current;

    clearAssetImportRuntimeRefs({
      abort: true,
      rejectPendingPhotosTokenRequest: true,
    });
    setAssetImportInFlightState(false);
    setAssetImportSelection(null);
    setAssetImportBatch([]);
    setSafeAssetImportDiagnostics([]);

    if (blockedReason) {
      setAssetImportStatus("invalid");
      setAssetImportMessage("素材追加を開始できませんでした。");
      setSafeAssetImportDiagnostics([
        blockedReason,
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    const pickerWindow = window.open("about:blank", "_blank");

    if (!pickerWindow) {
      setAssetImportStatus("error");
      setAssetImportMessage(
        "Photos Picker用の別ウィンドウを開けませんでした。ポップアップ許可を確認してください。",
      );
      setSafeAssetImportDiagnostics([
        "Photos Picker用の別ウィンドウを開けませんでした。",
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    try {
      pickerWindow.opener = null;
    } catch {
      // opener cleanup is best-effort only.
    }

    assetImportPickerWindowRef.current = pickerWindow;
    assetImportAbortRef.current = new AbortController();
    setAssetImportInFlightState(true);
    setAssetImportStatus("requestingPhotosPermission");
    setAssetImportMessage("Google Photosの利用許可を確認しています。");

    let photosAccessToken: string | null = null;
    let pickerSessionId: string | null = null;
    let finalStatus: AssetImportStatus | null = null;
    let finalMessage = "";
    let finalDiagnostics: string[] = [];
    let finalSelection: AssetImportSelection | null = null;
    let finalProject: DriveProjectSummary | null = null;
    let finalProjectDetails: ProjectDetails | null = null;
    let finalWorkspaceReadyContext: DriveWorkspaceReadyContext | null = null;

    try {
      photosAccessToken = await requestPhotosAccessToken(requestId);

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      currentAssetImportAccessTokenRef.current = photosAccessToken;
      setAssetImportStatus("openingPicker");
      setAssetImportMessage("Photos Picker sessionを作成しています。");

      const abortSignal = assetImportAbortRef.current?.signal;

      if (!abortSignal) {
        throw createAbortError();
      }

      const pickerSession = await createPhotosPickerSession(
        photosAccessToken,
        abortSignal,
        assetImportMaxBatchCount,
      );

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      pickerSessionId = pickerSession.id;
      currentAssetImportSessionIdRef.current = pickerSession.id;

      if (pickerWindow.closed) {
        throw new PhotosPickerSelectionError({
          status: "cancelled",
          message: "Photos Picker window was closed before navigation.",
          diagnostics: [
            "Photos Picker用の別ウィンドウが選択画面を開く前に閉じられました。",
            "Drive保存: 未実行",
            "プロジェクト反映: 未実行",
          ],
        });
      }

      pickerWindow.location.href = `${pickerSession.pickerUri}/autoclose`;

      setAssetImportStatus("waitingForSelection");
      setAssetImportMessage(
        `Photos Pickerで写真を最大${assetImportMaxBatchCount}件選択してください。`,
      );

      const waitResult = await waitForPhotosPickerSelection({
        accessToken: photosAccessToken,
        session: pickerSession,
        signal: abortSignal,
      });

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      setAssetImportStatus("downloadingFromPhotos");
      setAssetImportMessage("Photosから選択結果を確認しています。");

      const pickedMediaItemsList = await listPickedMediaItems(
        photosAccessToken,
        pickerSession.id,
        abortSignal,
        assetImportMaxBatchCount,
      );

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      const pickedMediaItems = extractPickedMediaItems(
        pickedMediaItemsList,
        assetImportMaxBatchCount,
      ).map((mediaItem) => normalizePickedMediaItem(mediaItem));

      const readyWorkspace = workspaceReadyContext;
      const readyProject = driveProjectReadyContext;

      if (!readyWorkspace || !readyProject) {
        throw new DriveProjectAssetSaveError({
          status: "invalidProject",
          possibleCreatedAsset: null,
          diagnostics: [
            "Drive保存前に保存領域とプロジェクトの状態を確認できませんでした。",
            "Drive保存: 未実行",
            "プロジェクト反映: 未実行",
          ],
        });
      }

      const batchItems = pickedMediaItems.map((mediaItem) =>
        buildAssetImportBatchItem(mediaItem),
      );
      setAssetImportBatch(batchItems);

      const savedAssetsForManifest: Array<{
        clientItemId: string;
        savedAsset: DriveProjectSavedAsset;
        source: {
          filename: string | null;
          mediaType: "PHOTO" | "VIDEO";
          sourceMimeType: string;
          sourceMediaItemId: string;
          sourceCreateTime: string | null;
        };
      }> = [];
      const batchDiagnostics = [
        ...waitResult.diagnostics,
        ...pickedMediaItemsList.diagnostics,
        `Photos Picker selection: ${pickedMediaItems.length}件`,
      ];

      for (const [index, pickedMediaItem] of pickedMediaItems.entries()) {
        if (requestId !== assetImportRequestIdRef.current) {
          return;
        }

        const clientItemId = batchItems[index].clientItemId;

        try {
          if (pickedMediaItem.type === "VIDEO") {
            throw new PhotosPickerSelectionError({
              status: "invalid",
              message: PHOTOS_PICKER_PHOTO_ONLY_MESSAGE,
              diagnostics: [
                "Picked media item type was VIDEO.",
                PHOTOS_PICKER_PHOTO_ONLY_MESSAGE,
                "Drive保存: 未実行",
                "manifest反映: 未実行",
              ],
            });
          }

          assertPickedMediaItemDownloadReady(pickedMediaItem);

          updateAssetImportBatchItem(clientItemId, { status: "downloading" });
          setAssetImportMessage(
            `選択素材を順次取得しています。${index + 1} / ${pickedMediaItems.length}`,
          );

          const downloadResult = await fetchAndValidatePickedPhoto({
            accessToken: photosAccessToken,
            baseUrl: pickedMediaItem.mediaFile.baseUrl,
            mediaType: pickedMediaItem.type,
            expectedMimeType: pickedMediaItem.mediaFile.mimeType,
            signal: abortSignal,
          });

          updateAssetImportBatchItem(clientItemId, {
            status: "downloaded",
            downloadedContentType: downloadResult.downloadedContentType,
            downloadedSizeBytes: downloadResult.downloadedSizeBytes,
          });

          setAssetImportStatus("uploadingToDrive");
          setAssetImportMessage(
            `Driveへ素材を順次保存しています。${index + 1} / ${pickedMediaItems.length}`,
          );
          updateAssetImportBatchItem(clientItemId, { status: "uploading" });

          const savedAsset = await saveDriveProjectAsset({
            accessToken: photosAccessToken,
            workspaceId: readyWorkspace.workspaceId,
            project: readyProject,
            blob: downloadResult.blob,
            mimeType: downloadResult.downloadedContentType,
            sizeBytes: downloadResult.downloadedSizeBytes,
            signal: abortSignal,
          });

          updateAssetImportBatchItem(clientItemId, {
            status: "savedToDrive",
            driveFilename: savedAsset.driveFilename,
            assetId: savedAsset.assetId,
            assetIdPart: savedAsset.assetIdPart,
            assetFileId: savedAsset.assetFileId,
            assetFileIdPart: savedAsset.assetFileIdPart,
          });

          savedAssetsForManifest.push({
            clientItemId,
            savedAsset,
            source: {
              filename: pickedMediaItem.mediaFile.filename ?? null,
              mediaType: pickedMediaItem.type,
              sourceMimeType: pickedMediaItem.mediaFile.mimeType,
              sourceMediaItemId: pickedMediaItem.id,
              sourceCreateTime: pickedMediaItem.createTime,
            },
          });

          batchDiagnostics.push(
            ...pickedMediaItem.diagnostics,
            ...downloadResult.diagnostics,
            ...savedAsset.diagnostics,
          );
        } catch (itemError) {
          if (isAbortError(itemError)) {
            throw itemError;
          }

          updateAssetImportBatchItem(clientItemId, {
            status: "failed",
            errorMessage: getAssetImportItemErrorMessage(itemError),
          });
          batchDiagnostics.push(
            `item ${index + 1}: ${getAssetImportItemErrorMessage(itemError)}`,
            ...pickedMediaItem.diagnostics,
            ...getAssetImportItemFailureDiagnostics(itemError),
          );
        }
      }

      if (savedAssetsForManifest.length === 0) {
        finalStatus = "error";
        finalMessage =
          "選択素材をDriveに保存できませんでした。成功したitemはありません。";
        finalDiagnostics = [
          ...batchDiagnostics,
          "Drive保存: 成功0件",
          "プロジェクト反映: 未実行",
        ];
        return;
      }

      setAssetImportStatus("updatingManifest");
      setAssetImportMessage(
        `プロジェクトへ成功分 ${savedAssetsForManifest.length} 件をまとめて反映しています。`,
      );

      const manifestAppendResult = await appendDriveProjectAssetsToManifest({
        accessToken: photosAccessToken,
        workspaceId: readyWorkspace.workspaceId,
        indexJsonFileId: readyWorkspace.indexJsonFileId,
        project: readyProject,
        savedAssets: savedAssetsForManifest.map((item) => ({
          savedAsset: item.savedAsset,
          source: item.source,
        })),
        signal: abortSignal,
      });

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      for (const savedItem of savedAssetsForManifest) {
        const addedSlide = manifestAppendResult.addedSlides.find(
          (slide) => slide.assetId === savedItem.savedAsset.assetId,
        );
        updateAssetImportBatchItem(savedItem.clientItemId, {
          status: "manifestUpdated",
          slideIdPart: formatIdPart(addedSlide?.slideId),
        });
      }

      const nextProjectDetails = toProjectDetails(manifestAppendResult.details);

      finalProject = manifestAppendResult.project;
      finalProjectDetails = nextProjectDetails;
      finalWorkspaceReadyContext = {
        ...readyWorkspace,
        indexJsonText: manifestAppendResult.indexJsonText,
      };
      finalSelection = null;
      finalStatus = "completed";
      finalMessage =
        "Drive保存、プロジェクトへの一括反映、一覧の更新、更新後の再確認が完了しました。";
      finalDiagnostics = [
        ...batchDiagnostics,
        ...manifestAppendResult.diagnostics,
        "Drive保存: 成功分完了",
        "プロジェクト反映: 成功分完了",
        "プロジェクト一覧の更新: 完了",
        "更新後再検証: 完了",
        "テロップ変更を再生に反映するには、このアルバムをローカルに保存してください。",
      ];
    } catch (error) {
      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      if (error instanceof PhotosTokenRequestError) {
        finalStatus = error.status;
        finalMessage =
          error.status === "cancelled"
            ? "Google Photosの利用許可がキャンセルされました。"
            : "Google Photosの利用許可を確認できませんでした。";
        finalDiagnostics = error.diagnostics;
      } else if (error instanceof PhotosPickerSelectionError) {
        finalStatus = error.status;
        finalMessage =
          error.status === "cancelled"
            ? "Photos Pickerでの選択がキャンセルされました。"
            : error.status === "invalid"
              ? error.message === PHOTOS_PICKER_PHOTO_ONLY_MESSAGE
                ? PHOTOS_PICKER_PHOTO_ONLY_MESSAGE
                : "Photos Pickerの選択結果に問題があります。"
              : "Photos Picker処理に失敗しました。";
        finalDiagnostics = error.diagnostics;
      } else if (error instanceof PhotosPickerApiError) {
        if (error.status === 401 || error.status === 403) {
          invalidatePhotosPickerSession();
        }
        finalStatus = "error";
        finalMessage = "Photos Picker API処理に失敗しました。";
        finalDiagnostics = [
          ...(error.diagnostics.length > 0
            ? error.diagnostics
            : ["Google Photosから素材を取得できませんでした。"]),
          "Drive保存: 未実行",
          "プロジェクト反映: 未実行",
        ];
      } else if (error instanceof DriveProjectAssetSaveError) {
        finalStatus = error.status === "invalidProject" ? "invalid" : "error";
        finalMessage = error.possibleCreatedAsset
          ? "Drive保存結果の確認に失敗しました。Drive上に素材ファイルが作成済みの可能性があります。"
          : "Driveへの素材保存に失敗しました。";
        finalDiagnostics = buildAssetImportDriveSaveFailureDiagnostics(error);
      } else if (error instanceof DriveProjectManifestAppendError) {
        finalStatus = "error";
        finalMessage =
          "Drive保存後のプロジェクト反映に失敗しました。Drive上に中間状態が残っている可能性があります。";
        finalDiagnostics = buildAssetImportManifestAppendFailureDiagnostics(error);
      } else if (error instanceof DriveProjectManifestBatchAppendError) {
        finalStatus = "error";
        finalMessage =
          "Drive保存後のプロジェクトへの一括反映に失敗しました。Drive上に中間状態が残っている可能性があります。";
        finalDiagnostics = buildAssetImportManifestBatchAppendFailureDiagnostics(
          error,
        );
      } else if (isAbortError(error)) {
        finalStatus = "cancelled";
        finalMessage = "素材追加を中止しました。";
        finalDiagnostics = [
          "素材追加処理を中止しました。",
          "Drive保存: 未実行",
          "プロジェクト反映: 未実行",
        ];
      } else {
        finalStatus = "error";
        finalMessage = "素材追加処理に失敗しました。";
        finalDiagnostics = [
          "素材追加処理中に予期しないエラーが発生しました。",
          "Drive保存やプロジェクトへの反映が途中まで進んだかは、この画面だけでは判断できません。",
          "Drive状態を再確認してください。",
        ];
      }
    } finally {
      let cleanupDiagnostics: string[] = [];

      if (photosAccessToken && pickerSessionId) {
        cleanupDiagnostics = (
          await cleanupPhotosPickerSessionOnce({
            accessToken: photosAccessToken,
            sessionId: pickerSessionId,
          })
        ).diagnostics;
      }

      if (requestId === assetImportRequestIdRef.current) {
        if (finalStatus) {
          if (
            finalProject &&
            finalProjectDetails &&
            finalWorkspaceReadyContext
          ) {
            const updatedProject = finalProject;
            const updatedProjectDetails = finalProjectDetails;
            setWorkspaceReadyContext(finalWorkspaceReadyContext);
            setSelectedProjectId(updatedProject.projectId);
            setDriveProjectReadyContext(updatedProject);
            setProjectDetails(updatedProjectDetails);
            const nextProjectSummary = toProjectSummary(
              updatedProject,
              updatedProjectDetails,
            );
            setProjectSummary(nextProjectSummary);
            setDriveProjects((currentProjects) => {
              if (
                !currentProjects.some(
                  (currentProject) =>
                    currentProject.projectId === updatedProject.projectId,
                )
              ) {
                return [...currentProjects, nextProjectSummary];
              }

              return currentProjects.map((currentProject) =>
                currentProject.projectId === updatedProject.projectId
                  ? nextProjectSummary
                  : currentProject,
              );
            });
            setProjectStatus("ready");
            setProjectMessage(
              "プロジェクトへの素材反映を更新後に再確認しました。",
            );
          }

          setAssetImportSelection(finalSelection);
          setAssetImportStatus(finalStatus);
          setAssetImportMessage(finalMessage);
          setSafeAssetImportDiagnostics([
            ...finalDiagnostics,
            ...cleanupDiagnostics,
          ]);
        }

        currentAssetImportAccessTokenRef.current = null;
        currentAssetImportSessionIdRef.current = null;
        assetImportAbortRef.current = null;
        setAssetImportInFlightState(false);
        closeAssetImportPickerWindow();
      }
    }
  }

  async function startLocalVideoFileImport(files: FileList | File[]) {
    const blockedReason = getAssetImportBlockedReason();
    const selectedFiles = Array.from(files);

    assetImportRequestIdRef.current += 1;
    const requestId = assetImportRequestIdRef.current;

    clearAssetImportRuntimeRefs({
      abort: true,
      rejectPendingPhotosTokenRequest: true,
    });
    setAssetImportInFlightState(false);
    setAssetImportSelection(null);
    setAssetImportBatch([]);
    setSafeAssetImportDiagnostics([]);

    if (blockedReason) {
      setAssetImportStatus("invalid");
      setAssetImportMessage("動画ファイル追加を開始できませんでした。");
      setSafeAssetImportDiagnostics([
        blockedReason,
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    if (selectedFiles.length === 0) {
      setAssetImportStatus("cancelled");
      setAssetImportMessage("動画ファイルが選択されませんでした。");
      setSafeAssetImportDiagnostics([
        "Local file selection: 0件",
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    const accessToken = accessTokenRef.current;

    if (!accessToken) {
      setAssetImportStatus("invalid");
      setAssetImportMessage("Googleへ再接続してから動画ファイルを追加してください。");
      setSafeAssetImportDiagnostics([
        "Google接続を確認できません。Googleへ再接続してください。",
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    if (!readyWorkspace || !readyProject) {
      setAssetImportStatus("invalid");
      setAssetImportMessage("Driveプロジェクトの状態を確認できませんでした。");
      setSafeAssetImportDiagnostics([
        "Drive保存前に保存領域とプロジェクトの状態を確認できませんでした。",
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    assetImportAbortRef.current = new AbortController();
    setAssetImportInFlightState(true);
    setAssetImportStatus("validatingLocalFiles");
    setAssetImportMessage("選択された動画ファイルを確認しています。");

    const abortSignal = assetImportAbortRef.current.signal;
    const filesToProcess = selectedFiles.slice(0, assetImportMaxBatchCount);
    const localItems: LocalVideoAssetImportItem[] = filesToProcess.map((file) => {
      const sourceMediaItemId = `localFile:${crypto.randomUUID()}`;
      const mimeType = resolveLocalVideoFileMimeType(file);

      return {
        clientItemId: crypto.randomUUID(),
        sourceMediaItemId,
        filename: sanitizeLocalFileNameForDisplay(file.name),
        file,
        mimeType,
      };
    });
    const batchItems: AssetImportBatchItem[] = localItems.map((item) => ({
      clientItemId: item.clientItemId,
      mediaItemIdPart: formatIdPart(item.sourceMediaItemId),
      filename: item.filename,
      sourceMimeType: item.mimeType ?? "MIME不明",
      sourceCreateTime: null,
      status: "selected",
    }));

    setAssetImportBatch(batchItems);

    const savedAssetsForManifest: Array<{
      clientItemId: string;
      savedAsset: DriveProjectSavedAsset;
      source: {
        source: "localFile";
        filename: string | null;
        mediaType: "VIDEO";
        sourceMimeType: string;
        sourceMediaItemId: string;
        sourceCreateTime: string | null;
      };
    }> = [];
    const batchDiagnostics = [
      `Local video file selection: ${selectedFiles.length}件`,
      ...(selectedFiles.length > filesToProcess.length
        ? [
            `1回の上限 ${assetImportMaxBatchCount} 件を超えたため、先頭 ${filesToProcess.length} 件だけ処理します。`,
          ]
        : []),
    ];
    let finalStatus: AssetImportStatus | null = null;
    let finalMessage = "";
    let finalDiagnostics: string[] = [];
    let finalProject: DriveProjectSummary | null = null;
    let finalProjectDetails: ProjectDetails | null = null;
    let finalWorkspaceReadyContext: DriveWorkspaceReadyContext | null = null;

    try {
      for (const [index, localItem] of localItems.entries()) {
        if (requestId !== assetImportRequestIdRef.current) {
          return;
        }

        const validationDiagnostics = validateLocalVideoFile(localItem);
        const itemDiagnostics = [
          `filename: ${localItem.filename}`,
          `MIME: ${localItem.mimeType ?? "MIME不明"}`,
          `size: ${localItem.file.size} bytes`,
        ];

        if (validationDiagnostics.length > 0 || !localItem.mimeType) {
          updateAssetImportBatchItem(localItem.clientItemId, {
            status: "failed",
            errorMessage: validationDiagnostics[0],
          });
          batchDiagnostics.push(
            `item ${index + 1}: ${validationDiagnostics[0]}`,
            ...itemDiagnostics,
            ...validationDiagnostics,
          );
          continue;
        }

        try {
          batchDiagnostics.push(
            `item ${index + 1}: local video file selected.`,
            ...itemDiagnostics,
          );

          updateAssetImportBatchItem(localItem.clientItemId, {
            status: "downloaded",
            downloadedContentType: localItem.mimeType ?? undefined,
            downloadedSizeBytes: localItem.file.size,
          });

          setAssetImportStatus("uploadingToDrive");
          setAssetImportMessage(
            `Driveへ動画ファイルを順次保存しています。${index + 1} / ${localItems.length}`,
          );
          updateAssetImportBatchItem(localItem.clientItemId, { status: "uploading" });

          const savedAsset = await saveDriveProjectAsset({
            accessToken,
            workspaceId: readyWorkspace.workspaceId,
            project: readyProject,
            blob: localItem.file,
            mimeType: localItem.mimeType,
            sizeBytes: localItem.file.size,
            source: "localFile",
            uploadType: DRIVE_VIDEO_UPLOAD_TYPE,
            signal: abortSignal,
          });

          updateAssetImportBatchItem(localItem.clientItemId, {
            status: "savedToDrive",
            driveFilename: savedAsset.driveFilename,
            assetId: savedAsset.assetId,
            assetIdPart: savedAsset.assetIdPart,
            assetFileId: savedAsset.assetFileId,
            assetFileIdPart: savedAsset.assetFileIdPart,
          });

          savedAssetsForManifest.push({
            clientItemId: localItem.clientItemId,
            savedAsset,
            source: {
              source: "localFile",
              filename: localItem.filename,
              mediaType: "VIDEO",
              sourceMimeType: localItem.mimeType,
              sourceMediaItemId: localItem.sourceMediaItemId,
              sourceCreateTime: null,
            },
          });

          batchDiagnostics.push(
            ...savedAsset.diagnostics,
            ...buildDriveVideoOfflineScopeDiagnostics({
              mimeType: localItem.mimeType,
              sizeBytes: localItem.file.size,
            }),
          );
        } catch (itemError) {
          if (isAbortError(itemError)) {
            throw itemError;
          }

          updateAssetImportBatchItem(localItem.clientItemId, {
            status: "failed",
            errorMessage: getAssetImportItemErrorMessage(itemError),
          });
          batchDiagnostics.push(
            `item ${index + 1}: ${getAssetImportItemErrorMessage(itemError)}`,
            ...itemDiagnostics,
            ...getAssetImportItemFailureDiagnostics(itemError),
          );
        }
      }

      if (savedAssetsForManifest.length === 0) {
        finalStatus = "error";
        finalMessage =
          "選択された動画ファイルをDriveに保存できませんでした。成功したitemはありません。";
        finalDiagnostics = [
          ...batchDiagnostics,
          "Drive保存: 成功0件",
          "プロジェクト反映: 未実行",
        ];
        return;
      }

      setAssetImportStatus("updatingManifest");
      setAssetImportMessage(
        `プロジェクトへ端末動画の成功分 ${savedAssetsForManifest.length} 件をまとめて反映しています。`,
      );

      const manifestAppendResult = await appendDriveProjectAssetsToManifest({
        accessToken,
        workspaceId: readyWorkspace.workspaceId,
        indexJsonFileId: readyWorkspace.indexJsonFileId,
        project: readyProject,
        savedAssets: savedAssetsForManifest.map((item) => ({
          savedAsset: item.savedAsset,
          source: item.source,
        })),
        signal: abortSignal,
      });

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      for (const savedItem of savedAssetsForManifest) {
        const addedSlide = manifestAppendResult.addedSlides.find(
          (slide) => slide.assetId === savedItem.savedAsset.assetId,
        );
        updateAssetImportBatchItem(savedItem.clientItemId, {
          status: "manifestUpdated",
          slideIdPart: formatIdPart(addedSlide?.slideId),
        });
      }

      const nextProjectDetails = toProjectDetails(manifestAppendResult.details);

      finalProject = manifestAppendResult.project;
      finalProjectDetails = nextProjectDetails;
      finalWorkspaceReadyContext = {
        ...readyWorkspace,
        indexJsonText: manifestAppendResult.indexJsonText,
      };
      finalStatus = "completed";
      finalMessage =
        "端末の動画ファイルのDrive保存、プロジェクトへの一括反映、一覧の更新、更新後の再確認が完了しました。";
      finalDiagnostics = [
        ...batchDiagnostics,
        ...manifestAppendResult.diagnostics,
        "Drive保存: 完了",
        "プロジェクト反映: 完了",
        "プロジェクト一覧の更新: 完了",
        "更新後再検証: 完了",
        "保存対象のMP4/MOVを再生に反映するには、このアルバムをローカルに保存してください。",
      ];
    } catch (error) {
      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      if (error instanceof DriveProjectAssetSaveError) {
        finalStatus = error.status === "invalidProject" ? "invalid" : "error";
        finalMessage = error.possibleCreatedAsset
          ? "Drive保存結果の確認に失敗しました。Drive上に素材ファイルが作成済みの可能性があります。"
          : "Driveへの素材保存に失敗しました。";
        finalDiagnostics = buildAssetImportDriveSaveFailureDiagnostics(error);
      } else if (error instanceof DriveProjectManifestBatchAppendError) {
        finalStatus = "error";
        finalMessage =
          "Drive保存後のプロジェクトへの一括反映に失敗しました。Drive上に中間状態が残っている可能性があります。";
        finalDiagnostics = buildAssetImportManifestBatchAppendFailureDiagnostics(
          error,
        );
      } else if (isAbortError(error)) {
        finalStatus = "cancelled";
        finalMessage = "素材追加を中止しました。";
        finalDiagnostics = [
          "素材追加処理を中止しました。",
          "Drive保存: 未実行",
          "プロジェクト反映: 未実行",
        ];
      } else {
        finalStatus = "error";
        finalMessage = "local動画ファイル追加処理に失敗しました。";
        finalDiagnostics = [
          "local動画ファイル追加処理中に予期しないエラーが発生しました。",
          "Drive保存やプロジェクトへの反映が途中まで進んだかは、この画面だけでは判断できません。",
          "Drive状態を再確認してください。",
        ];
      }
    } finally {
      if (requestId === assetImportRequestIdRef.current) {
        if (finalStatus) {
          if (
            finalProject &&
            finalProjectDetails &&
            finalWorkspaceReadyContext
          ) {
            const updatedProject = finalProject;
            const updatedProjectDetails = finalProjectDetails;
            setWorkspaceReadyContext(finalWorkspaceReadyContext);
            setSelectedProjectId(updatedProject.projectId);
            setDriveProjectReadyContext(updatedProject);
            setProjectDetails(updatedProjectDetails);
            const nextProjectSummary = toProjectSummary(
              updatedProject,
              updatedProjectDetails,
            );
            setProjectSummary(nextProjectSummary);
            setDriveProjects((currentProjects) => {
              if (
                !currentProjects.some(
                  (currentProject) =>
                    currentProject.projectId === updatedProject.projectId,
                )
              ) {
                return [...currentProjects, nextProjectSummary];
              }

              return currentProjects.map((currentProject) =>
                currentProject.projectId === updatedProject.projectId
                  ? nextProjectSummary
                  : currentProject,
              );
            });
            setProjectStatus("ready");
            setProjectMessage(
              "プロジェクトへの端末動画の反映を更新後に再確認しました。",
            );
          }

          setAssetImportSelection(null);
          setAssetImportStatus(finalStatus);
          setAssetImportMessage(finalMessage);
          setSafeAssetImportDiagnostics(finalDiagnostics);
        }

        assetImportAbortRef.current = null;
        setAssetImportInFlightState(false);
      }
    }
  }

  async function startLocalImageFileImport(files: FileList | File[]) {
    const blockedReason = getAssetImportBlockedReason();
    const selectedFiles = Array.from(files);

    assetImportRequestIdRef.current += 1;
    const requestId = assetImportRequestIdRef.current;

    clearAssetImportRuntimeRefs({
      abort: true,
      rejectPendingPhotosTokenRequest: true,
    });
    setAssetImportInFlightState(false);
    setAssetImportSelection(null);
    setAssetImportBatch([]);
    setSafeAssetImportDiagnostics([]);

    if (blockedReason) {
      setAssetImportStatus("invalid");
      setAssetImportMessage("写真ファイル追加を開始できませんでした。");
      setSafeAssetImportDiagnostics([
        blockedReason,
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    if (selectedFiles.length === 0) {
      setAssetImportStatus("cancelled");
      setAssetImportMessage("写真ファイルが選択されませんでした。");
      setSafeAssetImportDiagnostics([
        "Local file selection: 0件",
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    const accessToken = accessTokenRef.current;

    if (!accessToken) {
      setAssetImportStatus("invalid");
      setAssetImportMessage("Googleへ再接続してから写真ファイルを追加してください。");
      setSafeAssetImportDiagnostics([
        "Google接続を確認できません。Googleへ再接続してください。",
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    if (!readyWorkspace || !readyProject) {
      setAssetImportStatus("invalid");
      setAssetImportMessage("Driveプロジェクトの状態を確認できませんでした。");
      setSafeAssetImportDiagnostics([
        "Drive保存前に保存領域とプロジェクトの状態を確認できませんでした。",
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    if (selectedFiles.length > assetImportMaxBatchCount) {
      setAssetImportStatus("invalid");
      setAssetImportMessage("選択できる写真は1回あたりの上限を超えています。");
      setSafeAssetImportDiagnostics([
        `Local image file selection: ${selectedFiles.length}件`,
        `1回の上限 ${assetImportMaxBatchCount} 件を超えたため、Drive保存は実行しません。`,
        "Drive保存: 未実行",
        "プロジェクト反映: 未実行",
      ]);
      return;
    }

    assetImportAbortRef.current = new AbortController();
    setAssetImportInFlightState(true);
    setAssetImportStatus("validatingLocalFiles");
    setAssetImportMessage("選択された写真ファイルを確認しています。");

    const abortSignal = assetImportAbortRef.current.signal;
    const localItems: LocalImageAssetImportItem[] = selectedFiles.map((file) => {
      const sourceMediaItemId = `localFile:${crypto.randomUUID()}`;
      const mimeType = resolveLocalImageFileMimeTypeFromFile(file);

      return {
        clientItemId: crypto.randomUUID(),
        sourceMediaItemId,
        filename: sanitizeLocalFileNameForDisplay(file.name, "untitled.jpg"),
        file,
        mimeType,
      };
    });
    const batchItems: AssetImportBatchItem[] = localItems.map((item) => ({
      clientItemId: item.clientItemId,
      mediaItemIdPart: formatIdPart(item.sourceMediaItemId),
      filename: item.filename,
      sourceMimeType: item.mimeType ?? "MIME不明",
      sourceCreateTime: null,
      status: "selected",
    }));

    setAssetImportBatch(batchItems);

    const savedAssetsForManifest: Array<{
      clientItemId: string;
      savedAsset: DriveProjectSavedAsset;
      source: {
        source: "localFile";
        filename: string | null;
        mediaType: "PHOTO";
        sourceMimeType: string;
        sourceMediaItemId: string;
        sourceCreateTime: string | null;
      };
    }> = [];
    const batchDiagnostics = [
      `Local image file selection: ${selectedFiles.length}件`,
    ];
    let finalStatus: AssetImportStatus | null = null;
    let finalMessage = "";
    let finalDiagnostics: string[] = [];
    let finalProject: DriveProjectSummary | null = null;
    let finalProjectDetails: ProjectDetails | null = null;
    let finalWorkspaceReadyContext: DriveWorkspaceReadyContext | null = null;

    try {
      for (const [index, localItem] of localItems.entries()) {
        if (requestId !== assetImportRequestIdRef.current) {
          return;
        }

        const validationDiagnostics = validateLocalImageFile(localItem);
        const itemDiagnostics = [
          `filename: ${localItem.filename}`,
          `MIME: ${localItem.mimeType ?? "MIME不明"}`,
          `size: ${localItem.file.size} bytes`,
        ];

        if (validationDiagnostics.length > 0 || !localItem.mimeType) {
          updateAssetImportBatchItem(localItem.clientItemId, {
            status: "failed",
            errorMessage: validationDiagnostics[0],
          });
          batchDiagnostics.push(
            `item ${index + 1}: ${validationDiagnostics[0]}`,
            ...itemDiagnostics,
            ...validationDiagnostics,
          );
          continue;
        }

        try {
          batchDiagnostics.push(
            `item ${index + 1}: local image file selected.`,
            ...itemDiagnostics,
          );

          updateAssetImportBatchItem(localItem.clientItemId, {
            status: "downloaded",
            downloadedContentType: localItem.mimeType ?? undefined,
            downloadedSizeBytes: localItem.file.size,
          });

          setAssetImportStatus("uploadingToDrive");
          setAssetImportMessage(
            `Driveへ写真ファイルを順次保存しています。${index + 1} / ${localItems.length}`,
          );
          updateAssetImportBatchItem(localItem.clientItemId, { status: "uploading" });

          const savedAsset = await saveDriveProjectAsset({
            accessToken,
            workspaceId: readyWorkspace.workspaceId,
            project: readyProject,
            blob: localItem.file,
            mimeType: localItem.mimeType,
            sizeBytes: localItem.file.size,
            source: "localFile",
            signal: abortSignal,
          });

          updateAssetImportBatchItem(localItem.clientItemId, {
            status: "savedToDrive",
            driveFilename: savedAsset.driveFilename,
            assetId: savedAsset.assetId,
            assetIdPart: savedAsset.assetIdPart,
            assetFileId: savedAsset.assetFileId,
            assetFileIdPart: savedAsset.assetFileIdPart,
          });

          savedAssetsForManifest.push({
            clientItemId: localItem.clientItemId,
            savedAsset,
            source: {
              source: "localFile",
              filename: localItem.filename,
              mediaType: "PHOTO",
              sourceMimeType: localItem.mimeType,
              sourceMediaItemId: localItem.sourceMediaItemId,
              sourceCreateTime: null,
            },
          });

          batchDiagnostics.push(...savedAsset.diagnostics);
        } catch (itemError) {
          if (isAbortError(itemError)) {
            throw itemError;
          }

          updateAssetImportBatchItem(localItem.clientItemId, {
            status: "failed",
            errorMessage: getAssetImportItemErrorMessage(itemError),
          });
          batchDiagnostics.push(
            `item ${index + 1}: ${getAssetImportItemErrorMessage(itemError)}`,
            ...itemDiagnostics,
            ...getAssetImportItemFailureDiagnostics(itemError),
          );
        }
      }

      if (savedAssetsForManifest.length === 0) {
        finalStatus = "error";
        finalMessage =
          "選択された写真ファイルをDriveに保存できませんでした。成功したitemはありません。";
        finalDiagnostics = [
          ...batchDiagnostics,
          "Drive保存: 成功0件",
          "プロジェクト反映: 未実行",
        ];
        return;
      }

      setAssetImportStatus("updatingManifest");
      setAssetImportMessage(
        `プロジェクトへ端末写真の成功分 ${savedAssetsForManifest.length} 件をまとめて反映しています。`,
      );

      const manifestAppendResult = await appendDriveProjectAssetsToManifest({
        accessToken,
        workspaceId: readyWorkspace.workspaceId,
        indexJsonFileId: readyWorkspace.indexJsonFileId,
        project: readyProject,
        savedAssets: savedAssetsForManifest.map((item) => ({
          savedAsset: item.savedAsset,
          source: item.source,
        })),
        signal: abortSignal,
      });

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      for (const savedItem of savedAssetsForManifest) {
        const addedSlide = manifestAppendResult.addedSlides.find(
          (slide) => slide.assetId === savedItem.savedAsset.assetId,
        );
        updateAssetImportBatchItem(savedItem.clientItemId, {
          status: "manifestUpdated",
          slideIdPart: formatIdPart(addedSlide?.slideId),
        });
      }

      const nextProjectDetails = toProjectDetails(manifestAppendResult.details);

      finalProject = manifestAppendResult.project;
      finalProjectDetails = nextProjectDetails;
      finalWorkspaceReadyContext = {
        ...readyWorkspace,
        indexJsonText: manifestAppendResult.indexJsonText,
      };
      finalStatus = "completed";
      finalMessage =
        "端末の写真ファイルのDrive保存、プロジェクトへの一括反映、一覧の更新、更新後の再確認が完了しました。";
      finalDiagnostics = [
        ...batchDiagnostics,
        ...manifestAppendResult.diagnostics,
        "Drive保存: 完了",
        "プロジェクト反映: 完了",
        "プロジェクト一覧の更新: 完了",
        "更新後再検証: 完了",
      ];
    } catch (error) {
      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      if (error instanceof DriveProjectAssetSaveError) {
        finalStatus = error.status === "invalidProject" ? "invalid" : "error";
        finalMessage = error.possibleCreatedAsset
          ? "Drive保存結果の確認に失敗しました。Drive上に素材ファイルが作成済みの可能性があります。"
          : "Driveへの素材保存に失敗しました。";
        finalDiagnostics = buildAssetImportDriveSaveFailureDiagnostics(error);
      } else if (error instanceof DriveProjectManifestBatchAppendError) {
        finalStatus = "error";
        finalMessage =
          "Drive保存後のプロジェクトへの一括反映に失敗しました。Drive上に中間状態が残っている可能性があります。";
        finalDiagnostics = buildAssetImportManifestBatchAppendFailureDiagnostics(
          error,
        );
      } else if (isAbortError(error)) {
        finalStatus = "cancelled";
        finalMessage = "素材追加を中止しました。";
        finalDiagnostics = [
          "素材追加処理を中止しました。",
          "Drive保存: 未実行",
          "プロジェクト反映: 未実行",
        ];
      } else {
        finalStatus = "error";
        finalMessage = "local写真ファイル追加処理に失敗しました。";
        finalDiagnostics = [
          "local写真ファイル追加処理中に予期しないエラーが発生しました。",
          "Drive保存やプロジェクトへの反映が途中まで進んだかは、この画面だけでは判断できません。",
          "Drive状態を再確認してください。",
        ];
      }
    } finally {
      if (requestId === assetImportRequestIdRef.current) {
        if (finalStatus) {
          if (
            finalProject &&
            finalProjectDetails &&
            finalWorkspaceReadyContext
          ) {
            const updatedProject = finalProject;
            const updatedProjectDetails = finalProjectDetails;
            setWorkspaceReadyContext(finalWorkspaceReadyContext);
            setSelectedProjectId(updatedProject.projectId);
            setDriveProjectReadyContext(updatedProject);
            setProjectDetails(updatedProjectDetails);
            const nextProjectSummary = toProjectSummary(
              updatedProject,
              updatedProjectDetails,
            );
            setProjectSummary(nextProjectSummary);
            setDriveProjects((currentProjects) => {
              if (
                !currentProjects.some(
                  (currentProject) =>
                    currentProject.projectId === updatedProject.projectId,
                )
              ) {
                return [...currentProjects, nextProjectSummary];
              }

              return currentProjects.map((currentProject) =>
                currentProject.projectId === updatedProject.projectId
                  ? nextProjectSummary
                  : currentProject,
              );
            });
            setProjectStatus("ready");
            setProjectMessage(
              "プロジェクトへの端末写真の反映を更新後に再確認しました。",
            );
          }

          setAssetImportSelection(null);
          setAssetImportStatus(finalStatus);
          setAssetImportMessage(finalMessage);
          setSafeAssetImportDiagnostics(finalDiagnostics);
        }

        assetImportAbortRef.current = null;
        setAssetImportInFlightState(false);
      }
    }
  }

  async function fetchProjectSlidePreviewBlob(
    assetFileId: string,
    expectedMimeType: ProjectSlideSummary["mimeType"],
    signal: AbortSignal,
  ) {
    const accessToken = accessTokenRef.current;

    if (!accessToken) {
      throw new DriveApiError(401);
    }

    if (!isDrivePreviewMimeType(expectedMimeType)) {
      throw new Error("Drive asset preview expected MIME type is not supported.");
    }

    return fetchDriveProjectAssetBlob({
      accessToken,
      assetFileId,
      expectedMimeType,
      signal,
    });
  }

  function cancelAssetImport() {
    if (
      !assetImportInFlightRef.current &&
      !pendingPhotosTokenRequestRef.current &&
      !assetImportAbortRef.current
    ) {
      return;
    }

    const cleanupAccessToken = currentAssetImportAccessTokenRef.current;
    const cleanupSessionId = currentAssetImportSessionIdRef.current;

    assetImportRequestIdRef.current += 1;
    clearAssetImportRuntimeRefs({
      abort: true,
      rejectPendingPhotosTokenRequest: true,
    });
    const wasDriveOrManifestPossiblyStarted =
      assetImportStatus === "uploadingToDrive" ||
      assetImportStatus === "savedToDrive" ||
      assetImportStatus === "updatingManifest" ||
      assetImportStatus === "verifying" ||
      assetImportBatch.some(
        (item) =>
          item.status === "savedToDrive" ||
          item.status === "manifestUpdated",
      ) ||
      assetImportSelection?.driveSaved === true;

    setAssetImportInFlightState(false);
    setAssetImportSelection(null);
    setAssetImportBatch([]);
    setAssetImportStatus("cancelled");
    setAssetImportMessage("素材追加を中止しました。");
    setSafeAssetImportDiagnostics(
      wasDriveOrManifestPossiblyStarted
        ? [
            "ユーザー操作により素材追加を中止しました。",
            "Drive上に素材ファイルが作成済みの可能性があります。",
            "プロジェクト設定またはプロジェクト一覧が更新済みの可能性があります。",
            "自動削除・自動修復は行いません。",
            "Drive状態を再確認してください。",
          ]
        : [
            "ユーザー操作により素材追加を中止しました。",
            "Drive保存: 未実行",
            "プロジェクト反映: 未実行",
          ],
    );

    if (cleanupAccessToken && cleanupSessionId) {
      void cleanupPhotosPickerSessionOnce({
        accessToken: cleanupAccessToken,
        sessionId: cleanupSessionId,
      });
    }
  }

  async function startOfflineSync() {
    const runtime = offlineSyncRuntimeRef.current;
    const blockedReason = getOfflineSyncBlockedReason();

    if (!runtime) {
      setOfflineSyncStatus("failed");
      setOfflineSyncMessage("ローカルへの保存処理を準備できませんでした。");
      setSafeOfflineSyncDiagnostics([
        "ローカルへの保存処理を準備できていません。",
      ]);
      return;
    }

    if (blockedReason) {
      setOfflineSyncStatus("blocked");
      setOfflineSyncMessage("ローカルへの保存を開始できませんでした。");
      setSafeOfflineSyncDiagnostics([blockedReason]);
      return;
    }

    const accessToken = accessTokenRef.current;
    const readyContext = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    if (!accessToken || !readyContext || !readyProject) {
      setOfflineSyncStatus("blocked");
      setOfflineSyncMessage("ローカルへの保存に必要な確認済み情報が不足しています。");
      setSafeOfflineSyncDiagnostics([
        "Google接続、Driveの保存領域、選択中プロジェクトのいずれかを確認できませんでした。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ]);
      return;
    }

    offlineSyncRequestIdRef.current += 1;
    const requestId = offlineSyncRequestIdRef.current;

    setOfflineSyncInFlightState(true);
    setOfflineSyncStatus("syncing");
    setOfflineSyncMessage("同期前確認中");
    setOfflineSyncProgress(null);
    setSafeOfflineSyncDiagnostics([]);
    setOfflineSyncLastResult(null);

    try {
      const result = await runtime.run({
        accessToken,
        readyContext,
        project: readyProject,
        onProgress: (progress) => {
          if (
            requestId !== offlineSyncRequestIdRef.current ||
            !offlineSyncInFlightRef.current
          ) {
            return;
          }
          setOfflineSyncProgress(progress);
          setOfflineSyncMessage(progress.message);
        },
      });

      if (requestId !== offlineSyncRequestIdRef.current) {
        return;
      }

      setOfflineSyncLastResult(result);
      setOfflineSyncStatus(getOfflineSyncStatusFromResult(result));
      setOfflineSyncMessage(buildOfflineSyncResultMessage(result));
      if (!result.ok) {
        setOfflineSyncProgress(null);
      }
      setSafeOfflineSyncDiagnostics(buildOfflineSyncResultDiagnostics(result));
    } finally {
      if (requestId === offlineSyncRequestIdRef.current) {
        setOfflineSyncInFlightState(false);
      }
    }
  }

  function cancelOfflineSync() {
    const runtime = offlineSyncRuntimeRef.current;

    if (
      !offlineSyncInFlightRef.current &&
      !isOfflineSyncInFlight &&
      !runtime?.isInFlight()
    ) {
      return;
    }

    offlineSyncRequestIdRef.current += 1;
    runtime?.cancelCurrentRun();

    setOfflineSyncInFlightState(false);
    setOfflineSyncStatus("cancelled");
    setOfflineSyncMessage(OFFLINE_SYNC_CANCELLED_MESSAGE);
    setOfflineSyncProgress(null);
    setSafeOfflineSyncDiagnostics([
      "ユーザー操作によりローカルへの保存を中止しました。",
      "Driveからの取得、一時保存、端末保存データの更新のどこまで進んだかは、この状態だけでは判断しません。",
      "必要に応じて Drive状態とプロジェクト状態を再確認してください。",
    ]);
    setOfflineSyncLastResult(null);
  }

  async function checkDriveWorkspace() {
    if (driveOperationInFlightRef.current) {
      return;
    }

    const accessToken = accessTokenRef.current;

    if (!accessToken) {
      setDriveStatus("authRequired");
      setDriveMessage(
        "Google接続が必要です。もう一度Google接続を行ってからDrive状態を確認してください。",
      );
      setDriveCandidates([]);
      setDriveDiagnostics([]);
      setWorkspaceReadyContext(null);
      resetProjectState();
      return;
    }

    setDriveOperationInFlight(true);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    setDriveStatus("checking");
    setDriveMessage("Driveワークスペース候補を検索しています。");
    setDriveCandidates([]);
    setDriveDiagnostics([]);
    setWorkspaceReadyContext(null);
    resetProjectState();

    try {
      const result = await runDriveOperationStep(requestId, (signal) =>
        runDriveWorkspaceCheck(accessToken, signal),
      );

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      applyDriveCheckResult(result);
    } catch {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setDriveStatus("operationFailed");
      setDriveMessage(
        "Drive状態確認に失敗しました。通信状態を確認して、もう一度Drive状態を確認してください。",
      );
      setDriveCandidates([]);
      setDriveDiagnostics([]);
      setWorkspaceReadyContext(null);
      resetProjectState();
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
      }
    }
  }

  function queueDriveWorkspaceAutoCheck() {
    if (!accessTokenRef.current) {
      return;
    }

    if (driveOperationInFlightRef.current) {
      return;
    }

    const generation = googleConnectionGenerationRef.current;
    if (driveWorkspaceAutoCheckGenerationRef.current === generation) {
      return;
    }

    driveWorkspaceAutoCheckGenerationRef.current = generation;
    void checkDriveWorkspace();
  }
  queueDriveWorkspaceAutoCheckRef.current = queueDriveWorkspaceAutoCheck;

  async function createWorkspace() {
    if (driveOperationInFlightRef.current) {
      return;
    }

    const accessToken = accessTokenRef.current;

    if (!accessToken) {
      setDriveStatus("authRequired");
      setDriveMessage(
        "Google接続が必要です。もう一度Google接続を行ってからDriveワークスペースを作成してください。",
      );
      setDriveCandidates([]);
      setDriveDiagnostics([]);
      setWorkspaceReadyContext(null);
      resetProjectState();
      return;
    }

    setDriveOperationInFlight(true);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    setDriveStatus("creating");
    setDriveMessage("作成前にDrive状態を再確認しています。");
    setDriveCandidates([]);
    setDriveDiagnostics([]);
    setWorkspaceReadyContext(null);
    resetProjectState();

    try {
      const beforeCheck = await runDriveOperationStep(requestId, (signal) =>
        runDriveWorkspaceCheck(accessToken, signal),
      );

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (beforeCheck.status !== "notCreated") {
        applyDriveCheckResult(beforeCheck);
        return;
      }

      let createStepIndex = 0;

      await createDriveWorkspace({
        accessToken,
        runStep: (operation) => {
          setDriveStatus("creating");
          setDriveMessage(
            driveCreateStepMessages[createStepIndex] ??
              "Driveワークスペースを作成しています。",
          );
          createStepIndex += 1;

          return runDriveOperationStep(requestId, operation);
        },
      });

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setDriveStatus("creating");
      setDriveMessage("作成後にDrive状態を再確認しています。");

      const afterCheck = await runDriveOperationStep(requestId, (signal) =>
        runDriveWorkspaceCheck(accessToken, signal),
      );

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (afterCheck.status === "ready") {
        applyDriveCheckResult({
          ...afterCheck,
          message: "Driveワークスペースを確認できました。",
        });
        return;
      }

      applyDriveCheckResult({
        ...afterCheck,
        diagnostics: buildPostCreateNotReadyDiagnostics(afterCheck),
      });
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setDriveCandidates([]);
      setWorkspaceReadyContext(null);
      resetProjectState();

      if (error instanceof DriveWorkspaceCreateError) {
        if (error.status === "authRequired") {
          resetGoogleAfterDriveAuthFailure();
        }

        setDriveStatus(error.status);
        setDriveMessage(
          error.status === "authRequired"
            ? "Driveワークスペース作成中にGoogle再接続が必要になりました。"
            : "Driveワークスペース作成に失敗しました。",
        );
        setDriveDiagnostics(
          buildWorkspaceCreateFailureDiagnostics(error.possibleCreatedRoles),
        );
        return;
      }

      setDriveStatus("operationFailed");
      setDriveMessage("Driveワークスペース作成に失敗しました。");
      setDriveDiagnostics(buildWorkspaceCreateFailureDiagnostics([]));
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
      }
    }
  }

  async function checkProject() {
    if (driveOperationInFlightRef.current) {
      return;
    }

    const accessToken = accessTokenRef.current;

    if (!accessToken) {
      setProjectStatus("error");
      setProjectMessage(
        "Google接続が必要です。もう一度Google接続を行ってからプロジェクト状態を確認してください。",
      );
      setDriveProjects([]);
      setSelectedProjectId(null);
      clearProjectReadyDetails();
      setProjectDiagnostics([]);
      return;
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      setProjectStatus("idle");
      setProjectMessage(initialProjectMessage);
      setDriveProjects([]);
      setSelectedProjectId(null);
      clearProjectReadyDetails();
      setProjectDiagnostics([
        "Driveの保存領域の確認済み情報を取得できませんでした。",
        "先にDrive状態を再確認し、保存領域を利用できることを確認してください。",
      ]);
      return;
    }

    setDriveOperationInFlight(true);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;
    const readyContext = workspaceReadyContext;

    setProjectStatus("checking");
    setProjectMessage("Drive上のプロジェクト状態を確認しています。");
    clearProjectReadyDetails();
    setProjectDiagnostics([]);

    try {
      const { indexJsonText, result } = await runDriveOperationStep(
        requestId,
        async (signal) => {
          const nextIndexJsonText = await readDriveTextFile(
            accessToken,
            readyContext.indexJsonFileId,
            signal,
          );

          return {
            indexJsonText: nextIndexJsonText,
            result: validateIndexJsonProjects(nextIndexJsonText),
          };
        },
      );

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setWorkspaceReadyContext({
        ...readyContext,
        indexJsonText,
      });

      if (result.status === "notCreated") {
        setProjectStatus("notCreated");
        setProjectMessage("プロジェクトはまだ作成されていません。");
        setDriveProjects([]);
        setSelectedProjectId(null);
        clearProjectReadyDetails();
        setProjectDiagnostics(result.diagnostics);
        return;
      }

      if (result.status === "invalid") {
        setProjectStatus("invalid");
        setProjectMessage(
          "Drive上のプロジェクト情報に問題があります。この画面では自動修復しません。",
        );
        setDriveProjects([]);
        setSelectedProjectId(null);
        clearProjectReadyDetails();
        setProjectDiagnostics(result.diagnostics);
        return;
      }

      applyDriveProjects(result.projects);
      const preferredProjectId =
        selectedProjectId ?? driveProjectReadyContext?.projectId ?? null;
      const selectedProject =
        result.projects.find((project) => project.projectId === preferredProjectId) ??
        result.projects[0];

      const detailResult = await runDriveOperationStep(requestId, (signal) =>
        validateDriveProjectDetails({
          accessToken,
          expectedWorkspaceId: readyContext.workspaceId,
          expectedProjectsRootFolderId: readyContext.projectsRootFolderId,
          project: selectedProject,
          signal,
        }),
      );

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (detailResult.status === "invalid") {
        setProjectStatus("invalid");
        setProjectMessage(
          "Drive上のプロジェクト詳細に問題があります。この画面では自動修復しません。",
        );
        setSelectedProjectId(selectedProject.projectId);
        clearProjectReadyDetails();
        setProjectDiagnostics([
          ...result.diagnostics,
          ...detailResult.diagnostics,
        ]);
        return;
      }

      const nextProjectDetails = toProjectDetails(detailResult.details);

      setProjectStatus("ready");
      setProjectMessage(
        `Drive上のプロジェクト${result.projects.length}件を確認し、選択中プロジェクトの詳細を読み込みました。`,
      );
      applyProjectReadyState(selectedProject, nextProjectDetails);
      setProjectDiagnostics([...result.diagnostics, ...detailResult.diagnostics]);

      const remainingProjects = result.projects.filter(
        (project) => project.projectId !== selectedProject.projectId,
      );
      let hydratedCounts: Awaited<ReturnType<typeof hydrateDriveProjectCounts>> = [];
      try {
        hydratedCounts = await runDriveOperationStep(requestId, (signal) =>
          hydrateDriveProjectCounts({
            accessToken,
            expectedWorkspaceId: readyContext.workspaceId,
            expectedProjectsRootFolderId: readyContext.projectsRootFolderId,
            projects: remainingProjects,
            signal,
            concurrency: 2,
          }),
        );
      } catch {
        // Summary hydration is optional and read-only. Failed counts remain unknown.
      }

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      const countsByProjectId = new Map(
        hydratedCounts.map((counts) => [counts.projectId, counts]),
      );
      setDriveProjects((currentProjects) =>
        currentProjects.map((project) => {
          const counts = countsByProjectId.get(project.projectId);
          return counts
            ? {
                ...project,
                slideCount: counts.slideCount,
                assetCount: counts.assetCount,
                photoCount: counts.photoCount,
                videoCount: counts.videoCount,
                otherCount: counts.otherCount,
              }
            : project;
        }),
      );
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setProjectMessage(
        "プロジェクト状態確認に失敗しました。通信状態を確認して再確認してください。",
      );
      clearProjectReadyDetails();
      setProjectDiagnostics(
        error instanceof DriveApiError
          ? [
              "Drive上のプロジェクト詳細確認に失敗しました。",
              "Google Driveから操作を完了できませんでした。",
            ]
          : ["Drive上のプロジェクト詳細確認に失敗しました。"],
      );
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
      }
    }
  }

  async function selectProject(projectId: string) {
    if (driveOperationInFlightRef.current) {
      return;
    }

    discardPendingProjectDeleteConfirmation();

    const accessToken = accessTokenRef.current;

    if (!accessToken) {
      setProjectStatus("error");
      setProjectMessage(
        "Google接続が必要です。もう一度Google接続を行ってからプロジェクトを選択してください。",
      );
      clearProjectReadyDetails();
      setProjectDiagnostics([]);
      return;
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      setProjectStatus("idle");
      setProjectMessage(initialProjectMessage);
      clearProjectReadyDetails();
      setProjectDiagnostics([
        "Driveの保存領域の確認済み情報を取得できませんでした。",
        "先にDrive状態を再確認し、保存領域を利用できることを確認してください。",
      ]);
      return;
    }

    setDriveOperationInFlight(true);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;
    const readyContext = workspaceReadyContext;

    setProjectStatus("checking");
    setProjectMessage("選択したプロジェクトの詳細を確認しています。");
    setSelectedProjectId(projectId);
    clearProjectReadyDetails();
    setProjectDiagnostics([]);

    try {
      const { indexJsonText, result } = await runDriveOperationStep(
        requestId,
        async (signal) => {
          const nextIndexJsonText = await readDriveTextFile(
            accessToken,
            readyContext.indexJsonFileId,
            signal,
          );

          return {
            indexJsonText: nextIndexJsonText,
            result: validateIndexJsonProjects(nextIndexJsonText),
          };
        },
      );

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setWorkspaceReadyContext({
        ...readyContext,
        indexJsonText,
      });

      if (result.status === "notCreated") {
        setProjectStatus("notCreated");
        setProjectMessage("プロジェクトはまだ作成されていません。");
        setDriveProjects([]);
        setSelectedProjectId(null);
        clearProjectReadyDetails();
        setProjectDiagnostics(result.diagnostics);
        return;
      }

      if (result.status === "invalid") {
        setProjectStatus("invalid");
        setProjectMessage(
          "Drive上のプロジェクト情報に問題があります。この画面では自動修復しません。",
        );
        setDriveProjects([]);
        clearProjectReadyDetails();
        setProjectDiagnostics(result.diagnostics);
        return;
      }

      applyDriveProjects(result.projects);
      const selectedProject = result.projects.find(
        (project) => project.projectId === projectId,
      );

      if (!selectedProject) {
        setProjectStatus("invalid");
        setProjectMessage("選択したプロジェクトをDriveの一覧で確認できませんでした。");
        setSelectedProjectId(null);
        clearProjectReadyDetails();
        setProjectDiagnostics([
          ...result.diagnostics,
          "選択したプロジェクトはDriveのプロジェクト一覧に登録されていません。",
        ]);
        return;
      }

      const detailResult = await runDriveOperationStep(requestId, (signal) =>
        validateDriveProjectDetails({
          accessToken,
          expectedWorkspaceId: readyContext.workspaceId,
          expectedProjectsRootFolderId: readyContext.projectsRootFolderId,
          project: selectedProject,
          signal,
        }),
      );

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (detailResult.status === "invalid") {
        setProjectStatus("invalid");
        setProjectMessage(
          "選択したプロジェクトのDrive上の詳細に問題があります。この画面では自動修復しません。",
        );
        setSelectedProjectId(projectId);
        clearProjectReadyDetails();
        setProjectDiagnostics([
          ...result.diagnostics,
          ...detailResult.diagnostics,
        ]);
        return;
      }

      setProjectStatus("ready");
      setProjectMessage("選択したプロジェクトの設定と素材を読み込みました。");
      applyProjectReadyState(selectedProject, toProjectDetails(detailResult.details));
      setProjectDiagnostics([...result.diagnostics, ...detailResult.diagnostics]);
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setProjectMessage(
        "プロジェクト選択中にDrive確認へ失敗しました。通信状態を確認して再確認してください。",
      );
      clearProjectReadyDetails();
      setProjectDiagnostics(
        error instanceof DriveApiError
          ? [
              "Drive上のプロジェクト詳細確認に失敗しました。",
              "Google Driveから操作を完了できませんでした。",
            ]
          : ["Drive上のプロジェクト詳細確認に失敗しました。"],
      );
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
      }
    }
  }

  async function updateSelectedProjectTitle(titleInput: string) {
    if (driveOperationInFlightRef.current) {
      return;
    }

    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;
    const title = normalizeProjectTitleInput(titleInput);
    const titleDiagnostics = validateProjectTitleInput(title);

    if (titleDiagnostics.length > 0) {
      setProjectDiagnostics(titleDiagnostics);
      return;
    }

    if (!accessToken) {
      setProjectStatus("error");
      setProjectMessage(
        "Google接続が必要です。もう一度Google接続を行ってからtitleを変更してください。",
      );
      setProjectDiagnostics([]);
      return;
    }

    if (
      driveStatus !== "ready" ||
      projectStatus !== "ready" ||
      !readyWorkspace ||
      !readyProject
    ) {
      setProjectDiagnostics([
        "選択中プロジェクトの確認が完了していないため、名前変更を開始しませんでした。",
        "先にDriveプロジェクト状態を確認し、対象プロジェクトを選択してください。",
      ]);
      return;
    }

    if (title === readyProject.title) {
      setProjectDiagnostics(["プロジェクト名は変更されていません。"]);
      return;
    }

    setDriveOperationInFlight(true);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    setProjectStatus("checking");
    setProjectMessage("選択中プロジェクトの名前を更新しています。");
    setProjectDiagnostics([]);

    try {
      const result = await updateDriveProjectTitle({
        accessToken,
        workspaceId: readyWorkspace.workspaceId,
        indexJsonFileId: readyWorkspace.indexJsonFileId,
        projectsRootFolderId: readyWorkspace.projectsRootFolderId,
        project: readyProject,
        title,
        runStep: (operation) => runDriveOperationStep(requestId, operation),
      });

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setWorkspaceReadyContext({
        ...readyWorkspace,
        indexJsonText: result.indexJsonText,
      });
      setProjectStatus("ready");
      setProjectMessage(
        "選択中プロジェクトの名前をプロジェクト設定と一覧へ反映し、再確認しました。",
      );
      applyProjectReadyState(result.project, toProjectDetails(result.details));
      setProjectDiagnostics(result.diagnostics);
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (error instanceof DriveProjectTitleUpdateError) {
        if (error.status === "authRequired") {
          resetGoogleAfterDriveAuthFailure();
          setDriveStatus("authRequired");
          setDriveMessage(
            "Google再接続が必要です。再接続後にDrive状態を再確認してください。",
          );
        }

        if (error.status === "duplicateTitle") {
          setProjectStatus("ready");
          setProjectMessage(DUPLICATE_PROJECT_TITLE_MESSAGE);
          setProjectDiagnostics(error.diagnostics);
          return;
        }

        setProjectStatus(error.status === "invalidProject" ? "invalid" : "error");
        setProjectMessage(
          error.status === "invalidProject"
            ? "名前変更前のDriveプロジェクト情報に問題があります。自動修復は行いません。"
            : "プロジェクト名の変更に失敗しました。",
        );
        setProjectDiagnostics(error.diagnostics);
        return;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setProjectMessage("プロジェクト名の変更に失敗しました。");
      setProjectDiagnostics([
        "プロジェクト名の変更中に予期しないエラーが発生しました。",
        "プロジェクト設定と一覧のどこまで更新されたかは、この画面だけでは判断できません。",
        "Drive状態を再確認してください。",
      ]);
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
      }
    }
  }

  async function updateProjectSlideCaption(slideId: string, captionInput: string) {
    if (driveOperationInFlightRef.current) {
      return;
    }

    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    if (!accessToken) {
      setCaptionUpdateMessage(
        "Google接続が必要です。もう一度Google接続を行ってからテロップを保存してください。",
      );
      setCaptionUpdateDiagnostics([]);
      return;
    }

    if (
      driveStatus !== "ready" ||
      projectStatus !== "ready" ||
      !readyWorkspace ||
      !readyProject
    ) {
      setCaptionUpdateMessage(
        "選択中プロジェクトの確認が完了していないため、テロップ保存を開始しませんでした。",
      );
      setCaptionUpdateDiagnostics([
        "先にDriveプロジェクト状態を確認し、対象プロジェクトを選択してください。",
      ]);
      return;
    }

    setDriveOperationInFlight(true);
    setCaptionUpdateSlideId(slideId);
    setCaptionUpdateMessage("テロップを保存しています。");
    setCaptionUpdateDiagnostics([]);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    try {
      const result = await updateDriveProjectSlideCaption({
        accessToken,
        workspaceId: readyWorkspace.workspaceId,
        indexJsonFileId: readyWorkspace.indexJsonFileId,
        project: readyProject,
        slideId,
        caption: captionInput,
        runStep: (operation) => runDriveOperationStep(requestId, operation),
      });

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setWorkspaceReadyContext({
        ...readyWorkspace,
        indexJsonText: result.indexJsonText,
      });
      setProjectStatus("ready");
      setProjectMessage(
        "選択中プロジェクトのテロップをプロジェクト設定と一覧へ反映し、再確認しました。",
      );
      applyProjectReadyState(result.project, toProjectDetails(result.details));
      setCaptionUpdateMessage(
        "テロップを保存しました。再生へ反映するには、このアルバムをローカルに保存してください。",
      );
      setCaptionUpdateDiagnostics(result.diagnostics);
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (error instanceof DriveProjectSlideCaptionUpdateError) {
        if (error.status === "authRequired") {
          resetGoogleAfterDriveAuthFailure();
          setDriveStatus("authRequired");
          setDriveMessage(
            "Google再接続が必要です。再接続後にDrive状態を再確認してください。",
          );
        }

        setProjectStatus(error.status === "invalidProject" ? "invalid" : "error");
        setCaptionUpdateMessage(
          error.status === "invalidProject"
            ? "テロップ保存前のDriveプロジェクト情報に問題があります。"
            : "テロップ保存に失敗しました。",
        );
        setCaptionUpdateDiagnostics(error.diagnostics);
        return;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setCaptionUpdateMessage("テロップ保存に失敗しました。");
      setCaptionUpdateDiagnostics([
        "テロップ保存中に予期しないエラーが発生しました。",
        "プロジェクト設定と一覧のどこまで更新されたかは、この画面だけでは判断できません。",
        "Drive状態を再確認してください。",
      ]);
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
        setCaptionUpdateSlideId(null);
      }
    }
  }

  async function updateProjectSlideDuration(
    slideId: string,
    durationSeconds: number,
  ) {
    if (driveOperationInFlightRef.current) {
      return;
    }

    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    if (!accessToken) {
      setDurationUpdateMessage(
        "Google接続が必要です。もう一度Google接続を行ってから表示時間を保存してください。",
      );
      setDurationUpdateDiagnostics([]);
      return;
    }

    if (
      driveStatus !== "ready" ||
      projectStatus !== "ready" ||
      !readyWorkspace ||
      !readyProject
    ) {
      setDurationUpdateMessage(
        "選択中プロジェクトの確認が完了していないため、表示時間保存を開始しませんでした。",
      );
      setDurationUpdateDiagnostics([
        "先にDriveプロジェクト状態を確認し、対象プロジェクトを選択してください。",
      ]);
      return;
    }

    setDriveOperationInFlight(true);
    setDurationUpdateSlideId(slideId);
    setDurationUpdateMessage("表示時間を保存しています。");
    setDurationUpdateDiagnostics([]);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    try {
      const result = await updateDriveProjectSlideDuration({
        accessToken,
        workspaceId: readyWorkspace.workspaceId,
        indexJsonFileId: readyWorkspace.indexJsonFileId,
        project: readyProject,
        slideId,
        durationSeconds,
        runStep: (operation) => runDriveOperationStep(requestId, operation),
      });

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setWorkspaceReadyContext({
        ...readyWorkspace,
        indexJsonText: result.indexJsonText,
      });
      setProjectStatus("ready");
      setProjectMessage(
        "選択中プロジェクトの表示時間をプロジェクト設定と一覧へ反映し、再確認しました。",
      );
      applyProjectReadyState(result.project, toProjectDetails(result.details));
      setDurationUpdateMessage(
        "表示時間を保存しました。再生へ反映するには、このアルバムをローカルに保存してください。",
      );
      setDurationUpdateDiagnostics(result.diagnostics);
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (error instanceof DriveProjectSlideDurationUpdateError) {
        if (error.status === "authRequired") {
          resetGoogleAfterDriveAuthFailure();
          setDriveStatus("authRequired");
          setDriveMessage(
            "Google再接続が必要です。再接続後にDrive状態を再確認してください。",
          );
        }

        setProjectStatus(error.status === "invalidProject" ? "invalid" : "error");
        setDurationUpdateMessage(
          error.status === "invalidProject"
            ? "表示時間保存前のDriveプロジェクト情報に問題があります。"
            : "表示時間保存に失敗しました。",
        );
        setDurationUpdateDiagnostics(error.diagnostics);
        return;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setDurationUpdateMessage("表示時間保存に失敗しました。");
      setDurationUpdateDiagnostics([
        "表示時間保存中に予期しないエラーが発生しました。",
        "プロジェクト設定と一覧のどこまで更新されたかは、この画面だけでは判断できません。",
        "Drive状態を再確認してください。",
      ]);
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
        setDurationUpdateSlideId(null);
      }
    }
  }

  async function moveProjectSlide(slideId: string, direction: "up" | "down") {
    const blockedReason = getSlideReorderBlockedReason();
    const readyProjectDetails = projectDetails;

    setSlideReorderDiagnostics([]);
    setSlideEditDiagnostics([]);

    if (blockedReason) {
      setSlideReorderStatus("blocked");
      setSlideReorderMessage("スライド順を変更できませんでした。");
      setSlideReorderDiagnostics([blockedReason]);
      setSlideEditStatus("blocked");
      setSlideEditMessage("スライド順を変更できませんでした。");
      setSlideEditDiagnostics([blockedReason]);
      return false;
    }

    const currentSlides = readyProjectDetails?.slides ?? [];
    const fromIndex = currentSlides.findIndex((slide) => slide.slideId === slideId);
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;

    if (fromIndex === -1) {
      setSlideReorderStatus("invalid");
      setSlideReorderMessage("スライド順を変更できませんでした。");
      setSlideReorderDiagnostics([
        "指定されたスライドを選択中プロジェクトで確認できませんでした。",
      ]);
      setSlideEditStatus("invalid");
      setSlideEditMessage("スライド順を変更できませんでした。");
      setSlideEditDiagnostics([
        "指定されたスライドを選択中プロジェクトで確認できませんでした。",
      ]);
      return false;
    }

    if (toIndex < 0 || toIndex >= currentSlides.length) {
      setSlideReorderStatus("invalid");
      setSlideReorderMessage("スライド順は変更されていません。");
      setSlideReorderDiagnostics([
        direction === "up"
          ? "先頭のスライドはこれ以上上へ移動できません。"
          : "最後のスライドはこれ以上下へ移動できません。",
      ]);
      setSlideEditStatus("invalid");
      setSlideEditMessage("スライド順は変更されていません。");
      setSlideEditDiagnostics([
        direction === "up"
          ? "先頭のスライドはこれ以上上へ移動できません。"
          : "最後のスライドはこれ以上下へ移動できません。",
      ]);
      return false;
    }

    const orderedSlideIds = currentSlides.map((slide) => slide.slideId);
    [orderedSlideIds[fromIndex], orderedSlideIds[toIndex]] = [
      orderedSlideIds[toIndex],
      orderedSlideIds[fromIndex],
    ];

    return saveProjectSlideOrder(orderedSlideIds);
  }

  async function reorderProjectSlidesByDrag(orderedSlideIds: string[]) {
    return saveProjectSlideOrder(orderedSlideIds);
  }

  async function saveProjectSlideOrder(orderedSlideIds: string[]) {
    const blockedReason = getSlideReorderBlockedReason();
    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;
    const currentSlideIds = projectDetails?.slides.map((slide) => slide.slideId) ?? [];

    setSlideReorderDiagnostics([]);
    setSlideEditDiagnostics([]);

    if (blockedReason) {
      setSlideReorderStatus("blocked");
      setSlideReorderMessage("スライド順を変更できませんでした。");
      setSlideReorderDiagnostics([blockedReason]);
      setSlideEditStatus("blocked");
      setSlideEditMessage("スライド順を変更できませんでした。");
      setSlideEditDiagnostics([blockedReason]);
      return false;
    }

    if (!accessToken || !readyWorkspace || !readyProject || !projectDetails) {
      const diagnostics = [
        "Google接続、Driveの保存領域、選択中プロジェクトの確認済み情報が不足しています。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ];
      setSlideReorderStatus("blocked");
      setSlideReorderMessage("スライド順変更に必要な確認済み情報が不足しています。");
      setSlideReorderDiagnostics(diagnostics);
      setSlideEditStatus("blocked");
      setSlideEditMessage("スライド順変更に必要な確認済み情報が不足しています。");
      setSlideEditDiagnostics(diagnostics);
      return false;
    }

    if (areStringArraysEqual(currentSlideIds, orderedSlideIds)) {
      return true;
    }

    setDriveOperationInFlight(true);
    setSlideReorderInFlightState(true);
    setSlideReorderStatus("saving");
    setSlideReorderMessage("スライドの順番を保存しています。");
    setSlideEditStatus("reordering");
    setSlideEditMessage("スライドの順番を保存しています。");
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    try {
      const result = await reorderDriveProjectSlides({
        accessToken,
        workspaceId: readyWorkspace.workspaceId,
        indexJsonFileId: readyWorkspace.indexJsonFileId,
        project: readyProject,
        orderedSlideIds,
        runStep: (operation) => runDriveOperationStep(requestId, operation),
      });

      if (requestId !== driveOperationRequestIdRef.current) {
        return false;
      }

      applySlideManifestMutationSuccess({
        readyWorkspace,
        indexJsonText: result.indexJsonText,
        project: result.project,
        details: result.details,
        projectMessage:
          "選択中プロジェクトのスライド順をプロジェクト設定と一覧へ反映し、再確認しました。",
      });
      setSlideReorderStatus("completed");
      setSlideReorderMessage(
        "スライドの順番を保存しました。再生へ反映するには、このアルバムをローカルに保存してください。",
      );
      setSlideReorderDiagnostics([
        ...result.diagnostics,
        "再生への反映には、このプロジェクトの端末同期が必要です。",
      ]);
      setSlideEditStatus("completed");
      setSlideEditMessage(
        "スライドの順番を保存しました。再生へ反映するには、このアルバムをローカルに保存してください。",
      );
      setSlideEditDiagnostics([
        ...result.diagnostics,
        "再生への反映には、このプロジェクトの端末同期が必要です。",
      ]);
      return true;
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return false;
      }

      if (error instanceof DriveProjectSlideReorderError) {
        if (error.status === "authRequired") {
          resetGoogleAfterDriveAuthFailure();
          setDriveStatus("authRequired");
          setDriveMessage(
            "Google再接続が必要です。再接続後にDrive状態を再確認してください。",
          );
        }

        setProjectStatus(error.status === "invalidProject" ? "invalid" : "error");
        setSlideReorderStatus(
          error.status === "invalidProject" ? "invalid" : "error",
        );
        setSlideReorderMessage(
          error.status === "invalidProject"
            ? "スライド順変更前のDriveプロジェクト情報に問題があります。"
            : "スライド順変更に失敗しました。",
        );
        setSlideReorderDiagnostics(error.diagnostics);
        setSlideEditStatus(
          error.status === "invalidProject" ? "invalid" : "error",
        );
        setSlideEditMessage(
          error.status === "invalidProject"
            ? "スライド順変更前のDriveプロジェクト情報に問題があります。"
            : "スライド順変更に失敗しました。",
        );
        setSlideEditDiagnostics(error.diagnostics);
        return false;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setSlideReorderStatus("error");
      setSlideReorderMessage("スライド順変更に失敗しました。");
      setSlideReorderDiagnostics([
        "スライド順変更中に予期しないエラーが発生しました。",
        "プロジェクト設定と一覧のどこまで更新されたかは、この画面だけでは判断できません。",
        "Drive状態を再確認してください。",
      ]);
      setSlideEditStatus("error");
      setSlideEditMessage("スライド順変更に失敗しました。");
      setSlideEditDiagnostics([
        "スライド順変更中に予期しないエラーが発生しました。",
        "プロジェクト設定と一覧のどこまで更新されたかは、この画面だけでは判断できません。",
        "Drive状態を再確認してください。",
      ]);
      return false;
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
        setSlideReorderInFlightState(false);
      }
    }
  }

  async function deleteProjectSlides(slideIds: string[]) {
    const blockedReason = getSlideEditBlockedReason({ allowSingleSlide: true });
    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    setSlideEditDiagnostics([]);

    if (blockedReason) {
      setSlideEditStatus("blocked");
      setSlideEditMessage("選択したスライドを削除できませんでした。");
      setSlideEditDiagnostics([blockedReason]);
      return false;
    }

    if (!accessToken || !readyWorkspace || !readyProject) {
      setSlideEditStatus("blocked");
      setSlideEditMessage("スライド削除に必要な確認済み情報が不足しています。");
      setSlideEditDiagnostics([
        "Google接続、Driveの保存領域、選択中プロジェクトの確認済み情報が不足しています。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ]);
      return false;
    }

    setDriveOperationInFlight(true);
    setSlideDeleteInFlightState(true);
    setSlideEditStatus("deleting");
    setSlideEditMessage("選択したスライドを削除しています。");
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    try {
      const result = await deleteDriveProjectSlides({
        accessToken,
        workspaceId: readyWorkspace.workspaceId,
        indexJsonFileId: readyWorkspace.indexJsonFileId,
        project: readyProject,
        slideIds,
        runStep: (operation) => runDriveOperationStep(requestId, operation),
      });

      if (requestId !== driveOperationRequestIdRef.current) {
        return false;
      }

      applySlideManifestMutationSuccess({
        readyWorkspace,
        indexJsonText: result.indexJsonText,
        project: result.project,
        details: result.details,
        projectMessage:
          "選択中プロジェクトのスライド削除をプロジェクト設定と一覧へ反映し、再確認しました。",
      });
      setSlideEditStatus("completed");
      setSlideEditMessage(
        "選択したスライドを削除しました。再生へ反映するには、このアルバムをローカルに保存してください。",
      );
      setSlideEditDiagnostics([
        ...result.diagnostics,
        "Drive上の素材ファイルは削除していません。",
        "再生への反映には、このプロジェクトの端末同期が必要です。",
      ]);
      return true;
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return false;
      }

      if (error instanceof DriveProjectSlideDeleteError) {
        handleSlideEditDriveAuthError(error.status);
        setProjectStatus(error.status === "invalidProject" ? "invalid" : "error");
        setSlideEditStatus(
          error.status === "invalidProject" ? "invalid" : "error",
        );
        setSlideEditMessage(
          error.status === "invalidProject"
            ? "スライド削除前のDriveプロジェクト情報に問題があります。"
            : "スライド削除に失敗しました。",
        );
        setSlideEditDiagnostics(error.diagnostics);
        return false;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setSlideEditStatus("error");
      setSlideEditMessage("スライド削除に失敗しました。");
      setSlideEditDiagnostics([
        "スライド削除中に予期しないエラーが発生しました。",
        "プロジェクト設定と一覧のどこまで更新されたかは、この画面だけでは判断できません。",
        "Drive上の素材ファイルは削除していません。",
        "Drive状態を再確認してください。",
      ]);
      return false;
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
        setSlideDeleteInFlightState(false);
      }
    }
  }

  async function duplicateProjectSlide(slideId: string) {
    const blockedReason = getSlideEditBlockedReason({ allowSingleSlide: true });
    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    setSlideEditDiagnostics([]);

    if (blockedReason) {
      setSlideEditStatus("blocked");
      setSlideEditMessage("スライドを複製できませんでした。");
      setSlideEditDiagnostics([blockedReason]);
      return false;
    }

    if ((projectDetails?.slideCount ?? 0) >= ASSET_IMPORT_MAX_SLIDE_COUNT) {
      setSlideEditStatus("invalid");
      setSlideEditMessage("スライドを複製できませんでした。");
      setSlideEditDiagnostics([
        `スライド数が上限の${ASSET_IMPORT_MAX_SLIDE_COUNT}件に達しているため、複製できません。`,
      ]);
      return false;
    }

    if (!accessToken || !readyWorkspace || !readyProject) {
      setSlideEditStatus("blocked");
      setSlideEditMessage("スライド複製に必要な確認済み情報が不足しています。");
      setSlideEditDiagnostics([
        "Google接続、Driveの保存領域、選択中プロジェクトの確認済み情報が不足しています。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ]);
      return false;
    }

    setDriveOperationInFlight(true);
    setSlideDuplicateInFlightState(true);
    setSlideEditStatus("duplicating");
    setSlideEditMessage("スライドを複製しています。");
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    try {
      const result = await duplicateDriveProjectSlide({
        accessToken,
        workspaceId: readyWorkspace.workspaceId,
        indexJsonFileId: readyWorkspace.indexJsonFileId,
        project: readyProject,
        slideId,
        runStep: (operation) => runDriveOperationStep(requestId, operation),
      });

      if (requestId !== driveOperationRequestIdRef.current) {
        return false;
      }

      applySlideManifestMutationSuccess({
        readyWorkspace,
        indexJsonText: result.indexJsonText,
        project: result.project,
        details: result.details,
        projectMessage:
          "選択中プロジェクトのスライド複製をプロジェクト設定と一覧へ反映し、再確認しました。",
      });
      setSlideEditStatus("completed");
      setSlideEditMessage(
        "スライドを複製しました。再生へ反映するには、このアルバムをローカルに保存してください。",
      );
      setSlideEditDiagnostics([
        ...result.diagnostics,
        "新しいスライドをプロジェクトへ追加しました。",
        "Drive上の素材ファイルはコピーしていません。",
        "再生への反映には、このプロジェクトの端末同期が必要です。",
      ]);
      return true;
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return false;
      }

      if (error instanceof DriveProjectSlideDuplicateError) {
        handleSlideEditDriveAuthError(error.status);
        setProjectStatus(error.status === "invalidProject" ? "invalid" : "error");
        setSlideEditStatus(
          error.status === "invalidProject" ? "invalid" : "error",
        );
        setSlideEditMessage(
          error.status === "invalidProject"
            ? "スライド複製前のDriveプロジェクト情報に問題があります。"
            : "スライド複製に失敗しました。",
        );
        setSlideEditDiagnostics(error.diagnostics);
        return false;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setSlideEditStatus("error");
      setSlideEditMessage("スライド複製に失敗しました。");
      setSlideEditDiagnostics([
        "スライド複製中に予期しないエラーが発生しました。",
        "プロジェクト設定と一覧のどこまで更新されたかは、この画面だけでは判断できません。",
        "Drive上の素材ファイルはコピーしていません。",
        "Drive状態を再確認してください。",
      ]);
      return false;
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
        setSlideDuplicateInFlightState(false);
      }
    }
  }

  async function previewUnusedProjectAssets() {
    const blockedReason = getAssetCleanupPreviewBlockedReason();
    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    setSafeAssetCleanupPreviewDiagnostics([]);

    if (blockedReason) {
      setAssetCleanupPreviewStatus("blocked");
      setAssetCleanupPreviewMessage("未使用素材の確認を開始できませんでした。");
      setSafeAssetCleanupPreviewDiagnostics([blockedReason]);
      setAssetCleanupPreviewResult(null);
      return;
    }

    if (!accessToken || !readyWorkspace || !readyProject) {
      setAssetCleanupPreviewStatus("blocked");
      setAssetCleanupPreviewMessage(
        "未使用素材の確認に必要な情報が不足しています。",
      );
      setSafeAssetCleanupPreviewDiagnostics([
        "Google接続、Driveの保存領域、選択中プロジェクトの確認済み情報が不足しています。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ]);
      setAssetCleanupPreviewResult(null);
      return;
    }

    clearAssetCleanupDeletePreflight();

    setDriveOperationInFlight(true);
    setAssetCleanupPreviewInFlightState(true);
    setAssetCleanupPreviewStatus("checking");
    setAssetCleanupPreviewMessage("未使用素材の削除候補を更新しています。");
    setAssetCleanupPreviewResult(null);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    try {
      const result = await previewDriveProjectUnusedAssets({
        accessToken,
        workspaceId: readyWorkspace.workspaceId,
        project: readyProject,
        runStep: (operation) => runDriveOperationStep(requestId, operation),
      });

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setAssetCleanupPreviewStatus("ready");
      setAssetCleanupPreviewMessage(
        "未使用素材の削除候補を更新しました。Drive上の素材は削除していません。",
      );
      setAssetCleanupPreviewResult(result);
      setSafeAssetCleanupPreviewDiagnostics(result.diagnostics);
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (error instanceof DriveProjectUnusedAssetPreviewError) {
        if (error.status === "authRequired") {
          resetGoogleAfterDriveAuthFailure();
          setDriveStatus("authRequired");
          setDriveMessage(
            "Google再接続が必要です。再接続後にDrive状態を再確認してください。",
          );
        }

        setAssetCleanupPreviewStatus(
          error.status === "invalidProject"
            ? "invalid"
            : error.status === "scanLimitExceeded"
              ? "blocked"
              : "error",
        );
        setAssetCleanupPreviewMessage("未使用素材の確認に失敗しました。");
        setSafeAssetCleanupPreviewDiagnostics(error.diagnostics);
        setAssetCleanupPreviewResult(null);
        return;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setAssetCleanupPreviewStatus("error");
      setAssetCleanupPreviewMessage("未使用素材の確認に失敗しました。");
      setSafeAssetCleanupPreviewDiagnostics([
        "未使用素材の確認中に予期しないエラーが発生しました。",
        "プロジェクト設定と一覧は更新していません。",
        "Drive上の素材ファイルは更新・削除していません。",
      ]);
      setAssetCleanupPreviewResult(null);
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
        setAssetCleanupPreviewInFlightState(false);
      }
    }
  }

  async function preflightUnusedAssetDeletion(assetFileIds: string[]) {
    const blockedReason = getAssetCleanupDeletePreflightBlockedReason();
    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    setSafeAssetCleanupDeletePreflightDiagnostics([]);

    if (assetFileIds.length === 0) {
      setAssetCleanupDeletePreflightStatus("blocked");
      setAssetCleanupDeletePreflightMessage(
        "削除前確認の対象となる未使用素材が選択されていません。",
      );
      setSafeAssetCleanupDeletePreflightDiagnostics([
        "未使用素材を1件以上選択してください。",
      ]);
      setAssetCleanupDeletePreflightResult(null);
      return;
    }

    if (blockedReason) {
      setAssetCleanupDeletePreflightStatus("blocked");
      setAssetCleanupDeletePreflightMessage(
        "未使用素材の削除前確認を開始できませんでした。",
      );
      setSafeAssetCleanupDeletePreflightDiagnostics([blockedReason]);
      setAssetCleanupDeletePreflightResult(null);
      return;
    }

    if (!accessToken || !readyWorkspace || !readyProject) {
      setAssetCleanupDeletePreflightStatus("blocked");
      setAssetCleanupDeletePreflightMessage(
        "未使用素材の削除前確認に必要な情報が不足しています。",
      );
      setSafeAssetCleanupDeletePreflightDiagnostics([
        "Google接続、Driveの保存領域、選択中プロジェクトの確認済み情報が不足しています。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ]);
      setAssetCleanupDeletePreflightResult(null);
      return;
    }

    resetAssetCleanupDeleteState();
    assetCleanupDeletePreflightOwnerRef.current = null;

    setDriveOperationInFlight(true);
    setAssetCleanupDeletePreflightInFlightState(true);
    setAssetCleanupDeletePreflightStatus("checking");
    setAssetCleanupDeletePreflightMessage(
      "Driveの最新のプロジェクト設定と素材情報で削除前確認を実行しています。",
    );
    setAssetCleanupDeletePreflightResult(null);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    try {
      const result = await preflightDriveProjectUnusedAssetDeletion({
        accessToken,
        workspaceId: readyWorkspace.workspaceId,
        project: readyProject,
        assetFileIds,
        runStep: (_label, operation) =>
          runDriveOperationStep(requestId, operation),
      });

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setAssetCleanupDeletePreflightStatus("ready");
      setAssetCleanupDeletePreflightMessage(
        "削除前確認が完了しました。この段階ではまだDrive上の素材は削除しません。",
      );
      setAssetCleanupDeletePreflightResult(result);
      assetCleanupDeletePreflightOwnerRef.current =
        buildDriveProjectUnusedAssetDeleteOwner({
          workspaceId: readyWorkspace.workspaceId,
          project: readyProject,
        });
      setSafeAssetCleanupDeletePreflightDiagnostics(result.diagnostics);
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (error instanceof DriveProjectUnusedAssetDeletePreflightError) {
        setAssetCleanupDeletePreflightStatus(
          error.code === "invalidInput" || error.code === "tooManyCandidates"
            ? "invalid"
            : "error",
        );
        setAssetCleanupDeletePreflightMessage(
          "未使用素材の削除前確認に失敗しました。",
        );
        setSafeAssetCleanupDeletePreflightDiagnostics(error.diagnostics);
        setAssetCleanupDeletePreflightResult(null);
        return;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setAssetCleanupDeletePreflightStatus("error");
      setAssetCleanupDeletePreflightMessage(
        "未使用素材の削除前確認に失敗しました。",
      );
      setSafeAssetCleanupDeletePreflightDiagnostics([
        "未使用素材の削除前確認中に予期しないエラーが発生しました。",
        "Drive上の素材は削除していません。",
        "プロジェクト設定と一覧は更新していません。",
      ]);
      setAssetCleanupDeletePreflightResult(null);
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
        setAssetCleanupDeletePreflightInFlightState(false);
      }
    }
  }

  function prepareUnusedAssetDeletion(assetFileIds: string[]) {
    if (assetCleanupDeleteInFlightRef.current) {
      return;
    }

    const blockedReason = getAssetCleanupDeleteBlockedReason();
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    resetAssetCleanupDeleteState();

    if (blockedReason || !readyWorkspace || !readyProject) {
      setAssetCleanupDeleteStatus("blocked");
      setAssetCleanupDeleteMessage("未使用素材の削除確認を開始できませんでした。");
      setSafeAssetCleanupDeleteDiagnostics([
        blockedReason ?? "Driveの保存領域とプロジェクトの状態を確認してください。",
      ]);
      return;
    }

    const prepared = prepareDriveProjectUnusedAssetDeletion({
      selectedAssetFileIds: assetFileIds,
      preflightResult: assetCleanupDeletePreflightResult,
      preflightOwner: assetCleanupDeletePreflightOwnerRef.current,
      currentOwner: buildDriveProjectUnusedAssetDeleteOwner({
        workspaceId: readyWorkspace.workspaceId,
        project: readyProject,
      }),
    });

    if (!prepared.ok) {
      setAssetCleanupDeleteStatus("blocked");
      setAssetCleanupDeleteMessage("削除前確認の内容を使用できません。");
      setSafeAssetCleanupDeleteDiagnostics([
        getAssetCleanupDeletePreparationFailureMessage(prepared.reason),
      ]);
      return;
    }

    pendingAssetCleanupDeletePlanRef.current = prepared.plan;
    setAssetCleanupDeleteReview(prepared.review);
    setAssetCleanupDeleteStatus("confirming");
    setAssetCleanupDeleteMessage(
      "Google Driveから完全削除する対象を確認してください。",
    );
    setSafeAssetCleanupDeleteDiagnostics([]);
  }

  function cancelUnusedAssetDeletion() {
    if (assetCleanupDeleteStatus !== "confirming") {
      return;
    }

    assetCleanupDeleteRequestIdRef.current += 1;
    pendingAssetCleanupDeletePlanRef.current = null;
    setAssetCleanupDeleteReview(null);
    setAssetCleanupDeleteResult(null);
    setAssetCleanupDeleteProgress(null);
    setAssetCleanupDeleteStatus("cancelled");
    setAssetCleanupDeleteMessage("削除をキャンセルしました");
    setSafeAssetCleanupDeleteDiagnostics([
      "Google Driveへの削除要求は送信していません。",
    ]);
  }

  async function confirmUnusedAssetDeletion() {
    if (assetCleanupDeleteInFlightRef.current) {
      return;
    }

    const plan = pendingAssetCleanupDeletePlanRef.current;
    const blockedReason = getAssetCleanupDeleteBlockedReason();
    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    if (
      !plan ||
      blockedReason ||
      !accessToken ||
      !readyWorkspace ||
      !readyProject
    ) {
      pendingAssetCleanupDeletePlanRef.current = null;
      setAssetCleanupDeleteReview(null);
      setAssetCleanupDeleteStatus("blocked");
      setAssetCleanupDeleteMessage("削除直前の再検証で停止しました");
      setSafeAssetCleanupDeleteDiagnostics([
        blockedReason ?? "最終確認の対象または操作対象が変わりました。",
      ]);
      return;
    }

    setDriveOperationInFlight(true);
    setAssetCleanupDeleteInFlightState(true);
    setAssetCleanupDeleteStatus("deleting");
    setAssetCleanupDeleteMessage("未使用素材を削除しています。");
    setAssetCleanupDeleteResult(null);
    setAssetCleanupDeleteProgress({ current: 0, total: plan.assets.length });
    setSafeAssetCleanupDeleteDiagnostics([]);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;
    const deleteRequestId = assetCleanupDeleteRequestIdRef.current + 1;
    assetCleanupDeleteRequestIdRef.current = deleteRequestId;

    try {
      const result = await executeDriveProjectUnusedAssetDeletion({
        plan,
        currentOwner: buildDriveProjectUnusedAssetDeleteOwner({
          workspaceId: readyWorkspace.workspaceId,
          project: readyProject,
        }),
        runFreshPreflight: (assetFileIds) =>
          preflightDriveProjectUnusedAssetDeletion({
            accessToken,
            workspaceId: readyWorkspace.workspaceId,
            project: readyProject,
            assetFileIds,
            runStep: (_label, operation) =>
              runDriveOperationStep(requestId, operation),
          }),
        deleteAssetFile: (assetFileId) =>
          runDriveOperationStep(requestId, (signal) =>
            deleteDriveProjectAssetFile({
              accessToken,
              assetFileId,
              signal,
            }),
          ),
        onProgress: (progress) => {
          if (
            requestId === driveOperationRequestIdRef.current &&
            deleteRequestId === assetCleanupDeleteRequestIdRef.current &&
            accessTokenRef.current === accessToken
          ) {
            setAssetCleanupDeleteProgress(progress);
          }
        },
      });

      if (
        requestId !== driveOperationRequestIdRef.current ||
        deleteRequestId !== assetCleanupDeleteRequestIdRef.current ||
        accessTokenRef.current !== accessToken
      ) {
        return;
      }

      pendingAssetCleanupDeletePlanRef.current = null;
      setAssetCleanupDeleteReview(null);
      setAssetCleanupDeleteResult(result);
      setAssetCleanupDeleteStatus(
        result.status === "failed" ? "error" : result.status,
      );
      setAssetCleanupDeleteMessage(
        getAssetCleanupDeleteResultMessage(result.status),
      );
      setSafeAssetCleanupDeleteDiagnostics(
        buildAssetCleanupDeleteResultDiagnostics(result),
      );

      if (
        result.status === "completed" ||
        result.status === "partialFailure"
      ) {
        assetCleanupDeletePreflightOwnerRef.current = null;
        setAssetCleanupDeletePreflightStatus("idle");
        setAssetCleanupDeletePreflightMessage(
          initialAssetCleanupDeletePreflightMessage,
        );
        setSafeAssetCleanupDeletePreflightDiagnostics([]);
        setAssetCleanupDeletePreflightResult(null);
        await refreshAssetCleanupPreviewAfterDelete({
          accessToken,
          readyWorkspace,
          readyProject,
          requestId,
          deleteRequestId,
        });
      }
    } catch {
      if (
        requestId !== driveOperationRequestIdRef.current ||
        deleteRequestId !== assetCleanupDeleteRequestIdRef.current
      ) {
        return;
      }
      pendingAssetCleanupDeletePlanRef.current = null;
      setAssetCleanupDeleteReview(null);
      setAssetCleanupDeleteStatus("error");
      setAssetCleanupDeleteMessage("未使用素材の削除に失敗しました");
      setSafeAssetCleanupDeleteDiagnostics([
        "削除処理中に予期しない失敗が発生しました。自動再試行は行いません。",
      ]);
    } finally {
      if (
        requestId === driveOperationRequestIdRef.current &&
        deleteRequestId === assetCleanupDeleteRequestIdRef.current
      ) {
        pendingAssetCleanupDeletePlanRef.current = null;
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
        setAssetCleanupDeleteInFlightState(false);
        setAssetCleanupDeleteProgress(null);
      }
    }
  }

  async function prepareProjectDeletion() {
    const blockedReason = getProjectDeleteBlockedReason();
    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    if (blockedReason || !accessToken || !readyWorkspace || !readyProject) {
      pendingProjectDeletePlanRef.current = null;
      setProjectDeleteReview(null);
      setProjectDeleteResult(null);
      setProjectDeleteLocalCopyStatus("notAttempted");
      setProjectDeleteStatus("blocked");
      setProjectDeleteMessage("アルバムの削除確認を開始できませんでした。");
      setSafeProjectDeleteDiagnostics([
        blockedReason ?? "Driveの保存領域とプロジェクトの状態を確認してください。",
      ]);
      return;
    }

    setDriveOperationInFlight(true);
    setProjectDeleteStatus("checking");
    setProjectDeleteMessage("削除対象のアルバムを確認しています。");
    setProjectDeleteResult(null);
    setProjectDeleteLocalCopyStatus("notAttempted");
    setSafeProjectDeleteDiagnostics([]);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;
    const deleteRequestId = projectDeleteRequestIdRef.current + 1;
    projectDeleteRequestIdRef.current = deleteRequestId;

    try {
      const preflight = await runDriveOperationStep(requestId, (signal) =>
        preflightDriveProjectDeletion({
          accessToken,
          workspaceId: readyWorkspace.workspaceId,
          indexJsonFileId: readyWorkspace.indexJsonFileId,
          projectsRootFolderId: readyWorkspace.projectsRootFolderId,
          project: readyProject,
          signal,
        }),
      );

      if (
        requestId !== driveOperationRequestIdRef.current ||
        deleteRequestId !== projectDeleteRequestIdRef.current
      ) {
        return;
      }

      const prepared = prepareDriveProjectDeletion({
        preflightResult: preflight,
        currentOwner: buildDriveProjectDeleteOwner({
          workspaceId: readyWorkspace.workspaceId,
          indexJsonFileId: readyWorkspace.indexJsonFileId,
          projectsRootFolderId: readyWorkspace.projectsRootFolderId,
          project: readyProject,
        }),
      });

      if (!prepared.ok) {
        pendingProjectDeletePlanRef.current = null;
        setProjectDeleteReview(null);
        setProjectDeleteStatus("blocked");
        setProjectDeleteMessage("アルバムの削除確認で停止しました。");
        setSafeProjectDeleteDiagnostics(prepared.diagnostics);
        return;
      }

      pendingProjectDeletePlanRef.current = prepared.plan;
      setProjectDeleteReview(prepared.review);
      setProjectDeleteStatus("confirming");
      setProjectDeleteMessage(
        "Google Drive上のアルバムデータを削除する前に確認してください。",
      );
      setSafeProjectDeleteDiagnostics([]);
    } catch (error) {
      if (
        requestId !== driveOperationRequestIdRef.current ||
        deleteRequestId !== projectDeleteRequestIdRef.current
      ) {
        return;
      }
      pendingProjectDeletePlanRef.current = null;
      setProjectDeleteReview(null);
      if (
        error instanceof DriveApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        resetGoogleAfterDriveAuthFailure();
        setProjectDeleteStatus("error");
        setProjectDeleteMessage("Google再接続が必要です。");
        setSafeProjectDeleteDiagnostics([
          "アルバムの削除は開始していません。Googleへ再接続してください。",
        ]);
        return;
      }
      setProjectDeleteStatus("error");
      setProjectDeleteMessage("アルバムの削除確認に失敗しました。");
      setSafeProjectDeleteDiagnostics([
        "削除前確認中にエラーが発生しました。自動再試行は行いません。",
      ]);
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
      }
    }
  }

  function cancelProjectDeletion() {
    if (projectDeleteStatus !== "confirming") {
      return;
    }

    invalidatePendingProjectDeletion();
    setProjectDeleteReview(null);
    setProjectDeleteResult(null);
    setProjectDeleteLocalCopyStatus("notAttempted");
    setProjectDeleteStatus("cancelled");
    setProjectDeleteMessage("アルバムの削除をキャンセルしました。");
    setSafeProjectDeleteDiagnostics([
      "Google Driveへの削除要求は送信していません。",
    ]);
  }

  async function confirmProjectDeletion() {
    if (projectDeleteInFlightRef.current) {
      return;
    }

    const plan = pendingProjectDeletePlanRef.current;
    const blockedReason = getProjectDeleteBlockedReason();
    const accessToken = accessTokenRef.current;
    const readyWorkspace = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    if (
      !plan ||
      blockedReason ||
      !accessToken ||
      !readyWorkspace ||
      !readyProject
    ) {
      pendingProjectDeletePlanRef.current = null;
      setProjectDeleteReview(null);
      setProjectDeleteStatus("blocked");
      setProjectDeleteMessage("削除直前の再検証で停止しました。");
      setSafeProjectDeleteDiagnostics([
        blockedReason ?? "最終確認の対象または操作対象が変わりました。",
      ]);
      return;
    }

    setDriveOperationInFlight(true);
    projectDeleteInFlightRef.current = true;
    setIsProjectDeleteInFlight(true);
    setProjectDeleteStatus("deleting");
    setProjectDeleteMessage("アルバムを削除しています。");
    setProjectDeleteResult(null);
    setProjectDeleteLocalCopyStatus("notAttempted");
    setSafeProjectDeleteDiagnostics([]);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;
    const deleteRequestId = projectDeleteRequestIdRef.current + 1;
    projectDeleteRequestIdRef.current = deleteRequestId;
    let verifiedIndexJsonText: string | null = null;
    const isCurrentRequest = () =>
      requestId === driveOperationRequestIdRef.current &&
      deleteRequestId === projectDeleteRequestIdRef.current;

    try {
      const outcome = await executeProjectDeleteDriveWorkflow({
        plan,
        currentOwner: buildDriveProjectDeleteOwner({
          workspaceId: readyWorkspace.workspaceId,
          indexJsonFileId: readyWorkspace.indexJsonFileId,
          projectsRootFolderId: readyWorkspace.projectsRootFolderId,
          project: readyProject,
        }),
        executeInput: {
          runFreshPreflight: () =>
            runDriveOperationStep(requestId, (signal) =>
              preflightDriveProjectDeletion({
                accessToken,
                workspaceId: readyWorkspace.workspaceId,
                indexJsonFileId: readyWorkspace.indexJsonFileId,
                projectsRootFolderId: readyWorkspace.projectsRootFolderId,
                project: plan.project,
                signal,
              }),
            ),
          writeIndexJson: (jsonText) =>
            runDriveOperationStep(requestId, (signal) =>
              writeDriveProjectIndexForDeletion({
                accessToken,
                indexJsonFileId: readyWorkspace.indexJsonFileId,
                workspaceId: readyWorkspace.workspaceId,
                jsonText,
                signal,
              }),
            ),
          readIndexJson: () =>
            runDriveOperationStep(requestId, async (signal) => {
              const text = await readDriveTextFile(
                accessToken,
                readyWorkspace.indexJsonFileId,
                signal,
              );
              verifiedIndexJsonText = text;
              return text;
            }),
          trashProjectRoot: () =>
            runDriveOperationStep(requestId, (signal) =>
              trashDriveProjectRootFolder({
                accessToken,
                projectFolderId: plan.project.projectFolderId,
                signal,
              }),
            ),
          readProjectRootMetadata: () =>
            runDriveOperationStep(requestId, (signal) =>
              readDriveProjectRootMetadataForDeletion({
                accessToken,
                projectFolderId: plan.project.projectFolderId,
                signal,
              }),
            ),
          listActiveProjectRoots: () =>
            runDriveOperationStep(requestId, (signal) =>
              listActiveDriveProjectRootsForProject({
                accessToken,
                projectsRootFolderId: readyWorkspace.projectsRootFolderId,
                projectId: plan.project.projectId,
                signal,
              }),
            ),
        },
        isCurrent: isCurrentRequest,
      });

      if (!isCurrentRequest() || !outcome.applyUi) {
        return;
      }

      pendingProjectDeletePlanRef.current = null;
      setProjectDeleteReview(null);

      if (outcome.kind === "preWriteAuthError") {
        resetGoogleAfterDriveAuthFailure();
        setProjectDeleteStatus("error");
        setProjectDeleteMessage("Google再接続が必要です。");
        setProjectDeleteLocalCopyStatus("notAttempted");
        setSafeProjectDeleteDiagnostics([
          "アルバムの削除は完了していません。Googleへ再接続してください。",
        ]);
        return;
      }

      if (outcome.kind === "unexpectedError" || !outcome.interpretation) {
        setProjectDeleteStatus("error");
        setProjectDeleteMessage("アルバムの削除に失敗しました。");
        setProjectDeleteLocalCopyStatus("notAttempted");
        setSafeProjectDeleteDiagnostics([
          "削除処理中に予期しない失敗が発生しました。自動再試行は行いません。",
        ]);
        return;
      }

      const interpretation = outcome.interpretation;
      const nextDriveProjects = interpretation.shouldRemoveDeletedProjectFromList
        ? removeDeletedProjectFromList(driveProjects, plan.project.projectId)
        : driveProjects;

      const applyRemovedProjectDriveState = () => {
        if (interpretation.shouldRemoveDeletedProjectFromList) {
          setDriveProjects(nextDriveProjects);
          setSelectedProjectId(null);
          if (interpretation.shouldClearDeletedProjectReadyState) {
            clearProjectReadyDetails();
          }
          setProjectStatus(
            nextDriveProjects.length === 0 ? "notCreated" : "ready",
          );
          setProjectMessage(
            nextDriveProjects.length === 0
              ? "プロジェクトはまだ作成されていません。"
              : "アルバムを選択してください。",
          );
        }

        if (
          interpretation.shouldUpdateWorkspaceIndexText &&
          verifiedIndexJsonText
        ) {
          setWorkspaceReadyContext({
            ...readyWorkspace,
            indexJsonText: verifiedIndexJsonText,
          });
        }
      };

      const applyDeleteUi = () => {
        setProjectDeleteResult(interpretation.publicResult);
        setProjectDeleteStatus(interpretation.status);
        setProjectDeleteMessage(interpretation.message);
        setProjectDeleteLocalCopyStatus("notAttempted");
        setSafeProjectDeleteDiagnostics(interpretation.diagnostics);
      };

      if (interpretation.shouldInvalidateGoogleAuth) {
        applyRemovedProjectDriveState();
        applyDeleteUi();
        resetGoogleAfterDriveAuthFailure();
        applyDeleteUi();
        setDriveProjects(nextDriveProjects);
        setSelectedProjectId(null);
        setProjectStatus(
          nextDriveProjects.length === 0 ? "notCreated" : "ready",
        );
        setProjectMessage(
          nextDriveProjects.length === 0
            ? "プロジェクトはまだ作成されていません。"
            : "アルバムを選択してください。",
        );
        return;
      }

      const localOutcome = await finalizeProjectDeleteLocalCopyAfterDriveState({
        shouldClearLocal: interpretation.shouldClearLocal,
        projectId: plan.project.projectId,
        applyDriveState: () => {
          applyRemovedProjectDriveState();
          applyDeleteUi();
        },
        isCurrent: isCurrentRequest,
        clearLocal: clearLocalOfflineProjectData,
      });

      if (!localOutcome.applyLocalCopyUi) {
        return;
      }

      setProjectDeleteLocalCopyStatus(localOutcome.localCopyStatus);
      if (localOutcome.localCopyMessage) {
        setProjectDeleteMessage(localOutcome.localCopyMessage);
      }
    } finally {
      const released = releaseOwnedProjectDeleteConfirmLocks({
        ownedDriveRequestId: requestId,
        ownedDeleteRequestId: deleteRequestId,
        currentDriveRequestId: driveOperationRequestIdRef.current,
        currentDeleteRequestId: projectDeleteRequestIdRef.current,
      });
      if (released.releaseDriveLock) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
      }
      if (released.releaseProjectDeleteLock) {
        pendingProjectDeletePlanRef.current = null;
        projectDeleteInFlightRef.current = false;
        setIsProjectDeleteInFlight(false);
      }
    }
  }

  async function refreshAssetCleanupPreviewAfterDelete(input: {
    accessToken: string;
    readyWorkspace: DriveWorkspaceReadyContext;
    readyProject: DriveProjectSummary;
    requestId: number;
    deleteRequestId: number;
  }) {
    setAssetCleanupPreviewInFlightState(true);
    setAssetCleanupPreviewStatus("checking");
    setAssetCleanupPreviewMessage(
      "削除結果を反映するためcleanup previewを再読込しています。",
    );

    try {
      const preview = await previewDriveProjectUnusedAssets({
        accessToken: input.accessToken,
        workspaceId: input.readyWorkspace.workspaceId,
        project: input.readyProject,
        runStep: (operation) =>
          runDriveOperationStep(input.requestId, operation),
      });
      if (
        input.requestId !== driveOperationRequestIdRef.current ||
        input.deleteRequestId !== assetCleanupDeleteRequestIdRef.current ||
        accessTokenRef.current !== input.accessToken
      ) {
        return;
      }
      setAssetCleanupPreviewStatus("ready");
      setAssetCleanupPreviewMessage(
        "削除後のcleanup previewを再読込しました。",
      );
      setAssetCleanupPreviewResult(preview);
      setSafeAssetCleanupPreviewDiagnostics(preview.diagnostics);
    } catch {
      if (
        input.requestId !== driveOperationRequestIdRef.current ||
        input.deleteRequestId !== assetCleanupDeleteRequestIdRef.current
      ) {
        return;
      }
      setAssetCleanupPreviewStatus("error");
      setAssetCleanupPreviewMessage(
        "削除結果は確定していますが、cleanup previewの再読込に失敗しました",
      );
      setAssetCleanupPreviewResult(null);
      setSafeAssetCleanupPreviewDiagnostics([
        "削除結果は保持しています。cleanup previewを手動で再実行してください。",
      ]);
    } finally {
      if (
        input.requestId === driveOperationRequestIdRef.current &&
        input.deleteRequestId === assetCleanupDeleteRequestIdRef.current
      ) {
        setAssetCleanupPreviewInFlightState(false);
      }
    }
  }

  function applySlideManifestMutationSuccess(input: {
    readyWorkspace: DriveWorkspaceReadyContext;
    indexJsonText: string;
    project: DriveProjectSummary;
    details: DriveProjectReadyDetails;
    projectMessage: string;
  }) {
    setWorkspaceReadyContext({
      ...input.readyWorkspace,
      indexJsonText: input.indexJsonText,
    });
    setProjectStatus("ready");
    setProjectMessage(input.projectMessage);
    applyProjectReadyState(input.project, toProjectDetails(input.details));
  }

  function handleSlideEditDriveAuthError(status: "authRequired" | string) {
    if (status !== "authRequired") {
      return;
    }

    resetGoogleAfterDriveAuthFailure();
    setDriveStatus("authRequired");
    setDriveMessage(
      "Google再接続が必要です。再接続後にDrive状態を再確認してください。",
    );
  }

  async function createProject(titleInput: string) {
    if (driveOperationInFlightRef.current) {
      return;
    }

    const accessToken = accessTokenRef.current;
    const title = normalizeProjectTitleInput(titleInput);
    const titleDiagnostics = validateProjectTitleInput(title);

    if (titleDiagnostics.length > 0) {
      setProjectDiagnostics(titleDiagnostics);
      return;
    }

    if (!accessToken) {
      setDriveStatus("authRequired");
      setDriveMessage(
        "Google接続が必要です。もう一度Google接続を行ってからプロジェクトを作成してください。",
      );
      setDriveCandidates([]);
      setDriveDiagnostics([]);
      setWorkspaceReadyContext(null);
      setProjectStatus("error");
      setProjectMessage(
        "Google接続が必要です。もう一度Google接続を行ってからプロジェクトを作成してください。",
      );
      setDriveProjects([]);
      setSelectedProjectId(null);
      clearProjectReadyDetails();
      setProjectDiagnostics([]);
      return;
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      setProjectStatus("idle");
      setProjectMessage(initialProjectMessage);
      setDriveProjects([]);
      setSelectedProjectId(null);
      clearProjectReadyDetails();
      setProjectDiagnostics([
        "Driveワークスペースの確認済み情報を取得できませんでした。",
        "先にDrive状態を再確認し、保存領域を利用できることを確認してください。",
      ]);
      return;
    }

    if (projectStatus !== "notCreated" && projectStatus !== "ready") {
      setProjectDiagnostics([
        "Driveのプロジェクト一覧を安全に更新できる状態ではないため、作成を開始しませんでした。",
        "先にプロジェクト状態を再確認してください。",
      ]);
      return;
    }

    setDriveOperationInFlight(true);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;
    const readyContext = workspaceReadyContext;
    let createStepIndex = 0;

    setProjectStatus("creating");
    setProjectMessage(projectCreateStepMessages[0]);
    clearProjectReadyDetails();
    setProjectDiagnostics([]);

    try {
      const result = await createDriveProject({
        accessToken,
        readyContext,
        title,
        runStep: (operation) => {
          setProjectStatus("creating");
          setProjectMessage(
            projectCreateStepMessages[createStepIndex] ??
              "プロジェクトを作成しています。",
          );
          createStepIndex += 1;

          return runDriveOperationStep(requestId, operation);
        },
      });

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setWorkspaceReadyContext({
        ...readyContext,
        indexJsonText: result.indexJsonText,
      });
      const indexValidation = validateIndexJsonProjects(result.indexJsonText);

      if (indexValidation.status === "ready") {
        applyDriveProjects(indexValidation.projects);
      }

      setProjectStatus("ready");
      setProjectMessage(
        "新しいプロジェクトを作成し、選択状態にしました。",
      );
      applyProjectReadyState(result.project, toProjectDetails(result.details));
      setProjectDiagnostics(result.diagnostics);
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      clearProjectReadyDetails();

      if (error instanceof DriveProjectCreateError) {
        if (error.status === "authRequired") {
          resetGoogleAfterDriveAuthFailure();
          setDriveStatus("authRequired");
          setDriveMessage(
            "Google再接続が必要です。再接続後にDrive状態を再確認してください。",
          );
          setDriveCandidates([]);
          setDriveDiagnostics([]);
          setProjectStatus("error");
          setProjectMessage(
            "プロジェクト作成中にGoogle再接続が必要になりました。",
          );
          setProjectDiagnostics(buildProjectCreateFailureDiagnostics(error));
          return;
        }

        if (error.status === "duplicateTitle") {
          setProjectStatus("ready");
          setProjectMessage(DUPLICATE_PROJECT_TITLE_MESSAGE);
          setProjectDiagnostics(buildProjectCreateFailureDiagnostics(error));
          return;
        }

        setWorkspaceReadyContext(null);
        setDriveStatus("unchecked");
        setDriveMessage(
          "プロジェクト作成結果を正しく判断するため、Drive状態を再確認してください。",
        );
        setDriveCandidates([]);
        setDriveDiagnostics(buildProjectCreateDriveRecheckDiagnostics());
        setProjectStatus(
          error.status === "invalidWorkspace" ? "invalid" : "error",
        );
        setProjectMessage(
          error.status === "notCreatable"
            ? "既存プロジェクト、または競合作成を検知したため作成を停止しました。"
            : error.status === "invalidWorkspace"
              ? "Drive上のプロジェクト情報に問題があります。この画面では自動修復しません。"
              : "プロジェクト作成に失敗しました。",
        );
        setProjectDiagnostics(buildProjectCreateFailureDiagnostics(error));
        return;
      }

      setWorkspaceReadyContext(null);
      setDriveStatus("unchecked");
      setDriveMessage(
        "プロジェクト作成結果を正しく判断するため、Drive状態を再確認してください。",
      );
      setDriveCandidates([]);
      setDriveDiagnostics(buildProjectCreateDriveRecheckDiagnostics());
      setProjectStatus("error");
      setProjectMessage("プロジェクト作成に失敗しました。");
      setProjectDiagnostics(buildUnknownProjectCreateFailureDiagnostics());
    } finally {
      if (requestId === driveOperationRequestIdRef.current) {
        clearDriveOperationTimeout();
        driveOperationAbortRef.current = null;
        setDriveOperationInFlight(false);
      }
    }
  }

  async function registerDriveVideoPlaybackSession(
    input: DriveVideoPlaybackSessionRegistrationInput,
  ): Promise<DriveVideoPlaybackSessionRegistrationResult> {
    if (
      !isSupportedDriveVideoMimeType(input.mimeType) ||
      !isDriveVideoFileSizeWithinLimit(input.fileSize)
    ) {
      return { ok: false, reason: "messageFailed" };
    }

    const accessToken = accessTokenRef.current;

    if (!accessToken) {
      return { ok: false, reason: "accessTokenMissing" };
    }

    if (!("serviceWorker" in navigator)) {
      return { ok: false, reason: "serviceWorkerUnavailable" };
    }

    let registration: ServiceWorkerRegistration;

    try {
      registration = await navigator.serviceWorker.ready;
    } catch {
      return { ok: false, reason: "serviceWorkerNotReady" };
    }

    const targetWorker = navigator.serviceWorker.controller ?? registration.active;

    if (!navigator.serviceWorker.controller || !targetWorker) {
      return { ok: false, reason: "serviceWorkerNotReady" };
    }

    try {
      const result = await postDriveVideoPlaybackSessionMessage(targetWorker, {
        type: "REGISTER_DRIVE_VIDEO_SESSION",
        payload: {
          sessionId: input.sessionId,
          assetFileId: input.assetFileId,
          accessToken,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          expiresAt: input.expiresAt,
        },
      });

      return result.ok ? { ok: true } : { ok: false, reason: "messageFailed" };
    } catch {
      return { ok: false, reason: "messageFailed" };
    }
  }

  function unregisterDriveVideoPlaybackSession(sessionId: string): void {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const targetWorker = navigator.serviceWorker.controller;

    if (!targetWorker) {
      return;
    }

    void postDriveVideoPlaybackSessionMessage(targetWorker, {
      type: "UNREGISTER_DRIVE_VIDEO_SESSION",
      payload: {
        sessionId,
      },
    }).catch(() => {
      // Playback session cleanup is best-effort and does not expose internals.
    });
  }

  function clearDriveVideoPlaybackSessions(): void {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const targetWorker = navigator.serviceWorker.controller;

    if (!targetWorker) {
      return;
    }

    void postDriveVideoPlaybackSessionMessage(targetWorker, {
      type: "CLEAR_DRIVE_VIDEO_SESSIONS",
    }).catch(() => {
      // Playback session cleanup is best-effort and does not expose internals.
    });
  }

  async function prepareProjectPublishReview(
    projectId: string,
  ): Promise<PrepareProjectPublishReviewResult> {
    if (
      driveOperationInFlightRef.current ||
      projectPublishInFlightRef.current ||
      projectRollbackInFlightRef.current ||
      projectPublicationWriteInFlightRef.current
    ) {
      return createPrepareReviewFailure({
        code: "publishAlreadyRunning",
        message: "公開処理を実行中です。完了後にもう一度操作してください。",
      });
    }

    const accessToken = accessTokenRef.current;
    const workspace = workspaceReadyContext;
    const project = driveProjectReadyContext;
    if (
      !accessToken ||
      googleStatus !== "connected" ||
      driveFileGranted !== true ||
      driveStatus !== "ready" ||
      projectStatus !== "ready" ||
      !workspace ||
      !project ||
      project.projectId !== projectId
    ) {
      return createPrepareReviewFailure({
        code: "publishNotReady",
        message:
          "公開前確認の準備ができていません。Google接続と選択中プロジェクトを確認してください。",
      });
    }

    discardPendingProjectPublish();
    const requestSequence = projectPublishRequestSequenceRef.current;
    const controller = new AbortController();
    projectPublishAbortRef.current = controller;
    projectPublishInFlightRef.current = true;
    setIsProjectPublishInFlight(true);

    try {
      const result = await prepareProjectPublishReviewInDrive({
        accessToken,
        workspaceId: workspace.workspaceId,
        projectsRootFolderId: workspace.projectsRootFolderId,
        project,
        signal: controller.signal,
      });
      if (
        requestSequence !== projectPublishRequestSequenceRef.current ||
        accessTokenRef.current !== accessToken
      ) {
        return createPrepareReviewFailure({ code: "stalePublishRequest" });
      }
      if (!result.ok) return result;

      pendingProjectPublishRef.current = {
        owner: {
          projectId,
          revisionId: result.review.revisionId,
          requestSequence,
        },
        plan: result.plan,
      };
      return { ok: true, review: result.review };
    } finally {
      if (requestSequence === projectPublishRequestSequenceRef.current) {
        projectPublishAbortRef.current = null;
        projectPublishInFlightRef.current = false;
        setIsProjectPublishInFlight(false);
      }
    }
  }

  async function commitPreparedProjectPublish(input: {
    projectId: string;
    revisionId: string;
  }): Promise<CommitPreparedProjectPublishResult> {
    if (
      driveOperationInFlightRef.current ||
      projectPublishInFlightRef.current ||
      projectRollbackInFlightRef.current ||
      projectPublicationWriteInFlightRef.current
    ) {
      return {
        ok: false,
        error: {
          code: "publishAlreadyRunning",
          message: "公開処理を実行中です。完了を待ってください。",
          recoverability: "retryable",
          canRetry: false,
        },
      };
    }

    const pending = pendingProjectPublishRef.current;
    if (
      !pending ||
      !pendingProjectPublishOwnerMatches(pending.owner, input)
    ) {
      return {
        ok: false,
        error: {
          code: "preparedReviewNotFound",
          message:
            "公開前確認の内容を使用できません。公開前確認をやり直してください。",
          recoverability: "conflict",
          canRetry: false,
        },
      };
    }

    const accessToken = accessTokenRef.current;
    const workspace = workspaceReadyContext;
    const project = driveProjectReadyContext;
    if (
      !accessToken ||
      googleStatus !== "connected" ||
      driveFileGranted !== true ||
      !workspace ||
      !project ||
      project.projectId !== input.projectId
    ) {
      pendingProjectPublishRef.current = null;
      return {
        ok: false,
        error: {
          code: "publishNotReady",
          message:
            "Google接続または選択中プロジェクトが変わりました。公開前確認をやり直してください。",
          recoverability: "conflict",
          canRetry: false,
        },
      };
    }

    const locked = await runWithProjectPublicationWriteLock(
      { projectId: input.projectId },
      async (): Promise<CommitPreparedProjectPublishResult> => {
        const requestSequence = pending.owner.requestSequence;
        const controller = new AbortController();
        projectPublishAbortRef.current = controller;
        projectPublishInFlightRef.current = true;
        projectPublicationWriteInFlightRef.current = true;
        setIsProjectPublishInFlight(true);

        try {
          const workflowResult = await executePreparedProjectPublish({
            accessToken,
            plan: pending.plan,
            signal: controller.signal,
          });
          if (
            requestSequence !== projectPublishRequestSequenceRef.current ||
            accessTokenRef.current !== accessToken
          ) {
            return {
              ok: false,
              error: {
                code: "stalePublishRequest",
                message:
                  "公開対象が変更されました。選択中プロジェクトの状態を確認してください。",
                recoverability: "requiresInspection" as const,
                canRetry: false,
              },
            };
          }

          if (!workflowResult.ok) {
            const error = mapPublishWorkflowError(workflowResult);
            if (
              shouldDiscardPendingPlan(workflowResult.recoverability) === "discard"
            ) {
              pendingProjectPublishRef.current = null;
            }
            return { ok: false, error };
          }

          pendingProjectPublishRef.current = null;
          let refreshed = false;
          try {
            const detailResult = await validateDriveProjectDetails({
              accessToken,
              expectedWorkspaceId: workspace.workspaceId,
              expectedProjectsRootFolderId: workspace.projectsRootFolderId,
              project,
              signal: controller.signal,
            });
            if (
              requestSequence === projectPublishRequestSequenceRef.current &&
              detailResult.status === "ready"
            ) {
              applyProjectReadyState(project, toProjectDetails(detailResult.details), {
                preserveProjectPublish: true,
              });
              refreshed = true;
            }
          } catch {
            // The verified manifest commit remains successful if this refresh fails.
          }

          return {
            ok: true,
            result: buildSanitizedPublishSuccess({
              workflow: workflowResult,
              publishedAt: pending.plan.revisionFile.body.publishedAt,
              refreshed,
            }),
          };
        } finally {
          if (requestSequence === projectPublishRequestSequenceRef.current) {
            projectPublishAbortRef.current = null;
            projectPublishInFlightRef.current = false;
            projectPublicationWriteInFlightRef.current = false;
            setIsProjectPublishInFlight(false);
          }
        }
      },
    );

    if (!locked.acquired) {
      return {
        ok: false,
        error: {
          code: PUBLICATION_WRITE_LOCKED_CODE,
          message: PUBLICATION_WRITE_LOCKED_MESSAGE,
          recoverability: "retryable",
          canRetry: false,
        },
      };
    }

    return locked.value;
  }

  function cancelPreparedProjectPublish() {
    discardPendingProjectPublish();
  }

  async function prepareGooglePhotosExportReview(
    projectId: string,
  ): Promise<PrepareGooglePhotosExportReviewResult> {
    const accessToken = accessTokenRef.current;
    const workspace = workspaceReadyContext;
    const project = driveProjectReadyContext;
    if (
      !accessToken ||
      googleStatus !== "connected" ||
      driveFileGranted !== true ||
      driveStatus !== "ready" ||
      projectStatus !== "ready" ||
      !workspace ||
      !project ||
      project.projectId !== projectId
    ) {
      return {
        ok: false,
        error: {
          kind: "drivePreflightFailed",
          message:
            "書き出し前確認の準備ができていません。Google接続と選択中のアルバムを確認してください。",
        },
      };
    }

    discardPendingGooglePhotosExport();
    const requestSequence = googlePhotosExportRequestSequenceRef.current;
    const controller = new AbortController();
    googlePhotosExportAbortRef.current = controller;
    googlePhotosExportInFlightRef.current = true;
    setIsGooglePhotosExportInFlight(true);

    try {
      const source = await prepareGooglePhotosExportReviewInDrive({
        accessToken,
        selectedProjectId: projectId,
        workspaceId: workspace.workspaceId,
        projectsRootFolderId: workspace.projectsRootFolderId,
        project,
        signal: controller.signal,
      });
      if (
        requestSequence !== googlePhotosExportRequestSequenceRef.current ||
        accessTokenRef.current !== accessToken
      ) {
        return createGooglePhotosExportAuthorizationError("aborted");
      }
      if (!source.ok) {
        return toGooglePhotosExportReviewResult(source);
      }
      const imageOnlyError = assertGooglePhotosExportPlanIsImageOnly(source.plan);
      if (imageOnlyError) {
        return { ok: false, error: imageOnlyError };
      }

      try {
        await requestPhotosExportAccessToken(requestSequence);
      } catch (error) {
        if (error instanceof PhotosTokenRequestError && error.status === "cancelled") {
          return createGooglePhotosExportAuthorizationError("authorizationDenied");
        }
        return createGooglePhotosExportAuthorizationError("authorizationRequired");
      }

      if (
        requestSequence !== googlePhotosExportRequestSequenceRef.current ||
        accessTokenRef.current !== accessToken
      ) {
        return createGooglePhotosExportAuthorizationError("aborted");
      }

      pendingGooglePhotosExportRef.current = source.plan;
      googlePhotosExportRuntimeRef.current = {
        plan: source.plan,
        uploadTokens: [],
        uploadedFileNames: [],
        currentUpload: null,
      };
      googlePhotosRenderedImageRef.current = null;
      setGooglePhotosExportResult(null);
      setCanResumeGooglePhotosExport(false);
      return toGooglePhotosExportReviewResult(source);
    } finally {
      if (requestSequence === googlePhotosExportRequestSequenceRef.current) {
        googlePhotosExportAbortRef.current = null;
        googlePhotosExportInFlightRef.current = false;
        setIsGooglePhotosExportInFlight(false);
      }
    }
  }

  function cancelPreparedGooglePhotosExport() {
    discardPendingGooglePhotosExport();
  }

  function abortGooglePhotosExport() {
    googlePhotosExportAbortRef.current?.abort();
  }

  async function commitPreparedGooglePhotosExport(): Promise<CommitGooglePhotosExportResult> {
    const driveAccessToken = accessTokenRef.current;
    const photosAccessToken = photosExportAccessTokenRef.current;
    const plan = pendingGooglePhotosExportRef.current;
    const runtime = googlePhotosExportRuntimeRef.current;
    const workspace = workspaceReadyContext;
    const project = driveProjectReadyContext;
    if (!photosAccessToken) {
      return {
        ok: false,
        error: {
          kind: "authorizationRequired",
          message: "Googleフォトへの書き出し許可が必要です。",
        },
        canResume: false,
      };
    }
    if (
      !driveAccessToken ||
      !plan ||
      !runtime ||
      !workspace ||
      !project ||
      project.projectId !== plan.projectId
    ) {
      return {
        ok: false,
        error: {
          kind: "drivePreflightFailed",
          message: "書き出し元のアルバムを確認できませんでした。アルバムの状態を再確認してください。",
        },
        canResume: false,
      };
    }

    const requestSequence = googlePhotosExportRequestSequenceRef.current;
    const controller = new AbortController();
    googlePhotosExportAbortRef.current = controller;
    googlePhotosExportInFlightRef.current = true;
    setIsGooglePhotosExportInFlight(true);
    setCanResumeGooglePhotosExport(false);
    setGooglePhotosExportResult(null);

    try {
      const result = await commitGooglePhotosExportAfterFreshValidation({
        driveAccessToken,
        photosAccessToken,
        selectedProjectId: plan.projectId,
        workspaceId: workspace.workspaceId,
        projectsRootFolderId: workspace.projectsRootFolderId,
        project,
        runtime,
        signal: controller.signal,
        onProgress: setGooglePhotosExportProgress,
        onRuntime: (next) => {
          googlePhotosExportRuntimeRef.current = next;
        },
        renderedImageRef: googlePhotosRenderedImageRef,
      });
      if (requestSequence !== googlePhotosExportRequestSequenceRef.current) {
        return {
          ok: false,
          error: {
            kind: "aborted",
            message: "Googleフォトへの書き出しを中止しました。",
          },
          canResume: false,
        };
      }
      if (result.ok) {
        pendingGooglePhotosExportRef.current = null;
        googlePhotosExportRuntimeRef.current = null;
        googlePhotosRenderedImageRef.current = null;
        setGooglePhotosExportProgress(null);
        setGooglePhotosExportResult(result.result);
        setCanResumeGooglePhotosExport(false);
        return result;
      }
      if (result.error.kind === "sourceChanged") {
        pendingGooglePhotosExportRef.current = null;
        googlePhotosExportRuntimeRef.current = null;
        googlePhotosRenderedImageRef.current = null;
        setGooglePhotosExportProgress(null);
        setCanResumeGooglePhotosExport(false);
        return result;
      }
      if (!result.canResume) {
        googlePhotosRenderedImageRef.current = null;
      }
      setCanResumeGooglePhotosExport(result.canResume);
      return result;
    } finally {
      if (requestSequence === googlePhotosExportRequestSequenceRef.current) {
        googlePhotosExportAbortRef.current = null;
        googlePhotosExportInFlightRef.current = false;
        setIsGooglePhotosExportInFlight(false);
      }
    }
  }

  async function listProjectPublishRevisionsForProject(
    projectId: string,
    signal: AbortSignal,
  ): Promise<ListProjectPublishRevisionsResult> {
    const accessToken = accessTokenRef.current;
    const workspace = workspaceReadyContext;
    const project = driveProjectReadyContext;

    if (
      !accessToken ||
      googleStatus !== "connected" ||
      driveFileGranted !== true ||
      !workspace ||
      !project ||
      project.projectId !== projectId
    ) {
      return {
        ok: false,
        code: "driveReadFailed",
        message: "公開履歴を読み込む準備ができていません。",
      };
    }

    return listProjectPublishRevisions({
      accessToken,
      workspaceId: workspace.workspaceId,
      projectId,
      projectFolderId: project.projectFolderId,
      signal,
    });
  }

  async function loadProjectPublishHistoryOverviewForProject(
    projectId: string,
    signal: AbortSignal,
  ): Promise<LoadProjectPublishHistoryOverviewResult> {
    const accessToken = accessTokenRef.current;
    const workspace = workspaceReadyContext;
    const project = driveProjectReadyContext;

    if (
      !accessToken ||
      googleStatus !== "connected" ||
      driveFileGranted !== true ||
      !workspace ||
      !project ||
      project.projectId !== projectId
    ) {
      return {
        ok: false,
        code: "driveReadFailed",
        message: "現在の公開情報を読み込む準備ができていません。",
      };
    }

    return loadProjectPublishHistoryOverviewInDrive({
      accessToken,
      workspaceId: workspace.workspaceId,
      project,
      signal,
    });
  }

  async function loadProjectPublishRevisionForProject(
    projectId: string,
    revisionId: string,
    signal: AbortSignal,
  ): Promise<LoadProjectPublishRevisionResult> {
    const accessToken = accessTokenRef.current;
    const workspace = workspaceReadyContext;
    const project = driveProjectReadyContext;

    if (
      !accessToken ||
      googleStatus !== "connected" ||
      driveFileGranted !== true ||
      !workspace ||
      !project ||
      project.projectId !== projectId
    ) {
      return {
        ok: false,
        code: "driveReadFailed",
        message: "公開履歴を読み込む準備ができていません。",
      };
    }

    return loadProjectPublishRevision({
      accessToken,
      workspaceId: workspace.workspaceId,
      projectId,
      projectFolderId: project.projectFolderId,
      revisionId,
      signal,
    });
  }

  async function prepareProjectRollbackPreview(
    projectId: string,
    targetRevisionId: string,
    signal: AbortSignal,
  ): Promise<PrepareProjectRollbackPreviewResult> {
    if (
      driveOperationInFlightRef.current ||
      projectPublicationWriteInFlightRef.current ||
      projectRollbackInFlightRef.current
    ) {
      return createPrepareProjectRollbackPreviewFailure("notReady");
    }
    const accessToken = accessTokenRef.current;
    const workspace = workspaceReadyContext;
    const project = driveProjectReadyContext;

    if (
      !accessToken ||
      googleStatus !== "connected" ||
      driveFileGranted !== true ||
      driveStatus !== "ready" ||
      projectStatus !== "ready" ||
      !workspace ||
      !project ||
      project.projectId !== projectId
    ) {
      return createPrepareProjectRollbackPreviewFailure("notReady");
    }

    discardPendingProjectRollback({ abort: false });
    const requestSequence = projectRollbackRequestSequenceRef.current;
    const result = await prepareProjectRollbackPreviewGuardInDrive({
      accessToken,
      workspaceId: workspace.workspaceId,
      projectsRootFolderId: workspace.projectsRootFolderId,
      indexJsonFileId: workspace.indexJsonFileId,
      project,
      targetRevisionId,
      requestSequence,
      signal,
    });
    if (
      requestSequence !== projectRollbackRequestSequenceRef.current ||
      accessTokenRef.current !== accessToken ||
      signal.aborted
    ) {
      return createPrepareProjectRollbackPreviewFailure("aborted");
    }
    if (result.ok) {
      projectRollbackPreviewGuardRef.current = result.guard;
      return { ok: true, preview: result.preview };
    }
    projectRollbackPreviewGuardRef.current = null;
    return result;
  }

  async function prepareProjectRollbackExecutionReview(
    projectId: string,
    targetRevisionId: string,
  ): Promise<PrepareProjectRollbackExecutionReviewResult> {
    if (
      driveOperationInFlightRef.current ||
      projectPublishInFlightRef.current ||
      projectRollbackInFlightRef.current ||
      projectPublicationWriteInFlightRef.current
    ) {
      return {
        ok: false,
        category: "error",
        code: "rollbackAlreadyRunning",
        message: "公開またはロールバック処理の完了後にもう一度操作してください。",
      };
    }
    const accessToken = accessTokenRef.current;
    const workspace = workspaceReadyContext;
    const project = driveProjectReadyContext;
    const guard = projectRollbackPreviewGuardRef.current;
    if (
      !accessToken ||
      googleStatus !== "connected" ||
      driveFileGranted !== true ||
      driveStatus !== "ready" ||
      projectStatus !== "ready" ||
      !workspace ||
      !project ||
      project.projectId !== projectId ||
      !guard ||
      guard.owner.projectId !== projectId ||
      guard.owner.targetRevisionId !== targetRevisionId
    ) {
      discardPendingProjectRollback();
      return {
        ok: false,
        category: "stale",
        code: "stalePreview",
        message:
          "実行可能なロールバックの影響確認がありません。最新状態で影響確認をやり直してください。",
      };
    }

    pendingProjectRollbackRef.current = null;
    const requestSequence = guard.owner.requestSequence;
    const controller = new AbortController();
    projectRollbackAbortRef.current = controller;
    projectRollbackInFlightRef.current = true;
    setIsProjectRollbackInFlight(true);
    try {
      const result = await prepareProjectRollbackExecutionReviewInDrive({
        accessToken,
        workspaceId: workspace.workspaceId,
        projectsRootFolderId: workspace.projectsRootFolderId,
        indexJsonFileId: workspace.indexJsonFileId,
        project,
        targetRevisionId,
        requestSequence,
        guard,
        signal: controller.signal,
      });
      if (
        requestSequence !== projectRollbackRequestSequenceRef.current ||
        accessTokenRef.current !== accessToken
      ) {
        return {
          ok: false,
          category: "stale",
          code: "stalePreview",
          message:
            "対象が変更されました。最新状態でpreviewをやり直してください。",
        };
      }
      if (!result.ok) {
        projectRollbackPreviewGuardRef.current = null;
        pendingProjectRollbackRef.current = null;
        return result;
      }
      pendingProjectRollbackRef.current = {
        owner: {
          projectId,
          targetRevisionId,
          revisionId: result.review.revisionId,
          requestSequence,
        },
        plan: result.plan,
      };
      projectRollbackPreviewGuardRef.current = null;
      return { ok: true, review: result.review };
    } finally {
      if (requestSequence === projectRollbackRequestSequenceRef.current) {
        projectRollbackAbortRef.current = null;
        projectRollbackInFlightRef.current = false;
        setIsProjectRollbackInFlight(false);
      }
    }
  }

  async function commitPreparedProjectRollback(input: {
    projectId: string;
    targetRevisionId: string;
    revisionId: string;
  }): Promise<CommitPreparedProjectRollbackResult> {
    if (
      driveOperationInFlightRef.current ||
      projectPublishInFlightRef.current ||
      projectRollbackInFlightRef.current ||
      projectPublicationWriteInFlightRef.current
    ) {
      return buildProjectRollbackCommitFailure({
        code: "rollbackAlreadyRunning",
        message: "公開またはロールバック処理の完了を待ってください。",
        recoverability: "retryable",
      });
    }
    const pending = pendingProjectRollbackRef.current;
    if (
      !pending ||
      !pendingProjectRollbackOwnerMatches(pending.owner, input)
    ) {
      return buildProjectRollbackCommitFailure({
        code: "preparedReviewNotFound",
        message:
          "ロールバック実行前確認の内容を使用できません。影響確認からやり直してください。",
        recoverability: "conflict",
      });
    }
    const accessToken = accessTokenRef.current;
    const workspace = workspaceReadyContext;
    const project = driveProjectReadyContext;
    if (
      !accessToken ||
      googleStatus !== "connected" ||
      driveFileGranted !== true ||
      !workspace ||
      !project ||
      project.projectId !== input.projectId
    ) {
      pendingProjectRollbackRef.current = null;
      return buildProjectRollbackCommitFailure({
        code: "rollbackNotReady",
        message:
          "Google接続または選択中プロジェクトが変わりました。影響確認からやり直してください。",
        recoverability: "conflict",
      });
    }

    const locked = await runWithProjectPublicationWriteLock(
      { projectId: input.projectId },
      async (): Promise<CommitPreparedProjectRollbackResult> => {
        const requestSequence = pending.owner.requestSequence;
        const controller = new AbortController();
        projectRollbackAbortRef.current = controller;
        projectRollbackInFlightRef.current = true;
        projectPublicationWriteInFlightRef.current = true;
        setIsProjectRollbackInFlight(true);
        try {
          const workflow = await executePreparedProjectRollback({
            accessToken,
            projectsRootFolderId: workspace.projectsRootFolderId,
            project,
            plan: pending.plan,
            signal: controller.signal,
          });
          if (
            requestSequence !== projectRollbackRequestSequenceRef.current ||
            accessTokenRef.current !== accessToken
          ) {
            return buildProjectRollbackCommitFailure({
              code: "staleRollbackRequest",
              message:
                "ロールバックの反映状態を安全に確定できません。履歴と現在状態を確認してください。",
              recoverability: "requiresInspection",
            });
          }
          if (!workflow.ok) {
            if (workflow.recoverability !== "retryable") {
              pendingProjectRollbackRef.current = null;
            }
            return buildProjectRollbackCommitFailure(workflow);
          }

          pendingProjectRollbackRef.current = null;
          projectRollbackPreviewGuardRef.current = null;
          let refreshed = false;
          try {
            const refreshedProject = pending.plan.indexMirror.nextProject;
            const detailResult = await validateDriveProjectDetails({
              accessToken,
              expectedWorkspaceId: workspace.workspaceId,
              expectedProjectsRootFolderId: workspace.projectsRootFolderId,
              project: refreshedProject,
              signal: controller.signal,
            });
            if (
              requestSequence === projectRollbackRequestSequenceRef.current &&
              detailResult.status === "ready"
            ) {
              applyProjectReadyState(
                refreshedProject,
                toProjectDetails(detailResult.details),
                {
                  preserveProjectRollback: true,
                },
              );
              refreshed = true;
            }
          } catch {
            // Verified rollback remains successful when the UI refresh fails.
          }
          return {
            ok: true,
            result: buildSanitizedRollbackSuccess({ workflow, refreshed }),
          };
        } finally {
          if (requestSequence === projectRollbackRequestSequenceRef.current) {
            projectRollbackAbortRef.current = null;
            projectRollbackInFlightRef.current = false;
            projectPublicationWriteInFlightRef.current = false;
            setIsProjectRollbackInFlight(false);
          }
        }
      },
    );

    if (!locked.acquired) {
      return {
        ok: false,
        error: {
          code: PUBLICATION_WRITE_LOCKED_CODE,
          message: PUBLICATION_WRITE_LOCKED_MESSAGE,
          recoverability: "retryable",
          canRetry: false,
        },
      };
    }

    return locked.value;
  }

  function cancelPreparedProjectRollback() {
    discardPendingProjectRollback();
  }

  const value: AppContextValue = {
    googleStatus,
    googleStatusLabel: googleStatusLabels[googleStatus],
    googleMessage,
    driveFileGranted,
    driveStatus,
    driveStatusLabel: driveStatusLabels[driveStatus],
    driveMessage,
    driveCandidates,
    driveDiagnostics,
    isDriveOperationInFlight,
    projectStatus,
    projectStatusLabel: projectStatusLabels[projectStatus],
    projectMessage,
    driveProjects,
    selectedProjectId,
    selectedProjectSummary: projectSummary,
    selectedProjectDetails: projectDetails,
    projectSummary,
    projectDiagnostics,
    projectDetails,
    canImportAssets,
    assetImportStatus,
    assetImportStatusLabel: assetImportStatusLabels[assetImportStatus],
    assetImportMessage,
    assetImportDiagnostics,
    assetImportSelection,
    assetImportBatch,
    assetImportBatchSummary,
    remainingSlideSlots,
    assetImportMaxBatchCount,
    isAssetImportInFlight,
    canStartAssetImport,
    assetImportBlockedReason,
    captionUpdateSlideId,
    captionUpdateMessage,
    captionUpdateDiagnostics,
    durationUpdateSlideId,
    durationUpdateMessage,
    durationUpdateDiagnostics,
    slideReorderStatus,
    slideReorderMessage,
    slideReorderDiagnostics,
    isSlideReorderInFlight,
    slideReorderBlockedReason,
    slideEditStatus,
    slideEditMessage,
    slideEditDiagnostics,
    isSlideEditInFlight,
    isSlideDeleteInFlight,
    isSlideDuplicateInFlight,
    slideEditBlockedReason,
    assetCleanupPreviewStatus,
    assetCleanupPreviewMessage,
    assetCleanupPreviewDiagnostics,
    assetCleanupPreviewResult,
    isAssetCleanupPreviewInFlight,
    assetCleanupPreviewBlockedReason,
    assetCleanupDeletePreflightStatus,
    assetCleanupDeletePreflightMessage,
    assetCleanupDeletePreflightDiagnostics,
    assetCleanupDeletePreflightResult,
    isAssetCleanupDeletePreflightInFlight,
    assetCleanupDeletePreflightBlockedReason,
    assetCleanupDeleteStatus,
    assetCleanupDeleteMessage,
    assetCleanupDeleteDiagnostics,
    assetCleanupDeleteReview,
    assetCleanupDeleteResult,
    assetCleanupDeleteProgress,
    isAssetCleanupDeleteInFlight,
    assetCleanupDeleteBlockedReason,
    projectDeleteStatus,
    projectDeleteMessage,
    projectDeleteDiagnostics,
    projectDeleteReview,
    projectDeleteResult,
    projectDeleteLocalCopyStatus,
    isProjectDeleteInFlight,
    projectDeleteBlockedReason,
    prepareProjectDeletion,
    cancelProjectDeletion,
    confirmProjectDeletion,
    offlineSyncStatus,
    offlineSyncStatusLabel: offlineSyncStatusLabels[offlineSyncStatus],
    offlineSyncMessage,
    offlineSyncProgress,
    offlineSyncDiagnostics,
    offlineSyncLastResult,
    isOfflineSyncInFlight,
    canStartOfflineSync,
    offlineSyncBlockedReason,
    connectGoogle,
    resetGoogleAuthFlow,
    disconnectGoogle,
    checkDriveWorkspace,
    createWorkspace,
    checkProject,
    selectProject,
    listProjectPublishRevisionsForProject,
    loadProjectPublishRevisionForProject,
    loadProjectPublishHistoryOverviewForProject,
    prepareProjectRollbackPreview,
    prepareProjectRollbackExecutionReview,
    commitPreparedProjectRollback,
    cancelPreparedProjectRollback,
    prepareProjectPublishReview,
    commitPreparedProjectPublish,
    cancelPreparedProjectPublish,
    isProjectPublishInFlight,
    prepareGooglePhotosExportReview,
    commitPreparedGooglePhotosExport,
    cancelPreparedGooglePhotosExport,
    abortGooglePhotosExport,
    isGooglePhotosExportInFlight,
    googlePhotosExportProgress,
    googlePhotosExportResult,
    canResumeGooglePhotosExport,
    isProjectRollbackInFlight,
    createProject,
    updateSelectedProjectTitle,
    updateProjectSlideCaption,
    updateProjectSlideDuration,
    moveProjectSlide,
    reorderProjectSlidesByDrag,
    deleteProjectSlides,
    duplicateProjectSlide,
    previewUnusedProjectAssets,
    preflightUnusedAssetDeletion,
    clearAssetCleanupDeletePreflight,
    prepareUnusedAssetDeletion,
    confirmUnusedAssetDeletion,
    cancelUnusedAssetDeletion,
    startAssetImport,
    startLocalImageFileImport,
    startLocalVideoFileImport,
    cancelAssetImport,
    startOfflineSync,
    cancelOfflineSync,
    registerDriveVideoPlaybackSession,
    unregisterDriveVideoPlaybackSession,
    clearDriveVideoPlaybackSessions,
    fetchProjectSlidePreviewBlob,
  };

  return (
    <AppContext.Provider value={value}>
      {shouldLoadGoogleIdentityScript ? (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onReady={handleScriptReady}
          onError={() => {
            clearGoogleAuthTimeout();
            tokenRequestKindRef.current = null;
            accessTokenRef.current = null;
            setDriveFileGranted(null);
            setGoogleStatus("error");
            setGoogleMessage("Google認証ライブラリの読み込みに失敗しました。");
            abortDriveOperation();
            resetDriveState();
          }}
        />
      ) : null}
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const value = useContext(AppContext);

  if (!value) {
    throw new Error("useAppState must be used inside AppProviders.");
  }

  return value;
}

function getOfflineSyncStatusFromResult(
  result: DriveOfflineStagingSyncRuntimeResult,
): OfflineSyncStatus {
  switch (result.status) {
    case "ready":
      return "ready";

    case "stale":
    case "staleManifest":
      return "stale";

    case "syncRuntimeCancelled":
      return "cancelled";

    case "syncAlreadyInFlight":
    case "orchestrationPreconditionFailed":
      return "blocked";

    case "driveFetchOrStagingWriteFailed":
    case "promotionFailed":
    case "orchestrationUnexpectedFailure":
      return "failed";

    default:
      return assertNeverOfflineSyncResultStatus(result);
  }
}

function buildOfflineSyncResultMessage(
  result: DriveOfflineStagingSyncRuntimeResult,
): string {
  switch (result.status) {
    case "ready":
      return OFFLINE_SYNC_COMPLETED_MESSAGE;

    case "stale":
      return "より新しい同期処理が優先されたため、今回の結果は端末保存データへ反映していません。";

    case "staleManifest":
      return OFFLINE_SYNC_STALE_MANIFEST_MESSAGE;

    case "driveFetchOrStagingWriteFailed":
      return "Driveからの取得、または端末への一時保存に失敗しました。";

    case "promotionFailed":
      return "端末保存データの更新に失敗しました。以前の再生用データを維持しています。";

    case "orchestrationPreconditionFailed":
      return "ローカルへの保存の前提条件を満たしていません。";

    case "orchestrationUnexpectedFailure":
      return "ローカルへの保存中に予期しない失敗が発生しました。";

    case "syncAlreadyInFlight":
      return "ローカルへの保存はすでに実行中です。";

    case "syncRuntimeCancelled":
      return OFFLINE_SYNC_CANCELLED_MESSAGE;

    default:
      return assertNeverOfflineSyncResultStatus(result);
  }
}

function buildOfflineSyncResultDiagnostics(
  result: DriveOfflineStagingSyncRuntimeResult,
): string[] {
  switch (result.status) {
    case "ready":
      return [
        `アルバム設定内のスライド: ${result.manifestSlideCount}`,
        `画像の保存対象: ${result.imageSyncCandidateCount}`,
        `動画の保存対象: ${result.videoSyncCandidateCount}`,
        `動画本体の保存済み件数: ${result.videoSyncedCount}`,
        `動画本体の未保存件数: ${result.videoSkippedCount}`,
        `オンライン再生のみの動画: ${result.videoTooLargeSkippedCount}`,
        `未対応素材: ${result.unsupportedAssetCount}`,
        `保存対象スライド: ${result.offlineStagingSlideCount}`,
        `保存したスライド: ${result.slideCount}`,
        `保存した素材: ${result.assetCount}`,
        `一時保存したプロジェクト: ${result.stagingWrite.writtenProjects}`,
        `一時保存した素材情報: ${result.stagingWrite.writtenAssets}`,
        `一時保存した素材本体: ${result.stagingWrite.writtenAssetBlobs}`,
        `更新したプロジェクト: ${result.promotion.promotedProjects}`,
        `更新した素材情報: ${result.promotion.promotedAssets}`,
        `更新した素材本体: ${result.promotion.promotedAssetBlobs}`,
        "大容量動画は本体を保存しませんが、オンライン再生用の情報をローカルに残し、オンライン時はGoogle Driveから再生します。",
        "本体が未保存でも、Google Driveからの削除や保存失敗を意味しません。MP4/MOV以外の動画形式は未対応です。",
        result.publicationProvenance.message,
      ];

    case "stale":
      return [
        "より新しい同期処理が優先されたため、今回の結果は反映しませんでした。",
      ];

    case "staleManifest":
      return [
        "Drive上の内容が同期中に変更されたため、今回の結果は端末へ反映していません。",
      ];

    case "driveFetchOrStagingWriteFailed":
      return ["Driveからの取得または端末への一時保存に失敗しました。"];

    case "promotionFailed":
      return ["確認済みデータへの切り替えに失敗しました。以前の再生用データを維持しています。"];

    case "orchestrationPreconditionFailed":
      return ["ローカルへの保存の前提条件を確認してください。"];

    case "orchestrationUnexpectedFailure":
      return ["ローカルへの保存中に予期しない失敗が発生しました。"];

    case "syncAlreadyInFlight":
      return ["ローカルへの保存はすでに実行中です。"];

    case "syncRuntimeCancelled":
      return [OFFLINE_SYNC_CANCELLED_MESSAGE];

    default:
      return assertNeverOfflineSyncResultStatus(result);
  }
}

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sanitizeOfflineSyncDiagnostics(diagnostics: string[]): string[] {
  return diagnostics.map((diagnostic) =>
    truncateOfflineSyncDiagnostic(
      sanitizeUserFacingDiagnostic(diagnostic),
      OFFLINE_SYNC_DIAGNOSTIC_MAX_LENGTH,
    ),
  );
}

function truncateOfflineSyncDiagnostic(
  value: string,
  maxLength: number,
): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function assertNeverOfflineSyncResultStatus(value: never): never {
  throw new Error(`Unexpected offline sync result: ${JSON.stringify(value)}`);
}

async function runDriveWorkspaceCheck(
  accessToken: string,
  signal: AbortSignal,
): Promise<DriveWorkspaceCheckResult> {
  try {
    const candidates = await findWorkspaceRootCandidates(accessToken, signal);
    const summaries = candidates.map(toCandidateSummary);

    if (candidates.length === 0) {
      return {
        status: "notCreated",
        message:
          "Driveワークスペース候補は見つかりませんでした。必要に応じてDriveワークスペースを作成できます。",
        candidates: [],
        diagnostics: [],
      };
    }

    if (candidates.length >= 2) {
      return {
        status: "multipleCandidates",
        message:
          "Driveの保存領域が2件以上あります。この画面では自動選択・削除・修復は行いません。",
        candidates: summaries,
        diagnostics: [
          "Driveワークスペースroot候補が2件以上見つかりました。",
        ],
      };
    }

    const childCandidates = await findWorkspaceChildCandidates(
      accessToken,
      candidates[0].id,
      signal,
    );

    const metadataResult = validateWorkspaceMetadata(
      candidates[0],
      childCandidates,
    );

    if (metadataResult.status === "invalidWorkspace") {
      return {
        status: "invalidWorkspace",
        message:
          "Driveの保存領域の情報に問題があります。自動修復は行いません。",
        candidates: summaries,
        diagnostics: metadataResult.diagnostics,
      };
    }

    const [workspaceJsonText, indexJsonText] = await Promise.all([
      readDriveTextFile(
        accessToken,
        metadataResult.workspaceJsonFileId,
        signal,
      ),
      readDriveTextFile(accessToken, metadataResult.indexJsonFileId, signal),
    ]);

    const jsonBodyResult = validateWorkspaceJsonBodies({
      expectedWorkspaceId: metadataResult.workspaceId,
      workspaceJsonText,
      indexJsonText,
    });

    const diagnostics = [
      ...metadataResult.diagnostics,
      ...jsonBodyResult.diagnostics,
    ];

    if (jsonBodyResult.status === "invalidWorkspace") {
      return {
        status: "invalidWorkspace",
        message:
          "Driveの保存領域の設定に問題があります。この画面では自動修復は行いません。",
        candidates: summaries,
        diagnostics,
      };
    }

    if (jsonBodyResult.status === "unsupportedVersion") {
      return {
        status: "unsupportedVersion",
        message:
          "Driveの保存領域は、このPWAで対応していない保存形式です。",
        candidates: summaries,
        diagnostics,
      };
    }

    return {
      status: "ready",
      message:
        "Driveの保存領域を利用できます。設定内容の整合性を確認しました。",
      candidates: summaries,
      diagnostics,
      readyContext: {
        workspaceId: metadataResult.workspaceId,
        workspaceRootFolderId: metadataResult.workspaceRootFolderId,
        workspaceJsonFileId: metadataResult.workspaceJsonFileId,
        indexJsonFileId: metadataResult.indexJsonFileId,
        projectsRootFolderId: metadataResult.projectsRootFolderId,
        indexJsonText,
      },
    };
  } catch (error) {
    if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
      return {
        status: "authRequired",
        message:
          "Google再接続が必要です。再接続後にDrive状態を確認してください。",
        candidates: [],
        diagnostics: [],
      };
    }

    return {
      status: "operationFailed",
      message:
        "Drive状態確認に失敗しました。通信状態を確認して、もう一度Drive状態を確認してください。",
      candidates: [],
      diagnostics: [],
    };
  }
}

function toCandidateSummary(
  candidate: DriveWorkspaceRootCandidate,
): DriveCandidateSummary {
  return {
    name: candidate.name,
    createdTime: candidate.createdTime ?? "未取得",
    modifiedTime: candidate.modifiedTime ?? "未取得",
    workspaceIdPart: formatIdPart(candidate.appProperties.workspaceId),
  };
}

function toProjectSummary(
  project: DriveProjectSummary,
  details?: ProjectDetails,
): ProjectSummary {
  return {
    projectId: project.projectId,
    projectIdPart: formatIdPart(project.projectId),
    title: project.title,
    manifestPath: project.manifestPath,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    slideCount: details?.slideCount ?? null,
    assetCount: details?.assetCount ?? null,
    ...nullableProjectMediaCounts(countProjectMedia(details?.slides)),
  };
}

function buildEmptyProjectDetails(): ProjectDetails {
  return {
    slideCount: 0,
    assetCount: 0,
    slides: [],
  };
}

function normalizeProjectTitleInput(value: string) {
  return value.trim();
}

function validateProjectTitleInput(title: string) {
  const diagnostics: string[] = [];

  if (title.length === 0) {
    diagnostics.push("プロジェクト名を入力してください。");
    return diagnostics;
  }

  if ([...title].length > DRIVE_PROJECT_TITLE_MAX_LENGTH) {
    diagnostics.push(
      `プロジェクト名は ${DRIVE_PROJECT_TITLE_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }

  return diagnostics;
}

function toProjectDetails(details: DriveProjectReadyDetails): ProjectDetails {
  return {
    slideCount: details.slideCount,
    assetCount: details.assetCount,
    slides: details.slides.map((slide) => ({
      slideId: slide.slideId,
      slideIdPart: formatIdPart(slide.slideId),
      assetId: slide.assetId,
      assetIdPart: formatIdPart(slide.assetId),
      assetFileId: slide.assetFileId,
      assetName: slide.assetName,
      ...(slide.type ? { type: slide.type } : {}),
      mimeType: slide.mimeType,
      sourceMimeType: slide.sourceMimeType,
      sourceCreateTime: slide.sourceCreateTime ?? null,
      ...(typeof slide.fileSize === "number" ? { fileSize: slide.fileSize } : {}),
      ...(typeof slide.durationMs === "number"
        ? { durationMs: slide.durationMs }
        : {}),
      ...(slide.unsupportedReason
        ? { unsupportedReason: slide.unsupportedReason }
        : {}),
      durationSeconds: slide.durationSeconds,
      caption: slide.caption,
      verified: true,
    })),
  };
}

function formatIdPart(id: string | undefined) {
  if (!id) {
    return "未設定";
  }

  return `${id.slice(0, 8)}...`;
}

function buildProjectCreateDriveRecheckDiagnostics() {
  return [
    "プロジェクト作成中に、App内のDrive確認済み情報が古くなった可能性があります。",
    "Drive状態を再確認すると、プロジェクト一覧の最新状態を読み直します。",
  ];
}

function buildProjectCreateFailureDiagnostics(error: DriveProjectCreateError) {
  const diagnostics = [...error.diagnostics];

  if (error.projectId) {
    diagnostics.push("作成対象のプロジェクトが一部作成された可能性があります。");
  }

  if (error.possibleChangedItems.length > 0) {
    diagnostics.push(
      "この作成処理中に、一部のDrive項目が作成・更新された可能性があります。",
      ...error.possibleChangedItems.map(toProjectChangedItemDiagnostic),
    );
  } else {
    diagnostics.push(
      "この作成処理中にDrive項目が作成・更新された可能性は高くありません。",
    );
  }

  diagnostics.push(
    "自動削除・自動修復は行いません。",
    "Google Driveを確認し、必要なら手動で削除してください。",
    "確認後、この画面で「Drive状態を再確認」を押してください。",
  );

  return dedupeDiagnostics(diagnostics);
}

function buildUnknownProjectCreateFailureDiagnostics() {
  return [
    "プロジェクト作成中に予期しないエラーが発生しました。",
    "Drive上に項目が作成・更新されたかは、この画面だけでは判断できません。",
    "自動削除・自動修復は行いません。",
    "Google Driveを確認し、必要なら手動で削除してください。",
    "確認後、この画面で「Drive状態を再確認」を押してください。",
  ];
}

function toProjectChangedItemDiagnostic(item: DriveProjectChangedItem) {
  return `変更済みの可能性: ${projectChangedItemRoleLabels[item.role]}: ${formatProjectChangedItemName(item)}`;
}

function formatProjectChangedItemName(item: DriveProjectChangedItem) {
  if (item.role === "projectRoot") {
    return formatIdPart(item.name);
  }

  return item.name;
}

function dedupeDiagnostics(diagnostics: string[]) {
  return [...new Set(diagnostics)];
}

function tokenResponseIncludesPhotosPickerScope(
  tokenResponse: GoogleTokenResponse,
) {
  return (
    typeof tokenResponse.scope === "string" &&
    tokenResponse.scope
      .split(/\s+/)
      .includes("https://www.googleapis.com/auth/photospicker.mediaitems.readonly")
  );
}

function summarizeAssetImportBatch(
  batch: AssetImportBatchItem[],
): AssetImportBatchSummary {
  return {
    selectedCount: batch.length,
    savedCount: batch.filter(
      (item) =>
        item.status === "savedToDrive" || item.status === "manifestUpdated",
    ).length,
    manifestUpdatedCount: batch.filter(
      (item) => item.status === "manifestUpdated",
    ).length,
    failedCount: batch.filter((item) => item.status === "failed").length,
    skippedCount: batch.filter((item) => item.status === "skipped").length,
  };
}

function buildAssetImportBatchItem(
  mediaItem: PhotosPickedMediaItem,
): AssetImportBatchItem {
  return {
    clientItemId: crypto.randomUUID(),
    mediaItemIdPart: formatIdPart(mediaItem.id),
    filename: mediaItem.mediaFile.filename ?? "未取得",
    sourceMimeType: mediaItem.mediaFile.mimeType,
    sourceCreateTime: mediaItem.createTime,
    status: "selected",
  };
}

function resolveLocalVideoFileMimeType(
  file: File,
): SupportedDriveVideoMimeType | null {
  return resolveLocalDriveVideoMimeType({
    name: file.name,
    type: file.type,
  });
}

function resolveLocalImageFileMimeTypeFromFile(
  file: File,
): SupportedDriveImageMimeType | null {
  return resolveLocalImageFileMimeType({
    name: file.name,
    type: file.type,
  });
}

function validateLocalImageFile(item: LocalImageAssetImportItem) {
  return getLocalDriveImageFileValidationCodes({
    size: item.file.size,
    mimeType: item.mimeType,
  }).map((code) => {
    switch (code) {
      case "unsupportedMimeType":
        return "JPEG、PNG、またはWebPの写真のみ追加できます。";
      case "emptyFile":
        return "0 byteの写真ファイルは追加できません。";
      case "fileTooLarge":
        return "photo は10MB以下のみ追加できます。";
    }
  });
}

function validateLocalVideoFile(item: LocalVideoAssetImportItem) {
  return getLocalDriveVideoFileValidationCodes({
    size: item.file.size,
    mimeType: item.mimeType,
  }).map((code) => {
    switch (code) {
      case "unsupportedMimeType":
        return "video/mp4またはMOVファイルのみ追加できます。";
      case "emptyFile":
        return "0 byteの動画ファイルは追加できません。";
      case "fileTooLarge":
        return "動画ファイルは5GB以下にしてください。";
    }
  });
}

function buildDriveVideoOfflineScopeDiagnostics(input: {
  mimeType: string;
  sizeBytes: number;
}) {
  const diagnostics: string[] = [];
  const disposition = getDriveVideoStorageDisposition(input);

  if (disposition === "remoteOnly") {
    diagnostics.push(
      "offline保存: 対象外",
      "理由: MP4/MOVはoffline保存上限を超えるとremoteOnlyとして保持されます。",
    );
  } else if (disposition === "offlineEligible") {
    diagnostics.push("ローカルへの保存: MP4/MOVは上限以下の場合に保存対象です。");
  }

  return diagnostics;
}

function sanitizeLocalFileNameForDisplay(
  fileName: string,
  fallbackFileName = "untitled.mp4",
) {
  const sanitized = fileName
    .trim()
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "");

  if (!sanitized) {
    return fallbackFileName;
  }

  return sanitized.slice(0, 160);
}

function getAssetImportItemErrorMessage(error: unknown) {
  if (error instanceof PhotosPickerSelectionError) {
    return error.message === PHOTOS_PICKER_PHOTO_ONLY_MESSAGE
      ? PHOTOS_PICKER_PHOTO_ONLY_MESSAGE
      : getUserFacingOperationFailureMessage("assetImport", error);
  }

  if (error instanceof PhotosPickerApiError) {
    return `Photos API error: ${error.operation}`;
  }

  if (error instanceof DriveProjectAssetSaveError) {
    return error.possibleCreatedAsset
      ? "Drive保存結果の確認に失敗しました。"
      : "Drive保存に失敗しました。";
  }

  if (error instanceof Error) {
    return getUserFacingOperationFailureMessage("assetImport", error);
  }

  return "処理に失敗しました。";
}

function getAssetImportItemFailureDiagnostics(error: unknown) {
  if (
    error instanceof PhotosPickerSelectionError ||
    error instanceof PhotosPickerApiError
  ) {
    return error.diagnostics;
  }

  if (error instanceof DriveProjectAssetSaveError) {
    return buildAssetImportDriveSaveFailureDiagnostics(error);
  }

  return [];
}

function buildAssetImportDriveSaveFailureDiagnostics(
  error: DriveProjectAssetSaveError,
) {
  const diagnostics = [...error.diagnostics];

  if (error.possibleCreatedAsset) {
    diagnostics.push(
      "Drive上に素材が作成済みの可能性があります。Drive状態を再確認してください。",
    );
  }

  return dedupeDiagnostics(diagnostics);
}

function buildAssetImportManifestAppendFailureDiagnostics(
  error: DriveProjectManifestAppendError,
) {
  const diagnostics = [
    ...error.diagnostics,
    "Drive保存済みの素材をプロジェクトへ反映できませんでした。",
  ];

  if (error.possibleChangedItems.length > 0) {
    diagnostics.push(
      "プロジェクトへの反映中にDrive上の項目が更新された可能性があります。",
      ...error.possibleChangedItems.map(toProjectChangedItemDiagnostic),
    );
  }

  diagnostics.push("Drive状態を再確認してください。");

  return dedupeDiagnostics(diagnostics);
}

function buildAssetImportManifestBatchAppendFailureDiagnostics(
  error: DriveProjectManifestBatchAppendError,
) {
  const diagnostics = [
    ...error.diagnostics,
    `プロジェクト反映対象の素材数: ${error.savedAssets.length}`,
  ];

  if (error.possibleChangedItems.length > 0) {
    diagnostics.push(
      "プロジェクトへの一括反映中にDrive上の項目が更新された可能性があります。",
      ...error.possibleChangedItems.map(toProjectChangedItemDiagnostic),
    );
  }

  diagnostics.push(
    "Drive保存済みですが、プロジェクトへ未反映の素材が残っている可能性があります。",
    "Drive状態を再確認してください。",
  );

  return dedupeDiagnostics(diagnostics);
}

type PhotosPickerWaitResult = {
  diagnostics: string[];
};

type PhotosPickerCleanupResult = {
  diagnostics: string[];
};

type DriveVideoPlaybackSessionMessage =
  | {
      type: "REGISTER_DRIVE_VIDEO_SESSION";
      payload: {
        sessionId: string;
        assetFileId: string;
        accessToken: string;
        mimeType: SupportedDriveVideoMimeType;
        fileSize: number;
        expiresAt: number;
      };
    }
  | {
      type: "UNREGISTER_DRIVE_VIDEO_SESSION";
      payload: {
        sessionId: string;
      };
    }
  | {
      type: "CLEAR_DRIVE_VIDEO_SESSIONS";
    };

function postDriveVideoPlaybackSessionMessage(
  targetWorker: ServiceWorker,
  message: DriveVideoPlaybackSessionMessage,
): Promise<{ ok: boolean }> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeoutId = setTimeout(() => {
      channel.port1.close();
      reject(new Error("Drive video playback session message timed out."));
    }, 3_000);

    channel.port1.onmessage = (event) => {
      clearTimeout(timeoutId);
      channel.port1.close();
      const data = event.data as { ok?: unknown } | null;
      resolve({ ok: data?.ok === true });
    };

    try {
      targetWorker.postMessage(message, [channel.port2]);
    } catch (error) {
      clearTimeout(timeoutId);
      channel.port1.close();
      reject(error);
    }
  });
}

export function abortableSleep(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      signal.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function waitForPhotosPickerSelection(input: {
  accessToken: string;
  session: PhotosPickerCreatedSession;
  signal: AbortSignal;
  onSnapshot?: (snapshot: PhotosPickerSessionSnapshot) => void;
}): Promise<PhotosPickerWaitResult> {
  const startedAtMs = Date.now();
  const diagnostics = [...input.session.diagnostics];
  let pollingTiming = input.session.pollingTiming;

  if (input.session.mediaItemsSet) {
    return { diagnostics };
  }

  while (true) {
    throwIfAborted(input.signal);

    const elapsedSeconds = (Date.now() - startedAtMs) / 1000;
    const remainingAppWaitSeconds =
      PHOTOS_PICKER_MAX_APP_WAIT_SECONDS - elapsedSeconds;

    if (remainingAppWaitSeconds <= 0) {
      throw new PhotosPickerSelectionError({
        status: "cancelled",
        message: "Photos Picker polling reached the app timeout.",
        diagnostics: [
          "Photos Pickerの選択待ちが30分でタイムアウトしました。",
          "Drive保存: 未実行",
          "プロジェクト反映: 未実行",
        ],
      });
    }

    if (pollingTiming.timeoutInSeconds <= 0) {
      throw new PhotosPickerSelectionError({
        status: "cancelled",
        message: "Photos Picker polling reached the session timeout.",
        diagnostics: [
          "Photos Pickerの選択待ちがタイムアウトしました。",
          "Drive保存: 未実行",
          "プロジェクト反映: 未実行",
        ],
      });
    }

    await abortableSleep(
      resolvePhotosPickerPollingDelayMs(
        pollingTiming,
        remainingAppWaitSeconds,
      ),
      input.signal,
    );

    const snapshot = await getPhotosPickerSession(
      input.accessToken,
      input.session.id,
      input.signal,
    );

    input.onSnapshot?.(snapshot);
    diagnostics.push(...snapshot.diagnostics);

    if (snapshot.mediaItemsSet) {
      return { diagnostics };
    }

    pollingTiming = snapshot.pollingTiming;
  }
}

export async function cleanupPhotosPickerSessionOnce(input: {
  accessToken: string;
  sessionId: string;
}): Promise<PhotosPickerCleanupResult> {
  const cleanupController = new AbortController();
  const timeoutId = setTimeout(() => {
    cleanupController.abort();
  }, PHOTOS_PICKER_CLEANUP_TIMEOUT_MS);

  try {
    await deletePhotosPickerSession(
      input.accessToken,
      input.sessionId,
      cleanupController.signal,
    );

    return {
      diagnostics: ["Photos Picker session cleanup: 完了"],
    };
  } catch {
    return {
      diagnostics: ["Photos Picker session cleanup failed."],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function resolvePhotosPickerPollingDelayMs(
  pollingTiming: PhotosPickerResolvedPollingTiming,
  remainingAppWaitSeconds: number,
) {
  const delaySeconds = Math.min(
    pollingTiming.pollIntervalSeconds,
    pollingTiming.timeoutInSeconds,
    remainingAppWaitSeconds,
  );

  return Math.max(1, Math.ceil(delaySeconds * 1000));
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function createAbortError() {
  return new DOMException("Operation was aborted.", "AbortError");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function sanitizeAssetImportDiagnostics(diagnostics: string[]) {
  return dedupeDiagnostics(
    diagnostics
      .map((diagnostic) => diagnostic.trim())
      .filter((diagnostic) => diagnostic.length > 0)
      .filter(isSafeAssetImportDiagnostic)
      .map(sanitizeUserFacingDiagnostic)
      .map(truncateAssetImportDiagnostic),
  );
}

function sanitizeAssetCleanupPreviewDiagnostics(diagnostics: string[]) {
  return dedupeDiagnostics(
    diagnostics
      .map((diagnostic) => diagnostic.trim())
      .filter((diagnostic) => diagnostic.length > 0)
      .filter(isSafeAssetImportDiagnostic)
      .map(sanitizeUserFacingDiagnostic)
      .map(truncateAssetCleanupPreviewDiagnostic),
  );
}

function getAssetCleanupDeletePreparationFailureMessage(
  reason:
    | "preflightMissing"
    | "selectionChanged"
    | "ownerChanged"
    | "eligibleAssetRequired"
    | "blockedAssetPresent",
) {
  switch (reason) {
    case "preflightMissing":
      return "削除前確認を実行し直してください。";
    case "selectionChanged":
      return "選択内容が削除前確認時から変わりました。削除前確認を実行し直してください。";
    case "ownerChanged":
      return "選択中のDrive保存領域またはプロジェクトが変わりました。削除候補から確認し直してください。";
    case "eligibleAssetRequired":
      return "削除可能な未使用素材がありません。";
    case "blockedAssetPresent":
      return "安全確認で停止した素材が含まれるため削除できません。";
  }
}

function getAssetCleanupDeleteResultMessage(
  status: DriveProjectUnusedAssetDeleteResult["status"],
) {
  switch (status) {
    case "completed":
      return "未使用素材の削除が完了しました";
    case "partialFailure":
      return "一部の未使用素材だけ削除されました";
    case "blocked":
      return "削除直前の再検証で停止しました";
    case "failed":
      return "未使用素材の削除に失敗しました";
  }
}

function buildAssetCleanupDeleteResultDiagnostics(
  result: DriveProjectUnusedAssetDeleteResult,
) {
  const diagnostics = [
    `削除依頼: ${result.requestedCount}件`,
    `削除済み: ${result.deletedCount}件`,
    `失敗: ${result.failedCount}件`,
    `安全確認で停止: ${result.blockedCount}件`,
    `未実行: ${result.notAttemptedCount}件`,
    "自動再試行は行いません。",
  ];

  if (result.status === "partialFailure") {
    diagnostics.push(
      "Drive上に一部削除済みの状態が残っています。",
      "未使用素材の削除候補を再読込してから、次の操作を手動で行ってください。",
    );
  }

  return diagnostics;
}

function isSafeAssetImportDiagnostic(diagnostic: string) {
  if (
    unsafeAssetImportDiagnosticPatterns.some((pattern) =>
      pattern.test(diagnostic),
    )
  ) {
    return false;
  }

  if (/^[A-Za-z0-9_-]{24,}$/.test(diagnostic)) {
    return false;
  }

  return true;
}

function truncateAssetImportDiagnostic(diagnostic: string) {
  if (diagnostic.length <= ASSET_IMPORT_DIAGNOSTIC_MAX_LENGTH) {
    return diagnostic;
  }

  return `${diagnostic.slice(0, ASSET_IMPORT_DIAGNOSTIC_MAX_LENGTH)}...`;
}

function truncateAssetCleanupPreviewDiagnostic(diagnostic: string) {
  if (diagnostic.length <= ASSET_CLEANUP_PREVIEW_DIAGNOSTIC_MAX_LENGTH) {
    return diagnostic;
  }

  return `${diagnostic.slice(0, ASSET_CLEANUP_PREVIEW_DIAGNOSTIC_MAX_LENGTH)}...`;
}

function buildWorkspaceCreateFailureDiagnostics(
  possibleCreatedRoles: DriveCreatedWorkspaceItemRole[],
) {
  const diagnostics = [
    "Driveワークスペース作成に失敗しました。",
  ];

  if (possibleCreatedRoles.length > 0) {
    diagnostics.push(
      "この作成処理中に、一部のDrive項目が作成された可能性があります。",
      ...possibleCreatedRoles.map(
        (role) => `作成済みの可能性: ${createdRoleLabels[role]}`,
      ),
      "対応: Google Driveで「iPad Slideshow PWA Workspace」を確認してください。",
      "不要な場合は、そのフォルダごと手動で削除してください。",
      "削除後、この画面で「Drive状態を再確認」を押してください。",
    );
    return diagnostics;
  }

  diagnostics.push(
    "Drive上に項目が作成された可能性は高くありません。",
    "通信状態を確認してから、この画面で「Drive状態を再確認」を押してください。",
  );

  return diagnostics;
}

function buildPostCreateNotReadyDiagnostics(result: DriveWorkspaceCheckResult) {
  return [
    "Driveの保存領域を作成しましたが、作成後の確認を完了できませんでした。",
    ...result.diagnostics,
    "Google Driveで「iPad Slideshow PWA Workspace」を確認してください。",
    "不要な場合は、そのフォルダごと手動で削除してください。",
    "削除後、この画面で「Drive状態を再確認」を押してください。",
  ];
}

function isDrivePreviewMimeType(
  value: ProjectSlideSummary["mimeType"],
): value is "image/jpeg" | "image/png" | "image/webp" {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

async function findWorkspaceChildCandidates(
  accessToken: string,
  rootFolderId: string,
  signal: AbortSignal,
) {
  const [workspace, index, projectsRoot] = await Promise.all(
    childRoles.map((role) =>
      findWorkspaceChildCandidatesByRole(
        accessToken,
        rootFolderId,
        role,
        signal,
      ),
    ),
  );

  return {
    workspace,
    index,
    projectsRoot,
  };
}
