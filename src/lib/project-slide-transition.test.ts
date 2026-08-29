import { describe, expect, it } from "vitest";
import {
  PROJECT_SLIDE_TRANSITION_HELPER_COPY,
  PROJECT_SLIDE_TRANSITION_UI_OPTIONS,
  areProjectSlideTransitionsEqual,
  parseProjectSlideTransition,
  projectSlideTransitionFromSelection,
  projectSlideTransitionToSelection,
} from "./project-slide-transition";

describe("project slide transition", () => {
  it("accepts the four explicit values and rejects unknown values", () => {
    expect(parseProjectSlideTransition("none")).toEqual({
      ok: true,
      value: "none",
    });
    expect(parseProjectSlideTransition("fade")).toEqual({
      ok: true,
      value: "fade",
    });
    expect(parseProjectSlideTransition("slideLeft")).toEqual({
      ok: true,
      value: "slideLeft",
    });
    expect(parseProjectSlideTransition("zoom")).toEqual({
      ok: true,
      value: "zoom",
    });
    expect(parseProjectSlideTransition("crossfade").ok).toBe(false);
    expect(parseProjectSlideTransition("standard").ok).toBe(false);
    expect(parseProjectSlideTransition(null).ok).toBe(false);
  });

  it("maps 標準 to undefined and keeps explicit values intact", () => {
    expect(projectSlideTransitionFromSelection("standard")).toBeUndefined();
    expect(projectSlideTransitionToSelection(undefined)).toBe("standard");
    expect(projectSlideTransitionFromSelection("fade")).toBe("fade");
    expect(projectSlideTransitionToSelection("none")).toBe("none");
    expect(areProjectSlideTransitionsEqual(undefined, undefined)).toBe(true);
    expect(areProjectSlideTransitionsEqual(undefined, "none")).toBe(false);
  });

  it("exposes five UI choices and the local-save helper copy", () => {
    expect(PROJECT_SLIDE_TRANSITION_UI_OPTIONS.map((option) => option.label)).toEqual(
      ["標準", "なし", "フェード", "スライド左", "ズーム"],
    );
    expect(PROJECT_SLIDE_TRANSITION_HELPER_COPY).toContain(
      "ローカルへ保存してください",
    );
    expect(PROJECT_SLIDE_TRANSITION_HELPER_COPY).not.toContain("Publish");
  });
});
