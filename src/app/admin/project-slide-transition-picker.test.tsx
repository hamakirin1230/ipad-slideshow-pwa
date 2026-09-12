import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  LEGACY_SLIDE_TRANSITION_DURATION_MS,
  PROJECT_SLIDE_TRANSITION_BLUR,
  PROJECT_SLIDE_TRANSITION_DURATION_MS,
  PROJECT_SLIDE_TRANSITION_FADE_EASING,
  PROJECT_SLIDE_TRANSITION_FADE_FROM,
  PROJECT_SLIDE_TRANSITION_SLIDE_DISTANCE,
  PROJECT_SLIDE_TRANSITION_STRENGTHS,
  PROJECT_SLIDE_TRANSITION_UI_OPTIONS,
  PROJECT_SLIDE_TRANSITION_WIPE_FEATHER,
  PROJECT_SLIDE_TRANSITION_ZOOM_FROM,
  REDUCED_MOTION_SLIDE_TRANSITION_DURATION_MS,
} from "@/lib/project-slide-transition";
import { getTransitionPreviewStyle, ProjectSlideTransitionPicker } from "./project-slide-transition-picker";

const source = readFileSync(new URL("./project-slide-transition-picker.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./project-slide-transition-picker.module.css", import.meta.url), "utf8");

describe("visual transition picker", () => {
  it("renders nine labeled native radios with static abstract previews and three strengths", () => {
    const onEffectChange = vi.fn();
    const html = renderToStaticMarkup(<ProjectSlideTransitionPicker selection="standard" strength="standard" disabled={false} onEffectChange={onEffectChange} onStrengthChange={vi.fn()} />);
    expect(html.match(/type="radio"/g)).toHaveLength(12);
    expect(html.match(/<label/g)).toHaveLength(12);
    for (const { value, label } of PROJECT_SLIDE_TRANSITION_UI_OPTIONS) {
      expect(html).toContain(`value="${value}"`);
      expect(html).toContain(label);
      expect(html).toContain(`data-effect="${value}"`);
    }
    expect(html).not.toContain("<select");
    expect(html).not.toContain("data-playing");
    expect(html).not.toContain("<img");
    expect(onEffectChange).not.toHaveBeenCalled();
  });

  it.each(PROJECT_SLIDE_TRANSITION_UI_OPTIONS)("keeps $value checked and enables strength only for explicit effects", ({ value }) => {
    const html = renderToStaticMarkup(<ProjectSlideTransitionPicker selection={value} strength="strong" disabled={false} onEffectChange={vi.fn()} onStrengthChange={vi.fn()} />);
    const effectInputs = html.match(/<input[^>]*type="radio"[^>]*>/g)!.slice(0, 9);
    expect(effectInputs.filter((input) => input.includes('checked=""'))).toHaveLength(1);
    expect(effectInputs.find((input) => input.includes('checked=""'))).toContain(`value="${value}"`);
    const strengthFieldset = html.match(/<fieldset[^>]*data-strength-control="true"[^>]*>/)![0];
    expect(strengthFieldset.includes("disabled")).toBe(value === "standard" || value === "none");
  });

  it("connects each radio name and hint description without hiding or duplicating the hint", () => {
    const html = renderToStaticMarkup(<ProjectSlideTransitionPicker selection="standard" strength="standard" disabled={false} onEffectChange={vi.fn()} onStrengthChange={vi.fn()} />);
    const inputs = html.match(/<input[^>]*type="radio"[^>]*>/g)!.slice(0, 9);
    for (const [index, input] of inputs.entries()) {
      const nameId = input.match(/aria-labelledby="([^"]+)"/)![1];
      const hintId = input.match(/aria-describedby="([^"]+)"/)![1];
      const name = html.match(new RegExp(`<span id="${nameId}"[^>]*>([^<]+)</span>`))!;
      const hint = html.match(new RegExp(`<span id="${hintId}"[^>]*>([^<]+)</span>`))!;
      expect(name[1]).toBe(PROJECT_SLIDE_TRANSITION_UI_OPTIONS[index].label);
      expect(hint[1].length).toBeGreaterThan(0);
      expect(hint[0]).not.toContain("aria-hidden");
      expect(nameId).not.toBe(hintId);
    }
    expect(css).toMatch(/\.hint \{[^}]*font-size: 0\.75rem;/);
  });

  it("locks both fieldsets during Drive operations or with no project", () => {
    const html = renderToStaticMarkup(<ProjectSlideTransitionPicker selection="fade" strength="standard" disabled onEffectChange={vi.fn()} onStrengthChange={vi.fn()} />);
    expect(html.match(/<fieldset[^>]*disabled=""/g)).toHaveLength(2);
  });

  it.each(PROJECT_SLIDE_TRANSITION_UI_OPTIONS)("reuses shared visual values and durations for $value at all three strengths", ({ value }) => {
    for (const strength of PROJECT_SLIDE_TRANSITION_STRENGTHS) {
      const style = getTransitionPreviewStyle(value, strength);
      expect(style).toEqual({
        "--preview-duration": `${value === "none" ? 0 : value === "standard" ? LEGACY_SLIDE_TRANSITION_DURATION_MS : PROJECT_SLIDE_TRANSITION_DURATION_MS}ms`,
        "--preview-reduced-duration": `${REDUCED_MOTION_SLIDE_TRANSITION_DURATION_MS}ms`,
        "--preview-distance": PROJECT_SLIDE_TRANSITION_SLIDE_DISTANCE[strength],
        "--preview-scale": PROJECT_SLIDE_TRANSITION_ZOOM_FROM[strength],
        "--preview-blur": PROJECT_SLIDE_TRANSITION_BLUR[strength],
        "--preview-feather": PROJECT_SLIDE_TRANSITION_WIPE_FEATHER[strength],
        "--preview-fade-from": PROJECT_SLIDE_TRANSITION_FADE_FROM[strength],
        "--preview-easing": value === "fade" ? PROJECT_SLIDE_TRANSITION_FADE_EASING[strength] : "ease-out",
      });
    }
  });

  it("contains a finite event-driven replay path, keeps none still, and avoids external resources and Player dependencies", () => {
    expect(source).toContain('effect === "none") return');
    expect(source).toContain("onClick={() => replay(option.value)}");
    expect(source).toContain("onPointerEnter=");
    expect(source).toContain('(hover: hover)');
    expect(source).toContain('matches(":focus-visible")');
    expect(source).toContain("onStrengthChange(option.value)");
    expect(source).toContain("replay(selection)");
    expect(css).toContain("animation-iteration-count: 1");
    expect(source + css).not.toMatch(/infinite|setInterval|setTimeout|requestAnimationFrame|https?:|url\(|<img|fetch\(|\/player\//);
  });

  it("uses two/three columns, 44px tap areas and visible keyboard/selection states", () => {
    expect(css).toContain("repeat(2, minmax(0, 1fr))");
    expect(css).toContain("repeat(3, minmax(0, 1fr))");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("input:checked");
    expect(css).toContain("input:focus-visible");
  });

  it("reduces every animated effect to short opacity-only layers with no mask", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("animation-duration: var(--preview-reduced-duration)");
    expect(reduced).toContain("animation-name: reducedIn");
    expect(reduced).toContain("animation-name: fadeOut");
    expect(reduced).toContain("transform: none");
    expect(reduced).toContain("filter: none");
    expect(reduced).toContain("mask-image: none");
  });
});
