"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppState } from "@/app/app-providers";
import { AssetImportPanel } from "./asset-import-panel";

export function DriveProjectWorkspacePanel() {
  const {
    driveStatus,
    projectStatus,
    projectSummary,
    projectDetails,
    fetchProjectSlidePreviewBlob,
  } = useAppState();

  const hasReadyProject =
    driveStatus === "ready" && projectStatus === "ready" && projectSummary;
  const readyProjectDetails = projectStatus === "ready" ? projectDetails : null;
  const assetCount =
    readyProjectDetails?.assetCount ?? projectSummary?.assetCount ?? 0;
  const slideCount =
     readyProjectDetails?.slideCount ?? projectSummary?.slideCount ?? 0;
  const slides = readyProjectDetails?.slides ?? [];

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
            <p className="text-3xl font-bold">{assetCount}</p>
            <p className="mt-2 text-sm text-slate-500">
              manifest.json.slides が参照する検証済みasset数を表示します。
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>本編スライド数</CardTitle>
            <CardDescription>manifest.json.slides の編集対象</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{slideCount}</p>
            <p className="mt-2 text-sm text-slate-500">
              manifest.json.slides の件数を表示します。スライド編集UIは後続コミットで追加します。
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
                    <dt className="font-medium text-slate-900">素材数</dt>
                    <dd>{assetCount}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">本編スライド数</dt>
                    <dd>{slideCount}</dd>
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
            <AssetImportPanel />
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
            {slides.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-[4rem_8rem_1fr_8rem_8rem] bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <p>順番</p>
                  <p>プレビュー</p>
                  <p>asset</p>
                  <p>MIME</p>
                  <p>秒数</p>
                </div>
                <div className="divide-y divide-slate-200">
                  {slides.map((slide, index) => (
                    <div
                      key={`${slide.slideIdPart}-${slide.assetIdPart}`}
                      className="grid grid-cols-[4rem_8rem_1fr_8rem_8rem] px-4 py-3 text-sm"
                    >
                      <p className="font-medium">{index + 1}</p>
                      <DriveSlidePreview
                        assetFileId={slide.assetFileId}
                        mimeType={slide.mimeType}
                        assetName={slide.assetName}
                        fetchProjectSlidePreviewBlob={fetchProjectSlidePreviewBlob}
                      />
                      <div>
                        <p className="font-medium">{slide.assetName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          source: {slide.sourceMimeType} / createTime:{" "}
                          {slide.sourceCreateTime}
                        </p>
                      </div>
                      <p>{slide.mimeType}</p>
                      <p>{slide.durationSeconds}秒</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">
                  検証済みスライドはまだありません。
                </p>
                <p className="mt-2">
                  manifest.json.slides に追加済みのスライドがここに表示されます。
                  スライド順や表示内容の編集UIは後続コミットで追加します。
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

type DriveSlidePreviewState =
  | { status: "loading" }
  | { status: "ready"; objectUrl: string }
  | { status: "error" };

function DriveSlidePreview({
  assetFileId,
  mimeType,
  assetName,
  fetchProjectSlidePreviewBlob,
}: {
  assetFileId: string;
  mimeType: string;
  assetName: string;
  fetchProjectSlidePreviewBlob: (
    assetFileId: string,
    expectedMimeType: string,
    signal: AbortSignal,
  ) => Promise<Blob>;
}) {
  const [previewState, setPreviewState] = useState<DriveSlidePreviewState>({
    status: "loading",
  });

  useEffect(() => {
    const abortController = new AbortController();
    let createdObjectUrl: string | null = null;
    let isMounted = true;

    fetchProjectSlidePreviewBlob(assetFileId, mimeType, abortController.signal)
      .then((blob) => {
        if (!isMounted || abortController.signal.aborted) {
          return;
        }

        createdObjectUrl = URL.createObjectURL(blob);
        setPreviewState({
          status: "ready",
          objectUrl: createdObjectUrl,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        if (createdObjectUrl) {
          URL.revokeObjectURL(createdObjectUrl);
          createdObjectUrl = null;
        }

        setPreviewState({ status: "error" });

        if (process.env.NODE_ENV !== "production") {
          console.warn("Drive slide preview fetch failed.", error);
        }
      });

    return () => {
      isMounted = false;
      abortController.abort();

      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
        createdObjectUrl = null;
      }
    };
  }, [assetFileId, fetchProjectSlidePreviewBlob, mimeType]);

  if (previewState.status === "loading") {
    return (
      <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
        読み込み中
      </div>
    );
  }

  if (previewState.status === "error") {
    return (
      <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-2 text-center text-xs text-amber-800">
        プレビュー取得失敗
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewState.objectUrl}
        alt={`${assetName} のプレビュー`}
        className="h-16 w-24 rounded-lg border border-slate-200 object-cover"
        loading="lazy"
        decoding="async"
      />
    </>
  );
}
