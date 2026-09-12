import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PROJECT_SLIDE_TRANSITION_HELPER_COPY, PROJECT_SLIDE_TRANSITION_STRENGTH_HELPER_COPY } from "@/lib/project-slide-transition";
import { SelectedProjectSlideTransitionForm } from "./project-slide-transition-settings";

const source = readFileSync(new URL("./project-slide-transition-settings.tsx", import.meta.url), "utf8");

describe("selected project slide transition form", () => {
  it("shows nine effect choices, three strengths, and treats 標準 as undefined", () => {
    const html = renderToStaticMarkup(
      <SelectedProjectSlideTransitionForm
        projectTransition={undefined}
        hasProject={true}
        canUpdateSelectedProjectTransition={true}
        isDriveOperationInFlight={false}
        updateSelectedProjectTransitionSettings={vi.fn()}
      />,
    );

    expect(html).toContain("標準");
    expect(html).toContain("なし");
    expect(html).toContain("フェード");
    expect(html).toContain("スライド左");
    expect(html).toContain("スライド右");
    expect(html).toContain("スライド上");
    expect(html).toContain("ワイプ");
    expect(html).toContain("ズーム");
    expect(html).toContain("ぼかし");
    expect(html).toContain("控えめ");
    expect(html).toContain("強め");
    expect(html).toContain("切り替え効果");
    expect(html).toContain("エフェクトの強さ");
    expect(html).not.toContain("<select");
    expect(html.match(/type="radio"/g)).toHaveLength(12);
    expect(html).toContain('value="standard"');
    expect(html).toContain('checked=""');
    expect(html).toContain(PROJECT_SLIDE_TRANSITION_HELPER_COPY);
    expect(html).not.toContain(PROJECT_SLIDE_TRANSITION_STRENGTH_HELPER_COPY);
    expect(html).toContain("min-h-11");
    expect(html).toContain("スライド切り替えを保存");
    expect(html).not.toContain("未保存の変更があります");
  });

  it("shows the saved explicit value after Drive save", () => {
    const html = renderToStaticMarkup(
      <SelectedProjectSlideTransitionForm
        projectTransition="fade"
        projectTransitionStrength="strong"
        hasProject={true}
        canUpdateSelectedProjectTransition={true}
        isDriveOperationInFlight={false}
        updateSelectedProjectTransitionSettings={vi.fn()}
      />,
    );

    expect(html).toContain('value="fade"');
    expect(html).toContain("フェード");
    expect(html).toContain('value="strong"');
  });

  it("displays standard strength for first-phase data and cannot submit unchanged", () => {
    const html = renderToStaticMarkup(
      <SelectedProjectSlideTransitionForm
        projectTransition="fade"
        hasProject={true}
        canUpdateSelectedProjectTransition={true}
        isDriveOperationInFlight={false}
        updateSelectedProjectTransitionSettings={vi.fn()}
      />,
    );

    expect(html).toContain('value="fade"');
    expect(html).toContain('value="standard"');
    expect(html).toContain("disabled");
  });

  it("disables strength for 標準 and なし, and enables it for explicit effects", () => {
    const standardHtml = renderToStaticMarkup(
      <SelectedProjectSlideTransitionForm
        projectTransition={undefined}
        hasProject={true}
        canUpdateSelectedProjectTransition={true}
        isDriveOperationInFlight={false}
        updateSelectedProjectTransitionSettings={vi.fn()}
      />,
    );
    const noneHtml = renderToStaticMarkup(
      <SelectedProjectSlideTransitionForm
        projectTransition="none"
        hasProject={true}
        canUpdateSelectedProjectTransition={true}
        isDriveOperationInFlight={false}
        updateSelectedProjectTransitionSettings={vi.fn()}
      />,
    );
    const explicitHtml = renderToStaticMarkup(
      <SelectedProjectSlideTransitionForm
        projectTransition="wipe"
        hasProject={true}
        canUpdateSelectedProjectTransition={true}
        isDriveOperationInFlight={false}
        updateSelectedProjectTransitionSettings={vi.fn()}
      />,
    );

    const strengthSelect = (html: string) =>
      html.match(/<fieldset[^>]*data-strength-control="true"[^>]*>/)?.[0] ?? "";

    expect(strengthSelect(standardHtml)).toContain("disabled=");
    expect(strengthSelect(noneHtml)).toContain("disabled=");
    expect(strengthSelect(explicitHtml)).not.toContain("disabled=");
  });

  it("disables the control when no album is selected", () => {
    const html = renderToStaticMarkup(
      <SelectedProjectSlideTransitionForm
        projectTransition={undefined}
        hasProject={false}
        canUpdateSelectedProjectTransition={false}
        isDriveOperationInFlight={false}
        updateSelectedProjectTransitionSettings={vi.fn()}
      />,
    );

    expect(html).toContain("disabled");
    expect(html).toContain('disabled=""');
  });

  it("does not auto-save locally from the album transition form", () => {
    const formSource = source.slice(
      source.indexOf("export function SelectedProjectSlideTransitionForm("),
    );
    expect(formSource).not.toContain("startOfflineSync");
    expect(formSource).not.toContain("commitPreparedProjectPublish");
    expect(formSource).toContain("onSubmit={handleSubmit}");
    expect(formSource).toContain('type="submit"');
    expect(formSource).toContain("<ProjectSlideTransitionPicker");
    expect(formSource).not.toContain("PROJECT_SLIDE_TRANSITION_STRENGTH_HELPER_COPY");
    expect(formSource).toContain("updateSelectedProjectTransitionSettings({");
    expect(formSource).toContain("transitionStrength: usesStrength ? strength");
  });
});

describe("transition settings draft feedback", () => {
  it("reports draft differences independently of submit eligibility without adding save timers", () => {
    expect(source).toContain('{isDirty ? (');
    expect(source).toContain('input.canUpdateSelectedProjectTransition && isDirty');
    expect(source).toContain('onDirtyChange?.(isDirty)');
    expect(source).toContain('未保存の変更があります');
    expect(source).toContain('role="status"');
    expect(source).not.toMatch(/setTimeout|setInterval/);
    const effectHandler = source.slice(source.indexOf("function handleEffectChange"), source.indexOf("function handleSubmit"));
    expect(effectHandler).not.toContain("updateSelectedProjectTransitionSettings");
    expect(effectHandler).toContain('if (!nextUsesStrength || !previousUsesStrength)');
    expect(effectHandler).toContain('setStrength("standard")');
  });

  it("retains the project/settings remount key and all Drive readiness gates", () => {
    expect(source).toContain('key={`${projectSummary?.projectId ?? "none"}:${projectTransition ?? "standard"}:${projectTransitionStrength ?? "absent"}`}');
    expect(source).toContain('driveStatus === "ready"');
    expect(source).toContain('projectStatus === "ready"');
    expect(source).toContain('projectSummary !== null');
    expect(source).toContain('!isDriveOperationInFlight');
  });
});
