import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriveStatusSummary } from "@/components/drive-status-summary";
import { ProjectStatusPanel } from "./project-status-panel";
import { DriveProjectWorkspacePanel } from "./drive-project-workspace-panel";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">第4-3-1 素材追加UI土台</Badge>
            <h1 className="mt-3 text-3xl font-bold">管理画面</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              Driveワークスペース ready 後に、project詳細と空のslides[]を確認します。
              このスライスでは素材追加の状態表示までを追加し、外部API実行はまだ行いません。
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>

        <DriveStatusSummary />
        <ProjectStatusPanel />
        <DriveProjectWorkspacePanel />
      </div>
    </main>
  );
}
