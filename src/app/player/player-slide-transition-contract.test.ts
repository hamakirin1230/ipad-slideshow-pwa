import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("player album slide transition wiring", () => {
  it("uses OfflinePlaybackSnapshot.transition and never Drive project state", () => {
    expect(pageSource).toContain("playbackSlideTransition = readySnapshot?.transition");
    expect(pageSource).toContain("getPlayerSlideTransitionPlan");
    expect(pageSource).toContain("incomingClassName={videoTransitionPlan.incomingClassName}");
    expect(pageSource).not.toContain("projectTransition");
    expect(pageSource).not.toContain("updateSelectedProjectTransition");
  });

  it("keeps legacy 320ms named separately from explicit 500ms transitions", () => {
    expect(pageSource).toContain("LEGACY_SLIDE_TRANSITION_DURATION_MS = 320");
    expect(pageSource).toContain("transitionPlan.keepPreviousImage");
    expect(pageSource).toContain("videoTransitionPlan.incomingClassName");
  });

  it("does not keep an old video layer for transitions", () => {
    expect(pageSource).not.toContain("previousSlideVideo");
    expect(pageSource).toContain("revokeSlideVideo(currentVideo)");
  });
});
