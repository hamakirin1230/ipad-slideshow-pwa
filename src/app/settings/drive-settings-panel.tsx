"use client";

import Link from "next/link";
import { useAppState } from "@/app/app-providers";
import { ProductDisclosure } from "@/components/product-disclosure";
import { Button } from "@/components/ui/button";
import { formatUiDateTime } from "@/lib/ui-format";
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
  const showConnectButton =
    canConnect ||
    googleStatus === "scriptLoading" ||
    googleStatus === "connecting";
  const isGoogleConnecting =
    googleStatus === "connecting" || googleStatus === "scriptLoading";
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
    <section
      aria-labelledby="google-drive-settings-heading"
      className="max-w-3xl rounded-2xl bg-white/[0.045] p-5 sm:p-7"
    >
      <h2
        id="google-drive-settings-heading"
        className="text-2xl font-semibold"
      >
        Google Drive
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        {googleStatus === "connected"
          ? "接続済み"
          : "アルバムを保存するために、GoogleアカウントでDriveとつなぎます"}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {showConnectButton ? (
          <Button
            type="button"
            className="min-h-11"
            onClick={connectGoogle}
            disabled={!canConnect}
          >
            {googleStatus === "scriptLoading"
              ? "Google認証の準備中"
              : googleStatus === "connecting"
                ? "接続中"
                : "Googleアカウントでつなぐ"}
          </Button>
        ) : null}

        {googleStatus === "connected" && driveStatus === "ready" ? (
          <Button asChild className="min-h-11">
            <Link href="/admin">つぎへ：アルバムをつくる</Link>
          </Button>
        ) : null}

        {googleStatus === "connected" && driveStatus === "unchecked" ? (
          <Button
            type="button"
            className="min-h-11"
            onClick={checkDriveWorkspace}
            disabled={!canCheckDrive}
          >
            {isDriveChecking ? "保存場所を確認中" : "保存場所を確認"}
          </Button>
        ) : null}

        {canCreateDriveWorkspace ? (
          <Button
            type="button"
            className="min-h-11"
            onClick={createWorkspace}
            disabled={isDriveCreating}
          >
            {isDriveCreating ? "保存場所を準備中" : "保存場所を準備する"}
          </Button>
        ) : null}

        {googleStatus === "connected" &&
        !["unchecked", "notCreated", "ready"].includes(driveStatus) ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-white/15 bg-white/5"
            onClick={checkDriveWorkspace}
            disabled={!canCheckDrive}
          >
            {isDriveChecking ? "確認中" : "保存場所を再確認"}
          </Button>
        ) : null}

        {canDisconnect ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-white/15 bg-transparent"
            onClick={disconnectGoogle}
            disabled={!canDisconnect}
          >
            接続を解除
          </Button>
        ) : null}
      </div>

      {isGoogleConnecting ? (
        <p className="mt-4 text-sm text-sky-200" role="status">
          {googleStatus === "scriptLoading"
            ? "Google認証の準備をしています…"
            : "Googleの画面でアカウントを選んでください。画面が出ないときは、下の「接続で困ったとき」へ。"}
        </p>
      ) : null}

      {isDriveChecking || isDriveCreating ? (
        <p className="mt-4 text-sm text-sky-200" role="status">
          {isDriveCreating ? "保存場所を準備しています…" : "保存場所を確認しています…"}
        </p>
      ) : null}

      {driveStatus === "notCreated" ? (
        <p className="mt-5 rounded-xl bg-sky-400/10 p-4 text-sm text-sky-100">
          アルバムの保存場所を準備してください。
        </p>
      ) : null}

      {canResetGoogleAuth ? (
        <ProductDisclosure
          label="接続で困ったとき"
          className="mt-6"
          defaultOpen={googleStatus === "connecting" || googleStatus === "error"}
        >
          <p>
            認証画面が戻らない場合は、残っているGoogle認証画面や空白の別ウィンドウを閉じてから接続をやり直してください。
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11 border-white/15"
            onClick={resetGoogleAuthFlow}
            disabled={!canResetGoogleAuth}
          >
            接続をやり直す
          </Button>
        </ProductDisclosure>
      ) : null}

      <ProductDisclosure label="詳しい状態・診断" className="mt-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-200">Google接続</dt>
            <dd className="mt-1">{googleStatusLabel}</dd>
            <dd className="mt-1">
              {sanitizeUserFacingDiagnostic(googleMessage)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-200">Google Drive</dt>
            <dd className="mt-1">{driveStatusLabel}</dd>
            <dd className="mt-1">
              {sanitizeUserFacingDiagnostic(driveMessage)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-200">必要な権限</dt>
            <dd className="mt-1">
              {driveFileGranted === null
                ? "未確認"
                : driveFileGranted
                  ? "許可済み"
                  : "不足"}
            </dd>
          </div>
        </dl>

        {driveCandidates.length > 0 ? (
          <div className="mt-5 space-y-3">
            <p className="font-medium text-slate-200">確認された保存場所の候補</p>
            {driveCandidates.map((candidate, index) => (
              <div
                key={`${candidate.name}-${candidate.createdTime}-${index}`}
                className="rounded-lg bg-black/20 p-3"
              >
                <p className="font-medium text-slate-200">
                  候補 {index + 1}: {candidate.name}
                </p>
                <p className="mt-1 text-xs">
                  作成 {formatUiDateTime(candidate.createdTime)} ・ 更新{" "}
                  {formatUiDateTime(candidate.modifiedTime)}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {driveDiagnostics.length > 0 ? (
          <div className="mt-5 space-y-1">
            <p className="font-medium text-slate-200">診断</p>
            {driveDiagnostics.map((diagnostic) => (
              <p key={diagnostic}>
                ・{sanitizeUserFacingDiagnostic(diagnostic)}
              </p>
            ))}
          </div>
        ) : null}

        {googleStatus === "connected" && driveStatus === "ready" ? (
          <Button
            type="button"
            variant="outline"
            className="mt-5 min-h-11 border-white/15"
            onClick={checkDriveWorkspace}
            disabled={!canCheckDrive}
          >
            保存場所を再確認
          </Button>
        ) : null}

        <p className="mt-5">
          Google認証情報は画面やログへ表示せず、端末へ永続保存しません。アルバムの編集、公開、ローカルへの保存は「つくる」から明示的に実行します。
        </p>
      </ProductDisclosure>
    </section>
  );
}
