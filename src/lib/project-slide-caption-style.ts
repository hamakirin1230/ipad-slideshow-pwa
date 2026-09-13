export const PROJECT_SLIDE_CAPTION_STYLE_OPTIONS = {
  position: [
    { value: "top", label: "上" },
    { value: "center", label: "中央" },
    { value: "bottom", label: "下" },
  ],
  shape: [
    { value: "band", label: "帯" },
    { value: "rounded", label: "角丸" },
  ],
  size: [
    { value: "small", label: "小" },
    { value: "standard", label: "標準" },
    { value: "large", label: "大" },
  ],
  colorPreset: [
    { value: "whiteOnBlack", label: "白文字＋黒背景" },
    { value: "blackOnWhite", label: "黒文字＋白背景" },
    { value: "yellowOnBlack", label: "黄文字＋黒背景" },
  ],
} as const;

export type ProjectSlideCaptionStyle = {
  [K in keyof typeof PROJECT_SLIDE_CAPTION_STYLE_OPTIONS]:
    (typeof PROJECT_SLIDE_CAPTION_STYLE_OPTIONS)[K][number]["value"];
};

export const DEFAULT_PROJECT_SLIDE_CAPTION_STYLE: Readonly<ProjectSlideCaptionStyle> = {
  position: "bottom",
  shape: "rounded",
  size: "standard",
  colorPreset: "whiteOnBlack",
};

export const PROJECT_SLIDE_CAPTION_COLORS = {
  whiteOnBlack: { color: "#ffffff", backgroundColor: "rgba(0, 0, 0, 0.62)" },
  blackOnWhite: { color: "#0f172a", backgroundColor: "rgba(255, 255, 255, 0.82)" },
  yellowOnBlack: { color: "#fde047", backgroundColor: "rgba(0, 0, 0, 0.82)" },
} as const;

const STYLE_KEYS = Object.keys(PROJECT_SLIDE_CAPTION_STYLE_OPTIONS) as Array<keyof ProjectSlideCaptionStyle>;

export function isProjectSlideCaptionStyle(value: unknown): value is ProjectSlideCaptionStyle {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === STYLE_KEYS.length && STYLE_KEYS.every(
    (key) => Object.hasOwn(record, key) && PROJECT_SLIDE_CAPTION_STYLE_OPTIONS[key].some(
      (option) => option.value === record[key],
    ),
  );
}

export function parseProjectSlideCaptionStyle(value: unknown):
  | { ok: true; value: ProjectSlideCaptionStyle }
  | { ok: false; errors: string[] } {
  if (!isProjectSlideCaptionStyle(value)) {
    return { ok: false, errors: ["captionStyle の位置・形・文字サイズ・配色は、対応する選択肢をすべて指定する必要があります。"] };
  }
  return {
    ok: true,
    value: {
      position: value.position,
      shape: value.shape,
      size: value.size,
      colorPreset: value.colorPreset,
    },
  };
}

export function getEffectiveProjectSlideCaptionStyle(value: ProjectSlideCaptionStyle | undefined): ProjectSlideCaptionStyle {
  if (value === undefined) return { ...DEFAULT_PROJECT_SLIDE_CAPTION_STYLE };
  const parsed = parseProjectSlideCaptionStyle(value);
  if (!parsed.ok) throw new TypeError("Invalid captionStyle");
  return parsed.value;
}

export function areProjectSlideCaptionStylesEqual(left: ProjectSlideCaptionStyle | undefined, right: ProjectSlideCaptionStyle | undefined) {
  const a = getEffectiveProjectSlideCaptionStyle(left);
  const b = getEffectiveProjectSlideCaptionStyle(right);
  return STYLE_KEYS.every((key) => a[key] === b[key]);
}

export function normalizeProjectSlideCaptionStyleForWrite(value: ProjectSlideCaptionStyle | undefined): ProjectSlideCaptionStyle | undefined {
  return areProjectSlideCaptionStylesEqual(value, undefined) ? undefined : getEffectiveProjectSlideCaptionStyle(value);
}

export function pickProjectSlideCaptionStyle(input: { captionStyle?: ProjectSlideCaptionStyle }): { captionStyle?: ProjectSlideCaptionStyle } {
  return input.captionStyle === undefined ? {} : { captionStyle: getEffectiveProjectSlideCaptionStyle(input.captionStyle) };
}
