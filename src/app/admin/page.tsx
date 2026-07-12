import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriveStatusSummary } from "@/components/drive-status-summary";
import { ProjectStatusPanel } from "./project-status-panel";
import { OfflineSyncPanel } from "./offline-sync-panel";
import { OfflineConfirmedStorePanel } from "./offline-confirmed-store-panel";
import { DriveProjectWorkspacePanel } from "./drive-project-workspace-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">Drive / offline sync / storage</Badge>
            <h1 className="mt-3 text-3xl font-bold">管理画面</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              DriveワークスペースとDrive projectを確認し、Drive上のmanifestと素材を
              IndexedDB offline store へ同期する管理導線です。
              同期実行、confirmed store 確認、端末ストレージ管理、project単位のローカル削除、
              再生画面へのproject指定導線を扱います。
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>

        <DriveStatusSummary />
        <ProjectStatusPanel />
        <Card className="border-sky-400/20 bg-sky-400/5 text-slate-50">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>公開履歴</CardTitle>
              <Badge variant="outline" className="border-sky-400/50 text-sky-100">
                読み取り専用
              </Badge>
            </div>
            <CardDescription className="text-slate-300">
              Driveに既に保存されている公開履歴を閲覧します。公開・ロールバック・削除は実行しません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary" className="min-h-11">
              <Link href="/admin/history">公開履歴を見る</Link>
            </Button>
          </CardContent>
        </Card>
        <OfflineSyncPanel />
        <OfflineConfirmedStorePanel />
        <DriveProjectWorkspacePanel />
      </div>
    </main>
  );
}
