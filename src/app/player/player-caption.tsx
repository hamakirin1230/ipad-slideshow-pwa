import type { ProjectSlideCaptionStyle } from "@/lib/project-slide-caption-style";
import { getPlayerCaptionStyle } from "./player-caption-style";

export function PlayerCaption({ caption, ...input }: {
  caption: string;
  captionStyle?: ProjectSlideCaptionStyle;
  isProductionMode: boolean;
  preview?: boolean;
}) {
  if (!caption.trim()) return null;
  const presentation = getPlayerCaptionStyle(input);
  return (
    <div data-player-caption className={presentation.overlayClassName} style={presentation.overlayStyle}>
      <p className={presentation.className} style={presentation.style}>{caption.trim()}</p>
    </div>
  );
}
