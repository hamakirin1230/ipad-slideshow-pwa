import { describe, expect, it } from "vitest";
import {
  PROJECT_SLIDE_TRANSITION_ANIMATED_EFFECTS,
  PROJECT_SLIDE_TRANSITION_HELPER_COPY,
  PROJECT_SLIDE_TRANSITION_STRENGTH_HELPER_COPY,
  PROJECT_SLIDE_TRANSITION_STRENGTH_UI_OPTIONS,
  PROJECT_SLIDE_TRANSITION_UI_OPTIONS,
  PROJECT_SLIDE_TRANSITIONS,
  PROJECT_SLIDE_TRANSITION_STRENGTHS,
  areProjectSlideTransitionSettingsEqual,
  getEffectiveProjectSlideTransitionStrength,
  parseProjectSlideTransition,
  parseProjectSlideTransitionStrength,
  projectSlideTransitionFromSelection,
  projectSlideTransitionToSelection,
  projectSlideTransitionUsesStrength,
} from "./project-slide-transition";

describe("project slide transition", () => {
  it("accepts the eight explicit effects and rejects unknown values", () => {
    for (const transition of PROJECT_SLIDE_TRANSITIONS) {
      expect(parseProjectSlideTransition(transition)).toEqual({
        ok: true,
        value: transition,
      });
    }
    expect(PROJECT_SLIDE_TRANSITIONS).toHaveLength(8);
    expect(parseProjectSlideTransition("crossfade").ok).toBe(false);
    expect(parseProjectSlideTransition("standard").ok).toBe(false);
    expect(parseProjectSlideTransition(null).ok).toBe(false);
  });

  it("accepts the three strengths and rejects unknown values", () => {
    for (const strength of PROJECT_SLIDE_TRANSITION_STRENGTHS) {
      expect(parseProjectSlideTransitionStrength(strength)).toEqual({
        ok: true,
        value: strength,
      });
    }
    expect(PROJECT_SLIDE_TRANSITION_STRENGTHS).toEqual([
      "subtle",
      "standard",
      "strong",
    ]);
    expect(parseProjectSlideTransitionStrength("medium").ok).toBe(false);
    expect(parseProjectSlideTransitionStrength("none").ok).toBe(false);
  });

  it("treats absent strength as standard only for explicit animated effects", () => {
    expect(
      getEffectiveProjectSlideTransitionStrength({ transition: "fade" }),
    ).toBe("standard");
    expect(
      getEffectiveProjectSlideTransitionStrength({
        transition: "wipe",
        transitionStrength: "subtle",
      }),
    ).toBe("subtle");
    expect(
      getEffectiveProjectSlideTransitionStrength({ transition: undefined }),
    ).toBeUndefined();
    expect(
      getEffectiveProjectSlideTransitionStrength({ transition: "none" }),
    ).toBeUndefined();
    expect(projectSlideTransitionUsesStrength(undefined)).toBe(false);
    expect(projectSlideTransitionUsesStrength("none")).toBe(false);
    for (const transition of PROJECT_SLIDE_TRANSITION_ANIMATED_EFFECTS) {
      expect(projectSlideTransitionUsesStrength(transition)).toBe(true);
    }
  });

  it("treats first-phase fade without strength as equal to fade + standard", () => {
    expect(
      areProjectSlideTransitionSettingsEqual(
        { transition: "fade" },
        { transition: "fade", transitionStrength: "standard" },
      ),
    ).toBe(true);
    expect(
      areProjectSlideTransitionSettingsEqual(
        { transition: "fade" },
        { transition: "fade", transitionStrength: "strong" },
      ),
    ).toBe(false);
    expect(
      areProjectSlideTransitionSettingsEqual(
        { transition: undefined },
        { transition: "none" },
      ),
    ).toBe(false);
  });

  it("maps 標準 to undefined and keeps explicit values intact", () => {
    expect(projectSlideTransitionFromSelection("standard")).toBeUndefined();
    expect(projectSlideTransitionToSelection(undefined)).toBe("standard");
    expect(projectSlideTransitionFromSelection("fade")).toBe("fade");
    expect(projectSlideTransitionToSelection("none")).toBe("none");
  });

  it("exposes nine effect choices, three strengths, and local-save helper copy", () => {
    expect(PROJECT_SLIDE_TRANSITION_UI_OPTIONS.map((option) => option.label)).toEqual(
      [
        "標準",
        "なし",
        "フェード",
        "スライド左",
        "スライド右",
        "スライド上",
        "ワイプ",
        "ズーム",
        "ぼかし",
      ],
    );
    expect(
      PROJECT_SLIDE_TRANSITION_STRENGTH_UI_OPTIONS.map((option) => option.label),
    ).toEqual(["控えめ", "標準", "強め"]);
    expect(PROJECT_SLIDE_TRANSITION_HELPER_COPY).toContain(
      "ローカルへ保存してください",
    );
    expect(PROJECT_SLIDE_TRANSITION_HELPER_COPY).not.toContain("Publish");
    expect(PROJECT_SLIDE_TRANSITION_STRENGTH_HELPER_COPY).toContain(
      "控えめ・標準・強め",
    );
  });
});
