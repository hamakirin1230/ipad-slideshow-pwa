import type { CSSProperties } from "react";
import {
  getEffectiveProjectSlideCaptionStyle,
  PROJECT_SLIDE_CAPTION_COLORS,
  type ProjectSlideCaptionStyle,
} from "@/lib/project-slide-caption-style";

export function getPlayerCaptionStyle(input: {
  captionStyle?: ProjectSlideCaptionStyle;
  isProductionMode: boolean;
  preview?: boolean;
}) {
  const style = getEffectiveProjectSlideCaptionStyle(input.captionStyle);
  const rounded = style.shape === "rounded";
  const positionClass = style.position === "center"
    ? "top-1/2 -translate-y-1/2"
    : input.preview
      ? style.position === "top" ? "top-3" : "bottom-3"
      : style.position === "top"
        ? input.isProductionMode ? "top-0" : "top-40 sm:top-32"
        : input.isProductionMode ? "bottom-0 pt-20" : "bottom-20 sm:bottom-24";
  const overlayStyle: CSSProperties = !input.preview && input.isProductionMode
    ? style.position === "top"
      ? { paddingTop: "max(env(safe-area-inset-top), 1.25rem)" }
      : style.position === "bottom"
        ? { paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }
        : {}
    : {};
  const sizeClass = {
    small: "text-sm leading-6 sm:text-base sm:leading-7",
    standard: "text-base leading-7 sm:text-xl sm:leading-8",
    large: "text-xl leading-8 sm:text-3xl sm:leading-10",
  }[style.size];
  return {
    overlayClassName: `pointer-events-none absolute inset-x-0 z-10 ${positionClass} ${rounded ? "px-4 sm:px-6" : "px-4 sm:px-8"}`,
    overlayStyle,
    className: `mx-auto px-4 py-2 text-center shadow-2xl ${rounded ? "max-w-4xl rounded-xl" : "w-full rounded-none"} ${sizeClass}`,
    style: {
      ...PROJECT_SLIDE_CAPTION_COLORS[style.colorPreset],
      WebkitBackdropFilter: "blur(4px)",
      backdropFilter: "blur(4px)",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      overflowWrap: "anywhere",
    } satisfies CSSProperties,
  };
}
