import type { CSSProperties } from "react";
import {
  LEGACY_SLIDE_TRANSITION_DURATION_MS,
  PROJECT_SLIDE_TRANSITION_BLUR,
  PROJECT_SLIDE_TRANSITION_DURATION_MS,
  PROJECT_SLIDE_TRANSITION_FADE_EASING,
  PROJECT_SLIDE_TRANSITION_FADE_FROM,
  PROJECT_SLIDE_TRANSITION_SLIDE_DISTANCE,
  PROJECT_SLIDE_TRANSITION_WIPE_FEATHER,
  PROJECT_SLIDE_TRANSITION_ZOOM_FROM,
  REDUCED_MOTION_SLIDE_TRANSITION_DURATION_MS,
  getEffectiveProjectSlideTransitionStrength,
  projectSlideTransitionUsesStrength,
  type ProjectSlideTransition,
  type ProjectSlideTransitionStrength,
} from "@/lib/project-slide-transition";

export type PlayerSlideTransitionDirection = "next" | "previous" | "none";

export type PlayerSlideTransitionStyle = CSSProperties & {
  "--player-transition-distance"?: string;
  "--player-transition-scale"?: string;
  "--player-transition-blur"?: string;
  "--player-transition-wipe-feather"?: string;
  "--player-transition-fade-from"?: string;
  "--player-transition-easing"?: string;
};

export type PlayerSlideTransitionPlan = {
  durationMs: number;
  keepPreviousImage: boolean;
  incomingClassName: string;
  outgoingClassName: string;
  incomingStyle: PlayerSlideTransitionStyle;
  outgoingStyle: PlayerSlideTransitionStyle;
};

const EMPTY_STYLE: PlayerSlideTransitionStyle = {};

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

const REDUCED_INCOMING_CLASS_NAME =
  "animate-[playerTransitionReduced_60ms_ease-out_forwards]";
const REDUCED_OUTGOING_CLASS_NAME =
  "animate-[playerTransitionFadeOut_60ms_ease-out_forwards]";

const EXPLICIT_INCOMING_CLASS_NAME: Record<
  Exclude<ProjectSlideTransition, "none">,
  string
> = {
  fade: "animate-[playerTransitionFadeIn_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionReduced_60ms_ease-out_forwards]",
  slideLeft:
    "animate-[playerTransitionSlideLeftIn_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionReduced_60ms_ease-out_forwards]",
  slideRight:
    "animate-[playerTransitionSlideRightIn_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionReduced_60ms_ease-out_forwards]",
  slideUp:
    "animate-[playerTransitionSlideUpIn_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionReduced_60ms_ease-out_forwards]",
  wipe: "player-transition-wipe-in",
  zoom: "animate-[playerTransitionZoomIn_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionReduced_60ms_ease-out_forwards]",
  blur: "animate-[playerTransitionBlurIn_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionReduced_60ms_ease-out_forwards]",
};

const EXPLICIT_OUTGOING_CLASS_NAME: Record<
  Exclude<ProjectSlideTransition, "none">,
  string
> = {
  fade: "animate-[playerTransitionFadeOut_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionFadeOut_60ms_ease-out_forwards]",
  slideLeft:
    "animate-[playerTransitionSlideLeftOut_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionFadeOut_60ms_ease-out_forwards]",
  slideRight:
    "animate-[playerTransitionSlideRightOut_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionFadeOut_60ms_ease-out_forwards]",
  slideUp:
    "animate-[playerTransitionSlideUpOut_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionFadeOut_60ms_ease-out_forwards]",
  wipe: "",
  zoom: "animate-[playerTransitionFadeOut_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionFadeOut_60ms_ease-out_forwards]",
  blur: "animate-[playerTransitionFadeOut_500ms_ease-out_forwards] motion-reduce:animate-[playerTransitionFadeOut_60ms_ease-out_forwards]",
};

function emptyPlan(durationMs = 0): PlayerSlideTransitionPlan {
  return {
    durationMs,
    keepPreviousImage: false,
    incomingClassName: "",
    outgoingClassName: "",
    incomingStyle: EMPTY_STYLE,
    outgoingStyle: EMPTY_STYLE,
  };
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function getPlayerSlideTransitionStrengthVars(
  strength: ProjectSlideTransitionStrength,
): PlayerSlideTransitionStyle {
  return {
    "--player-transition-distance":
      PROJECT_SLIDE_TRANSITION_SLIDE_DISTANCE[strength],
    "--player-transition-scale": PROJECT_SLIDE_TRANSITION_ZOOM_FROM[strength],
    "--player-transition-blur": PROJECT_SLIDE_TRANSITION_BLUR[strength],
    "--player-transition-wipe-feather":
      PROJECT_SLIDE_TRANSITION_WIPE_FEATHER[strength],
    "--player-transition-fade-from": PROJECT_SLIDE_TRANSITION_FADE_FROM[strength],
    "--player-transition-easing": PROJECT_SLIDE_TRANSITION_FADE_EASING[strength],
  };
}

export function getPlayerSlideTransitionPlan(input: {
  transition: ProjectSlideTransition | undefined;
  transitionStrength?: ProjectSlideTransitionStrength;
  involvesVideo: boolean;
  hasCurrentImage: boolean;
  direction: PlayerSlideTransitionDirection;
}): PlayerSlideTransitionPlan {
  if (input.transition === "none") {
    return emptyPlan();
  }

  if (input.transition === undefined) {
    if (input.involvesVideo || !input.hasCurrentImage) {
      return emptyPlan();
    }

    return {
      durationMs: LEGACY_SLIDE_TRANSITION_DURATION_MS,
      keepPreviousImage: true,
      incomingClassName: LEGACY_INCOMING_BY_DIRECTION[input.direction],
      outgoingClassName: LEGACY_OUTGOING_CLASS_NAME,
      incomingStyle: EMPTY_STYLE,
      outgoingStyle: EMPTY_STYLE,
    };
  }

  const shouldAnimateIncoming = input.involvesVideo || input.hasCurrentImage;
  if (!shouldAnimateIncoming) {
    return emptyPlan();
  }

  const keepPreviousImage = !input.involvesVideo && input.hasCurrentImage;

  if (prefersReducedMotion()) {
    return {
      durationMs: REDUCED_MOTION_SLIDE_TRANSITION_DURATION_MS,
      keepPreviousImage,
      incomingClassName: REDUCED_INCOMING_CLASS_NAME,
      outgoingClassName: keepPreviousImage ? REDUCED_OUTGOING_CLASS_NAME : "",
      incomingStyle: EMPTY_STYLE,
      outgoingStyle: EMPTY_STYLE,
    };
  }

  const strength =
    getEffectiveProjectSlideTransitionStrength({
      transition: input.transition,
      transitionStrength: input.transitionStrength,
    }) ?? "standard";
  const strengthStyle: PlayerSlideTransitionStyle = {
    ...getPlayerSlideTransitionStrengthVars(strength),
    ...(input.transition === "fade"
      ? {
          animationTimingFunction: PROJECT_SLIDE_TRANSITION_FADE_EASING[strength],
        }
      : {}),
  };

  return {
    durationMs: PROJECT_SLIDE_TRANSITION_DURATION_MS,
    keepPreviousImage,
    incomingClassName: EXPLICIT_INCOMING_CLASS_NAME[input.transition],
    outgoingClassName: keepPreviousImage
      ? EXPLICIT_OUTGOING_CLASS_NAME[input.transition]
      : "",
    incomingStyle: strengthStyle,
    outgoingStyle: keepPreviousImage ? strengthStyle : EMPTY_STYLE,
  };
}

export function getLegacySlideTransitionClassName(
  direction: PlayerSlideTransitionDirection,
) {
  return LEGACY_INCOMING_BY_DIRECTION[direction];
}

export function playerSlideTransitionIgnoresNavigationDirection(
  transition: ProjectSlideTransition | undefined,
) {
  return projectSlideTransitionUsesStrength(transition);
}
