"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
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
import {
  DRIVE_PROJECT_TITLE_MAX_LENGTH,
  DriveApiError,
  DriveProjectAssetSaveError,
  DriveProjectCreateError,
  DriveProjectManifestBatchAppendError,
  DriveProjectManifestAppendError,
  DriveProjectSlideCaptionUpdateError,
  DriveProjectSlideDeleteError,
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
  readDriveTextFile,
  reorderDriveProjectSlides,
  saveDriveProjectAsset,
  updateDriveProjectTitle,
  updateDriveProjectSlideCaption,
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
  type DriveProjectUnusedAssetDeletePreflightResult,
  type DriveProjectUnusedAssetPreviewResult,
  type DriveWorkspaceChildRole,
  type DriveWorkspaceReadyContext,
  type DriveWorkspaceRootCandidate,
} from "@/lib/google-drive";
import {
  PHOTOS_PICKER_MAX_APP_WAIT_SECONDS,
  createPhotosPickerSession,
  deletePhotosPickerSession,
  extractPickedMediaItems,
  fetchAndValidatePickedPhoto,
  getPhotosPickerSession,
  listPickedMediaItems,
  normalizePickedMediaItem,
  PhotosPickerApiError,
  PhotosPickerSelectionError,
  type PhotosPickedMediaItem,
  type PhotosPickerCreatedSession,
  type PhotosPickerResolvedPollingTiming,
  type PhotosPickerSessionSnapshot,
} from "@/lib/google-photos-picker";
import {
  createDriveOfflineStagingSyncRuntime,
  type DriveOfflineStagingSyncRuntime,
  type DriveOfflineStagingSyncRuntimeResult,
} from "@/lib/drive-offline-staging-sync-runtime";

const DRIVE_OPERATION_TIMEOUT_MS = 15_000;
const GOOGLE_DRIVE_TOKEN_REQUEST_TIMEOUT_MS = 45_000;
const ASSET_IMPORT_MAX_SLIDE_COUNT = 50;
const ASSET_IMPORT_MAX_BATCH_COUNT = 10;
const PHOTOS_TOKEN_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
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
  slideCount: number;
  assetCount: number;
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
  sourceCreateTime: string;
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
  downloadedContentType?: "image/jpeg" | "image/png" | "image/webp";
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
  mediaItemType: "PHOTO";
  filename: string;
  sourceMimeType: string;
  sourceCreateTime: string | null;
  downloadedContentType: "image/jpeg" | "image/png" | "image/webp";
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
  driveMimeType: "image/jpeg" | "image/png" | "image/webp";
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

type TokenRequestKind = "drive" | "photos" | null;

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
  "workspace root folder を作成しています。",
  "workspace.json を作成しています。",
  "index.json を作成しています。",
  "projects/ folder を作成しています。",
];

const projectCreateStepMessages = [
  "作成前に index.json を再確認しています。",
  "project folder を作成しています。",
  "manifest.json を作成しています。",
  "assets/ folder を作成しています。",
  "index.json 更新直前に競合を確認しています。",
  "index.json の更新内容を作成しています。",
  "index.json を更新しています。",
  "更新後の index.json を再確認しています。",
  "作成したproject詳細を検証しています。",
];

const createdRoleLabels: Record<DriveCreatedWorkspaceItemRole, string> = {
  workspaceRoot: "workspace root folder",
  workspace: "workspace.json",
  index: "index.json",
  projectsRoot: "projects/ folder",
};

const projectChangedItemRoleLabels: Record<DriveProjectChangedItemRole, string> =
  {
    projectRoot: "project folder",
    projectManifest: "manifest.json",
    assetsRoot: "assets/ folder",
    index: "index.json",
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

  offlineSyncStatus: OfflineSyncStatus;
  offlineSyncStatusLabel: string;
  offlineSyncMessage: string;
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
  createProject: (title: string) => void;
  updateSelectedProjectTitle: (title: string) => void;
  updateProjectSlideCaption: (slideId: string, caption: string) => void;
  moveProjectSlide: (slideId: string, direction: "up" | "down") => Promise<boolean>;
  reorderProjectSlidesByDrag: (orderedSlideIds: string[]) => Promise<boolean>;
  deleteProjectSlides: (slideIds: string[]) => Promise<boolean>;
  duplicateProjectSlide: (slideId: string) => Promise<boolean>;
  previewUnusedProjectAssets: () => void;
  preflightUnusedAssetDeletion: (assetFileIds: string[]) => Promise<void>;
  clearAssetCleanupDeletePreflight: () => void;
  startAssetImport: () => void;
  cancelAssetImport: () => void;
  startOfflineSync: () => void;
  cancelOfflineSync: () => void;
  fetchProjectSlidePreviewBlob: (
    assetFileId: string,
    expectedMimeType: ProjectSlideSummary["mimeType"],
    signal: AbortSignal,
  ) => Promise<Blob>;
};

const googleStatusLabels: Record<GoogleConnectionStatus, string> = {
  scriptLoading: "Google認証の準備中",
  notConnected: "Google未接続",
  missingClientId: "Google Client ID未設定",
  connecting: "Google接続中",
  connected: "Google接続済み",
  scopeMissing: "drive.file の許可不足",
  error: "Google認証エラー",
};

const driveStatusLabels: Record<DriveWorkspaceStatus, string> = {
  unchecked: "このセッションではDrive未確認",
  checking: "Drive確認中",
  creating: "Driveワークスペース作成中",
  notCreated: "Driveワークスペース未作成",
  ready: "Driveワークスペース準備済み",
  multipleCandidates: "Driveワークスペース候補が複数あり要確認",
  invalidWorkspace: "Driveワークスペース構造に問題あり",
  unsupportedVersion: "schemaVersion非対応",
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
  requestingPhotosPermission: "Photos権限確認中",
  openingPicker: "Photos Picker起動中",
  waitingForSelection: "写真選択待ち",
  downloadingFromPhotos: "Photosから取得中",
  selected: "写真選択・検証済み",
  uploadingToDrive: "Drive保存中",
  savedToDrive: "Drive保存済み",
  updatingManifest: "manifest更新中",
  verifying: "素材追加結果確認中",
  completed: "素材追加完了",
  cancelled: "素材追加キャンセル",
  invalid: "素材追加条件に問題あり",
  error: "素材追加失敗",
};

const offlineSyncStatusLabels: Record<OfflineSyncStatus, string> = {
  idle: "offline sync 待機中",
  syncing: "offline sync 実行中",
  ready: "offline sync 完了",
  stale: "offline sync stale",
  failed: "offline sync 失敗",
  cancelled: "offline sync 中止",
  blocked: "offline sync 開始不可",
};

const initialDriveMessage =
  "このセッションでは、まだDriveワークスペース確認を実行していません。";

const initialProjectMessage =
  "Driveワークスペース ready 後にプロジェクト状態を確認します。";

const initialAssetImportMessage =
  "Drive project ready 後に素材追加の準備状態を確認できます。";

const initialOfflineSyncMessage =
  "Drive project ready 後に offline sync を実行できます。";

const initialSlideReorderMessage =
  "Drive project ready 後に画像の順番を変更できます。";

const initialSlideEditMessage =
  "Drive project ready 後に画像順変更、slide削除、slide複製を実行できます。";

const initialAssetCleanupPreviewMessage =
  "Drive project ready 後に未使用asset cleanup previewを実行できます。";

const initialAssetCleanupDeletePreflightMessage =
  "未使用assetを選択すると削除前preflightを実行できます。";

const AppContext = createContext<AppContextValue | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const clientId = getGoogleClientId();
  const hasClientId = hasGoogleClientId();
  const shouldLoadGoogleIdentityScript =
    hasClientId && !pathname.startsWith("/visual-check");

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

  const pendingPhotosTokenRequestRef =
    useRef<PendingPhotosTokenRequest | null>(null);
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

  const [offlineSyncStatus, setOfflineSyncStatus] =
    useState<OfflineSyncStatus>("idle");
  const [offlineSyncMessage, setOfflineSyncMessage] = useState(
    initialOfflineSyncMessage,
  );
  const [offlineSyncDiagnostics, setOfflineSyncDiagnostics] = useState<string[]>(
    [],
  );
  const [offlineSyncLastResult, setOfflineSyncLastResult] =
    useState<DriveOfflineStagingSyncRuntimeResult | null>(null);
  const [isOfflineSyncInFlight, setIsOfflineSyncInFlight] = useState(false);

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
        return "Google認証のポップアップを開けませんでした。iPadのポップアップ許可、またはSafari側に残った認証画面を確認してください。";

      case "popup_closed":
        return "Google認証画面が完了前に閉じられました。iPadのApp SwitcherでGoogle認証画面やSafariが残っていれば閉じてから、認証状態をリセットして再試行してください。";

      case "unknown":
        return "Google認証で不明なpopupエラーが発生しました。iPadのApp SwitcherでGoogle認証画面やSafariが残っていれば閉じてから、認証状態をリセットして再試行してください。";

      default:
        return "Google認証のポップアップを開けない、または認証画面が閉じられた可能性があります。iPadのApp SwitcherでGoogle認証画面やSafariが残っていれば閉じてから、認証状態をリセットして再試行してください。";
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

  function requestPhotosAccessToken(requestId: number) {
    const tokenClient = tokenClientRef.current;

    if (!tokenClient) {
      return Promise.reject(
        new PhotosTokenRequestError({
          status: "error",
          message: "Google token client was not ready.",
          diagnostics: [
            "Google認証ライブラリの準備が完了していません。",
            "Drive保存: 未実行",
            "manifest反映: 未実行",
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
              "Google Photosの利用許可または写真選択待ちが30分でタイムアウトしました。",
              "Drive保存: 未実行",
              "manifest反映: 未実行",
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
              "manifest反映: 未実行",
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
            "manifest反映: 未実行",
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
            "manifest反映: 未実行",
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
            "Google Photos用のaccess_tokenを受け取れませんでした。",
            "Drive保存: 未実行",
            "manifest反映: 未実行",
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
            "manifest反映: 未実行",
          ],
        }),
      );
      return true;
    }

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
          "manifest反映: 未実行",
        ],
      }),
    );

    return true;
  }

  function getAssetImportBlockedReason() {
    if (assetImportInFlightRef.current || isAssetImportInFlight) {
      return "素材追加処理中です。";
    }

    if (isSlideEditInFlight) {
      return "slide編集中のため、素材追加は開始できません。";
    }

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Drive操作中のため、素材追加は開始できません。";
    }

    if (offlineSyncInFlightRef.current || isOfflineSyncInFlight) {
      return "offline sync 実行中のため、素材追加は開始できません。";
    }

    if (
      assetImportBatch.some((item) => item.status === "savedToDrive") ||
      (assetImportSelection?.driveSaved === true &&
        !assetImportSelection.manifestUpdated)
    ) {
      return "Drive保存済みの素材がmanifest未反映、またはmanifest反映完了を確認できていません。Drive状態を再確認するまで、追加の素材追加は開始できません。";
    }

    if (!canImportAssets) {
      return "Drive project ready ではないため、素材追加は開始できません。";
    }

    if (!workspaceReadyContext) {
      return "Drive workspace ready 情報を確認できないため、素材追加は開始できません。";
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
      return "offline sync 実行中です。";
    }

    if (isSlideEditInFlight) {
      return "slide編集中のため、offline sync は開始できません。";
    }

    if (assetImportInFlightRef.current || isAssetImportInFlight) {
      return "素材追加処理中のため、offline sync は開始できません。";
    }

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Drive操作中のため、offline sync は開始できません。";
    }

    if (googleStatus !== "connected" || driveFileGranted !== true) {
      return "Google接続と drive.file 許可が必要です。";
    }

    if (!accessTokenRef.current) {
      return "Google access_token を確認できません。Googleへ再接続してください。";
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      return "Drive workspace ready 情報が必要です。";
    }

    if (projectStatus !== "ready" || !driveProjectReadyContext) {
      return "Drive project ready 情報が必要です。";
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
      return "画像順変更には2枚以上のスライドが必要です。";
    }

    return null;
  }

  function getSlideEditBlockedReason(options?: { allowSingleSlide?: boolean }) {
    if (isSlideEditInFlight) {
      return "slide編集中です。";
    }

    if (offlineSyncInFlightRef.current || isOfflineSyncInFlight) {
      return "offline sync 実行中のため、slide編集はできません。";
    }

    if (assetImportInFlightRef.current || isAssetImportInFlight) {
      return "素材追加処理中のため、slide編集はできません。";
    }

    if (captionUpdateSlideId !== null) {
      return "テロップ保存中のため、slide編集はできません。";
    }

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Drive操作中のため、slide編集はできません。";
    }

    if (googleStatus !== "connected" || driveFileGranted !== true) {
      return "Google接続と drive.file 許可が必要です。";
    }

    if (!accessTokenRef.current) {
      return "Google access_token を確認できません。Googleへ再接続してください。";
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      return "Drive workspace ready 情報が必要です。";
    }

    if (projectStatus !== "ready" || !driveProjectReadyContext || !projectDetails) {
      return "Drive project ready 情報が必要です。";
    }

    if (options?.allowSingleSlide !== true && projectDetails.slides.length <= 0) {
      return "編集対象のスライドがありません。";
    }

    return null;
  }

  function getAssetCleanupPreviewBlockedReason() {
    if (
      assetCleanupPreviewInFlightRef.current ||
      isAssetCleanupPreviewInFlight
    ) {
      return "未使用asset cleanup previewを実行中です。";
    }

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Drive操作中のため、cleanup previewは開始できません。";
    }

    if (assetImportInFlightRef.current || isAssetImportInFlight) {
      return "素材追加処理中のため、cleanup previewは開始できません。";
    }

    if (offlineSyncInFlightRef.current || isOfflineSyncInFlight) {
      return "offline sync 実行中のため、cleanup previewは開始できません。";
    }

    if (isSlideEditInFlight || captionUpdateSlideId !== null) {
      return "project編集処理中のため、cleanup previewは開始できません。";
    }

    if (googleStatus !== "connected" || driveFileGranted !== true) {
      return "Google接続と drive.file 許可が必要です。";
    }

    if (!accessTokenRef.current) {
      return "Google access_token を確認できません。Googleへ再接続してください。";
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      return "Drive workspace ready 情報が必要です。";
    }

    if (projectStatus !== "ready" || !driveProjectReadyContext) {
      return "Drive project ready 情報が必要です。";
    }

    return null;
  }

  function getAssetCleanupDeletePreflightBlockedReason() {
    if (
      assetCleanupDeletePreflightInFlightRef.current ||
      isAssetCleanupDeletePreflightInFlight
    ) {
      return "未使用asset削除前preflightを実行中です。";
    }

    if (assetCleanupPreviewInFlightRef.current || isAssetCleanupPreviewInFlight) {
      return "cleanup preview実行中のため、削除前preflightは開始できません。";
    }

    return getAssetCleanupPreviewBlockedReason();
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

  function resetOfflineSyncState() {
    offlineSyncRequestIdRef.current += 1;
    offlineSyncRuntimeRef.current?.cancelCurrentRun();
    setOfflineSyncInFlightState(false);
    setOfflineSyncStatus("idle");
    setOfflineSyncMessage(initialOfflineSyncMessage);
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

  function clearAssetCleanupDeletePreflight() {
    setAssetCleanupDeletePreflightInFlightState(false);
    setAssetCleanupDeletePreflightStatus("idle");
    setAssetCleanupDeletePreflightMessage(
      initialAssetCleanupDeletePreflightMessage,
    );
    setSafeAssetCleanupDeletePreflightDiagnostics([]);
    setAssetCleanupDeletePreflightResult(null);
  }

  function clearProjectReadyDetails() {
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
  ) {
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
      "Google Photos Pickerで写真を複数件選択し、形式とサイズを確認できます。",
    );
  }

  function resetProjectState() {
    setProjectStatus("idle");
    setProjectMessage(initialProjectMessage);
    setDriveProjects([]);
    setSelectedProjectId(null);
    setProjectDiagnostics([]);
    clearProjectReadyDetails();
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

  function resetGoogleAfterDriveAuthFailure() {
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
            "Google認証でエラーが返されました。iPadのApp SwitcherでGoogle認証画面やSafariが残っていれば閉じてから、認証状態をリセットして再試行してください。",
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
            "アクセストークンを受け取れませんでした。認証状態をリセットしてから再試行してください。",
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
            "access_token は返されましたが、drive.file の許可を確認できませんでした。認証状態をリセットしてから再試行してください。",
          );
          abortDriveOperation();
          resetDriveState();
          return;
        }

        accessTokenRef.current = tokenResponse.access_token;
        setDriveFileGranted(true);
        setGoogleStatus("connected");
        setGoogleMessage(
          "Google接続済みです。access_token の実値は表示・保存していません。",
        );
        abortDriveOperation();
        resetDriveState();
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

    setGoogleStatus("notConnected");
    setGoogleMessage("Google接続を開始できます。");
    abortDriveOperation();
    resetDriveState();
  }

   function connectGoogle() {
    abortDriveOperation();
    clearGoogleAuthTimeout();

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
      "Googleアカウント選択と許可確認を行っています。iPadで認証画面が戻らない場合は、App SwitcherでGoogle認証画面やSafariを閉じてから、認証状態をリセットしてください。",
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
        "Google認証が時間内に完了しませんでした。iPadのApp SwitcherでGoogle認証画面やSafariが残っていれば閉じてから、認証状態をリセットして再試行してください。",
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
        "Google認証要求を開始できませんでした。iPadのApp SwitcherでGoogle認証画面やSafariが残っていれば閉じてから、認証状態をリセットして再試行してください。",
      );
      resetDriveState();
    }
  }
  function resetGoogleAuthFlow() {
    clearGoogleAuthTimeout();
    tokenRequestKindRef.current = null;
    accessTokenRef.current = null;
    setDriveFileGranted(null);
    abortDriveOperation();
    resetDriveState();

    setGoogleStatus(hasClientId ? "notConnected" : "missingClientId");
    setGoogleMessage(
      hasClientId
        ? "Google認証状態をリセットしました。iPadの場合は、App SwitcherでGoogle認証画面やSafariが残っていれば閉じてから、もう一度Google接続を開始してください。"
        : "NEXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です。",
    );
  }

  function disconnectGoogle() {
    abortDriveOperation();
    clearGoogleAuthTimeout();
    tokenRequestKindRef.current = null;
    accessTokenRef.current = null;
    setDriveFileGranted(null);
    setGoogleStatus(hasClientId ? "notConnected" : "missingClientId");
    setGoogleMessage(
      hasClientId
        ? "このセッションのGoogle接続を解除しました。Google側の許可取り消しは行っていません。"
        : "NEXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です。",
    );
    resetDriveState();
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
        "manifest反映: 未実行",
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
        "manifest反映: 未実行",
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
            "manifest反映: 未実行",
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
            "Drive保存前にworkspace/project ready情報を確認できませんでした。",
            "Drive保存: 未実行",
            "manifest反映: 未実行",
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
          updateAssetImportBatchItem(clientItemId, { status: "downloading" });
          setAssetImportMessage(
            `選択写真を順次取得しています。${index + 1} / ${pickedMediaItems.length}`,
          );

          const downloadResult = await fetchAndValidatePickedPhoto({
            accessToken: photosAccessToken,
            baseUrl: pickedMediaItem.mediaFile.baseUrl,
            signal: abortSignal,
          });

          updateAssetImportBatchItem(clientItemId, {
            status: "downloaded",
            downloadedContentType: downloadResult.downloadedContentType,
            downloadedSizeBytes: downloadResult.downloadedSizeBytes,
          });

          setAssetImportStatus("uploadingToDrive");
          setAssetImportMessage(
            `Drive assets/ に順次保存しています。${index + 1} / ${pickedMediaItems.length}`,
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
          );
        }
      }

      if (savedAssetsForManifest.length === 0) {
        finalStatus = "error";
        finalMessage =
          "選択写真をDriveに保存できませんでした。成功したitemはありません。";
        finalDiagnostics = [
          ...batchDiagnostics,
          "Drive保存: 成功0件",
          "manifest反映: 未実行",
        ];
        return;
      }

      setAssetImportStatus("updatingManifest");
      setAssetImportMessage(
        `manifest.json に成功分 ${savedAssetsForManifest.length} 件をまとめて反映しています。`,
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
        "Drive保存、batch manifest反映、index.json updatedAt同期、更新後再検証が完了しました。";
      finalDiagnostics = [
        ...batchDiagnostics,
        ...manifestAppendResult.diagnostics,
        "Drive保存: 成功分完了",
        "manifest反映: 成功分完了",
        "index.json updatedAt同期: 完了",
        "更新後再検証: 完了",
        "テロップ変更を iPad 再生に反映するには、この project を offline sync してください。",
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
              ? "Photos Pickerの選択結果に問題があります。"
              : "Photos Picker処理に失敗しました。";
        finalDiagnostics = error.diagnostics;
      } else if (error instanceof PhotosPickerApiError) {
        finalStatus = "error";
        finalMessage = "Photos Picker API処理に失敗しました。";
        finalDiagnostics = [
          ...(error.diagnostics.length > 0
            ? error.diagnostics
            : [
                `Photos Picker API operation: ${error.operation}`,
                `Photos Picker API status: ${error.status}`,
              ]),
          "Drive保存: 未実行",
          "manifest反映: 未実行",
        ];
      } else if (error instanceof DriveProjectAssetSaveError) {
        finalStatus = error.status === "invalidProject" ? "invalid" : "error";
        finalMessage = error.possibleCreatedAsset
          ? "Drive保存結果の確認に失敗しました。Drive上にasset fileが作成済みの可能性があります。"
          : "Drive assets/ への保存に失敗しました。";
        finalDiagnostics = buildAssetImportDriveSaveFailureDiagnostics(error);
      } else if (error instanceof DriveProjectManifestAppendError) {
        finalStatus = "error";
        finalMessage =
          "Drive保存後のmanifest反映に失敗しました。Drive上に中間状態が残っている可能性があります。";
        finalDiagnostics = buildAssetImportManifestAppendFailureDiagnostics(error);
      } else if (error instanceof DriveProjectManifestBatchAppendError) {
        finalStatus = "error";
        finalMessage =
          "Drive保存後のbatch manifest反映に失敗しました。Drive上に中間状態が残っている可能性があります。";
        finalDiagnostics = buildAssetImportManifestBatchAppendFailureDiagnostics(
          error,
        );
      } else if (isAbortError(error)) {
        finalStatus = "cancelled";
        finalMessage = "素材追加を中止しました。";
        finalDiagnostics = [
          "素材追加処理を中止しました。",
          "Drive保存: 未実行",
          "manifest反映: 未実行",
        ];
      } else {
        finalStatus = "error";
        finalMessage = "素材追加処理に失敗しました。";
        finalDiagnostics = [
          "素材追加処理中に予期しないエラーが発生しました。",
          "Drive保存やmanifest反映が途中まで進んだかは、この画面だけでは判断できません。",
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
              "manifest.jsonへの素材反映を更新後再検証済みの状態で反映しました。",
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
            "Drive asset file が作成済みの可能性があります。",
            "manifest.json または index.json が更新済みの可能性があります。",
            "自動削除・自動修復は行いません。",
            "Drive状態を再確認してください。",
          ]
        : [
            "ユーザー操作により素材追加を中止しました。",
            "Drive保存: 未実行",
            "manifest反映: 未実行",
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
      setOfflineSyncMessage("offline sync runtime を初期化できませんでした。");
      setSafeOfflineSyncDiagnostics([
        "Drive offline staging sync runtime が初期化されていません。",
      ]);
      return;
    }

    if (blockedReason) {
      setOfflineSyncStatus("blocked");
      setOfflineSyncMessage("offline sync を開始できませんでした。");
      setSafeOfflineSyncDiagnostics([blockedReason]);
      return;
    }

    const accessToken = accessTokenRef.current;
    const readyContext = workspaceReadyContext;
    const readyProject = driveProjectReadyContext;

    if (!accessToken || !readyContext || !readyProject) {
      setOfflineSyncStatus("blocked");
      setOfflineSyncMessage("offline sync に必要な ready 情報が不足しています。");
      setSafeOfflineSyncDiagnostics([
        "accessToken / workspaceReadyContext / driveProjectReadyContext のいずれかを確認できませんでした。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ]);
      return;
    }

    offlineSyncRequestIdRef.current += 1;
    const requestId = offlineSyncRequestIdRef.current;

    setOfflineSyncInFlightState(true);
    setOfflineSyncStatus("syncing");
    setOfflineSyncMessage("Driveからoffline staging snapshotを取得しています。");
    setSafeOfflineSyncDiagnostics([]);
    setOfflineSyncLastResult(null);

    try {
      const result = await runtime.run({
        accessToken,
        readyContext,
        project: readyProject,
      });

      if (requestId !== offlineSyncRequestIdRef.current) {
        return;
      }

      setOfflineSyncLastResult(result);
      setOfflineSyncStatus(getOfflineSyncStatusFromResult(result));
      setOfflineSyncMessage(buildOfflineSyncResultMessage(result));
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
    setOfflineSyncMessage("offline sync を中止しました。");
    setSafeOfflineSyncDiagnostics([
      "ユーザー操作により offline sync を中止しました。",
      "Drive fetch / staging write / promotion のどこまで進んだかは、この状態だけでは判断しません。",
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
        "Driveワークスペースの確認済み情報を取得できませんでした。",
        "先にDrive状態を再確認し、ready になっていることを確認してください。",
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
          "Drive上のプロジェクト情報に問題があります。このスライスでは自動修復しません。",
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
          "Drive上のプロジェクト詳細に問題があります。このスライスでは自動修復しません。",
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
        `index.json上の project ${result.projects.length}件を確認し、選択中projectの詳細を読み込みました。`,
      );
      applyProjectReadyState(selectedProject, nextProjectDetails);
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
        "プロジェクト状態確認に失敗しました。通信状態を確認して再確認してください。",
      );
      clearProjectReadyDetails();
      setProjectDiagnostics(
        error instanceof DriveApiError
          ? [
              "Drive上のプロジェクト詳細確認に失敗しました。",
              `Drive API status: ${error.status}`,
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

    const accessToken = accessTokenRef.current;

    if (!accessToken) {
      setProjectStatus("error");
      setProjectMessage(
        "Google接続が必要です。もう一度Google接続を行ってからprojectを選択してください。",
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
        "Driveワークスペースの確認済み情報を取得できませんでした。",
        "先にDrive状態を再確認し、ready になっていることを確認してください。",
      ]);
      return;
    }

    setDriveOperationInFlight(true);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;
    const readyContext = workspaceReadyContext;

    setProjectStatus("checking");
    setProjectMessage("選択したprojectの詳細を確認しています。");
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
          "Drive上のプロジェクト情報に問題があります。このスライスでは自動修復しません。",
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
        setProjectMessage("選択したprojectを index.json 上で確認できませんでした。");
        setSelectedProjectId(null);
        clearProjectReadyDetails();
        setProjectDiagnostics([
          ...result.diagnostics,
          `projectId ${projectId} は index.json.projects に登録されていません。`,
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
          "選択したprojectのDrive上の詳細に問題があります。このスライスでは自動修復しません。",
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
      setProjectMessage("選択したprojectの manifest / assets 詳細を読み込みました。");
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
        "project選択中にDrive確認へ失敗しました。通信状態を確認して再確認してください。",
      );
      clearProjectReadyDetails();
      setProjectDiagnostics(
        error instanceof DriveApiError
          ? [
              "Drive上のproject詳細確認に失敗しました。",
              `Drive API status: ${error.status}`,
            ]
          : ["Drive上のproject詳細確認に失敗しました。"],
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
        "選択中projectが ready ではないため、title変更を開始しませんでした。",
        "先にDrive project状態を確認し、対象projectを選択してください。",
      ]);
      return;
    }

    if (title === readyProject.title) {
      setProjectDiagnostics(["project title は変更されていません。"]);
      return;
    }

    setDriveOperationInFlight(true);
    const requestId = driveOperationRequestIdRef.current + 1;
    driveOperationRequestIdRef.current = requestId;

    setProjectStatus("checking");
    setProjectMessage("選択中projectのtitleを更新しています。");
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
        "選択中projectのtitleを manifest.json / index.json に反映し、再検証しました。",
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

        setProjectStatus(error.status === "invalidProject" ? "invalid" : "error");
        setProjectMessage(
          error.status === "invalidProject"
            ? "title変更前のDrive project情報に問題があります。このスライスでは自動修復しません。"
            : "project title変更に失敗しました。",
        );
        setProjectDiagnostics(error.diagnostics);
        return;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setProjectMessage("project title変更に失敗しました。");
      setProjectDiagnostics([
        "project title変更中に予期しないエラーが発生しました。",
        "manifest.json / index.json のどこまで更新されたかは、この画面だけでは判断できません。",
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
        "選択中projectが ready ではないため、テロップ保存を開始しませんでした。",
      );
      setCaptionUpdateDiagnostics([
        "先にDrive project状態を確認し、対象projectを選択してください。",
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
        "選択中projectのテロップを manifest.json / index.json に反映し、再検証しました。",
      );
      applyProjectReadyState(result.project, toProjectDetails(result.details));
      setCaptionUpdateMessage(
        "テロップを保存しました。iPad再生へ反映するには、このprojectをoffline syncしてください。",
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
            ? "テロップ保存前のDrive project情報に問題があります。"
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
        "manifest.json / index.json のどこまで更新されたかは、この画面だけでは判断できません。",
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

  async function moveProjectSlide(slideId: string, direction: "up" | "down") {
    const blockedReason = getSlideReorderBlockedReason();
    const readyProjectDetails = projectDetails;

    setSlideReorderDiagnostics([]);
    setSlideEditDiagnostics([]);

    if (blockedReason) {
      setSlideReorderStatus("blocked");
      setSlideReorderMessage("画像順を変更できませんでした。");
      setSlideReorderDiagnostics([blockedReason]);
      setSlideEditStatus("blocked");
      setSlideEditMessage("画像順を変更できませんでした。");
      setSlideEditDiagnostics([blockedReason]);
      return false;
    }

    const currentSlides = readyProjectDetails?.slides ?? [];
    const fromIndex = currentSlides.findIndex((slide) => slide.slideId === slideId);
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;

    if (fromIndex === -1) {
      setSlideReorderStatus("invalid");
      setSlideReorderMessage("画像順を変更できませんでした。");
      setSlideReorderDiagnostics([
        "指定されたslideIdを選択中projectのslidesで確認できませんでした。",
      ]);
      setSlideEditStatus("invalid");
      setSlideEditMessage("画像順を変更できませんでした。");
      setSlideEditDiagnostics([
        "指定されたslideIdを選択中projectのslidesで確認できませんでした。",
      ]);
      return false;
    }

    if (toIndex < 0 || toIndex >= currentSlides.length) {
      setSlideReorderStatus("invalid");
      setSlideReorderMessage("画像順は変更されていません。");
      setSlideReorderDiagnostics([
        direction === "up"
          ? "先頭のslideはこれ以上上へ移動できません。"
          : "最後のslideはこれ以上下へ移動できません。",
      ]);
      setSlideEditStatus("invalid");
      setSlideEditMessage("画像順は変更されていません。");
      setSlideEditDiagnostics([
        direction === "up"
          ? "先頭のslideはこれ以上上へ移動できません。"
          : "最後のslideはこれ以上下へ移動できません。",
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
      setSlideReorderMessage("画像順を変更できませんでした。");
      setSlideReorderDiagnostics([blockedReason]);
      setSlideEditStatus("blocked");
      setSlideEditMessage("画像順を変更できませんでした。");
      setSlideEditDiagnostics([blockedReason]);
      return false;
    }

    if (!accessToken || !readyWorkspace || !readyProject || !projectDetails) {
      const diagnostics = [
        "accessToken / workspaceReadyContext / driveProjectReadyContext / projectDetails のいずれかを確認できませんでした。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ];
      setSlideReorderStatus("blocked");
      setSlideReorderMessage("画像順変更に必要な ready 情報が不足しています。");
      setSlideReorderDiagnostics(diagnostics);
      setSlideEditStatus("blocked");
      setSlideEditMessage("画像順変更に必要な ready 情報が不足しています。");
      setSlideEditDiagnostics(diagnostics);
      return false;
    }

    if (areStringArraysEqual(currentSlideIds, orderedSlideIds)) {
      return true;
    }

    setDriveOperationInFlight(true);
    setSlideReorderInFlightState(true);
    setSlideReorderStatus("saving");
    setSlideReorderMessage("画像の順番を保存しています。");
    setSlideEditStatus("reordering");
    setSlideEditMessage("画像の順番を保存しています。");
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
          "選択中projectの画像順を manifest.json / index.json に反映し、再検証しました。",
      });
      setSlideReorderStatus("completed");
      setSlideReorderMessage(
        "画像の順番を保存しました。iPad再生へ反映するには、このprojectをoffline syncしてください。",
      );
      setSlideReorderDiagnostics([
        ...result.diagnostics,
        "iPad再生への反映には、このprojectのoffline syncが必要です。",
      ]);
      setSlideEditStatus("completed");
      setSlideEditMessage(
        "画像の順番を保存しました。iPad再生へ反映するには、このprojectをoffline syncしてください。",
      );
      setSlideEditDiagnostics([
        ...result.diagnostics,
        "iPad再生への反映には、このprojectのoffline syncが必要です。",
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
            ? "画像順変更前のDrive project情報に問題があります。"
            : "画像順変更に失敗しました。",
        );
        setSlideReorderDiagnostics(error.diagnostics);
        setSlideEditStatus(
          error.status === "invalidProject" ? "invalid" : "error",
        );
        setSlideEditMessage(
          error.status === "invalidProject"
            ? "画像順変更前のDrive project情報に問題があります。"
            : "画像順変更に失敗しました。",
        );
        setSlideEditDiagnostics(error.diagnostics);
        return false;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setSlideReorderStatus("error");
      setSlideReorderMessage("画像順変更に失敗しました。");
      setSlideReorderDiagnostics([
        "画像順変更中に予期しないエラーが発生しました。",
        "manifest.json / index.json のどこまで更新されたかは、この画面だけでは判断できません。",
        "Drive状態を再確認してください。",
      ]);
      setSlideEditStatus("error");
      setSlideEditMessage("画像順変更に失敗しました。");
      setSlideEditDiagnostics([
        "画像順変更中に予期しないエラーが発生しました。",
        "manifest.json / index.json のどこまで更新されたかは、この画面だけでは判断できません。",
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
      setSlideEditMessage("選択したslideを削除できませんでした。");
      setSlideEditDiagnostics([blockedReason]);
      return false;
    }

    if (!accessToken || !readyWorkspace || !readyProject) {
      setSlideEditStatus("blocked");
      setSlideEditMessage("slide削除に必要な ready 情報が不足しています。");
      setSlideEditDiagnostics([
        "accessToken / workspaceReadyContext / driveProjectReadyContext のいずれかを確認できませんでした。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ]);
      return false;
    }

    setDriveOperationInFlight(true);
    setSlideDeleteInFlightState(true);
    setSlideEditStatus("deleting");
    setSlideEditMessage("選択したslideを削除しています。");
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
          "選択中projectのslide削除を manifest.json / index.json に反映し、再検証しました。",
      });
      setSlideEditStatus("completed");
      setSlideEditMessage(
        "選択したslideを削除しました。iPad再生へ反映するには、このprojectをoffline syncしてください。",
      );
      setSlideEditDiagnostics([
        ...result.diagnostics,
        "Drive assets/ の画像fileは削除していません。",
        "iPad再生への反映には、このprojectのoffline syncが必要です。",
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
            ? "slide削除前のDrive project情報に問題があります。"
            : "slide削除に失敗しました。",
        );
        setSlideEditDiagnostics(error.diagnostics);
        return false;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setSlideEditStatus("error");
      setSlideEditMessage("slide削除に失敗しました。");
      setSlideEditDiagnostics([
        "slide削除中に予期しないエラーが発生しました。",
        "manifest.json / index.json のどこまで更新されたかは、この画面だけでは判断できません。",
        "Drive assets/ の画像fileは削除していません。",
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
      setSlideEditMessage("slideを複製できませんでした。");
      setSlideEditDiagnostics([blockedReason]);
      return false;
    }

    if ((projectDetails?.slideCount ?? 0) >= ASSET_IMPORT_MAX_SLIDE_COUNT) {
      setSlideEditStatus("invalid");
      setSlideEditMessage("slideを複製できませんでした。");
      setSlideEditDiagnostics([
        `slide 数が上限の${ASSET_IMPORT_MAX_SLIDE_COUNT}件に達しているため、複製できません。`,
      ]);
      return false;
    }

    if (!accessToken || !readyWorkspace || !readyProject) {
      setSlideEditStatus("blocked");
      setSlideEditMessage("slide複製に必要な ready 情報が不足しています。");
      setSlideEditDiagnostics([
        "accessToken / workspaceReadyContext / driveProjectReadyContext のいずれかを確認できませんでした。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ]);
      return false;
    }

    setDriveOperationInFlight(true);
    setSlideDuplicateInFlightState(true);
    setSlideEditStatus("duplicating");
    setSlideEditMessage("slideを複製しています。");
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
          "選択中projectのslide複製を manifest.json / index.json に反映し、再検証しました。",
      });
      setSlideEditStatus("completed");
      setSlideEditMessage(
        "slideを複製しました。iPad再生へ反映するには、このprojectをoffline syncしてください。",
      );
      setSlideEditDiagnostics([
        ...result.diagnostics,
        `新しいslideId: ${formatIdPart(result.duplicatedSlide.slideId)}`,
        "Drive asset fileはコピーしていません。",
        "iPad再生への反映には、このprojectのoffline syncが必要です。",
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
            ? "slide複製前のDrive project情報に問題があります。"
            : "slide複製に失敗しました。",
        );
        setSlideEditDiagnostics(error.diagnostics);
        return false;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setProjectStatus("error");
      setSlideEditStatus("error");
      setSlideEditMessage("slide複製に失敗しました。");
      setSlideEditDiagnostics([
        "slide複製中に予期しないエラーが発生しました。",
        "manifest.json / index.json のどこまで更新されたかは、この画面だけでは判断できません。",
        "Drive asset fileはコピーしていません。",
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
    clearAssetCleanupDeletePreflight();

    if (blockedReason) {
      setAssetCleanupPreviewStatus("blocked");
      setAssetCleanupPreviewMessage("未使用asset previewを開始できませんでした。");
      setSafeAssetCleanupPreviewDiagnostics([blockedReason]);
      setAssetCleanupPreviewResult(null);
      return;
    }

    if (!accessToken || !readyWorkspace || !readyProject) {
      setAssetCleanupPreviewStatus("blocked");
      setAssetCleanupPreviewMessage(
        "未使用asset previewに必要な ready 情報が不足しています。",
      );
      setSafeAssetCleanupPreviewDiagnostics([
        "accessToken / workspaceReadyContext / driveProjectReadyContext のいずれかを確認できませんでした。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ]);
      setAssetCleanupPreviewResult(null);
      return;
    }

    setDriveOperationInFlight(true);
    setAssetCleanupPreviewInFlightState(true);
    setAssetCleanupPreviewStatus("checking");
    setAssetCleanupPreviewMessage("未使用asset previewを更新しています。");
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
        "未使用 asset preview を更新しました。Drive file は削除していません。",
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
        setAssetCleanupPreviewMessage("未使用 asset preview に失敗しました。");
        setSafeAssetCleanupPreviewDiagnostics(error.diagnostics);
        setAssetCleanupPreviewResult(null);
        return;
      }

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        resetGoogleAfterDriveAuthFailure();
      }

      setAssetCleanupPreviewStatus("error");
      setAssetCleanupPreviewMessage("未使用 asset preview に失敗しました。");
      setSafeAssetCleanupPreviewDiagnostics([
        "未使用asset preview中に予期しないエラーが発生しました。",
        "manifest.json / index.json は更新していません。",
        "Drive assets/ のfileは更新・削除していません。",
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
        "削除前preflight対象の未使用assetが選択されていません。",
      );
      setSafeAssetCleanupDeletePreflightDiagnostics([
        "未使用assetを1件以上選択してください。",
      ]);
      setAssetCleanupDeletePreflightResult(null);
      return;
    }

    if (blockedReason) {
      setAssetCleanupDeletePreflightStatus("blocked");
      setAssetCleanupDeletePreflightMessage(
        "未使用asset削除前preflightを開始できませんでした。",
      );
      setSafeAssetCleanupDeletePreflightDiagnostics([blockedReason]);
      setAssetCleanupDeletePreflightResult(null);
      return;
    }

    if (!accessToken || !readyWorkspace || !readyProject) {
      setAssetCleanupDeletePreflightStatus("blocked");
      setAssetCleanupDeletePreflightMessage(
        "未使用asset削除前preflightに必要な ready 情報が不足しています。",
      );
      setSafeAssetCleanupDeletePreflightDiagnostics([
        "accessToken / workspaceReadyContext / driveProjectReadyContext のいずれかを確認できませんでした。",
        "Drive状態とプロジェクト状態を再確認してください。",
      ]);
      setAssetCleanupDeletePreflightResult(null);
      return;
    }

    setDriveOperationInFlight(true);
    setAssetCleanupDeletePreflightInFlightState(true);
    setAssetCleanupDeletePreflightStatus("checking");
    setAssetCleanupDeletePreflightMessage(
      "fresh manifest と fresh metadata で削除前preflightを実行しています。",
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
        "削除前preflightが完了しました。この段階ではまだDrive fileは削除しません。",
      );
      setAssetCleanupDeletePreflightResult(result);
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
          "未使用asset削除前preflightに失敗しました。",
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
        "未使用asset削除前preflightに失敗しました。",
      );
      setSafeAssetCleanupDeletePreflightDiagnostics([
        "未使用asset削除前preflight中に予期しないエラーが発生しました。",
        "Drive file は削除していません。",
        "manifest.json / index.json は更新していません。",
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
        "先にDrive状態を再確認し、ready になっていることを確認してください。",
      ]);
      return;
    }

    if (projectStatus !== "notCreated" && projectStatus !== "ready") {
      setProjectDiagnostics([
        "index.json.projects が作成可能な状態として確認できていないため、作成を開始しませんでした。",
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
        "新しいprojectを作成し、選択状態にしました。",
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
              ? "Drive上のプロジェクト情報に問題があります。このスライスでは自動修復しません。"
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
    offlineSyncStatus,
    offlineSyncStatusLabel: offlineSyncStatusLabels[offlineSyncStatus],
    offlineSyncMessage,
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
    createProject,
    updateSelectedProjectTitle,
    updateProjectSlideCaption,
    moveProjectSlide,
    reorderProjectSlidesByDrag,
    deleteProjectSlides,
    duplicateProjectSlide,
    previewUnusedProjectAssets,
    preflightUnusedAssetDeletion,
    clearAssetCleanupDeletePreflight,
    startAssetImport,
    cancelAssetImport,
    startOfflineSync,
    cancelOfflineSync,
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
      return "Drive取得、staging write、confirmed promotion が完了しました。";

    case "stale":
      return "offline sync は stale として無視されました。";

    case "driveFetchOrStagingWriteFailed":
      return "Drive取得、または staging write に失敗しました。";

    case "promotionFailed":
      return "staging promotion に失敗しました。";

    case "orchestrationPreconditionFailed":
      return "offline sync の前提条件を満たしていません。";

    case "orchestrationUnexpectedFailure":
      return "offline sync 中に予期しない失敗が発生しました。";

    case "syncAlreadyInFlight":
      return "offline sync はすでに実行中です。";

    case "syncRuntimeCancelled":
      return "offline sync は中止されました。";

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
        `syncRunId: ${result.syncRunId}`,
        `projectId: ${result.projectId}`,
        `manifest slide count: ${result.manifestSlideCount}`,
        `image sync candidate count: ${result.imageSyncCandidateCount}`,
        `video sync candidate count: ${result.videoSyncCandidateCount}`,
        `video synced count: ${result.videoSyncedCount}`,
        `video skipped count: ${result.videoSkippedCount}`,
        `video too large skipped count: ${result.videoTooLargeSkippedCount}`,
        `unsupported asset count: ${result.unsupportedAssetCount}`,
        `offline staging slide count: ${result.offlineStagingSlideCount}`,
        `slides: ${result.slideCount}`,
        `assets: ${result.assetCount}`,
        `staging written projects: ${result.stagingWrite.writtenProjects}`,
        `staging written assets: ${result.stagingWrite.writtenAssets}`,
        `staging written asset blobs: ${result.stagingWrite.writtenAssetBlobs}`,
        `promoted projects: ${result.promotion.promotedProjects}`,
        `promoted assets: ${result.promotion.promotedAssets}`,
        `promoted asset blobs: ${result.promotion.promotedAssetBlobs}`,
        "video/mp4 は容量上限内の場合のみoffline保存対象です。skipは削除対象やsync失敗ではありません。",
        "QuickTime / WebM / 上限超過videoはoffline保存対象外としてskipされます。",
        ...appendOmittedDiagnosticCount(
          result.diagnostics,
          result.omittedDiagnosticCount,
        ),
      ];

    case "stale":
      return [
        `syncRunId: ${result.syncRunId}`,
        "この syncRun は stale-sync-run として無視されました。",
      ];

    case "driveFetchOrStagingWriteFailed":
      return appendOmittedDiagnosticCount(
        result.diagnostics,
        result.omittedDiagnosticCount,
      );

    case "promotionFailed":
      if (result.promotionFailure.reason === "validation-failed") {
        return [
          `syncRunId: ${result.syncRunId}`,
          "promotion validation failed.",
          `validationReason: ${result.promotionFailure.validationReason}`,
          `validationClassification: ${result.promotionFailure.validationClassification}`,
        ];
      }

      return [
        `syncRunId: ${result.syncRunId}`,
        "promotion or cleanup failed.",
      ];

    case "orchestrationPreconditionFailed":
    case "orchestrationUnexpectedFailure":
    case "syncAlreadyInFlight":
    case "syncRuntimeCancelled":
      return appendOmittedDiagnosticCount(
        result.diagnostics,
        result.omittedDiagnosticCount,
      );

    default:
      return assertNeverOfflineSyncResultStatus(result);
  }
}

function appendOmittedDiagnosticCount(
  diagnostics: string[],
  omittedDiagnosticCount: number,
): string[] {
  if (omittedDiagnosticCount <= 0) {
    return diagnostics;
  }

  return [...diagnostics, `omitted diagnostics: ${omittedDiagnosticCount}`];
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
      diagnostic,
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
          "Driveワークスペース候補が2件以上あります。このスライスでは自動選択・削除・修復は行いません。",
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
          "Driveワークスペース候補のmetadataに問題があります。このスライスでは自動修復は行いません。",
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
          "Driveワークスペース候補のJSON本文に問題があります。このスライスでは自動修復は行いません。",
        candidates: summaries,
        diagnostics,
      };
    }

    if (jsonBodyResult.status === "unsupportedVersion") {
      return {
        status: "unsupportedVersion",
        message:
          "Driveワークスペース候補のschemaVersionは、このPWAでは対応していません。",
        candidates: summaries,
        diagnostics,
      };
    }

    return {
      status: "ready",
      message:
        "Driveワークスペース準備済みです。metadataとJSON本文の整合を確認しました。",
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
    slideCount: details?.slideCount ?? 0,
    assetCount: details?.assetCount ?? 0,
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
    diagnostics.push("project title を入力してください。");
    return diagnostics;
  }

  if ([...title].length > DRIVE_PROJECT_TITLE_MAX_LENGTH) {
    diagnostics.push(
      `project title は ${DRIVE_PROJECT_TITLE_MAX_LENGTH} 文字以内で入力してください。`,
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
      sourceCreateTime: slide.sourceCreateTime ?? "取得なし",
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
    "Drive状態を再確認すると、index.json の最新状態を読み直します。",
  ];
}

function buildProjectCreateFailureDiagnostics(error: DriveProjectCreateError) {
  const diagnostics = [...error.diagnostics];

  if (error.projectId) {
    diagnostics.push(`対象projectId: ${formatIdPart(error.projectId)}`);
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

function getAssetImportItemErrorMessage(error: unknown) {
  if (error instanceof PhotosPickerApiError) {
    return `Photos API error: ${error.operation}`;
  }

  if (error instanceof DriveProjectAssetSaveError) {
    return error.possibleCreatedAsset
      ? "Drive保存結果の確認に失敗しました。"
      : "Drive保存に失敗しました。";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "処理に失敗しました。";
}

function buildAssetImportDriveSaveFailureDiagnostics(
  error: DriveProjectAssetSaveError,
) {
  const diagnostics = [...error.diagnostics];

  if (error.possibleCreatedAsset) {
    diagnostics.push(
      `作成済みの可能性: assetId ${error.possibleCreatedAsset.assetIdPart}`,
      `作成済みの可能性: assetFileId ${error.possibleCreatedAsset.assetFileIdPart}`,
    );
  }

  return dedupeDiagnostics(diagnostics);
}

function buildAssetImportManifestAppendFailureDiagnostics(
  error: DriveProjectManifestAppendError,
) {
  const diagnostics = [
    ...error.diagnostics,
    `対象assetId: ${error.savedAsset.assetIdPart}`,
    `対象assetFileId: ${error.savedAsset.assetFileIdPart}`,
  ];

  if (error.possibleChangedItems.length > 0) {
    diagnostics.push(
      "manifest反映中にDrive項目が更新された可能性があります。",
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
    `manifest反映対象asset数: ${error.savedAssets.length}`,
  ];

  if (error.possibleChangedItems.length > 0) {
    diagnostics.push(
      "batch manifest反映中にDrive項目が更新された可能性があります。",
      ...error.possibleChangedItems.map(toProjectChangedItemDiagnostic),
    );
  }

  diagnostics.push(
    "Drive保存済みだがmanifest未反映のassetが残っている可能性があります。",
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
          "manifest反映: 未実行",
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
          "manifest反映: 未実行",
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
      .map(truncateAssetImportDiagnostic),
  );
}

function sanitizeAssetCleanupPreviewDiagnostics(diagnostics: string[]) {
  return dedupeDiagnostics(
    diagnostics
      .map((diagnostic) => diagnostic.trim())
      .filter((diagnostic) => diagnostic.length > 0)
      .filter(isSafeAssetImportDiagnostic)
      .map(truncateAssetCleanupPreviewDiagnostic),
  );
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
    "Driveワークスペース作成APIは完了しましたが、作成後確認で ready になりませんでした。",
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
