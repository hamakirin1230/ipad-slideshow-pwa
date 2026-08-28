/* eslint-disable @next/next/no-img-element */
"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type MutableRefObject,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OfflinePlaybackSlide } from "@/lib/offline-playback-snapshot";
import type { OfflinePublicationProvenanceView } from "@/lib/offline-publication-provenance";
import {
  isSupportedDriveVideoMimeType,
  type SupportedDriveVideoMimeType,
} from "@/lib/drive-video-policy";
import { useAppState } from "@/app/app-providers";
import { createPlayerProjectLinkHref } from "@/lib/player-route";
import { useOfflinePlaybackSnapshot } from "./use-offline-playback-snapshot";
import {
  canApplyRemoteVideoResult,
  canRetryRemoteVideoPlayback,
  buildPlayerDriveVideoSessionRegistration,
  createRemoteVideoRetryOwnerKey,
  getPlayerSlideMediaKind,
  getPlayerVideoUnavailableCopy,
  getPlayerVideoUnavailableReason,
  getRemoteVideoCanPlayTypeLabel,
  getRemoteVideoRetryGuidance,
  isCurrentVideoSourceIdentity,
  isValidRemoteVideoFileSize,
  normalizeRemoteVideoContentTypeLabel,
  normalizeRemoteVideoResponseContentType,
  type PlayerRemoteVideoRetryStatus,
  type RemoteVideoCanPlayTypeLabel,
  type RemoteVideoContentTypeLabel,
} from "./player-video-playback-state";

const DEFAULT_SLIDE_DURATION_SECONDS = 5;
const PLAYER_CONTROLS_HIDE_DELAY_MS = 4_000;
const PLAYER_LOCK_HOLD_DURATION_MS = 2_000;
const SLIDE_TRANSITION_DURATION_MS = 320;
const PLAYER_VIDEO_START_TIMEOUT_MS = 4_000;
const PLAYER_REMOTE_VIDEO_SESSION_TTL_MS = 45 * 60 * 1000;
const PLAYER_REMOTE_VIDEO_METADATA_TIMEOUT_MS = 15_000;
const PLAYER_REMOTE_VIDEO_START_TIMEOUT_MS = 20_000;
const PLAYER_REMOTE_VIDEO_STALL_TIMEOUT_MS = 30_000;
const PLAYER_VIDEO_CONTROLS_HIDE_DELAY_MS = 5_000;
const PLAYER_VIDEO_FALLBACK_DISPLAY_MS = 1_500;
const PLAYER_VIDEO_MAX_FALLBACK_MS = 60_000;
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

type PlayerSlideVideo = {
  slideId: string;
  assetId: string;
  assetName: string;
  objectUrl?: string;
  sourceUrl: string;
  sourceKind: "offline" | "remote";
  mimeType: SupportedDriveVideoMimeType;
  sessionId?: string;
  durationMs?: number;
  durationSeconds?: number;
};

type PlayerSlideImageStatus = "idle" | "ready" | "error";
type PlayerSlideVideoStatus = "idle" | "ready" | "error";
type PlayerRemoteVideoRetryState = {
  ownerKey: string | null;
  status: PlayerRemoteVideoRetryStatus;
};
type PlayerVideoSlideAdvanceIntent = "next" | "fallback";
type OnlineVideoPlaybackStatus =
  | "idle"
  | "enabled"
  | "registering"
  | "registered"
  | "playing"
  | "skipped"
  | "error";
type RemoteVideoRangeRequestLabel = "present" | "absent";
type RemoteVideoHeaderSourceLabel = "present" | "synthesized" | "absent";
type RemoteVideoRangeWindowLabel = "capped" | "full" | "none";
type RemoteVideoRangeKindLabel =
  | "start-end"
  | "start-open"
  | "suffix"
  | "missing"
  | "invalid"
  | "multi-range"
  | "unsatisfiable";
type RemoteVideoContentLengthMatchLabel = "yes" | "no" | "unknown";
type RemoteVideoUpstreamRangeStatusLabel =
  | "honored"
  | "ignored"
  | "not-requested"
  | "unknown";
type RemoteVideoBufferedAheadLabel =
  | "none"
  | "0-2s"
  | "2-5s"
  | "5-15s"
  | "15s+"
  | "unknown";
type RemoteVideoStallStateLabel =
  | "playing"
  | "buffering"
  | "recovered"
  | "error"
  | "unknown";
type RemoteVideoMediaEventName =
  | "loadstart"
  | "loadedmetadata"
  | "loadeddata"
  | "canplay"
  | "progress"
  | "playing"
  | "waiting"
  | "stalled"
  | "error"
  | "ended";

type RemoteVideoStreamDiagnostics = {
  status: number;
  rangeRequest: RemoteVideoRangeRequestLabel;
  contentType: RemoteVideoContentTypeLabel;
  contentRange: RemoteVideoHeaderSourceLabel;
  acceptRanges: RemoteVideoHeaderSourceLabel;
  rangeWindow: RemoteVideoRangeWindowLabel;
  rangeKind: RemoteVideoRangeKindLabel;
  contentLengthMatch: RemoteVideoContentLengthMatchLabel;
  upstreamRangeStatus: RemoteVideoUpstreamRangeStatusLabel;
  hasContentLength: boolean;
  upstreamError?: "fetchFailed";
};

type RemoteVideoProbeDiagnostics = RemoteVideoStreamDiagnostics;

type RemoteVideoMediaDiagnostics = {
  canPlayType: RemoteVideoCanPlayTypeLabel;
  errorCode: number | null;
  errorLabel: string | null;
  readyState: number;
  networkState: number;
  events: RemoteVideoMediaEventName[];
  bufferedAhead: RemoteVideoBufferedAheadLabel;
  waitingCount: number;
  stalledCount: number;
  recoveryCount: number;
  stallState: RemoteVideoStallStateLabel;
};

type RemoteVideoMediaDiagnosticsUpdate = {
  canPlayType?: RemoteVideoCanPlayTypeLabel;
  errorCode?: number | null;
  readyState: number;
  networkState: number;
  eventName?: RemoteVideoMediaEventName;
  bufferedAhead?: RemoteVideoBufferedAheadLabel;
};

const REMOTE_VIDEO_MEDIA_EVENT_NAMES: RemoteVideoMediaEventName[] = [
  "loadstart",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "progress",
  "playing",
  "waiting",
  "stalled",
  "error",
  "ended",
];
const REMOTE_VIDEO_MEDIA_EVENT_MAX_COUNT = 6;

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

type PlayerControlGroupProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "aria-hidden" | "inert"
> & {
  visible: boolean;
  focusDestinationRef: RefObject<HTMLElement | null>;
};

function relocateFocusFromHiddenPlayerControls(
  controlGroup: Pick<HTMLElement, "contains"> | null,
  activeElement: Element | null,
  focusDestination: Pick<HTMLElement, "focus"> | null,
): boolean {
  if (
    controlGroup === null ||
    activeElement === null ||
    focusDestination === null ||
    !controlGroup.contains(activeElement)
  ) {
    return false;
  }

  focusDestination.focus({ preventScroll: true });
  return true;
}

function PlayerControlGroup({
  visible,
  focusDestinationRef,
  ...props
}: PlayerControlGroupProps) {
  const controlGroupRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (visible) {
      return;
    }

    relocateFocusFromHiddenPlayerControls(
      controlGroupRef.current,
      document.activeElement,
      focusDestinationRef.current,
    );
  }, [focusDestinationRef, visible]);

  return (
    <div
      {...props}
      ref={controlGroupRef}
      inert={visible ? undefined : true}
      aria-hidden={visible ? undefined : true}
    />
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<PlayerRouteFallback />}>
      <PlayerPageContent />
    </Suspense>
  );
}

function PlayerRouteFallback() {
  return (
    <main className="min-h-svh bg-slate-950 px-4 py-6 text-slate-50">
      <div className="mx-auto w-full max-w-4xl">
        <PlayerStatusCard
          tone="neutral"
          title="ローカルの再生用コピーを確認しています"
          description="端末保存データから、プロジェクト・スライド・素材を読み込んでいます。"
        />
      </div>
    </main>
  );
}

function PlayerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get("projectId");
  const {
    googleStatus,
    registerDriveVideoPlaybackSession,
    unregisterDriveVideoPlaybackSession,
    clearDriveVideoPlaybackSessions,
  } = useAppState();
  const {
    status: snapshotLoadStatus,
    snapshot,
    errorMessage,
    selectedProjectId,
    selectProject,
    clearSelectedProject,
    reload,
  } = useOfflinePlaybackSnapshot({
    requestedProjectId,
  });

  function handleSelectProject(projectId: string) {
    selectProject(projectId);
    const href = createPlayerProjectLinkHref(projectId);
    if (!href) {
      return;
    }
    router.replace(
      `${href.pathname}?projectId=${encodeURIComponent(href.query.projectId)}`,
    );
  }

  function handleClearSelectedProject() {
    clearSelectedProject();
    router.replace("/player");
  }

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [displayedSlideImage, setDisplayedSlideImage] =
    useState<PlayerSlideImage | null>(null);
  const [previousSlideImage, setPreviousSlideImage] =
    useState<PlayerSlideImage | null>(null);
  const [imageStatus, setImageStatus] = useState<PlayerSlideImageStatus>(
    "idle",
  );
  const [displayedSlideVideo, setDisplayedSlideVideo] =
    useState<PlayerSlideVideo | null>(null);
  const [videoStatus, setVideoStatus] = useState<PlayerSlideVideoStatus>(
    "idle",
  );
  const [onlineVideoPlaybackStatus, setOnlineVideoPlaybackStatus] =
    useState<OnlineVideoPlaybackStatus>("idle");
  const [onlineVideoPlaybackMessage, setOnlineVideoPlaybackMessage] =
    useState("online video playback: enabled");
  const [remoteVideoStreamDiagnostics, setRemoteVideoStreamDiagnostics] =
    useState<RemoteVideoStreamDiagnostics | null>(null);
  const [remoteVideoProbeDiagnostics, setRemoteVideoProbeDiagnostics] =
    useState<RemoteVideoProbeDiagnostics | null>(null);
  const [remoteVideoMediaDiagnostics, setRemoteVideoMediaDiagnostics] =
    useState<RemoteVideoMediaDiagnostics | null>(null);
  const [videoDiagnosticsVisible, setVideoDiagnosticsVisible] = useState(false);
  const [remoteVideoRetryState, setRemoteVideoRetryState] =
    useState<PlayerRemoteVideoRetryState>({ ownerKey: null, status: "idle" });
  const [remoteVideoRetryGeneration, setRemoteVideoRetryGeneration] =
    useState(0);
  const [slideTransitionDirection, setSlideTransitionDirection] =
    useState<SlideTransitionDirection>("none");
  const [isSlideTransitioning, setIsSlideTransitioning] = useState(false);
  const displayedSlideImageRef = useRef<PlayerSlideImage | null>(null);
  const previousSlideImageRef = useRef<PlayerSlideImage | null>(null);
  const displayedSlideVideoRef = useRef<PlayerSlideVideo | null>(null);
  const currentVideoSlideKeyRef = useRef<string | null>(null);
  const remoteVideoSessionIdRef = useRef<string | null>(null);
  const releasedRemoteVideoSessionIdsRef = useRef(new Set<string>());
  const remoteVideoRetryInFlightRef = useRef(false);
  const remoteVideoRetrySlideKeyRef = useRef<string | null>(null);
  const remoteVideoRetryGenerationRef = useRef(0);
  const handledVideoSlideAdvanceRef =
    useRef<PlayerVideoSlideAdvanceIntent | null>(null);
  const videoFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
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
  const playerRootRef = useRef<HTMLElement | null>(null);

  const readySnapshot = snapshot?.status === "ready" ? snapshot : null;
  const unavailableProjectSnapshot =
    snapshot?.status === "projectSelectionRequired" &&
    snapshot.selectedProjectId !== undefined
      ? snapshot
      : null;
  const projectSelectionSnapshot =
    snapshot?.status === "projectSelectionRequired" &&
    snapshot.selectedProjectId === undefined
      ? snapshot
      : null;
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

  const handleVideoPreviousSlide = useCallback(() => {
    revealControls();
    moveToPreviousSlide();
  }, [moveToPreviousSlide, revealControls]);

  const handleVideoNextSlide = useCallback(() => {
    revealControls();
    moveToNextSlide();
  }, [moveToNextSlide, revealControls]);

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
    const canUseSwipeNavigation =
      slideCount > 0 && imageStatus !== "error" && videoStatus !== "error";

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
    const canUseSwipeNavigation =
      slideCount > 0 && imageStatus !== "error" && videoStatus !== "error";

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
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const message = event.data as
        | {
            type?: unknown;
            payload?: {
              sessionId?: unknown;
              status?: unknown;
              rangeRequest?: unknown;
              contentType?: unknown;
              contentRange?: unknown;
              acceptRanges?: unknown;
              rangeWindow?: unknown;
              rangeKind?: unknown;
              contentLengthMatch?: unknown;
              upstreamRangeStatus?: unknown;
              hasContentRange?: unknown;
              hasAcceptRanges?: unknown;
              hasContentLength?: unknown;
              upstreamError?: unknown;
            };
          }
        | null;

      if (message?.type !== "DRIVE_VIDEO_STREAM_STATUS") {
        return;
      }

      const sessionId = message.payload?.sessionId;
      const diagnostics = normalizeRemoteVideoStreamDiagnostics(message.payload);

      if (
        typeof sessionId !== "string" ||
        sessionId !== remoteVideoSessionIdRef.current ||
        !diagnostics
      ) {
        return;
      }

      setRemoteVideoStreamDiagnostics(diagnostics);

      const { status } = diagnostics;

      if (status === 200 || status === 206) {
        setOnlineVideoPlaybackStatus("registered");
        setOnlineVideoPlaybackMessage("stream session: registered");
        return;
      }

      if (status === 0) {
        setOnlineVideoPlaybackStatus("error");
        setOnlineVideoPlaybackMessage(
          "online video playback error: stream fetch failed",
        );
        return;
      }

      setOnlineVideoPlaybackStatus("error");
      setOnlineVideoPlaybackMessage(
        `online video playback error: stream response status ${status}`,
      );
    };

    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage,
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        "message",
        handleServiceWorkerMessage,
      );
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

  const playbackProjectId = readySnapshot?.projectId ?? null;

  useEffect(() => {
    queueMicrotask(() => {
      setCurrentSlideIndex(0);
      setSlideTransitionDirection("none");
      setIsSlideTransitioning(false);
      revokeSlideImage(previousSlideImageRef.current);
      revokeSlideImage(displayedSlideImageRef.current);
      revokeSlideVideo(displayedSlideVideoRef.current);
      previousSlideImageRef.current = null;
      displayedSlideImageRef.current = null;
      displayedSlideVideoRef.current = null;
      setPreviousSlideImage(null);
      setDisplayedSlideImage(null);
      setDisplayedSlideVideo(null);
      setImageStatus("idle");
      setVideoStatus("idle");
    });
  }, [playbackProjectId]);

  const safeCurrentSlideIndex =
    slideCount === 0
      ? 0
      : Math.max(0, Math.min(slideCount - 1, currentSlideIndex));

  const currentSlide = readySnapshot?.slides[safeCurrentSlideIndex] ?? null;
  const currentSlidePlaybackKey = currentSlide
    ? getPlayerSlidePlaybackKey(currentSlide)
    : null;
  const currentRemoteVideoRetryOwnerKey = createRemoteVideoRetryOwnerKey({
    projectKey: readySnapshot?.projectId ?? null,
    snapshotKey: readySnapshot?.syncedAt ?? null,
    slideKey: currentSlidePlaybackKey,
  });
  const remoteVideoRetryStatus =
    remoteVideoRetryState.ownerKey === currentRemoteVideoRetryOwnerKey
      ? remoteVideoRetryState.status
      : "idle";
  const remoteVideoSlideCount =
    readySnapshot?.slides.filter(
      (slide) => slide.offlineAvailability === "remoteOnly",
    ).length ?? 0;

  const currentSlideCaption =
    typeof currentSlide?.caption === "string" ? currentSlide.caption.trim() : "";

  const canRenderCurrentSlide =
    readySnapshot !== null && slideCount > 0 && currentSlide !== null;
  const canPlay =
    snapshotLoadStatus === "ready" &&
    readySnapshot !== null &&
    slideCount > 0 &&
    currentSlide !== null;
  const currentSlideMediaKind = getPlayerSlideMediaKind(currentSlide);
  const currentSlideVideoMimeType =
    currentSlideMediaKind === "video" &&
    currentSlide &&
    isSupportedDriveVideoMimeType(currentSlide.mimeType)
      ? currentSlide.mimeType
      : null;
  const isCurrentRemoteVideo =
    currentSlideMediaKind === "video" &&
    currentSlide?.offlineAvailability === "remoteOnly";

  const currentSlideDurationSeconds =
    currentSlide?.durationSeconds ?? DEFAULT_SLIDE_DURATION_SECONDS;
  const effectiveAutoAdvanceIntervalSeconds =
    autoAdvanceIntervalSeconds === null
      ? null
      : (autoAdvanceIntervalSeconds ?? currentSlideDurationSeconds);
  const isCurrentImageLoaded =
    currentSlideMediaKind === "image" &&
    imageStatus === "ready" &&
    displayedSlideImage !== null &&
    currentSlide !== null &&
    displayedSlideImage.slideId === currentSlide.slideId &&
    displayedSlideImage.assetId === currentSlide.assetId;
  const currentSlideBlob =
    canRenderCurrentSlide && currentSlide?.offlineAvailability === "offline"
      ? currentSlide.blob
      : null;
  const currentSlideImageSlideId =
    canRenderCurrentSlide ? (currentSlide?.slideId ?? null) : null;
  const currentSlideImageAssetId =
    canRenderCurrentSlide ? (currentSlide?.assetId ?? null) : null;
  const currentSlideImageAssetName =
    canRenderCurrentSlide ? (currentSlide?.assetName ?? null) : null;
  const currentSlideVideoDurationMs =
    canRenderCurrentSlide && currentSlideMediaKind === "video"
      ? currentSlide?.durationMs
      : undefined;
  const onlineVideoDiagnostics = buildOnlineVideoDiagnostics({
    status: onlineVideoPlaybackStatus,
    message: onlineVideoPlaybackMessage,
    remoteVideoSlideCount,
    currentSlide,
    googleStatus,
    isOnline,
    streamDiagnostics: remoteVideoStreamDiagnostics,
    probeDiagnostics: remoteVideoProbeDiagnostics,
    mediaDiagnostics: remoteVideoMediaDiagnostics,
  });
  const canShowVideoDiagnostics =
    isCurrentRemoteVideo &&
    !isProductionMode &&
    (videoStatus === "error" || onlineVideoPlaybackStatus === "error");
  const onlineVideoUserMessage =
    isCurrentRemoteVideo &&
    (videoStatus === "error" || onlineVideoPlaybackStatus === "error")
      ? "オンライン動画を再生できません"
      : null;
  const videoUnavailableReason = getPlayerVideoUnavailableReason({
    isCurrentRemoteVideo,
    isOnline,
    hasMediaPlaybackFailure:
      videoStatus === "error" && displayedSlideVideo !== null,
  });
  const videoUnavailableCopy = getPlayerVideoUnavailableCopy(
    videoUnavailableReason,
  );
  const canRetryCurrentRemoteVideo = canRetryRemoteVideoPlayback({
    isRemoteVideo: isCurrentRemoteVideo,
    hasPlaybackError:
      videoStatus === "error" || onlineVideoPlaybackStatus === "error",
    isOnline,
    isGoogleConnected: googleStatus === "connected",
    isRetrying: remoteVideoRetryStatus === "retrying",
    ownerMatches: currentRemoteVideoRetryOwnerKey !== null,
  });

  const completeRemoteVideoRetry = useCallback(
    (
      ownerKey: string,
      generation: number,
      status: "idle" | "failed",
      isCancelled = false,
    ) => {
      if (!canApplyRemoteVideoResult({
        expectedOwnerKey: ownerKey,
        currentOwnerKey: remoteVideoRetrySlideKeyRef.current,
        expectedGeneration: generation,
        currentGeneration: remoteVideoRetryGenerationRef.current,
        isCancelled,
      })) {
        return;
      }

      remoteVideoRetryInFlightRef.current = false;
      remoteVideoRetrySlideKeyRef.current = null;
      setRemoteVideoRetryState({ ownerKey, status });
    },
    [],
  );

  const releaseRemoteVideoSession = useCallback(
    (targetSessionId: string | null = remoteVideoSessionIdRef.current) => {
      if (!targetSessionId) {
        return;
      }

      if (remoteVideoSessionIdRef.current === targetSessionId) {
        remoteVideoSessionIdRef.current = null;
      }

      if (releasedRemoteVideoSessionIdsRef.current.has(targetSessionId)) {
        return;
      }

      releasedRemoteVideoSessionIdsRef.current.add(targetSessionId);
      unregisterDriveVideoPlaybackSession(targetSessionId);
    },
    [unregisterDriveVideoPlaybackSession],
  );

  const retryRemoteVideoPlayback = useCallback(() => {
    const slideKey = currentSlidePlaybackKey;
    const ownerKey = currentRemoteVideoRetryOwnerKey;

    if (
      !slideKey ||
      !ownerKey ||
      currentVideoSlideKeyRef.current !== slideKey ||
      !isCurrentRemoteVideo ||
      (videoStatus !== "error" && onlineVideoPlaybackStatus !== "error") ||
      isOnline !== true ||
      googleStatus !== "connected" ||
      remoteVideoRetryInFlightRef.current
    ) {
      return;
    }

    remoteVideoRetryInFlightRef.current = true;
    remoteVideoRetrySlideKeyRef.current = ownerKey;
    setRemoteVideoRetryState({ ownerKey, status: "retrying" });

    releaseRemoteVideoSession();

    revokeSlideVideo(displayedSlideVideoRef.current);
    displayedSlideVideoRef.current = null;
    setDisplayedSlideVideo(null);
    setRemoteVideoStreamDiagnostics(null);
    setRemoteVideoProbeDiagnostics(null);
    setRemoteVideoMediaDiagnostics(null);
    setVideoDiagnosticsVisible(false);
    clearPlayerTimeout(videoFallbackTimeoutRef);
    handledVideoSlideAdvanceRef.current = null;
    const nextGeneration = remoteVideoRetryGenerationRef.current + 1;
    remoteVideoRetryGenerationRef.current = nextGeneration;
    setRemoteVideoRetryGeneration(nextGeneration);
  }, [
    currentSlidePlaybackKey,
    currentRemoteVideoRetryOwnerKey,
    googleStatus,
    isCurrentRemoteVideo,
    isOnline,
    onlineVideoPlaybackStatus,
    releaseRemoteVideoSession,
    videoStatus,
  ]);

  useEffect(() => {
    currentVideoSlideKeyRef.current = currentSlidePlaybackKey;
    handledVideoSlideAdvanceRef.current = null;
    clearPlayerTimeout(videoFallbackTimeoutRef);
    queueMicrotask(() => {
      setVideoDiagnosticsVisible(false);
      setRemoteVideoRetryState({
        ownerKey: currentRemoteVideoRetryOwnerKey,
        status: "idle",
      });
    });
    remoteVideoRetryInFlightRef.current = false;
    remoteVideoRetrySlideKeyRef.current = null;
  }, [currentRemoteVideoRetryOwnerKey, currentSlidePlaybackKey]);

  useEffect(() => {
    if (videoStatus === "error" || onlineVideoPlaybackStatus === "error") {
      queueMicrotask(() => {
        setVideoDiagnosticsVisible(true);
      });
    }
  }, [onlineVideoPlaybackStatus, videoStatus]);

  const markVideoSlideAdvanceHandled = useCallback(
    (
      slideKey: string | null,
      intent: PlayerVideoSlideAdvanceIntent,
    ): boolean => {
      if (!slideKey || currentVideoSlideKeyRef.current !== slideKey) {
        return false;
      }

      if (handledVideoSlideAdvanceRef.current !== null) {
        return false;
      }

      handledVideoSlideAdvanceRef.current = intent;
      return true;
    },
    [],
  );

  useEffect(() => {
    if (
      currentSlideMediaKind !== "image" ||
      !currentSlideBlob ||
      !currentSlideImageSlideId ||
      !currentSlideImageAssetId
    ) {
      queueMicrotask(() => {
        setImageStatus("idle");
        clearPlayerTimeout(slideTransitionTimeoutRef);
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
      clearPlayerTimeout(slideTransitionTimeoutRef);

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
    currentSlideMediaKind,
  ]);

  useEffect(() => {
    if (
      currentSlideMediaKind !== "video" ||
      !currentSlideVideoMimeType ||
      isCurrentRemoteVideo ||
      !currentSlideBlob ||
      !currentSlideImageSlideId ||
      !currentSlideImageAssetId
    ) {
      queueMicrotask(() => {
        setVideoStatus("idle");
        revokeSlideVideo(displayedSlideVideoRef.current);
        displayedSlideVideoRef.current = null;
        setDisplayedSlideVideo(null);
      });
      return;
    }

    let cancelled = false;
    let nextObjectUrl: string | null = null;

    queueMicrotask(() => {
      if (!cancelled) {
        setVideoStatus("idle");
      }
    });

    try {
      nextObjectUrl = URL.createObjectURL(currentSlideBlob);
    } catch {
      queueMicrotask(() => {
        if (!cancelled) {
          markVideoSlideAdvanceHandled(currentSlidePlaybackKey, "fallback");
          setVideoStatus("error");
        }
      });
      return;
    }

    const nextVideo: PlayerSlideVideo = {
      objectUrl: nextObjectUrl,
      sourceUrl: nextObjectUrl,
      sourceKind: "offline",
      mimeType: currentSlideVideoMimeType,
      slideId: currentSlideImageSlideId,
      assetId: currentSlideImageAssetId,
      assetName: currentSlideImageAssetName ?? "現在のスライド動画",
      ...(typeof currentSlideVideoDurationMs === "number"
        ? { durationMs: currentSlideVideoDurationMs }
        : {}),
      durationSeconds: currentSlideDurationSeconds,
    };

    const currentVideo = displayedSlideVideoRef.current;

    if (
      currentVideo &&
      currentVideo.slideId === nextVideo.slideId &&
      currentVideo.assetId === nextVideo.assetId
    ) {
      const updatedVideo: PlayerSlideVideo = {
        ...currentVideo,
        ...(typeof currentSlideVideoDurationMs === "number"
          ? { durationMs: currentSlideVideoDurationMs }
          : {}),
        durationSeconds: currentSlideDurationSeconds,
      };
      displayedSlideVideoRef.current = updatedVideo;
      revokeSlideVideo(nextVideo);
      queueMicrotask(() => {
        if (!cancelled) {
          setDisplayedSlideVideo(updatedVideo);
          setVideoStatus("ready");
        }
      });
      return;
    }

    revokeSlideVideo(currentVideo);
    displayedSlideVideoRef.current = nextVideo;
    queueMicrotask(() => {
      if (!cancelled) {
        setDisplayedSlideVideo(nextVideo);
        setVideoStatus("ready");
      }
    });

    return () => {
      cancelled = true;

      if (displayedSlideVideoRef.current === nextVideo) {
        displayedSlideVideoRef.current = null;
      }

      revokeSlideVideo(nextVideo);
    };
  }, [
    currentSlideBlob,
    currentSlideImageAssetId,
    currentSlideImageAssetName,
    currentSlideImageSlideId,
    currentSlideMediaKind,
    currentSlideVideoMimeType,
    currentSlideVideoDurationMs,
    currentSlideDurationSeconds,
    currentSlidePlaybackKey,
    isCurrentRemoteVideo,
    markVideoSlideAdvanceHandled,
  ]);

  useEffect(() => {
    let cancelled = false;
    const setupGeneration = remoteVideoRetryGeneration;

    if (
      !isCurrentRemoteVideo ||
      !currentSlide ||
      !currentSlideVideoMimeType ||
      !currentSlidePlaybackKey ||
      !currentRemoteVideoRetryOwnerKey ||
      !currentSlideImageSlideId ||
      !currentSlideImageAssetId
    ) {
      queueMicrotask(() => {
        if (!cancelled && !isCurrentRemoteVideo) {
          setOnlineVideoPlaybackStatus("idle");
          setOnlineVideoPlaybackMessage("online video playback: enabled");
          setRemoteVideoStreamDiagnostics(null);
          setRemoteVideoProbeDiagnostics(null);
          setRemoteVideoMediaDiagnostics(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    if (isOnline === false) {
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        setOnlineVideoPlaybackStatus("skipped");
        setOnlineVideoPlaybackMessage(
          "online video playback skipped: offline",
        );
        markVideoSlideAdvanceHandled(currentSlidePlaybackKey, "fallback");
        setVideoStatus("error");
        completeRemoteVideoRetry(
          currentRemoteVideoRetryOwnerKey,
          setupGeneration,
          "idle",
          cancelled,
        );
      });
      return () => {
        cancelled = true;
      };
    }

    if (googleStatus !== "connected") {
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        setOnlineVideoPlaybackStatus("skipped");
        setOnlineVideoPlaybackMessage(
          "online video playback skipped: access token missing",
        );
        markVideoSlideAdvanceHandled(currentSlidePlaybackKey, "fallback");
        setVideoStatus("error");
        completeRemoteVideoRetry(
          currentRemoteVideoRetryOwnerKey,
          setupGeneration,
          "idle",
          cancelled,
        );
      });
      return () => {
        cancelled = true;
      };
    }

    const remoteVideoFileSize = currentSlide.sourceSizeBytes;

    if (!isValidRemoteVideoFileSize(remoteVideoFileSize)) {
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        setOnlineVideoPlaybackStatus("skipped");
        setOnlineVideoPlaybackMessage(
          "online video playback skipped: file size missing",
        );
        markVideoSlideAdvanceHandled(currentSlidePlaybackKey, "fallback");
        setVideoStatus("error");
        completeRemoteVideoRetry(
          currentRemoteVideoRetryOwnerKey,
          setupGeneration,
          "failed",
          cancelled,
        );
      });
      return () => {
        cancelled = true;
      };
    }

    const sessionId = createPlayerVideoSessionId();
    const sessionRegistration = buildPlayerDriveVideoSessionRegistration({
      sessionId,
      assetFileId: currentSlide.sourceDriveFileId,
      mimeType: currentSlideVideoMimeType,
      fileSize: remoteVideoFileSize,
      expiresAt: Date.now() + PLAYER_REMOTE_VIDEO_SESSION_TTL_MS,
    });

    if (!sessionRegistration) {
      return () => {
        cancelled = true;
      };
    }

    const sourceUrl = buildPlayerVideoStreamSourceUrl(sessionId);
    const probeController = new AbortController();
    remoteVideoSessionIdRef.current = sessionId;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setVideoStatus("idle");
      setOnlineVideoPlaybackStatus("registering");
      setOnlineVideoPlaybackMessage("stream session: registering");
      setRemoteVideoStreamDiagnostics(null);
      setRemoteVideoProbeDiagnostics(null);
      setRemoteVideoMediaDiagnostics(null);
    });

    void registerDriveVideoPlaybackSession(sessionRegistration).then(
      (result) => {
        if (cancelled) {
          releaseRemoteVideoSession(sessionId);
          return;
        }

        if (!result.ok) {
          setOnlineVideoPlaybackStatus("skipped");
          setOnlineVideoPlaybackMessage(
            getOnlineVideoRegistrationFailureMessage(result.reason),
          );
          markVideoSlideAdvanceHandled(currentSlidePlaybackKey, "fallback");
          setVideoStatus("error");
          completeRemoteVideoRetry(
            currentRemoteVideoRetryOwnerKey,
            setupGeneration,
            "failed",
            cancelled,
          );
          return;
        }

        const nextVideo: PlayerSlideVideo = {
          sourceUrl,
          sourceKind: "remote",
          mimeType: currentSlideVideoMimeType,
          sessionId,
          slideId: currentSlideImageSlideId,
          assetId: currentSlideImageAssetId,
          assetName: currentSlide.assetName ?? "オンライン動画",
          ...(typeof currentSlideVideoDurationMs === "number"
            ? { durationMs: currentSlideVideoDurationMs }
            : {}),
          durationSeconds: currentSlideDurationSeconds,
        };

        revokeSlideVideo(displayedSlideVideoRef.current);
        displayedSlideVideoRef.current = nextVideo;
        setDisplayedSlideVideo(nextVideo);
        setVideoStatus("ready");
        setOnlineVideoPlaybackStatus("registered");
        setOnlineVideoPlaybackMessage("stream session: registered");
        completeRemoteVideoRetry(
          currentRemoteVideoRetryOwnerKey,
          setupGeneration,
          "idle",
          cancelled,
        );

        void probeRemoteVideoStream(sourceUrl, probeController.signal).then(
          (diagnostics) => {
            if (!cancelled) {
              setRemoteVideoProbeDiagnostics(diagnostics);
            }
          },
        );
      },
    );

    return () => {
      cancelled = true;
      probeController.abort();
      releaseRemoteVideoSession(sessionId);

      if (displayedSlideVideoRef.current?.sessionId === sessionId) {
        displayedSlideVideoRef.current = null;
        setDisplayedSlideVideo(null);
      }
    };
  }, [
    currentSlide,
    currentSlideImageAssetId,
    currentSlideImageSlideId,
    currentSlidePlaybackKey,
    currentSlideVideoMimeType,
    currentRemoteVideoRetryOwnerKey,
    currentSlideVideoDurationMs,
    currentSlideDurationSeconds,
    completeRemoteVideoRetry,
    googleStatus,
    isCurrentRemoteVideo,
    isOnline,
    markVideoSlideAdvanceHandled,
    registerDriveVideoPlaybackSession,
    releaseRemoteVideoSession,
    remoteVideoRetryGeneration,
  ]);

  useEffect(() => {
    const releasedSessionIds = releasedRemoteVideoSessionIdsRef.current;

    return () => {
      clearPlayerTimeout(videoFallbackTimeoutRef);
      clearPlayerTimeout(slideTransitionTimeoutRef);
      revokeSlideImage(previousSlideImageRef.current);
      revokeSlideImage(displayedSlideImageRef.current);
      revokeSlideVideo(displayedSlideVideoRef.current);
      clearDriveVideoPlaybackSessions();
      releasedSessionIds.clear();
      previousSlideImageRef.current = null;
      displayedSlideImageRef.current = null;
      displayedSlideVideoRef.current = null;
    };
  }, [clearDriveVideoPlaybackSessions]);

  const handleVideoPlaybackEnded = useCallback((
    slideKey: string,
    sourceUrl: string,
  ) => {
    if (!isCurrentVideoSourceIdentity(
      displayedSlideVideoRef.current?.sourceUrl ?? null,
      sourceUrl,
    )) {
      return;
    }

    setOnlineVideoPlaybackStatus((current) =>
      current === "playing" || current === "registered" ? "idle" : current,
    );
    if (!markVideoSlideAdvanceHandled(slideKey, "next")) {
      return;
    }

    clearPlayerTimeout(videoFallbackTimeoutRef);
    moveToNextSlide();
  }, [markVideoSlideAdvanceHandled, moveToNextSlide]);

  const handleVideoPlaybackFailure = useCallback((
    slideKey: string,
    sourceUrl: string,
  ) => {
    if (!isCurrentVideoSourceIdentity(
      displayedSlideVideoRef.current?.sourceUrl ?? null,
      sourceUrl,
    )) {
      return;
    }

    if (!markVideoSlideAdvanceHandled(slideKey, "fallback")) {
      return;
    }

    setOnlineVideoPlaybackStatus((current) =>
      current === "playing" || current === "registered" ? "error" : current,
    );
    setOnlineVideoPlaybackMessage("online video playback error: media error");
    setVideoStatus("error");
  }, [markVideoSlideAdvanceHandled]);

  const handleVideoPlaybackMessage = useCallback(
    (
      slideKey: string,
      sourceUrl: string,
      message: string,
      status: OnlineVideoPlaybackStatus = "playing",
    ) => {
      if (
        currentVideoSlideKeyRef.current !== slideKey ||
        !isCurrentVideoSourceIdentity(
          displayedSlideVideoRef.current?.sourceUrl ?? null,
          sourceUrl,
        )
      ) {
        return;
      }

      if (!message.startsWith("online video playback")) {
        return;
      }

      setOnlineVideoPlaybackStatus(status);
      setOnlineVideoPlaybackMessage(message);
    },
    [],
  );

  const handleRemoteVideoMediaDiagnostics = useCallback(
    (
      slideKey: string,
      sourceUrl: string,
      update: RemoteVideoMediaDiagnosticsUpdate,
    ) => {
      if (
        currentVideoSlideKeyRef.current !== slideKey ||
        !isCurrentVideoSourceIdentity(
          displayedSlideVideoRef.current?.sourceUrl ?? null,
          sourceUrl,
        )
      ) {
        return;
      }

      setRemoteVideoMediaDiagnostics((current) => {
        const events = update.eventName
          ? [...(current?.events ?? []), update.eventName].slice(
              -REMOTE_VIDEO_MEDIA_EVENT_MAX_COUNT,
            )
          : (current?.events ?? []);
        const errorCode =
          update.errorCode === undefined
            ? (current?.errorCode ?? null)
            : update.errorCode;
        const waitingCount =
          (current?.waitingCount ?? 0) +
          (update.eventName === "waiting" ? 1 : 0);
        const stalledCount =
          (current?.stalledCount ?? 0) +
          (update.eventName === "stalled" ? 1 : 0);
        const recoveryCount =
          (current?.recoveryCount ?? 0) +
          (update.eventName === "canplay" || update.eventName === "playing"
            ? 1
            : 0);

        return {
          canPlayType:
            update.canPlayType ?? current?.canPlayType ?? "empty",
          errorCode,
          errorLabel: getMediaErrorLabel(errorCode),
          readyState: update.readyState,
          networkState: update.networkState,
          events,
          bufferedAhead:
            update.bufferedAhead ?? current?.bufferedAhead ?? "unknown",
          waitingCount,
          stalledCount,
          recoveryCount,
          stallState:
            update.eventName === undefined
              ? (current?.stallState ?? "unknown")
              : getRemoteVideoStallState(update.eventName, errorCode),
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (
      currentSlideMediaKind !== "image" ||
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
    currentSlideMediaKind,
    isPlaybackPaused,
    imageStatus,
    isCurrentImageLoaded,
    slideCount,
    safeCurrentSlideIndex,
    moveToNextSlide,
  ]);

  useEffect(() => {
    if (
      !canPlay ||
      !currentSlidePlaybackKey ||
      safeCurrentSlideIndex >= slideCount - 1 ||
      currentSlideMediaKind !== "unsupported"
    ) {
      return;
    }

    if (
      !markVideoSlideAdvanceHandled(currentSlidePlaybackKey, "fallback")
    ) {
      return;
    }

    const timeoutId = setTimeout(() => {
      videoFallbackTimeoutRef.current = null;

      if (
        currentVideoSlideKeyRef.current !== currentSlidePlaybackKey ||
        handledVideoSlideAdvanceRef.current !== "fallback"
      ) {
        return;
      }

      moveToNextSlide();
    }, PLAYER_VIDEO_FALLBACK_DISPLAY_MS);

    videoFallbackTimeoutRef.current = timeoutId;

    return () => {
      if (videoFallbackTimeoutRef.current === timeoutId) {
        clearPlayerTimeout(videoFallbackTimeoutRef);
      }
    };
  }, [
    canPlay,
    currentSlidePlaybackKey,
    currentSlideMediaKind,
    markVideoSlideAdvanceHandled,
    moveToNextSlide,
    safeCurrentSlideIndex,
    slideCount,
  ]);

  const isSnapshotLoading = snapshotLoadStatus === "loading";
  const hasSnapshotLoadError = snapshotLoadStatus === "error";
  const emptySnapshot = snapshot?.status === "empty";
  const invalidSnapshot = snapshot?.status === "invalid";
  const noSlides = readySnapshot !== null && slideCount === 0;

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
        "一時的な端末保存データの読み込み失敗であれば、再読み込みで復帰できます。",
    },
    {
      title: "直らない場合は「つくる」で確認します",
      description:
        "ローカルの保存データを確認し、必要に応じて対象アルバムのローカル保存を削除してから「ローカルに保存」をもう一度実行してください。",
    },
  ];

  const emptySnapshotGuidance: PlayerGuidanceItem[] =
    isOnline === false
      ? [
          {
            title: "オンラインに戻します",
            description:
              "ローカルに再生用コピーがない状態では、オフラインのまま素材を取得できません。",
          },
          {
            title: "「つくる」でローカルへの保存を実行します",
            description:
              "オンライン復帰後、Google Driveへの接続とアルバムの状態を確認してから「ローカルに保存」を実行してください。",
          },
        ]
      : [
          {
            title: "「つくる」でローカルへの保存を実行します",
            description:
              "初回利用時、またはプロジェクト単位のローカル削除後は、ローカルに再生用コピーを作り直す必要があります。",
          },
          {
            title: "削除後なら正常な状態です",
            description:
              "ローカル保存を削除した直後にこの画面が表示されるのは正常です。Drive上のプロジェクトや写真は削除されていません。",
          },
        ];

  const invalidSnapshotGuidance: PlayerGuidanceItem[] = [
    {
      title: "「つくる」でローカルの保存データを確認します",
      description:
        "プロジェクト・素材・保存した本体・同期状態の件数や参照関係に不一致があります。",
    },
    {
      title: "対象プロジェクトのローカル保存を削除します",
      description:
        "端末内の壊れた再生用コピーだけを削除します。Google Drive上のプロジェクト設定と素材は削除されません。",
    },
    {
      title: "オンラインでローカルへの保存をもう一度実行します",
      description:
        "Driveから正しい再生データを取得し直し、端末保存データを作り直します。",
    },
  ];

  const noSlidesGuidance: PlayerGuidanceItem[] = [
    {
      title: "「つくる」でアルバムの状態を再確認します",
      description:
        "プロジェクトは保存されていますが、再生対象のスライドがありません。プロジェクト設定を確認してください。",
    },
    {
      title: "必要なら写真を追加します",
      description:
        "「つくる」で写真や動画を追加し、ローカルへの保存を実行してください。",
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
        "「つくる」で対象アルバムのローカル保存を削除し、オンラインでローカルへの保存を再実行してください。",
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
      <main
        ref={playerRootRef}
        tabIndex={-1}
        className="relative h-[100svh] min-h-[100svh] overflow-hidden bg-black text-slate-50"
      >
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
          {currentSlideMediaKind === "unsupported" ? (
            <PlayerVideoFallback
              title="動画はこの端末では再生できません"
              description="このスライドは現在の再生対象外です。次のスライドへ進みます。"
            />
          ) : null}

          {videoStatus === "error" || remoteVideoRetryStatus === "retrying" ? (
            <PlayerVideoFallback
              badge={videoUnavailableCopy.badge}
              title={videoUnavailableCopy.title}
              description={videoUnavailableCopy.description}
              canGoPrevious={safeCurrentSlideIndex > 0}
              canGoNext={safeCurrentSlideIndex < slideCount - 1}
              onPrevious={handleVideoPreviousSlide}
              onNext={handleVideoNextSlide}
              retryStatus={remoteVideoRetryStatus}
              canRetry={canRetryCurrentRemoteVideo}
              retryGuidance={getRemoteVideoRetryGuidance({
                isCurrentRemoteVideo,
                isOnline,
                googleStatus,
                retryStatus: remoteVideoRetryStatus,
              })}
              onRetry={
                isCurrentRemoteVideo ? retryRemoteVideoPlayback : undefined
              }
            />
          ) : null}

          {imageStatus === "error" ? (
            <div className="mx-4 max-w-xl rounded-2xl border border-red-400/30 bg-red-950/80 p-5 text-center text-red-50 shadow-2xl">
              <p className="text-lg font-semibold">
                このスライド画像を表示できません
              </p>
              <p className="mt-3 text-sm leading-6 text-red-100/80">
                このスライドが参照しているローカル保存写真を読み込めませんでした。
                再読み込みで直らない場合は、「つくる」でこのアルバムのローカル保存を削除し、
                オンラインでローカルへの保存をもう一度実行してください。
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

          {displayedSlideVideo &&
          currentSlideMediaKind === "video" &&
          videoStatus !== "error" ? (
            <PlayerVideoSlide
              key={`${displayedSlideVideo.slideId}:${displayedSlideVideo.assetId}`}
              video={displayedSlideVideo}
              onEnded={handleVideoPlaybackEnded}
              onPlaybackFailure={handleVideoPlaybackFailure}
              onPlaybackMessage={handleVideoPlaybackMessage}
              onRemoteMediaDiagnostics={handleRemoteVideoMediaDiagnostics}
              canGoPrevious={safeCurrentSlideIndex > 0}
              canGoNext={safeCurrentSlideIndex < slideCount - 1}
              onPrevious={handleVideoPreviousSlide}
              onNext={handleVideoNextSlide}
              diagnostics={isCurrentRemoteVideo ? onlineVideoDiagnostics : []}
              diagnosticsVisible={
                canShowVideoDiagnostics && videoDiagnosticsVisible
              }
              canShowDiagnosticsToggle={canShowVideoDiagnostics}
              focusDestinationRef={playerRootRef}
              onToggleDiagnostics={() =>
                setVideoDiagnosticsVisible((current) => !current)
              }
            />
          ) : null}

          {currentSlideMediaKind === "image" &&
          imageStatus === "idle" &&
          !displayedSlideImage ? (
            <p className="rounded-full bg-white/10 px-4 py-2 text-sm text-slate-300">
              ローカル保存されたスライド画像を準備しています
            </p>
          ) : null}

          {currentSlideMediaKind === "video" &&
          videoStatus === "idle" &&
          !displayedSlideVideo ? (
            <p className="rounded-full bg-white/10 px-4 py-2 text-sm text-slate-300">
              ローカル保存されたスライド動画を準備しています
            </p>
          ) : null}
        </div>

        <PlayerControlGroup
          data-player-controls="normal"
          visible={shouldShowNormalControls}
          focusDestinationRef={playerRootRef}
          className={`absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pb-16 transition-opacity duration-300 sm:px-6 ${controlsVisibilityClassName}`}
          style={{
            paddingTop: "max(env(safe-area-inset-top), 1rem)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">
                {readySnapshot.projectTitle ?? "名称未設定"}
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
                <Badge
                  variant="outline"
                  className={
                    readySnapshot.publicationProvenance.warning
                      ? "border-amber-300/70 bg-amber-400/15 text-amber-50"
                      : readySnapshot.publicationProvenance.tone === "success"
                        ? "border-emerald-300/50 bg-emerald-400/10 text-emerald-50"
                        : "border-white/20 bg-black/30 text-slate-100"
                  }
                  title={readySnapshot.publicationProvenance.message}
                >
                  {readySnapshot.publicationProvenance.label}
                </Badge>
                <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5">
                  {safeCurrentSlideIndex + 1} / {slideCount}
                </span>
                <span className="hidden max-w-[42vw] truncate rounded-full border border-white/15 bg-black/30 px-2 py-0.5 sm:inline">
                  synced {readySnapshot.syncedAt}
                </span>
                {onlineVideoUserMessage ? (
                  <span className="max-w-[60vw] truncate rounded-full border border-amber-200/30 bg-amber-400/15 px-2 py-0.5 text-amber-50">
                    {onlineVideoUserMessage}
                  </span>
                ) : null}
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
              {readySnapshot.publicationProvenance.warning ? (
                <p
                  className="mt-2 max-w-2xl text-xs leading-5 text-amber-100"
                  role="status"
                >
                  {readySnapshot.publicationProvenance.message}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {readySnapshot.availableProjects.length >= 2 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="rounded-full border border-white/15 bg-black/45 text-slate-50 hover:bg-white/20"
                  aria-label="再生プロジェクトを選び直す"
                  title="再生プロジェクトを選び直す"
                  onClick={() => {
                    revealControls();
                    handleClearSelectedProject();
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
                aria-label="つくるへ"
                title="つくるへ"
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
        </PlayerControlGroup>

        <PlayerControlGroup
          data-player-controls="normal"
          visible={shouldShowNormalControls}
          focusDestinationRef={playerRootRef}
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
        </PlayerControlGroup>

        <PlayerControlGroup
          data-player-controls="normal"
          visible={shouldShowNormalControls}
          focusDestinationRef={playerRootRef}
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
        </PlayerControlGroup>

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
              className="mx-auto max-w-4xl rounded-xl px-4 py-2 text-center text-base leading-7 text-white shadow-2xl sm:text-xl sm:leading-8"
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.62)",
                WebkitBackdropFilter: "blur(4px)",
                backdropFilter: "blur(4px)",
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
            className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pt-20 sm:px-6 ${
              currentSlideMediaKind === "video" ? "hidden" : ""
            }`}
            style={{
              paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
            }}
          >
            <PlayerControlGroup
              data-player-controls="normal"
              visible={shouldShowNormalControls}
              focusDestinationRef={playerRootRef}
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
            </PlayerControlGroup>
          </div>
        ) : null}

        {isCurrentRemoteVideo &&
        videoDiagnosticsVisible &&
        !isProductionMode &&
        videoStatus === "error" ? (
          <PlayerOnlineVideoDiagnostics diagnostics={onlineVideoDiagnostics} />
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
              この画面は、ローカルに保存済みの再生用コピーだけを使います。
              Google Driveから直接読み込む画面ではないため、初回利用時やローカル削除後は「つくる」で
              「ローカルに保存」を実行してください。
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
              <Link href="/admin">つくるへ</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">トップへ戻る</Link>
            </Button>
          </div>
        </div>

        {isSnapshotLoading ? (
          <PlayerStatusCard
            tone="neutral"
            title="ローカルの再生用コピーを確認しています"
            description="端末保存データから、プロジェクト・スライド・素材を読み込んでいます。"
          />
        ) : null}

        {hasSnapshotLoadError ? (
          <PlayerStatusCard
            tone="danger"
            title="ローカルの再生用コピーを読み込めませんでした"
            description={
              errorMessage ??
              "ローカルの保存データを読み込めませんでした。再読み込みで直らない場合は、「つくる」で保存状態を確認してください。"
            }
            guidanceItems={loadErrorGuidance}
          >
            <PlayerActionRow>
              <Button type="button" variant="secondary" onClick={reload}>
                もう一度読み込む
              </Button>
              <Button asChild variant="secondary">
                <Link href="/admin">つくるで確認する</Link>
              </Button>
            </PlayerActionRow>
          </PlayerStatusCard>
        ) : null}

        {emptySnapshot ? (
          <PlayerStatusCard
            tone="warning"
            title={
              isOnline === false
                ? "オフライン再生に必要なデータがローカルにありません"
                : "ローカルにはまだ再生用コピーがありません"
            }
            description={
              isOnline === false
                ? "現在オフラインのため、Google Driveからアルバムや写真を取得できません。オンラインに戻してから「ローカルに保存」を実行してください。"
                : "初回利用、またはアルバムのローカル削除後の状態です。「つくる」でローカルへの保存を実行すると、再生できるようになります。"
            }
            guidanceItems={emptySnapshotGuidance}
            diagnostics={snapshot.diagnostics}
          >
            <PlayerActionRow>
              <Button type="button" variant="secondary" onClick={reload}>
                再読み込み
              </Button>
              <Button asChild variant="secondary">
                <Link href="/admin">ローカルに保存する</Link>
              </Button>
            </PlayerActionRow>
          </PlayerStatusCard>
        ) : null}

        {unavailableProjectSnapshot ? (
          <PlayerStatusCard
            tone="warning"
            title="このアルバムはまだローカルに保存されていません"
            description="選択したアルバムの再生用コピーが見つからないため、別の保存済みアルバムは再生していません。「つくる」の「ローカル」から保存してください。"
          >
            <PlayerActionRow>
              <Button asChild variant="secondary">
                <Link href={{ pathname: "/admin", hash: "device" }}>
                  ローカルに保存する
                </Link>
              </Button>
            </PlayerActionRow>
          </PlayerStatusCard>
        ) : null}

        {projectSelectionSnapshot ? (
          <ProjectSelectionCard
            projects={projectSelectionSnapshot.availableProjects}
            selectedProjectId={selectedProjectId}
            diagnostics={projectSelectionSnapshot.diagnostics}
            onSelectProject={handleSelectProject}
            onReload={reload}
          />
        ) : null}

        {invalidSnapshot ? (
          <PlayerStatusCard
            tone="danger"
            title="ローカルの再生用コピーを修復する必要があります"
            description="ローカル内のアルバム・素材・保存状態の対応関係が崩れています。壊れたローカルコピーを削除してから「ローカルに保存」で作り直してください。"
            guidanceItems={invalidSnapshotGuidance}
            diagnostics={snapshot.diagnostics}
          >
            <PlayerActionRow>
              <Button type="button" variant="secondary" onClick={reload}>
                再読み込み
              </Button>
              <Button asChild variant="secondary">
                <Link href="/admin">つくるで修復する</Link>
              </Button>
            </PlayerActionRow>
          </PlayerStatusCard>
        ) : null}

        {noSlides ? (
          <PlayerStatusCard
            tone="warning"
            title="再生できるスライドがありません"
            description="プロジェクトのローカル保存はありますが、本編スライドとして再生できる項目がありません。Drive側のプロジェクト設定や素材追加状態を確認してください。"
            guidanceItems={noSlidesGuidance}
          >
            <PlayerActionRow>
              <Button type="button" variant="secondary" onClick={reload}>
                再読み込み
              </Button>
              <Button asChild variant="secondary">
                <Link href="/admin">つくるへ</Link>
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
    publicationProvenance: OfflinePublicationProvenanceView;
  }>;
  selectedProjectId: string | null;
  diagnostics: string[];
  onSelectProject: (projectId: string) => void;
  onReload: () => void;
}) {
  return (
    <PlayerStatusCard
      tone="neutral"
      title="再生するプロジェクトを選択してください"
      description="ローカルには複数の再生用プロジェクトが保存されています。本番再生に使うプロジェクトを選ぶと、次回から同じプロジェクトを優先して開きます。"
      diagnostics={diagnostics}
    >
      <div className="space-y-3">
        {projects.map((project) => (
          <div
            key={project.projectId}
            className="rounded-xl border border-white/10 bg-black/30 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="font-semibold text-slate-50">
                {project.projectTitle ?? "名称未設定"}
              </p>
              <Button
                type="button"
                variant={
                  selectedProjectId === project.projectId ? "default" : "secondary"
                }
                onClick={() => onSelectProject(project.projectId)}
              >
                {selectedProjectId === project.projectId
                  ? "選択中のプロジェクトを再読み込み"
                  : "このプロジェクトを再生"}
              </Button>
            </div>

            <div
              className={
                project.publicationProvenance.warning
                  ? "mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-amber-100"
                  : project.publicationProvenance.tone === "success"
                    ? "mt-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-emerald-100"
                    : "mt-3 rounded-lg border border-white/15 bg-white/5 p-3 text-slate-200"
              }
              role={
                project.publicationProvenance.warning ? "alert" : "status"
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {project.publicationProvenance.label}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-5">
                {project.publicationProvenance.message}
              </p>
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
                <dt>保存した素材本体</dt>
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

function PlayerVideoSlide({
  video,
  onEnded,
  onPlaybackFailure,
  onPlaybackMessage,
  onRemoteMediaDiagnostics,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  diagnostics,
  diagnosticsVisible,
  canShowDiagnosticsToggle,
  focusDestinationRef,
  onToggleDiagnostics,
}: {
  video: PlayerSlideVideo;
  onEnded: (slideKey: string, sourceUrl: string) => void;
  onPlaybackFailure: (slideKey: string, sourceUrl: string) => void;
  onPlaybackMessage: (
    slideKey: string,
    sourceUrl: string,
    message: string,
    status?: OnlineVideoPlaybackStatus,
  ) => void;
  onRemoteMediaDiagnostics: (
    slideKey: string,
    sourceUrl: string,
    update: RemoteVideoMediaDiagnosticsUpdate,
  ) => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  diagnostics: string[];
  diagnosticsVisible: boolean;
  canShowDiagnosticsToggle: boolean;
  focusDestinationRef: RefObject<HTMLElement | null>;
  onToggleDiagnostics: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const didReportFailureRef = useRef(false);
  const userPausedRef = useRef(false);
  const videoSeekingRef = useRef(false);
  const videoBufferingRef = useRef(false);
  const didAdvanceByDurationOverrideRef = useRef(false);
  const [videoControlsVisible, setVideoControlsVisible] = useState(true);
  const [videoPausedByUser, setVideoPausedByUser] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoVolume, setVideoVolume] = useState(1);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoSeeking, setVideoSeeking] = useState(false);
  const [videoSeekPreviewTime, setVideoSeekPreviewTime] = useState<
    number | null
  >(null);
  const [videoPointerActive, setVideoPointerActive] = useState(false);
  const [videoBuffering, setVideoBuffering] = useState(false);
  const [videoHasError, setVideoHasError] = useState(false);
  const [videoControlMessage, setVideoControlMessage] = useState<string | null>(
    null,
  );
  const slideKey = getPlayerSlidePlaybackKey(video);
  const hasKnownDuration = videoDuration !== null;
  const displayedVideoCurrentTime = videoSeekPreviewTime ?? videoCurrentTime;
  const showVideoControls =
    videoControlsVisible ||
    videoPaused ||
    videoPausedByUser ||
    videoSeeking ||
    videoPointerActive ||
    diagnosticsVisible ||
    videoHasError ||
    videoControlMessage !== null;

  const reportPlaybackFailure = useCallback(() => {
    if (didReportFailureRef.current) {
      return;
    }

    didReportFailureRef.current = true;
    onPlaybackFailure(slideKey, video.sourceUrl);
  }, [onPlaybackFailure, slideKey, video.sourceUrl]);

  const revealVideoControls = useCallback(() => {
    setVideoControlsVisible(true);
  }, []);

  useEffect(() => {
    videoSeekingRef.current = videoSeeking;
  }, [videoSeeking]);

  useEffect(() => {
    didAdvanceByDurationOverrideRef.current = false;
  }, [video.durationSeconds, video.sourceUrl]);

  useEffect(() => {
    userPausedRef.current = false;
    didReportFailureRef.current = false;
    videoBufferingRef.current = false;
    didAdvanceByDurationOverrideRef.current = false;
    queueMicrotask(() => {
      setVideoControlsVisible(true);
      setVideoPausedByUser(false);
      setVideoPaused(false);
      setVideoMuted(true);
      setVideoVolume(1);
      setVideoCurrentTime(0);
      setVideoDuration(null);
      setVideoSeeking(false);
      setVideoSeekPreviewTime(null);
      setVideoPointerActive(false);
      setVideoBuffering(false);
      setVideoHasError(false);
      setVideoControlMessage(null);
    });
  }, [video.assetId, video.slideId, video.sourceUrl]);

  useEffect(() => {
    if (
      !videoControlsVisible ||
      videoPaused ||
      videoPausedByUser ||
      videoSeeking ||
      videoPointerActive ||
      diagnosticsVisible ||
      videoHasError ||
      videoControlMessage !== null
    ) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setVideoControlsVisible(false);
    }, PLAYER_VIDEO_CONTROLS_HIDE_DELAY_MS);

    return () => clearTimeout(timeoutId);
  }, [
    diagnosticsVisible,
    videoHasError,
    videoControlMessage,
    videoControlsVisible,
    videoPointerActive,
    videoPaused,
    videoPausedByUser,
    videoSeeking,
  ]);

  const playVideoFromUserAction = useCallback(async () => {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    try {
      userPausedRef.current = false;
      setVideoPausedByUser(false);
      const playResult = videoElement.play();

      if (playResult) {
        await playResult;
      }

      setVideoPaused(false);
      setVideoHasError(false);
      setVideoControlMessage(null);
      revealVideoControls();
    } catch {
      setVideoControlMessage(
        "再生を開始できませんでした。もう一度タップしてください。",
      );
      revealVideoControls();
    }
  }, [revealVideoControls]);

  const handlePlayPauseClick = useCallback(() => {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    revealVideoControls();

    if (videoElement.paused) {
      void playVideoFromUserAction();
      return;
    }

    userPausedRef.current = true;
    setVideoPausedByUser(true);
    videoElement.pause();
    setVideoPaused(true);
  }, [playVideoFromUserAction, revealVideoControls]);

  const handleMuteClick = useCallback(() => {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    revealVideoControls();

    if (videoElement.muted) {
      videoElement.muted = false;
      userPausedRef.current = false;
      setVideoPausedByUser(false);
      setVideoMuted(false);
      setVideoHasError(false);
      void videoElement.play().catch(() => {
        videoElement.muted = true;
        setVideoMuted(true);
        setVideoControlMessage(
          "音声を有効にできませんでした。もう一度タップしてください。",
        );
        revealVideoControls();
      });
      return;
    }

    videoElement.muted = true;
    setVideoMuted(true);
    setVideoControlMessage(null);
  }, [revealVideoControls]);

  const handleVolumeChange = useCallback(
    (nextValue: string) => {
      const videoElement = videoRef.current;
      const nextVolume = clampNumber(Number(nextValue), 0, 1);

      setVideoVolume(nextVolume);
      revealVideoControls();

      if (!videoElement) {
        return;
      }

      try {
        videoElement.volume = nextVolume;
        videoElement.muted = nextVolume === 0;
        setVideoMuted(videoElement.muted);
      } catch {
        // Some iPad/Safari contexts ignore programmatic volume changes.
      }
    },
    [revealVideoControls],
  );

  const handleSeekChange = useCallback(
    (nextValue: string) => {
      if (videoDuration === null) {
        return;
      }

      const nextTime = clampNumber(Number(nextValue), 0, videoDuration);
      setVideoSeeking(true);
      setVideoSeekPreviewTime(nextTime);
      revealVideoControls();
    },
    [revealVideoControls, videoDuration],
  );

  const finishSeeking = useCallback(() => {
    const videoElement = videoRef.current;
    const nextTime = videoSeekPreviewTime;

    if (videoElement && nextTime !== null) {
      try {
        videoElement.currentTime = nextTime;
        setVideoCurrentTime(nextTime);
        setVideoControlMessage(null);
      } catch {
        setVideoControlMessage("この動画ではシークできませんでした。");
      }
    }

    setVideoSeeking(false);
    setVideoSeekPreviewTime(null);
    revealVideoControls();
  }, [revealVideoControls, videoSeekPreviewTime]);

  const handleVideoControlPointerDown = useCallback(() => {
    setVideoPointerActive(true);
    revealVideoControls();
  }, [revealVideoControls]);

  const handleVideoControlPointerRelease = useCallback(() => {
    setVideoPointerActive(false);
    revealVideoControls();
  }, [revealVideoControls]);

  useEffect(() => {
    didReportFailureRef.current = false;

    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    let didStartPlayback = false;
    let metadataLoaded = false;
    let stallTimeout: ReturnType<typeof setTimeout> | null = null;
    let playbackTimeout: ReturnType<typeof setTimeout> | null = null;
    const isRemoteVideo = video.sourceKind === "remote";

    const reportRemoteMediaDiagnostics = (
      eventName?: RemoteVideoMediaEventName,
    ) => {
      if (!isRemoteVideo) {
        return;
      }

      onRemoteMediaDiagnostics(slideKey, video.sourceUrl, {
        eventName,
        canPlayType: getRemoteVideoCanPlayTypeLabel({
          mimeType: video.mimeType,
          canPlayType: (mimeType) => videoElement.canPlayType(mimeType),
        }),
        errorCode: videoElement.error?.code ?? null,
        readyState: videoElement.readyState,
        networkState: videoElement.networkState,
        bufferedAhead: getRemoteVideoBufferedAheadLabel(videoElement),
      });
    };

    const handleDiagnosticEvent = (event: Event) => {
      if (isRemoteVideoMediaEventName(event.type)) {
        reportRemoteMediaDiagnostics(event.type);
      }
    };

    reportRemoteMediaDiagnostics();

    const metadataTimeout = isRemoteVideo
      ? setTimeout(() => {
          if (!metadataLoaded) {
            onPlaybackMessage(
              slideKey,
              video.sourceUrl,
              "online video playback error: timeout",
              "error",
            );
            reportPlaybackFailure();
          }
        }, PLAYER_REMOTE_VIDEO_METADATA_TIMEOUT_MS)
      : null;
    const startTimeout = setTimeout(() => {
      if (!didStartPlayback) {
        if (userPausedRef.current) {
          return;
        }

        if (isRemoteVideo) {
          onPlaybackMessage(
            slideKey,
            video.sourceUrl,
            "online video playback error: timeout",
            "error",
          );
        }
        reportPlaybackFailure();
      }
    }, isRemoteVideo
      ? PLAYER_REMOTE_VIDEO_START_TIMEOUT_MS
      : PLAYER_VIDEO_START_TIMEOUT_MS);

    const clearStallTimeout = () => {
      if (!stallTimeout) {
        return;
      }

      clearTimeout(stallTimeout);
      stallTimeout = null;
    };

    const clearPlaybackTimeout = () => {
      if (!playbackTimeout) {
        return;
      }

      clearTimeout(playbackTimeout);
      playbackTimeout = null;
    };

    const schedulePlaybackTimeout = (timeoutMs: number) => {
      clearPlaybackTimeout();
      playbackTimeout = setTimeout(() => {
        if (userPausedRef.current) {
          return;
        }

        if (isRemoteVideo) {
          onPlaybackMessage(
            slideKey,
            video.sourceUrl,
            "online video playback error: timeout",
            "error",
          );
        }

        reportPlaybackFailure();
      }, timeoutMs);
    };

    const maybeAdvanceByDurationOverride = () => {
      if (didAdvanceByDurationOverrideRef.current) {
        return;
      }

      const overrideSeconds = getVideoDurationOverrideSeconds({
        configuredDurationSeconds: video.durationSeconds,
        actualDurationSeconds: videoElement.duration,
      });

      if (overrideSeconds === null) {
        return;
      }

      if (
        videoSeekingRef.current ||
        userPausedRef.current ||
        videoBufferingRef.current ||
        videoElement.paused ||
        videoElement.readyState < 2 ||
        videoElement.currentTime < overrideSeconds
      ) {
        return;
      }

      didAdvanceByDurationOverrideRef.current = true;
      userPausedRef.current = false;
      setVideoPaused(true);
      setVideoBuffering(false);
      videoBufferingRef.current = false;

      try {
        videoElement.pause();
      } catch {
        // The parent slide advance guard owns the transition.
      }

      onEnded(slideKey, video.sourceUrl);
    };

    const handleLoadedMetadata = () => {
      metadataLoaded = true;
      setVideoDuration(readFiniteVideoDuration(videoElement));

      if (metadataTimeout) {
        clearTimeout(metadataTimeout);
      }

      if (!isRemoteVideo) {
        return;
      }

      const durationSeconds = videoElement.duration;

      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        schedulePlaybackTimeout(durationSeconds * 1000 + 10_000);
      }
    };

    const handlePlaying = () => {
      didStartPlayback = true;
      clearTimeout(startTimeout);
      clearStallTimeout();
      setVideoPaused(false);
      setVideoPausedByUser(false);
      setVideoBuffering(false);
      videoBufferingRef.current = false;
      setVideoHasError(false);
      userPausedRef.current = false;

      if (isRemoteVideo) {
        onPlaybackMessage(
          slideKey,
          video.sourceUrl,
          "online video playback: playing",
          "playing",
        );
      }
    };

    const handleWaitingOrStalled = () => {
      if (!isRemoteVideo) {
        return;
      }

      setVideoBuffering(true);
      videoBufferingRef.current = true;
      clearStallTimeout();
      stallTimeout = setTimeout(() => {
        if (userPausedRef.current) {
          return;
        }

        onPlaybackMessage(
          slideKey,
          video.sourceUrl,
          "online video playback error: timeout",
          "error",
        );
        reportPlaybackFailure();
      }, PLAYER_REMOTE_VIDEO_STALL_TIMEOUT_MS);
    };

    const handleTimeUpdate = () => {
      if (!videoSeekingRef.current) {
        setVideoCurrentTime(videoElement.currentTime);
      }
      reportRemoteMediaDiagnostics();
      maybeAdvanceByDurationOverride();
    };

    const handleDurationChange = () => {
      setVideoDuration(readFiniteVideoDuration(videoElement));
    };

    const handlePlay = () => {
      setVideoPaused(false);
      setVideoHasError(false);
    };

    const handlePause = () => {
      setVideoPaused(true);
      setVideoBuffering(false);
      videoBufferingRef.current = false;
    };

    const handleCanPlay = () => {
      setVideoBuffering(false);
      videoBufferingRef.current = false;
    };

    const handleVolumeChangeEvent = () => {
      setVideoMuted(videoElement.muted);
      setVideoVolume(videoElement.volume);
    };

    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoElement.addEventListener("playing", handlePlaying);
    videoElement.addEventListener("waiting", handleWaitingOrStalled);
    videoElement.addEventListener("stalled", handleWaitingOrStalled);
    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("durationchange", handleDurationChange);
    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", handlePause);
    videoElement.addEventListener("canplay", handleCanPlay);
    videoElement.addEventListener("loadeddata", handleCanPlay);
    videoElement.addEventListener("volumechange", handleVolumeChangeEvent);

    for (const eventName of REMOTE_VIDEO_MEDIA_EVENT_NAMES) {
      videoElement.addEventListener(eventName, handleDiagnosticEvent);
    }

    if (!isRemoteVideo) {
      schedulePlaybackTimeout(getPlayerVideoPlaybackTimeoutMs(video.durationMs));
    }

    const playResult = videoElement.play();

    if (playResult) {
      playResult.catch(() => {
        if (isRemoteVideo) {
          onPlaybackMessage(
            slideKey,
            video.sourceUrl,
            "online video playback error: media error",
            "error",
          );
        }
        reportPlaybackFailure();
      });
    }

    return () => {
      if (metadataTimeout) {
        clearTimeout(metadataTimeout);
      }
      clearTimeout(startTimeout);
      clearPlaybackTimeout();
      clearStallTimeout();
      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.removeEventListener("playing", handlePlaying);
      videoElement.removeEventListener("waiting", handleWaitingOrStalled);
      videoElement.removeEventListener("stalled", handleWaitingOrStalled);
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("durationchange", handleDurationChange);
      videoElement.removeEventListener("play", handlePlay);
      videoElement.removeEventListener("pause", handlePause);
      videoElement.removeEventListener("canplay", handleCanPlay);
      videoElement.removeEventListener("loadeddata", handleCanPlay);
      videoElement.removeEventListener(
        "volumechange",
        handleVolumeChangeEvent,
      );

      for (const eventName of REMOTE_VIDEO_MEDIA_EVENT_NAMES) {
        videoElement.removeEventListener(eventName, handleDiagnosticEvent);
      }
    };
  }, [
    onEnded,
    onPlaybackMessage,
    onRemoteMediaDiagnostics,
    reportPlaybackFailure,
    slideKey,
    video.durationMs,
    video.durationSeconds,
    video.mimeType,
    video.sourceKind,
    video.sourceUrl,
  ]);

  return (
    <div className="absolute inset-0" onPointerDown={revealVideoControls}>
      <video
        ref={videoRef}
        src={video.sourceUrl}
        muted={videoMuted}
        playsInline
        controls={false}
        autoPlay
        preload="auto"
        aria-label={video.assetName}
        onEnded={() => {
          userPausedRef.current = false;
          setVideoPaused(true);
          setVideoBuffering(false);
          onEnded(slideKey, video.sourceUrl);
        }}
        onError={() => {
          setVideoHasError(true);
          setVideoBuffering(false);
          setVideoControlMessage("動画を再生できませんでした。");
          revealVideoControls();
          reportPlaybackFailure();
        }}
        className="absolute inset-0 h-full w-full object-contain"
      />

      <PlayerControlGroup
        data-player-controls="video"
        visible={showVideoControls}
        focusDestinationRef={focusDestinationRef}
        className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pt-16 transition-opacity duration-300 sm:px-6 ${
          showVideoControls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          handleVideoControlPointerDown();
        }}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => {
          event.stopPropagation();
          handleVideoControlPointerRelease();
        }}
        onPointerCancel={(event) => {
          event.stopPropagation();
          handleVideoControlPointerRelease();
        }}
        onPointerLeave={handleVideoControlPointerRelease}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-white/10 bg-black/50 p-3 text-slate-50 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              className="h-12 min-w-20 rounded-full border border-white/15 bg-black/45 px-4 text-slate-50 hover:bg-white/20 disabled:opacity-30"
              aria-label="前のスライドへ"
              title="前のスライドへ"
              disabled={!canGoPrevious}
              onClick={onPrevious}
            >
              <ChevronLeft className="size-7" />
              前へ
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              className="h-12 min-w-24 rounded-full border border-white/15 bg-white/15 px-5 text-slate-50 hover:bg-white/25"
              aria-label={videoPaused ? "動画を再生" : "動画を一時停止"}
              title={videoPaused ? "動画を再生" : "動画を一時停止"}
              onClick={handlePlayPauseClick}
            >
              {videoPaused ? (
                <>
                  <Play className="size-5" />
                  再生
                </>
              ) : (
                <>
                  <Pause className="size-5" />
                  一時停止
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              className="h-12 min-w-20 rounded-full border border-white/15 bg-black/45 px-4 text-slate-50 hover:bg-white/20 disabled:opacity-30"
              aria-label="次のスライドへ"
              title="次のスライドへ"
              disabled={!canGoNext}
              onClick={onNext}
            >
              次へ
              <ChevronRight className="size-7" />
            </Button>
          </div>

          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm tabular-nums text-slate-100">
            <span className="text-right">
              {formatVideoTimestamp(displayedVideoCurrentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={videoDuration ?? 0}
              step="0.1"
              value={hasKnownDuration ? displayedVideoCurrentTime : 0}
              disabled={!hasKnownDuration}
              aria-label="動画の再生位置"
              className="h-9 w-full accent-white disabled:opacity-40"
              onChange={(event) => handleSeekChange(event.target.value)}
              onPointerUp={finishSeeking}
              onTouchEnd={finishSeeking}
              onKeyUp={finishSeeking}
            />
            <span>{formatVideoTimestamp(videoDuration)}</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              className="h-12 min-w-32 rounded-full border border-white/15 bg-black/45 px-4 text-slate-50 hover:bg-white/20"
              aria-label={videoMuted ? "音声ON" : "ミュート"}
              title={videoMuted ? "音声ON" : "ミュート"}
              onClick={handleMuteClick}
            >
              {videoMuted ? (
                <>
                  <VolumeX className="size-5" />
                  音声ON
                </>
              ) : (
                <>
                  <Volume2 className="size-5" />
                  ミュート
                </>
              )}
            </Button>
            <label className="flex h-12 min-w-48 items-center gap-3 rounded-full border border-white/15 bg-black/45 px-4 text-sm text-slate-50">
              <span>音量</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={videoMuted ? 0 : videoVolume}
                aria-label="動画の音量"
                className="h-9 w-28 accent-white"
                onChange={(event) => handleVolumeChange(event.target.value)}
              />
            </label>
            {canShowDiagnosticsToggle && diagnostics.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="icon-lg"
                className="h-12 rounded-full border border-sky-200/25 bg-sky-400/15 px-5 text-sky-50 hover:bg-sky-300/25"
                aria-pressed={diagnosticsVisible}
                onClick={() => {
                  revealVideoControls();
                  onToggleDiagnostics();
                }}
              >
                診断
              </Button>
            ) : null}
          </div>

          {videoBuffering ? (
            <p className="text-center text-sm text-slate-200">読み込み中</p>
          ) : null}

          {videoControlMessage ? (
            <p className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-center text-sm text-amber-50">
              {videoControlMessage}
            </p>
          ) : null}

          {canShowDiagnosticsToggle &&
          diagnosticsVisible &&
          diagnostics.length > 0 ? (
            <PlayerOnlineVideoDiagnostics
              diagnostics={diagnostics}
              floating={false}
            />
          ) : null}
        </div>
      </PlayerControlGroup>
    </div>
  );
}

function PlayerOnlineVideoDiagnostics({
  diagnostics,
  floating = true,
}: {
  diagnostics: string[];
  floating?: boolean;
}) {
  return (
    <div
      className={
        floating
          ? "pointer-events-none absolute bottom-24 left-4 z-20 max-w-sm rounded-xl border border-sky-200/20 bg-black/55 p-3 text-xs leading-5 text-sky-50 shadow-2xl sm:bottom-28"
          : "max-h-36 overflow-auto rounded-lg border border-sky-200/20 bg-black/55 p-3 text-xs leading-5 text-sky-50"
      }
    >
      {diagnostics.map((diagnostic) => (
        <p key={diagnostic}>{diagnostic}</p>
      ))}
    </div>
  );
}

function PlayerVideoFallback({
  badge,
  title,
  description,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  retryStatus,
  canRetry,
  retryGuidance,
  onRetry,
}: {
  badge?: string;
  title: string;
  description: string;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  retryStatus?: PlayerRemoteVideoRetryStatus;
  canRetry?: boolean;
  retryGuidance?: string | null;
  onRetry?: () => void;
}) {
  const canShowNavigation = onPrevious !== undefined && onNext !== undefined;

  return (
    <div className="relative z-10 mx-4 max-w-md rounded-2xl border border-amber-300/30 bg-amber-950/90 p-5 text-center text-amber-50 shadow-2xl">
      {badge ? (
        <Badge variant="outline" className="border-amber-200/40 text-amber-50">
          {badge}
        </Badge>
      ) : null}
      <div role="alert" aria-atomic="true">
        <p className="text-lg font-semibold">{title}</p>
        <p className="mt-3 text-sm leading-6 text-amber-100/80">
          {description}
        </p>
      </div>
      {retryGuidance ? (
        <p
          className="mt-3 text-sm leading-6 text-amber-100"
          role={
            retryStatus === "retrying"
              ? "status"
              : retryStatus === "failed"
                ? "alert"
                : undefined
          }
          aria-live={retryStatus === "retrying" ? "polite" : undefined}
          aria-atomic={retryStatus === "retrying" ? "true" : undefined}
        >
          {retryGuidance}
        </p>
      ) : null}
      {onRetry ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-5 h-12 min-w-36 rounded-full border border-amber-100/20 bg-amber-100 text-amber-950 hover:bg-amber-50"
          disabled={!canRetry || retryStatus === "retrying"}
          onClick={onRetry}
        >
          {retryStatus === "retrying" ? "再接続中…" : "再試行"}
        </Button>
      ) : null}
      {canShowNavigation ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            variant="secondary"
            className="h-12 min-w-36 rounded-full border border-white/15 bg-black/45 px-4 text-amber-50 hover:bg-white/20"
            disabled={!canGoPrevious}
            onClick={onPrevious}
          >
            <ChevronLeft className="size-5" />
            前のスライド
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-12 min-w-36 rounded-full border border-white/15 bg-black/45 px-4 text-amber-50 hover:bg-white/20"
            disabled={!canGoNext}
            onClick={onNext}
          >
            次のスライド
            <ChevronRight className="size-5" />
          </Button>
        </div>
      ) : null}
    </div>
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

function buildOnlineVideoDiagnostics(input: {
  status: OnlineVideoPlaybackStatus;
  message: string;
  remoteVideoSlideCount: number;
  currentSlide: OfflinePlaybackSlide | null;
  googleStatus: string;
  isOnline: boolean | null;
  streamDiagnostics: RemoteVideoStreamDiagnostics | null;
  probeDiagnostics: RemoteVideoProbeDiagnostics | null;
  mediaDiagnostics: RemoteVideoMediaDiagnostics | null;
}) {
  const diagnostics = [
    "online video playback: enabled",
    `remote video slides: ${input.remoteVideoSlideCount}`,
    `service worker: ${getServiceWorkerDiagnosticsLabel()}`,
    input.message,
  ];

  if (input.currentSlide?.offlineAvailability === "remoteOnly") {
    diagnostics.splice(
      2,
      0,
      `current remote video: ${input.currentSlide.mimeType} / ${formatBytesForDiagnostics(input.currentSlide.sourceSizeBytes)}`,
    );
  }

  if (input.isOnline === false) {
    diagnostics.push("online video playback skipped: offline");
  }

  if (input.googleStatus !== "connected") {
    diagnostics.push("online video playback skipped: access token missing");
  }

  if (input.status === "registered") {
    diagnostics.push("stream session: registered");
  }

  if (input.streamDiagnostics) {
    diagnostics.push(
      ...formatRemoteVideoStreamDiagnostics(
        "stream response",
        input.streamDiagnostics,
      ),
      `stream request: range ${input.streamDiagnostics.rangeRequest}`,
    );
  }

  if (input.probeDiagnostics) {
    diagnostics.push(
      ...formatRemoteVideoStreamDiagnostics(
        "stream probe",
        input.probeDiagnostics,
      ),
    );
  }

  if (input.mediaDiagnostics) {
    diagnostics.push(
      `media canPlayType ${input.currentSlide?.mimeType ?? "video"}: ${input.mediaDiagnostics.canPlayType}`,
      `media error: ${input.mediaDiagnostics.errorLabel ?? "none"}`,
      `media readyState: ${input.mediaDiagnostics.readyState}`,
      `media networkState: ${input.mediaDiagnostics.networkState}`,
      `buffered ahead: ${input.mediaDiagnostics.bufferedAhead}`,
      `stall count: waiting ${input.mediaDiagnostics.waitingCount} / stalled ${input.mediaDiagnostics.stalledCount}`,
      `stall recovered: ${input.mediaDiagnostics.recoveryCount}`,
      `stall state: ${input.mediaDiagnostics.stallState}`,
    );

    if (input.mediaDiagnostics.events.length > 0) {
      diagnostics.push(
        `media events: ${input.mediaDiagnostics.events.join(" -> ")}`,
      );
    }
  }

  return [...new Set(diagnostics)];
}

function formatRemoteVideoStreamDiagnostics(
  label: "stream response" | "stream probe",
  diagnostics: RemoteVideoStreamDiagnostics,
) {
  return [
    `${label} status: ${diagnostics.status}`,
    `${label} content-type: ${diagnostics.contentType}`,
    `${label} content-range: ${diagnostics.contentRange}`,
    `${label} accept-ranges: ${diagnostics.acceptRanges}`,
    `${label} content-length: ${formatPresentAbsent(diagnostics.hasContentLength)}`,
    `${label} range window: ${diagnostics.rangeWindow}`,
    `${label} range kind: ${diagnostics.rangeKind}`,
    `${label} content-length match: ${diagnostics.contentLengthMatch}`,
    `${label} upstream range status: ${diagnostics.upstreamRangeStatus}`,
    ...(diagnostics.upstreamError
      ? [`${label} upstream error: ${diagnostics.upstreamError}`]
      : []),
    ...(label === "stream probe"
      ? [`stream probe range request: ${diagnostics.rangeRequest}`]
      : []),
  ];
}

function formatPresentAbsent(value: boolean) {
  return value ? "present" : "absent";
}

function normalizeRemoteVideoStreamDiagnostics(
  value: unknown,
): RemoteVideoStreamDiagnostics | null {
  if (!isRecord(value) || typeof value.status !== "number") {
    return null;
  }

  return {
    status: value.status,
    rangeRequest: value.rangeRequest === true ? "present" : "absent",
    contentType: normalizeRemoteVideoContentTypeLabel(value.contentType),
    contentRange: normalizeRemoteVideoHeaderSourceLabel(
      value.contentRange,
      value.hasContentRange,
    ),
    acceptRanges: normalizeRemoteVideoHeaderSourceLabel(
      value.acceptRanges,
      value.hasAcceptRanges,
    ),
    rangeWindow: normalizeRemoteVideoRangeWindowLabel(value.rangeWindow),
    rangeKind: normalizeRemoteVideoRangeKindLabel(value.rangeKind),
    contentLengthMatch: normalizeRemoteVideoContentLengthMatchLabel(
      value.contentLengthMatch,
    ),
    upstreamRangeStatus: normalizeRemoteVideoUpstreamRangeStatusLabel(
      value.upstreamRangeStatus,
    ),
    hasContentLength: value.hasContentLength === true,
    ...(value.upstreamError === "fetchFailed"
      ? { upstreamError: "fetchFailed" }
      : {}),
  };
}

function normalizeRemoteVideoHeaderSourceLabel(
  value: unknown,
  fallbackPresent: unknown,
): RemoteVideoHeaderSourceLabel {
  if (value === "present" || value === "synthesized") {
    return value;
  }

  return fallbackPresent === true ? "present" : "absent";
}

function normalizeRemoteVideoRangeWindowLabel(
  value: unknown,
): RemoteVideoRangeWindowLabel {
  return value === "capped" || value === "full" ? value : "none";
}

function normalizeRemoteVideoRangeKindLabel(
  value: unknown,
): RemoteVideoRangeKindLabel {
  if (
    value === "start-end" ||
    value === "start-open" ||
    value === "suffix" ||
    value === "invalid" ||
    value === "multi-range" ||
    value === "unsatisfiable"
  ) {
    return value;
  }

  return "missing";
}

function normalizeRemoteVideoContentLengthMatchLabel(
  value: unknown,
): RemoteVideoContentLengthMatchLabel {
  return value === "yes" || value === "no" ? value : "unknown";
}

function normalizeRemoteVideoUpstreamRangeStatusLabel(
  value: unknown,
): RemoteVideoUpstreamRangeStatusLabel {
  if (
    value === "honored" ||
    value === "ignored" ||
    value === "not-requested"
  ) {
    return value;
  }

  return "unknown";
}

async function probeRemoteVideoStream(
  sourceUrl: string,
  signal: AbortSignal,
): Promise<RemoteVideoProbeDiagnostics> {
  let response: Response;

  try {
    response = await fetch(sourceUrl, {
      method: "GET",
      headers: {
        Range: "bytes=0-1023",
      },
      cache: "no-store",
      signal,
    });
  } catch {
    return {
      status: 0,
      rangeRequest: "present",
      contentType: "missing",
      contentRange: "absent",
      acceptRanges: "absent",
      rangeWindow: "none",
      rangeKind: "missing",
      contentLengthMatch: "unknown",
      upstreamRangeStatus: "unknown",
      hasContentLength: false,
      upstreamError: "fetchFailed",
    };
  }

  if (response.body) {
    void response.body.cancel().catch(() => {
      // Probe body is intentionally discarded; cancellation is best-effort.
    });
  }

  return {
    status: response.status,
    rangeRequest: "present",
    contentType: normalizeRemoteVideoResponseContentType(
      response.headers.get("Content-Type"),
    ),
    contentRange: normalizeRemoteVideoHeaderSourceLabel(
      response.headers.get("X-Drive-Video-Content-Range-Source"),
      response.headers.has("Content-Range"),
    ),
    acceptRanges: normalizeRemoteVideoHeaderSourceLabel(
      response.headers.get("X-Drive-Video-Accept-Ranges-Source"),
      response.headers.has("Accept-Ranges"),
    ),
    rangeWindow: normalizeRemoteVideoRangeWindowLabel(
      response.headers.get("X-Drive-Video-Range-Window"),
    ),
    rangeKind: normalizeRemoteVideoRangeKindLabel(
      response.headers.get("X-Drive-Video-Range-Kind"),
    ),
    contentLengthMatch: normalizeRemoteVideoContentLengthMatchLabel(
      response.headers.get("X-Drive-Video-Content-Length-Match"),
    ),
    upstreamRangeStatus: normalizeRemoteVideoUpstreamRangeStatusLabel(
      response.headers.get("X-Drive-Video-Upstream-Range-Status"),
    ),
    hasContentLength: response.headers.has("Content-Length"),
  };
}

function getMediaErrorLabel(errorCode: number | null): string | null {
  switch (errorCode) {
    case 1:
      return "MEDIA_ERR_ABORTED";
    case 2:
      return "MEDIA_ERR_NETWORK";
    case 3:
      return "MEDIA_ERR_DECODE";
    case 4:
      return "MEDIA_ERR_SRC_NOT_SUPPORTED";
    default:
      return null;
  }
}

function getRemoteVideoBufferedAheadLabel(
  videoElement: HTMLVideoElement,
): RemoteVideoBufferedAheadLabel {
  try {
    const { buffered, currentTime } = videoElement;

    for (let index = 0; index < buffered.length; index += 1) {
      const start = buffered.start(index);
      const end = buffered.end(index);

      if (currentTime >= start && currentTime <= end) {
        return formatBufferedAheadLabel(end - currentTime);
      }
    }

    return buffered.length > 0 ? "none" : "unknown";
  } catch {
    return "unknown";
  }
}

function formatBufferedAheadLabel(value: number): RemoteVideoBufferedAheadLabel {
  if (!Number.isFinite(value) || value <= 0) {
    return "none";
  }

  if (value <= 2) {
    return "0-2s";
  }

  if (value <= 5) {
    return "2-5s";
  }

  if (value <= 15) {
    return "5-15s";
  }

  return "15s+";
}

function getRemoteVideoStallState(
  eventName: RemoteVideoMediaEventName | undefined,
  errorCode: number | null,
): RemoteVideoStallStateLabel {
  if (errorCode !== null || eventName === "error") {
    return "error";
  }

  if (eventName === "waiting" || eventName === "stalled") {
    return "buffering";
  }

  if (eventName === "canplay") {
    return "recovered";
  }

  if (eventName === "playing") {
    return "playing";
  }

  return "unknown";
}

function isRemoteVideoMediaEventName(
  value: string,
): value is RemoteVideoMediaEventName {
  return REMOTE_VIDEO_MEDIA_EVENT_NAMES.includes(
    value as RemoteVideoMediaEventName,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getServiceWorkerDiagnosticsLabel() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return "unavailable";
  }

  return navigator.serviceWorker.controller ? "ready" : "not ready";
}

function formatBytesForDiagnostics(value: number | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? `${value} bytes`
    : "size unknown";
}

function readFiniteVideoDuration(videoElement: HTMLVideoElement) {
  return Number.isFinite(videoElement.duration) && videoElement.duration > 0
    ? videoElement.duration
    : null;
}

function formatVideoTimestamp(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return "--:--";
  }

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function getVideoDurationOverrideSeconds(input: {
  configuredDurationSeconds?: number;
  actualDurationSeconds: number;
}) {
  const configuredDurationSeconds = input.configuredDurationSeconds;

  if (
    typeof configuredDurationSeconds !== "number" ||
    !Number.isFinite(configuredDurationSeconds)
  ) {
    return null;
  }

  if (
    !Number.isFinite(input.actualDurationSeconds) ||
    input.actualDurationSeconds <= 0
  ) {
    return null;
  }

  const configured = Math.floor(configuredDurationSeconds);

  if (configured < 1 || configured >= input.actualDurationSeconds) {
    return null;
  }

  return configured;
}

function createPlayerVideoSessionId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const randomValues = new Uint32Array(4);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => value.toString(16)).join("");
}

function buildPlayerVideoStreamSourceUrl(sessionId: string) {
  return `/__drive-video-stream/${encodeURIComponent(sessionId)}`;
}

function getOnlineVideoRegistrationFailureMessage(reason: string) {
  switch (reason) {
    case "accessTokenMissing":
      return "online video playback skipped: access token missing";
    case "serviceWorkerUnavailable":
    case "serviceWorkerNotReady":
      return "online video playback skipped: service worker not ready";
    default:
      return "online video playback error: stream session registration failed";
  }
}

function getPlayerSlidePlaybackKey(slide: { slideId: string; assetId: string }) {
  return `${slide.slideId}:${slide.assetId}`;
}

function getPlayerVideoPlaybackTimeoutMs(durationMs: number | undefined) {
  if (
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0
  ) {
    return Math.min(
      Math.max(durationMs + PLAYER_VIDEO_FALLBACK_DISPLAY_MS, 5_000),
      PLAYER_VIDEO_MAX_FALLBACK_MS,
    );
  }

  return Math.min(
    DEFAULT_SLIDE_DURATION_SECONDS * 1000 + PLAYER_VIDEO_FALLBACK_DISPLAY_MS,
    PLAYER_VIDEO_MAX_FALLBACK_MS,
  );
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

function revokeSlideVideo(video: PlayerSlideVideo | null) {
  if (!video?.objectUrl) {
    return;
  }

  URL.revokeObjectURL(video.objectUrl);
}

function clearPlayerTimeout(
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
