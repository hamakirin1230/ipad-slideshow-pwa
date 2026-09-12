"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useAppState } from "@/app/app-providers";
import { Button } from "@/components/ui/button";
import { PlayerCaption } from "@/app/player/player-caption";
import {
  areProjectSlideCaptionStylesEqual,
  getEffectiveProjectSlideCaptionStyle,
  normalizeProjectSlideCaptionStyleForWrite,
  PROJECT_SLIDE_CAPTION_STYLE_OPTIONS,
  type ProjectSlideCaptionStyle,
} from "@/lib/project-slide-caption-style";

export function ProjectSlideCaptionStyleSettings({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { projectSummary, projectCaptionStyle, driveStatus, projectStatus, isDriveOperationInFlight, updateSelectedProjectCaptionStyle } = useAppState();
  return (
    <SelectedProjectSlideCaptionStyleForm
      key={`${projectSummary?.projectId ?? "none"}:${JSON.stringify(getEffectiveProjectSlideCaptionStyle(projectCaptionStyle))}`}
      savedStyle={projectCaptionStyle}
      disabled={!projectSummary || isDriveOperationInFlight}
      canSave={driveStatus === "ready" && projectStatus === "ready" && projectSummary !== null && !isDriveOperationInFlight}
      onSave={updateSelectedProjectCaptionStyle}
      onDirtyChange={onDirtyChange}
    />
  );
}

export function SelectedProjectSlideCaptionStyleForm({ savedStyle, disabled, canSave, onSave, onDirtyChange }: {
  savedStyle?: ProjectSlideCaptionStyle;
  disabled: boolean;
  canSave: boolean;
  onSave: (style: ProjectSlideCaptionStyle | undefined) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => getEffectiveProjectSlideCaptionStyle(savedStyle));
  const isDirty = !areProjectSlideCaptionStylesEqual(savedStyle, draft);
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || disabled || !isDirty) return;
    onSave(normalizeProjectSlideCaptionStyleForWrite(draft));
  }

  return (
    <form aria-labelledby={`${id}-heading`} onSubmit={handleSubmit} className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4">
      <h4 id={`${id}-heading`} className="font-semibold text-slate-50">テロップの見た目</h4>
      <p className="mt-2 text-sm leading-6 text-slate-400">アルバム全体に適用します。ローカル再生へ反映するには、変更後にローカルへ保存してください。</p>
      <div role="img" aria-label="テロップの見た目のプレビュー" className="relative mt-4 aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-slate-700 via-slate-900 to-indigo-950">
        <PlayerCaption caption="サンプルテロップ" captionStyle={draft} isProductionMode={false} preview />
      </div>
      {(Object.keys(PROJECT_SLIDE_CAPTION_STYLE_OPTIONS) as Array<keyof ProjectSlideCaptionStyle>).map((key) => (
        <fieldset key={key} disabled={disabled} className="mt-4 min-w-0">
          <legend className="text-sm font-medium text-slate-100">{{ position: "位置", shape: "形", size: "文字サイズ", colorPreset: "配色" }[key]}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROJECT_SLIDE_CAPTION_STYLE_OPTIONS[key].map((option) => (
              <label key={option.value} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm text-slate-100 has-checked:border-sky-300 has-checked:bg-sky-400/15 has-focus-visible:ring-2 has-focus-visible:ring-sky-300 has-disabled:cursor-not-allowed has-disabled:opacity-50">
                <input type="radio" name={`${id}-${key}`} value={option.value} checked={draft[key] === option.value}
                  onChange={() => setDraft((current) => ({ ...current, [key]: option.value }))} className="size-4 shrink-0 accent-sky-300" />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {isDirty ? <p role="status" className="mt-4 text-sm text-amber-200">未保存の変更があります</p> : null}
      <Button type="submit" variant="secondary" className="mt-4 min-h-11 w-full" disabled={disabled || !canSave || !isDirty}>テロップ設定を保存</Button>
    </form>
  );
}
