import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PublishHistoryClient } from "./publish-history-client";

export default function PublishHistoryPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-50 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">公開履歴</Badge>
              <Badge variant="outline" className="border-sky-400/50 text-sky-100">
                安全確認付きロールバック
              </Badge>
            </div>
            <h1 className="mt-3 text-3xl font-bold">公開履歴</h1>
            <p className="mt-2 max-w-3xl text-slate-300">
              Google Driveに保存された公開履歴を閲覧します。
              最新状態で影響を再確認した場合だけ、安全確認を経てロールバックを実行できます。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary" className="min-h-11">
              <Link href="/admin">つくるへ戻る</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="min-h-11 border-slate-500 bg-transparent text-slate-100 hover:bg-white/10 hover:text-white"
            >
              <Link href="/settings">Google接続を確認</Link>
            </Button>
          </div>
        </header>

        <PublishHistoryClient />
      </div>
    </main>
  );
}
