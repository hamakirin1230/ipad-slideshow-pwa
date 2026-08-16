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
  type GooglePhotosExportReview,
  type SanitizedGooglePhotosExportError,
} from "@/lib/google-photos-export/contract";

type ExportUiState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "review"; review: GooglePhotosExportReview }
  | {
      status: "error";
      error: SanitizedGooglePhotosExportError;
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
    prepareGooglePhotosExportReview,
    cancelPreparedGooglePhotosExport,
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
            選択中の作品を、Googleフォトの新しいアルバムへコピーします。Driveの公開版作成とは別の操作です。
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
              onCancel={cancelReview}
            />
          ) : null}

          {uiState.status === "error" ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100"
            >
              <p className="font-medium">{uiState.error.message}</p>
            </div>
          ) : null}

          {uiState.status === "idle" || uiState.status === "error" ? (
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
  onCancel,
}: {
  review: GooglePhotosExportReview;
  confirmed: boolean;
  disabled: boolean;
  onConfirmedChange: (value: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      <dl className="grid gap-2 sm:grid-cols-2">
        <ReviewItem label="作品名" value={review.projectTitle} />
        <ReviewItem label="スライド数" value={`${review.slideCount}件`} />
        <ReviewItem label="写真" value={`${review.photoCount}件`} />
        <ReviewItem label="動画" value={`${review.videoCount}件`} />
        <ReviewItem
          label="書き出し合計容量"
          value={formatGooglePhotosExportBytes(review.totalBytes)}
        />
        <ReviewItem label="作成するアルバム" value={review.albumTitle} />
      </dl>

      <ul className="list-disc space-y-2 pl-5 text-slate-300">
        <li>同じ素材を使うスライドも、それぞれ1件として容量に含みます。</li>
        <li>Googleフォトに新しいアルバムを作成します。既存アルバムは更新しません。</li>
        <li>Googleアカウントの保存容量を使用します。</li>
        <li>表示時間はGoogleフォトへ引き継がれません。</li>
        <li>テロップはGoogleフォトの説明として書き出します。</li>
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

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-slate-50">{value}</dd>
    </div>
  );
}
