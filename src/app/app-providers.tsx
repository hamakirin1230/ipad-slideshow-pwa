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
  DRIVE_FILE_SCOPE,
  type GoogleConnectionStatus,
  type GoogleTokenClient,
  getGoogleClientId,
  hasGoogleClientId,
  hasGrantedDriveFileScope,
} from "@/lib/google-auth";
import {
  DriveApiError,
  DriveWorkspaceCreateError,
  createDriveWorkspace,
  findWorkspaceChildCandidatesByRole,
  findWorkspaceRootCandidates,
  readDriveTextFile,
  validateIndexJsonProjects,
  validateWorkspaceJsonBodies,
  validateWorkspaceMetadata,
  type DriveCreatedWorkspaceItemRole,
  type DriveProjectSummary,
  type DriveWorkspaceChildRole,
  type DriveWorkspaceReadyContext,
  type DriveWorkspaceRootCandidate,
} from "@/lib/google-drive";

const DRIVE_OPERATION_TIMEOUT_MS = 15_000;

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
};

type DriveWorkspaceCheckResult = {
  status: DriveWorkspaceCheckStatus;
  message: string;
  candidates: DriveCandidateSummary[];
  diagnostics: string[];
  readyContext?: DriveWorkspaceReadyContext;
};

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

const createdRoleLabels: Record<DriveCreatedWorkspaceItemRole, string> = {
  workspaceRoot: "workspace root folder",
  workspace: "workspace.json",
  index: "index.json",
  projectsRoot: "projects/ folder",
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

  connectGoogle: () => void;
  disconnectGoogle: () => void;
  checkDriveWorkspace: () => void;
  createWorkspace: () => void;
  checkProject: () => void;
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
  error: "プロジェクト確認失敗",
};

const initialDriveMessage =
  "このセッションでは、まだDriveワークスペース確認を実行していません。";

const initialProjectMessage =
  "Driveワークスペース ready 後にプロジェクト状態を確認します。";

const AppContext = createContext<AppContextValue | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const clientId = getGoogleClientId();
  const hasClientId = hasGoogleClientId();

  const accessTokenRef = useRef<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const driveOperationAbortRef = useRef<AbortController | null>(null);
  const driveOperationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const driveOperationRequestIdRef = useRef(0);
  const driveOperationInFlightRef = useRef(false);

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

  function resetProjectState() {
    setProjectStatus("idle");
    setProjectMessage(initialProjectMessage);
    setProjectSummary(null);
    setProjectDiagnostics([]);
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

      setProjectStatus("ready");
      setProjectMessage("index.json上のプロジェクト登録を確認しました。");
      setProjectSummary(toProjectSummary(result.project));
      setProjectDiagnostics(result.diagnostics);
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
      setProjectDiagnostics([]);
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
    connectGoogle,
    disconnectGoogle,
    checkDriveWorkspace,
    createWorkspace,
    checkProject,
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

function toProjectSummary(project: DriveProjectSummary): ProjectSummary {
  return {
    projectIdPart: formatIdPart(project.projectId),
    title: project.title,
    manifestPath: project.manifestPath,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function formatIdPart(id: string | undefined) {
  if (!id) {
    return "未設定";
  }

  return `${id.slice(0, 8)}...`;
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