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

export function DriveSettingsPanel() {
  const {
    googleStatus,
    googleStatusLabel,
    googleMessage,
    driveFileGranted,
    driveStatus,
    driveStatusLabel,
    driveMessage,
    driveCandidates,
    connectGoogle,
    disconnectGoogle,
    checkDriveWorkspace,
  } = useAppState();

  const canConnect =
    googleStatus === "notConnected" ||
    googleStatus === "error" ||
    googleStatus === "scopeMissing";

  const canDisconnect =
    googleStatus === "connected" ||
    googleStatus === "connecting" ||
    googleStatus === "error" ||
    googleStatus === "scopeMissing";

  const canCheckDrive =
    googleStatus === "connected" && driveStatus !== "checking";

  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>第4-1 Google接続・Drive状態</CardTitle>
          <Badge variant={googleStatus === "connected" ? "secondary" : "outline"}>
            {googleStatusLabel}
          </Badge>
          <Badge variant={driveStatus === "ready" ? "secondary" : "outline"}>
            {driveStatusLabel}
          </Badge>
        </div>
        <CardDescription className="text-slate-300">
          このスライスでは、Drive APIでワークスペースroot候補だけを検索します。
          子要素検証、Driveワークスペース作成、ファイル保存はまだ行いません。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-slate-300">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">Google接続</p>
            <p className="mt-2">{googleMessage}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">Drive状態</p>
            <p className="mt-2">{driveMessage}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">drive.file scope</p>
            <p className="mt-2">
              {driveFileGranted === null
                ? "未確認です。"
                : driveFileGranted
                  ? "許可済みです。"
                  : "不足しています。"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">安全方針</p>
            <p className="mt-2">
              access_token はProvider内部のuseRefだけに保持し、画面表示・console出力・永続保存は行いません。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={connectGoogle}
            disabled={!canConnect}
          >
            Google接続を開始
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={checkDriveWorkspace}
            disabled={!canCheckDrive}
          >
            {driveStatus === "checking"
              ? "Drive状態を確認中"
              : "Drive状態を確認"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={disconnectGoogle}
            disabled={!canDisconnect}
          >
            このセッションの接続を解除
          </Button>
        </div>

        {googleStatus !== "connected" ? (
          <p className="text-sm text-slate-400">
            Drive状態確認は、Google接続後に実行できます。
          </p>
        ) : null}

        {driveCandidates.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">候補診断</p>
            <div className="mt-3 space-y-3">
              {driveCandidates.map((candidate, index) => (
                <div
                  key={`${candidate.name}-${candidate.createdTime}-${index}`}
                  className="rounded-xl border border-white/10 p-3"
                >
                  <p className="font-medium text-slate-50">
                    候補 {index + 1}: {candidate.name}
                  </p>
                  <dl className="mt-2 grid gap-1 text-xs text-slate-300 sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">作成日時</dt>
                      <dd>{candidate.createdTime}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">更新日時</dt>
                      <dd>{candidate.modifiedTime}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">workspaceId</dt>
                      <dd>{candidate.workspaceIdPart}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <p className="font-semibold">このスライスでまだ出さない操作</p>
          <p className="mt-2">
            workspace.json / index.json / projects/ の詳細検証、Driveワークスペース作成、Driveファイル削除・修復は、次以降のスライスで追加します。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}