export const PROJECT_SLIDE_TRANSITIONS = [
  "none",
  "fade",
  "slideLeft",
  "zoom",
] as const;

export type ProjectSlideTransition = (typeof PROJECT_SLIDE_TRANSITIONS)[number];

export type ProjectSlideTransitionSelection =
  | "standard"
  | ProjectSlideTransition;

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
  { value: "zoom", label: "ズーム" },
];

export const PROJECT_SLIDE_TRANSITION_HELPER_COPY =
  "再生時のスライド切り替えを設定します。ローカル再生へ反映するには、変更後にローカルへ保存してください。";

const TRANSITION_SET = new Set<string>(PROJECT_SLIDE_TRANSITIONS);

export type ProjectSlideTransitionParseResult =
  | { ok: true; value: ProjectSlideTransition }
  | { ok: false; errors: string[] };

export function isProjectSlideTransition(
  value: unknown,
): value is ProjectSlideTransition {
  return typeof value === "string" && TRANSITION_SET.has(value);
}

export function parseProjectSlideTransition(
  input: unknown,
): ProjectSlideTransitionParseResult {
  if (!isProjectSlideTransition(input)) {
    return {
      ok: false,
      errors: [
        "manifest.json の transition は none / fade / slideLeft / zoom のいずれかである必要があります。",
      ],
    };
  }

  return { ok: true, value: input };
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
