"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppState, type AssetImportStatus } from "@/app/app-providers";

export function AssetImportPanel() {
  const {
    assetImportStatus,
    assetImportStatusLabel,
    assetImportMessage,
    assetImportDiagnostics,
    assetImportSelection,
    canImportAssets,
    canStartAssetImport,
    assetImportBlockedReason,
    isAssetImportInFlight,
    startAssetImport,
    cancelAssetImport,
  } = useAppState();

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
        この第4-3-3パッチでは、Google Photos Pickerで写真を1件選び、Drive assets/
        への保存とmetadata検証まで実行します。manifest.json への反映はまだ実行しません。
      </p>

      {assetImportSelection ? (
        <div
          className={
            assetImportSelection.driveSaved
              ? "mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"
              : "mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950"
          }
        >
          <p className="font-medium">
            {assetImportSelection.driveSaved
              ? "Drive保存済み・manifest未反映サマリー"
              : "保存前の選択結果サマリー"}
          </p>
          <p
            className={
              assetImportSelection.driveSaved
                ? "mt-2 text-sm text-amber-800"
                : "mt-2 text-sm text-emerald-800"
            }
          >
            {assetImportSelection.driveSaved
              ? "写真をDrive assets/ に保存し、metadataを確認しました。manifest反映は未実行です。"
              : "写真を1件選択し、形式とサイズを確認しました。Drive保存とmanifest反映は未実行です。"}
          </p>

          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">ファイル名</dt>
              <dd className="break-all">{assetImportSelection.filename}</dd>
            </div>
            <div>
              <dt className="font-medium">mediaItem type</dt>
              <dd>{assetImportSelection.mediaItemType}</dd>
            </div>
            <div>
              <dt className="font-medium">元MIME type</dt>
              <dd>{assetImportSelection.sourceMimeType}</dd>
            </div>
            <div>
              <dt className="font-medium">取得後Content-Type</dt>
              <dd>{assetImportSelection.downloadedContentType}</dd>
            </div>
            <div>
              <dt className="font-medium">取得サイズ</dt>
              <dd>{formatBytes(assetImportSelection.downloadedSizeBytes)}</dd>
            </div>
            <div>
              <dt className="font-medium">サイズ上限</dt>
              <dd>{formatBytes(assetImportSelection.sizeLimitBytes)}</dd>
            </div>
            <div>
              <dt className="font-medium">sourceCreateTime</dt>
              <dd>{formatOptionalValue(assetImportSelection.sourceCreateTime)}</dd>
            </div>

            {assetImportSelection.driveSaved ? (
              <>
                <div>
                  <dt className="font-medium">assetId</dt>
                  <dd>{assetImportSelection.assetIdPart}</dd>
                </div>
                <div>
                  <dt className="font-medium">assetFileId</dt>
                  <dd>{assetImportSelection.assetFileIdPart}</dd>
                </div>
                <div>
                  <dt className="font-medium">Driveファイル名</dt>
                  <dd className="break-all">{assetImportSelection.driveFilename}</dd>
                </div>
                <div>
                  <dt className="font-medium">Drive MIME type</dt>
                  <dd>{assetImportSelection.driveMimeType}</dd>
                </div>
                <div>
                  <dt className="font-medium">Drive保存サイズ</dt>
                  <dd>{formatBytes(assetImportSelection.driveSizeBytes)}</dd>
                </div>
              </>
            ) : null}

            <div>
              <dt className="font-medium">保存状態</dt>
              <dd>
                {assetImportSelection.driveSaved
                  ? "Drive保存: 完了 / Drive asset metadata検証: 完了 / manifest反映: 未実行"
                  : "Drive保存: 未実行 / manifest反映: 未実行"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

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

function getStartAssetImportButtonLabel(assetImportStatus: AssetImportStatus) {
  switch (assetImportStatus) {
    case "selected":
      return "別の写真を選ぶ";
    case "savedToDrive":
      return "manifest反映待ち";
    case "cancelled":
      return "もう一度選択";
    case "invalid":
      return "別の写真を選ぶ";
    case "error":
      return "もう一度試す";
    case "requestingPhotosPermission":
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
