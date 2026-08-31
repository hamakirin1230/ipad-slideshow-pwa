"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  useAppState,
  type GooglePhotosSyncActionResult,
} from "@/app/app-providers";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatGooglePhotosExportBytes } from "@/lib/google-photos-export/contract";
import type {
  GooglePhotosSyncUiReview,
  GooglePhotosSyncUiReviewMode,
} from "@/lib/google-photos-export/sync-ui-review";

type SyncUiState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "review"; review: GooglePhotosSyncUiReview; message?: string }
  | { status: "syncing"; review: GooglePhotosSyncUiReview }
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | { status: "sourceChanged"; message: string }
  | { status: "manualRecovery"; message: string };

export function GooglePhotosExportPanel() {
  const { googleStatus, driveStatus, projectStatus, selectedProjectId } =
    useAppState();

  return (
    <GooglePhotosSyncPanelSession
      key={`${googleStatus}:${driveStatus}:${projectStatus}:${selectedProjectId ?? "none"}`}
    />
  );
}

function GooglePhotosSyncPanelSession() {
  const {
    googleStatus,
    driveStatus,
    projectStatus,
    selectedProjectId,
    projectSummary,
    prepareGooglePhotosSyncReview,
    syncSelectedProjectToGooglePhotos,
    abortGooglePhotosSync,
    isGooglePhotosSyncInFlight,
    googlePhotosSyncProgress,
  } = useAppState();
  const [uiState, setUiState] = useState<SyncUiState>({ status: "idle" });
  const [confirmed, setConfirmed] = useState(false);
  const requestSequenceRef = useRef(0);
  const actionInFlightRef = useRef(false);
  const reviewAbortRef = useRef<AbortController | null>(null);

  const isReady =
    googleStatus === "connected" &&
    driveStatus === "ready" &&
    projectStatus === "ready" &&
    selectedProjectId !== null &&
    projectSummary !== null;

  useEffect(() => {
    return () => {
      requestSequenceRef.current += 1;
      actionInFlightRef.current = false;
      reviewAbortRef.current?.abort();
      reviewAbortRef.current = null;
    };
  }, []);

  async function startReview() {
    if (
      !selectedProjectId ||
      !isReady ||
      actionInFlightRef.current ||
      isGooglePhotosSyncInFlight
    ) {
      return;
    }

    reviewAbortRef.current?.abort();
    const controller = new AbortController();
    reviewAbortRef.current = controller;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    actionInFlightRef.current = true;
    setConfirmed(false);
    setUiState({ status: "preparing" });

    const result = await prepareGooglePhotosSyncReview(
      selectedProjectId,
      controller.signal,
    );
    if (requestSequence !== requestSequenceRef.current) return;

    reviewAbortRef.current = null;
    actionInFlightRef.current = false;
    if (result.ok) {
      setUiState({ status: "review", review: result.review });
      return;
    }

    switch (result.reason) {
      case "sourceChanged":
        setUiState({
          status: "sourceChanged",
          message:
            "前回のGoogleフォト同期処理中からアルバム内容が変更されています。自動では続行しません。",
        });
        return;
      case "manualRecoveryRequired":
        setUiState({
          status: "manualRecovery",
          message:
            "前回のGoogleフォト処理の結果を自動では確定できません。新しい同期先を自動作成したり、写真を再送したりしません。",
        });
        return;
      case "bindingDuplicate":
      case "bindingInvalid":
        setUiState({
          status: "error",
          message:
            "Googleフォト同期設定を一意に確認できません。自動修復は行いません。",
        });
        return;
      case "bindingInaccessible":
        setUiState({
          status: "error",
          message:
            "Googleフォト同期設定を確認できませんでした。通信状態を確認して、状態を再確認してください。",
        });
        return;
      case "sourcePreparationFailed":
      case "notReady":
      case "cancelled":
        setUiState({
          status: "error",
          message:
            "同期内容を確認できませんでした。Google接続と選択中のアルバムを確認してください。",
        });
    }
  }

  async function syncToGooglePhotos(review: GooglePhotosSyncUiReview) {
    if (
      !selectedProjectId ||
      !confirmed ||
      actionInFlightRef.current ||
      isGooglePhotosSyncInFlight
    ) {
      return;
    }

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    actionInFlightRef.current = true;
    const resultPromise =
      syncSelectedProjectToGooglePhotos(selectedProjectId);
    setUiState({ status: "syncing", review });

    const result = await resultPromise;
    if (requestSequence !== requestSequenceRef.current) return;

    actionInFlightRef.current = false;
    applySyncResult(result, review);
  }

  function applySyncResult(
    result: GooglePhotosSyncActionResult,
    review: GooglePhotosSyncUiReview,
  ) {
    switch (result.status) {
      case "completed":
        setConfirmed(false);
        setUiState({
          status: "success",
          message:
            review.mode === "initial"
              ? "Googleフォトへの初回同期が完了しました。"
              : "Googleフォトの更新が完了しました。",
        });
        return;
      case "noChanges":
        setConfirmed(false);
        setUiState({ status: "success", message: "Googleフォトは最新です。" });
        return;
      case "authorizationRequired":
        setUiState({
          status: "review",
          review,
          message:
            "Googleフォト同期の利用許可を確認できませんでした。もう一度実行してください。",
        });
        return;
      case "authorizationDenied":
        setUiState({
          status: "review",
          review,
          message: "Googleフォト同期の利用許可がキャンセルされました。",
        });
        return;
      case "cancelled":
        setConfirmed(false);
        setUiState({
          status: "error",
          message:
            "更新を中止しました。GoogleフォトまたはDrive側の処理が途中まで進んでいる場合があります。状態を再確認してください。",
        });
        return;
      case "recoveryRequired":
        setConfirmed(false);
        setUiState({
          status: "manualRecovery",
          message:
            "Googleフォト側の処理結果を自動では判断できません。状態を再確認してください。",
        });
        return;
      case "interrupted":
      case "blocked":
        setConfirmed(false);
        if (result.reason === "targetMissing") {
          setUiState({
            status: "error",
            message:
              "同期先のGoogleフォトアルバムが見つかりません。自動で新しいアルバムは作成しません。",
          });
          return;
        }
        if (result.reason === "sourceChanged") {
          setUiState({
            status: "sourceChanged",
            message:
              "前回のGoogleフォト同期処理中からアルバム内容が変更されています。自動では続行しません。",
          });
          return;
        }
        if (
          result.reason === "bindingDuplicate" ||
          result.reason === "bindingInvalid"
        ) {
          setUiState({
            status: "error",
            message:
              "Googleフォト同期設定を一意に確認できません。自動修復は行いません。",
          });
          return;
        }
        setUiState({
          status: "error",
          message:
            "Googleフォトの更新を完了できませんでした。状態を再確認してください。",
        });
        return;
      case "alreadyRunning":
      case "notReady":
        setUiState({
          status: "review",
          review,
          message:
            "Googleフォト同期を開始できませんでした。現在の処理が完了してから、もう一度実行してください。",
        });
    }
  }

  function cancelReview() {
    requestSequenceRef.current += 1;
    actionInFlightRef.current = false;
    reviewAbortRef.current?.abort();
    reviewAbortRef.current = null;
    setConfirmed(false);
    setUiState({ status: "idle" });
  }

  function abortSync() {
    requestSequenceRef.current += 1;
    actionInFlightRef.current = false;
    abortGooglePhotosSync();
    setConfirmed(false);
    setUiState({
      status: "error",
      message:
        "更新を中止しました。GoogleフォトまたはDrive側の処理が途中まで進んでいる場合があります。状態を再確認してください。",
    });
  }

  return (
    <section aria-labelledby="google-photos-sync-heading">
      <Card className="border-white/10 bg-white/[0.035] text-slate-50">
        <CardHeader>
          <CardTitle>
            <h2 id="google-photos-sync-heading">Googleフォトと同期</h2>
          </CardTitle>
          <CardDescription className="text-slate-300">
            選択中のアルバムの写真をGoogleフォトへ同期します。初回は同期先を作成し、2回目以降は同じ同期先の名前と写真構成を更新します。動画は対象外です。
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 text-sm text-slate-200">
          {!isReady ? (
            <StatusBox>
              Google接続とアルバムの選択・確認が完了すると、Googleフォトとの同期内容を確認できます。
            </StatusBox>
          ) : null}

          {uiState.status === "preparing" ? (
            <div
              aria-live="polite"
              className="flex min-h-11 items-center gap-3 rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100"
            >
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              Drive上の同期内容と前回の状態を確認しています。
            </div>
          ) : null}

          {uiState.status === "review" ? (
            <SyncReview
              review={uiState.review}
              message={uiState.message}
              confirmed={confirmed}
              disabled={isGooglePhotosSyncInFlight}
              onConfirmedChange={setConfirmed}
              onSync={() => void syncToGooglePhotos(uiState.review)}
              onCancel={cancelReview}
            />
          ) : null}

          {uiState.status === "syncing" ? (
            <SyncProgress
              progress={googlePhotosSyncProgress}
              onAbort={abortSync}
            />
          ) : null}

          {uiState.status === "success" ? (
            <div className="space-y-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-50">
              <p className="font-medium">{uiState.message}</p>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={cancelReview}
              >
                閉じる
              </Button>
            </div>
          ) : null}

          {uiState.status === "error" ||
          uiState.status === "sourceChanged" ||
          uiState.status === "manualRecovery" ? (
            <div className="space-y-3">
              <div
                role="alert"
                className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100"
              >
                <p className="font-medium">{uiState.message}</p>
              </div>
              <Button
                type="button"
                className="min-h-11"
                disabled={!isReady || isGooglePhotosSyncInFlight}
                onClick={() => void startReview()}
              >
                状態を再確認
              </Button>
            </div>
          ) : null}

          {uiState.status === "idle" ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={!isReady || isGooglePhotosSyncInFlight}
              onClick={() => void startReview()}
            >
              同期内容を確認
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function SyncReview({
  review,
  message,
  confirmed,
  disabled,
  onConfirmedChange,
  onSync,
  onCancel,
}: {
  review: GooglePhotosSyncUiReview;
  message?: string;
  confirmed: boolean;
  disabled: boolean;
  onConfirmedChange: (value: boolean) => void;
  onSync: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      {message ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100"
        >
          <p className="font-medium">{message}</p>
        </div>
      ) : null}

      <dl className="grid gap-2 sm:grid-cols-2">
        <ReviewItem label="アルバム名" value={review.projectTitle} />
        <ReviewItem
          label="元のスライド数"
          value={`${review.sourceSlideCount}件`}
        />
        <ReviewItem
          label="Googleフォト同期対象写真"
          value={`${review.syncPhotoCount}件`}
        />
        <ReviewItem
          label="対象外の動画"
          value={`${review.skippedVideoCount}件`}
        />
        <ReviewItem
          label="対象写真の合計容量"
          value={formatGooglePhotosExportBytes(review.totalBytes)}
        />
        <ReviewItem label="同期先アルバム名" value={review.targetAlbumTitle} />
      </dl>

      <ul className="list-disc space-y-2 pl-5 text-slate-300">
        <li>
          写真 {review.syncPhotoCount}件を同期します。動画{" "}
          {review.skippedVideoCount}件はGoogleフォト同期の対象外です。
        </li>
        {review.mode === "initial" ? (
          <li>
            以前に作成したGoogleフォトアルバムが存在していても、このアプリは名前だけで自動的に同期先へ関連付けません。同期設定がない場合は、新しい同期先を作成します。
          </li>
        ) : null}
        <li>
          同期先アルバムへユーザー自身が追加した写真は、このアプリの同期対象として扱わず、削除しません。
        </li>
        <li>
          スライドから削除・差し替えた写真は同期先アルバムから外れますが、Googleフォトのライブラリ全体には残り、保存容量を使用し続ける場合があります。
        </li>
        <li>
          Drive上のアルバム名変更は、次回Googleフォト更新時に同じ同期先アルバム名へ反映します。
        </li>
        <li>画像スライドのテロップは、Googleフォト用の画像に焼き込みます。</li>
        <li>動画はGoogleフォトへ同期しません。アルバムとDrive上の動画はそのまま残ります。</li>
        <li>Google Drive上の元画像・元動画は変更しません。</li>
        <li>
          Googleフォト同期と「ローカルに保存」と「公開」は別操作です。ローカル保存や公開を自動実行しません。
        </li>
      </ul>

      <label className="flex min-h-11 items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={disabled}
          onChange={(event) => onConfirmedChange(event.target.checked)}
          className="mt-1 size-4"
        />
        <span>{confirmationText(review.mode)}</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11"
          disabled={!confirmed || disabled}
          onClick={onSync}
        >
          {syncActionLabel(review.mode)}
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

function SyncProgress({
  progress,
  onAbort,
}: {
  progress: ReturnType<typeof useAppState>["googlePhotosSyncProgress"];
  onAbort: () => void;
}) {
  const hasCounts =
    progress?.completedCount !== undefined &&
    progress.totalCount !== undefined;

  return (
    <div
      aria-live="polite"
      className="space-y-3 rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100"
    >
      <p className="flex items-center gap-2 font-medium">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        {progress
          ? progressStageMessage(progress.stage)
          : "Googleフォト同期の利用許可を確認しています。"}
      </p>
      {hasCounts ? (
        <p>
          完了済み: {progress.completedCount} / {progress.totalCount}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="min-h-11"
        onClick={onAbort}
      >
        中止
      </Button>
    </div>
  );
}

function progressStageMessage(
  stage: NonNullable<
    ReturnType<typeof useAppState>["googlePhotosSyncProgress"]
  >["stage"],
) {
  switch (stage) {
    case "preparing":
      return "同期状態を確認しています。";
    case "starting":
      return "同期先を準備しています。";
    case "media":
      return "写真を準備・アップロードしています。";
    case "membership":
      return "同期先アルバムの写真構成を更新しています。";
    case "finalizing":
      return "同期結果を確認しています。";
  }
}

function syncActionLabel(mode: GooglePhotosSyncUiReviewMode) {
  switch (mode) {
    case "initial":
      return "Googleフォトへ書き出す";
    case "update":
      return "Googleフォトを更新";
    case "continue":
      return "Googleフォトの更新を続ける";
  }
}

function confirmationText(mode: GooglePhotosSyncUiReviewMode) {
  switch (mode) {
    case "initial":
      return "Googleフォトに新しい同期先アルバムを作成し、今後は同じアルバムを更新することを確認しました";
    case "update":
      return "同じGoogleフォトアルバムを現在の内容に更新することを確認しました";
    case "continue":
      return "前回のGoogleフォト更新の続きから状態を確認して再開することを確認しました";
  }
}

function StatusBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-white/10 bg-black/30 p-4"
    >
      {children}
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-slate-50">{value}</dd>
    </div>
  );
}
