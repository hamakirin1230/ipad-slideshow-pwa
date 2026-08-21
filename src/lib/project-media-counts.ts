export type ProjectMediaCountSlide = {
  type?: "image" | "video";
  mimeType?: string;
};

export type ProjectMediaCounts = {
  photoCount: number;
  videoCount: number;
  otherCount: number;
};

export function countProjectMedia(
  slides: readonly ProjectMediaCountSlide[] | null | undefined,
): ProjectMediaCounts | null {
  if (!slides) {
    return null;
  }

  let photoCount = 0;
  let videoCount = 0;
  let otherCount = 0;

  for (const slide of slides) {
    const kind = classifyProjectMediaSlide(slide);
    if (kind === "image") {
      photoCount += 1;
      continue;
    }
    if (kind === "video") {
      videoCount += 1;
      continue;
    }
    otherCount += 1;
  }

  return { photoCount, videoCount, otherCount };
}

export function formatProjectMediaCounts(counts: ProjectMediaCounts | null) {
  if (!counts) {
    return "写真 — ・ 動画 —";
  }
  if (counts.otherCount > 0) {
    return `写真 ${counts.photoCount} ・ 動画 ${counts.videoCount} ・ その他 ${counts.otherCount}`;
  }
  return `写真 ${counts.photoCount} ・ 動画 ${counts.videoCount}`;
}

function classifyProjectMediaSlide(slide: ProjectMediaCountSlide) {
  if (slide.type === "image" || slide.type === "video") {
    return slide.type;
  }
  const mimeType = slide.mimeType?.toLowerCase() ?? "";
  if (mimeType.startsWith("image/")) {
    return "image" as const;
  }
  if (mimeType.startsWith("video/")) {
    return "video" as const;
  }
  return "other" as const;
}
