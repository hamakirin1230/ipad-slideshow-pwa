/* eslint-disable @next/next/no-img-element */
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DriveStatusSummary } from "@/components/drive-status-summary";
import { useOfflinePlaybackSnapshot } from "./use-offline-playback-snapshot";
import { useOfflineCurrentSlideImage } from "./use-offline-current-slide-image";

const DEFAULT_SLIDE_DURATION_SECONDS = 5;

export default function PlayerPage() {
  const {
    status: snapshotLoadStatus,
    snapshot,
    errorMessage,
    reload,
  } = useOfflinePlaybackSnapshot();

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [loadedImageObjectUrl, setLoadedImageObjectUrl] = useState<string | null>(
    null,
  );

  const readySnapshot = snapshot?.status === "ready" ? snapshot : null;
  const slideCount = readySnapshot?.slides.length ?? 0;

  const goToPreviousSlide = useCallback(() => {
    if (slideCount === 0) return;
    setCurrentSlideIndex((current) => Math.max(0, current - 1));
  }, [slideCount]);

  const goToNextSlide = useCallback(() => {
    if (slideCount === 0) return;
    setCurrentSlideIndex((current) => Math.min(slideCount - 1, current + 1));
  }, [slideCount]);

  type SwipeStart = {
  clientX: number;
  clientY: number;
  pointerId: number;
  didTrigger: boolean;
};

const swipeStartRef = useRef<SwipeStart | null>(null);

const resetSwipeStart = () => {
  swipeStartRef.current = null;
};

const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
  if (!event.isPrimary) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  event.preventDefault();

  swipeStartRef.current = {
    clientX: event.clientX,
    clientY: event.clientY,
    pointerId: event.pointerId,
    didTrigger: false,
  };

  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is best-effort only.
  }
};

const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
  const start = swipeStartRef.current;

  if (!start || start.pointerId !== event.pointerId || start.didTrigger) {
    return;
  }

  const dx = event.clientX - start.clientX;
  const dy = event.clientY - start.clientY;

  if (Math.abs(dx) < 50) return;
  if (Math.abs(dx) <= Math.abs(dy)) return;

  event.preventDefault();

  swipeStartRef.current = {
    ...start,
    didTrigger: true,
  };

  if (dx < 0) {
    goToNextSlide();
  } else {
    goToPreviousSlide();
  }
};

const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
  const start = swipeStartRef.current;

  if (!start || start.pointerId !== event.pointerId) {
    return;
  }

  if (!start.didTrigger) {
    const dx = event.clientX - start.clientX;
    const dy = event.clientY - start.clientY;

    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
      event.preventDefault();

      if (dx < 0) {
        goToNextSlide();
      } else {
        goToPreviousSlide();
      }
    }
  }

  resetSwipeStart();
};

const handlePointerCancel = () => {
  resetSwipeStart();
};

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
    slideCount === 0
      ? 0
      : Math.max(0, Math.min(slideCount - 1, currentSlideIndex));

  const currentSlide = readySnapshot?.slides[safeCurrentSlideIndex] ?? null;

  const currentSlideCaption =
    typeof currentSlide?.caption === "string" ? currentSlide.caption.trim() : "";

  const canRenderCurrentSlide =
    readySnapshot !== null && slideCount > 0 && currentSlide !== null;

  const { status: imageStatus, objectUrl } = useOfflineCurrentSlideImage({
    canRender: canRenderCurrentSlide,
    slide: currentSlide,
  });

  const isCurrentImageLoaded =
    typeof objectUrl === "string" && loadedImageObjectUrl === objectUrl;

  const currentSlideDurationSeconds =
    currentSlide?.durationSeconds ?? DEFAULT_SLIDE_DURATION_SECONDS;

  useEffect(() => {
    if (
      imageStatus !== "ready" ||
      !objectUrl ||
      !isCurrentImageLoaded ||
      slideCount === 0 ||
      safeCurrentSlideIndex >= slideCount - 1
    ) {
      return;
    }

    const timeoutId = setTimeout(() => {
      goToNextSlide();
    }, currentSlideDurationSeconds * 1000);

    return () => clearTimeout(timeoutId);
  }, [
    imageStatus,
    objectUrl,
    isCurrentImageLoaded,
    slideCount,
    safeCurrentSlideIndex,
    currentSlideDurationSeconds,
    goToNextSlide,
  ]);

  const isSnapshotLoading = snapshotLoadStatus === "loading";
  const hasSnapshotLoadError = snapshotLoadStatus === "error";
  const emptySnapshot = snapshot?.status === "empty";
  const invalidSnapshot = snapshot?.status === "invalid";
  const noSlides = readySnapshot !== null && slideCount === 0;
  const canPlay =
    snapshotLoadStatus === "ready" &&
    readySnapshot !== null &&
    slideCount > 0 &&
    currentSlide !== null;

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">再生画面</h1>
            <p className="mt-2 text-sm text-slate-400">
              IndexedDB confirmed offline store から読み込む offline-first player
              です。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={reload}
              disabled={isSnapshotLoading}
            >
              {isSnapshotLoading ? "読み込み中" : "offline snapshot を再読み込み"}
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">トップへ戻る</Link>
            </Button>
          </div>
        </div>

        <DriveStatusSummary />

        {isSnapshotLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-300">
              confirmed offline store から再生用snapshotを読み込んでいます。
            </p>
          </div>
        ) : null}

        {hasSnapshotLoadError ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-6 text-center text-red-100">
            <p className="font-semibold">offline snapshot を読み込めませんでした。</p>
            <p className="mt-2">{errorMessage}</p>
            <Button asChild variant="secondary" className="mt-4">
              <Link href="/admin">管理画面へ</Link>
            </Button>
          </div>
        ) : null}

        {emptySnapshot ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6 text-amber-100">
            <p className="font-semibold">offline再生データがありません。</p>
            <div className="mt-3 space-y-2 text-sm">
              {snapshot.diagnostics.map((diagnostic) => (
                <p key={diagnostic}>・{diagnostic}</p>
              ))}
            </div>
            <Button asChild variant="secondary" className="mt-4">
              <Link href="/admin">管理画面で offline sync を実行</Link>
            </Button>
          </div>
        ) : null}

        {invalidSnapshot ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-6 text-red-100">
            <p className="font-semibold">offline再生データに問題があります。</p>
            <div className="mt-3 space-y-2 text-sm">
              {snapshot.diagnostics.map((diagnostic, index) => (
                <p key={`${diagnostic}-${index}`}>・{diagnostic}</p>
              ))}
            </div>
            <Button asChild variant="secondary" className="mt-4">
              <Link href="/admin">管理画面で confirmed store を確認</Link>
            </Button>
          </div>
        ) : null}

        {noSlides ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-slate-300">
              confirmed offline store に表示できる本編スライドがありません。
            </p>
            <Button asChild variant="secondary" className="mt-4">
              <Link href="/admin">管理画面へ</Link>
            </Button>
          </div>
        ) : null}

        {canPlay ? (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-slate-500">project</p>
                  <p className="font-medium text-slate-100">
                    {readySnapshot.projectTitle ?? readySnapshot.projectId}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">syncedAt</p>
                  <p className="font-medium text-slate-100">
                    {readySnapshot.syncedAt}
                  </p>
                </div>
              </div>
            </div>

            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              style={{
                touchAction: "pan-y",
                userSelect: "none",
              }}
            >
              <div className="flex aspect-[16/9] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-slate-950">
                {imageStatus === "error" ? (
                  <p className="text-slate-400">
                    offline store のスライド画像を表示できません。
                  </p>
                ) : null}

                {imageStatus === "ready" && objectUrl ? (
                  <img
                    key={objectUrl}
                    src={objectUrl}
                    alt={currentSlide.assetName ?? "現在のスライド画像"}
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    onLoad={() => setLoadedImageObjectUrl(objectUrl)}
                    style={{
                      objectFit: "contain",
                      width: "100%",
                      height: "100%",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                    }}
                  />
                ) : null}

                {imageStatus === "idle" ? (
                  <p className="text-slate-500">
                    offline store のスライド画像を準備しています。
                  </p>
                ) : null}
              </div>

              {currentSlideCaption ? (
                <p
                  className="mt-4 text-center text-lg text-slate-200"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {currentSlideCaption}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-center gap-6">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                aria-label="前のスライドへ"
                disabled={safeCurrentSlideIndex === 0}
                onClick={goToPreviousSlide}
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
                onClick={goToNextSlide}
              >
                ＞
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
