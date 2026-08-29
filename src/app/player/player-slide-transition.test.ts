import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_SLIDE_TRANSITION_ANIMATED_EFFECTS,
  PROJECT_SLIDE_TRANSITION_BLUR,
  PROJECT_SLIDE_TRANSITION_SLIDE_DISTANCE,
  PROJECT_SLIDE_TRANSITION_WIPE_FEATHER,
  PROJECT_SLIDE_TRANSITION_ZOOM_FROM,
} from "@/lib/project-slide-transition";
import {
  getLegacySlideTransitionClassName,
  getPlayerSlideTransitionPlan,
  playerSlideTransitionIgnoresNavigationDirection,
} from "./player-slide-transition";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const IMAGE_NEXT = {
  involvesVideo: false,
  hasCurrentImage: true,
  direction: "next" as const,
};

describe("player slide transition plan", () => {
  it("keeps the legacy 320ms image-to-image animation when transition is undefined", () => {
    const plan = getPlayerSlideTransitionPlan({
      transition: undefined,
      ...IMAGE_NEXT,
    });

    expect(plan.durationMs).toBe(320);
    expect(plan.keepPreviousImage).toBe(true);
    expect(plan.incomingClassName).toContain("playerSlideInNext_320ms");
    expect(plan.outgoingClassName).toContain("playerPreviousFadeOut_320ms");
    expect(getLegacySlideTransitionClassName("previous")).toContain(
      "playerSlideInPrevious_320ms",
    );
  });

  it("does not animate video-involved switches in the legacy undefined state", () => {
    const plan = getPlayerSlideTransitionPlan({
      transition: undefined,
      involvesVideo: true,
      hasCurrentImage: true,
      direction: "next",
    });

    expect(plan.durationMs).toBe(0);
    expect(plan.keepPreviousImage).toBe(false);
    expect(plan.incomingClassName).toBe("");
  });

  it("switches instantly for none without a previous image layer", () => {
    const plan = getPlayerSlideTransitionPlan({
      transition: "none",
      ...IMAGE_NEXT,
    });

    expect(plan.durationMs).toBe(0);
    expect(plan.keepPreviousImage).toBe(false);
    expect(plan.incomingClassName).toBe("");
    expect(plan.outgoingClassName).toBe("");
  });

  it.each(["fade", "slideLeft", "slideRight", "slideUp", "zoom", "blur"] as const)(
    "uses a 500ms dual-layer %s animation for photo-to-photo",
    (transition) => {
      const plan = getPlayerSlideTransitionPlan({
        transition,
        ...IMAGE_NEXT,
      });

      expect(plan.durationMs).toBe(500);
      expect(plan.keepPreviousImage).toBe(true);
      expect(plan.incomingClassName).toContain("_500ms_");
      expect(plan.outgoingClassName).toContain("_500ms_");
      expect(plan.incomingClassName).toContain(
        "motion-reduce:animate-[playerTransitionReduced_60ms",
      );
    },
  );

  it("keeps the previous image stationary for wipe photo-to-photo without translating media", () => {
    const plan = getPlayerSlideTransitionPlan({
      transition: "wipe",
      ...IMAGE_NEXT,
    });

    expect(plan.durationMs).toBe(500);
    expect(plan.keepPreviousImage).toBe(true);
    expect(plan.incomingClassName).toContain("player-transition-wipe-in");
    expect(plan.incomingClassName).not.toContain("translate");
    expect(plan.outgoingClassName).toBe("");
  });

  it.each(PROJECT_SLIDE_TRANSITION_ANIMATED_EFFECTS)(
    "uses incoming-only %s animation for video-involved switches",
    (transition) => {
      const plan = getPlayerSlideTransitionPlan({
        transition,
        involvesVideo: true,
        hasCurrentImage: true,
        direction: "next",
      });

      expect(plan.durationMs).toBe(500);
      expect(plan.keepPreviousImage).toBe(false);
      expect(plan.outgoingClassName).toBe("");
      expect(plan.incomingClassName.length).toBeGreaterThan(0);
    },
  );

  it("maps each strength onto fixed CSS custom properties", () => {
    for (const strength of ["subtle", "standard", "strong"] as const) {
      const plan = getPlayerSlideTransitionPlan({
        transition: "slideLeft",
        transitionStrength: strength,
        ...IMAGE_NEXT,
      });
      expect(plan.incomingStyle["--player-transition-distance"]).toBe(
        PROJECT_SLIDE_TRANSITION_SLIDE_DISTANCE[strength],
      );
      expect(plan.incomingStyle["--player-transition-scale"]).toBe(
        PROJECT_SLIDE_TRANSITION_ZOOM_FROM[strength],
      );
      expect(plan.incomingStyle["--player-transition-blur"]).toBe(
        PROJECT_SLIDE_TRANSITION_BLUR[strength],
      );
      expect(plan.incomingStyle["--player-transition-wipe-feather"]).toBe(
        PROJECT_SLIDE_TRANSITION_WIPE_FEATHER[strength],
      );
    }
  });

  it("treats absent strength as standard for first-phase explicit effects", () => {
    const absent = getPlayerSlideTransitionPlan({
      transition: "zoom",
      ...IMAGE_NEXT,
    });
    const standard = getPlayerSlideTransitionPlan({
      transition: "zoom",
      transitionStrength: "standard",
      ...IMAGE_NEXT,
    });
    expect(absent.incomingStyle["--player-transition-scale"]).toBe("1.10");
    expect(absent.incomingStyle["--player-transition-scale"]).toBe(
      standard.incomingStyle["--player-transition-scale"],
    );
  });

  it("keeps slide directions fixed regardless of next or previous", () => {
    for (const transition of ["slideLeft", "slideRight", "slideUp"] as const) {
      const next = getPlayerSlideTransitionPlan({
        transition,
        involvesVideo: false,
        hasCurrentImage: true,
        direction: "next",
      });
      const previous = getPlayerSlideTransitionPlan({
        transition,
        involvesVideo: false,
        hasCurrentImage: true,
        direction: "previous",
      });
      expect(next.incomingClassName).toBe(previous.incomingClassName);
      expect(next.outgoingClassName).toBe(previous.outgoingClassName);
      expect(playerSlideTransitionIgnoresNavigationDirection(transition)).toBe(
        true,
      );
    }

    expect(
      getPlayerSlideTransitionPlan({
        transition: "slideLeft",
        ...IMAGE_NEXT,
      }).incomingClassName,
    ).toContain("SlideLeftIn");
    expect(
      getPlayerSlideTransitionPlan({
        transition: "slideRight",
        ...IMAGE_NEXT,
      }).incomingClassName,
    ).toContain("SlideRightIn");
    expect(
      getPlayerSlideTransitionPlan({
        transition: "slideUp",
        ...IMAGE_NEXT,
      }).incomingClassName,
    ).toContain("SlideUpIn");
  });

  it("falls back to a short fade without translate, scale, blur, wipe, or strength when reduced motion is preferred", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });

    for (const transition of PROJECT_SLIDE_TRANSITION_ANIMATED_EFFECTS) {
      const plan = getPlayerSlideTransitionPlan({
        transition,
        transitionStrength: "strong",
        ...IMAGE_NEXT,
      });

      expect(plan.durationMs).toBe(60);
      expect(plan.incomingClassName).toContain("playerTransitionReduced_60ms");
      expect(plan.outgoingClassName).toContain("playerTransitionFadeOut_60ms");
      expect(plan.incomingClassName).not.toContain("translate");
      expect(plan.incomingClassName).not.toContain("Zoom");
      expect(plan.incomingClassName).not.toContain("Blur");
      expect(plan.incomingClassName).not.toContain("wipe");
      expect(plan.incomingStyle).toEqual({});
    }
  });
});
