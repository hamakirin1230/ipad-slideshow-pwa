"use client";

import { useRef, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductDisclosure } from "@/components/product-disclosure";
import {
  useAppState,
  type AssetImportBatchItemStatus,
  type AssetImportStatus,
} from "@/app/app-providers";
import { formatUiDateTime } from "@/lib/ui-format";

export function AssetImportPanel() {
  const {
    assetImportStatus,
    assetImportStatusLabel,
    assetImportMessage,
    assetImportDiagnostics,
    assetImportBatch,
    assetImportBatchSummary,
    remainingSlideSlots,
    assetImportMaxBatchCount,
    canStartAssetImport,
    assetImportBlockedReason,
    isAssetImportInFlight,
    startAssetImport,
    startLocalVideoFileImport,
    cancelAssetImport,
  } = useAppState();
  const localVideoInputRef = useRef<HTMLInputElement | null>(null);

  function openLocalVideoFilePicker() {
    localVideoInputRef.current?.click();
  }

  function handleLocalVideoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.currentTarget;

    if (files && files.length > 0) {
      startLocalVideoFileImport(files);
    }

    event.currentTarget.value = "";
  }

  const showOperationMessage =
    isAssetImportInFlight ||
    assetImportBatch.length > 0 ||
    ["invalid", "error", "cancelled"].includes(assetImportStatus);

  return (
    <div className="text-sm text-slate-600">
      <h4 className="font-semibold text-slate-900">素材を追加</h4>

      {showOperationMessage ? <p className="mt-3">{assetImportMessage}</p> : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          className="min-h-11"
          variant={
            assetImportStatus === "selected" || assetImportStatus === "savedToDrive"
              ? "secondary"
              : "default"
          }
          onClick={startAssetImport}
          disabled={!canStartAssetImport}
        >
          {getStartAssetImportButtonLabel(assetImportStatus)}
        </Button>

        <input
          ref={localVideoInputRef}
          type="file"
          accept="video/mp4,video/quicktime,.mov,.mp4"
          multiple
          className="sr-only"
          onChange={handleLocalVideoFileChange}
          disabled={!canStartAssetImport}
        />

        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={openLocalVideoFilePicker}
          disabled={!canStartAssetImport}
        >
          動画を選ぶ
        </Button>

        {isAssetImportInFlight ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={cancelAssetImport}
          >
            素材追加を中止
          </Button>
        ) : null}
      </div>

      {!canStartAssetImport && assetImportBlockedReason ? (
        <p className="mt-3 text-slate-500">{assetImportBlockedReason}</p>
      ) : null}

      <ProductDisclosure label="素材追加の詳細" tone="light" className="mt-4">
        <div className="space-y-2">
          <p>写真はGoogle Photosから、動画はこの端末のファイルから選びます。</p>
          <p>対応する動画はMP4またはMOV、1ファイル5GB以下です。大容量動画は本体をこのiPadへ保存せず、オンライン時に再生します。</p>
          <p>追加できるスライドは残り{remainingSlideSlots}件、1回に{assetImportMaxBatchCount}件までです。</p>
          <p>途中で失敗しても、Google Driveへ保存済みの素材は自動削除しません。</p>
          <p className="text-xs">現在の状態: {assetImportStatusLabel}</p>
          {assetImportDiagnostics.length > 0 ? (
            <div className="space-y-1 text-xs">
              {assetImportDiagnostics.map((diagnostic, index) => (
                <p key={`${index}-${diagnostic}`}>・{diagnostic}</p>
              ))}
            </div>
          ) : null}
        </div>
      </ProductDisclosure>

      {assetImportBatch.length > 0 ? (
        <div
          className={
            assetImportBatchSummary.failedCount === 0 &&
            assetImportBatchSummary.manifestUpdatedCount > 0
              ? "mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950"
              : assetImportBatchSummary.savedCount > assetImportBatchSummary.manifestUpdatedCount
                ? "mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"
                : "mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-950"
          }
        >
          <p className="font-medium">
            {assetImportBatchSummary.failedCount === 0 &&
            assetImportBatchSummary.manifestUpdatedCount > 0
              ? "素材追加完了サマリー"
              : assetImportBatchSummary.savedCount >
                  assetImportBatchSummary.manifestUpdatedCount
                ? "Drive保存済み・プロジェクト未反映の可能性があります"
                : "素材追加の結果"}
          </p>
          <p className="mt-2 text-sm opacity-80">
            成功 {assetImportBatchSummary.manifestUpdatedCount} 件 / Drive保存{" "}
            {assetImportBatchSummary.savedCount} 件 / 失敗{" "}
            {assetImportBatchSummary.failedCount} 件
          </p>

          <div className="mt-3 space-y-2">
            {assetImportBatch.map((item) => (
              <div
                key={item.clientItemId}
                className="rounded-lg border border-current/15 bg-white/60 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="break-all font-medium">{item.filename}</p>
                    <p className="mt-1 text-xs opacity-70">
                      作成日時: {item.sourceCreateTime ? formatUiDateTime(item.sourceCreateTime) : "取得なし"}
                    </p>
                  </div>
                  <Badge variant={getBatchItemBadgeVariant(item.status)}>
                    {getBatchItemStatusLabel(item.status)}
                  </Badge>
                </div>
                <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  <SummaryRow
                    label="取得容量"
                    value={
                      item.downloadedSizeBytes
                        ? formatBytes(item.downloadedSizeBytes)
                        : "未実行"
                    }
                  />
                  {item.driveFilename ? (
                    <SummaryRow label="Drive保存名" value={item.driveFilename} />
                  ) : null}
                </dl>
                {item.errorMessage ? (
                  <p className="mt-2 text-xs text-red-700">
                    {item.errorMessage}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="sr-only">現在の素材追加状態: {assetImportStatus}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}

function getBatchItemStatusLabel(status: AssetImportBatchItemStatus) {
  switch (status) {
    case "selected":
      return "選択済み";
    case "downloading":
      return "取得中";
    case "downloaded":
      return "取得済み";
    case "uploading":
      return "Drive保存中";
    case "savedToDrive":
      return "Drive保存済み";
    case "manifestUpdated":
      return "プロジェクト反映済み";
    case "failed":
      return "失敗";
    case "skipped":
      return "省略";
    default:
      return status;
  }
}

function getBatchItemBadgeVariant(status: AssetImportBatchItemStatus) {
  return status === "failed"
    ? "destructive"
    : status === "manifestUpdated"
      ? "default"
      : "secondary";
}

function getStartAssetImportButtonLabel(assetImportStatus: AssetImportStatus) {
  switch (assetImportStatus) {
    case "selected":
      return "別の素材を選ぶ";
    case "savedToDrive":
      return "プロジェクト反映待ち";
    case "cancelled":
      return "もう一度選択";
    case "invalid":
      return "別の素材を選ぶ";
    case "error":
      return "もう一度試す";
    case "requestingPhotosPermission":
    case "validatingLocalFiles":
    case "openingPicker":
    case "waitingForSelection":
    case "downloadingFromPhotos":
    case "uploadingToDrive":
    case "updatingManifest":
    case "verifying":
      return "素材追加処理中";
    case "completed":
    case "idle":
    default:
      return "写真を選ぶ";
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return `${bytes} bytes`;
  }

  if (bytes < 1024) {
    return `${bytes} bytes`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB (${bytes} bytes)`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB (${bytes} bytes)`;
}
