"use client";

import { useState } from "react";
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
  readOfflineConfirmedStoreSnapshot,
  type OfflineConfirmedStoreSnapshot,
} from "@/lib/offline-confirmed-store-snapshot";

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

export function OfflineConfirmedStorePanel() {
  const [state, setState] = useState<OfflineConfirmedStorePanelState>({
    status: "idle",
  });

  const isChecking = state.status === "checking";

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
          asset blobs / sync state を読み取り専用で確認します。
          Blob本体は画面表示せず、metadata と件数だけを表示します。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-slate-300">
        <Button
          type="button"
          variant="secondary"
          onClick={handleCheckConfirmedStore}
          disabled={isChecking}
        >
          {isChecking
            ? "confirmed store を確認中"
            : "confirmed store を確認"}
        </Button>

        {state.status === "idle" ? (
          <p className="text-sm text-slate-400">
            offline sync 完了後に押すと、confirmed offline store の保存結果を確認できます。
          </p>
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
          <ConfirmedStoreSnapshotView snapshot={state.snapshot} />
        ) : null}

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <p className="font-semibold">このパネルで行わないこと</p>
          <p className="mt-2">
            confirmed store の修復・削除・再同期・Blob内容の表示は行いません。
            問題がある場合は Drive状態とプロジェクト状態を再確認してから offline sync を再実行します。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmedStoreSnapshotView({
  snapshot,
}: {
  snapshot: OfflineConfirmedStoreSnapshot;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <CountCard label="projects" value={snapshot.projectCount} />
        <CountCard label="assets" value={snapshot.assetCount} />
        <CountCard label="asset blobs" value={snapshot.assetBlobCount} />
        <CountCard label="sync states" value={snapshot.syncStateCount} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="font-semibold text-slate-50">確認日時</p>
        <p className="mt-2 text-slate-300">{snapshot.checkedAt}</p>
      </div>

      {snapshot.projects.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">confirmed projects</p>
          <div className="mt-3 space-y-3">
            {snapshot.projects.map((project) => (
              <div
                key={project.projectId}
                className="rounded-xl border border-white/10 p-3"
              >
                <p className="font-medium text-slate-50">
                  {project.projectTitle ?? "名称未設定"}
                </p>
                <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                  <SummaryRow label="projectId" value={formatIdPart(project.projectId)} />
                  <SummaryRow label="slides" value={project.slideCount} />
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
            ))}
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
                    label="sourceDriveFileId"
                    value={formatIdPart(asset.sourceDriveFileId)}
                  />
                  <SummaryRow label="mimeType" value={asset.blobMimeType} />
                  <SummaryRow label="sizeBytes" value={asset.blobSizeBytes} />
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

function CountCard({ label, value }: { label: string; value: number }) {
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

  return "confirmed offline store の確認中に不明なエラーが発生しました。";
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
