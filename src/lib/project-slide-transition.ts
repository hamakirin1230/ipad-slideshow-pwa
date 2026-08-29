export const PROJECT_SLIDE_TRANSITIONS = [
  "none",
  "fade",
  "slideLeft",
  "slideRight",
  "slideUp",
  "wipe",
  "zoom",
  "blur",
] as const;

export const PROJECT_SLIDE_TRANSITION_ANIMATED_EFFECTS = [
  "fade",
  "slideLeft",
  "slideRight",
  "slideUp",
  "wipe",
  "zoom",
  "blur",
] as const;

export type ProjectSlideTransition = (typeof PROJECT_SLIDE_TRANSITIONS)[number];

export const PROJECT_SLIDE_TRANSITION_STRENGTHS = [
  "subtle",
  "standard",
  "strong",
] as const;

export type ProjectSlideTransitionStrength =
  (typeof PROJECT_SLIDE_TRANSITION_STRENGTHS)[number];

export type ProjectSlideTransitionSelection =
  | "standard"
  | ProjectSlideTransition;

export type ProjectSlideTransitionSettings = {
  transition?: ProjectSlideTransition;
  transitionStrength?: ProjectSlideTransitionStrength;
};

export const PROJECT_SLIDE_TRANSITION_DURATION_MS = 500;
export const LEGACY_SLIDE_TRANSITION_DURATION_MS = 320;
export const REDUCED_MOTION_SLIDE_TRANSITION_DURATION_MS = 60;

export const PROJECT_SLIDE_TRANSITION_UI_OPTIONS: ReadonlyArray<{
  value: ProjectSlideTransitionSelection;
  label: string;
}> = [
  { value: "standard", label: "標準" },
  { value: "none", label: "なし" },
  { value: "fade", label: "フェード" },
  { value: "slideLeft", label: "スライド左" },
  { value: "slideRight", label: "スライド右" },
  { value: "slideUp", label: "スライド上" },
  { value: "wipe", label: "ワイプ" },
  { value: "zoom", label: "ズーム" },
  { value: "blur", label: "ぼかし" },
];

export const PROJECT_SLIDE_TRANSITION_STRENGTH_UI_OPTIONS: ReadonlyArray<{
  value: ProjectSlideTransitionStrength;
  label: string;
}> = [
  { value: "subtle", label: "控えめ" },
  { value: "standard", label: "標準" },
  { value: "strong", label: "強め" },
];

export const PROJECT_SLIDE_TRANSITION_HELPER_COPY =
  "再生時のスライド切り替えを設定します。ローカル再生へ反映するには、変更後にローカルへ保存してください。";

export const PROJECT_SLIDE_TRANSITION_STRENGTH_HELPER_COPY =
  "エフェクトの強さは「控えめ・標準・強め」から選べます。";

export const PROJECT_SLIDE_TRANSITION_SLIDE_DISTANCE: Record<
  ProjectSlideTransitionStrength,
  string
> = {
  subtle: "8%",
  standard: "20%",
  strong: "35%",
};

export const PROJECT_SLIDE_TRANSITION_ZOOM_FROM: Record<
  ProjectSlideTransitionStrength,
  string
> = {
  subtle: "1.03",
  standard: "1.10",
  strong: "1.18",
};

export const PROJECT_SLIDE_TRANSITION_BLUR: Record<
  ProjectSlideTransitionStrength,
  string
> = {
  subtle: "4px",
  standard: "10px",
  strong: "18px",
};

export const PROJECT_SLIDE_TRANSITION_WIPE_FEATHER: Record<
  ProjectSlideTransitionStrength,
  string
> = {
  subtle: "36%",
  standard: "14%",
  strong: "2%",
};

export const PROJECT_SLIDE_TRANSITION_FADE_FROM: Record<
  ProjectSlideTransitionStrength,
  string
> = {
  subtle: "0.28",
  standard: "0",
  strong: "0",
};

export const PROJECT_SLIDE_TRANSITION_FADE_EASING: Record<
  ProjectSlideTransitionStrength,
  string
> = {
  subtle: "cubic-bezier(0.45, 0, 0.55, 1)",
  standard: "cubic-bezier(0.16, 1, 0.3, 1)",
  strong: "linear",
};

const TRANSITION_SET = new Set<string>(PROJECT_SLIDE_TRANSITIONS);
const STRENGTH_SET = new Set<string>(PROJECT_SLIDE_TRANSITION_STRENGTHS);

export type ProjectSlideTransitionParseResult =
  | { ok: true; value: ProjectSlideTransition }
  | { ok: false; errors: string[] };

export type ProjectSlideTransitionStrengthParseResult =
  | { ok: true; value: ProjectSlideTransitionStrength }
  | { ok: false; errors: string[] };

export function isProjectSlideTransition(
  value: unknown,
): value is ProjectSlideTransition {
  return typeof value === "string" && TRANSITION_SET.has(value);
}

export function isProjectSlideTransitionStrength(
  value: unknown,
): value is ProjectSlideTransitionStrength {
  return typeof value === "string" && STRENGTH_SET.has(value);
}

export function parseProjectSlideTransition(
  input: unknown,
): ProjectSlideTransitionParseResult {
  if (!isProjectSlideTransition(input)) {
    return {
      ok: false,
      errors: [
        "manifest.json の transition は none / fade / slideLeft / slideRight / slideUp / wipe / zoom / blur のいずれかである必要があります。",
      ],
    };
  }

  return { ok: true, value: input };
}

export function parseProjectSlideTransitionStrength(
  input: unknown,
): ProjectSlideTransitionStrengthParseResult {
  if (!isProjectSlideTransitionStrength(input)) {
    return {
      ok: false,
      errors: [
        "manifest.json の transitionStrength は subtle / standard / strong のいずれかである必要があります。",
      ],
    };
  }

  return { ok: true, value: input };
}

export function projectSlideTransitionUsesStrength(
  transition: ProjectSlideTransition | undefined,
) {
  return transition !== undefined && transition !== "none";
}

export function getEffectiveProjectSlideTransitionStrength(
  settings: ProjectSlideTransitionSettings,
): ProjectSlideTransitionStrength | undefined {
  if (!projectSlideTransitionUsesStrength(settings.transition)) {
    return undefined;
  }

  return settings.transitionStrength ?? "standard";
}

export function getProjectSlideTransitionSettingsCombinationErrors(input: {
  transition: ProjectSlideTransition | undefined;
  hasStrength: boolean;
}) {
  if (
    input.hasStrength &&
    !projectSlideTransitionUsesStrength(input.transition)
  ) {
    return [
      "manifest.json の transitionStrength は明示的なスライド切り替え効果がある場合のみ指定できます。",
    ];
  }

  return [];
}

export function normalizeProjectSlideTransitionSettingsForWrite(input: {
  transition: ProjectSlideTransition | undefined;
  transitionStrength?: ProjectSlideTransitionStrength;
}): ProjectSlideTransitionSettings {
  if (input.transition === undefined) {
    return {};
  }

  if (input.transition === "none") {
    return { transition: "none" };
  }

  return {
    transition: input.transition,
    transitionStrength: input.transitionStrength ?? "standard",
  };
}

export function projectSlideTransitionFromSelection(
  selection: ProjectSlideTransitionSelection,
): ProjectSlideTransition | undefined {
  return selection === "standard" ? undefined : selection;
}

export function projectSlideTransitionToSelection(
  transition: ProjectSlideTransition | undefined,
): ProjectSlideTransitionSelection {
  return transition ?? "standard";
}

export function areProjectSlideTransitionsEqual(
  left: ProjectSlideTransition | undefined,
  right: ProjectSlideTransition | undefined,
) {
  return left === right;
}

export function areProjectSlideTransitionSettingsEqual(
  left: ProjectSlideTransitionSettings,
  right: ProjectSlideTransitionSettings,
) {
  if (left.transition !== right.transition) {
    return false;
  }

  if (!projectSlideTransitionUsesStrength(left.transition)) {
    return true;
  }

  return (
    getEffectiveProjectSlideTransitionStrength(left) ===
    getEffectiveProjectSlideTransitionStrength(right)
  );
}

export function pickProjectSlideTransitionSettings(
  settings: ProjectSlideTransitionSettings,
): ProjectSlideTransitionSettings {
  return {
    ...(settings.transition !== undefined ? { transition: settings.transition } : {}),
    ...(settings.transitionStrength !== undefined
      ? { transitionStrength: settings.transitionStrength }
      : {}),
  };
}
