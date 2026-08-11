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
import { sanitizeUserFacingDiagnostic } from "@/lib/user-facing-diagnostics";

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
          <CardTitle>Google / Drive接続</CardTitle>
          <Badge variant={googleStatus === "connected" ? "secondary" : "outline"}>
            {googleStatusLabel}
          </Badge>
          <Badge variant={driveStatus === "ready" ? "secondary" : "outline"}>
            {driveStatusLabel}
          </Badge>
        </div>
        <CardDescription className="text-slate-300">
          Googleに接続し、このPWAが使用するGoogle Driveの保存領域を確認します。
          未作成の場合は、この画面から作成できます。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-slate-300">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">Google接続</p>
            <p className="mt-2">{sanitizeUserFacingDiagnostic(googleMessage)}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">Drive状態</p>
            <p className="mt-2">{sanitizeUserFacingDiagnostic(driveMessage)}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">Google Drive権限</p>
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
              Google認証情報は画面表示・console出力・永続保存を行いません。
              Drive作成中は、作成・再確認・接続解除の操作を無効化します。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={connectGoogle}
            disabled={!canConnect}
          >
            Google接続を開始
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={checkDriveWorkspace}
            disabled={!canCheckDrive}
          >
            {isDriveChecking ? "Drive状態を再確認中" : "Drive状態を再確認"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={resetGoogleAuthFlow}
            disabled={!canResetGoogleAuth}
          >
            Google認証状態をリセット
          </Button>

          {canCreateDriveWorkspace ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={createWorkspace}
              disabled={isDriveCreating}
            >
              Driveの保存領域を作成
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="min-h-11"
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
            まず「Drive状態を再確認」を押して、既存の保存領域があるか確認してください。
          </p>
        ) : null}

        {driveStatus === "notCreated" ? (
          <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100">
            <p className="font-semibold">Driveの保存領域は未作成です</p>
            <p className="mt-2">
              この状態でのみ、Driveの保存領域を作成できます。
              作成ボタンを押すと、作成前にDrive状態を再確認し、未作成の場合だけ4点を作成します。
            </p>
          </div>
        ) : null}

        {driveStatus === "ready" ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
            <p className="font-semibold">Driveの保存領域を利用できます</p>
            <p className="mt-2">
              Driveの保存領域を確認できました。プロジェクトの編集、公開、ロールバック、端末への同期は管理画面から明示的に実行できます。
              保存や公開だけでは、この端末の再生用データは更新されません。remoteOnly動画は動画本体を端末に保存せず、オンラインかつGoogle接続中の場合だけ再生します。
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
                <p key={diagnostic}>
                  ・{sanitizeUserFacingDiagnostic(diagnostic)}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <p className="font-semibold">この画面で扱わないこと</p>
          <p className="mt-2">
            Driveの保存領域は自動削除・自動修復・自動再試行しません。
            プロジェクト、素材追加、端末への同期、端末内保存管理、再生確認は管理画面と再生画面で扱います。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
