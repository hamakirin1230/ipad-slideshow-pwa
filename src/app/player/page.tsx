import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DriveStatusSummary } from "@/components/drive-status-summary";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAssetById, mockActiveProject } from "@/lib/mock-data";

function getAssetKindLabel(kind: string | undefined) {
  switch (kind) {
    case "image":
      return "画像";
    case "video":
      return "動画";
    case "title-card":
      return "タイトル";
    default:
      return "不明";
  }
}

function getCaptionPresetLabel(preset: string) {
  switch (preset) {
    case "none":
      return "なし";
    case "bottom":
      return "下部";
    case "center":
      return "中央";
    default:
      return preset;
  }
}

export default function PlayerPage() {
  const activeProject = mockActiveProject;
  const slideItems = activeProject.slideItems
    .slice()
    .sort((a, b) => a.order - b.order);

  const currentSlide = slideItems[0];
  const currentAsset = currentSlide
    ? getAssetById(currentSlide.assetId)
    : undefined;

  const totalDurationSeconds = slideItems.reduce(
    (total, slideItem) => total + slideItem.durationSeconds,
    0,
  );

  const previewProgress =
    slideItems.length > 0 ? Math.round((1 / slideItems.length) * 100) : 0;

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">第2-2 再生画面基本UI</Badge>
            <h1 className="mt-3 text-3xl font-bold">再生画面</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              第2ゴールでは、実際の再生制御に入る前に、仮データを使って
              iPad本番再生画面の情報配置を確認します。
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>
        <DriveStatusSummary />
        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>選択中プロジェクト</CardTitle>
              <CardDescription className="text-slate-300">
                再生対象の仮プロジェクト
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{activeProject.title}</p>
              <p className="mt-2 text-sm text-slate-400">
                {activeProject.description}
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>スライド数</CardTitle>
              <CardDescription className="text-slate-300">
                本編スライド順に含まれる件数
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{slideItems.length}</p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>想定再生時間</CardTitle>
              <CardDescription className="text-slate-300">
                仮の表示秒数の合計
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalDurationSeconds}秒</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>再生プレビュー</CardTitle>
                  <CardDescription className="text-slate-300">
                    現在のスライド表示イメージです。第2-2では1枚目を固定表示します。
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-slate-500 text-slate-200">
                  UIのみ
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex aspect-[16/9] flex-col items-center justify-center rounded-3xl border border-white/10 bg-slate-950 p-6 text-center shadow-inner">
                <p className="text-sm text-slate-500">
                  {getAssetKindLabel(currentAsset?.kind)}
                </p>
                <h2 className="mt-3 text-3xl font-bold">
                  {currentAsset?.title ?? "表示する素材がありません"}
                </h2>
                <p className="mt-3 max-w-xl text-slate-300">
                  {currentSlide?.caption ?? "テロップなし"}
                </p>
                <p className="mt-6 text-sm text-slate-500">
                  {currentAsset?.filename ?? "no-asset"}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm text-slate-300">
                  <span>
                    {slideItems.length > 0
                      ? `1 / ${slideItems.length}`
                      : "0 / 0"}
                  </span>
                  <span>{previewProgress}%</span>
                </div>
                <Progress value={previewProgress} />
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="secondary" disabled>
                  前へ
                </Button>
                <Button variant="secondary" disabled>
                  再生
                </Button>
                <Button variant="secondary" disabled>
                  一時停止
                </Button>
                <Button variant="secondary" disabled>
                  次へ
                </Button>
              </div>

              <p className="text-center text-sm text-slate-500">
                ボタンは第2-2では見た目だけです。実際の再生制御は後続ゴールで実装します。
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>再生前チェック</CardTitle>
              <CardDescription className="text-slate-300">
                第2-2では状態表示のみです。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span>公開済みmanifest</span>
                  <Badge variant="outline" className="border-slate-500 text-slate-200">
                    後続
                  </Badge>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span>iPad内同期</span>
                  <Badge variant="outline" className="border-slate-500 text-slate-200">
                    後続
                  </Badge>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span>オフライン再生テスト</span>
                  <Badge variant="outline" className="border-slate-500 text-slate-200">
                    後続
                  </Badge>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span>本番モード</span>
                  <Badge variant="outline" className="border-slate-500 text-slate-200">
                    後続
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>スライド順リスト</CardTitle>
              <CardDescription className="text-slate-300">
                Project内のSlideItemを順番どおりに表示します。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {slideItems.map((slideItem) => {
                const asset = getAssetById(slideItem.assetId);

                return (
                  <div
                    key={slideItem.id}
                    className="grid gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 md:grid-cols-[80px_1fr_160px]"
                  >
                    <div>
                      <p className="text-sm text-slate-500">順番</p>
                      <p className="text-2xl font-bold">{slideItem.order}</p>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">
                          {asset?.title ?? "不明な素材"}
                        </h2>
                        <Badge variant="outline" className="border-slate-500 text-slate-200">
                          {getAssetKindLabel(asset?.kind)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-300">
                        {slideItem.caption ?? "テロップなし"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        表示方法: {slideItem.fit} / テロップ位置:{" "}
                        {getCaptionPresetLabel(slideItem.captionPreset)}
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