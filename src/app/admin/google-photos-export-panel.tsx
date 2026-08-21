"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/app/app-providers";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatGooglePhotosExportBytes,
  type GooglePhotosExportProgress,
  type GooglePhotosExportReview,
  type SanitizedGooglePhotosExportError,
  type SanitizedGooglePhotosExportSuccess,
} from "@/lib/google-photos-export/contract";
import { formatUiDateTime } from "@/lib/ui-format";

type ExportUiState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "review"; review: GooglePhotosExportReview }
  | { status: "exporting"; review: GooglePhotosExportReview }
  | { status: "success"; result: SanitizedGooglePhotosExportSuccess }
  | {
      status: "error";
      error: SanitizedGooglePhotosExportError;
      review?: GooglePhotosExportReview;
      canResume?: boolean;
    };

export function GooglePhotosExportPanel() {
  const { googleStatus, driveStatus, projectStatus, selectedProjectId } =
    useAppState();

  return (
    <GooglePhotosExportPanelSession
      key={`${googleStatus}:${driveStatus}:${projectStatus}:${selectedProjectId ?? "none"}`}
    />
  );
}

function GooglePhotosExportPanelSession() {
  const {
    googleStatus,
    driveStatus,
    projectStatus,
    selectedProjectId,
    projectSummary,
    isGooglePhotosExportInFlight,
    googlePhotosExportProgress,
    googlePhotosExportResult,
    canResumeGooglePhotosExport,
    prepareGooglePhotosExportReview,
    commitPreparedGooglePhotosExport,
    cancelPreparedGooglePhotosExport,
    abortGooglePhotosExport,
  } = useAppState();
  const [uiState, setUiState] = useState<ExportUiState>({ status: "idle" });
  const [confirmed, setConfirmed] = useState(false);
  const requestSequenceRef = useRef(0);
  const actionInFlightRef = useRef(false);
  const cancelRef = useRef(cancelPreparedGooglePhotosExport);

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
      cancelRef.current();
    };
  }, []);

  useEffect(() => {
    cancelRef.current = cancelPreparedGooglePhotosExport;
  }, [cancelPreparedGooglePhotosExport]);

  async function startReview() {
    if (!selectedProjectId || !isReady || actionInFlightRef.current) return;

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    actionInFlightRef.current = true;
    setConfirmed(false);
    setUiState({ status: "preparing" });

    const result = await prepareGooglePhotosExportReview(selectedProjectId);
    if (requestSequence !== requestSequenceRef.current) return;

    actionInFlightRef.current = false;
    setUiState(
      result.ok
        ? { status: "review", review: result.review }
        : { status: "error", error: result.error },
    );
  }

  async function exportToPhotos(review: GooglePhotosExportReview) {
    if (actionInFlightRef.current || !confirmed) return;

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    actionInFlightRef.current = true;
    setUiState({ status: "exporting", review });

    const result = await commitPreparedGooglePhotosExport();
    if (requestSequence !== requestSequenceRef.current) return;

    actionInFlightRef.current = false;
    if (result.ok) {
      setConfirmed(false);
      setUiState({ status: "success", result: result.result });
      return;
    }
    if (result.error.kind === "sourceChanged") {
      setConfirmed(false);
    }
    setUiState({
      status: "error",
      error: result.error,
      review: result.error.kind === "sourceChanged" ? undefined : review,
      canResume: result.canResume,
    });
  }

  function cancelReview() {
    requestSequenceRef.current += 1;
    actionInFlightRef.current = false;
    cancelPreparedGooglePhotosExport();
    setConfirmed(false);
    setUiState({ status: "idle" });
  }

  return (
    <section aria-labelledby="google-photos-export-heading">
      <Card className="border-white/10 bg-white/[0.035] text-slate-50">
        <CardHeader>
          <CardTitle>
            <h2 id="google-photos-export-heading">Googleフォトへ書き出す</h2>
          </CardTitle>
          <CardDescription className="text-slate-300">
            選択中の作品の写真を、Googleフォトの新しいアルバムへコピーします。動画は書き出しません。Driveの公開版作成とは別の操作です。
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 text-sm text-slate-200">
          {!isReady ? (
            <div
              role="status"
              className="rounded-2xl border border-white/10 bg-black/30 p-4"
            >
              Google接続と作品の選択・確認が完了すると、Googleフォトへの書き出し前確認を実行できます。
            </div>
          ) : null}

          {uiState.status === "preparing" ? (
            <div
              aria-live="polite"
              className="flex min-h-11 items-center gap-3 rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100"
            >
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              書き出し元の作品を確認しています。
            </div>
          ) : null}

          {uiState.status === "review" ? (
            <ExportReview
              review={uiState.review}
              confirmed={confirmed}
              disabled={isGooglePhotosExportInFlight}
              onConfirmedChange={setConfirmed}
              onExport={() => void exportToPhotos(uiState.review)}
              onCancel={cancelReview}
            />
          ) : null}

          {uiState.status === "exporting" ? (
            <ExportProgress
              review={uiState.review}
              progress={googlePhotosExportProgress}
              onAbort={abortGooglePhotosExport}
            />
          ) : null}

          {uiState.status === "success" ? (
            <ExportSuccess
              result={googlePhotosExportResult ?? uiState.result}
              onReset={cancelReview}
            />
          ) : null}

          {uiState.status === "error" ? (
            <div className="space-y-3">
              <div
                role="alert"
                className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100"
              >
                <p className="font-medium">{uiState.error.message}</p>
              </div>
              {uiState.canResume && uiState.review && canResumeGooglePhotosExport ? (
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={isGooglePhotosExportInFlight}
                  onClick={() => void exportToPhotos(uiState.review!)}
                >
                  再開
                </Button>
              ) : null}
            </div>
          ) : null}

          {uiState.status === "idle" ||
          (uiState.status === "error" && !uiState.review) ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={!isReady || isGooglePhotosExportInFlight}
              onClick={() => void startReview()}
            >
              書き出し前に確認
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function ExportReview({
  review,
  confirmed,
  disabled,
  onConfirmedChange,
  onExport,
  onCancel,
}: {
  review: GooglePhotosExportReview;
  confirmed: boolean;
  disabled: boolean;
  onConfirmedChange: (value: boolean) => void;
  onExport: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      <dl className="grid gap-2 sm:grid-cols-2">
        <ReviewItem label="作品名" value={review.projectTitle} />
        <ReviewItem
          label="元のスライド数"
          value={`${review.sourceSlideCount}件`}
        />
        <ReviewItem
          label="書き出す写真"
          value={`${review.exportPhotoCount}件`}
        />
        <ReviewItem
          label="対象外の動画"
          value={`${review.skippedVideoCount}件`}
        />
        <ReviewItem
          label="書き出す写真の合計容量"
          value={formatGooglePhotosExportBytes(review.totalBytes)}
        />
        <ReviewItem label="作成するアルバム" value={review.albumTitle} />
      </dl>

      <ul className="list-disc space-y-2 pl-5 text-slate-300">
        <li>
          写真 {review.exportPhotoCount}件を書き出します。動画{" "}
          {review.skippedVideoCount}件はGoogleフォトへの書き出し対象外です。
        </li>
        <li>Googleフォトに新しいアルバムを作成します。既存アルバムは更新しません。</li>
        <li>Googleアカウントの保存容量を使用します。</li>
        <li>表示時間はGoogleフォトへ引き継がれません。</li>
        <li>画像スライドのテロップは、Googleフォト用の画像に焼き込んで書き出します。</li>
        <li>画像のテロップは、Googleフォトの説明にも保存します。</li>
        <li>動画はGoogleフォトへ書き出しません。作品とDrive上の動画はそのまま残ります。</li>
        <li>Google Drive上の元画像・元動画は変更しません。</li>
        <li>
          画像はGoogleフォト用に再生成するため、書き出し後の容量は元素材と異なる場合があります。
        </li>
        <li>
          Googleフォトへの書き出しと「このiPadに保存」は別操作です。Driveの公開版も作成しません。
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
        <span>Googleフォトに新しいアルバムを作成することを確認しました</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11"
          disabled={!confirmed || disabled}
          onClick={onExport}
        >
          Googleフォトへ書き出す
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

function ExportProgress({
  review,
  progress,
  onAbort,
}: {
  review: GooglePhotosExportReview;
  progress: GooglePhotosExportProgress | null;
  onAbort: () => void;
}) {
  const currentSlide = progress?.currentSlide ?? 1;
  const totalSlides = progress?.totalSlides ?? review.exportPhotoCount;

  return (
    <div
      aria-live="polite"
      className="space-y-3 rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100"
    >
      <p className="font-medium">
        全体: {currentSlide} / {totalSlides}
      </p>
      <p>現在の写真: {currentSlide}</p>
      {progress?.phase === "renderingImage" ? (
        <p className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Googleフォト用の画像を作成しています
        </p>
      ) : (
        <>
          <p>Googleフォトへアップロードしています</p>
          <p>
            アップロード:{" "}
            {formatGooglePhotosExportBytes(progress?.uploadedBytes ?? 0)} /{" "}
            {formatGooglePhotosExportBytes(progress?.fileBytes ?? 0)}
          </p>
        </>
      )}
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

function ExportSuccess({
  result,
  onReset,
}: {
  result: SanitizedGooglePhotosExportSuccess;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-50">
      <p className="font-medium">Googleフォトへの書き出しが完了しました</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <ReviewItem label="アルバム" value={result.albumTitle} />
        <ReviewItem label="書き出した写真" value={`${result.mediaItemCount}件`} />
        <ReviewItem label="完了日時" value={formatUiDateTime(result.completedAt)} />
      </dl>
      {result.productUrl ? (
        <a
          href={result.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center font-medium underline decoration-emerald-200/50 underline-offset-4"
        >
          Googleフォトで開く
        </a>
      ) : null}
      <p className="text-sm text-emerald-100/90">
        共有する場合はGoogleフォトでアルバムを開き、Googleフォトの共有機能からリンクを作成してください。
      </p>
      <Button type="button" variant="secondary" className="min-h-11" onClick={onReset}>
        閉じる
      </Button>
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
