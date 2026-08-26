import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./drive-project-workspace-panel.tsx", import.meta.url),
  "utf8",
);

describe("compact slide editing rows", () => {
  it("keeps duration editing on one row without helper copy", () => {
    const duration = functionBody("SlideDurationEditor");

    expect(duration).not.toContain(
      '<p className="font-medium text-slate-900">表示時間</p>',
    );
    expect(duration).toContain('aria-label="スライドの表示時間"');
    expect(duration).toContain("<span className=\"text-sm text-slate-700\">秒</span>");
    expect(duration).not.toContain("画像スライドの自動送り秒数として保存します。");
    expect(duration).not.toContain("この端末への保存後に再生へ反映");
    expect(duration).not.toContain("動画は現在、再生終了で次へ進みます");
    expect(duration).toContain("未保存");
    expect(duration).toContain("表示時間を入力してください。");
    expect(duration).toContain("DRIVE_PROJECT_SLIDE_DURATION_MIN_SECONDS");
    expect(duration).toContain("DRIVE_PROJECT_SLIDE_DURATION_MAX_SECONDS");
    expect(duration).toContain('className="min-h-11"');
    expect(duration).toContain("onSave(slideId, parsedDurationSeconds)");
  });

  it("keeps caption editing compact and accessible", () => {
    const caption = functionBody("SlideCaptionEditor");

    expect(caption).not.toContain(
      '<p className="font-medium text-slate-900">テロップ</p>',
    );
    expect(caption).toContain('aria-label="テロップ"');
    expect(caption).toContain('placeholder="テロップを入力"');
    expect(caption).toContain("rows={1}");
    expect(caption).toContain("resize-none");
    expect(caption).toContain("min-h-11");
    expect(caption).toContain("SLIDE_CAPTION_MAX_LENGTH");
    expect(caption).toContain("未保存");
    expect(caption).toContain("onSave(slideId, normalizedDraftCaption)");
  });

  it("does not shrink existing slide row touch targets or operations", () => {
    expect(source).toContain('aria-label="ドラッグして並び替え"');
    expect(source).toContain(
      "inline-flex size-11 items-center justify-center",
    );
    expect(source).toContain('onClick={() => onMove(slideId, "up")}');
    expect(source).toContain('onClick={() => onMove(slideId, "down")}');
    expect(source).toContain("onClick={handleDeleteSelectedSlides}");
    expect(source).toContain("void onDuplicate(slideId)");
    expect(source).toContain("updateProjectSlideDuration");
    expect(source).toContain("updateProjectSlideCaption");
    expect(openingButton(source, 'onClick={() => onMove(slideId, "up")}')).toContain(
      "min-h-11",
    );
    expect(
      openingButton(source, "onClick={handleDeleteSelectedSlides}"),
    ).toContain("min-h-11");
  });
});

function functionBody(name: string) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

function openingButton(componentSource: string, handler: string) {
  const handlerIndex = componentSource.indexOf(handler);
  expect(handlerIndex).toBeGreaterThanOrEqual(0);
  const start = componentSource.lastIndexOf("<Button", handlerIndex);
  const end = componentSource.indexOf(">", handlerIndex);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(handlerIndex);
  return componentSource.slice(start, end + 1);
}
