import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriveStatusSummary } from "@/components/drive-status-summary";
import { ProjectStatusPanel } from "./project-status-panel";
import { OfflineSyncPanel } from "./offline-sync-panel";
import { OfflineConfirmedStorePanel } from "./offline-confirmed-store-panel";
import { DriveProjectWorkspacePanel } from "./drive-project-workspace-panel";

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
        <OfflineSyncPanel />
        <OfflineConfirmedStorePanel />
        <DriveProjectWorkspacePanel />
      </div>
    </main>
  );
}
