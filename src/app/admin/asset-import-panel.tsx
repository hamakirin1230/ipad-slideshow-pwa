"use client";

import { useRef, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useAppState,
  type AssetImportBatchItemStatus,
  type AssetImportStatus,
} from "@/app/app-providers";

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
    canImportAssets,
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

  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-900">素材追加準備状態</p>
        <Badge variant={canImportAssets ? "secondary" : "outline"}>
          {assetImportStatusLabel}
        </Badge>
      </div>

      <p className="mt-3">{assetImportMessage}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
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
          accept="video/mp4"
          multiple
          className="sr-only"
          onChange={handleLocalVideoFileChange}
          disabled={!canStartAssetImport}
        />

        <Button
          type="button"
          variant="outline"
          onClick={openLocalVideoFilePicker}
          disabled={!canStartAssetImport}
        >
          video/mp4ファイルを選ぶ
        </Button>

        {isAssetImportInFlight ? (
          <Button type="button" variant="outline" onClick={cancelAssetImport}>
            素材追加を中止
          </Button>
        ) : null}
      </div>

      {!canStartAssetImport && assetImportBlockedReason ? (
        <p className="mt-3 text-slate-500">{assetImportBlockedReason}</p>
      ) : null}

      <p className="mt-3 text-slate-500">
        Google Photos Pickerは写真追加が主目的です。video/mp4は、Google Photos
        Pickerではなく「video/mp4ファイルから追加」を推奨します。
      </p>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="font-medium text-slate-900">video/mp4ファイルから追加</p>
        <p className="mt-2 text-slate-500">
          端末上のvideo/mp4ファイルを選び、Drive assets/
          へ保存してmanifest.jsonへ反映します。1回の上限は
          {assetImportMaxBatchCount}件、1ファイル50MB以下です。
        </p>
      </div>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <SummaryPill label="追加可能" value={`${remainingSlideSlots}件`} />
        <SummaryPill label="1回の上限" value={`${assetImportMaxBatchCount}件`} />
        <SummaryPill
          label="今回の選択"
          value={`${assetImportBatchSummary.selectedCount}件`}
        />
      </div>

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
                ? "Drive保存済み・manifest未反映の可能性があります"
                : "素材追加batchサマリー"}
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
                      {item.sourceMimeType} / createTime:{" "}
                      {formatOptionalValue(item.sourceCreateTime)}
                    </p>
                  </div>
                  <Badge variant={getBatchItemBadgeVariant(item.status)}>
                    {getBatchItemStatusLabel(item.status)}
                  </Badge>
                </div>
                <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  <SummaryRow label="mediaItem" value={item.mediaItemIdPart} />
                  <SummaryRow
                    label="download"
                    value={
                      item.downloadedSizeBytes
                        ? formatBytes(item.downloadedSizeBytes)
                        : "未実行"
                    }
                  />
                  {item.assetIdPart ? (
                    <SummaryRow label="assetId" value={item.assetIdPart} />
                  ) : null}
                  {item.assetFileIdPart ? (
                    <SummaryRow
                      label="assetFileId"
                      value={item.assetFileIdPart}
                    />
                  ) : null}
                  {item.slideIdPart ? (
                    <SummaryRow label="slideId" value={item.slideIdPart} />
                  ) : null}
                  {item.driveFilename ? (
                    <SummaryRow label="Drive file" value={item.driveFilename} />
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

      <p className="mt-3 text-xs leading-5 text-slate-500">
        テロップ変更や素材追加をiPad再生に反映するには、対象projectをoffline
        syncしてください。途中失敗時もDrive上のassetは自動削除しません。
      </p>

      {assetImportDiagnostics.length > 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="font-medium text-slate-900">素材追加診断</p>
          <div className="mt-2 space-y-1">
            {assetImportDiagnostics.map((diagnostic, index) => (
              <p key={`${index}-${diagnostic}`}>・{diagnostic}</p>
            ))}
          </div>
        </div>
      ) : null}

      <p className="sr-only">現在の素材追加状態: {assetImportStatus}</p>
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
      return "manifest反映済み";
    case "failed":
      return "失敗";
    case "skipped":
      return "skip";
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
      return "manifest反映待ち";
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
      return "素材を追加";
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

function formatOptionalValue(value: string | null) {
  return value ?? "取得なし";
}
