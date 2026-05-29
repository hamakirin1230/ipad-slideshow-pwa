import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthTestPanel } from "./auth-test-panel";

export default function AuthTestPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">第3-4 Google OAuth検証</Badge>
            <h1 className="mt-3 text-3xl font-bold">Google認証テスト</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              Google Drive連携の準備状態を確認するための開発用ページです。
              この段階ではDriveフォルダ作成、ファイル保存、画像同期は行いません。
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/settings">設定へ戻る</Link>
          </Button>
        </div>

        <Card className="border-white/10 bg-white/5 text-slate-50">
          <CardHeader>
            <CardTitle>このページで確認すること</CardTitle>
            <CardDescription className="text-slate-300">
              まずはClient IDがローカル環境から読めるかだけを確認します。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-300">
            <p>・Google認証用のClient IDが設定されているか</p>
            <p>・Client IDの実値を画面に表示しないこと</p>
            <p>・アクセストークンをまだ取得しないこと</p>
            <p>・Drive APIによるファイル操作をまだ行わないこと</p>
          </CardContent>
        </Card>

        <AuthTestPanel />
      </div>
    </main>
  );
}