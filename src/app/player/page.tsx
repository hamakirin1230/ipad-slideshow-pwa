/* eslint-disable @next/next/no-img-element */
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriveStatusSummary } from "@/components/drive-status-summary";
import { useOfflinePlaybackSnapshot } from "./use-offline-playback-snapshot";
import { useOfflineCurrentSlideImage } from "./use-offline-current-slide-image";

const DEFAULT_SLIDE_DURATION_SECONDS = 5;
const PLAYER_CONTROLS_HIDE_DELAY_MS = 4_000;

type SwipeStart = {
  clientX: number;
  clientY: number;
  pointerId: number;
  didTrigger: boolean;
  wereControlsVisible: boolean;
};

type PlayerStatusTone = "neutral" | "warning" | "danger";

type PlayerGuidanceItem = {
  title: string;
  description: string;
};

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
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [isPlaybackPaused, setIsPlaybackPaused] = useState(false);

  const readySnapshot = snapshot?.status === "ready" ? snapshot : null;
  const slideCount = readySnapshot?.slides.length ?? 0;

  const revealControls = useCallback(() => {
    setAreControlsVisible(true);
  }, []);

  const goToPreviousSlide = useCallback(() => {
    if (slideCount === 0) return;
    revealControls();
    setCurrentSlideIndex((current) => Math.max(0, current - 1));
  }, [revealControls, slideCount]);

  const goToNextSlide = useCallback(() => {
    if (slideCount === 0) return;
    revealControls();
    setCurrentSlideIndex((current) => Math.min(slideCount - 1, current + 1));
  }, [revealControls, slideCount]);

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
      wereControlsVisible: areControlsVisible,
    };

    revealControls();

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

    const dx = event.clientX - start.clientX;
    const dy = event.clientY - start.clientY;

    if (!start.didTrigger) {
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
        event.preventDefault();

        if (dx < 0) {
          goToNextSlide();
        } else {
          goToPreviousSlide();
        }
      } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        setAreControlsVisible(!start.wereControlsVisible);
      }
    }

    resetSwipeStart();
  };

  const handlePointerCancel = () => {
    resetSwipeStart();
  };

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    updateOnlineStatus();

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

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
      isPlaybackPaused ||
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
    isPlaybackPaused,
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

  useEffect(() => {
    if (!canPlay || !areControlsVisible) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setAreControlsVisible(false);
    }, PLAYER_CONTROLS_HIDE_DELAY_MS);

    return () => clearTimeout(timeoutId);
  }, [areControlsVisible, canPlay]);

  const loadErrorGuidance: PlayerGuidanceItem[] = [
    {
      title: "まず再読み込みします",
      description:
        "一時的な IndexedDB 読み込み失敗であれば、再読み込みで復帰できます。",
    },
    {
      title: "直らない場合は管理画面で確認します",
      description:
        "confirmed store の件数と診断を確認し、必要に応じて対象 project のローカル保存を削除してから offline sync を再実行してください。",
    },
  ];

  const emptySnapshotGuidance: PlayerGuidanceItem[] =
    isOnline === false
      ? [
          {
            title: "オンラインに戻します",
            description:
              "この端末に再生用コピーがない状態では、オフラインのまま素材を取得できません。",
          },
          {
            title: "管理画面で offline sync を実行します",
            description:
              "オンライン復帰後、Google接続、Drive状態、project状態を確認してから offline sync を実行してください。",
          },
        ]
      : [
          {
            title: "管理画面で offline sync を実行します",
            description:
              "初回利用時、または project 単位のローカル削除後は、この端末に再生用コピーを作り直す必要があります。",
          },
          {
            title: "削除後なら正常な状態です",
            description:
              "ローカル保存を削除した直後にこの画面が表示されるのは正常です。Drive上の project や写真は削除されていません。",
          },
        ];

  const invalidSnapshotGuidance: PlayerGuidanceItem[] = [
    {
      title: "管理画面で confirmed store を確認します",
      description:
        "project / assets / asset blobs / sync state の件数や参照関係に不一致があります。",
    },
    {
      title: "対象 project のローカル保存を削除します",
      description:
        "端末内の壊れた再生用コピーだけを削除します。Google Drive 上の project / manifest / assets は削除されません。",
    },
    {
      title: "online 状態で offline sync を再実行します",
      description:
        "Drive から正しい snapshot と画像 Blob を取得し直し、confirmed store を作り直します。",
    },
  ];

  const noSlidesGuidance: PlayerGuidanceItem[] = [
    {
      title: "管理画面で project 状態を再確認します",
      description:
        "project は保存されていますが、再生対象の slide がありません。manifest の内容を確認してください。",
    },
    {
      title: "必要なら写真を追加します",
      description:
        "Google Photos Picker から素材を追加し、manifest 反映後に offline sync を実行してください。",
    },
  ];

  const imageErrorGuidance: PlayerGuidanceItem[] = [
    {
      title: "まず再読み込みします",
      description:
        "一時的な Blob 読み込み失敗であれば、再読み込みで復帰できる場合があります。",
    },
    {
      title: "直らない場合はローカル保存を作り直します",
      description:
        "管理画面で対象 project のローカル保存を削除し、online 状態で offline sync を再実行してください。",
    },
  ];

  if (canPlay) {
    const controlsVisibilityClassName = areControlsVisible
      ? "opacity-100"
      : "pointer-events-none opacity-0";
    const slideProgressPercentage =
      slideCount === 0 ? 0 : ((safeCurrentSlideIndex + 1) / slideCount) * 100;
    const onlineStatusLabel =
      isOnline === null ? "確認中" : isOnline ? "オンライン" : "オフライン";
    const OnlineStatusIcon = isOnline === false ? WifiOff : Wifi;

    return (
      <main className="relative h-[100svh] min-h-[100svh] overflow-hidden bg-black text-slate-50">
        <div
          className="absolute inset-0 flex items-center justify-center bg-black"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          style={{
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {imageStatus === "error" ? (
            <div className="mx-4 max-w-xl rounded-2xl border border-red-400/30 bg-red-950/80 p-5 text-center text-red-50 shadow-2xl">
              <p className="text-lg font-semibold">
                このスライド画像を表示できません
              </p>
              <p className="mt-3 text-sm leading-6 text-red-100/80">
                このスライドが参照しているローカル保存写真を読み込めませんでした。
                再読み込みで直らない場合は、管理画面でこの project のローカル保存を削除し、
                online 状態で offline sync を再実行してください。
              </p>
              <div className="mt-4 rounded-xl border border-red-100/20 bg-black/30 p-4 text-left text-sm">
                <p className="font-semibold text-red-50">次の操作</p>
                <div className="mt-3 space-y-3">
                  {imageErrorGuidance.map((item) => (
                    <div key={item.title}>
                      <p className="font-medium text-red-50">{item.title}</p>
                      <p className="mt-1 leading-6 text-red-100/70">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {imageStatus === "ready" && objectUrl ? (
            <img
              key={objectUrl}
              src={objectUrl}
              alt={currentSlide.assetName ?? "現在のスライド画像"}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onLoad={() => setLoadedImageObjectUrl(objectUrl)}
              className="h-full w-full object-contain"
              style={{
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            />
          ) : null}

          {imageStatus === "idle" ? (
            <p className="rounded-full bg-white/10 px-4 py-2 text-sm text-slate-300">
              ローカル保存されたスライド画像を準備しています
            </p>
          ) : null}
        </div>

        <div
          className={`absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pb-16 transition-opacity duration-300 sm:px-6 ${controlsVisibilityClassName}`}
          style={{
            paddingTop: "max(env(safe-area-inset-top), 1rem)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">
                {readySnapshot.projectTitle ?? readySnapshot.projectId}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <Badge
                  variant="outline"
                  className={
                    isOnline === false
                      ? "border-amber-300/70 bg-black/30 text-amber-100"
                      : "border-white/20 bg-black/30 text-slate-100"
                  }
                >
                  <OnlineStatusIcon className="size-3" />
                  {onlineStatusLabel}
                </Badge>
                <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5">
                  {safeCurrentSlideIndex + 1} / {slideCount}
                </span>
                <span className="hidden max-w-[42vw] truncate rounded-full border border-white/15 bg-black/30 px-2 py-0.5 sm:inline">
                  synced {readySnapshot.syncedAt}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20"
                aria-label={isPlaybackPaused ? "自動送りを再開" : "自動送りを一時停止"}
                title={isPlaybackPaused ? "自動送りを再開" : "自動送りを一時停止"}
                onClick={() => {
                  revealControls();
                  setIsPlaybackPaused((current) => !current);
                }}
              >
                {isPlaybackPaused ? <Play /> : <Pause />}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20"
                aria-label="再読み込み"
                title="再読み込み"
                onClick={() => {
                  revealControls();
                  reload();
                }}
              >
                <RefreshCw />
              </Button>
              <Button
                asChild
                variant="secondary"
                size="icon"
                className="rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20"
                aria-label="管理画面へ"
                title="管理画面へ"
              >
                <Link href="/admin">
                  <Settings />
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                size="icon"
                className="rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20"
                aria-label="トップへ戻る"
                title="トップへ戻る"
              >
                <Link href="/">
                  <Home />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div
          className={`absolute left-4 top-1/2 z-20 hidden -translate-y-1/2 transition-opacity duration-300 sm:block ${controlsVisibilityClassName}`}
        >
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            className="size-12 rounded-full border border-white/15 bg-black/45 text-slate-50 shadow-2xl hover:bg-white/20 disabled:opacity-30"
            aria-label="前のスライドへ"
            title="前のスライドへ"
            disabled={safeCurrentSlideIndex === 0}
            onClick={goToPreviousSlide}
          >
            <ChevronLeft className="size-7" />
          </Button>
        </div>

        <div
          className={`absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 transition-opacity duration-300 sm:block ${controlsVisibilityClassName}`}
        >
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            className="size-12 rounded-full border border-white/15 bg-black/45 text-slate-50 shadow-2xl hover:bg-white/20 disabled:opacity-30"
            aria-label="次のスライドへ"
            title="次のスライドへ"
            disabled={safeCurrentSlideIndex === slideCount - 1}
            onClick={goToNextSlide}
          >
            <ChevronRight className="size-7" />
          </Button>
        </div>

        <div
          className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pt-20 sm:px-6"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
          }}
        >
          {currentSlideCaption ? (
            <p
              className="mx-auto mb-4 max-w-4xl text-center text-base leading-7 text-slate-100 drop-shadow sm:text-xl sm:leading-8"
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

          <div
            className={`mx-auto flex max-w-xl items-center justify-center gap-4 transition-opacity duration-300 ${controlsVisibilityClassName}`}
          >
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              className="size-11 rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20 disabled:opacity-30"
              aria-label="前のスライドへ"
              title="前のスライドへ"
              disabled={safeCurrentSlideIndex === 0}
              onClick={goToPreviousSlide}
            >
              <ChevronLeft className="size-6" />
            </Button>
            <div className="min-w-28 flex-1">
              <div className="h-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${slideProgressPercentage}%` }}
                />
              </div>
              <p className="mt-2 text-center text-xs text-slate-300">
                {safeCurrentSlideIndex + 1} / {slideCount}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              className="size-11 rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20 disabled:opacity-30"
              aria-label="次のスライドへ"
              title="次のスライドへ"
              disabled={safeCurrentSlideIndex === slideCount - 1}
              onClick={goToNextSlide}
            >
              <ChevronRight className="size-6" />
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold">再生画面</h1>
              <Badge
                variant={isOnline === false ? "outline" : "secondary"}
                className={
                  isOnline === false ? "border-amber-300 text-amber-100" : undefined
                }
              >
                {isOnline === null
                  ? "接続状態確認中"
                  : isOnline
                    ? "オンライン"
                    : "オフライン"}
              </Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              この画面は、この端末に保存済みの再生用コピーだけを使います。
              Driveから直接読み込む画面ではないため、初回利用時やローカル削除後は管理画面で
              offline sync を実行してください。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={reload}
              disabled={isSnapshotLoading}
            >
              {isSnapshotLoading ? "読み込み中" : "再読み込み"}
            </Button>
            <Button asChild variant="secondary">
              <Link href="/admin">管理画面へ</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">トップへ戻る</Link>
            </Button>
          </div>
        </div>

        <DriveStatusSummary />

        {isSnapshotLoading ? (
          <PlayerStatusCard
            tone="neutral"
            title="このiPadの再生用コピーを確認しています"
            description="端末内の IndexedDB confirmed store から、project / slides / asset Blob を読み込んでいます。"
          />
        ) : null}

        {hasSnapshotLoadError ? (
          <PlayerStatusCard
            tone="danger"
            title="このiPadの再生用コピーを読み込めませんでした"
            description={
              errorMessage ??
              "IndexedDB の読み込み中に問題が発生しました。再読み込みで直らない場合は、管理画面で confirmed store を確認してください。"
            }
            guidanceItems={loadErrorGuidance}
          >
            <PlayerActionRow>
              <Button type="button" variant="secondary" onClick={reload}>
                もう一度読み込む
              </Button>
              <Button asChild variant="secondary">
                <Link href="/admin">管理画面で確認する</Link>
              </Button>
            </PlayerActionRow>
          </PlayerStatusCard>
        ) : null}

        {emptySnapshot ? (
          <PlayerStatusCard
            tone="warning"
            title={
              isOnline === false
                ? "オフライン再生に必要なデータがこのiPadにありません"
                : "このiPadにはまだ再生用コピーがありません"
            }
            description={
              isOnline === false
                ? "現在オフラインのため、Drive から project や写真を取得できません。オンラインに戻してから offline sync を実行してください。"
                : "初回利用、または project 単位のローカル削除後の状態です。管理画面で offline sync を実行すると、このiPadに再生用コピーを作成できます。"
            }
            guidanceItems={emptySnapshotGuidance}
            diagnostics={snapshot.diagnostics}
          >
            <PlayerActionRow>
              <Button type="button" variant="secondary" onClick={reload}>
                再読み込み
              </Button>
              <Button asChild variant="secondary">
                <Link href="/admin">管理画面で offline sync を実行</Link>
              </Button>
            </PlayerActionRow>
          </PlayerStatusCard>
        ) : null}

        {invalidSnapshot ? (
          <PlayerStatusCard
            tone="danger"
            title="このiPadの再生用コピーを修復する必要があります"
            description="端末内の project / asset metadata / asset Blob / sync state の対応関係が崩れています。壊れたローカルコピーを削除してから、offline sync で作り直してください。"
            guidanceItems={invalidSnapshotGuidance}
            diagnostics={snapshot.diagnostics}
          >
            <PlayerActionRow>
              <Button type="button" variant="secondary" onClick={reload}>
                再読み込み
              </Button>
              <Button asChild variant="secondary">
                <Link href="/admin">管理画面で修復する</Link>
              </Button>
            </PlayerActionRow>
          </PlayerStatusCard>
        ) : null}

        {noSlides ? (
          <PlayerStatusCard
            tone="warning"
            title="再生できるスライドがありません"
            description="project のローカル保存はありますが、本編スライドとして再生できる項目がありません。Drive 側の manifest や素材追加状態を確認してください。"
            guidanceItems={noSlidesGuidance}
          >
            <PlayerActionRow>
              <Button type="button" variant="secondary" onClick={reload}>
                再読み込み
              </Button>
              <Button asChild variant="secondary">
                <Link href="/admin">管理画面へ</Link>
              </Button>
            </PlayerActionRow>
          </PlayerStatusCard>
        ) : null}

      </div>
    </main>
  );
}

function PlayerStatusCard({
  tone,
  title,
  description,
  guidanceItems,
  diagnostics,
  children,
}: {
  tone: PlayerStatusTone;
  title: string;
  description: string;
  guidanceItems?: PlayerGuidanceItem[];
  diagnostics?: string[];
  children?: ReactNode;
}) {
  const className = getPlayerStatusCardClassName(tone);

  return (
    <div className={`rounded-2xl border p-6 ${className}`}>
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6">{description}</p>

      {guidanceItems && guidanceItems.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-current/20 bg-black/20 p-4">
          <p className="font-semibold">次の操作</p>
          <div className="mt-3 space-y-3 text-sm">
            {guidanceItems.map((item) => (
              <div key={item.title}>
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 leading-6 opacity-80">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {diagnostics && diagnostics.length > 0 ? (
        <details className="mt-5 rounded-2xl border border-current/20 bg-black/20 p-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            技術診断を表示
          </summary>
          <div className="mt-3 space-y-2">
            {diagnostics.map((diagnostic, index) => (
              <p key={`${diagnostic}-${index}`}>・{diagnostic}</p>
            ))}
          </div>
        </details>
      ) : null}

      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

function PlayerActionRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-center gap-3">{children}</div>;
}

function getPlayerStatusCardClassName(tone: PlayerStatusTone) {
  switch (tone) {
    case "danger":
      return "border-red-400/30 bg-red-400/10 text-red-100";
    case "warning":
      return "border-amber-400/30 bg-amber-400/10 text-amber-100";
    case "neutral":
      return "border-white/10 bg-white/5 text-slate-300";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}
