import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT_SLIDE_CAPTION_STYLE as defaults } from "@/lib/project-slide-caption-style";
import { SelectedProjectSlideCaptionStyleForm } from "./project-slide-caption-style-settings";

describe("caption style settings", () => {
  it("renders four native groups with 3/2/3/3 options and a local preview", () => {
    const onSave = vi.fn();
    const html = renderToStaticMarkup(<SelectedProjectSlideCaptionStyleForm disabled={false} canSave onSave={onSave} />);
    expect(html.match(/<fieldset/g)).toHaveLength(4);
    expect([...html.matchAll(/<fieldset[\s\S]*?<\/fieldset>/g)].map(([group]) => group.match(/type="radio"/g)?.length)).toEqual([3, 2, 3, 3]);
    for (const label of ["位置", "形", "文字サイズ", "配色", "サンプルテロップ", "テロップ設定を保存"]) expect(html).toContain(label);
    expect(html).toContain("min-h-11");
    expect(html).toContain("has-focus-visible:ring-2");
    expect(html).not.toMatch(/<img|<video|https?:|type="color"/);
    expect(onSave).not.toHaveBeenCalled();
  });
  it("starts effectively clean for absent and explicit defaults", () => {
    for (const savedStyle of [undefined, defaults]) {
      const html = renderToStaticMarkup(<SelectedProjectSlideCaptionStyleForm savedStyle={savedStyle} disabled={false} canSave onSave={vi.fn()} />);
      expect(html).not.toContain("未保存の変更があります");
      expect(html).toMatch(/<button[^>]*disabled=""/);
      expect(html.match(/checked=""/g)).toHaveLength(4);
    }
  });
});
