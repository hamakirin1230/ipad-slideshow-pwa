/* eslint-disable @next/next/no-img-element */
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  List,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Unlock,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriveStatusSummary } from "@/components/drive-status-summary";
import { useOfflinePlaybackSnapshot } from "./use-offline-playback-snapshot";

const DEFAULT_SLIDE_DURATION_SECONDS = 5;
const PLAYER_CONTROLS_HIDE_DELAY_MS = 4_000;
const PLAYER_LOCK_HOLD_DURATION_MS = 2_000;
const SLIDE_TRANSITION_DURATION_MS = 320;
const PLAYER_PRESENTATION_MODE_STORAGE_KEY =
  "ipad-slideshow:player-presentation-mode";
const PLAYER_AUTO_ADVANCE_INTERVAL_STORAGE_KEY =
  "ipad-slideshow:player-auto-advance-interval-seconds";

type PlayerPresentationMode = "normal" | "production";
type PlayerInteractionLock = "unlocked" | "locked";
type PlayerAutoAdvanceIntervalSeconds = null | 5 | 10 | 15 | 20 | 30 | 60;
type SlideTransitionDirection = "next" | "previous" | "none";

type PlayerSlideImage = {
  objectUrl: string;
  slideId: string;
  assetId: string;
  assetName: string;
};

type PlayerSlideImageStatus = "idle" | "ready" | "error";

const playerAutoAdvanceIntervalOptions: Array<{
  value: PlayerAutoAdvanceIntervalSeconds;
  label: string;
  storageValue: string;
}> = [
  { value: null, label: "なし", storageValue: "none" },
  { value: 5, label: "5秒", storageValue: "5" },
  { value: 10, label: "10秒", storageValue: "10" },
  { value: 15, label: "15秒", storageValue: "15" },
  { value: 20, label: "20秒", storageValue: "20" },
  { value: 30, label: "30秒", storageValue: "30" },
  { value: 60, label: "1分", storageValue: "60" },
];

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
    selectedProjectId,
    selectProject,
    clearSelectedProject,
    reload,
  } = useOfflinePlaybackSnapshot();

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [displayedSlideImage, setDisplayedSlideImage] =
    useState<PlayerSlideImage | null>(null);
  const [previousSlideImage, setPreviousSlideImage] =
    useState<PlayerSlideImage | null>(null);
  const [imageStatus, setImageStatus] = useState<PlayerSlideImageStatus>(
    "idle",
  );
  const [slideTransitionDirection, setSlideTransitionDirection] =
    useState<SlideTransitionDirection>("none");
  const [isSlideTransitioning, setIsSlideTransitioning] = useState(false);
  const displayedSlideImageRef = useRef<PlayerSlideImage | null>(null);
  const previousSlideImageRef = useRef<PlayerSlideImage | null>(null);
  const slideTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [isPlaybackPaused, setIsPlaybackPaused] = useState(false);
  const [autoAdvanceIntervalSeconds, setAutoAdvanceIntervalSeconds] =
    useState<PlayerAutoAdvanceIntervalSeconds>(() =>
      readStoredAutoAdvanceIntervalSeconds(),
    );
  const [presentationMode, setPresentationMode] =
    useState<PlayerPresentationMode>(() => readStoredPresentationMode());
  const [interactionLock, setInteractionLock] =
    useState<PlayerInteractionLock>("unlocked");

  const readySnapshot = snapshot?.status === "ready" ? snapshot : null;
  const projectSelectionSnapshot =
    snapshot?.status === "projectSelectionRequired" ? snapshot : null;
  const slideCount = readySnapshot?.slides.length ?? 0;
  const isProductionMode = presentationMode === "production";
  const isInteractionLocked = interactionLock === "locked";
  const canUseVisibleControls = !isProductionMode && !isInteractionLocked;
  const canToggleControlsByTap = canUseVisibleControls;
  const swipeStartRef = useRef<SwipeStart | null>(null);

  const resetSwipeStart = useCallback(() => {
    swipeStartRef.current = null;
  }, []);

  const revealControls = useCallback(() => {
    if (!canUseVisibleControls) {
      return;
    }

    setAreControlsVisible(true);
  }, [canUseVisibleControls]);

  const moveToPreviousSlide = useCallback(() => {
    if (slideCount === 0) return;
    setCurrentSlideIndex((current) => {
      const next = Math.max(0, current - 1);

      if (next !== current) {
        setSlideTransitionDirection("previous");
      }

      return next;
    });
  }, [slideCount]);

  const moveToNextSlide = useCallback(() => {
    if (slideCount === 0) return;
    setCurrentSlideIndex((current) => {
      const next = Math.min(slideCount - 1, current + 1);

      if (next !== current) {
        setSlideTransitionDirection("next");
      }

      return next;
    });
  }, [slideCount]);

  const goToPreviousSlide = useCallback(() => {
    if (!canUseVisibleControls) return;
    revealControls();
    moveToPreviousSlide();
  }, [canUseVisibleControls, moveToPreviousSlide, revealControls]);

  const goToNextSlide = useCallback(() => {
    if (!canUseVisibleControls) return;
    revealControls();
    moveToNextSlide();
  }, [canUseVisibleControls, moveToNextSlide, revealControls]);

  const enterProductionMode = useCallback(() => {
    setPresentationMode("production");
    setInteractionLock("locked");
    setIsPlaybackPaused(false);
    setAreControlsVisible(false);
    resetSwipeStart();
  }, [resetSwipeStart]);

  const exitProductionMode = useCallback(() => {
    setPresentationMode("normal");
    setInteractionLock("unlocked");
    setAreControlsVisible(true);
    resetSwipeStart();
  }, [resetSwipeStart]);

  const lockInteractions = useCallback(() => {
    setInteractionLock("locked");
    setAreControlsVisible(false);
    resetSwipeStart();
  }, [resetSwipeStart]);

  const unlockInteractions = useCallback(() => {
    setInteractionLock("unlocked");
    resetSwipeStart();
  }, [resetSwipeStart]);

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

    if (canToggleControlsByTap) {
      revealControls();
    }

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
    const canUseSwipeNavigation = slideCount > 0 && imageStatus !== "error";

    if (Math.abs(dx) < 50) return;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    if (!canUseSwipeNavigation) return;

    event.preventDefault();

    swipeStartRef.current = {
      ...start,
      didTrigger: true,
    };

    if (dx < 0) {
      moveToNextSlide();
    } else {
      moveToPreviousSlide();
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;

    if (!start || start.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - start.clientX;
    const dy = event.clientY - start.clientY;
    const canUseSwipeNavigation = slideCount > 0 && imageStatus !== "error";

    if (!start.didTrigger) {
      if (
        canUseSwipeNavigation &&
        Math.abs(dx) >= 50 &&
        Math.abs(dx) > Math.abs(dy)
      ) {
        event.preventDefault();

        if (dx < 0) {
          moveToNextSlide();
        } else {
          moveToPreviousSlide();
        }
      } else if (
        canToggleControlsByTap &&
        Math.abs(dx) < 8 &&
        Math.abs(dy) < 8
      ) {
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
    writeStoredPresentationMode(presentationMode);
  }, [presentationMode]);

  useEffect(() => {
    writeStoredAutoAdvanceIntervalSeconds(autoAdvanceIntervalSeconds);
  }, [autoAdvanceIntervalSeconds]);

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

  const currentSlideDurationSeconds =
    currentSlide?.durationSeconds ?? DEFAULT_SLIDE_DURATION_SECONDS;
  const effectiveAutoAdvanceIntervalSeconds =
    autoAdvanceIntervalSeconds === null
      ? null
      : (autoAdvanceIntervalSeconds ?? currentSlideDurationSeconds);
  const isCurrentImageLoaded =
    imageStatus === "ready" &&
    displayedSlideImage !== null &&
    currentSlide !== null &&
    displayedSlideImage.slideId === currentSlide.slideId &&
    displayedSlideImage.assetId === currentSlide.assetId;
  const currentSlideBlob = canRenderCurrentSlide ? (currentSlide?.blob ?? null) : null;
  const currentSlideImageSlideId =
    canRenderCurrentSlide ? (currentSlide?.slideId ?? null) : null;
  const currentSlideImageAssetId =
    canRenderCurrentSlide ? (currentSlide?.assetId ?? null) : null;
  const currentSlideImageAssetName =
    canRenderCurrentSlide ? (currentSlide?.assetName ?? null) : null;

  useEffect(() => {
    if (
      !currentSlideBlob ||
      !currentSlideImageSlideId ||
      !currentSlideImageAssetId
    ) {
      queueMicrotask(() => {
        setImageStatus("idle");
        clearSlideTransitionTimeout(slideTransitionTimeoutRef);
        revokeSlideImage(previousSlideImageRef.current);
        revokeSlideImage(displayedSlideImageRef.current);
        previousSlideImageRef.current = null;
        displayedSlideImageRef.current = null;
        setPreviousSlideImage(null);
        setDisplayedSlideImage(null);
        setIsSlideTransitioning(false);
        setSlideTransitionDirection("none");
      });
      return;
    }

    let cancelled = false;
    let adopted = false;
    let nextObjectUrl: string | null = null;

    queueMicrotask(() => {
      if (!cancelled) {
        setImageStatus("idle");
      }
    });

    try {
      nextObjectUrl = URL.createObjectURL(currentSlideBlob);
    } catch {
      queueMicrotask(() => {
        if (!cancelled) {
          setImageStatus("error");
        }
      });
      return;
    }

    const nextImage: PlayerSlideImage = {
      objectUrl: nextObjectUrl,
      slideId: currentSlideImageSlideId,
      assetId: currentSlideImageAssetId,
      assetName: currentSlideImageAssetName ?? "現在のスライド画像",
    };
    const preloadImage = new Image();

    preloadImage.onload = () => {
      if (cancelled) {
        revokeSlideImage(nextImage);
        return;
      }

      const currentDisplayed = displayedSlideImageRef.current;

      if (
        currentDisplayed &&
        currentDisplayed.slideId === nextImage.slideId &&
        currentDisplayed.assetId === nextImage.assetId
      ) {
        revokeSlideImage(nextImage);
        setImageStatus("ready");
        return;
      }

      adopted = true;
      clearSlideTransitionTimeout(slideTransitionTimeoutRef);

      if (currentDisplayed) {
        const stalePrevious = previousSlideImageRef.current;

        if (
          stalePrevious &&
          stalePrevious.objectUrl !== currentDisplayed.objectUrl
        ) {
          revokeSlideImage(stalePrevious);
        }

        previousSlideImageRef.current = currentDisplayed;
        setPreviousSlideImage(currentDisplayed);
        setIsSlideTransitioning(true);
        slideTransitionTimeoutRef.current = setTimeout(() => {
          const imageToRevoke = previousSlideImageRef.current;

          slideTransitionTimeoutRef.current = null;
          previousSlideImageRef.current = null;
          setPreviousSlideImage(null);
          setIsSlideTransitioning(false);
          setSlideTransitionDirection("none");
          revokeSlideImage(imageToRevoke);
        }, SLIDE_TRANSITION_DURATION_MS);
      } else {
        previousSlideImageRef.current = null;
        setPreviousSlideImage(null);
        setIsSlideTransitioning(false);
        setSlideTransitionDirection("none");
      }

      displayedSlideImageRef.current = nextImage;
      setDisplayedSlideImage(nextImage);
      setImageStatus("ready");
    };

    preloadImage.onerror = () => {
      if (cancelled) {
        revokeSlideImage(nextImage);
        return;
      }

      setImageStatus("error");
      revokeSlideImage(nextImage);
    };

    preloadImage.src = nextObjectUrl;

    return () => {
      cancelled = true;

      if (!adopted) {
        revokeSlideImage(nextImage);
      }
    };
  }, [
    currentSlideBlob,
    currentSlideImageAssetId,
    currentSlideImageAssetName,
    currentSlideImageSlideId,
  ]);

  useEffect(() => {
    return () => {
      clearSlideTransitionTimeout(slideTransitionTimeoutRef);
      revokeSlideImage(previousSlideImageRef.current);
      revokeSlideImage(displayedSlideImageRef.current);
      previousSlideImageRef.current = null;
      displayedSlideImageRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      effectiveAutoAdvanceIntervalSeconds === null ||
      isPlaybackPaused ||
      imageStatus !== "ready" ||
      !isCurrentImageLoaded ||
      slideCount === 0 ||
      safeCurrentSlideIndex >= slideCount - 1
    ) {
      return;
    }

    const timeoutId = setTimeout(() => {
      moveToNextSlide();
    }, effectiveAutoAdvanceIntervalSeconds * 1000);

    return () => clearTimeout(timeoutId);
  }, [
    effectiveAutoAdvanceIntervalSeconds,
    isPlaybackPaused,
    imageStatus,
    isCurrentImageLoaded,
    slideCount,
    safeCurrentSlideIndex,
    moveToNextSlide,
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
    const shouldShowNormalControls = !isProductionMode && areControlsVisible;
    const controlsVisibilityClassName = shouldShowNormalControls
      ? "opacity-100"
      : "pointer-events-none opacity-0";
    const slideProgressPercentage =
      slideCount === 0 ? 0 : ((safeCurrentSlideIndex + 1) / slideCount) * 100;
    const onlineStatusLabel =
      isOnline === null ? "確認中" : isOnline ? "オンライン" : "オフライン";
    const OnlineStatusIcon = isOnline === false ? WifiOff : Wifi;
    const autoAdvanceStorageValue = toAutoAdvanceIntervalStorageValue(
      autoAdvanceIntervalSeconds,
    );
    const isAutoAdvanceDisabled = autoAdvanceIntervalSeconds === null;

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

          {previousSlideImage ? (
            <img
              key={`previous-${previousSlideImage.objectUrl}`}
              src={previousSlideImage.objectUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              className="absolute inset-0 h-full w-full animate-[playerPreviousFadeOut_320ms_ease-out_forwards] object-contain motion-reduce:animate-[playerPreviousFadeOut_60ms_ease-out_forwards]"
              style={{
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            />
          ) : null}

          {displayedSlideImage ? (
            <img
              key={`displayed-${displayedSlideImage.objectUrl}`}
              src={displayedSlideImage.objectUrl}
              alt={displayedSlideImage.assetName}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              className={`absolute inset-0 h-full w-full object-contain ${
                isSlideTransitioning
                  ? getSlideTransitionClassName(slideTransitionDirection)
                  : ""
              }`}
              style={{
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            />
          ) : null}

          {imageStatus === "idle" && !displayedSlideImage ? (
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
                <label className="flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-2 py-0.5">
                  <span>自動送り</span>
                  <select
                    value={autoAdvanceStorageValue}
                    onChange={(event) => {
                      const nextValue = parseAutoAdvanceIntervalStorageValue(
                        event.target.value,
                      );
                      setAutoAdvanceIntervalSeconds(nextValue);

                      if (nextValue === null) {
                        setIsPlaybackPaused(false);
                      }
                    }}
                    className="rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-xs text-slate-50 outline-none"
                  >
                    {playerAutoAdvanceIntervalOptions.map((option) => (
                      <option
                        key={option.storageValue}
                        value={option.storageValue}
                        className="bg-slate-950 text-slate-50"
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {readySnapshot.availableProjects.length >= 2 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20"
                  aria-label="再生projectを選び直す"
                  title="再生projectを選び直す"
                  onClick={() => {
                    revealControls();
                    clearSelectedProject();
                  }}
                >
                  <List />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="rounded-full border border-emerald-200/30 bg-emerald-400/15 text-emerald-50 hover:bg-emerald-300/25 sm:w-auto sm:px-3"
                aria-label="本番モードを開始"
                title="本番モードを開始"
                onClick={enterProductionMode}
              >
                <Lock className="size-4" />
                <span className="hidden sm:inline">本番モード</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20"
                aria-label={
                  isAutoAdvanceDisabled
                    ? "自動送りなし"
                    : isPlaybackPaused
                      ? "自動送りを再開"
                      : "自動送りを一時停止"
                }
                title={
                  isAutoAdvanceDisabled
                    ? "自動送りなし"
                    : isPlaybackPaused
                      ? "自動送りを再開"
                      : "自動送りを一時停止"
                }
                disabled={isAutoAdvanceDisabled}
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

        {isProductionMode ? (
          <ProductionModeOverlay
            interactionLock={interactionLock}
            onLock={lockInteractions}
            onUnlock={unlockInteractions}
            onExit={exitProductionMode}
          />
        ) : null}

        {currentSlideCaption ? (
          <div
            className={
              isProductionMode
                ? "pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pt-20 sm:px-6"
                : "pointer-events-none absolute inset-x-0 bottom-20 z-10 px-4 sm:bottom-24 sm:px-6"
            }
            style={
              isProductionMode
                ? { paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }
                : undefined
            }
          >
            <p
              className="mx-auto max-w-4xl rounded-xl bg-black/45 px-4 py-2 text-center text-base leading-7 text-slate-100 shadow-2xl drop-shadow backdrop-blur-sm sm:text-xl sm:leading-8"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {currentSlideCaption}
            </p>
          </div>
        ) : null}

        {!isProductionMode ? (
          <div
            className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pt-20 sm:px-6"
            style={{
              paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
            }}
          >
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
        ) : null}
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

        {projectSelectionSnapshot ? (
          <ProjectSelectionCard
            projects={projectSelectionSnapshot.availableProjects}
            selectedProjectId={selectedProjectId}
            diagnostics={projectSelectionSnapshot.diagnostics}
            onSelectProject={selectProject}
            onReload={reload}
          />
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

function ProjectSelectionCard({
  projects,
  selectedProjectId,
  diagnostics,
  onSelectProject,
  onReload,
}: {
  projects: Array<{
    projectId: string;
    projectTitle?: string;
    slideCount: number;
    assetCount: number;
    assetBlobCount: number;
    syncedAt?: string;
    sourceUpdatedAt?: string;
  }>;
  selectedProjectId: string | null;
  diagnostics: string[];
  onSelectProject: (projectId: string) => void;
  onReload: () => void;
}) {
  return (
    <PlayerStatusCard
      tone="neutral"
      title="再生するprojectを選択してください"
      description="このiPadには複数の offline playback 用 project が保存されています。本番再生に使う project を選ぶと、次回から同じ project を優先して開きます。"
      diagnostics={diagnostics}
    >
      <div className="space-y-3">
        {projects.map((project) => (
          <div
            key={project.projectId}
            className="rounded-xl border border-white/10 bg-black/30 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold text-slate-50">
                  {project.projectTitle ?? "名称未設定"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatIdPart(project.projectId)}
                </p>
              </div>
              <Button
                type="button"
                variant={
                  selectedProjectId === project.projectId ? "default" : "secondary"
                }
                onClick={() => onSelectProject(project.projectId)}
              >
                {selectedProjectId === project.projectId
                  ? "選択中のprojectを再読み込み"
                  : "このprojectを再生"}
              </Button>
            </div>

            <dl className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt>slides</dt>
                <dd className="font-medium text-slate-200">
                  {project.slideCount}
                </dd>
              </div>
              <div>
                <dt>assets</dt>
                <dd className="font-medium text-slate-200">
                  {project.assetCount}
                </dd>
              </div>
              <div>
                <dt>asset blobs</dt>
                <dd className="font-medium text-slate-200">
                  {project.assetBlobCount}
                </dd>
              </div>
              <div>
                <dt>syncedAt</dt>
                <dd className="break-all font-medium text-slate-200">
                  {project.syncedAt ?? "未取得"}
                </dd>
              </div>
              <div>
                <dt>sourceUpdatedAt</dt>
                <dd className="break-all font-medium text-slate-200">
                  {project.sourceUpdatedAt ?? "未取得"}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <PlayerActionRow>
        <Button type="button" variant="secondary" onClick={onReload}>
          再読み込み
        </Button>
      </PlayerActionRow>
    </PlayerStatusCard>
  );
}

function ProductionModeOverlay({
  interactionLock,
  onLock,
  onUnlock,
  onExit,
}: {
  interactionLock: PlayerInteractionLock;
  onLock: () => void;
  onUnlock: () => void;
  onExit: () => void;
}) {
  const isLocked = interactionLock === "locked";

  return (
    <div
      className="absolute right-3 top-3 z-30 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 sm:right-5 sm:top-5"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {isLocked ? (
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[0.7rem] text-slate-200 backdrop-blur-sm">
          <Lock className="size-3.5" />
          <span className="hidden sm:inline">操作ロック中</span>
          <HoldActionButton
            label="長押しでロック解除"
            icon={<Unlock className="size-3.5" />}
            onHoldComplete={onUnlock}
          />
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2 rounded-full border border-white/10 bg-black/25 p-1 text-xs text-slate-100 backdrop-blur-sm">
          <span className="flex items-center gap-1 px-2">
            <Unlock className="size-3.5" />
            本番モード中
          </span>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            className="rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20"
            onClick={onLock}
          >
            <Lock className="size-3.5" />
            ロック
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            className="rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20"
            onClick={onExit}
          >
            本番終了
          </Button>
        </div>
      )}
    </div>
  );
}

function HoldActionButton({
  label,
  icon,
  onHoldComplete,
}: {
  label: string;
  icon: ReactNode;
  onHoldComplete: () => void;
}) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isHolding, setIsHolding] = useState(false);

  const clearHold = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setIsHolding(false);
  }, []);

  const startHold = useCallback(() => {
    clearHold();
    setIsHolding(true);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setIsHolding(false);
      onHoldComplete();
    }, PLAYER_LOCK_HOLD_DURATION_MS);
  }, [clearHold, onHoldComplete]);

  useEffect(() => clearHold, [clearHold]);

  return (
    <Button
      type="button"
      variant="secondary"
      size="xs"
      className="rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20"
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        event.preventDefault();
        startHold();
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onPointerLeave={clearHold}
      onClick={(event) => event.preventDefault()}
    >
      {icon}
      {isHolding ? "解除中..." : label}
    </Button>
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

function formatIdPart(id: string | undefined) {
  if (!id) {
    return "未設定";
  }

  return `${id.slice(0, 8)}...`;
}

function getSlideTransitionClassName(direction: SlideTransitionDirection) {
  switch (direction) {
    case "next":
      return "animate-[playerSlideInNext_320ms_ease-out_forwards] motion-reduce:animate-[playerSlideInReduced_60ms_ease-out_forwards]";
    case "previous":
      return "animate-[playerSlideInPrevious_320ms_ease-out_forwards] motion-reduce:animate-[playerSlideInReduced_60ms_ease-out_forwards]";
    case "none":
      return "animate-[playerSlideInReduced_60ms_ease-out_forwards]";
    default:
      return "animate-[playerSlideInReduced_60ms_ease-out_forwards]";
  }
}

function revokeSlideImage(image: PlayerSlideImage | null) {
  if (!image) {
    return;
  }

  URL.revokeObjectURL(image.objectUrl);
}

function clearSlideTransitionTimeout(
  timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (!timeoutRef.current) {
    return;
  }

  clearTimeout(timeoutRef.current);
  timeoutRef.current = null;
}

function readStoredAutoAdvanceIntervalSeconds(): PlayerAutoAdvanceIntervalSeconds {
  if (typeof window === "undefined") {
    return 10;
  }

  try {
    return parseAutoAdvanceIntervalStorageValue(
      window.localStorage.getItem(PLAYER_AUTO_ADVANCE_INTERVAL_STORAGE_KEY),
    );
  } catch {
    return 10;
  }
}

function writeStoredAutoAdvanceIntervalSeconds(
  value: PlayerAutoAdvanceIntervalSeconds,
) {
  try {
    window.localStorage.setItem(
      PLAYER_AUTO_ADVANCE_INTERVAL_STORAGE_KEY,
      toAutoAdvanceIntervalStorageValue(value),
    );
  } catch {
    // Persisting player auto advance interval is best-effort only.
  }
}

function parseAutoAdvanceIntervalStorageValue(
  value: string | null,
): PlayerAutoAdvanceIntervalSeconds {
  switch (value) {
    case "none":
      return null;
    case "5":
      return 5;
    case "10":
    case null:
    case "":
      return 10;
    case "15":
      return 15;
    case "20":
      return 20;
    case "30":
      return 30;
    case "60":
      return 60;
    default:
      return 10;
  }
}

function toAutoAdvanceIntervalStorageValue(
  value: PlayerAutoAdvanceIntervalSeconds,
) {
  return (
    playerAutoAdvanceIntervalOptions.find((option) => option.value === value)
      ?.storageValue ?? "10"
  );
}

function readStoredPresentationMode(): PlayerPresentationMode {
  if (typeof window === "undefined") {
    return "normal";
  }

  try {
    return window.localStorage.getItem(PLAYER_PRESENTATION_MODE_STORAGE_KEY) ===
      "production"
      ? "production"
      : "normal";
  } catch {
    return "normal";
  }
}

function writeStoredPresentationMode(mode: PlayerPresentationMode) {
  try {
    window.localStorage.setItem(PLAYER_PRESENTATION_MODE_STORAGE_KEY, mode);
  } catch {
    // Persisting presentation mode is best-effort only.
  }
}
