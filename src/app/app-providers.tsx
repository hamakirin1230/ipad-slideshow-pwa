"use client";

import Script from "next/script";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import {
  DRIVE_FILE_SCOPE,
  type GoogleConnectionStatus,
  type GoogleTokenClient,
  getGoogleClientId,
  hasGoogleClientId,
  hasGrantedDriveFileScope,
} from "@/lib/google-auth";

export type DriveWorkspaceStatus =
  | "unchecked"
  | "checking"
  | "notCreated"
  | "ready"
  | "multipleCandidates"
  | "invalidWorkspace"
  | "unsupportedVersion"
  | "authRequired"
  | "operationFailed";

type AppContextValue = {
  googleStatus: GoogleConnectionStatus;
  googleStatusLabel: string;
  googleMessage: string;
  driveFileGranted: boolean | null;

  driveStatus: DriveWorkspaceStatus;
  driveStatusLabel: string;
  driveMessage: string;

  connectGoogle: () => void;
  disconnectGoogle: () => void;
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

  function resetDriveState() {
    setDriveStatus("unchecked");
    setDriveMessage(initialDriveMessage);
  }

  function handleScriptReady() {
    if (!hasClientId) {
      accessTokenRef.current = null;
      tokenClientRef.current = null;
      setDriveFileGranted(null);
      setGoogleStatus("missingClientId");
      setGoogleMessage("NEXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です。");
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
          setGoogleMessage("Google認証でエラーが返されました。もう一度試してください。");
          resetDriveState();
          return;
        }

        if (!tokenResponse.access_token) {
          accessTokenRef.current = null;
          setDriveFileGranted(null);
          setGoogleStatus("error");
          setGoogleMessage("アクセストークンを受け取れませんでした。");
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
          resetDriveState();
          return;
        }

        accessTokenRef.current = tokenResponse.access_token;
        setDriveFileGranted(true);
        setGoogleStatus("connected");
        setGoogleMessage(
          "Google接続済みです。access_token の実値は表示・保存していません。",
        );
        resetDriveState();
      },
      error_callback: () => {
        accessTokenRef.current = null;
        setDriveFileGranted(null);
        setGoogleStatus("error");
        setGoogleMessage(
          "Google認証のポップアップを開けない、または認証画面が閉じられた可能性があります。",
        );
        resetDriveState();
      },
    });

    setGoogleStatus("notConnected");
    setGoogleMessage("Google接続を開始できます。");
    resetDriveState();
  }

  function connectGoogle() {
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

  const value: AppContextValue = {
    googleStatus,
    googleStatusLabel: googleStatusLabels[googleStatus],
    googleMessage,
    driveFileGranted,
    driveStatus,
    driveStatusLabel: driveStatusLabels[driveStatus],
    driveMessage,
    connectGoogle,
    disconnectGoogle,
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