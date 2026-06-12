"use client";

import { useState } from "react";
import Link from "next/link";
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
  clearLocalOfflineProjectData,
  type ClearLocalOfflineProjectDataResult,
} from "@/lib/offline-local-project-clear";
import {
  readOfflineConfirmedStoreSnapshot,
  type OfflineConfirmedProjectSummary,
  type OfflineConfirmedStoreSnapshot,
} from "@/lib/offline-confirmed-store-snapshot";
import {
  clearAppShellCache,
  readOfflineStorageManagementSnapshot,
  type ClearAppShellCacheResult,
  type OfflineStorageManagementSnapshot,
} from "@/lib/offline-storage-management";

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
      errorName: string;
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
      errorName: string;
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
      errorName: string;
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
        errorName: getErrorName(error),
        message: getErrorMessage(error),
        checkedAt: new Date().toISOString(),
      });
    }
  }

  async function handleClearLocalOfflineProject(
    project: OfflineConfirmedProjectSummary,
  ) {
    const projectLabel = project.projectTitle ?? formatIdPart(project.projectId);

    const shouldClear = window.confirm(
      [
        "この端末に保存された対象プロジェクトのオフライン再生用データを削除します。",
        "",
        `対象 project: ${projectLabel}`,
        `projectId: ${project.projectId}`,
        "",
        "削除対象:",
        "・confirmed project",
        "・asset metadata",
        "・asset Blob、つまりローカル保存写真",
        "・sync state",
        "・staging records",
        "",
        "Google Drive 上の project / manifest / assets は削除しません。",
        "削除後にこのプロジェクトを再生するには、管理画面で offline sync を再実行してください。",
        "",
        "削除しますか？",
      ].join("\n"),
    );

    if (!shouldClear) {
      return;
    }

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
          errorName: getErrorName(error),
          message: getErrorMessage(error),
          checkedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      setClearState({
        status: "error",
        projectId: project.projectId,
        errorName: getErrorName(error),
        message: getErrorMessage(error),
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
        errorName: getErrorName(error),
        message: getErrorMessage(error),
        failedAt: new Date().toISOString(),
      });
    }
  }

  async function handleClearAppShellCache() {
    const currentSnapshot =
      storageManagementState.status === "ready" ||
      storageManagementState.status === "cacheCleared"
        ? storageManagementState.snapshot
        : null;

    const shouldClear = window.confirm(
      [
        "Service Worker の app shell cache を削除します。",
        "",
        "削除対象:",
        "・画面本体の cache",
        "・manifest / icons / Next.js static chunks の cache",
        "",
        "削除しないもの:",
        "・IndexedDB の project / asset metadata / asset Blob",
        "・Google Drive 上の workspace / project / manifest / assets",
        "",
        "削除後もオンラインなら画面は再取得できます。",
        "オフライン起動確認をやり直す場合は、オンラインで各画面を一度開いて cache を作り直してください。",
        "",
        "削除しますか？",
      ].join("\n"),
    );

    if (!shouldClear) {
      return;
    }

    setStorageManagementState({
      status: "clearingCache",
      snapshot: currentSnapshot,
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
        errorName: getErrorName(error),
        message: getErrorMessage(error),
        failedAt: new Date().toISOString(),
      });
    }
  }

  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>confirmed offline store</CardTitle>
          <Badge variant={state.status === "ready" ? "secondary" : "outline"}>
            {getStateLabel(state.status)}
          </Badge>
        </div>
        <CardDescription className="text-slate-300">
          offline sync 後に IndexedDB confirmed stores の project / assets /
          asset blobs / sync state を確認します。
          Blob本体は画面表示せず、metadata と件数だけを表示します。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-slate-300">
        <Button
          type="button"
          variant="secondary"
          onClick={handleCheckConfirmedStore}
          disabled={isChecking || isClearingProject}
        >
          {isChecking
            ? "confirmed store を確認中"
            : "confirmed store を確認"}
        </Button>

        <OfflineStorageManagementView
          state={storageManagementState}
          isBusy={isCheckingStorage || isClearingCache || isClearingProject}
          onCheck={handleCheckStorageManagement}
          onClearAppShellCache={handleClearAppShellCache}
        />

        {state.status === "idle" ? (
          <p className="text-sm text-slate-400">
            offline sync 完了後に押すと、confirmed offline store の保存結果と
            project ごとのローカル保存容量を確認できます。
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
              <p>projectId: {formatIdPart(clearState.projectId)}</p>
              <p>error name: {clearState.errorName}</p>
              <p>{clearState.message}</p>
              <p>failedAt: {clearState.failedAt}</p>
            </div>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">
            <p className="font-semibold">confirmed store を確認できませんでした。</p>
            <div className="mt-3 space-y-1">
              <p>error name: {state.errorName}</p>
              <p>{state.message}</p>
              <p>checkedAt: {state.checkedAt}</p>
            </div>
          </div>
        ) : null}

        {state.status === "ready" ? (
          <ConfirmedStoreSnapshotView
            snapshot={state.snapshot}
            clearingProjectId={clearingProjectId}
            onClearProject={handleClearLocalOfflineProject}
          />
        ) : null}

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <p className="font-semibold">プロジェクト単位のローカル削除について</p>
          <p className="mt-2">
            削除するのは、この端末の IndexedDB に保存された対象 project の
            offline playback 用コピーだけです。Google Drive 上の workspace /
            project / manifest / assets は削除しません。
            Blob本体は画面表示せず、metadata・件数・保存容量だけを表示します。
          </p>
        </div>
      </CardContent>
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
  onClearAppShellCache: () => void;
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
            ブラウザが報告する保存使用量と Service Worker の app shell cache
            を確認します。IndexedDB の asset Blob 管理とは別の、PWA 起動用 cache
            の状態です。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
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
            onClick={onClearAppShellCache}
            disabled={isBusy || !canClearAppShellCache}
          >
            {state.status === "clearingCache"
              ? "cache 削除中"
              : "app shell cache を削除"}
          </Button>
        </div>
      </div>

      {state.status === "idle" ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Cache Storage の容量はブラウザが個別 bytes を返さないため、件数と
          browser storage estimate を併記します。
        </p>
      ) : null}

      {state.status === "error" ? (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">
          <p className="font-semibold">
            端末ストレージ情報を操作できませんでした。
          </p>
          <div className="mt-3 space-y-1 text-xs">
            <p>error name: {state.errorName}</p>
            <p>{state.message}</p>
            <p>failedAt: {state.failedAt}</p>
          </div>
        </div>
      ) : null}

      {state.status === "cacheCleared" ? (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
          <p className="font-semibold">app shell cache を削除しました。</p>
          <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
            <SummaryRow label="cache" value={state.result.cacheName} />
            <SummaryRow
              label="deleted"
              value={state.result.deleted ? "削除済み" : "対象なし"}
            />
            <SummaryRow label="clearedAt" value={state.result.clearedAt} />
          </dl>
        </div>
      ) : null}

      {snapshot ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <CountCard
              label="storage usage"
              value={formatBytes(snapshot.storageEstimate.usageBytes)}
            />
            <CountCard
              label="storage quota"
              value={formatBytes(snapshot.storageEstimate.quotaBytes)}
            />
            <CountCard
              label="usage ratio"
              value={formatPercent(snapshot.storageEstimate.usageRatio)}
            />
            <CountCard
              label="app cache entries"
              value={snapshot.cacheStorage.appShellRequestCount}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-3">
              <p className="font-medium text-slate-50">browser storage</p>
              <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                <SummaryRow
                  label="estimate"
                  value={snapshot.storageEstimate.supported ? "対応" : "未対応"}
                />
                <SummaryRow
                  label="persistent"
                  value={formatNullableBoolean(snapshot.storageEstimate.persisted)}
                />
                {Object.entries(snapshot.storageEstimate.usageDetails).map(
                  ([name, sizeBytes]) => (
                    <SummaryRow
                      key={name}
                      label={`usage.${name}`}
                      value={formatBytes(sizeBytes)}
                    />
                  ),
                )}
              </dl>
            </div>

            <div className="rounded-xl border border-white/10 p-3">
              <p className="font-medium text-slate-50">Cache Storage</p>
              <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                <SummaryRow
                  label="cache API"
                  value={snapshot.cacheStorage.supported ? "対応" : "未対応"}
                />
                <SummaryRow
                  label="cache count"
                  value={snapshot.cacheStorage.cacheNames.length}
                />
                <SummaryRow
                  label="total entries"
                  value={snapshot.cacheStorage.totalRequestCount}
                />
                <SummaryRow
                  label="app shell cache"
                  value={
                    snapshot.cacheStorage.appShellCacheExists ? "あり" : "なし"
                  }
                />
              </dl>

              <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                <p className="text-xs font-medium text-slate-200">
                  {snapshot.cacheStorage.appShellCacheName}
                </p>
                {snapshot.cacheStorage.appShellSampleUrls.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    {snapshot.cacheStorage.appShellSampleUrls.map((url) => (
                      <p key={url} className="break-all">
                        {url}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    app shell cache の保存リクエストはまだ確認できません。
                  </p>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs leading-5 text-slate-500">
            app shell cache を削除しても、IndexedDB に保存された project / asset
            metadata / asset Blob は残ります。offline 再生用データを消す場合は、
            project 単位のローカル削除を使います。
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
        <SummaryRow label="projectId" value={formatIdPart(result.projectId)} />
        <SummaryRow label="clearedAt" value={result.clearedAt} />
        <SummaryRow label="projects" value={result.deletedProjects} />
        <SummaryRow label="assets" value={result.deletedAssets} />
        <SummaryRow label="asset blobs" value={result.deletedAssetBlobs} />
        <SummaryRow label="sync states" value={result.deletedSyncStates} />
        <SummaryRow
          label="staging projects"
          value={result.deletedStagingProjects}
        />
        <SummaryRow label="staging assets" value={result.deletedStagingAssets} />
        <SummaryRow
          label="staging asset blobs"
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
  onClearProject: (project: OfflineConfirmedProjectSummary) => void;
}) {
  const totalAssetBlobSizeBytes = getTotalAssetBlobSizeBytes(snapshot);
  const projectStorageSummaries = snapshot.projects.map((project) =>
    buildProjectStorageSummary(snapshot, project),
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <CountCard label="projects" value={snapshot.projectCount} />
        <CountCard label="assets" value={snapshot.assetCount} />
        <CountCard label="asset blobs" value={snapshot.assetBlobCount} />
        <CountCard label="sync states" value={snapshot.syncStateCount} />
        <CountCard
          label="blob bytes"
          value={formatBytes(totalAssetBlobSizeBytes)}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="font-semibold text-slate-50">確認日時</p>
        <p className="mt-2 text-slate-300">{snapshot.checkedAt}</p>
      </div>

      {projectStorageSummaries.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-slate-50">
              project storage summary
            </p>
            <p className="text-xs text-slate-500">
              project ごとの asset metadata / asset Blob 件数、保存容量、最終同期状態です。
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
                    <p className="mt-1 text-xs text-slate-500">
                      {formatIdPart(summary.projectId)}
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
                    {summary.syncStatus}
                  </Badge>
                </div>

                <dl className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
                  <SummaryRow label="slides" value={summary.slideCount} />
                  <SummaryRow label="assets" value={summary.assetCount} />
                  <SummaryRow
                    label="asset blobs"
                    value={summary.assetBlobCount}
                  />
                  <SummaryRow
                    label="local blob size"
                    value={formatBytes(summary.totalBlobSizeBytes)}
                  />
                  <SummaryRow
                    label="source size"
                    value={
                      summary.sourceTotalSizeBytes === null
                        ? "未取得"
                        : formatBytes(summary.sourceTotalSizeBytes)
                    }
                  />
                  <SummaryRow label="last synced" value={summary.lastSyncedAt} />
                  <SummaryRow
                    label="sourceUpdatedAt"
                    value={summary.sourceUpdatedAt}
                  />
                </dl>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {snapshot.projects.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">confirmed projects</p>
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
                      <Button asChild variant="secondary">
                        <Link href={createPlayerProjectHref(project.projectId)}>
                          このprojectを再生
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => onClearProject(project)}
                        disabled={clearingProjectId !== null}
                      >
                        {clearingProjectId === project.projectId
                          ? "このprojectを削除中"
                          : "このprojectのローカル保存を削除"}
                      </Button>
                    </div>
                  </div>
                  <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                    <SummaryRow
                      label="projectId"
                      value={formatIdPart(project.projectId)}
                    />
                    <SummaryRow label="slides" value={project.slideCount} />
                    <SummaryRow
                      label="local blob size"
                      value={formatBytes(projectStorageSummary.totalBlobSizeBytes)}
                    />
                    <SummaryRow
                      label="asset blobs"
                      value={projectStorageSummary.assetBlobCount}
                    />
                    <SummaryRow
                      label="manifestFileId"
                      value={formatIdPart(project.sourceManifestFileId)}
                    />
                    <SummaryRow label="syncedAt" value={project.syncedAt} />
                    <SummaryRow
                      label="sourceUpdatedAt"
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
          <p className="font-semibold text-slate-50">offline sync states</p>
          <div className="mt-3 space-y-3">
            {snapshot.syncStates.map((syncState) => (
              <div
                key={syncState.projectId}
                className="rounded-xl border border-white/10 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-50">
                    {formatIdPart(syncState.projectId)}
                  </p>
                  <Badge
                    variant={syncState.status === "ready" ? "secondary" : "outline"}
                    className={
                      syncState.status === "ready"
                        ? undefined
                        : "border-slate-500 text-slate-200"
                    }
                  >
                    {syncState.status}
                  </Badge>
                </div>
                <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                  <SummaryRow
                    label="syncRunId"
                    value={formatIdPart(syncState.syncRunId)}
                  />
                  <SummaryRow label="slides" value={syncState.slideCount} />
                  <SummaryRow label="assets" value={syncState.assetCount} />
                  <SummaryRow label="syncedAt" value={syncState.syncedAt ?? "未取得"} />
                  <SummaryRow
                    label="sourceUpdatedAt"
                    value={syncState.sourceUpdatedAt ?? "未取得"}
                  />
                  <SummaryRow
                    label="lastErrorCode"
                    value={syncState.lastErrorCode ?? "なし"}
                  />
                  <SummaryRow
                    label="lastFailedAt"
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
          <p className="font-semibold text-slate-50">confirmed assets</p>
          <div className="mt-3 max-h-72 space-y-3 overflow-auto pr-1">
            {snapshot.assets.map((asset) => (
              <div
                key={asset.assetId}
                className="rounded-xl border border-white/10 p-3"
              >
                <p className="font-medium text-slate-50">
                  {asset.sourceName ?? formatIdPart(asset.assetId)}
                </p>
                <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                  <SummaryRow label="assetId" value={formatIdPart(asset.assetId)} />
                  <SummaryRow
                    label="projectId"
                    value={formatIdPart(asset.projectId)}
                  />
                  <SummaryRow
                    label="sourceDriveFileId"
                    value={formatIdPart(asset.sourceDriveFileId)}
                  />
                  <SummaryRow label="mimeType" value={asset.blobMimeType} />
                  <SummaryRow
                    label="blobSize"
                    value={formatBytes(asset.blobSizeBytes)}
                  />
                  <SummaryRow
                    label="sourceSize"
                    value={
                      asset.sourceSizeBytes === undefined
                        ? "未取得"
                        : formatBytes(asset.sourceSizeBytes)
                    }
                  />
                  <SummaryRow label="variant" value={asset.blobVariant} />
                  <SummaryRow label="blobStatus" value={asset.blobStatus} />
                </dl>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {snapshot.diagnostics.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">confirmed store 診断</p>
          <div className="mt-3 space-y-2">
            {snapshot.diagnostics.map((diagnostic, index) => (
              <p key={`${diagnostic}-${index}`}>・{formatDiagnostic(diagnostic)}</p>
            ))}
          </div>
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

function getErrorName(error: unknown) {
  if (error instanceof Error) {
    return error.name;
  }

  return "UnknownError";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "confirmed offline store の操作中に不明なエラーが発生しました。";
}

function formatIdPart(id: string | undefined) {
  if (!id) {
    return "未設定";
  }

  return `${id.slice(0, 8)}...`;
}

function formatDiagnostic(diagnostic: string) {
  if (diagnostic.length <= 180) {
    return diagnostic;
  }

  return `${diagnostic.slice(0, 179)}…`;
}

function createPlayerProjectHref(projectId: string) {
  return `/player?projectId=${encodeURIComponent(projectId)}`;
}
