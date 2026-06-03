"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppState } from "@/app/app-providers";

export function DriveProjectWorkspacePanel() {
  const { driveStatus, projectStatus, projectSummary } = useAppState();

  const hasReadyProject = driveStatus === "ready" && projectStatus === "ready" && projectSummary;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>Driveプロジェクト数</CardTitle>
            <CardDescription>index.json.projects で確認済みの件数</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{hasReadyProject ? 1 : 0}</p>
          </CardContent>
        </Card>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>素材数</CardTitle>
            <CardDescription>Drive assets/ 配下の素材管理</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
            <p className="mt-2 text-sm text-slate-500">
              素材保存は後続コミットで追加します。
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>本編スライド数</CardTitle>
            <CardDescription>manifest.json.slides の編集対象</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
            <p className="mt-2 text-sm text-slate-500">
              スライド編集は後続コミットで追加します。
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>Driveプロジェクト</CardTitle>
            <CardDescription>
              Drive上で検証済みの最初のプロジェクト1件を表示します。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {projectSummary ? (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{projectSummary.title}</h2>
                    <p className="mt-1 break-all text-sm text-slate-600">
                      {projectSummary.manifestPath}
                    </p>
                  </div>
                  <Badge
                    variant={projectStatus === "ready" ? "default" : "secondary"}
                  >
                    {projectStatus === "ready" ? "Drive確認済み" : "確認待ち"}
                  </Badge>
                </div>

                <dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-slate-900">projectId</dt>
                    <dd>{projectSummary.projectIdPart}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">作成日時</dt>
                    <dd>{projectSummary.createdAt}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">更新日時</dt>
                    <dd>{projectSummary.updatedAt}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">スライド編集</dt>
                    <dd>後続コミットで追加</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
                Drive project はまだ表示できません。上のDriveプロジェクト状態で
                ready になっていることを確認してください。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>素材管理</CardTitle>
            <CardDescription>
              Google Photos Picker 連携後に、assets/ 配下へ保存する素材を扱います。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              現時点では素材一覧をDriveから読み取りません。次の段階で Google
              Photos Picker と assets/ 保存フローを追加します。
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>本編スライド順</CardTitle>
            <CardDescription>
              manifest.json.slides を編集・保存するUIは後続コミットで追加します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              現在の第4-2では、プロジェクト作成と検証までを扱います。
              スライド追加、並べ替え、表示秒数、テロップ設定はまだ行いません。
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
