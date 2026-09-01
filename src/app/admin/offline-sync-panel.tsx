"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductDisclosure } from "@/components/product-disclosure";
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
import { createPlayerProjectLinkHref } from "@/lib/player-route";
import { buildOfflineSyncStaleView } from "@/app/admin/offline-sync-stale-view";
import {
  getOfflineStorageLocationServer,
  getOfflineStorageLocationViewForPlatform,
  readOfflineStorageLocationClient,
  subscribeOfflineStorageLocation,
  type OfflineStorageLocationView,
} from "@/lib/offline-storage-location";
import type {
  OfflineSaveUiDiffChange,
  OfflineSaveUiDiffItem,
  OfflineSaveUiReview,
  OfflineSaveUiTransferImpact,
} from "@/lib/offline-save-ui-review";

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
    prepareOfflineSaveReview,
    startOfflineSync,
    cancelOfflineSync,
    selectedProjectId,
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
  const selectedPlayerHref =
    selectedProjectId && offlineSyncStatus === "ready"
      ? createPlayerProjectLinkHref(selectedProjectId)
      : null;
  const storageLocationPlatform = useSyncExternalStore(
    subscribeOfflineStorageLocation,
    readOfflineStorageLocationClient,
    getOfflineStorageLocationServer,
  );
  const storageLocation = getOfflineStorageLocationViewForPlatform(
    storageLocationPlatform,
  );

  return (
    <Card className="border-white/10 bg-white/[0.035] text-slate-50">
      <CardHeader>
        <CardTitle>ローカルに保存</CardTitle>
        <CardDescription className="text-slate-300">
          選択中のアルバムを、ローカルで再生できるようにします。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-slate-300">
        <OfflineStorageLocation location={storageLocation} />

        <OfflineSaveReviewFlow
          key={selectedProjectId ?? "no-project"}
          canStart={canStartOfflineSync}
          isSyncing={isOfflineSyncInFlight}
          canCancelSync={canCancelOfflineSync}
          startButtonLabel={startButtonLabel}
          prepareReview={prepareOfflineSaveReview}
          startSync={startOfflineSync}
          cancelSync={cancelOfflineSync}
        />

        {showBlockedReason ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <p className="font-semibold">ローカルへの保存を開始できません</p>
            <p className="mt-2">{offlineSyncBlockedReason}</p>
          </div>
        ) : null}

        {offlineSyncStatus === "syncing" ? (
          <div
            className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100"
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold">保存中</p>
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
                  aria-label="ローカルへの保存進捗"
                />
                <p className="mt-1 text-xs">{progressView.percent}%</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {offlineSyncStatus === "ready" ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
            <p className="font-semibold">ローカルへの保存が完了しました</p>
            <p className="mt-2">
              選択中のアルバムをローカルへ保存しました。
            </p>
            {selectedPlayerHref ? (
              <Button
                asChild
                className="mt-4 min-h-11 bg-emerald-200 text-slate-950 hover:bg-emerald-100"
              >
                <Link href={selectedPlayerHref}>このアルバムを再生</Link>
              </Button>
            ) : null}
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
            <p className="font-semibold">ローカルへの保存に失敗しました</p>
            <p className="mt-2 leading-6">
              現在の保存データは削除していません。Google Driveへの接続とアルバムを確認し、
              原因を解消してからもう一度実行してください。
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

        {offlineSyncLastResult ||
        skipVisibility ||
        offlineSyncDiagnostics.length > 0 ? (
          <ProductDisclosure label="詳しい保存状態を見る">
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
                      {getOfflineSyncResultStatusLabel(
                        offlineSyncLastResult.status,
                      )}
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
              大容量動画はローカルに本体を保存しません。ただしオンライン再生用の
              情報は保存され、オンライン時はGoogle Driveから再生できます。
              本体が未保存でも、Google Driveからの削除や保存失敗を意味しません。
            </p>
            <dl className="mt-3 grid gap-2 text-xs text-sky-100 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <SyncCount
                label="設定内スライド"
                value={skipVisibility.manifestSlideCount}
              />
              <SyncCount
                label="画像の保存対象"
                value={skipVisibility.imageSyncCandidateCount}
              />
              <SyncCount
                label="MP4/MOV video"
                value={skipVisibility.videoSyncCandidateCount}
              />
              <SyncCount
                label="動画本体を保存済み"
                value={skipVisibility.videoSyncedCount}
              />
              <SyncCount
                label="動画本体は未保存"
                value={skipVisibility.videoSkippedCount}
              />
              <SyncCount
                label="オンライン再生のみの動画"
                value={skipVisibility.remoteOnlyVideoCount}
              />
              <SyncCount
                label="未対応素材"
                value={skipVisibility.unsupportedAssetCount}
              />
              <SyncCount
                label="保存対象スライド"
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
          </ProductDisclosure>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OfflineStorageLocation({
  location,
}: {
  location: OfflineStorageLocationView;
}) {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-black/20 p-4"
      aria-label="ローカル保存先"
    >
      <p className="font-semibold text-slate-50">保存先</p>
      <p className="mt-2 text-slate-200">{location.label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        {location.description}
      </p>

      <details className="mt-3 text-xs text-slate-300">
        <summary className="cursor-pointer font-medium text-slate-100">
          保存先について
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>PWAやアプリを削除すると、保存データが消える場合があります。</li>
          <li>サイトデータを削除すると、保存データが消える場合があります。</li>
          <li>Google Drive上の元データとは別のローカルコピーです。</li>
          <li>公開とは別の操作です。</li>
          <li>Googleフォト同期とは別の操作です。</li>
        </ul>
      </details>
    </section>
  );
}

function OfflineSaveReviewFlow({
  canStart,
  isSyncing,
  canCancelSync,
  startButtonLabel,
  prepareReview,
  startSync,
  cancelSync,
}: {
  canStart: boolean;
  isSyncing: boolean;
  canCancelSync: boolean;
  startButtonLabel: string;
  prepareReview: ReturnType<typeof useAppState>["prepareOfflineSaveReview"];
  startSync: () => void;
  cancelSync: () => void;
}) {
  const [review, setReview] = useState<OfflineSaveUiReview | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  async function handlePrepare() {
    if (!canStart || isPreparing || isSyncing) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsPreparing(true);
    setMessage(null);
    setReview(null);
    setConfirmed(false);
    try {
      const result = await prepareReview(controller.signal);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setMessage(
          result.reason === "sourceChanged"
            ? "確認中に選択内容が変わりました。もう一度確認してください。"
            : "変更内容を確認できませんでした。Google Driveの状態を確認してください。",
        );
        return;
      }
      setReview(result.review);
    } catch (error) {
      if (!isAbortError(error)) {
        setMessage("変更内容を確認できませんでした。もう一度お試しください。");
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setIsPreparing(false);
      }
    }
  }

  function cancelReview() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsPreparing(false);
    setReview(null);
    setConfirmed(false);
    setMessage(null);
  }

  function confirmAndSave() {
    if (!review || !confirmed || isSyncing) return;
    setReview(null);
    setConfirmed(false);
    setMessage(null);
    startSync();
  }

  if (review) {
    return (
      <OfflineSaveReviewCard
        review={review}
        confirmed={confirmed}
        disabled={isSyncing}
        onConfirmedChange={setConfirmed}
        onSave={confirmAndSave}
        onCancel={cancelReview}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant={canStart ? "default" : "secondary"}
          className="min-h-11"
          onClick={handlePrepare}
          disabled={!canStart || isPreparing || isSyncing}
        >
          {isPreparing ? "変更内容を確認中" : startButtonLabel}
        </Button>
        {canCancelSync ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={cancelSync}
          >
            保存を中止
          </Button>
        ) : null}
        {isPreparing ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={cancelReview}
          >
            確認を中止
          </Button>
        ) : null}
      </div>
      {message ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-rose-100"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function OfflineSaveReviewCard({
  review,
  confirmed,
  disabled,
  onConfirmedChange,
  onSave,
  onCancel,
}: {
  review: OfflineSaveUiReview;
  confirmed: boolean;
  disabled: boolean;
  onConfirmedChange: (value: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="font-semibold text-slate-50">変更内容</p>

      {review.baselineStatus === "unavailable" ? (
        <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-amber-50">
          <p className="font-medium">前回の詳細は表示できません。</p>
          <p className="mt-1 text-xs text-amber-100/80">
            今回の保存内容のみ確認できます。前回の内容は推測しません。
          </p>
        </div>
      ) : null}

      {review.projectTitleChange ? (
        <ReviewChangeBlock
          label="アルバム名"
          before={review.projectTitleChange.before}
          after={review.projectTitleChange.after}
        />
      ) : null}

      {review.settingsChanges.map((change) => (
        <ReviewChangeBlock
          key={change.field}
          label={change.label}
          before={change.before}
          after={change.after}
        />
      ))}

      {review.summary ? (
        <div className="flex flex-wrap gap-2" aria-label="変更件数">
          <ReviewChip label="追加" value={review.summary.added} />
          <ReviewChip label="削除" value={review.summary.removed} />
          <ReviewChip label="変更" value={review.summary.changed} />
          <ReviewChip label="並び替え" value={review.summary.moved} />
        </div>
      ) : null}

      <div>
        <p className="text-xs font-medium text-slate-300">保存方法</p>
        <div className="mt-2 flex flex-wrap gap-2" aria-label="素材の保存方法">
          <ReviewChip label="再利用" value={review.transferSummary.reuse} />
          <ReviewChip label="ダウンロード" value={review.transferSummary.download} />
          <ReviewChip
            label="オフライン対象外"
            value={review.transferSummary.offlineExcluded}
          />
          {review.transferSummary.deletePlanned > 0 ? (
            <ReviewChip
              label="削除予定"
              value={review.transferSummary.deletePlanned}
            />
          ) : null}
        </div>
      </div>

      {review.baselineStatus === "unavailable" ? (
        <ul className="space-y-2">
          {review.currentDisplayNames.map((displayName, index) => (
            <li
              key={`${displayName}-${index}`}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              {displayName}
            </li>
          ))}
        </ul>
      ) : review.noChanges ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-200">
          ローカル保存内容に変更はありません。
        </p>
      ) : review.items.length > 0 ? (
        <ul className="space-y-2">
          {review.items.map((item, index) => (
            <OfflineDiffItem
              key={`${item.kind}-${item.displayName}-${index}`}
              item={item}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-sky-300/20 bg-sky-300/10 p-3 text-sky-50">
          素材本体を安全に保存し直します。スライド情報の変更はありません。
        </p>
      )}

      <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-slate-300">
        <summary className="cursor-pointer font-medium text-slate-100">
          ローカル保存について
        </summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-xs">
          <li>保存完了までは現在のローカルコピーを維持します。</li>
          <li>変更のない素材は再利用します。</li>
          <li>大きい動画はオフライン対象外になる場合があります。</li>
          <li>公開やGoogleフォト同期とは別の操作です。</li>
        </ul>
      </details>

      <label className="flex min-h-11 items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={disabled}
          onChange={(event) => onConfirmedChange(event.target.checked)}
          className="mt-1 size-4"
        />
        <span>この変更内容でローカルに保存することを確認しました</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11"
          disabled={!confirmed || disabled}
          onClick={onSave}
        >
          ローカルに保存
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={disabled}
          onClick={onCancel}
        >
          やめる
        </Button>
      </div>
    </div>
  );
}

function ReviewChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
      {label} {value}
    </span>
  );
}

function ReviewChangeBlock({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="rounded-xl border border-sky-300/20 bg-sky-300/10 p-3">
      <p className="text-xs font-medium text-sky-100">{label}</p>
      <OfflineBeforeAfter before={before} after={after} />
    </div>
  );
}

function OfflineDiffItem({ item }: { item: OfflineSaveUiDiffItem }) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-50">{item.displayName}</p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-200">
            {item.kind === "added"
              ? "追加"
              : item.kind === "removed"
                ? "削除"
                : "変更"}
          </span>
          <span className="rounded-full bg-sky-300/10 px-2 py-0.5 text-xs text-sky-100">
            {transferImpactLabel(item.transferImpact)}
          </span>
        </div>
      </div>
      {item.kind === "changed" ? (
        <dl className="mt-3 space-y-3">
          {item.changes.map((change) => (
            <OfflineDiffChange key={change.field} change={change} />
          ))}
        </dl>
      ) : null}
    </li>
  );
}

function OfflineDiffChange({ change }: { change: OfflineSaveUiDiffChange }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{offlineDiffFieldLabel(change.field)}</dt>
      <dd>
        <OfflineBeforeAfter before={change.before} after={change.after} />
      </dd>
    </div>
  );
}

function OfflineBeforeAfter({ before, after }: { before: string; after: string }) {
  return (
    <span className="mt-1 grid gap-1 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <span className="rounded-lg bg-black/20 px-2 py-1">
        <span className="block text-[0.65rem] text-slate-400">変更前</span>
        {before}
      </span>
      <span className="text-center text-slate-500" aria-hidden="true">→</span>
      <span className="rounded-lg bg-sky-300/10 px-2 py-1 text-sky-50">
        <span className="block text-[0.65rem] text-sky-200">変更後</span>
        {after}
      </span>
    </span>
  );
}

function offlineDiffFieldLabel(field: OfflineSaveUiDiffChange["field"]) {
  switch (field) {
    case "asset":
      return "素材差替え";
    case "caption":
      return "テロップ";
    case "duration":
      return "表示時間";
    case "imageEdit":
      return "画像調整";
    case "position":
      return "順番";
  }
}

function transferImpactLabel(impact: OfflineSaveUiTransferImpact) {
  switch (impact) {
    case "reuse":
      return "再ダウンロードなし";
    case "download":
      return "ダウンロード";
    case "offlineExcluded":
      return "オフライン対象外";
    case "deletePlanned":
      return "保存完了後に削除";
  }
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
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
    return "ローカルに保存中";
  }

  if (offlineSyncStatus === "stale") {
    return "最新の内容を保存";
  }

  if (offlineSyncStatus === "failed" || offlineSyncStatus === "cancelled") {
    return "ローカルにもう一度保存";
  }

  return "ローカルに保存";
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
