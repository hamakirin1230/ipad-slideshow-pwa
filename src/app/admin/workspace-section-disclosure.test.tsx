import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectSlideTransitionSettings } from "./project-slide-transition-settings";
import { WorkspaceSectionDisclosure } from "./workspace-section-disclosure";

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/app/app-providers", () => ({
  useAppState: () => ({
    driveStatus: "ready",
    projectStatus: "ready",
    projectSummary: { projectId: "fixture" },
    projectTransition: undefined,
    projectTransitionStrength: undefined,
    isDriveOperationInFlight: false,
    updateSelectedProjectTransitionSettings: save,
  }),
}));

describe("workspace section disclosure", () => {
  it("defaults to closed while rendering editable children inside native details", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSectionDisclosure label="設定" headingId="settings">
        <input aria-label="編集内容" defaultValue="保持するdraft" />
      </WorkspaceSectionDisclosure>,
    );

    expect(html.match(/<details[^>]*>/)?.[0]).not.toContain("open=");
    expect(html).toMatch(/<details[\s\S]*<summary[\s\S]*<\/summary>[\s\S]*<input[\s\S]*<\/details>/);
    expect(html).toContain('value="保持するdraft"');
  });

  it.each([0, 2, 50])("supports an initially open list with %i slides", (count) => {
    const html = renderToStaticMarkup(
      <WorkspaceSectionDisclosure
        label={`スライド一覧（${count}件）`}
        headingId="slides"
        defaultOpen
      >
        <p>一覧の内容</p>
      </WorkspaceSectionDisclosure>,
    );

    expect(html.match(/<details[^>]*>/)?.[0]).toContain('open=""');
    expect(html).toContain(`スライド一覧（${count}件）`);
    expect(html).toContain('aria-labelledby="slides"');
    expect(html).toContain('<h3 id="slides"');
  });

  it("provides a full summary target, visible focus and decorative state chevron without a help icon", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSectionDisclosure label="設定" headingId="settings">
        内容
      </WorkspaceSectionDisclosure>,
    );

    const summary = html.match(/<summary[^>]*>/)?.[0];
    expect(summary).toContain("min-h-11");
    expect(summary).toContain("cursor-pointer");
    expect(summary).toContain("focus-visible:ring-2");
    expect(summary).toContain("focus-visible:ring-sky-300");
    expect(html).toContain("group-open/section:rotate-180");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).not.toContain("circle-help");
    expect(html).not.toContain("<button");
  });

  it("initially hides the real transition settings while keeping every effect mounted and never saving", () => {
    const html = renderToStaticMarkup(<ProjectSlideTransitionSettings />);

    expect(html).toContain("スライド全体の設定");
    expect(html.match(/<details[^>]*>/)?.[0]).not.toContain("open=");
    expect(html.match(/data-effect="/g)).toHaveLength(9);
    expect(html).toContain("スライド切り替えを保存");
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps import always visible and the live-count slide list initially open", () => {
    const source = readFileSync(new URL("./drive-project-workspace-panel.tsx", import.meta.url), "utf8");
    const importSection = source.slice(source.indexOf('<section aria-labelledby="asset-import-heading"'), source.indexOf("<ProjectSlideTransitionSettings />"));

    expect(importSection).toContain("<AssetImportPanel />");
    expect(importSection).not.toContain("Disclosure");
    expect(source).toMatch(/<WorkspaceSectionDisclosure\s+label=\{`スライド一覧（\$\{slideCount \?\? 0\}件）`\}\s+headingId="slide-editor-heading"\s+defaultOpen/);
  });
});
