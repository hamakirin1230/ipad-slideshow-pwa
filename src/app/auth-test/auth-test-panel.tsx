"use client";

import Script from "next/script";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DRIVE_FILE_SCOPE,
  type AuthStatus,
  type GoogleTokenClient,
  getGoogleClientId,
  hasGoogleClientId,
  hasGrantedDriveFileScope,
} from "@/lib/google-auth";

const statusLabel: Record<AuthStatus, string> = {
  loading_script: "Google認証の準備中",
  ready: "未接続",
  missing_client_id: "Google Client ID が未設定",
  requesting: "Google認証中",
  connected: "Google Drive連携の準備ができています",
  scope_missing: "drive.file の許可が不足しています",
  error: "Google認証を完了できませんでした",
};

export function AuthTestPanel() {
  const clientId = getGoogleClientId();
  const hasClientId = hasGoogleClientId();

  const accessTokenRef = useRef<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);

  const [status, setStatus] = useState<AuthStatus>(
    hasClientId ? "loading_script" : "missing_client_id",
  );
  const [driveFileGranted, setDriveFileGranted] = useState<boolean | null>(null);
  const [message, setMessage] = useState(
    hasClientId
      ? "Google認証ライブラリを読み込んでいます。"
      : ".env.local の NEXT_PUBLIC_GOOGLE_CLIENT_ID を確認してください。",
  );

  function handleScriptReady() {
    if (!hasClientId) {
      setStatus("missing_client_id");
      setMessage(".env.local の NEXT_PUBLIC_GOOGLE_CLIENT_ID を確認してください。");
      return;
    }

    const oauth2 = window.google?.accounts?.oauth2;

    if (!oauth2) {
      setStatus("error");
      setMessage("Google認証ライブラリを利用できませんでした。");
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
          setStatus("error");
          setMessage("Google認証でエラーが返されました。もう一度試してください。");
          return;
        }

        if (!tokenResponse.access_token) {
          accessTokenRef.current = null;
          setDriveFileGranted(null);
          setStatus("error");
          setMessage("アクセストークンを受け取れませんでした。");
          return;
        }

        accessTokenRef.current = tokenResponse.access_token;

        const granted = hasGrantedDriveFileScope(tokenResponse);
        setDriveFileGranted(granted);

        if (granted) {
          setStatus("connected");
          setMessage(
            "access_token を受け取り、drive.file の許可を確認できました。tokenの実値は画面にもconsoleにも出していません。",
          );
          return;
        }

        setStatus("scope_missing");
        setMessage("access_token は受け取りましたが、drive.file の許可を確認できませんでした。");
      },
      error_callback: () => {
        accessTokenRef.current = null;
        setDriveFileGranted(null);
        setStatus("error");
        setMessage("Google認証のポップアップを開けない、または認証画面が閉じられた可能性があります。");
      },
    });

    setStatus("ready");
    setMessage("Google認証ボタンを押せる状態です。");
  }

  function handleConnect() {
    if (!hasClientId) {
      setStatus("missing_client_id");
      setMessage(".env.local の NEXT_PUBLIC_GOOGLE_CLIENT_ID を確認してください。");
      return;
    }

    if (!tokenClientRef.current) {
      setStatus("loading_script");
      setMessage("Google認証ライブラリの準備がまだ終わっていません。少し待ってから再試行してください。");
      return;
    }

    setStatus("requesting");
    setMessage("Googleアカウント選択と許可確認を行っています。");
    tokenClientRef.current.requestAccessToken();
  }

  function handleReset() {
    accessTokenRef.current = null;
    setDriveFileGranted(null);
    setStatus(hasClientId ? "ready" : "missing_client_id");
    setMessage(
      hasClientId
        ? "この画面の接続状態をリセットしました。Google側の許可取り消しは行っていません。"
        : ".env.local の NEXT_PUBLIC_GOOGLE_CLIENT_ID を確認してください。",
    );
  }

  return (
    <>
      {hasClientId ? (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onReady={handleScriptReady}
          onError={() => {
            setStatus("error");
            setMessage("Google認証ライブラリの読み込みに失敗しました。");
          }}
        />
      ) : null}

      <Card className="border-white/10 bg-white/5 text-slate-50">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Google認証の準備状態</CardTitle>
            <Badge variant={status === "connected" ? "secondary" : "outline"}>
              {statusLabel[status]}
            </Badge>
          </div>
          <CardDescription className="text-slate-300">
            このページでは drive.file の許可確認だけを行います。Driveフォルダ作成やファイル保存はまだ行いません。
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 text-sm text-slate-300">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">現在の状態</p>
            <p className="mt-2">{message}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="font-semibold text-slate-50">Client ID</p>
              <p className="mt-2">
                {hasClientId ? "設定済みです。実値は表示しません。" : "未設定です。"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="font-semibold text-slate-50">drive.file scope</p>
              <p className="mt-2">
                {driveFileGranted === null
                  ? "未確認です。"
                  : driveFileGranted
                    ? "許可済みです。"
                    : "不足しています。"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleConnect}
              disabled={status === "loading_script" || status === "requesting" || !hasClientId}
            >
              Google認証を開始
            </Button>

            <Button type="button" variant="outline" onClick={handleReset}>
              この画面の接続状態をリセット
            </Button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">安全確認</p>
            <p className="mt-2">
              access_token は useRef の中だけに保持します。画面表示、console出力、localStorage、IndexedDB、Cookie保存は行いません。
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}