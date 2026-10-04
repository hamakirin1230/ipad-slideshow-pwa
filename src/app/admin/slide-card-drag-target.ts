const INTERACTIVE_DRAG_TARGET_SELECTOR = [
  "button",
  "input",
  "label",
  "a",
  "textarea",
  "select",
  "[contenteditable]",
  '[role="button"]',
  "[data-card-drag-interactive]",
].join(", ");

type ClosestTarget = EventTarget & {
  closest?: (selector: string) => Element | null;
};

export function isInteractiveSlideCardDragTarget(target: EventTarget | null) {
  if (
    !target ||
    typeof target !== "object" ||
    !("closest" in target) ||
    typeof (target as ClosestTarget).closest !== "function"
  ) {
    return false;
  }

  return Boolean(
    (target as ClosestTarget).closest?.(INTERACTIVE_DRAG_TARGET_SELECTOR),
  );
}
