"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasGoogleClientId } from "@/lib/google-auth";

export function AuthTestPanel() {
  const hasClientId = hasGoogleClientId();

  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Google認証の準備状態</CardTitle>
          <Badge variant={hasClientId ? "secondary" : "destructive"}>
            {hasClientId ? "Client ID設定済み" : "Client ID未設定"}
          </Badge>
        </div>
        <CardDescription className="text-slate-300">
          この表示は、.env.local の NEXT_PUBLIC_GOOGLE_CLIENT_ID が読めているかだけを確認します。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-300">
        {hasClientId ? (
          <p>
            Google OAuth用のClient IDを読み込めています。次の段階でGoogle公式スクリプトと認証ボタンを追加します。
          </p>
        ) : (
          <p>
            Client IDを読み込めていません。.env.local の変数名、保存状態、開発サーバーの再起動が必要かを確認してください。
          </p>
        )}

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">安全確認</p>
          <p className="mt-2">
            Client IDの実値は、この画面には表示しません。アクセストークンの取得もまだ行いません。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}