"use client";

import { useId, useState, type CSSProperties } from "react";
import {
  LEGACY_SLIDE_TRANSITION_DURATION_MS,
  PROJECT_SLIDE_TRANSITION_BLUR,
  PROJECT_SLIDE_TRANSITION_DURATION_MS,
  PROJECT_SLIDE_TRANSITION_FADE_EASING,
  PROJECT_SLIDE_TRANSITION_FADE_FROM,
  PROJECT_SLIDE_TRANSITION_SLIDE_DISTANCE,
  PROJECT_SLIDE_TRANSITION_STRENGTH_UI_OPTIONS,
  PROJECT_SLIDE_TRANSITION_UI_OPTIONS,
  PROJECT_SLIDE_TRANSITION_WIPE_FEATHER,
  PROJECT_SLIDE_TRANSITION_ZOOM_FROM,
  REDUCED_MOTION_SLIDE_TRANSITION_DURATION_MS,
  projectSlideTransitionFromSelection,
  projectSlideTransitionUsesStrength,
  type ProjectSlideTransitionSelection,
  type ProjectSlideTransitionStrength,
} from "@/lib/project-slide-transition";
import styles from "./project-slide-transition-picker.module.css";

type PreviewStyle = CSSProperties & Record<`--preview-${string}`, string>;

export function getTransitionPreviewStyle(
  effect: ProjectSlideTransitionSelection,
  strength: ProjectSlideTransitionStrength,
): PreviewStyle {
  return {
    "--preview-duration": `${effect === "none" ? 0 : effect === "standard" ? LEGACY_SLIDE_TRANSITION_DURATION_MS : PROJECT_SLIDE_TRANSITION_DURATION_MS}ms`,
    "--preview-reduced-duration": `${REDUCED_MOTION_SLIDE_TRANSITION_DURATION_MS}ms`,
    "--preview-distance": PROJECT_SLIDE_TRANSITION_SLIDE_DISTANCE[strength],
    "--preview-scale": PROJECT_SLIDE_TRANSITION_ZOOM_FROM[strength],
    "--preview-blur": PROJECT_SLIDE_TRANSITION_BLUR[strength],
    "--preview-feather": PROJECT_SLIDE_TRANSITION_WIPE_FEATHER[strength],
    "--preview-fade-from": PROJECT_SLIDE_TRANSITION_FADE_FROM[strength],
    "--preview-easing": effect === "fade" ? PROJECT_SLIDE_TRANSITION_FADE_EASING[strength] : "ease-out",
  };
}

const PREVIEW_HINTS: Record<ProjectSlideTransitionSelection, string> = {
  standard: "ふわっと横へ",
  none: "動きなし",
  fade: "ゆっくり重なる",
  slideLeft: "← 左へ",
  slideRight: "右へ →",
  slideUp: "↑ 上へ",
  wipe: "境界で切り替え",
  zoom: "大きさが変わる",
  blur: "ぼかしから鮮明に",
};

export function ProjectSlideTransitionPicker({
  selection,
  strength,
  disabled,
  onEffectChange,
  onStrengthChange,
}: {
  selection: ProjectSlideTransitionSelection;
  strength: ProjectSlideTransitionStrength;
  disabled: boolean;
  onEffectChange: (selection: ProjectSlideTransitionSelection) => void;
  onStrengthChange: (strength: ProjectSlideTransitionStrength) => void;
}) {
  const id = useId();
  const [preview, setPreview] = useState<{
    effect: ProjectSlideTransitionSelection;
    run: number;
  } | null>(null);
  const usesStrength = projectSlideTransitionUsesStrength(
    projectSlideTransitionFromSelection(selection),
  );

  function replay(effect: ProjectSlideTransitionSelection) {
    if (disabled || effect === "none") return;
    // Remount only the visual layers. The radio keeps its keyboard focus.
    setPreview((previous) => ({ effect, run: (previous?.run ?? 0) + 1 }));
  }

  return (
    <div className={styles.picker}>
      <fieldset disabled={disabled} className={styles.fieldset}>
        <legend className={styles.legend}>切り替え効果</legend>
        <div className={styles.grid}>
          {PROJECT_SLIDE_TRANSITION_UI_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={styles.card}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches) {
                  replay(option.value);
                }
              }}
            >
              <input
                type="radio"
                name={`${id}-effect`}
                aria-labelledby={`${id}-${option.value}-name`}
                aria-describedby={`${id}-${option.value}-hint`}
                value={option.value}
                checked={selection === option.value}
                onChange={() => onEffectChange(option.value)}
                onClick={() => replay(option.value)}
                onFocus={(event) => {
                  // Pointer focus is followed by click; play only once for that tap.
                  if (event.currentTarget.matches(":focus-visible")) replay(option.value);
                }}
                className={styles.radio}
              />
              <span id={`${id}-${option.value}-name`} className={styles.cardTitle}>{option.label}</span>
              <span
                key={preview?.effect === option.value ? preview.run : 0}
                className={styles.preview}
                data-effect={option.value}
                data-playing={preview?.effect === option.value || undefined}
                style={getTransitionPreviewStyle(option.value, strength)}
                aria-hidden="true"
              >
                <span className={`${styles.panel} ${styles.previous}`}><span>A</span></span>
                <span className={`${styles.panel} ${styles.next}`}><span>B</span></span>
              </span>
              <span id={`${id}-${option.value}-hint`} className={styles.hint}>{PREVIEW_HINTS[option.value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset
        disabled={disabled || !usesStrength}
        className={styles.fieldset}
        aria-describedby={`${id}-strength-help`}
        data-strength-control="true"
      >
        <legend className={styles.legend}>エフェクトの強さ</legend>
        <div className={styles.strengths}>
          {PROJECT_SLIDE_TRANSITION_STRENGTH_UI_OPTIONS.map((option) => (
            <label key={option.value} className={styles.strength}>
              <input
                type="radio"
                name={`${id}-strength`}
                value={option.value}
                checked={strength === option.value}
                onChange={() => {
                  onStrengthChange(option.value);
                  replay(selection);
                }}
                className={styles.radio}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p id={`${id}-strength-help`} className={styles.help}>
        {usesStrength ? "強さを選ぶと、選択中の効果を再生します。" : "「標準」「なし」では強さを設定しません。"}
      </p>
    </div>
  );
}
