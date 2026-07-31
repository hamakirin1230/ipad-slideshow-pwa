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

export function OfflineSyncPanel() {
  const {
    driveStatus,
    projectStatus,
    offlineSyncStatus,
    offlineSyncStatusLabel,
    offlineSyncMessage,
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

  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Drive offline sync</CardTitle>
          <Badge
            variant={offlineSyncStatus === "ready" ? "secondary" : "outline"}
            className={
              offlineSyncStatus === "ready"
                ? undefined
                : "border-slate-500 text-slate-200"
            }
          >
            {offlineSyncStatusLabel}
          </Badge>
        </div>
        <CardDescription className="text-slate-300">
          選択中の Drive project ready の内容を IndexedDB staging に書き込み、
          検証後に confirmed offline store へ promotion します。
          promotion 後は confirmed store から /player/ の offline-first 再生に使われます。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-slate-300">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">offline sync 状態</p>
            <p className="mt-2">{offlineSyncMessage}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">開始条件</p>
            <p className="mt-2">
              Drive workspace と選択中 Drive project が ready の場合だけ実行できます。
            </p>
            <dl className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
              <div>
                <dt>driveStatus</dt>
                <dd className="font-medium text-slate-200">{driveStatus}</dd>
              </div>
              <div>
                <dt>projectStatus</dt>
                <dd className="font-medium text-slate-200">{projectStatus}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant={canStartOfflineSync ? "default" : "secondary"}
            onClick={startOfflineSync}
            disabled={!canStartOfflineSync || isOfflineSyncInFlight}
          >
            {startButtonLabel}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={cancelOfflineSync}
            disabled={!canCancelOfflineSync}
          >
            offline sync を中止
          </Button>
        </div>

        {showBlockedReason ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <p className="font-semibold">offline sync を開始できません</p>
            <p className="mt-2">{offlineSyncBlockedReason}</p>
          </div>
        ) : null}

        {offlineSyncStatus === "syncing" ? (
          <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100">
            <p className="font-semibold">同期中</p>
            <p className="mt-2">
              Drive manifest / asset metadata / asset blob を取得し、
              staging write と promotion を順に実行しています。
            </p>
          </div>
        ) : null}

        {offlineSyncStatus === "ready" ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
            <p className="font-semibold">offline sync 完了</p>
            <p className="mt-2">
              Drive snapshot 取得、staging write、confirmed store promotion
              が完了しました。
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
              <p className="font-semibold">publication provenance</p>
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
            <p className="font-semibold">offline syncに失敗しました</p>
            <p className="mt-2 leading-6">
              現在のconfirmed storeは自動削除していません。上部の
              「Driveワークスペース状態」と「Driveプロジェクト状態」がreadyであることを
              確認し、原因を解消してから手動で再実行してください。
            </p>
          </div>
        ) : null}

        {offlineSyncStatus === "cancelled" ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <p className="font-semibold">offline syncを中止しました</p>
            <p className="mt-2 leading-6">
              中止前のconfirmed storeは維持されます。中止した処理を理由に
              confirmed storeやDrive assetを自動削除しません。
              必要になった時点で手動で再実行してください。
            </p>
          </div>
        ) : null}

        {offlineSyncStatus === "stale" ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <p className="font-semibold">今回の同期結果が古くなっています</p>
            <p className="mt-2 leading-6">
              このsync runより新しい処理が優先されたため、今回の結果はconfirmed storeへ
              反映していません。現在の保存データは削除せず維持しています。
              上部のDrive状態とプロジェクト状態を確認し、最新内容を反映する場合は
              offline syncを手動で再実行してください。
            </p>
          </div>
        ) : null}

        {offlineSyncStatus === "failed" ||
        offlineSyncStatus === "cancelled" ||
        offlineSyncStatus === "stale" ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">手動リカバリー方針</p>
            <p className="mt-2 leading-6">
              自動retry、自動修復、自動削除は行いません。stagingの結果でconfirmed
              storeを置き換えるのはpromotion成功時だけです。
            </p>
          </div>
        ) : null}

        {offlineSyncLastResult ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">最後の実行結果</p>
            <dl className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
              <div>
                <dt>ok</dt>
                <dd className="font-medium text-slate-200">
                  {offlineSyncLastResult.ok ? "true" : "false"}
                </dd>
              </div>
              <div>
                <dt>status</dt>
                <dd className="font-medium text-slate-200">
                  {offlineSyncLastResult.status}
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
                read-only status
              </Badge>
            </div>
            <p className="mt-2 leading-6">
              大容量videoはIndexedDBにBlob保存しません。ただしremoteOnly
              metadataとしてconfirmed storeに残り、オンライン時はDrive streamingで
              /playerの再生対象になります。Blob未保存はDrive削除、cleanup対象、
              sync失敗を意味しません。
            </p>
            <dl className="mt-3 grid gap-2 text-xs text-sky-100 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <SyncCount
                label="manifest slides"
                value={skipVisibility.manifestSlideCount}
              />
              <SyncCount
                label="image Blob保存対象"
                value={skipVisibility.imageSyncCandidateCount}
              />
              <SyncCount
                label="mp4 video"
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
                label="remoteOnly video"
                value={skipVisibility.remoteOnlyVideoCount}
              />
              <SyncCount
                label="未対応素材"
                value={skipVisibility.unsupportedAssetCount}
              />
              <SyncCount
                label="staging slides"
                value={skipVisibility.offlineStagingSlideCount}
              />
            </dl>
            <p className="mt-3 leading-6">
              Blob未保存のvideoは、オフラインでは本体を再生できません。
              オンライン時はGoogle接続とDrive streaming sessionが有効な場合に
              再生対象になります。画像とBlob保存済みの小容量videoは
              offline-first再生対象です。QuickTime / WebMは未対応のままです。
            </p>
          </div>
        ) : null}

        {offlineSyncDiagnostics.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">offline sync 診断</p>
            <div className="mt-3 space-y-2">
              {offlineSyncDiagnostics.map((diagnostic, index) => (
                <p key={`${diagnostic}-${index}`}>・{diagnostic}</p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <p className="font-semibold">今後の対象</p>
          <p className="mt-2">
            retry policy、自動修復、MOV / QuickTimeのオンライン再生対応、
            詳細なエラー案内。
          </p>
        </div>
      </CardContent>
    </Card>
  );
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
    return "offline sync 実行中";
  }

  if (offlineSyncStatus === "stale") {
    return "最新内容を同期";
  }

  if (offlineSyncStatus === "failed" || offlineSyncStatus === "cancelled") {
    return "offline sync を再実行";
  }

  return "offline sync を実行";
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
