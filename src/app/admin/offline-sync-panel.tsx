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
import { useAppState } from "@/app/app-providers";

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
            {isOfflineSyncInFlight
              ? "offline sync 実行中"
              : "offline sync を実行"}
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

        {offlineSyncStatus === "failed" ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">
            <p className="font-semibold">offline sync 失敗</p>
            <p className="mt-2">
              診断を確認し、必要に応じて Drive状態とプロジェクト状態を再確認してください。
            </p>
          </div>
        ) : null}

        {offlineSyncStatus === "cancelled" ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <p className="font-semibold">offline sync 中止</p>
            <p className="mt-2">
              中止時点で Drive fetch / staging write / promotion
              のどこまで進んだかは、この表示だけでは判断しません。
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
          <p className="font-semibold">このコミットでまだ扱わないこと</p>
          <p className="mt-2">
            confirmed offline store を使った player 表示、Service Worker、
            retry policy、自動修復、詳細な user-facing error copy は後続で追加します。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
