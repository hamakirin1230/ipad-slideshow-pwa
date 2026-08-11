import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildLocalOfflineProjectClearConfirmation,
  getUserFacingOperationFailureMessage,
  sanitizeUserFacingDiagnostic,
  type UserFacingOperationFailure,
} from "@/lib/user-facing-diagnostics";

const PROJECT_ID = "PROJECT_SECRET_SENTINEL_FULL_ID";
const REVISION_ID = "REVISION_SECRET_SENTINEL_FULL_ID";
const ASSET_ID = "ASSET_SECRET_SENTINEL_FULL_ID";
const RAW_ERROR = "RAW_ERROR_SECRET_SENTINEL";
const BEARER = "Bearer SECRET_SENTINEL";
const RAW_URL = "https://secret.invalid/internal";

const source = {
  provider: read("./app-providers.tsx"),
  publish: read("./admin/project-publish-panel.tsx"),
  history: read("./admin/history/publish-history-client.tsx"),
  confirmedStore: read("./admin/offline-confirmed-store-panel.tsx"),
  offlineDb: read("./settings/offline-db-check-panel.tsx"),
  settings: read("./settings/drive-settings-panel.tsx"),
  player: read("./player/page.tsx"),
  workspace: read("./admin/drive-project-workspace-panel.tsx"),
  serviceWorker: read("./service-worker-registration.tsx"),
};

describe("production diagnostics presentation boundary", () => {
  it("redacts sentinel identifiers, credentials, URLs, and raw errors from rendered text", () => {
    const raw = [
      `projectId: ${PROJECT_ID}`,
      `revisionId: ${REVISION_ID}`,
      `assetId: ${ASSET_ID}`,
      RAW_ERROR,
      BEARER,
      RAW_URL,
    ].join(" | ");
    const markup = renderToStaticMarkup(
      <div role="alert">{sanitizeUserFacingDiagnostic(raw)}</div>,
    );

    for (const sentinel of [
      PROJECT_ID,
      REVISION_ID,
      ASSET_ID,
      RAW_ERROR,
      BEARER,
      RAW_URL,
    ]) {
      expect(markup).not.toContain(sentinel);
    }
  });

  it("does not echo caught Error.message for user-facing operations", () => {
    const operations: UserFacingOperationFailure[] = [
      "offlineDbCheck",
      "confirmedStoreCheck",
      "localProjectClear",
      "storageManagementCheck",
      "appShellCacheClear",
      "assetImport",
    ];
    const error = new Error(`${RAW_ERROR} ${BEARER} ${RAW_URL}`);

    for (const operation of operations) {
      const markup = renderToStaticMarkup(
        <p>{getUserFacingOperationFailureMessage(operation, error)}</p>,
      );
      expect(markup).not.toContain(RAW_ERROR);
      expect(markup).not.toContain("SECRET_SENTINEL");
      expect(markup).not.toContain(RAW_URL);
    }
  });

  it("keeps the full project ID out of the destructive confirmation", () => {
    const confirmation = buildLocalOfflineProjectClearConfirmation({
      projectId: PROJECT_ID,
      projectTitle: "公開用プロジェクト",
    });

    expect(confirmation).toContain("対象プロジェクト: 公開用プロジェクト");
    expect(confirmation).not.toContain(PROJECT_ID);
    expect(confirmation).not.toContain("projectId");
    expect(confirmation).toContain("Google Drive上のプロジェクトと素材は削除しません");
  });

  it("does not directly render internal IDs or raw messages in audited UI", () => {
    for (const forbidden of [
      "value={review.revisionId}",
      "value={result.revisionId}",
      "{state.error.message}",
    ]) {
      expect(source.publish).not.toContain(forbidden);
    }

    for (const forbidden of [
      "revision: {rollbackOutcome.revisionId}",
      "value={publication.currentRevisionId",
      "{item.revisionId}</dd>",
      "value={detail.revisionId}",
      "asset: {slide.assetId}",
      "{asset.assetId}</p>",
      "value={props.preview.targetRevisionId}",
      "value={props.executionReview.revisionId}",
    ]) {
      expect(source.history).not.toContain(forbidden);
    }
    expect(source.history).toContain(
      "sanitizeUserFacingDiagnostic(props.executionMessage)",
    );

    expect(source.confirmedStore).not.toContain(
      "`projectId: ${project.projectId}`",
    );
    expect(source.provider).not.toContain(
      "`projectId: ${result.projectId}`",
    );
    expect(source.provider).not.toContain("return error.message;");
    expect(source.offlineDb).not.toContain("return error.message;");
    expect(source.player).not.toContain(
      "readySnapshot.projectTitle ?? readySnapshot.projectId",
    );
    expect(source.settings).not.toContain("Provider内部のuseRef");
  });

  it("does not pass caught errors to production console warnings", () => {
    expect(source.workspace).not.toContain(
      'console.warn("Drive slide preview fetch failed.", error)',
    );
    expect(source.serviceWorker).not.toContain(
      'console.warn("[pwa] Failed to register service worker", error)',
    );
  });
});

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
