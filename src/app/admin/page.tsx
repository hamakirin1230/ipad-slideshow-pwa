import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriveStatusSummary } from "@/components/drive-status-summary";
import { ProjectStatusPanel } from "./project-status-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAssetById,
  getProjectAssets,
  mockAssets,
  mockProjects,
} from "@/lib/mock-data";

function getAssetKindLabel(kind: string) {
  switch (kind) {
    case "image":
      return "画像";
    case "video":
      return "動画";
    case "title-card":
      return "タイトル";
    default:
      return kind;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "draft":
      return "下書き";
    case "published":
      return "公開済み";
    default:
      return status;
  }
}

export default function AdminPage() {
  const activeProject = mockProjects[0];
  const selectedAssetCount = mockAssets.filter(
    (asset) => asset.isSelectedForSlideshow,
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">第4-2 プロジェクト作成</Badge>
            <h1 className="mt-3 text-3xl font-bold">管理画面</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              Driveワークスペース ready 後に、index.json上のプロジェクト登録状態を確認します。
              未作成の場合は、最初のプロジェクト1件を作成できます。
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>

        <DriveStatusSummary />
        <ProjectStatusPanel />

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="bg-white text-slate-950">
            <CardHeader>
              <CardTitle>プロジェクト数</CardTitle>
              <CardDescription>仮データ上のスライドショー案件</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{mockProjects.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-white text-slate-950">
            <CardHeader>
              <CardTitle>素材数</CardTitle>
              <CardDescription>候補素材を含む全素材</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{mockAssets.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-white text-slate-950">
            <CardHeader>
              <CardTitle>本編対象素材</CardTitle>
              <CardDescription>チェック済みとして扱う素材</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{selectedAssetCount}</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="bg-white text-slate-950">
            <CardHeader>
              <CardTitle>プロジェクト一覧</CardTitle>
              <CardDescription>
                1つのスライドショーを1つのプロジェクトとして扱います。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mockProjects.map((project) => {
                const projectAssets = getProjectAssets(project);

                return (
                  <div
                    key={project.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold">{project.title}</h2>
                        <p className="mt-1 text-sm text-slate-600">
                          {project.description}
                        </p>
                      </div>
                      <Badge
                        variant={
                          project.status === "published"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {getStatusLabel(project.status)}
                      </Badge>
                    </div>

                    <dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <div>
                        <dt className="font-medium text-slate-900">
                          ワークスペース
                        </dt>
                        <dd>{project.workspaceName}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-900">更新日</dt>
                        <dd>{project.updatedAt}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-900">
                          スライド数
                        </dt>
                        <dd>{project.slideItems.length}件</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-900">
                          使用素材数
                        </dt>
                        <dd>{projectAssets.length}件</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="bg-white text-slate-950">
            <CardHeader>
              <CardTitle>素材一覧</CardTitle>
              <CardDescription>
                Google Photos Picker連携前の仮素材です。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{asset.title}</h2>
                      <Badge variant="outline">
                        {getAssetKindLabel(asset.kind)}
                      </Badge>
                      {asset.isSelectedForSlideshow ? (
                        <Badge variant="secondary">本編対象</Badge>
                      ) : (
                        <Badge variant="outline">候補のみ</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {asset.filename}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {asset.width && asset.height
                        ? `${asset.width} x ${asset.height} / `
                        : ""}
                      {asset.durationSeconds
                        ? `${asset.durationSeconds}秒 / `
                        : ""}
                      {asset.sizeLabel}
                    </p>
                    {asset.note ? (
                      <p className="mt-2 text-sm text-slate-500">
                        {asset.note}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="bg-white text-slate-950">
            <CardHeader>
              <CardTitle>本編スライド順</CardTitle>
              <CardDescription>
                現在選択中の仮プロジェクト: {activeProject.title}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeProject.slideItems
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((slideItem) => {
                  const asset = getAssetById(slideItem.assetId);

                  return (
                    <div
                      key={slideItem.id}
                      className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[80px_1fr_160px]"
                    >
                      <div>
                        <p className="text-sm text-slate-500">順番</p>
                        <p className="text-2xl font-bold">{slideItem.order}</p>
                      </div>

                      <div>
                        <h2 className="font-semibold">
                          {asset?.title ?? "不明な素材"}
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                          {slideItem.caption ?? "テロップなし"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          表示方法: {slideItem.fit} / テロップ:{" "}
                          {slideItem.captionPreset}
                        </p>
                      </div>

                      <div className="md:text-right">
                        <p className="text-sm text-slate-500">表示時間</p>
                        <p className="text-xl font-bold">
                          {slideItem.durationSeconds}秒
                        </p>
                      </div>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}