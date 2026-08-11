import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");
const cancelSource = source.slice(
  source.indexOf("function cancelUnusedAssetDeletion()"),
  source.indexOf("async function confirmUnusedAssetDeletion()"),
);
const confirmSource = source.slice(
  source.indexOf("async function confirmUnusedAssetDeletion()"),
  source.indexOf("function applySlideManifestMutationSuccess"),
);

describe("AppProviders unused asset delete ownership", () => {
  it("keeps the pending destructive plan in a ref rather than public state", () => {
    expect(source).toContain(
      "useRef<DriveProjectUnusedAssetDeletePlan | null>(null)",
    );
    expect(source).not.toContain(
      "useState<DriveProjectUnusedAssetDeletePlan",
    );
    expect(source).not.toContain("assetCleanupDeletePlan:");
  });

  it("invalidates stale delete runs and checks token ownership before state updates", () => {
    expect(confirmSource).toContain(
      "deleteRequestId !== assetCleanupDeleteRequestIdRef.current",
    );
    expect(confirmSource).toContain("accessTokenRef.current !== accessToken");
    expect(source).toContain("assetCleanupDeleteRequestIdRef.current += 1");
  });

  it("does not send DELETE when confirm is cancelled", () => {
    expect(cancelSource).toContain('setAssetCleanupDeleteStatus("cancelled")');
    expect(cancelSource).toContain("Google Driveへの削除要求は送信していません");
    expect(cancelSource).not.toContain("deleteDriveProjectAssetFile");
    expect(cancelSource).not.toContain("executeDriveProjectUnusedAssetDeletion");
  });

  it("refreshes cleanup preview once after completed or partial failure", () => {
    expect(confirmSource).toContain('result.status === "completed"');
    expect(confirmSource).toContain('result.status === "partialFailure"');
    expect(
      confirmSource.match(/await refreshAssetCleanupPreviewAfterDelete\(\{/g),
    ).toHaveLength(1);
  });

  it("sets the delete result before refresh and preserves it on refresh failure", () => {
    expect(confirmSource.indexOf("setAssetCleanupDeleteResult(result)")).toBeLessThan(
      confirmSource.indexOf("await refreshAssetCleanupPreviewAfterDelete"),
    );
    expect(confirmSource).toContain(
      "削除結果は確定していますが、cleanup previewの再読込に失敗しました",
    );
    expect(confirmSource).not.toContain("setAssetCleanupDeleteResult(null);\n      setAssetCleanupPreviewStatus(\"error\")");
  });

  it("does not start unrelated storage or publication operations", () => {
    for (const forbiddenCall of [
      "startOfflineSync(",
      "prepareProjectPublishReview(",
      "commitPreparedProjectPublish(",
      "prepareProjectRollbackExecutionReview(",
      "commitPreparedProjectRollback(",
      "indexedDB.",
    ]) {
      expect(confirmSource).not.toContain(forbiddenCall);
    }
  });
});
