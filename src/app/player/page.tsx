/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DriveStatusSummary } from "@/components/drive-status-summary";
import { useAppState } from "@/app/app-providers";
import { usePlayerCurrentSlideImage } from "./use-player-current-slide-image";

export default function PlayerPage() {
  const {
    googleStatus,
    driveFileGranted,
    driveStatus,
    projectStatus,
    projectDetails,
    fetchProjectSlidePreviewBlob,
  } = useAppState();

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  const slideCount = projectDetails?.slides.length ?? 0;

  useEffect(() => {
    queueMicrotask(() => {
      setCurrentSlideIndex((current) => {
        if (slideCount === 0) {
          return current === 0 ? current : 0;
        }
        const clamped = Math.max(0, Math.min(slideCount - 1, current));
        return clamped === current ? current : clamped;
      });
    });
  }, [slideCount]);

  const safeCurrentSlideIndex =
    slideCount === 0 ? 0 : Math.max(0, Math.min(slideCount - 1, currentSlideIndex));

  const currentSlide = projectDetails?.slides[safeCurrentSlideIndex] ?? null;

  const canFetch =
    googleStatus === "connected" &&
    driveFileGranted === true &&
    driveStatus === "ready" &&
    projectStatus === "ready" &&
    projectDetails !== null &&
    slideCount > 0 &&
    currentSlide !== null;

  const { status, objectUrl } = usePlayerCurrentSlideImage({
    canFetch,
    slide: currentSlide,
    fetchProjectSlidePreviewBlob,
  });

  const notConnected =
    googleStatus !== "connected" || driveFileGranted !== true;

  const notReady =
    !notConnected &&
    (driveStatus !== "ready" ||
      projectStatus !== "ready" ||
      projectDetails === null);

  const noSlides =
    !notConnected && !notReady && slideCount === 0;

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold">再生画面</h1>
          <Button asChild variant="secondary">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>

        <DriveStatusSummary />

        {notConnected && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-300">
              Google Driveに接続するとスライドを表示できます。
            </p>
            <Button asChild variant="secondary" className="mt-4">
              <Link href="/settings">設定画面へ</Link>
            </Button>
          </div>
        )}

        {notReady && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-300">
              Driveプロジェクトの準備が完了していません。
            </p>
            <Button asChild variant="secondary" className="mt-4">
              <Link href="/settings">設定画面へ</Link>
            </Button>
          </div>
        )}

        {noSlides && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-300">
              表示できる本編スライドがありません。
            </p>
          </div>
        )}

        {!notConnected && !notReady && !noSlides && (
          <>
            <div className="flex aspect-[16/9] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-slate-950">
              {status === "loading" && (
                <p className="text-slate-400">スライド画像を読み込んでいます。</p>
              )}
              {status === "error" && (
                <p className="text-slate-400">スライド画像を表示できません。</p>
              )}
              {status === "ready" && objectUrl && (
                <img
                  src={objectUrl}
                  alt="現在のスライド画像"
                  style={{ objectFit: "contain", width: "100%", height: "100%" }}
                />
              )}
              {status === "idle" && (
                <p className="text-slate-500">スライド画像の準備をしています。</p>
              )}
            </div>

            {slideCount > 0 && (
              <div className="flex items-center justify-center gap-6">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  aria-label="前のスライドへ"
                  disabled={safeCurrentSlideIndex === 0}
                  onClick={() =>
                    setCurrentSlideIndex((current) => Math.max(0, current - 1))
                  }
                >
                  ＜
                </Button>
                <span className="text-slate-300">
                  {safeCurrentSlideIndex + 1} / {slideCount}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  aria-label="次のスライドへ"
                  disabled={safeCurrentSlideIndex === slideCount - 1}
                  onClick={() =>
                    setCurrentSlideIndex((current) =>
                      Math.min(slideCount - 1, current + 1),
                    )
                  }
                >
                  ＞
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
