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
  findWorkspaceChildCandidatesByRole,
  findWorkspaceRootCandidates,
  readDriveTextFile,
  validateWorkspaceJsonBodies,
  validateWorkspaceMetadata,
  type DriveWorkspaceChildRole,
  type DriveWorkspaceRootCandidate,
} from "@/lib/google-drive";

const DRIVE_CHECK_TIMEOUT_MS = 15_000;

export type DriveWorkspaceStatus =
  | "unchecked"
  | "checking"
  | "notCreated"
  | "foundCandidate"
  | "metadataVerified"
  | "ready"
  | "multipleCandidates"
  | "invalidWorkspace"
  | "unsupportedVersion"
  | "authRequired"
  | "operationFailed";

export type DriveCandidateSummary = {
  name: string;
  createdTime: string;
  modifiedTime: string;
  workspaceIdPart: string;
};

const childRoles: DriveWorkspaceChildRole[] = [
  "workspace",
  "index",
  "projectsRoot",
];

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

  connectGoogle: () => void;
  disconnectGoogle: () => void;
  checkDriveWorkspace: () => void;
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
  notCreated: "Driveワークスペース未作成",
  foundCandidate: "Driveワークスペース候補を検出",
  metadataVerified: "Driveワークスペースmetadata確認済み",
  ready: "Driveワークスペース準備済み",
  multipleCandidates: "Driveワークスペース候補が複数あり要確認",
  invalidWorkspace: "Driveワークスペース構造に問題あり",
  unsupportedVersion: "schemaVersion非対応",
  authRequired: "Google再接続が必要",
  operationFailed: "Drive操作失敗",
};

const initialDriveMessage =
  "このセッションでは、まだDriveワークスペース確認を実行していません。";

const AppContext = createContext<AppContextValue | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const clientId = getGoogleClientId();
  const hasClientId = hasGoogleClientId();

  const accessTokenRef = useRef<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const driveCheckAbortRef = useRef<AbortController | null>(null);
  const driveCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const driveCheckRequestIdRef = useRef(0);
  const driveCheckInFlightRef = useRef(false);

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

  function clearDriveCheckTimeout() {
    if (driveCheckTimeoutRef.current) {
      clearTimeout(driveCheckTimeoutRef.current);
      driveCheckTimeoutRef.current = null;
    }
  }

  function abortDriveCheck() {
    driveCheckRequestIdRef.current += 1;
    clearDriveCheckTimeout();

    if (driveCheckAbortRef.current) {
      driveCheckAbortRef.current.abort();
      driveCheckAbortRef.current = null;
    }

    driveCheckInFlightRef.current = false;
  }

  function resetDriveState() {
    setDriveStatus("unchecked");
    setDriveMessage(initialDriveMessage);
    setDriveCandidates([]);
    setDriveDiagnostics([]);
  }

  function handleScriptReady() {
    if (!hasClientId) {
      accessTokenRef.current = null;
      tokenClientRef.current = null;
      setDriveFileGranted(null);
      setGoogleStatus("missingClientId");
      setGoogleMessage("NEXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です。");
      abortDriveCheck();
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
      abortDriveCheck();
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
          abortDriveCheck();
          resetDriveState();
          return;
        }

        if (!tokenResponse.access_token) {
          accessTokenRef.current = null;
          setDriveFileGranted(null);
          setGoogleStatus("error");
          setGoogleMessage("アクセストークンを受け取れませんでした。");
          abortDriveCheck();
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
          abortDriveCheck();
          resetDriveState();
          return;
        }

        accessTokenRef.current = tokenResponse.access_token;
        setDriveFileGranted(true);
        setGoogleStatus("connected");
        setGoogleMessage(
          "Google接続済みです。access_token の実値は表示・保存していません。",
        );
        abortDriveCheck();
        resetDriveState();
      },
      error_callback: () => {
        accessTokenRef.current = null;
        setDriveFileGranted(null);
        setGoogleStatus("error");
        setGoogleMessage(
          "Google認証のポップアップを開けない、または認証画面が閉じられた可能性があります。",
        );
        abortDriveCheck();
        resetDriveState();
      },
    });

    setGoogleStatus("notConnected");
    setGoogleMessage("Google接続を開始できます。");
    abortDriveCheck();
    resetDriveState();
  }

  function connectGoogle() {
    abortDriveCheck();

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
    abortDriveCheck();
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
    if (driveCheckInFlightRef.current) {
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
      return;
    }

    driveCheckInFlightRef.current = true;
    const requestId = driveCheckRequestIdRef.current + 1;
    driveCheckRequestIdRef.current = requestId;

    const controller = new AbortController();
    driveCheckAbortRef.current = controller;

    clearDriveCheckTimeout();
    driveCheckTimeoutRef.current = setTimeout(() => {
      controller.abort();
    }, DRIVE_CHECK_TIMEOUT_MS);

    setDriveStatus("checking");
    setDriveMessage("Driveワークスペース候補を検索しています。");
    setDriveCandidates([]);
    setDriveDiagnostics([]);

    try {
      const candidates = await findWorkspaceRootCandidates(
        accessToken,
        controller.signal,
      );

      if (requestId !== driveCheckRequestIdRef.current) {
        return;
      }

      const summaries = candidates.map(toCandidateSummary);
      setDriveCandidates(summaries);

      if (candidates.length === 0) {
        setDriveStatus("notCreated");
        setDriveMessage(
          "Driveワークスペース候補は見つかりませんでした。このスライスでは作成はまだ行いません。",
        );
        setDriveDiagnostics([]);
        return;
      }

      if (candidates.length >= 2) {
        setDriveStatus("multipleCandidates");
        setDriveMessage(
          "Driveワークスペース候補が2件以上あります。このスライスでは自動選択・削除・修復は行いません。",
        );
        setDriveDiagnostics([
          "Driveワークスペースroot候補が2件以上見つかりました。",
        ]);
        return;
      }

      setDriveStatus("foundCandidate");
      setDriveMessage(
        "Driveワークスペース候補を1件見つけました。root直下の必須構成metadataを確認しています。",
      );

      const childCandidates = await findWorkspaceChildCandidates(
        accessToken,
        candidates[0].id,
        controller.signal,
      );

      if (requestId !== driveCheckRequestIdRef.current) {
        return;
      }

      const metadataResult = validateWorkspaceMetadata(
        candidates[0],
        childCandidates,
      );

      setDriveDiagnostics(metadataResult.diagnostics);

      if (metadataResult.status === "invalidWorkspace") {
        setDriveStatus("invalidWorkspace");
        setDriveMessage(
          "Driveワークスペース候補のmetadataに問題があります。このスライスでは自動修復は行いません。",
        );
        return;
      }

      setDriveStatus("metadataVerified");
      setDriveMessage(
        "Driveワークスペース候補の構成ファイルを確認しました。workspace.json / index.json の本文を検証しています。",
      );

      const [workspaceJsonText, indexJsonText] = await Promise.all([
        readDriveTextFile(
          accessToken,
          metadataResult.workspaceJsonFileId,
          controller.signal,
        ),
        readDriveTextFile(
          accessToken,
          metadataResult.indexJsonFileId,
          controller.signal,
        ),
      ]);

      if (requestId !== driveCheckRequestIdRef.current) {
        return;
      }

      const jsonBodyResult = validateWorkspaceJsonBodies({
        expectedWorkspaceId: metadataResult.workspaceId,
        workspaceJsonText,
        indexJsonText,
      });

      setDriveDiagnostics([
        ...metadataResult.diagnostics,
        ...jsonBodyResult.diagnostics,
      ]);

      if (jsonBodyResult.status === "invalidWorkspace") {
        setDriveStatus("invalidWorkspace");
        setDriveMessage(
          "Driveワークスペース候補のJSON本文に問題があります。このスライスでは自動修復は行いません。",
        );
        return;
      }

      if (jsonBodyResult.status === "unsupportedVersion") {
        setDriveStatus("unsupportedVersion");
        setDriveMessage(
          "Driveワークスペース候補のschemaVersionは、このPWAでは対応していません。",
        );
        return;
      }

      setDriveStatus("ready");
      setDriveMessage(
        "Driveワークスペース準備済みです。metadataとJSON本文の整合を確認しました。",
      );
    } catch (error) {
      if (requestId !== driveCheckRequestIdRef.current) {
        return;
      }

      setDriveCandidates([]);
      setDriveDiagnostics([]);

      if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
        accessTokenRef.current = null;
        setDriveFileGranted(null);
        setGoogleStatus(hasClientId ? "notConnected" : "missingClientId");
        setGoogleMessage(
          "Drive APIの認証に失敗しました。Googleへ再接続してください。",
        );
        setDriveStatus("authRequired");
        setDriveMessage(
          "Google再接続が必要です。再接続後にDrive状態を確認してください。",
        );
        return;
      }

      setDriveStatus("operationFailed");
      setDriveMessage(
        "Drive状態確認に失敗しました。通信状態を確認して、もう一度Drive状態を確認してください。",
      );
    } finally {
      if (requestId === driveCheckRequestIdRef.current) {
        clearDriveCheckTimeout();
        driveCheckAbortRef.current = null;
        driveCheckInFlightRef.current = false;
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
    connectGoogle,
    disconnectGoogle,
    checkDriveWorkspace,
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
            abortDriveCheck();
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

function toCandidateSummary(
  candidate: DriveWorkspaceRootCandidate,
): DriveCandidateSummary {
  return {
    name: candidate.name,
    createdTime: candidate.createdTime ?? "未取得",
    modifiedTime: candidate.modifiedTime ?? "未取得",
    workspaceIdPart: formatWorkspaceIdPart(candidate.appProperties.workspaceId),
  };
}

function formatWorkspaceIdPart(workspaceId: string | undefined) {
  if (!workspaceId) {
    return "未設定";
  }

  return `${workspaceId.slice(0, 8)}...`;
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