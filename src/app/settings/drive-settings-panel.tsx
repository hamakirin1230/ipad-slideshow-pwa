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
    driveDiagnostics,
    connectGoogle,
    resetGoogleAuthFlow,
    disconnectGoogle,
    checkDriveWorkspace,
    createWorkspace,
  } = useAppState();

  const isDriveChecking = driveStatus === "checking";
  const isDriveCreating = driveStatus === "creating";

  const canConnect =
    googleStatus === "notConnected" ||
    googleStatus === "error" ||
    googleStatus === "scopeMissing";

  const canDisconnect =
    !isDriveCreating &&
    (googleStatus === "connected" ||
      googleStatus === "connecting" ||
      googleStatus === "error" ||
      googleStatus === "scopeMissing");

  const canResetGoogleAuth =
    !isDriveCreating &&
    (googleStatus === "connecting" ||
      googleStatus === "error" ||
      googleStatus === "scopeMissing");

  const canCheckDrive =
    googleStatus === "connected" && !isDriveChecking && !isDriveCreating;

  const canCreateDriveWorkspace =
    googleStatus === "connected" &&
    driveFileGranted === true &&
    driveStatus === "notCreated";

  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>第5 Driveワークスペース作成</CardTitle>
          <Badge variant={googleStatus === "connected" ? "secondary" : "outline"}>
            {googleStatusLabel}
          </Badge>
          <Badge variant={driveStatus === "ready" ? "secondary" : "outline"}>
            {driveStatusLabel}
          </Badge>
        </div>
        <CardDescription className="text-slate-300">
          Google Drive上に、このPWA用の最小ワークスペースを作成します。
          作成後はDrive状態を再確認し、metadata と workspace.json / index.json
          の本文検証まで通った場合だけ準備済みとして扱います。
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
              Drive作成中は、作成・再確認・接続解除の操作を無効化します。
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
            {isDriveChecking ? "Drive状態を再確認中" : "Drive状態を再確認"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={resetGoogleAuthFlow}
            disabled={!canResetGoogleAuth}
          >
            Google認証状態をリセット
          </Button>

          {canCreateDriveWorkspace ? (
            <Button
              type="button"
              variant="secondary"
              onClick={createWorkspace}
              disabled={isDriveCreating}
            >
              Driveワークスペースを作成
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            onClick={disconnectGoogle}
            disabled={!canDisconnect}
          >
            このセッションの接続を解除
          </Button>
        </div>

        {googleStatus === "connecting" || googleStatus === "error" ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <p className="font-semibold">iPad PWAで認証画面が戻らない場合</p>
            <p className="mt-2">
              iPadのApp SwitcherでGoogle認証画面、Safari、または空白の別ウィンドウが残っていれば閉じてください。
              その後「Google認証状態をリセット」を押してから、もう一度Google接続を開始してください。
            </p>
          </div>
        ) : null}

        {driveStatus === "unchecked" && googleStatus === "connected" ? (
          <p className="text-sm text-slate-400">
            まず「Drive状態を再確認」を押して、既存ワークスペースの有無を確認してください。
          </p>
        ) : null}

        {driveStatus === "notCreated" ? (
          <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100">
            <p className="font-semibold">Driveワークスペース未作成</p>
            <p className="mt-2">
              この状態でのみ、Driveワークスペース作成を実行できます。
              作成ボタンを押すと、作成前にDrive状態を再確認し、未作成の場合だけ4点を作成します。
            </p>
          </div>
        ) : null}

        {driveStatus === "ready" ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
            <p className="font-semibold">Driveワークスペース準備済み</p>
            <p className="mt-2">
              Driveワークスペースを確認できました。本番再生データ未準備、オフライン再生未対応です。
            </p>
          </div>
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

        {driveDiagnostics.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">診断</p>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {driveDiagnostics.map((diagnostic) => (
                <p key={diagnostic}>・{diagnostic}</p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <p className="font-semibold">第5でまだ扱わないこと</p>
          <p className="mt-2">
            自動削除、自動修復、自動リトライ、プロジェクト作成、素材保存、
            Google Photos Picker連携、IndexedDB同期、オフライン本番再生はまだ行いません。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}