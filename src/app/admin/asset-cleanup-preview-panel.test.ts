import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canPrepareUnusedAssetDeletion,
  getAssetCleanupDeleteLiveRole,
} from "./asset-cleanup-delete-view";
import type { DriveProjectUnusedAssetDeletePreflightResult } from "@/lib/google-drive";

const source = readFileSync(
  new URL("./asset-cleanup-preview-panel.tsx", import.meta.url),
  "utf8",
);

describe("asset cleanup destructive button", () => {
  it("requires a matching eligible-only preflight result", () => {
    expect(canDelete(makePreflight())).toBe(true);
    expect(canDelete(null)).toBe(false);
    expect(canDelete(makePreflight({ eligibleAssetCount: 0 }))).toBe(false);
    expect(canDelete(makePreflight({ blockedAssetCount: 1 }))).toBe(false);
    expect(canDelete(makePreflight(), ["other-file"])).toBe(false);
    expect(canDelete(makePreflight(), ["asset-file-a"], "owner changed")).toBe(
      false,
    );
  });

  it("keeps the destructive action conditional and explicit", () => {
    expect(source).toContain("canPrepareUnusedAssetDeletion");
    expect(source).toContain("確認済み素材を物理削除");
    expect(source).toContain("Google Driveから完全削除します");
    expect(source).toContain("取り消せません");
  });
});

describe("asset cleanup delete live status", () => {
  it("uses alert for partial failure, blocked, and error", () => {
    expect(getAssetCleanupDeleteLiveRole("partialFailure")).toBe("alert");
    expect(getAssetCleanupDeleteLiveRole("blocked")).toBe("alert");
    expect(getAssetCleanupDeleteLiveRole("error")).toBe("alert");
  });

  it("uses polite status output while deleting and after completion", () => {
    expect(getAssetCleanupDeleteLiveRole("deleting")).toBe("status");
    expect(getAssetCleanupDeleteLiveRole("completed")).toBe("status");
    expect(source).toContain(
      'aria-live={role === "status" ? "polite" : undefined}',
    );
    expect(source).toContain("未使用素材を削除中");
  });

  it("does not render raw sensitive delete fields", () => {
    const forbidden = [
      "access-token-fixture",
      "Authorization",
      "Bearer ",
      "https://www.googleapis.com/drive/v3/files",
      "manifestFileId",
      "assetsFolderId",
      "appProperties",
      "parents",
      "checksum",
    ];
    for (const value of forbidden) expect(source).not.toContain(value);
  });
});

function canDelete(
  preflightResult: DriveProjectUnusedAssetDeletePreflightResult | null,
  selectedAssetFileIds = ["asset-file-a"],
  blockedReason: string | null = null,
) {
  return canPrepareUnusedAssetDeletion({
    preflightResult,
    selectedAssetFileIds,
    blockedReason,
    isDeleteInFlight: false,
    isPreflightInFlight: false,
    isPreviewInFlight: false,
  });
}

function makePreflight(
  overrides: Partial<DriveProjectUnusedAssetDeletePreflightResult> = {},
): DriveProjectUnusedAssetDeletePreflightResult {
  return {
    checkedAssetCount: 1,
    eligibleAssetCount: 1,
    blockedAssetCount: 0,
    selectedAssetFileIds: ["asset-file-a"],
    eligibleAssets: [],
    blockedAssets: [],
    allAssets: [],
    freshManifestSlideCount: 0,
    eligibleTotalSizeBytes: 100,
    diagnostics: [],
    ...overrides,
  };
}
