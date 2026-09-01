import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./drive-project-workspace-panel.tsx", import.meta.url),
  "utf8",
);

describe("mobile and tablet slide editor", () => {
  it("uses compact grid cards below xl while keeping the desktop grid path", () => {
    const sortableRow = functionBody("SortableSlideRow");

    expect(sortableRow).toContain(
      "grid min-w-0 grid-cols-[auto_minmax(0,1fr)]",
    );
    expect(sortableRow).toContain(
      "xl:grid-cols-[3rem_4rem_8rem_minmax(0,1fr)",
    );
    expect(source).toContain("data-mobile-slide-card-grid");
    expect(source).toContain(
      "grid min-w-0 gap-3 md:grid-cols-2 xl:block",
    );
    expect(source).toContain(
      'className="hidden gap-2 bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid',
    );
    expect(source).not.toContain(
      'className="grid gap-2 bg-slate-100 px-3 py-1.5',
    );
    expect(source).toContain(
      'className="min-w-0 xl:overflow-hidden xl:rounded-xl',
    );
  });

  it("shows a thumbnail, summary, edit trigger, and accessible drag handle", () => {
    expect(source).toContain('size="card"');
    expect(source).toContain("line-clamp-2 min-w-0 basis-full");
    expect(source).toContain("{slide.durationSeconds}秒");
    expect(source).toContain("画像編集あり");
    expect(source).toContain('編集 <span aria-hidden="true">›</span>');
    expect(source).not.toContain(">\n                                  スライドを編集\n");
    expect(source).toContain('aria-label={`スライド ${index + 1} を編集`}');
    expect(source).toContain('aria-label="ドラッグして並び替え"');
    expect(source).toContain("inline-flex size-11 items-center justify-center");
  });

  it("keeps inline editors on xl and avoids a full-width mobile edit action", () => {
    expect(source).toContain('<div className="hidden xl:contents">');
    expect(source).toContain(
      '<div className="hidden space-y-2 xl:block">',
    );
    expect(source).toContain("<SlideEditForm");
    expect(source).toContain("<SlideSingleActions");
    expect(source).toContain(
      'className="min-h-11 min-w-11 px-3 text-slate-700"',
    );
    expect(source).not.toContain("min-h-11 w-full basis-full xl:hidden");
  });

  it("shows selection controls only after entering selection mode", () => {
    expect(source).toContain("isMobileSelectionMode ? (");
    expect(source).toContain("onClick={startMobileSelectionMode}");
    expect(source).toContain("onClick={cancelMobileSelectionMode}");
    expect(source).toContain("{selectedCount}件選択中");
    expect(source).toContain("選択したスライドを削除");
    expect(source).toContain(
      '? "absolute left-3 top-3 z-20 flex min-h-11 min-w-11',
    );
    expect(source).toContain(
      '? "absolute left-4 top-16 z-10 rounded-full',
    );
    expect(source).toContain(
      '<span className="absolute left-16 top-3 z-10 md:left-24 xl:static">',
    );
    expect(source).toContain("disabled={isMobileSelectionMode}");
  });

  it("uses a grid-aware drag strategy without changing reorder persistence", () => {
    expect(source).toContain("rectSortingStrategy");
    expect(source).toContain("strategy={rectSortingStrategy}");
    expect(source).toContain("sortableKeyboardCoordinates");
    expect(source).toContain(
      "orderedSlideIds: arrayMove(current.orderedSlideIds, oldIndex, newIndex)",
    );
    expect(source).toContain(
      "const ok = await reorderProjectSlidesByDrag(nextOrderedSlideIds)",
    );
    expect(source).toContain("orderedSlideIds: current.sourceSlideIds");
  });

  it("gives card content the remaining width without mobile fixed table columns", () => {
    const sortableRow = functionBody("SortableSlideRow");

    expect(sortableRow).toContain("grid-cols-[auto_minmax(0,1fr)]");
    expect(source).toContain(
      '<div className="flex min-w-0 flex-col xl:block">',
    );
    expect(source).toContain("line-clamp-2 min-w-0 basis-full");
    expect(source).not.toContain("md:grid-cols-[3rem_");
  });

  it("provides touch-first duration and caption editing in the detail dialog", () => {
    const detail = functionBody("MobileSlideDetailEditor");
    const editor = functionBody("SlideEditForm");

    expect(detail).toContain('data-mobile-slide-detail');
    expect(detail).toContain('<SlideEditForm');
    expect(editor).toContain('aria-label="表示時間を1秒減らす"');
    expect(editor).toContain('aria-label="表示時間を1秒増やす"');
    expect(editor).toContain("DRIVE_PROJECT_SLIDE_DURATION_MIN_SECONDS");
    expect(editor).toContain("DRIVE_PROJECT_SLIDE_DURATION_MAX_SECONDS");
    expect(editor).toContain('rows={variant === "detail" ? 5 : 1}');
    expect(editor).toContain("SLIDE_CAPTION_MAX_LENGTH");
    expect(editor).toContain("変更を保存");
    expect(editor).not.toContain("表示時間を保存");
    expect(editor).not.toContain("テロップを保存");
  });

  it("offers image editing for images only", () => {
    const editor = functionBody("SlideEditForm");

    expect(editor).toContain(
      'getAssetTypeLabel(slide.type) === "image" ? (',
    );
    expect(editor).toContain("<ProjectSlideImageEditorButton");
    expect(editor).toContain("onChange={setDraftImageEdit}");
  });

  it("keeps detail structure and unrelated actions unchanged", () => {
    const detail = functionBody("MobileSlideDetailEditor");

    expect(detail).toContain("min-h-svh");
    expect(detail).toContain(
      "md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]",
    );
    expect(detail).toContain("<SlideEditForm");
    expect(detail).toContain("void onDuplicate(slide.slideId)");
    expect(detail).toContain("onDelete(slide.slideId, event.currentTarget)");
  });

  it("preserves duplicate and confirmed destructive delete actions", () => {
    const detail = functionBody("MobileSlideDetailEditor");

    expect(detail).toContain("void onDuplicate(slide.slideId)");
    expect(detail).toContain("onDelete(slide.slideId, event.currentTarget)");
    expect(detail).toContain('variant="destructive"');
    expect(source).toContain("<ProductAlertDialog");
    expect(source).toContain("このスライドを削除しますか？");
    expect(source).toContain("Google Drive上の素材ファイルは削除しません。");
    expect(source).not.toContain("window.confirm");
  });

  it("uses an iPad two-column detail and safe-area sticky actions", () => {
    const detail = functionBody("MobileSlideDetailEditor");

    expect(detail).toContain(
      "md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]",
    );
    expect(detail).toContain('data-mobile-slide-detail-actions');
    expect(detail).toContain("sticky bottom-0");
    expect(detail).toContain(
      'paddingBottom: "max(1rem, env(safe-area-inset-bottom))"',
    );
  });
});

function functionBody(name: string) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}
