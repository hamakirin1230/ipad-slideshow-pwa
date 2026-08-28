"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductAlertDialog } from "@/components/product-alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  clearLocalOfflineProjectData,
  type ClearLocalOfflineProjectDataResult,
} from "@/lib/offline-local-project-clear";
import {
  readOfflineConfirmedStoreSnapshot,
  type OfflineConfirmedProjectSummary,
  type OfflineConfirmedStoreSnapshot,
} from "@/lib/offline-confirmed-store-snapshot";
import type { OfflinePublicationProvenanceView } from "@/lib/offline-publication-provenance";
import {
  clearAppShellCache,
  readOfflineStorageManagementSnapshot,
  type ClearAppShellCacheResult,
  type OfflineStorageManagementSnapshot,
} from "@/lib/offline-storage-management";
import {
  buildLocalOfflineProjectClearConfirmation,
  getUserFacingOperationFailureMessage,
  sanitizeUserFacingDiagnostic,
} from "@/lib/user-facing-diagnostics";
import { formatUiDateTime } from "@/lib/ui-format";

type OfflineConfirmedStorePanelState =
  | {
      status: "idle";
    }
  | {
      status: "checking";
    }
  | {
      status: "ready";
      snapshot: OfflineConfirmedStoreSnapshot;
    }
  | {
      status: "error";
      message: string;
      checkedAt: string;
    };

type LocalOfflineProjectClearState =
  | {
      status: "idle";
    }
  | {
      status: "clearing";
      projectId: string;
    }
  | {
      status: "cleared";
      result: ClearLocalOfflineProjectDataResult;
    }
  | {
      status: "error";
      projectId: string;
      message: string;
      failedAt: string;
    };

type OfflineStorageManagementState =
  | {
      status: "idle";
    }
  | {
      status: "checking";
    }
  | {
      status: "ready";
      snapshot: OfflineStorageManagementSnapshot;
    }
  | {
      status: "clearingCache";
      snapshot: OfflineStorageManagementSnapshot | null;
    }
  | {
      status: "cacheCleared";
      snapshot: OfflineStorageManagementSnapshot;
      result: ClearAppShellCacheResult;
    }
  | {
      status: "error";
      message: string;
      failedAt: string;
    };

type ProjectStorageSummary = {
  projectId: string;
  projectTitle?: string;
  slideCount: number;
  assetCount: number;
  assetBlobCount: number;
  totalBlobSizeBytes: number;
  sourceTotalSizeBytes: number | null;
  syncStatus: string;
  lastSyncedAt: string;
  sourceUpdatedAt: string;
};

export function OfflineConfirmedStorePanel() {
  const [state, setState] = useState<OfflineConfirmedStorePanelState>({
    status: "idle",
  });
  const [clearState, setClearState] = useState<LocalOfflineProjectClearState>({
    status: "idle",
  });
  const [storageManagementState, setStorageManagementState] =
    useState<OfflineStorageManagementState>({
      status: "idle",
    });
  const [pendingConfirmation, setPendingConfirmation] = useState<
    | { kind: "project"; project: OfflineConfirmedProjectSummary }
    | { kind: "cache"; snapshot: OfflineStorageManagementSnapshot | null }
    | null
  >(null);
  const destructiveTriggerRef = useRef<HTMLButtonElement>(null);

  const isChecking = state.status === "checking";
  const isClearingProject = clearState.status === "clearing";
  const isCheckingStorage = storageManagementState.status === "checking";
  const isClearingCache = storageManagementState.status === "clearingCache";
  const clearingProjectId =
    clearState.status === "clearing" ? clearState.projectId : null;

  async function handleCheckConfirmedStore() {
    setState({ status: "checking" });

    try {
      const snapshot = await readOfflineConfirmedStoreSnapshot();

      setState({
        status: "ready",
        snapshot,
      });
    } catch (error) {
      setState({
        status: "error",
        message: getUserFacingOperationFailureMessage(
          "confirmedStoreCheck",
          error,
        ),
        checkedAt: new Date().toISOString(),
      });
    }
  }

  async function clearLocalOfflineProject(project: OfflineConfirmedProjectSummary) {
    setClearState({
      status: "clearing",
      projectId: project.projectId,
    });

    try {
      const result = await clearLocalOfflineProjectData(project.projectId);

      setClearState({
        status: "cleared",
        result,
      });

      try {
        const snapshot = await readOfflineConfirmedStoreSnapshot();

        setState({
          status: "ready",
          snapshot,
        });
      } catch (error) {
        setState({
          status: "error",
          message: getUserFacingOperationFailureMessage(
            "confirmedStoreCheck",
            error,
          ),
          checkedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      setClearState({
        status: "error",
        projectId: project.projectId,
        message: getUserFacingOperationFailureMessage(
          "localProjectClear",
          error,
        ),
        failedAt: new Date().toISOString(),
      });
    }
  }

  async function handleCheckStorageManagement() {
    setStorageManagementState({ status: "checking" });

    try {
      const snapshot = await readOfflineStorageManagementSnapshot();

      setStorageManagementState({
        status: "ready",
        snapshot,
      });
    } catch (error) {
      setStorageManagementState({
        status: "error",
        message: getUserFacingOperationFailureMessage(
          "storageManagementCheck",
          error,
        ),
        failedAt: new Date().toISOString(),
      });
    }
  }

  function requestClearLocalOfflineProject(
    project: OfflineConfirmedProjectSummary,
    trigger: HTMLButtonElement,
  ) {
    destructiveTriggerRef.current = trigger;
    setPendingConfirmation({ kind: "project", project });
  }

  function requestClearAppShellCache(trigger: HTMLButtonElement) {
    const snapshot =
      storageManagementState.status === "ready" ||
      storageManagementState.status === "cacheCleared"
        ? storageManagementState.snapshot
        : null;
    destructiveTriggerRef.current = trigger;
    setPendingConfirmation({ kind: "cache", snapshot });
  }

  async function performClearAppShellCache(snapshot: OfflineStorageManagementSnapshot | null) {
    setStorageManagementState({
      status: "clearingCache",
      snapshot,
    });

    try {
      const result = await clearAppShellCache();
      const snapshot = await readOfflineStorageManagementSnapshot();

      setStorageManagementState({
        status: "cacheCleared",
        result,
        snapshot,
      });
    } catch (error) {
      setStorageManagementState({
        status: "error",
        message: getUserFacingOperationFailureMessage(
          "appShellCacheClear",
          error,
        ),
        failedAt: new Date().toISOString(),
      });
    }
  }

  function confirmPendingClear() {
    const pending = pendingConfirmation;
    if (!pending) return;
    setPendingConfirmation(null);
    if (pending.kind === "project") {
      void clearLocalOfflineProject(pending.project);
    } else {
      void performClearAppShellCache(pending.snapshot);
    }
  }

  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>端末保存データ</CardTitle>
          <Badge variant={state.status === "ready" ? "secondary" : "outline"}>
            {getStateLabel(state.status)}
          </Badge>
        </div>
        <CardDescription className="text-slate-300">
          ローカルへの保存後に、アルバム・素材・再生データ・保存状態を確認します。
          素材本体は画面表示せず、種類・件数・保存容量だけを表示します。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-slate-300">
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          onClick={handleCheckConfirmedStore}
          disabled={isChecking || isClearingProject}
        >
          {isChecking ? "端末保存データを確認中" : "端末保存データを確認"}
        </Button>

        <OfflineStorageManagementView
          state={storageManagementState}
          isBusy={isCheckingStorage || isClearingCache || isClearingProject}
          onCheck={handleCheckStorageManagement}
          onClearAppShellCache={requestClearAppShellCache}
        />

        {state.status === "idle" ? (
          <p className="text-sm text-slate-400">
            ローカルへの保存が完了した後に押すと、保存結果と
            アルバムごとのローカル保存容量を確認できます。
          </p>
        ) : null}

        {clearState.status === "cleared" ? (
          <ClearLocalOfflineProjectDataResultView result={clearState.result} />
        ) : null}

        {clearState.status === "error" ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">
            <p className="font-semibold">
              プロジェクト単位のローカル保存データを削除できませんでした。
            </p>
            <div className="mt-3 space-y-1">
              <p>{clearState.message}</p>
              <p>失敗日時: {formatUiDateTime(clearState.failedAt)}</p>
            </div>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">
            <p className="font-semibold">端末保存データを確認できませんでした。</p>
            <div className="mt-3 space-y-1">
              <p>{state.message}</p>
              <p>確認日時: {formatUiDateTime(state.checkedAt)}</p>
            </div>
          </div>
        ) : null}

        {state.status === "ready" ? (
          <ConfirmedStoreSnapshotView
            snapshot={state.snapshot}
            clearingProjectId={clearingProjectId}
            onClearProject={requestClearLocalOfflineProject}
          />
        ) : null}

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <p className="font-semibold">プロジェクト単位のローカル削除について</p>
          <p className="mt-2">
            削除するのは、この端末の端末内データベース（IndexedDB）に保存された対象プロジェクトの
            再生用コピーだけです。Google Drive上の保存領域・プロジェクト設定・素材は削除しません。
            素材本体は画面表示せず、種類・件数・保存容量だけを表示します。
          </p>
        </div>
      </CardContent>
      {pendingConfirmation ? (
        <ProductAlertDialog
          title={pendingConfirmation.kind === "project" ? "ローカルの保存データを削除しますか？" : "アプリの基本ファイルを削除しますか？"}
          description={pendingConfirmation.kind === "project"
            ? buildLocalOfflineProjectClearConfirmation(pendingConfirmation.project)
            : "画面本体とアプリの基本ファイルを削除します。\nこの端末のアルバム・素材・再生データと、Google Drive上のデータは削除しません。\nオンラインなら画面を再取得できます。"}
          confirmLabel="削除する"
          triggerRef={destructiveTriggerRef}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={confirmPendingClear}
        />
      ) : null}
    </Card>
  );
}

function OfflineStorageManagementView({
  state,
  isBusy,
  onCheck,
  onClearAppShellCache,
}: {
  state: OfflineStorageManagementState;
  isBusy: boolean;
  onCheck: () => void;
  onClearAppShellCache: (trigger: HTMLButtonElement) => void;
}) {
  const snapshot =
    state.status === "ready" ||
    state.status === "cacheCleared" ||
    state.status === "clearingCache"
      ? state.snapshot
      : null;
  const canClearAppShellCache =
    snapshot?.cacheStorage.supported === true &&
    snapshot.cacheStorage.appShellCacheExists;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-slate-50">端末ストレージ概要</p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
            ブラウザが報告する保存使用量と、PWA起動に使うアプリ表示用キャッシュを確認します。
            端末内データベース（IndexedDB）の再生データとは別に管理されます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={onCheck}
            disabled={isBusy}
          >
            {state.status === "checking"
              ? "ストレージ確認中"
              : "端末ストレージを確認"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            onClick={(event) => onClearAppShellCache(event.currentTarget)}
            disabled={isBusy || !canClearAppShellCache}
          >
            {state.status === "clearingCache"
              ? "キャッシュを削除中"
              : "アプリ表示用キャッシュを削除"}
          </Button>
        </div>
      </div>

      {state.status === "idle" ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          アプリ表示用キャッシュの容量はブラウザから取得できないため、項目数と
          端末全体のブラウザ保存使用量を併記します。
        </p>
      ) : null}

      {state.status === "error" ? (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">
          <p className="font-semibold">
            端末ストレージ情報を操作できませんでした。
          </p>
          <div className="mt-3 space-y-1 text-xs">
            <p>{state.message}</p>
            <p>失敗日時: {formatUiDateTime(state.failedAt)}</p>
          </div>
        </div>
      ) : null}

      {state.status === "cacheCleared" ? (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
          <p className="font-semibold">アプリ表示用キャッシュを削除しました。</p>
          <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
            <SummaryRow
              label="削除結果"
              value={state.result.deleted ? "削除済み" : "対象なし"}
            />
            <SummaryRow label="削除日時" value={formatUiDateTime(state.result.clearedAt)} />
          </dl>
        </div>
      ) : null}

      {snapshot ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <CountCard
              label="ブラウザ保存使用量"
              value={formatBytes(snapshot.storageEstimate.usageBytes)}
            />
            <CountCard
              label="ブラウザ保存上限"
              value={formatBytes(snapshot.storageEstimate.quotaBytes)}
            />
            <CountCard
              label="使用率"
              value={formatPercent(snapshot.storageEstimate.usageRatio)}
            />
            <CountCard
              label="アプリ表示用項目"
              value={snapshot.cacheStorage.appShellRequestCount}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-3">
              <p className="font-medium text-slate-50">ブラウザ保存領域</p>
              <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                <SummaryRow
                  label="容量確認"
                  value={snapshot.storageEstimate.supported ? "対応" : "未対応"}
                />
                <SummaryRow
                  label="永続保存"
                  value={formatNullableBoolean(snapshot.storageEstimate.persisted)}
                />
                {Object.entries(snapshot.storageEstimate.usageDetails).map(
                  ([name, sizeBytes]) => (
                    <SummaryRow
                      key={name}
                      label={`内訳: ${name}`}
                      value={formatBytes(sizeBytes)}
                    />
                  ),
                )}
              </dl>
            </div>

            <div className="rounded-xl border border-white/10 p-3">
              <p className="font-medium text-slate-50">アプリ表示用キャッシュ</p>
              <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                <SummaryRow
                  label="キャッシュ機能"
                  value={snapshot.cacheStorage.supported ? "対応" : "未対応"}
                />
                <SummaryRow
                  label="キャッシュ数"
                  value={snapshot.cacheStorage.cacheNames.length}
                />
                <SummaryRow
                  label="全項目数"
                  value={snapshot.cacheStorage.totalRequestCount}
                />
                <SummaryRow
                  label="アプリ表示用キャッシュ"
                  value={
                    snapshot.cacheStorage.appShellCacheExists ? "あり" : "なし"
                  }
                />
              </dl>

              <p className="mt-3 text-xs text-slate-500">
                保存されている個別URLや内部キャッシュ名は表示しません。
              </p>
            </div>
          </div>

          <p className="text-xs leading-5 text-slate-500">
            アプリ表示用キャッシュを削除しても、端末内データベース（IndexedDB）に保存された
            プロジェクトと素材は残ります。再生用データを消す場合は、
            プロジェクト単位のローカル削除を使います。
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ClearLocalOfflineProjectDataResultView({
  result,
}: {
  result: ClearLocalOfflineProjectDataResult;
}) {
  return (
    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
      <p className="font-semibold">
        プロジェクト単位のローカル保存データを削除しました。
      </p>
      <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
        <SummaryRow label="削除日時" value={formatUiDateTime(result.clearedAt)} />
        <SummaryRow label="プロジェクト" value={result.deletedProjects} />
        <SummaryRow label="素材情報" value={result.deletedAssets} />
        <SummaryRow label="素材本体" value={result.deletedAssetBlobs} />
        <SummaryRow label="同期状態" value={result.deletedSyncStates} />
        <SummaryRow
          label="同期中の一時プロジェクト"
          value={result.deletedStagingProjects}
        />
        <SummaryRow label="同期中の一時素材" value={result.deletedStagingAssets} />
        <SummaryRow
          label="同期中の一時素材本体"
          value={result.deletedStagingAssetBlobs}
        />
      </dl>
    </div>
  );
}

function ConfirmedStoreSnapshotView({
  snapshot,
  clearingProjectId,
  onClearProject,
}: {
  snapshot: OfflineConfirmedStoreSnapshot;
  clearingProjectId: string | null;
  onClearProject: (project: OfflineConfirmedProjectSummary, trigger: HTMLButtonElement) => void;
}) {
  const totalAssetBlobSizeBytes = getTotalAssetBlobSizeBytes(snapshot);
  const projectStorageSummaries = snapshot.projects.map((project) =>
    buildProjectStorageSummary(snapshot, project),
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <CountCard label="プロジェクト" value={snapshot.projectCount} />
        <CountCard label="素材情報" value={snapshot.assetCount} />
        <CountCard label="素材本体" value={snapshot.assetBlobCount} />
        <CountCard label="同期状態" value={snapshot.syncStateCount} />
        <CountCard
          label="素材本体の容量"
          value={formatBytes(totalAssetBlobSizeBytes)}
        />
      </div>

      <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100">
        <p className="font-semibold">素材情報と端末に保存した本体</p>
        <p className="mt-2 leading-6">
          素材情報と保存した本体の件数は一致しない場合があります。大容量動画は
          オンライン再生用の情報だけをローカルに保持し、本体は保存しません。
          この差は異常や同期失敗を意味せず、オンライン時はGoogle Driveから再生できます。
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="font-semibold text-slate-50">確認日時</p>
        <p className="mt-2 text-slate-300">{formatUiDateTime(snapshot.checkedAt)}</p>
      </div>

      {projectStorageSummaries.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-slate-50">
              プロジェクト別の保存容量
            </p>
            <p className="text-xs text-slate-500">
              プロジェクトごとの素材情報・保存本体の件数、保存容量、最終同期状態です。
              大容量動画では再生情報だけを保持するため、件数が一致しない場合があります。
            </p>
          </div>

          <div className="mt-3 space-y-3">
            {projectStorageSummaries.map((summary) => (
              <div
                key={summary.projectId}
                className="rounded-xl border border-white/10 p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-50">
                      {summary.projectTitle ?? "名称未設定"}
                    </p>
                  </div>
                  <Badge
                    variant={summary.syncStatus === "ready" ? "secondary" : "outline"}
                    className={
                      summary.syncStatus === "ready"
                        ? undefined
                        : "border-slate-500 text-slate-200"
                    }
                  >
                    {formatSyncStatus(summary.syncStatus)}
                  </Badge>
                </div>

                <dl className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
                  <SummaryRow label="スライド" value={summary.slideCount} />
                  <SummaryRow label="素材情報" value={summary.assetCount} />
                  <SummaryRow
                    label="保存した素材本体"
                    value={summary.assetBlobCount}
                  />
                  <SummaryRow
                    label="端末保存容量"
                    value={formatBytes(summary.totalBlobSizeBytes)}
                  />
                  <SummaryRow
                    label="元データ容量"
                    value={
                      summary.sourceTotalSizeBytes === null
                        ? "未取得"
                        : formatBytes(summary.sourceTotalSizeBytes)
                    }
                  />
                  <SummaryRow label="最終同期日時" value={formatUiDateTime(summary.lastSyncedAt)} />
                  <SummaryRow
                    label="Drive更新日時"
                    value={formatUiDateTime(summary.sourceUpdatedAt)}
                  />
                </dl>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {snapshot.projects.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">保存済みプロジェクト</p>
          <div className="mt-3 space-y-3">
            {snapshot.projects.map((project) => {
              const projectStorageSummary = buildProjectStorageSummary(
                snapshot,
                project,
              );

              return (
                <div
                  key={project.projectId}
                  className="rounded-xl border border-white/10 p-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <p className="font-medium text-slate-50">
                      {project.projectTitle ?? "名称未設定"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="secondary" className="min-h-11">
                        <Link href={createPlayerProjectHref(project.projectId)}>
                          このプロジェクトを再生
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="min-h-11"
                        onClick={(event) => onClearProject(project, event.currentTarget)}
                        disabled={clearingProjectId !== null}
                      >
                        {clearingProjectId === project.projectId
                          ? "このプロジェクトを削除中"
                          : "このプロジェクトのローカル保存を削除"}
                      </Button>
                    </div>
                  </div>
                  <ConfirmedPublicationProvenance
                    provenance={project.publicationProvenance}
                  />
                  <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                    <SummaryRow label="スライド" value={project.slideCount} />
                    <SummaryRow
                      label="端末保存容量"
                      value={formatBytes(projectStorageSummary.totalBlobSizeBytes)}
                    />
                    <SummaryRow
                      label="保存した素材本体"
                      value={projectStorageSummary.assetBlobCount}
                    />
                    <SummaryRow label="同期日時" value={project.syncedAt} />
                    <SummaryRow
                      label="Drive更新日時"
                      value={project.sourceUpdatedAt ?? "未取得"}
                    />
                  </dl>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {snapshot.syncStates.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">プロジェクト別の同期状態</p>
          <div className="mt-3 space-y-3">
            {snapshot.syncStates.map((syncState) => (
              <div
                key={syncState.projectId}
                className="rounded-xl border border-white/10 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-50">
                    {snapshot.projects.find(
                      (project) => project.projectId === syncState.projectId,
                    )?.projectTitle ?? "名称未設定"}
                  </p>
                  <Badge
                    variant={syncState.status === "ready" ? "secondary" : "outline"}
                    className={
                      syncState.status === "ready"
                        ? undefined
                        : "border-slate-500 text-slate-200"
                    }
                  >
                    {formatSyncStatus(syncState.status)}
                  </Badge>
                </div>
                <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                  <SummaryRow label="スライド" value={syncState.slideCount} />
                  <SummaryRow label="素材" value={syncState.assetCount} />
                  <SummaryRow label="同期日時" value={syncState.syncedAt ?? "未取得"} />
                  <SummaryRow
                    label="Drive更新日時"
                    value={syncState.sourceUpdatedAt ?? "未取得"}
                  />
                  <SummaryRow
                    label="直近の失敗"
                    value={syncState.lastErrorCode ? "要確認" : "なし"}
                  />
                  <SummaryRow
                    label="最終失敗日時"
                    value={syncState.lastFailedAt ?? "なし"}
                  />
                </dl>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {snapshot.assets.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">保存済み素材</p>
          <div className="mt-3 max-h-72 space-y-3 overflow-auto pr-1">
            {snapshot.assets.map((asset) => (
              <div
                key={asset.assetId}
                className="rounded-xl border border-white/10 p-3"
              >
                <p className="font-medium text-slate-50">
                  {asset.sourceName ?? "名称未設定"}
                </p>
                <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                  <SummaryRow
                    label="種類"
                    value={formatStoredAssetType(asset.blobMimeType)}
                  />
                  <SummaryRow
                    label="端末保存容量"
                    value={formatBytes(asset.blobSizeBytes)}
                  />
                  <SummaryRow
                    label="元データ容量"
                    value={
                      asset.sourceSizeBytes === undefined
                        ? "未取得"
                        : formatBytes(asset.sourceSizeBytes)
                    }
                  />
                  <SummaryRow
                    label="保存形式"
                    value={formatBlobVariant(asset.blobVariant)}
                  />
                  <SummaryRow label="本体の保存状態" value={formatBlobStatus(asset.blobStatus)} />
                </dl>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {snapshot.diagnostics.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">
            保存状態に要確認項目があります
          </p>
          <p className="mt-2 text-slate-300">
            要確認項目は{snapshot.diagnostics.length}
            件です。ローカルへの保存をもう一度実行して状態を確認してください。
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CountCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-50">{value}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="break-all font-medium text-slate-200">{value}</dd>
    </div>
  );
}

function buildProjectStorageSummary(
  snapshot: OfflineConfirmedStoreSnapshot,
  project: OfflineConfirmedProjectSummary,
): ProjectStorageSummary {
  const projectAssets = snapshot.assets.filter(
    (asset) => asset.projectId === project.projectId,
  );
  const projectAssetBlobs = snapshot.assetBlobs.filter(
    (assetBlob) => assetBlob.projectId === project.projectId,
  );
  const projectSyncState = snapshot.syncStates.find(
    (syncState) => syncState.projectId === project.projectId,
  );

  const sourceSizeBytesValues = projectAssets
    .map((asset) => asset.sourceSizeBytes)
    .filter((sizeBytes): sizeBytes is number => typeof sizeBytes === "number");

  return {
    projectId: project.projectId,
    projectTitle: project.projectTitle,
    slideCount: project.slideCount,
    assetCount: projectAssets.length,
    assetBlobCount: projectAssetBlobs.length,
    totalBlobSizeBytes: projectAssetBlobs.reduce(
      (total, assetBlob) => total + assetBlob.blobSizeBytes,
      0,
    ),
    sourceTotalSizeBytes:
      sourceSizeBytesValues.length === 0
        ? null
        : sourceSizeBytesValues.reduce((total, sizeBytes) => total + sizeBytes, 0),
    syncStatus: projectSyncState?.status ?? "missing",
    lastSyncedAt: projectSyncState?.syncedAt ?? project.syncedAt,
    sourceUpdatedAt:
      projectSyncState?.sourceUpdatedAt ?? project.sourceUpdatedAt ?? "未取得",
  };
}

function getTotalAssetBlobSizeBytes(snapshot: OfflineConfirmedStoreSnapshot) {
  return snapshot.assetBlobs.reduce(
    (total, assetBlob) => total + assetBlob.blobSizeBytes,
    0,
  );
}

function formatBytes(sizeBytes: number | null) {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "未取得";
  }

  if (sizeBytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(sizeBytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = sizeBytes / 1024 ** unitIndex;
  const fractionDigits = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function formatPercent(ratio: number | null) {
  if (ratio === null || !Number.isFinite(ratio) || ratio < 0) {
    return "未取得";
  }

  return `${(ratio * 100).toFixed(ratio < 0.1 ? 2 : 1)}%`;
}

function formatNullableBoolean(value: boolean | null) {
  if (value === null) {
    return "未取得";
  }

  return value ? "はい" : "いいえ";
}

function getStateLabel(state: OfflineConfirmedStorePanelState["status"]) {
  switch (state) {
    case "idle":
      return "未確認";
    case "checking":
      return "確認中";
    case "ready":
      return "確認済み";
    case "error":
      return "確認失敗";
    default:
      return state;
  }
}

function ConfirmedPublicationProvenance({
  provenance,
}: {
  provenance: OfflinePublicationProvenanceView;
}) {
  const warning = provenance.warning;
  return (
    <div
      className={
        warning
          ? "mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-amber-100"
          : provenance.tone === "success"
            ? "mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-emerald-100"
            : "mt-3 rounded-xl border border-white/15 bg-white/5 p-3 text-slate-200"
      }
      role={warning ? "alert" : "status"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{provenance.label}</Badge>
        {provenance.operation ? (
          <span className="text-xs">公開操作: {formatPublicationOperation(provenance.operation)}</span>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-6">
        {sanitizeUserFacingDiagnostic(provenance.message)}
      </p>
      {provenance.publishedAt ? (
        <p className="text-xs">公開日時: {provenance.publishedAt}</p>
      ) : null}
      {provenance.needsInspectionReason ? (
        <p className="text-xs">
          確認理由: {sanitizeUserFacingDiagnostic(provenance.needsInspectionReason)}
        </p>
      ) : null}
    </div>
  );
}

function formatSyncStatus(status: string) {
  switch (status) {
    case "ready":
      return "同期済み";
    case "syncing":
      return "同期中";
    case "failed":
      return "同期失敗";
    case "corrupt":
      return "データ不整合";
    case "missing":
      return "同期情報なし";
    default:
      return "要確認";
  }
}

function formatBlobStatus(status: string) {
  return status === "ready" ? "保存済み" : "本体未保存";
}

function formatBlobVariant(variant: string) {
  return variant === "original" ? "元の形式" : "再生用に変換済み";
}

function formatStoredAssetType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "画像";
  if (mimeType.startsWith("video/")) return "動画";
  return "その他";
}

function formatPublicationOperation(operation: string) {
  return operation === "publish" ? "公開" : operation === "rollback" ? "ロールバック" : "要確認";
}

function createPlayerProjectHref(projectId: string) {
  return `/player?projectId=${encodeURIComponent(projectId)}`;
}
