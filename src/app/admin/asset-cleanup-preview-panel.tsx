"use client";

import { useMemo, useState, type CSSProperties } from "react";
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
import type {
  DriveProjectUnusedAssetDeletePreflightAsset,
  DriveProjectUnusedAssetDeletePreflightResult,
} from "@/lib/google-drive";

const unusedAssetTableGridStyle: CSSProperties = {
  gridTemplateColumns: "4rem 22rem 10rem 10rem 10rem 8rem 14rem 14rem 8rem",
};

const deleteReadinessChecklistItems = [
  "削除直前に Drive manifest.json を再読込する",
  "削除直前に assetFileId の参照数を再計算する",
  "削除対象 file の Drive metadata を再取得する",
  "referenceSlideCount が 0 の file だけを削除対象にする",
  "削除対象の assetName / size / fileId を confirm で再表示する",
  "削除実行後に cleanup preview を再実行する",
  "削除失敗時に partial failure を UI で明示する",
];

export function AssetCleanupPreviewPanel() {
  const {
    assetCleanupPreviewStatus,
    assetCleanupPreviewMessage,
    assetCleanupPreviewDiagnostics,
    assetCleanupPreviewResult,
    isAssetCleanupPreviewInFlight,
    assetCleanupPreviewBlockedReason,
    assetCleanupDeletePreflightMessage,
    assetCleanupDeletePreflightDiagnostics,
    assetCleanupDeletePreflightResult,
    isAssetCleanupDeletePreflightInFlight,
    assetCleanupDeletePreflightBlockedReason,
    previewUnusedProjectAssets,
    preflightUnusedAssetDeletion,
    clearAssetCleanupDeletePreflight,
  } = useAppState();
  const [assetSelectionState, setAssetSelectionState] = useState<{
    previewResult: typeof assetCleanupPreviewResult;
    assetFileIds: Set<string>;
  }>(() => ({
    previewResult: null,
    assetFileIds: new Set(),
  }));
  const unusedAssets = useMemo(
    () => assetCleanupPreviewResult?.unusedAssets ?? [],
    [assetCleanupPreviewResult],
  );
  const unusedAssetFileIds = useMemo(
    () => unusedAssets.map((asset) => asset.assetFileId),
    [unusedAssets],
  );
  const selectedAssetFileIds = useMemo(
    () =>
      assetSelectionState.previewResult === assetCleanupPreviewResult
        ? assetSelectionState.assetFileIds
        : new Set<string>(),
    [assetCleanupPreviewResult, assetSelectionState],
  );
  const selectedAssets = useMemo(
    () =>
      unusedAssets.filter((asset) =>
        selectedAssetFileIds.has(asset.assetFileId),
      ),
    [selectedAssetFileIds, unusedAssets],
  );
  const unusedTotalSizeBytes =
    unusedAssets.reduce(
      (total, asset) => total + (asset.sizeBytes ?? 0),
      0,
    );
  const selectedTotalSizeBytes = selectedAssets.reduce(
    (total, asset) => total + (asset.sizeBytes ?? 0),
    0,
  );

  function toggleAssetSelection(assetFileId: string) {
    clearAssetCleanupDeletePreflight();
    setAssetSelectionState((current) => {
      const currentAssetFileIds =
        current.previewResult === assetCleanupPreviewResult
          ? current.assetFileIds
          : new Set<string>();
      const next = new Set(currentAssetFileIds);

      if (next.has(assetFileId)) {
        next.delete(assetFileId);
      } else {
        next.add(assetFileId);
      }

      return {
        previewResult: assetCleanupPreviewResult,
        assetFileIds: next,
      };
    });
  }

  function selectAllUnusedAssets() {
    clearAssetCleanupDeletePreflight();
    setAssetSelectionState({
      previewResult: assetCleanupPreviewResult,
      assetFileIds: new Set(unusedAssetFileIds),
    });
  }

  function clearSelectedAssets() {
    clearAssetCleanupDeletePreflight();
    setAssetSelectionState({
      previewResult: assetCleanupPreviewResult,
      assetFileIds: new Set(),
    });
  }

  function handlePreflightSelectedAssets() {
    void preflightUnusedAssetDeletion(Array.from(selectedAssetFileIds));
  }

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

            {unusedAssets.length > 0 ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        削除 readiness
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        選択中 {selectedAssets.length}件 / 選択 total size{" "}
                        {formatBytes(selectedTotalSizeBytes)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={unusedAssets.length === 0}
                        onClick={selectAllUnusedAssets}
                      >
                        すべて選択
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={selectedAssets.length === 0}
                        onClick={clearSelectedAssets}
                      >
                        選択解除
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        disabled={
                          selectedAssets.length === 0 ||
                          isAssetCleanupDeletePreflightInFlight ||
                          assetCleanupDeletePreflightBlockedReason !== null
                        }
                        onClick={handlePreflightSelectedAssets}
                      >
                        {isAssetCleanupDeletePreflightInFlight
                          ? "削除前再検証中"
                          : "削除前再検証"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled
                      >
                        選択した未使用 asset を削除
                      </Button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    この画面ではまだ削除しません。preflight は fresh manifest と fresh metadata で再検証します。物理削除は次フェーズです。
                  </p>
                  {assetCleanupDeletePreflightBlockedReason ? (
                    <p className="mt-2 text-xs text-slate-500">
                      現在の状態: {assetCleanupDeletePreflightBlockedReason}
                    </p>
                  ) : null}
                </div>

                {assetCleanupDeletePreflightMessage ||
                assetCleanupDeletePreflightDiagnostics.length > 0 ||
                assetCleanupDeletePreflightResult ? (
                  <PreflightResultPanel
                    message={assetCleanupDeletePreflightMessage}
                    diagnostics={assetCleanupDeletePreflightDiagnostics}
                    result={assetCleanupDeletePreflightResult}
                  />
                ) : null}

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      削除を有効化する前に必要な確認
                    </p>
                    <Badge variant="secondary">未実装</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    以下は今回のコミットでは未実装です。物理削除を有効化する前に、次フェーズで実装します。
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {deleteReadinessChecklistItems.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden="true" className="text-slate-400">
                          -
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <div className="min-w-[112rem]">
                    <div
                      className="grid gap-4 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-500"
                      style={unusedAssetTableGridStyle}
                    >
                      <p className="whitespace-nowrap">select</p>
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
                      {unusedAssets.map((asset) => (
                        <div
                          key={asset.assetFileId}
                          className="grid items-center gap-4 bg-white px-4 py-3 text-sm"
                          style={unusedAssetTableGridStyle}
                        >
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedAssetFileIds.has(
                                asset.assetFileId,
                              )}
                              onChange={() =>
                                toggleAssetSelection(asset.assetFileId)
                              }
                              aria-label={`${asset.assetName} を削除候補として選択`}
                              className="size-4 rounded border-slate-300"
                            />
                          </label>
                          <p
                            className="truncate font-medium text-slate-900"
                            title={asset.assetName}
                          >
                            {asset.assetName}
                          </p>
                          <p
                            className="truncate font-mono text-xs"
                            title={asset.assetFileIdPart}
                          >
                            {asset.assetFileIdPart}
                          </p>
                          <p
                            className="truncate font-mono text-xs"
                            title={asset.assetIdPart}
                          >
                            {asset.assetIdPart}
                          </p>
                          <p className="whitespace-nowrap">{asset.mimeType}</p>
                          <p className="whitespace-nowrap">
                            {formatNullableBytes(asset.sizeBytes)}
                          </p>
                          <p
                            className="truncate font-mono text-xs"
                            title={formatOptionalValue(asset.createdTime)}
                          >
                            {formatOptionalValue(asset.createdTime)}
                          </p>
                          <p
                            className="truncate font-mono text-xs"
                            title={formatOptionalValue(asset.modifiedTime)}
                          >
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

function PreflightResultPanel({
  message,
  diagnostics,
  result,
}: {
  message: string | null;
  diagnostics: string[];
  result: DriveProjectUnusedAssetDeletePreflightResult | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-900">削除前preflight</p>
        <Badge variant={result ? "default" : "secondary"}>
          {result ? "再検証済み" : "未実行"}
        </Badge>
      </div>
      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
      <p className="mt-2 text-xs leading-5 text-slate-500">
        preflight は fresh manifest と fresh metadata で再検証します。この段階ではまだ Drive file は削除しません。
      </p>

      {result ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryPill
              label="checked"
              value={`${result.checkedAssetCount}件`}
            />
            <SummaryPill
              label="eligible"
              value={`${result.eligibleAssetCount}件`}
            />
            <SummaryPill
              label="blocked"
              value={`${result.blockedAssetCount}件`}
            />
            <SummaryPill
              label="fresh manifest slides"
              value={`${result.freshManifestSlideCount}件`}
            />
            <SummaryPill
              label="eligible total size"
              value={formatBytes(result.eligibleTotalSizeBytes)}
            />
          </div>

          {result.blockedAssets.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
              blocked asset があるため、将来の物理削除でもこのままでは実行できません。
            </div>
          ) : null}

          <PreflightAssetList
            title="eligible assets"
            assets={result.eligibleAssets}
            emptyMessage="eligible asset はありません。"
          />
          <PreflightAssetList
            title="blocked assets"
            assets={result.blockedAssets}
            emptyMessage="blocked asset はありません。"
          />

          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-950">
            <p className="font-semibold">削除 confirm preview</p>
            <p className="mt-1 text-sm">
              以下は削除直前preflightを通過した候補です。ただし、このコミットでは Drive file は削除しません。
            </p>
            <div className="mt-3 space-y-2">
              {result.eligibleAssets.length > 0 ? (
                result.eligibleAssets.map((asset) => (
                  <PreflightAssetSummary key={asset.assetFileId} asset={asset} />
                ))
              ) : (
                <p className="text-sm">削除confirm preview対象はありません。</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" variant="destructive" disabled>
                preflight済み asset を物理削除
              </Button>
              <p className="text-xs leading-5">
                物理削除は次フェーズで Drive delete API と partial failure handling を実装してから有効化します。
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {diagnostics.length > 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="font-medium text-slate-900">preflight 診断</p>
          <div className="mt-2 space-y-1 text-xs">
            {diagnostics.map((diagnostic, index) => (
              <p key={`${index}-${diagnostic}`}>・{diagnostic}</p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreflightAssetList({
  title,
  assets,
  emptyMessage,
}: {
  title: string;
  assets: DriveProjectUnusedAssetDeletePreflightAsset[];
  emptyMessage: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="font-medium text-slate-900">{title}</p>
      <div className="mt-2 space-y-2">
        {assets.length > 0 ? (
          assets.map((asset) => (
            <PreflightAssetSummary key={asset.assetFileId} asset={asset} />
          ))
        ) : (
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}

function PreflightAssetSummary({
  asset,
}: {
  asset: DriveProjectUnusedAssetDeletePreflightAsset;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 max-w-full truncate font-medium text-slate-900" title={asset.assetName}>
          {asset.assetName}
        </p>
        <Badge variant={asset.status === "eligible" ? "default" : "secondary"}>
          {asset.status}
        </Badge>
      </div>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryRow label="assetFileId" value={asset.assetFileIdPart} />
        <SummaryRow label="size" value={formatNullableBytes(asset.sizeBytes)} />
        <SummaryRow
          label="references"
          value={`${asset.referenceSlideCount}`}
        />
        <SummaryRow
          label="blocked"
          value={
            asset.blockedReasons.length > 0
              ? asset.blockedReasons.map(getBlockedReasonLabel).join(", ")
              : "なし"
          }
        />
      </dl>
    </div>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-900">{value}</dd>
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

function getBlockedReasonLabel(reason: string) {
  switch (reason) {
    case "notFound":
      return "not found";
    case "metadataMismatch":
      return "metadata mismatch";
    case "notAppManagedAsset":
      return "not app-managed asset";
    case "wrongProject":
      return "wrong project";
    case "wrongParent":
      return "wrong parent";
    case "unsupportedMimeType":
      return "unsupported MIME";
    case "stillReferenced":
      return "still referenced";
    case "trashed":
      return "trashed";
    case "missingRequiredMetadata":
      return "missing required metadata";
    default:
      return reason;
  }
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
