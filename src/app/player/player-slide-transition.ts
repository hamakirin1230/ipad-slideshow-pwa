import {
  LEGACY_SLIDE_TRANSITION_DURATION_MS,
  PROJECT_SLIDE_TRANSITION_DURATION_MS,
  REDUCED_MOTION_SLIDE_TRANSITION_DURATION_MS,
  type ProjectSlideTransition,
} from "@/lib/project-slide-transition";

export type PlayerSlideTransitionDirection = "next" | "previous" | "none";

export type PlayerSlideTransitionPlan = {
  durationMs: number;
  keepPreviousImage: boolean;
  incomingClassName: string;
  outgoingClassName: string;
};

const LEGACY_INCOMING_BY_DIRECTION: Record<
  PlayerSlideTransitionDirection,
  string
> = {
  next: "animate-[playerSlideInNext_320ms_ease-out_forwards] motion-reduce:animate-[playerSlideInReduced_60ms_ease-out_forwards]",
  previous:
    "animate-[playerSlideInPrevious_320ms_ease-out_forwards] motion-reduce:animate-[playerSlideInReduced_60ms_ease-out_forwards]",
  none: "animate-[playerSlideInReduced_60ms_ease-out_forwards]",
};

const LEGACY_OUTGOING_CLASS_NAME =
  "animate-[playerPreviousFadeOut_320ms_ease-out_forwards] motion-reduce:animate-[playerPreviousFadeOut_60ms_ease-out_forwards]";

const EXPLICIT_INCOMING_CLASS_NAME: Record<
  Exclude<ProjectSlideTransition, "none">,
  string
> = {
  fade: "animate-[playerTransitionFadeIn_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionReduced_60ms_ease-out_forwards]",
  slideLeft:
    "animate-[playerTransitionSlideLeftIn_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionReduced_60ms_ease-out_forwards]",
  zoom: "animate-[playerTransitionZoomIn_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionReduced_60ms_ease-out_forwards]",
};

const EXPLICIT_OUTGOING_CLASS_NAME: Record<
  Exclude<ProjectSlideTransition, "none">,
  string
> = {
  fade: "animate-[playerTransitionFadeOut_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionFadeOut_60ms_ease-out_forwards]",
  slideLeft:
    "animate-[playerTransitionSlideLeftOut_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionFadeOut_60ms_ease-out_forwards]",
  zoom: "animate-[playerTransitionFadeOut_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionFadeOut_60ms_ease-out_forwards]",
};

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function getPlayerSlideTransitionPlan(input: {
  transition: ProjectSlideTransition | undefined;
  involvesVideo: boolean;
  hasCurrentImage: boolean;
  direction: PlayerSlideTransitionDirection;
}): PlayerSlideTransitionPlan {
  if (input.transition === "none") {
    return {
      durationMs: 0,
      keepPreviousImage: false,
      incomingClassName: "",
      outgoingClassName: "",
    };
  }

  if (input.transition === undefined) {
    if (input.involvesVideo || !input.hasCurrentImage) {
      return {
        durationMs: 0,
        keepPreviousImage: false,
        incomingClassName: "",
        outgoingClassName: "",
      };
    }

    return {
      durationMs: LEGACY_SLIDE_TRANSITION_DURATION_MS,
      keepPreviousImage: true,
      incomingClassName: LEGACY_INCOMING_BY_DIRECTION[input.direction],
      outgoingClassName: LEGACY_OUTGOING_CLASS_NAME,
    };
  }

  const shouldAnimateIncoming = input.involvesVideo || input.hasCurrentImage;
  const durationMs = !shouldAnimateIncoming
    ? 0
    : prefersReducedMotion()
      ? REDUCED_MOTION_SLIDE_TRANSITION_DURATION_MS
      : PROJECT_SLIDE_TRANSITION_DURATION_MS;

  return {
    durationMs,
    keepPreviousImage: !input.involvesVideo && input.hasCurrentImage,
    incomingClassName: shouldAnimateIncoming
      ? EXPLICIT_INCOMING_CLASS_NAME[input.transition]
      : "",
    outgoingClassName:
      !input.involvesVideo && input.hasCurrentImage
        ? EXPLICIT_OUTGOING_CLASS_NAME[input.transition]
        : "",
  };
}

export function getLegacySlideTransitionClassName(
  direction: PlayerSlideTransitionDirection,
) {
  return LEGACY_INCOMING_BY_DIRECTION[direction];
}
