"use client";

import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppState, type AssetCleanupPreviewStatus } from "@/app/app-providers";

const unusedAssetTableGridStyle: CSSProperties = {
  gridTemplateColumns: "22rem 10rem 10rem 10rem 8rem 14rem 14rem 8rem",
};

export function AssetCleanupPreviewPanel() {
  const {
    assetCleanupPreviewStatus,
    assetCleanupPreviewMessage,
    assetCleanupPreviewDiagnostics,
    assetCleanupPreviewResult,
    isAssetCleanupPreviewInFlight,
    assetCleanupPreviewBlockedReason,
    previewUnusedProjectAssets,
  } = useAppState();
  const unusedTotalSizeBytes =
    assetCleanupPreviewResult?.unusedAssets.reduce(
      (total, asset) => total + (asset.sizeBytes ?? 0),
      0,
    ) ?? 0;

  return (
    <Card className="bg-white text-slate-950">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>未使用 asset cleanup preview</CardTitle>
            <CardDescription>
              選択中projectのDrive assets/ をmetadataだけで検出します。
            </CardDescription>
          </div>
          <Badge variant={getStatusBadgeVariant(assetCleanupPreviewStatus)}>
            {getStatusLabel(assetCleanupPreviewStatus)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-600">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <p className="font-semibold">この機能は検出のみです。</p>
          <p className="mt-1">
            Drive assets/ の画像 file は削除しません。削除機能は次フェーズで、別途 confirm 必須で実装します。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={
              assetCleanupPreviewBlockedReason !== null ||
              isAssetCleanupPreviewInFlight
            }
            onClick={previewUnusedProjectAssets}
          >
            {isAssetCleanupPreviewInFlight
              ? "未使用 asset を検出中"
              : "未使用 asset を検出"}
          </Button>
          {assetCleanupPreviewBlockedReason ? (
            <p className="text-slate-500">{assetCleanupPreviewBlockedReason}</p>
          ) : null}
        </div>

        {assetCleanupPreviewMessage ? (
          <p className="text-slate-700">{assetCleanupPreviewMessage}</p>
        ) : null}

        {assetCleanupPreviewResult ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryPill
                label="scanned asset files"
                value={`${assetCleanupPreviewResult.scannedAssetCount}件`}
              />
              <SummaryPill
                label="referenced asset files"
                value={`${assetCleanupPreviewResult.referencedAssetFileCount}件`}
              />
              <SummaryPill
                label="unused asset files"
                value={`${assetCleanupPreviewResult.unusedAssetCount}件`}
              />
              <SummaryPill
                label="ignored files"
                value={`${assetCleanupPreviewResult.ignoredFileCount}件`}
              />
              <SummaryPill
                label="unused total size"
                value={formatBytes(unusedTotalSizeBytes)}
              />
            </div>

            {assetCleanupPreviewResult.unusedAssets.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <div className="min-w-[96rem]">
                  <div
                    className="grid gap-4 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-500"
                    style={unusedAssetTableGridStyle}
                  >
                    <p className="whitespace-nowrap">assetName</p>
                    <p className="whitespace-nowrap">assetFileId</p>
                    <p className="whitespace-nowrap">assetId</p>
                    <p className="whitespace-nowrap">mimeType</p>
                    <p className="whitespace-nowrap">size</p>
                    <p className="whitespace-nowrap">createdTime</p>
                    <p className="whitespace-nowrap">modifiedTime</p>
                    <p className="whitespace-nowrap">references</p>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {assetCleanupPreviewResult.unusedAssets.map((asset) => (
                      <div
                        key={asset.assetFileId}
                        className="grid gap-4 bg-white px-4 py-3 text-sm"
                        style={unusedAssetTableGridStyle}
                      >
                        <p
                          className="truncate font-medium text-slate-900"
                          title={asset.assetName}
                        >
                          {asset.assetName}
                        </p>
                        <p className="whitespace-nowrap">{asset.assetFileIdPart}</p>
                        <p className="whitespace-nowrap">{asset.assetIdPart}</p>
                        <p className="whitespace-nowrap">{asset.mimeType}</p>
                        <p className="whitespace-nowrap">
                          {formatNullableBytes(asset.sizeBytes)}
                        </p>
                        <p className="whitespace-nowrap">
                          {formatOptionalValue(asset.createdTime)}
                        </p>
                        <p className="whitespace-nowrap">
                          {formatOptionalValue(asset.modifiedTime)}
                        </p>
                        <p className="whitespace-nowrap">
                          {asset.referenceSlideCount}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-4">
                <p className="font-medium text-slate-900">
                  未使用 asset は見つかりませんでした。
                </p>
              </div>
            )}
          </div>
        ) : null}

        {assetCleanupPreviewDiagnostics.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-medium text-slate-900">cleanup preview 診断</p>
            <div className="mt-2 space-y-1 text-xs">
              {assetCleanupPreviewDiagnostics.map((diagnostic, index) => (
                <p key={`${index}-${diagnostic}`}>・{diagnostic}</p>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function getStatusLabel(status: AssetCleanupPreviewStatus) {
  switch (status) {
    case "checking":
      return "検出中";
    case "ready":
      return "preview更新済み";
    case "blocked":
      return "開始不可";
    case "invalid":
      return "project情報に問題あり";
    case "error":
      return "preview失敗";
    case "idle":
    default:
      return "未実行";
  }
}

function getStatusBadgeVariant(status: AssetCleanupPreviewStatus) {
  return status === "ready"
    ? "default"
    : status === "error" || status === "invalid"
      ? "destructive"
      : "secondary";
}

function formatNullableBytes(bytes: number | null) {
  return typeof bytes === "number" ? formatBytes(bytes) : "取得なし";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return `${bytes} bytes`;
  }

  if (bytes < 1024) {
    return `${bytes} bytes`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatOptionalValue(value: string | null) {
  return value && value.length > 0 ? value : "取得なし";
}
