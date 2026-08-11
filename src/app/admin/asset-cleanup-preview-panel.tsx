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
import {
  useAppState,
  type AssetCleanupDeleteStatus,
  type AssetCleanupPreviewStatus,
} from "@/app/app-providers";
import type {
  DriveProjectUnusedAssetDeleteFailureReason,
  DriveProjectUnusedAssetDeleteResult,
  DriveProjectUnusedAssetDeleteReview,
} from "@/lib/drive-project-unused-asset-delete";
import type {
  DriveProjectUnusedAssetDeletePreflightAsset,
  DriveProjectUnusedAssetDeletePreflightResult,
} from "@/lib/google-drive";
import {
  canPrepareUnusedAssetDeletion,
  getAssetCleanupDeleteLiveRole,
} from "./asset-cleanup-delete-view";

const unusedAssetTableGridStyle: CSSProperties = {
  gridTemplateColumns:
    "4rem 22rem 7rem 10rem 10rem 10rem 8rem 14rem 14rem 8rem 24rem",
};

const preflightAssetSummaryGridStyle: CSSProperties = {
  gridTemplateColumns: "8rem 14rem 10rem 8rem 24rem 24rem",
};

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
    assetCleanupDeleteStatus,
    assetCleanupDeleteMessage,
    assetCleanupDeleteDiagnostics,
    assetCleanupDeleteReview,
    assetCleanupDeleteResult,
    assetCleanupDeleteProgress,
    isAssetCleanupDeleteInFlight,
    assetCleanupDeleteBlockedReason,
    previewUnusedProjectAssets,
    preflightUnusedAssetDeletion,
    clearAssetCleanupDeletePreflight,
    prepareUnusedAssetDeletion,
    confirmUnusedAssetDeletion,
    cancelUnusedAssetDeletion,
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
  const canPrepareDelete = canPrepareUnusedAssetDeletion({
    preflightResult: assetCleanupDeletePreflightResult,
    selectedAssetFileIds: Array.from(selectedAssetFileIds),
    blockedReason: assetCleanupDeleteBlockedReason,
    isDeleteInFlight: isAssetCleanupDeleteInFlight,
    isPreflightInFlight: isAssetCleanupDeletePreflightInFlight,
    isPreviewInFlight: isAssetCleanupPreviewInFlight,
  });

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

  function handlePrepareSelectedAssetDeletion() {
    prepareUnusedAssetDeletion(Array.from(selectedAssetFileIds));
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
          <p className="font-semibold">物理削除は明示confirm後だけ実行します。</p>
          <p className="mt-1">
            fresh preflightを通過した未使用画像assetだけを対象にし、自動削除・自動retry・自動修復は行いません。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className="min-h-11"
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

        <DeleteExecutionPanel
          status={assetCleanupDeleteStatus}
          message={assetCleanupDeleteMessage}
          diagnostics={assetCleanupDeleteDiagnostics}
          review={assetCleanupDeleteReview}
          result={assetCleanupDeleteResult}
          progress={assetCleanupDeleteProgress}
          onConfirm={() => void confirmUnusedAssetDeletion()}
          onCancel={cancelUnusedAssetDeletion}
        />

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
                        className="min-h-11"
                        disabled={
                          unusedAssets.length === 0 ||
                          isAssetCleanupDeleteInFlight
                        }
                        onClick={selectAllUnusedAssets}
                      >
                        すべて選択
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={
                          selectedAssets.length === 0 ||
                          isAssetCleanupDeleteInFlight
                        }
                        onClick={clearSelectedAssets}
                      >
                        選択解除
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className="min-h-11"
                        disabled={
                          selectedAssets.length === 0 ||
                          isAssetCleanupDeletePreflightInFlight ||
                          isAssetCleanupDeleteInFlight ||
                          assetCleanupDeletePreflightBlockedReason !== null
                        }
                        onClick={handlePreflightSelectedAssets}
                      >
                        {isAssetCleanupDeletePreflightInFlight
                          ? "削除前再検証中"
                          : "削除前再検証"}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    preflightはfresh manifestとfresh metadataで再検証します。削除実行時にも全件と各DELETE直前の再検証を行います。
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
                    canPrepareDelete={canPrepareDelete}
                    onPrepareDelete={handlePrepareSelectedAssetDeletion}
                  />
                ) : null}

                <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200">
                  <div className="min-w-[148rem]">
                    <div
                      className="grid gap-4 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-500"
                      style={unusedAssetTableGridStyle}
                    >
                      <p className="whitespace-nowrap">select</p>
                      <p className="whitespace-nowrap">assetName</p>
                      <p className="whitespace-nowrap">type</p>
                      <p className="whitespace-nowrap">assetFileId</p>
                      <p className="whitespace-nowrap">素材識別コード</p>
                      <p className="whitespace-nowrap">mimeType</p>
                      <p className="whitespace-nowrap">size</p>
                      <p className="whitespace-nowrap">createdTime</p>
                      <p className="whitespace-nowrap">modifiedTime</p>
                      <p className="whitespace-nowrap">references</p>
                      <p className="whitespace-nowrap">unsupportedReason</p>
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
                              disabled={isAssetCleanupDeleteInFlight}
                              onChange={() =>
                                toggleAssetSelection(asset.assetFileId)
                              }
                              aria-label={`${asset.assetName} を削除候補として選択`}
                              className="size-4 rounded border-slate-300"
                            />
                          </label>
                          <p
                            className="min-w-0 truncate font-medium text-slate-900"
                            title={asset.assetName}
                          >
                            {asset.assetName}
                          </p>
                          <p
                            className="min-w-0 truncate font-mono text-xs"
                            title={getAssetTypeFromMimeType(asset.mimeType)}
                          >
                            {getAssetTypeFromMimeType(asset.mimeType)}
                          </p>
                          <p
                            className="min-w-0 truncate font-mono text-xs"
                            title={asset.assetFileIdPart}
                          >
                            {asset.assetFileIdPart}
                          </p>
                          <p
                            className="min-w-0 truncate font-mono text-xs"
                            title={asset.assetIdPart}
                          >
                            {asset.assetIdPart}
                          </p>
                          <p
                            className="min-w-0 truncate font-mono text-xs"
                            title={asset.mimeType}
                          >
                            {asset.mimeType}
                          </p>
                          <p className="whitespace-nowrap">
                            {formatNullableBytes(asset.sizeBytes)}
                          </p>
                          <p
                            className="min-w-0 truncate font-mono text-xs"
                            title={formatOptionalValue(asset.createdTime)}
                          >
                            {formatOptionalValue(asset.createdTime)}
                          </p>
                          <p
                            className="min-w-0 truncate font-mono text-xs"
                            title={formatOptionalValue(asset.modifiedTime)}
                          >
                            {formatOptionalValue(asset.modifiedTime)}
                          </p>
                          <p className="whitespace-nowrap">
                            {asset.referenceSlideCount}
                          </p>
                          <p
                            className="min-w-0 truncate text-xs"
                            title={getUnsupportedReasonLabel(asset.mimeType)}
                          >
                            {getUnsupportedReasonLabel(asset.mimeType)}
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

function DeleteExecutionPanel({
  status,
  message,
  diagnostics,
  review,
  result,
  progress,
  onConfirm,
  onCancel,
}: {
  status: AssetCleanupDeleteStatus;
  message: string | null;
  diagnostics: string[];
  review: DriveProjectUnusedAssetDeleteReview | null;
  result: DriveProjectUnusedAssetDeleteResult | null;
  progress: { current: number; total: number } | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (status === "idle") return null;

  const role = getAssetCleanupDeleteLiveRole(status);
  const className =
    status === "partialFailure" || status === "blocked" || status === "error"
      ? "rounded-xl border border-red-300 bg-red-50 p-4 text-red-950"
      : "rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950";

  return (
    <div
      className={className}
      role={role}
      aria-live={role === "status" ? "polite" : undefined}
    >
      {message ? <p className="font-semibold">{message}</p> : null}

      {status === "confirming" && review ? (
        <div className="mt-3 space-y-3">
          <p>
            対象 {review.assetCount}件 / 合計 {formatBytes(review.totalSizeBytes)}
          </p>
          <div className="rounded-lg border border-red-300 bg-white/60 p-3">
            <p className="font-semibold">Google Driveから完全削除します</p>
            <p className="mt-1">この操作は取り消せません。</p>
            <p className="mt-1">
              manifest / index / confirmed storeは変更しません。
            </p>
          </div>
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[42rem] space-y-2">
              {review.assets.map((asset) => (
                <div
                  key={`${asset.assetFileIdPart}-${asset.assetName}`}
                  className="grid grid-cols-[minmax(14rem,1fr)_10rem_8rem] gap-3 rounded-lg border border-red-200 bg-white p-2 text-sm"
                >
                  <p className="truncate" title={asset.assetName}>
                    {asset.assetName}
                  </p>
                  <p className="font-mono text-xs">{asset.assetFileIdPart}</p>
                  <p>{formatNullableBytes(asset.sizeBytes)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              onClick={onConfirm}
            >
              完全削除を実行
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={onCancel}
            >
              キャンセル
            </Button>
          </div>
        </div>
      ) : null}

      {status === "deleting" && progress ? (
        <p className="mt-2">
          未使用 asset を削除中 {progress.current} / {progress.total}
        </p>
      ) : null}

      {status === "partialFailure" ? (
        <p className="mt-2">
          Drive上に一部削除済みの状態が残っています。自動retryや復元は行いません。
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryPill label="requested" value={`${result.requestedCount}件`} />
            <SummaryPill label="deleted" value={`${result.deletedCount}件`} />
            <SummaryPill label="failed" value={`${result.failedCount}件`} />
            <SummaryPill label="blocked" value={`${result.blockedCount}件`} />
            <SummaryPill
              label="not attempted"
              value={`${result.notAttemptedCount}件`}
            />
          </div>
          <div className="space-y-2">
            {result.items.map((item, index) => (
              <div
                key={`${item.assetFileIdPart}-${index}`}
                className="rounded-lg border border-current/20 bg-white/60 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{item.assetName}</p>
                  <Badge variant="secondary">{item.status}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs">
                  {item.assetFileIdPart} / {formatNullableBytes(item.sizeBytes)}
                </p>
                {item.reason ? (
                  <p className="mt-1 text-xs">
                    reason: {getDeleteFailureReasonLabel(item.reason)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {diagnostics.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs">
          {diagnostics.map((diagnostic, index) => (
            <p key={`${diagnostic}-${index}`}>・{diagnostic}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getDeleteFailureReasonLabel(
  reason: DriveProjectUnusedAssetDeleteFailureReason,
) {
  const labels: Record<DriveProjectUnusedAssetDeleteFailureReason, string> = {
    notFound: "対象なし",
    stillReferenced: "参照あり",
    metadataChanged: "metadata変更",
    notAppManagedAsset: "app管理asset不一致",
    wrongProject: "project不一致",
    wrongParent: "parent不一致",
    deleteRejected: "Drive削除拒否",
    aborted: "中止",
    unexpectedFailure: "予期しない失敗",
  };
  return labels[reason];
}

function PreflightResultPanel({
  message,
  diagnostics,
  result,
  canPrepareDelete,
  onPrepareDelete,
}: {
  message: string | null;
  diagnostics: string[];
  result: DriveProjectUnusedAssetDeletePreflightResult | null;
  canPrepareDelete: boolean;
  onPrepareDelete: () => void;
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
              blocked asset があるため物理削除を実行できません。
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
              以下は削除前preflightを通過した候補です。次の操作で最終confirmを表示します。
            </p>
            <div className="mt-3 max-w-full overflow-x-auto">
              {result.eligibleAssets.length > 0 ? (
                <div className="min-w-[96rem] space-y-2 pr-1">
                  {result.eligibleAssets.map((asset) => (
                    <PreflightAssetSummary
                      key={asset.assetFileId}
                      asset={asset}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm">削除confirm preview対象はありません。</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="destructive"
                className="min-h-11"
                disabled={!canPrepareDelete}
                onClick={onPrepareDelete}
              >
                preflight済み asset を物理削除
              </Button>
              <p className="text-xs leading-5">
                confirm後もDELETE開始前と各DELETE直前にfresh再検証します。
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
    <div className="max-w-full overflow-hidden rounded-lg border border-slate-200 p-3">
      <p className="font-medium text-slate-900">{title}</p>
      {assets.length > 0 ? (
        <div className="mt-2 max-w-full overflow-x-auto">
          <div className="min-w-[96rem] space-y-2 pr-1">
            {assets.map((asset) => (
              <PreflightAssetSummary key={asset.assetFileId} asset={asset} />
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{emptyMessage}</p>
      )}
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
        <p
          className="min-w-0 flex-1 truncate font-medium text-slate-900"
          title={asset.assetName}
        >
          {asset.assetName}
        </p>
        <Badge variant={asset.status === "eligible" ? "default" : "secondary"}>
          {asset.status}
        </Badge>
        {getAssetTypeFromMimeType(asset.mimeType) === "video" ? (
          <Badge variant="secondary">video</Badge>
        ) : null}
      </div>
      <dl
        className="mt-2 grid gap-2"
        style={preflightAssetSummaryGridStyle}
      >
        <SummaryRow
          label="type"
          value={getAssetTypeFromMimeType(asset.mimeType)}
          mono
        />
        <SummaryRow
          label="mimeType"
          value={formatNullableValue(asset.mimeType)}
          mono
        />
        <SummaryRow
          label="assetFileId"
          value={asset.assetFileIdPart}
          mono
        />
        <SummaryRow
          label="size"
          value={formatNullableBytes(asset.sizeBytes)}
          mono
        />
        <SummaryRow
          label="references"
          value={`${asset.referenceSlideCount}`}
          mono
        />
        <SummaryRow
          label="unsupported"
          value={getUnsupportedReasonLabel(asset.mimeType)}
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

function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-1 truncate text-slate-900 ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </dd>
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

function formatNullableValue(value: string | null) {
  return value && value.length > 0 ? value : "取得なし";
}

function getAssetTypeFromMimeType(mimeType: string | null) {
  if (!mimeType) {
    return "unknown";
  }

  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return "unknown";
}

function getUnsupportedReasonLabel(mimeType: string | null) {
  if (!mimeType) {
    return "missingMimeType";
  }

  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") {
    return "なし";
  }

  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return "なし";
  }

  if (mimeType.startsWith("video/")) {
    return "unsupportedVideoMimeType";
  }

  return "unsupportedMimeType";
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
