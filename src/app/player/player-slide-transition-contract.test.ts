import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../globals.css", import.meta.url), "utf8");

describe("player album slide transition wiring", () => {
  it("uses OfflinePlaybackSnapshot transition settings and never Drive project state", () => {
    expect(pageSource).toContain("playbackSlideTransition = readySnapshot?.transition");
    expect(pageSource).toContain(
      "playbackSlideTransitionStrength = readySnapshot?.transitionStrength",
    );
    expect(pageSource).toContain("getPlayerSlideTransitionPlan");
    expect(pageSource).toContain("incomingClassName={videoTransitionPlan.incomingClassName}");
    expect(pageSource).toContain("incomingStyle={videoTransitionPlan.incomingStyle}");
    expect(pageSource).not.toContain("projectTransition");
    expect(pageSource).not.toContain("updateSelectedProjectTransitionSettings");
  });

  it("keeps legacy 320ms named separately from explicit 500ms transitions", () => {
    expect(pageSource).toContain("LEGACY_SLIDE_TRANSITION_DURATION_MS = 320");
    expect(pageSource).toContain("transitionPlan.keepPreviousImage");
    expect(pageSource).toContain("videoTransitionPlan.incomingClassName");
    expect(pageSource).toContain("imageTransitionPlan.incomingStyle");
    expect(pageSource).toContain("imageTransitionPlan.outgoingStyle");
  });

  it("applies video incoming animation to the media layer only", () => {
    const videoSlide = pageSource.slice(
      pageSource.indexOf("function PlayerVideoSlide("),
    );
    expect(videoSlide).toContain("style={incomingStyle}");
    expect(videoSlide).toContain('data-player-controls="video"');
    expect(videoSlide.indexOf("style={incomingStyle}")).toBeLessThan(
      videoSlide.indexOf('data-player-controls="video"'),
    );
  });

  it("does not keep an old video layer for transitions", () => {
    expect(pageSource).not.toContain("previousSlideVideo");
    expect(pageSource).toContain("revokeSlideVideo(currentVideo)");
  });

  it("keeps each image edit on the shared SVG inside the transition layer", () => {
    expect(pageSource).toContain(
      'import { ProjectSlideImageView } from "@/components/project-slide-image-view"',
    );
    expect(pageSource).toContain("imageEdit: currentSlideImageEdit");
    expect(pageSource).toContain("imageEdit={previousSlideImage.imageEdit}");
    expect(pageSource).toContain("imageEdit={displayedSlideImage.imageEdit}");
    expect(pageSource).toContain(
      "className={`absolute inset-0 h-full w-full ${imageTransitionPlan.outgoingClassName}`}",
    );
    expect(pageSource).not.toContain("currentSlide?.imageEdit" + "}\n                className={`absolute");
  });

  it("implements wipe as a left-to-right CSS mask without translating media", () => {
    expect(cssSource).toContain(".player-transition-wipe-in");
    expect(cssSource).toContain("-webkit-mask-image");
    expect(cssSource).toContain("mask-image");
    expect(cssSource).toContain("@keyframes playerTransitionWipeReveal");
    const wipeBlock = cssSource.slice(cssSource.indexOf(".player-transition-wipe-in"));
    expect(wipeBlock).not.toContain("translate");
  });
});
