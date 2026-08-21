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

export function nullableProjectMediaCounts(
  counts: ProjectMediaCounts | null | undefined,
) {
  if (!counts) {
    return {
      photoCount: null,
      videoCount: null,
      otherCount: null,
    };
  }

  return {
    photoCount: counts.photoCount,
    videoCount: counts.videoCount,
    otherCount: counts.otherCount,
  };
}

export function projectMediaCountsFromSummary(input: {
  photoCount: number | null;
  videoCount: number | null;
  otherCount: number | null;
}): ProjectMediaCounts | null {
  if (
    input.photoCount === null ||
    input.videoCount === null ||
    input.otherCount === null
  ) {
    return null;
  }

  return {
    photoCount: input.photoCount,
    videoCount: input.videoCount,
    otherCount: input.otherCount,
  };
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
