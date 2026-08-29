import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLegacySlideTransitionClassName,
  getPlayerSlideTransitionPlan,
} from "./player-slide-transition";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("player slide transition plan", () => {
  it("keeps the legacy 320ms image-to-image animation when transition is undefined", () => {
    const plan = getPlayerSlideTransitionPlan({
      transition: undefined,
      involvesVideo: false,
      hasCurrentImage: true,
      direction: "next",
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
      involvesVideo: false,
      hasCurrentImage: true,
      direction: "next",
    });

    expect(plan.durationMs).toBe(0);
    expect(plan.keepPreviousImage).toBe(false);
    expect(plan.incomingClassName).toBe("");
    expect(plan.outgoingClassName).toBe("");
  });

  it.each(["fade", "slideLeft", "zoom"] as const)(
    "uses a 500ms dual-layer %s animation for photo-to-photo",
    (transition) => {
      const plan = getPlayerSlideTransitionPlan({
        transition,
        involvesVideo: false,
        hasCurrentImage: true,
        direction: "next",
      });

      expect(plan.durationMs).toBe(500);
      expect(plan.keepPreviousImage).toBe(true);
      expect(plan.incomingClassName).toContain("_500ms_");
      expect(plan.outgoingClassName).toContain("_500ms_");
      expect(plan.incomingClassName).toContain("motion-reduce:animate-[playerTransitionReduced_60ms");
    },
  );

  it("uses incoming-only animation for video-involved explicit transitions", () => {
    const plan = getPlayerSlideTransitionPlan({
      transition: "fade",
      involvesVideo: true,
      hasCurrentImage: true,
      direction: "next",
    });

    expect(plan.durationMs).toBe(500);
    expect(plan.keepPreviousImage).toBe(false);
    expect(plan.incomingClassName).toContain("playerTransitionFadeIn_500ms");
    expect(plan.outgoingClassName).toBe("");
  });

  it("falls back to a short fade without translate or scale when reduced motion is preferred", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });

    const plan = getPlayerSlideTransitionPlan({
      transition: "slideLeft",
      involvesVideo: false,
      hasCurrentImage: true,
      direction: "next",
    });

    expect(plan.durationMs).toBe(60);
    expect(plan.incomingClassName).toContain("playerTransitionReduced_60ms");
    expect(plan.outgoingClassName).toContain("playerTransitionFadeOut_60ms");
    expect(plan.incomingClassName).toContain("motion-reduce:");
  });
});
