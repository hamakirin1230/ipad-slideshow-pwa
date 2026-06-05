"use client";

import Script from "next/script";
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
  type GoogleTokenResponse,
  getGoogleClientId,
  hasGoogleClientId,
  hasGrantedDriveFileAndPhotosPickerScopes,
  hasGrantedDriveFileScope,
} from "@/lib/google-auth";
import {
  DriveApiError,
  DriveProjectAssetSaveError,
  DriveProjectCreateError,
  DriveProjectManifestAppendError,
  DriveWorkspaceCreateError,
  appendDriveProjectAssetToManifest,
  createDriveProject,
  createDriveWorkspace,
  findWorkspaceChildCandidatesByRole,
  findWorkspaceRootCandidates,
  readDriveTextFile,
  saveDriveProjectAsset,
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
  type DriveWorkspaceChildRole,
  type DriveWorkspaceReadyContext,
  type DriveWorkspaceRootCandidate,
} from "@/lib/google-drive";
import {
  PHOTOS_PICKER_MAX_APP_WAIT_SECONDS,
  createPhotosPickerSession,
  deletePhotosPickerSession,
  extractSinglePickedMediaItem,
  fetchAndValidatePickedPhoto,
  getPhotosPickerSession,
  listPickedMediaItems,
  normalizePickedMediaItem,
  PhotosPickerApiError,
  PhotosPickerSelectionError,
  type PhotosPickedMediaItem,
  type PhotosPickedPhotoDownloadResult,
  type PhotosPickerCreatedSession,
  type PhotosPickerResolvedPollingTiming,
  type PhotosPickerSessionSnapshot,
} from "@/lib/google-photos-picker";

const DRIVE_OPERATION_TIMEOUT_MS = 15_000;
const ASSET_IMPORT_MAX_SLIDE_COUNT = 50;
const PHOTOS_TOKEN_REQUEST_TIMEOUT_MS = 120_000;
const PHOTOS_PICKER_CLEANUP_TIMEOUT_MS = 10_000;
const ASSET_IMPORT_DIAGNOSTIC_MAX_LENGTH = 160;

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

export type DriveCandidateSummary = {
  name: string;
  createdTime: string;
  modifiedTime: string;
  workspaceIdPart: string;
};

export type ProjectSummary = {
  projectIdPart: string;
  title: string;
  manifestPath: string;
  createdAt: string;
  updatedAt: string;
  slideCount: number;
  assetCount: number;
};

export type ProjectSlideSummary = {
  slideIdPart: string;
  assetIdPart: string;
  assetName: string;
  mimeType: string;
  sourceMimeType: string;
  sourceCreateTime: string;
  durationSeconds: number;
  caption: string;
  verified: boolean;
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
  projectSummary: ProjectSummary | null;
  projectDiagnostics: string[];
  projectDetails: ProjectDetails | null;

  canImportAssets: boolean;
  assetImportStatus: AssetImportStatus;
  assetImportStatusLabel: string;
  assetImportMessage: string;
  assetImportDiagnostics: string[];
  assetImportSelection: AssetImportSelection | null;
  isAssetImportInFlight: boolean;
  canStartAssetImport: boolean;
  assetImportBlockedReason: string | null;

  connectGoogle: () => void;
  disconnectGoogle: () => void;
  checkDriveWorkspace: () => void;
  createWorkspace: () => void;
  checkProject: () => void;
  createProject: () => void;
  startAssetImport: () => void;
  cancelAssetImport: () => void;
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

const initialDriveMessage =
  "このセッションでは、まだDriveワークスペース確認を実行していません。";

const initialProjectMessage =
  "Driveワークスペース ready 後にプロジェクト状態を確認します。";

const initialAssetImportMessage =
  "Drive project ready 後に素材追加の準備状態を確認できます。";

const AppContext = createContext<AppContextValue | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const clientId = getGoogleClientId();
  const hasClientId = hasGoogleClientId();

  const accessTokenRef = useRef<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const tokenRequestKindRef = useRef<TokenRequestKind>(null);
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
  const [isAssetImportInFlight, setIsAssetImportInFlight] = useState(false);

  const canImportAssets =
    projectStatus === "ready" && driveProjectReadyContext !== null;
  const assetImportBlockedReason = getAssetImportBlockedReason();
  const canStartAssetImport = assetImportBlockedReason === null;

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

  function setAssetImportInFlightState(value: boolean) {
    assetImportInFlightRef.current = value;
    setIsAssetImportInFlight(value);
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
              "Google Photosの利用許可待ちが120秒でタイムアウトしました。",
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

    if (driveOperationInFlightRef.current || isDriveOperationInFlight) {
      return "Drive操作中のため、素材追加は開始できません。";
    }

    if (
      assetImportSelection?.driveSaved === true &&
      !assetImportSelection.manifestUpdated
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

  function resetAssetImportState() {
    assetImportRequestIdRef.current += 1;
    clearAssetImportRuntimeRefs({
      abort: true,
      rejectPendingPhotosTokenRequest: true,
    });
    setAssetImportInFlightState(false);
    setAssetImportSelection(null);
    setAssetImportStatus("idle");
    setAssetImportMessage(initialAssetImportMessage);
    setSafeAssetImportDiagnostics([]);
  }

  function clearProjectReadyDetails() {
    setDriveProjectReadyContext(null);
    setProjectDetails(null);
    resetAssetImportState();
  }

  function applyProjectReadyState(project: DriveProjectSummary) {
    const details = buildEmptyProjectDetails();

    setDriveProjectReadyContext(project);
    setProjectDetails(details);
    setProjectSummary(toProjectSummary(project, details));
    resetAssetImportState();
    setAssetImportMessage(
      "Google Photos Pickerで写真を1件選択し、形式とサイズを確認できます。",
    );
  }

  function resetProjectState() {
   setProjectStatus("idle");
   setProjectMessage(initialProjectMessage);
   setProjectSummary(null);
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

        tokenRequestKindRef.current = null;

        if (tokenResponse.error) {
          accessTokenRef.current = null;
          setDriveFileGranted(null);
          setGoogleStatus("error");
          setGoogleMessage(
            "Google認証でエラーが返されました。もう一度試してください。",
          );
          abortDriveOperation();
          resetDriveState();
          return;
        }

        if (!tokenResponse.access_token) {
          accessTokenRef.current = null;
          setDriveFileGranted(null);
          setGoogleStatus("error");
          setGoogleMessage("アクセストークンを受け取れませんでした。");
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
            "access_token は返されましたが、drive.file の許可を確認できませんでした。",
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
      error_callback: () => {
        if (handlePhotosTokenErrorCallback()) {
          return;
        }

        tokenRequestKindRef.current = null;
        accessTokenRef.current = null;
        setDriveFileGranted(null);
        setGoogleStatus("error");
        setGoogleMessage(
          "Google認証のポップアップを開けない、または認証画面が閉じられた可能性があります。",
        );
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

    if (!hasClientId) {
      accessTokenRef.current = null;
      setDriveFileGranted(null);
      setGoogleStatus("missingClientId");
      setGoogleMessage("NEXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です。");
      resetDriveState();
      return;
    }

    if (!tokenClientRef.current) {
      setGoogleStatus("scriptLoading");
      setGoogleMessage(
        "Google認証ライブラリの準備がまだ終わっていません。少し待ってから再試行してください。",
      );
      resetDriveState();
      return;
    }

    setGoogleStatus("connecting");
    setGoogleMessage("Googleアカウント選択と許可確認を行っています。");
    resetDriveState();
    tokenRequestKindRef.current = "drive";
    tokenClientRef.current.requestAccessToken();
  }

  function disconnectGoogle() {
    abortDriveOperation();
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
      setAssetImportMessage("Photos Pickerで写真を1件選択してください。");

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
      );

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      const pickedMediaItem = normalizePickedMediaItem(
        extractSinglePickedMediaItem(pickedMediaItemsList),
      );

      setAssetImportMessage("選択した写真の形式とサイズを確認しています。");

      const downloadResult = await fetchAndValidatePickedPhoto({
        accessToken: photosAccessToken,
        baseUrl: pickedMediaItem.mediaFile.baseUrl,
        signal: abortSignal,
      });

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      finalSelection = buildAssetImportSelection(
        pickedMediaItem,
        downloadResult,
      );

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

      setAssetImportStatus("uploadingToDrive");
      setAssetImportMessage("Drive assets/ に選択写真を保存しています。");

      const savedAsset = await saveDriveProjectAsset({
        accessToken: photosAccessToken,
        workspaceId: readyWorkspace.workspaceId,
        project: readyProject,
        blob: downloadResult.blob,
        mimeType: downloadResult.downloadedContentType,
        sizeBytes: downloadResult.downloadedSizeBytes,
        signal: abortSignal,
      });

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      finalSelection = buildAssetImportSelection(
        pickedMediaItem,
        downloadResult,
        savedAsset,
      );

      setAssetImportStatus("updatingManifest");
      setAssetImportMessage("manifest.json に素材情報を反映しています。");

      const manifestAppendResult = await appendDriveProjectAssetToManifest({
        accessToken: photosAccessToken,
        workspaceId: readyWorkspace.workspaceId,
        indexJsonFileId: readyWorkspace.indexJsonFileId,
        project: readyProject,
        savedAsset,
        source: {
          filename: pickedMediaItem.mediaFile.filename ?? null,
          sourceMimeType: pickedMediaItem.mediaFile.mimeType,
          sourceMediaItemId: pickedMediaItem.id,
          sourceCreateTime: pickedMediaItem.createTime,
        },
        signal: abortSignal,
      });

      if (requestId !== assetImportRequestIdRef.current) {
        return;
      }

      const nextProjectDetails = toProjectDetails(manifestAppendResult.details);

      finalProject = manifestAppendResult.project;
      finalProjectDetails = nextProjectDetails;
      finalWorkspaceReadyContext = {
        ...readyWorkspace,
        indexJsonText: manifestAppendResult.indexJsonText,
      };
      finalSelection = buildAssetImportSelection(
        pickedMediaItem,
        downloadResult,
        savedAsset,
        {
          manifestUpdated: true,
          details: manifestAppendResult.details,
        },
      );
      finalStatus = "completed";
      finalMessage =
        "Drive保存、manifest反映、index.json updatedAt同期、更新後再検証が完了しました。";
      finalDiagnostics = [
        ...waitResult.diagnostics,
        ...pickedMediaItemsList.diagnostics,
        ...pickedMediaItem.diagnostics,
        ...downloadResult.diagnostics,
        ...savedAsset.diagnostics,
        ...manifestAppendResult.diagnostics,
        "Photos Picker selection: 完了",
        "画像形式とサイズ確認: 完了",
        "Drive保存: 完了",
        "Drive asset metadata検証: 完了",
        "manifest反映: 完了",
        "index.json updatedAt同期: 完了",
        "更新後再検証: 完了",
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
            setWorkspaceReadyContext(finalWorkspaceReadyContext);
            setDriveProjectReadyContext(finalProject);
            setProjectDetails(finalProjectDetails);
            setProjectSummary(toProjectSummary(finalProject, finalProjectDetails));
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
      assetImportSelection?.driveSaved === true;

    setAssetImportInFlightState(false);
    setAssetImportSelection(null);
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
      setProjectSummary(null);
      setProjectDiagnostics([]);
      return;
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      setProjectStatus("idle");
      setProjectMessage(initialProjectMessage);
      setProjectSummary(null);
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
    setProjectSummary(null);
    setProjectDiagnostics([]);

    try {
      const result = await runDriveOperationStep(requestId, async () =>
        validateIndexJsonProjects(readyContext.indexJsonText),
      );

      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      if (result.status === "notCreated") {
        setProjectStatus("notCreated");
        setProjectMessage("プロジェクトはまだ作成されていません。");
        setProjectSummary(null);
        setProjectDiagnostics(result.diagnostics);
        return;
      }

      if (result.status === "invalid") {
        setProjectStatus("invalid");
        setProjectMessage(
          "Drive上のプロジェクト情報に問題があります。このスライスでは自動修復しません。",
        );
        setProjectSummary(null);
        setProjectDiagnostics(result.diagnostics);
        return;
      }

      const detailResult = await runDriveOperationStep(requestId, (signal) =>
        validateDriveProjectDetails({
          accessToken,
          expectedWorkspaceId: readyContext.workspaceId,
          expectedProjectsRootFolderId: readyContext.projectsRootFolderId,
          project: result.project,
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
        setProjectSummary(null);
        setProjectDiagnostics([
          ...result.diagnostics,
          ...detailResult.diagnostics,
        ]);
        return;
      }

      setProjectStatus("ready");
      setProjectMessage(
        "index.json上のプロジェクト登録とDrive上の詳細を確認しました。",
      );
      applyProjectReadyState(result.project);
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
      setProjectSummary(null);
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

  async function createProject() {
    if (driveOperationInFlightRef.current) {
      return;
    }

    const accessToken = accessTokenRef.current;

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
      setProjectSummary(null);
      setProjectDiagnostics([]);
      return;
    }

    if (driveStatus !== "ready" || !workspaceReadyContext) {
      setProjectStatus("idle");
      setProjectMessage(initialProjectMessage);
      setProjectSummary(null);
      setProjectDiagnostics([
        "Driveワークスペースの確認済み情報を取得できませんでした。",
        "先にDrive状態を再確認し、ready になっていることを確認してください。",
      ]);
      return;
    }

    if (projectStatus !== "notCreated") {
      setProjectDiagnostics([
        "プロジェクト未作成を確認できていないため、作成を開始しませんでした。",
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
    setProjectSummary(null);
    setProjectDiagnostics([]);

    try {
      const result = await createDriveProject({
        accessToken,
        readyContext,
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
      setProjectStatus("ready");
      setProjectMessage(
        "プロジェクトを作成し、index.json上の登録を確認しました。",
      );
      applyProjectReadyState(result.project);
      setProjectDiagnostics(result.diagnostics);
    } catch (error) {
      if (requestId !== driveOperationRequestIdRef.current) {
        return;
      }

      setProjectSummary(null);

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
          setProjectSummary(null);
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
    projectSummary,
    projectDiagnostics,
    projectDetails,
    canImportAssets,
    assetImportStatus,
    assetImportStatusLabel: assetImportStatusLabels[assetImportStatus],
    assetImportMessage,
    assetImportDiagnostics,
    assetImportSelection,
    isAssetImportInFlight,
    canStartAssetImport,
    assetImportBlockedReason,
    connectGoogle,
    disconnectGoogle,
    checkDriveWorkspace,
    createWorkspace,
    checkProject,
    createProject,
    startAssetImport,
    cancelAssetImport,
  };

  return (
    <AppContext.Provider value={value}>
      {hasClientId ? (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onReady={handleScriptReady}
          onError={() => {
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

function toProjectDetails(details: DriveProjectReadyDetails): ProjectDetails {
  return {
    slideCount: details.slideCount,
    assetCount: details.assetCount,
    slides: details.slides.map((slide) => ({
      slideIdPart: formatIdPart(slide.slideId),
      assetIdPart: formatIdPart(slide.assetId),
      assetName: slide.assetName,
      mimeType: slide.mimeType,
      sourceMimeType: slide.sourceMimeType,
      sourceCreateTime: slide.sourceCreateTime ?? "取得なし",
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

function buildAssetImportSelection(
  mediaItem: PhotosPickedMediaItem,
  downloadResult: PhotosPickedPhotoDownloadResult,
  savedAsset?: DriveProjectSavedAsset,
  manifestResult?: {
    manifestUpdated: true;
    details: DriveProjectReadyDetails;
  },
): AssetImportSelection {
  const baseSelection = {
    mediaItemIdPart: formatIdPart(mediaItem.id),
    mediaItemType: "PHOTO" as const,
    filename: mediaItem.mediaFile.filename ?? "未取得",
    sourceMimeType: mediaItem.mediaFile.mimeType,
    sourceCreateTime: mediaItem.createTime,
    downloadedContentType: downloadResult.downloadedContentType,
    downloadedSizeBytes: downloadResult.downloadedSizeBytes,
    sizeLimitBytes: downloadResult.sizeLimitBytes,
  };

  if (!savedAsset) {
    return {
      ...baseSelection,
      driveSaved: false,
      manifestUpdated: false,
    };
  }

  const savedSelection = {
    ...baseSelection,
    driveSaved: true as const,
    assetId: savedAsset.assetId,
    assetIdPart: savedAsset.assetIdPart,
    assetFileId: savedAsset.assetFileId,
    assetFileIdPart: savedAsset.assetFileIdPart,
    driveFilename: savedAsset.driveFilename,
    driveMimeType: savedAsset.driveMimeType,
    driveSizeBytes: savedAsset.driveSizeBytes,
  };

  if (!manifestResult) {
    return {
      ...savedSelection,
      manifestUpdated: false,
    };
  }

  const addedSlide = manifestResult.details.slides.find(
    (slide) =>
      slide.assetId === savedAsset.assetId &&
      slide.assetFileId === savedAsset.assetFileId,
  );

  return {
    ...savedSelection,
    manifestUpdated: true,
    slideIdPart: formatIdPart(addedSlide?.slideId),
  };
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
          "Photos Pickerの選択待ちが300秒でタイムアウトしました。",
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