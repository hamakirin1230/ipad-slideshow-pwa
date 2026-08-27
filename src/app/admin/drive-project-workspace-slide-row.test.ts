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
    expect(source).toContain("onDelete(slideId, event.currentTarget)");
    expect(source).toContain("updateProjectSlideDuration");
    expect(source).toContain("updateProjectSlideCaption");
    expect(openingButton(source, 'onClick={() => onMove(slideId, "up")}')).toContain(
      "min-h-11",
    );
    expect(
      openingButton(source, 'onClick={() => onMove(slideId, "up")}'),
    ).toContain("min-w-11");
    expect(
      openingButton(source, 'onClick={() => onMove(slideId, "down")}'),
    ).toContain("min-h-11");
    expect(
      openingButton(source, "onClick={handleDeleteSelectedSlides}"),
    ).toContain("min-h-11");
    expect(
      openingButton(source, "onDelete(slideId, event.currentTarget)"),
    ).toContain("min-h-11");
  });

  it("compacts mobile reorder controls while keeping desktop labels", () => {
    const reorder = functionBody("SlideReorderControls");
    const duplicate = functionBody("SlideSingleActions");

    expect(reorder).toContain('aria-label="このスライドを上へ移動"');
    expect(reorder).toContain('aria-label="このスライドを下へ移動"');
    expect(reorder).toContain("min-h-11 min-w-11 px-0 sm:w-auto sm:px-2.5");
    expect(reorder).toContain('<span className="hidden sm:inline"> 上へ</span>');
    expect(reorder).toContain('<span className="hidden sm:inline"> 下へ</span>');
    expect(reorder).toContain("flex flex-wrap items-center gap-2");
    expect(reorder).not.toContain("flex-col");
    expect(source).toContain("flex flex-wrap items-start gap-2 xl:contents");
    expect(duplicate).toContain("void onDuplicate(slideId)");
    expect(duplicate).toContain("min-h-11 min-w-11 px-2.5");
    expect(duplicate).not.toContain("w-full");
  });

  it("adds a single-slide delete action beside duplicate without replacing bulk delete", () => {
    const actions = functionBody("SlideSingleActions");

    expect(actions).toContain("void onDuplicate(slideId)");
    expect(actions).toContain("onDelete(slideId, event.currentTarget)");
    expect(actions).toContain('aria-label="このスライドを削除"');
    expect(actions).toContain('title="このスライドを削除"');
    expect(actions).toContain('variant="destructive"');
    expect(actions).toContain("flex flex-wrap items-center gap-2");
    expect(actions).not.toContain("flex-col");
    expect(openingButton(actions, "onDelete(slideId, event.currentTarget)")).toContain(
      "min-h-11",
    );
    expect(openingButton(actions, "onDelete(slideId, event.currentTarget)")).toContain(
      "min-w-11",
    );
    expect(source).toContain("function handleDeleteSingleSlide(");
    expect(source).toContain("setPendingDeleteSlideIds([slideId])");
    expect(source).toContain("const ok = await deleteProjectSlides(slideIdsToDelete)");
    expect(source).toContain("onClick={handleDeleteSelectedSlides}");
    expect(source).toContain('disabled={!canDeleteSelectedSlides}');
    expect(source).toContain("選択したスライドを削除");
    expect(source).toContain("onDuplicate={duplicateProjectSlide}");
    expect(source).toContain("onDelete={handleDeleteSingleSlide}");
    expect(source).toContain("<ProductAlertDialog");
    expect(source).not.toContain("window.confirm");
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
