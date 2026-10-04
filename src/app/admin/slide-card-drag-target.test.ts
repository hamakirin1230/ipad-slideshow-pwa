import { describe, expect, it } from "vitest";
import { isInteractiveSlideCardDragTarget } from "./slide-card-drag-target";

describe("isInteractiveSlideCardDragTarget", () => {
  it("excludes an interactive element and its descendants", () => {
    const closest = (selector: string) =>
      selector.includes("button") ? ({} as Element) : null;

    expect(isInteractiveSlideCardDragTarget({ closest } as EventTarget)).toBe(true);
  });

  it("allows a noninteractive card surface", () => {
    expect(
      isInteractiveSlideCardDragTarget({ closest: () => null } as EventTarget),
    ).toBe(false);
  });

  it("does not treat a non-element event target as interactive", () => {
    expect(isInteractiveSlideCardDragTarget(null)).toBe(false);
  });
});
