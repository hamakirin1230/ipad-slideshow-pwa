import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriveSettingsPanel } from "./drive-settings-panel";
import { OfflineDbCheckPanel } from "./offline-db-check-panel";

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-50 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">Google / Drive / 端末保存</Badge>
            <h1 className="mt-3 text-3xl font-bold">設定</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              Google接続、Google Driveの保存領域、端末内データベース（IndexedDB）の状態を確認する画面です。
              プロジェクト、素材追加、端末への同期、再生確認は管理画面と再生画面で扱います。
            </p>
          </div>
          <Button asChild variant="secondary" className="min-h-11">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>

        <DriveSettingsPanel />

        <OfflineDbCheckPanel />
      </div>
    </main>
  );
}
