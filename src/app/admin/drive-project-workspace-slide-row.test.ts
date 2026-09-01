import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./drive-project-workspace-panel.tsx", import.meta.url),
  "utf8",
);
const imageEditorSource = readFileSync(
  new URL("./project-slide-image-editor-dialog.tsx", import.meta.url),
  "utf8",
);

describe("compact slide editing rows", () => {
  it("owns caption, duration, and imageEdit in one validated draft", () => {
    const editor = functionBody("SlideEditForm");

    expect(editor).toContain("draftCaption");
    expect(editor).toContain("draftDurationSeconds");
    expect(editor).toContain("draftImageEdit");
    expect(editor).toContain("parseSlideDurationSeconds");
    expect(editor).toContain("parsedDurationSeconds !== slide.durationSeconds");
    expect(editor).toContain("parseProjectSlideImageEdit");
    expect(editor).toContain("SLIDE_CAPTION_MAX_LENGTH");
    expect(editor).toContain('aria-label="スライドの表示時間"');
    expect(editor).toContain('aria-label="テロップ"');
    expect(editor).toContain("未保存");
    expect(editor).toContain("submitGuardRef.current");
    expect(editor).toContain("await onSave({");
    expect(editor).toContain('className="min-h-11"');
    expect(editor).toContain('"変更を保存"');
    expect(editor).not.toContain("表示時間を保存");
    expect(editor).not.toContain("テロップを保存");
    expect(source.match(/変更を保存/g)).toHaveLength(1);
    expect(source).not.toContain("表示時間を保存");
    expect(source).not.toContain("テロップを保存");
    expect(source).toContain("key={slideEditFormKey(slide)}");
    expect(source).toContain("slide.durationSeconds");
    expect(source).toContain("slide.imageEdit ?? null");
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
    expect(source).toContain("updateProjectSlideEdits");
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

  it("offers non-destructive image editing only for image rows", () => {
    expect(source).toContain(
      'getAssetTypeLabel(slide.type) === "image" ? (',
    );
    expect(source).toContain("<ProjectSlideImageEditorButton");
    expect(source).toContain("onSave={updateProjectSlideEdits}");
    expect(imageEditorSource).toContain("画像を編集");
    expect(imageEditorSource).toContain("左に回転");
    expect(imageEditorSource).toContain("右に回転");
    expect(imageEditorSource).toContain("リセット");
    expect(imageEditorSource).toContain("キャンセル");
    expect(imageEditorSource).toContain("編集内容を反映");
    expect(imageEditorSource).not.toContain("画像編集を保存");
    expect(imageEditorSource).toContain("size-11");
    expect(imageEditorSource).toContain("!changed ||");
    expect(imageEditorSource).toContain("isBlocked ||");
  });

  it("keeps the existing reorder controls available on the desktop path", () => {
    const reorder = functionBody("SlideReorderControls");
    const duplicate = functionBody("SlideSingleActions");

    expect(reorder).toContain('aria-label="このスライドを上へ移動"');
    expect(reorder).toContain('aria-label="このスライドを下へ移動"');
    expect(reorder).toContain("min-h-11 min-w-11 px-0 sm:w-auto sm:px-2.5");
    expect(reorder).toContain('<span className="hidden sm:inline"> 上へ</span>');
    expect(reorder).toContain('<span className="hidden sm:inline"> 下へ</span>');
    expect(reorder).toContain("flex flex-wrap items-center gap-2");
    expect(reorder).not.toContain("flex-col");
    expect(source).toContain('<div className="hidden xl:contents">');
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
