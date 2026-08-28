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
const googleSessionProductionAcceptance = readRepoFile(
  "docs/acceptance/google-session-production-acceptance.md",
);
const googleSessionPreviewAcceptance = readRepoFile(
  "docs/acceptance/google-session-preview-acceptance.md",
);
const projectDeletePreviewAcceptance = readRepoFile(
  "docs/acceptance/project-delete-preview-acceptance.md",
);
const projectDeleteProductionAcceptance = readRepoFile(
  "docs/acceptance/project-delete-production-acceptance.md",
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
    expect(acceptanceEvidence).toContain(
      "acceptance/google-session-preview-acceptance.md",
    );
    expect(acceptanceEvidence).toContain(
      "acceptance/google-session-production-acceptance.md",
    );
    expect(acceptanceEvidence).toContain(
      "acceptance/project-delete-preview-acceptance.md",
    );
    expect(acceptanceEvidence).toContain(
      "acceptance/project-delete-production-acceptance.md",
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
    expect(operations).toContain("Web Locks APIでsame-origin multi-tab排他");
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
    expect(currentContext).toContain("Google Photos export is images-only");
    expect(googlePhotosExportAcceptance).toContain(
      "Google Photos export is images-only",
    );
    expect(googlePhotosExportAcceptance).toContain(
      "2026-08-21 images-only + caption normalization Preview acceptance passed.",
    );
    expect(googlePhotosExportAcceptance).toContain(
      "2026-08-21 images-only + caption normalization Production acceptance passed.",
    );
    expect(googlePhotosExportAcceptance).toContain("書き出す写真 5件");
    expect(googlePhotosExportAcceptance).toContain("対象外の動画 1件");
    expect(googlePhotosExportAcceptance).toContain(
      "もっちゅりんが美味しかった",
    );
    expect(googlePhotosExportAcceptance).toContain(
      "実機acceptanceは未実施のまま",
    );
    expect(googlePhotosExportAcceptance).not.toContain(
      "images-only仕様のProduction再acceptance",
    );
    expect(currentContext).toContain("images-only Preview acceptance passed");
    expect(currentContext).toContain(
      "images-only + caption normalization Production acceptance passed",
    );
    expect(currentContext).toContain("font sizeはimageHeight基準");
    expect(currentContext).not.toContain(
      "images-only仕様のPreview / Production再acceptanceは未実施",
    );
    expect(currentContext).not.toContain(
      "images-only仕様のProduction再acceptanceは未実施",
    );
    expect(currentContext).toContain("Phase 2 server-only primitivesは実装済み");
    expect(currentContext).not.toContain("Phase 2は停止中");
    expect(currentContext).not.toContain("Phase 2 server-only crypto primitivesは未着手");
    expect(currentContext).toContain("Phase 3 service / store / HTTP implemented");
    expect(currentContext).toContain("Phase 4 browser restore implemented");
    expect(currentContext).toContain("Preview functional acceptance PASS");
    expect(currentContext).toContain("Production functional acceptance PASS");
    expect(currentContext).toContain("実時間absolute-expiry境界の実機確認は未実施");
    expect(currentContext).not.toContain("Productionはまだ旧mainでsession機能未反映");
    expect(currentContext).not.toContain("session本体は実装済みではない");
    expect(currentContext).not.toContain("Phase 3へは進んでいない");
    expect(currentContext).toContain("Photos OAuthは変更していない");
    expect(rootReadme).not.toContain("images-only仕様のPreview確認は未実施");
    expect(rootReadme).not.toContain(
      "images-only仕様のProduction再acceptanceは未実施",
    );
    expect(rootReadme).toContain("images-only + caption normalizationのPreview確認済み");
    expect(rootReadme).toContain("images-only + caption normalizationのProduction確認済み");
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
    expect(rootReadme).toContain("same-origin session restore");
    expect(rootReadme).toContain("Production functional acceptance済み");
    expect(rootReadme).not.toContain("60分接続維持は未解決");
    expect(rootReadme).not.toContain("session本体は実装済みではない");
    expect(currentContext).toContain("page loadでGIS");
    expect(currentContext).toContain("live pageを60分で強制logoutする機能ではない");
    expect(currentContext).toContain("Phase 1 hosting migrationはPASS");
    expect(currentContext).toContain('output:"export"');
    expect(currentContext).not.toContain("Gate 0 PASS");
    expect(currentContext).toContain("google-session-production-acceptance.md");
    expect(docsIndex).toContain("design/google-connection-60-minute-session.md");
    expect(docsIndex).toContain("## Design in progress");
    expect(docsIndex).toContain("Preview functional acceptance passed 2026-08-22");
    expect(docsIndex).toContain("Production functional acceptance passed 2026-08-22");
    expect(rootReadme).not.toContain("60分tokenを保存");
    expect(currentContext).not.toContain("60分tokenを保存");
    expect(googlePhotosExportAcceptance).not.toContain("60分tokenを保存");
    expect(rootReadme).not.toContain("60分必ず維持");
    expect(currentContext).not.toContain("60分必ず維持");
    expect(rootReadme).not.toContain("best-effort silent restore");
    expect(currentContext).not.toContain("best-effort silent restore");
  });

  it("records Google Drive session Production acceptance without overstating remaining gaps", () => {
    expect(googleSessionProductionAcceptance).toContain("Date: 2026-08-22");
    expect(googleSessionProductionAcceptance).toContain(
      "Production functional acceptance PASS",
    );
    expect(googleSessionProductionAcceptance).toContain(
      "server-side short-lived Drive session",
    );
    expect(googleSessionProductionAcceptance).toContain(
      "page loadではGIS `requestAccessToken`を呼ばない",
    );
    expect(googleSessionProductionAcceptance).toContain("手動connectのみ");
    expect(googleSessionProductionAcceptance).toContain("`accessTokenRef`のみ");
    expect(googleSessionProductionAcceptance).toContain(
      "auto read-only Drive workspace validation",
    );
    expect(googleSessionProductionAcceptance).toContain("explicit disconnect");
    expect(googleSessionProductionAcceptance).toContain(
      "Photos OAuth / session isolation",
    );
    expect(googleSessionProductionAcceptance).toContain(
      "Production runtime create / restore / delete が200",
    );
    expect(googleSessionProductionAcceptance).toContain(
      "server runtime error / warning / fatalなし",
    );
    expect(googleSessionProductionAcceptance).toContain(
      "実時間でsession absolute expiryを跨いだ実機確認",
    );
    expect(googleSessionProductionAcceptance).toContain(
      "live pageを60分で強制logoutする機能",
    );
    expect(googleSessionProductionAcceptance).toContain(
      "authorization code flow / refresh token",
    );
    expect(googleSessionProductionAcceptance).toContain(
      "同じFree Upstash resourceを共有する",
    );
    expect(googleSessionProductionAcceptance).toContain(
      "`GOOGLE_SESSION_ENCRYPTION_KEY`はenvironment別である",
    );
    expect(googleSessionProductionAcceptance).toContain(
      "Redis / token / key / cookie / session ID / Drive ID / temporary deployment URLの値は記録しない",
    );
    expect(googleSessionPreviewAcceptance).toContain(
      "Preview functional acceptance PASS",
    );
    expect(googleSessionPreviewAcceptance).toContain(
      "This document is Preview evidence only",
    );
    expect(currentContext).toContain("同じFree Upstash resourceを共有する");
    expect(currentContext).toContain(
      "`GOOGLE_SESSION_ENCRYPTION_KEY`はenvironment別である",
    );
    expect(currentContext).not.toContain("session機能未反映");
    expect(rootReadme).not.toContain("session機能未反映");
  });

  it("records project delete Preview acceptance as Preview evidence only", () => {
    expect(projectDeletePreviewAcceptance).toContain("Date: 2026-08-22");
    expect(projectDeletePreviewAcceptance).toContain("Preview PASS");
    expect(projectDeletePreviewAcceptance).toContain(
      "This document remains Preview evidence only",
    );
    expect(projectDeletePreviewAcceptance).toContain("作品を削除");
    expect(projectDeletePreviewAcceptance).toContain(
      "Drive完全成功後だけ、このiPadの同一作品コピーを連動削除する",
    );
    expect(projectDeletePreviewAcceptance).toContain(
      "Google Photos exportは削除対象外",
    );
    expect(projectDeletePreviewAcceptance).toContain(
      "削除前に、対象作品の「このiPad」保存コピーが実在すること",
    );
    expect(projectDeletePreviewAcceptance).toContain(
      "real-device failure injectionを実施していない",
    );
    expect(projectDeletePreviewAcceptance).toContain(
      "Google Drive UIでTrashフォルダを目視確認した記録はない",
    );
    expect(projectDeletePreviewAcceptance).toContain(
      "このPreview functional acceptanceをProduction confirmationへ昇格させない",
    );
    expect(projectDeletePreviewAcceptance).toContain(
      "実時間でGoogle session absolute expiryを跨いだ実機確認",
    );
    expect(projectDeletePreviewAcceptance).toContain(
      "Google Photos video-only 0-photo実機acceptance",
    );
    expect(projectDeletePreviewAcceptance).not.toContain("vercel.app");
    expect(projectDeletePreviewAcceptance).not.toMatch(/\bdpl_[A-Za-z0-9]+\b/);
    expect(currentContext).toContain("project-delete-preview-acceptance.md");
    expect(docsIndex).toContain("acceptance/project-delete-preview-acceptance.md");
    expect(rootReadme).toContain("project-delete-preview-acceptance.md");
  });

  it("records project delete Production acceptance without promoting failure injection", () => {
    expect(projectDeleteProductionAcceptance).toContain("Date: 2026-08-22");
    expect(projectDeleteProductionAcceptance).toContain(
      "Production destructive acceptance PASS",
    );
    expect(projectDeleteProductionAcceptance).toContain("作品を削除");
    expect(projectDeleteProductionAcceptance).toContain(
      "Google Drive上の選択中作品だけを削除する",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "project rootは永久DELETEではなくDrive Trashである",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "Drive完全成功後だけ、このiPadの同一作品コピーを削除する",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "Google Photos exportは削除対象外である",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "standaloneの「このiPadのコピーを削除」は、Driveを消さずlocal copyだけ消す別機能として残る",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "他作品へsilent fallback / auto-selectしない",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "automatic retry / repair / rollbackなし",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "Google Drive UIで対象project rootがTrashにあることを目視確認",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "このProduction acceptanceでは、Google Drive UIで削除対象project rootがTrashにあることを目視確認済みである",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      '`status === "completed"` かつ `indexRemoved === true` かつ `projectRootTrashed === true` かつ `authRequired === false`',
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "local clear failure時もDrive成功をrollbackしない",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "このProduction acceptanceではreal-device failure injectionを実施していない",
    );
    expect(projectDeleteProductionAcceptance).toContain("preflight block");
    expect(projectDeleteProductionAcceptance).toContain(
      "stale owner / selection change",
    );
    expect(projectDeleteProductionAcceptance).toContain("index write failure");
    expect(projectDeleteProductionAcceptance).toContain("trash partialFailure");
    expect(projectDeleteProductionAcceptance).toContain(
      "post-index 401 / 403 `authRequired` partialFailure",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "local IndexedDB clear failure",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "ambiguous Drive response",
    );
    expect(projectDeleteProductionAcceptance).toContain("retry / rollback禁止");
    expect(projectDeleteProductionAcceptance).toContain(
      "Production PASS項目へ昇格させない",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "実時間でGoogle session absolute expiryを跨いだ実機確認",
    );
    expect(projectDeleteProductionAcceptance).toContain(
      "Google Photos video-only 0-photo実機acceptance",
    );
    expect(projectDeleteProductionAcceptance).not.toContain("vercel.app");
    expect(projectDeleteProductionAcceptance).not.toMatch(/\bdpl_[A-Za-z0-9]+\b/);
    expect(currentContext).toContain("Preview PASS / Production PASS");
    expect(currentContext).not.toContain("Production未確認");
    expect(currentContext).toContain(
      "project-delete-production-acceptance.md",
    );
    expect(docsIndex).toContain(
      "acceptance/project-delete-production-acceptance.md",
    );
    expect(rootReadme).toContain("Production実機acceptance済み");
    expect(rootReadme).not.toContain("Production未確認");
    expect(rootReadme).toContain(
      "docs/acceptance/project-delete-production-acceptance.md",
    );
    expect(currentContext).toContain(
      "実時間でsession absolute expiryを跨いだ実機確認",
    );
    expect(currentContext).toContain("動画だけの作品の実機acceptanceは未実施");
  });
});
