import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const rootReadme = readRepoFile("README.md");
const docsIndex = readRepoFile("docs/README.md");
const currentContext = readRepoFile("docs/current-context.md");
const releaseRollback = readRepoFile("docs/release-rollback.md");
const abnormalAcceptancePlan = readRepoFile(
  "docs/acceptance/publication-write-abnormal-acceptance-plan.md",
);
const finalizationAcceptance = readRepoFile(
  "docs/acceptance/product-ready-finalization-acceptance.md",
);
const googlePhotosExportAcceptance = readRepoFile(
  "docs/acceptance/google-photos-export-acceptance.md",
);
const authoritativeDocs = [
  rootReadme,
  docsIndex,
  currentContext,
  releaseRollback,
].join("\n");

describe("current documentation contract", () => {
  it("provides a single index for current, historical, and acceptance docs", () => {
    expect(rootReadme).toContain("[`docs/README.md`](docs/README.md)");
    for (const heading of [
      "## まず読む文書",
      "## Current",
      "## Historical",
      "## Acceptance / evidence",
      "## 更新ルール",
    ]) {
      expect(docsIndex).toContain(heading);
    }
    for (const currentDoc of [
      "../README.md",
      "current-context.md",
      "release-rollback.md",
    ]) {
      expect(docsIndex).toContain(currentDoc);
    }
    const acceptanceEvidence = docsIndex.slice(
      docsIndex.indexOf("## Acceptance / evidence"),
      docsIndex.indexOf("## 更新ルール"),
    );
    expect(acceptanceEvidence).toContain(
      "acceptance/product-ready-finalization-acceptance.md",
    );
    expect(acceptanceEvidence).toContain(
      "acceptance/google-photos-export-acceptance.md",
    );
  });

  it("captures the current hosting, package, route, and publication contract", () => {
    expect(currentContext).toContain("Vercel productionのみ");
    expect(currentContext).toContain("pnpm@10.34.4");
    expect(currentContext).toContain("GitHub Pages deployは廃止済み");

    const operations = currentContext.slice(
      currentContext.indexOf("## 現行の運用契約"),
      currentContext.indexOf("## 現在の到達点"),
    );
    expect(operations).toContain("```text\n/\n/settings");
    for (const route of [
      "/settings",
      "/system",
      "/admin",
      "/admin/history",
      "/player",
    ]) {
      expect(operations).toContain(route);
    }
    expect(operations).toContain(
      "`/auth-test`と`/visual-check/*`はproduction App Routerから撤去済み",
    );
    expect(operations).toContain("編集保存とpublishは別操作");
    expect(operations).toContain("manifest.publication.currentRevisionId");
    expect(operations).toContain("新しいrollback revision");
    expect(operations).toContain("明示的offline sync");
    expect(operations).toContain("Googleフォトへ書き出すはDrive publish");
    expect(operations).toContain("multi-tab raceは未解決");
    expect(operations).toContain("production sourceには存在しない");
  });

  it("keeps current video acceptance precise", () => {
    expect(currentContext).toContain("offline Blob cap: 50 MiB");
    expect(currentContext).toContain("約3GB MOV");
    expect(currentContext).toContain("exactly 5GBの実ファイル");
    expect(currentContext).toContain("5GB + 1 byteの実ファイル");
  });

  it("does not use stale hosting, package, route, or manifest guidance", () => {
    expect(authoritativeDocs).not.toMatch(/\bnpm (?:run|install)\b/);
    expect(authoritativeDocs).not.toContain("GITHUB_PAGES=true");
    expect(authoritativeDocs).not.toContain("hamakirin1230.github.io");
    expect(authoritativeDocs).not.toContain("draft.manifest.json");
    expect(authoritativeDocs).not.toContain("published.manifest.json");
    expect(authoritativeDocs).not.toMatch(/C:\\Users\\[^\s`]+/);
  });

  it("marks clearly obsolete top-level docs as historical", () => {
    for (const path of [
      "docs/architecture.md",
      "docs/requirements.md",
      "docs/roadmap.md",
      "docs/risk-register.md",
      "docs/decisions.md",
      "docs/data-flow.md",
      "docs/setup-windows.md",
      "docs/video-playback-design.md",
    ]) {
      const opening = readRepoFile(path).slice(0, 500);
      expect(opening).toContain("Historical document.");
      expect(opening).toContain("docs/README.md");
    }
  });

  it("does not overstate abnormal real-Drive acceptance", () => {
    const status = abnormalAcceptancePlan.slice(
      0,
      abnormalAcceptancePlan.indexOf("## 1."),
    );
    expect(status).toContain("Gate 0承認済み");
    expect(status).toContain("fault harness");
    expect(status).toContain("完全撤去済み");
    expect(status).toContain("production mainへmergeしておらず");
    expect(status).toContain("結果記録がない");
    expect(status).toContain("完了扱いにしない");
  });

  it("records finalization Production acceptance without overstating its scope", () => {
    expect(finalizationAcceptance).toContain(
      "Product-ready finalization accepted in Production, with explicitly recorded remaining unverified/non-blocking items",
    );
    expect(finalizationAcceptance).toContain("PWA new install | 未確認");
    expect(finalizationAcceptance).toContain("mainへfast-forward merge済み");
    expect(finalizationAcceptance).toContain(
      "Vercel Production deploymentがREADYになったことを確認済み",
    );
    expect(finalizationAcceptance).toContain(
      "Production Player playback | OK",
    );
    expect(finalizationAcceptance).toContain(
      "publication abnormal write A/B/C: real Google Drive completion recordなし",
    );
    expect(finalizationAcceptance).toContain(
      "今回実rollbackを実行した記録ではない",
    );
    expect(finalizationAcceptance).toContain(
      "すべての機能、MOV codec、境界条件を完全検証したという意味ではない",
    );
    expect(finalizationAcceptance).not.toContain(
      "すべての機能、MOV codec、境界条件を完全検証済みである",
    );
    expect(currentContext).toContain(
      "product-ready finalization Production acceptanceは完了",
    );
    expect(currentContext).not.toContain(
      "次の操作はmain mergeと、正式なVercel Production deployment後のProduction smoke check",
    );
  });

  it("records Google Photos export Production acceptance without overstating remaining gaps", () => {
    expect(googlePhotosExportAcceptance).toContain(
      "Preview / real Google Photos image-caption acceptance passed.",
    );
    expect(googlePhotosExportAcceptance).toContain(
      "2026-08-21 Production acceptance passed.",
    );
    expect(googlePhotosExportAcceptance).toContain(
      "Production acceptance passed",
    );
    expect(googlePhotosExportAcceptance).not.toContain(
      "Production acceptance not yet performed.",
    );
    expect(googlePhotosExportAcceptance).toContain("photo-1-burned-v1");
    expect(googlePhotosExportAcceptance).toContain("photo-1-burned-v2");
    expect(googlePhotosExportAcceptance).toContain(
      "Productionではv1 / v2差分検証を再実施していない",
    );
    expect(googlePhotosExportAcceptance).toContain("existing installed PWA");
    expect(googlePhotosExportAcceptance).toContain("PWA new install");
    expect(currentContext).toContain("Production accepted");
    expect(currentContext).not.toContain("Production acceptanceは未実施");
    expect(currentContext).toContain("photoslibrary.appendonly");
    expect(currentContext).toContain("include_granted_scopes");
    expect(currentContext).toContain("写真 / 動画件数");
    expect(currentContext).toContain(
      "PlayerはURLの`projectId`を再生対象のauthority",
    );
    expect(currentContext).toContain("access tokenは非永続");
    expect(rootReadme).toContain("画像captionはexport画像にburn-in");
    expect(rootReadme).toContain("Production上の実Google Photos");
    expect(rootReadme).not.toContain("Production acceptanceは未実施");
    expect(rootReadme).toContain("写真 / 動画件数");
    expect(googlePhotosExportAcceptance).toContain(
      "page-load silent token requestは撤去した",
    );
    expect(googlePhotosExportAcceptance).toContain("60分接続維持」は未解決");
    expect(googlePhotosExportAcceptance).toContain('prompt: "none"');
    expect(rootReadme).toContain("refresh後のGoogle接続は、明示的な「Googleへ接続」");
    expect(currentContext).toContain(
      "refresh後のGoogle接続は、明示的な「Googleへ接続」",
    );
    expect(rootReadme).toContain("60分接続維持は未解決");
    expect(currentContext).toContain("60分接続維持は未解決");
    expect(rootReadme).not.toContain("60分tokenを保存");
    expect(currentContext).not.toContain("60分tokenを保存");
    expect(googlePhotosExportAcceptance).not.toContain("60分tokenを保存");
    expect(rootReadme).not.toContain("60分必ず維持");
    expect(currentContext).not.toContain("60分必ず維持");
    expect(rootReadme).not.toContain("best-effort silent restore");
    expect(currentContext).not.toContain("best-effort silent restore");
  });
});
