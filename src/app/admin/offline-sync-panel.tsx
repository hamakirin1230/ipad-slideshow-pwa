"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppState, type OfflineSyncStatus } from "@/app/app-providers";
import type { DriveOfflineStagingSyncRuntimeResult } from "@/lib/drive-offline-staging-sync-runtime";
import { buildOfflineSyncProgressView } from "@/lib/offline-sync-progress";
import { buildOfflineSyncStaleView } from "@/app/admin/offline-sync-stale-view";

export function OfflineSyncPanel() {
  const {
    offlineSyncStatus,
    offlineSyncMessage,
    offlineSyncProgress,
    offlineSyncDiagnostics,
    offlineSyncLastResult,
    isOfflineSyncInFlight,
    canStartOfflineSync,
    offlineSyncBlockedReason,
    startOfflineSync,
    cancelOfflineSync,
  } = useAppState();

  const canCancelOfflineSync = isOfflineSyncInFlight;
  const showBlockedReason =
    !canStartOfflineSync &&
    !isOfflineSyncInFlight &&
    offlineSyncBlockedReason !== null;
  const skipVisibility =
    getOfflineSyncVideoSkipVisibility(offlineSyncLastResult);
  const startButtonLabel = getOfflineSyncStartButtonLabel({
    isOfflineSyncInFlight,
    offlineSyncStatus,
  });
  const progressView = buildOfflineSyncProgressView(offlineSyncProgress);
  const staleView = buildOfflineSyncStaleView(
    offlineSyncLastResult?.status,
  );

  return (
    <Card className="border-white/10 bg-white/[0.035] text-slate-50">
      <CardHeader>
        <CardTitle>端末へ同期</CardTitle>
        <CardDescription className="text-slate-300">
          選択中のDriveプロジェクトから再生データを取得し、検証後にこの端末の保存データを更新します。
          公開やDriveへの保存とは別の明示操作です。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-slate-300">
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant={canStartOfflineSync ? "default" : "secondary"}
            className="min-h-11"
            onClick={startOfflineSync}
            disabled={!canStartOfflineSync || isOfflineSyncInFlight}
          >
            {startButtonLabel}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={cancelOfflineSync}
            disabled={!canCancelOfflineSync}
          >
            端末への同期を中止
          </Button>
        </div>

        {showBlockedReason ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <p className="font-semibold">端末への同期を開始できません</p>
            <p className="mt-2">{offlineSyncBlockedReason}</p>
          </div>
        ) : null}

        {offlineSyncStatus === "syncing" ? (
          <div
            className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100"
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold">同期中</p>
            <p className="mt-2">{progressView?.message ?? offlineSyncMessage}</p>
            {progressView?.countLabel &&
            offlineSyncProgress?.phase !== "assetSaving" ? (
              <p className="mt-2">{progressView.countLabel}</p>
            ) : null}
            {progressView?.percent !== undefined ? (
              <div className="mt-3">
                <progress
                  className="h-2 w-full accent-sky-400"
                  max={100}
                  value={progressView.percent}
                  aria-label="端末への同期進捗"
                />
                <p className="mt-1 text-xs">{progressView.percent}%</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {offlineSyncStatus === "ready" ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
            <p className="font-semibold">同期完了</p>
            <p className="mt-2">
              Driveからの取得、内容の検証、端末保存データの更新が完了しました。
            </p>
          </div>
        ) : null}

        {offlineSyncLastResult?.ok &&
        offlineSyncLastResult.status === "ready" ? (
          <div
            className={
              offlineSyncLastResult.publicationProvenance.warning
                ? "rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-amber-100"
                : offlineSyncLastResult.publicationProvenance.tone === "success"
                  ? "rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100"
                  : "rounded-2xl border border-white/15 bg-white/5 p-4 text-slate-200"
            }
            role={
              offlineSyncLastResult.publicationProvenance.warning
                ? "alert"
                : "status"
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">同期した公開状態</p>
              <Badge variant="outline">
                {offlineSyncLastResult.publicationProvenance.label}
              </Badge>
            </div>
            <p className="mt-2 leading-6">
              {offlineSyncLastResult.publicationProvenance.message}
            </p>
          </div>
        ) : null}

        {offlineSyncStatus === "failed" ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">
            <p className="font-semibold">端末への同期に失敗しました</p>
            <p className="mt-2 leading-6">
              現在の端末保存データは自動削除していません。上部の
              「Driveワークスペース状態」と「Driveプロジェクト状態」の確認が完了していることを
              確認し、原因を解消してから手動で再実行してください。
            </p>
          </div>
        ) : null}

        {offlineSyncStatus === "cancelled" ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <p className="font-semibold">同期を中止しました</p>
            <p className="mt-2 leading-6">
              中止前の端末保存データは維持されます。中止した処理を理由に
              端末保存データやDrive上の素材を自動削除しません。
              必要になった時点で手動で再実行してください。
            </p>
          </div>
        ) : null}

        {offlineSyncStatus === "stale" ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <p className="font-semibold">{staleView.title}</p>
            <p className="mt-2 leading-6">{staleView.message}</p>
            <p className="mt-2 leading-6">{staleView.retentionMessage}</p>
          </div>
        ) : null}

        {offlineSyncStatus === "failed" ||
        offlineSyncStatus === "cancelled" ||
        offlineSyncStatus === "stale" ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">手動リカバリー方針</p>
            <p className="mt-2 leading-6">
              自動再試行、自動修復、自動削除は行いません。取得した内容の検証と保存に
              成功した場合だけ、端末保存データを置き換えます。
            </p>
          </div>
        ) : null}

        {offlineSyncLastResult ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">最後の実行結果</p>
            <dl className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
              <div>
                <dt>結果</dt>
                <dd className="font-medium text-slate-200">
                  {offlineSyncLastResult.ok ? "成功" : "未完了"}
                </dd>
              </div>
              <div>
                <dt>状態</dt>
                <dd className="font-medium text-slate-200">
                  {getOfflineSyncResultStatusLabel(offlineSyncLastResult.status)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {skipVisibility ? (
          <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">動画の保存状態</p>
              <Badge variant="outline" className="border-sky-200 text-sky-100">
                保存方針
              </Badge>
            </div>
            <p className="mt-2 leading-6">
              大容量動画は端末内データベースに本体を保存しません。ただしremoteOnlyの
              再生情報は端末保存データに残り、オンライン時はDriveから
              /playerで再生できます。本体未保存はDrive削除、物理削除対象、
              同期失敗を意味しません。
            </p>
            <dl className="mt-3 grid gap-2 text-xs text-sky-100 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <SyncCount
                label="設定内スライド"
                value={skipVisibility.manifestSlideCount}
              />
              <SyncCount
                label="image Blob保存対象"
                value={skipVisibility.imageSyncCandidateCount}
              />
              <SyncCount
                label="MP4/MOV video"
                value={skipVisibility.videoSyncCandidateCount}
              />
              <SyncCount
                label="video Blob保存済み"
                value={skipVisibility.videoSyncedCount}
              />
              <SyncCount
                label="video Blob未保存"
                value={skipVisibility.videoSkippedCount}
              />
              <SyncCount
                label="remoteOnly動画"
                value={skipVisibility.remoteOnlyVideoCount}
              />
              <SyncCount
                label="未対応素材"
                value={skipVisibility.unsupportedAssetCount}
              />
              <SyncCount
                label="同期対象スライド"
                value={skipVisibility.offlineStagingSlideCount}
              />
            </dl>
            <p className="mt-3 leading-6">
              本体未保存の動画は、オフラインでは再生できません。
              オンライン時はGoogle接続が有効な場合にDriveから再生します。
              画像と本体を保存した小容量動画は端末保存データから再生できます。
              MP4/MOV以外の動画形式は未対応です。
            </p>
          </div>
        ) : null}

        {offlineSyncDiagnostics.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">端末同期の診断</p>
            <div className="mt-3 space-y-2">
              {offlineSyncDiagnostics.map((diagnostic, index) => (
                <p key={`${diagnostic}-${index}`}>・{diagnostic}</p>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function getOfflineSyncResultStatusLabel(
  status: DriveOfflineStagingSyncRuntimeResult["status"],
) {
  const labels: Record<DriveOfflineStagingSyncRuntimeResult["status"], string> = {
    ready: "同期完了",
    stale: "新しい同期を優先",
    staleManifest: "Drive更新を検出",
    driveFetchOrStagingWriteFailed: "取得または一時保存に失敗",
    promotionFailed: "端末保存データの更新に失敗",
    orchestrationPreconditionFailed: "開始条件を満たしていない",
    orchestrationUnexpectedFailure: "予期しない失敗",
    syncAlreadyInFlight: "同期を実行中",
    syncRuntimeCancelled: "同期を中止",
  };

  return labels[status];
}

function SyncCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-sky-200/30 bg-black/20 p-2">
      <dt className="text-sky-200">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-50">{value}</dd>
    </div>
  );
}

function getOfflineSyncStartButtonLabel({
  isOfflineSyncInFlight,
  offlineSyncStatus,
}: {
  isOfflineSyncInFlight: boolean;
  offlineSyncStatus: OfflineSyncStatus;
}) {
  if (isOfflineSyncInFlight) {
    return "端末へ同期中";
  }

  if (offlineSyncStatus === "stale") {
    return "最新内容を同期";
  }

  if (offlineSyncStatus === "failed" || offlineSyncStatus === "cancelled") {
    return "端末への同期を再実行";
  }

  return "端末へ同期";
}

function getOfflineSyncVideoSkipVisibility(
  result: DriveOfflineStagingSyncRuntimeResult | null,
) {
  if (!result || !result.ok || result.status !== "ready") {
    return null;
  }

  return {
    manifestSlideCount: result.manifestSlideCount,
    imageSyncCandidateCount: result.imageSyncCandidateCount,
    videoSyncCandidateCount: result.videoSyncCandidateCount,
    videoSyncedCount: result.videoSyncedCount,
    videoSkippedCount: result.videoSkippedCount,
    remoteOnlyVideoCount: result.videoTooLargeSkippedCount,
    unsupportedAssetCount: result.unsupportedAssetCount,
    offlineStagingSlideCount: result.offlineStagingSlideCount,
  };
}
