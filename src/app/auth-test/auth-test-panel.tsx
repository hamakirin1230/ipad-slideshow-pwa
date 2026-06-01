"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppState } from "@/app/app-providers";

export function AuthTestPanel() {
  const {
    googleStatus,
    googleStatusLabel,
    googleMessage,
    driveFileGranted,
    connectGoogle,
    disconnectGoogle,
  } = useAppState();

  const canConnect =
    googleStatus === "notConnected" ||
    googleStatus === "error" ||
    googleStatus === "scopeMissing";

  const canDisconnect =
    googleStatus === "connected" ||
    googleStatus === "connecting" ||
    googleStatus === "error" ||
    googleStatus === "scopeMissing";

  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Google認証の準備状態</CardTitle>
          <Badge variant={googleStatus === "connected" ? "secondary" : "outline"}>
            {googleStatusLabel}
          </Badge>
        </div>
        <CardDescription className="text-slate-300">
          このページはOAuth単体確認用の開発ページです。認証処理はAppProvidersの共有状態を使います。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-slate-300">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">現在の状態</p>
          <p className="mt-2">{googleMessage}</p>
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

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={connectGoogle}
            disabled={!canConnect}
          >
            Google認証を開始
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={disconnectGoogle}
            disabled={!canDisconnect}
          >
            このセッションの接続を解除
          </Button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">安全確認</p>
          <p className="mt-2">
            access_token はAppProviders内部のuseRefだけに保持します。画面表示、console出力、localStorage、IndexedDB、Cookie保存は行いません。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}