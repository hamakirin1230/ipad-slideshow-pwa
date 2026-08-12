"use client";

import Link from "next/link";
import {
  CheckCircle2,
  History,
  LoaderCircle,
  Play,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/app/app-providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductDisclosure } from "@/components/product-disclosure";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getManifestCommitLabel,
  getProjectPublishFailureDisplayMessage,
  getProjectPublishAssetDiagnosticLabel,
  getProjectPublishModeLabel,
  getRevisionPreparationLabel,
  PROJECT_PUBLISH_DRIVE_SUCCESS_MESSAGE,
  PROJECT_PUBLISH_OFFLINE_SYNC_MESSAGE,
  type ProjectPublishReview,
  type ProjectPublishAssetDiagnosticCode,
  type SanitizedPublishError,
  type SanitizedPublishSuccess,
} from "@/lib/publish-history/project-publish-ui";
import { sanitizeUserFacingDiagnostic } from "@/lib/user-facing-diagnostics";
import { formatUiDateTime } from "@/lib/ui-format";

type PublishUiState =
  | { status: "idle" }
  | { status: "preflighting" }
  | { status: "review"; review: ProjectPublishReview }
  | { status: "publishing"; review: ProjectPublishReview }
  | { status: "success"; result: SanitizedPublishSuccess }
  | {
      status: "error";
      phase: "preflight" | "publish";
      error: {
        diagnosticCode?: ProjectPublishAssetDiagnosticCode;
        recoverability?: SanitizedPublishError["recoverability"];
        canRetry: boolean;
      };
      review?: ProjectPublishReview;
    };

export function ProjectPublishPanel() {
  const { googleStatus, driveStatus, projectStatus, selectedProjectId } =
    useAppState();

  return (
    <ProjectPublishPanelSession
      key={`${googleStatus}:${driveStatus}:${projectStatus}:${selectedProjectId ?? "none"}`}
    />
  );
}

function ProjectPublishPanelSession() {
  const {
    googleStatus,
    driveStatus,
    projectStatus,
    selectedProjectId,
    projectSummary,
    isProjectPublishInFlight,
    prepareProjectPublishReview,
    commitPreparedProjectPublish,
    cancelPreparedProjectPublish,
  } = useAppState();
  const [uiState, setUiState] = useState<PublishUiState>({ status: "idle" });
  const [confirmed, setConfirmed] = useState(false);
  const requestSequenceRef = useRef(0);
  const actionInFlightRef = useRef(false);
  const cancelRef = useRef(cancelPreparedProjectPublish);

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
    cancelRef.current = cancelPreparedProjectPublish;
  }, [cancelPreparedProjectPublish]);

  async function startReview() {
    if (!selectedProjectId || !isReady || actionInFlightRef.current) return;

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    actionInFlightRef.current = true;
    setConfirmed(false);
    setUiState({ status: "preflighting" });

    const result = await prepareProjectPublishReview(selectedProjectId);
    if (requestSequence !== requestSequenceRef.current) return;

    actionInFlightRef.current = false;
    setUiState(
      result.ok
        ? { status: "review", review: result.review }
        : {
            status: "error",
            phase: "preflight",
            error: {
              ...(result.diagnosticCode
                ? { diagnosticCode: result.diagnosticCode }
                : {}),
              canRetry: false,
            },
          },
    );
  }

  async function publish(review: ProjectPublishReview) {
    if (
      actionInFlightRef.current ||
      !confirmed ||
      review.projectId !== selectedProjectId
    ) {
      return;
    }

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    actionInFlightRef.current = true;
    setUiState({ status: "publishing", review });

    const result = await commitPreparedProjectPublish({
      projectId: review.projectId,
      revisionId: review.revisionId,
    });
    if (requestSequence !== requestSequenceRef.current) return;

    actionInFlightRef.current = false;
    if (result.ok) {
      setConfirmed(false);
      setUiState({ status: "success", result: result.result });
      return;
    }

    setUiState({
      status: "error",
      phase: "publish",
      error: {
        recoverability: result.error.recoverability,
        canRetry: result.error.canRetry,
      },
      ...(result.error.canRetry ? { review } : {}),
    });
  }

  function cancelReview() {
    requestSequenceRef.current += 1;
    actionInFlightRef.current = false;
    cancelPreparedProjectPublish();
    setConfirmed(false);
    setUiState({ status: "idle" });
  }

  return (
    <section aria-labelledby="project-publish-heading">
      <Card className="border-white/10 bg-white/[0.035] text-slate-50">
        <CardHeader>
          <CardTitle>
            <h2 id="project-publish-heading">公開</h2>
          </CardTitle>
          <CardDescription className="text-slate-300">
            今の内容を公開版にします
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 text-sm text-slate-200">
          {!isReady ? (
            <div
              role="status"
              className="rounded-2xl border border-white/10 bg-black/30 p-4"
            >
              Google接続とDriveプロジェクトの選択・確認が完了すると公開前確認を実行できます。
            </div>
          ) : null}

          {uiState.status === "preflighting" ? (
            <div
              aria-live="polite"
              className="flex min-h-11 items-center gap-3 rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100"
            >
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              Driveから現在の公開内容を確認しています。
            </div>
          ) : null}

          {uiState.status === "review" ||
          uiState.status === "publishing" ? (
            <PublishReview
              review={uiState.review}
              confirmed={confirmed}
              publishing={uiState.status === "publishing"}
              disabled={isProjectPublishInFlight}
              onConfirmedChange={setConfirmed}
              onPublish={() => void publish(uiState.review)}
              onCancel={cancelReview}
            />
          ) : null}

          {uiState.status === "success" ? (
            <PublishSuccess result={uiState.result} onNewReview={startReview} />
          ) : null}

          {uiState.status === "error" ? (
            <PublishError
              state={uiState}
              onRetry={
                uiState.review
                  ? () => {
                      setConfirmed(true);
                      void publish(uiState.review as ProjectPublishReview);
                    }
                  : undefined
              }
              onNewReview={startReview}
            />
          ) : null}

          {uiState.status === "idle" || uiState.status === "preflighting" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Button
                type="button"
                className="min-h-11"
                onClick={() => void startReview()}
                disabled={
                  !isReady ||
                  uiState.status === "preflighting" ||
                  isProjectPublishInFlight
                }
              >
                {uiState.status === "preflighting" ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <RefreshCw className="size-4" aria-hidden="true" />
                )}
                公開前に確認
              </Button>
              {uiState.status === "preflighting" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={cancelReview}
                >
                  キャンセル
                </Button>
              ) : null}
              {uiState.status === "idle" ? (
                <>
                  <Button asChild variant="outline" className="min-h-11 border-white/15 bg-white/5 text-slate-100">
                    <Link href="/player">
                      <Play className="size-4" aria-hidden="true" />
                      このiPadの作品を再生
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="min-h-11 text-slate-300 hover:bg-white/8 hover:text-white">
                    <Link href="/admin/history">
                      <History className="size-4" aria-hidden="true" />
                      公開履歴
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}

          <ProductDisclosure label="公開について">
            <p>公開すると、現在保存されている内容を公開履歴へ記録し、Google Drive上の公開版を切り替えます。</p>
            <p className="mt-2">このiPadへの保存は自動では行われません。「このiPad」から別に実行してください。</p>
          </ProductDisclosure>
        </CardContent>
      </Card>
    </section>
  );
}

function PublishReview({
  review,
  confirmed,
  publishing,
  disabled,
  onConfirmedChange,
  onPublish,
  onCancel,
}: {
  review: ProjectPublishReview;
  confirmed: boolean;
  publishing: boolean;
  disabled: boolean;
  onConfirmedChange: (checked: boolean) => void;
  onPublish: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-400/30 bg-black/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-50">公開前確認</h3>
          <Badge variant="secondary">{getProjectPublishModeLabel(review)}</Badge>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <ReviewItem label="作品名" value={review.projectTitle} />
          <ReviewItem label="公開日時" value={formatUiDateTime(review.publishedAt)} />
          <ReviewItem label="スライド数" value={`${review.slideCount}件`} />
          <ReviewItem label="素材数" value={`${review.assetCount}件`} />
          <ReviewItem
            label="オンライン再生のみの動画"
            value={`${review.remoteOnlyAssetCount}件`}
          />
          <ReviewItem
            label="公開種別"
            value={review.initialPublish ? "初回公開" : "更新公開"}
          />
        </dl>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <h3 className="font-semibold text-slate-50">確認事項</h3>
        {review.warnings.length === 0 ? (
          <p className="mt-2 text-emerald-200">
            公開を妨げる警告はありません。
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-amber-100">
            {review.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>
                {sanitizeUserFacingDiagnostic(warning.message)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-slate-300">
          公開後、このiPadへの反映には「このiPadに保存」が別途必要です。
        </p>
      </div>

      <div className="flex min-h-11 items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <input
          id="project-publish-confirmation"
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-sky-400"
          checked={confirmed}
          disabled={publishing || disabled}
          onChange={(event) => onConfirmedChange(event.target.checked)}
        />
        <label
          htmlFor="project-publish-confirmation"
          className="cursor-pointer text-slate-100"
        >
          公開後も、このiPadへの反映には「このiPadに保存」が必要であることを確認しました。
        </label>
      </div>

      {publishing ? (
        <div
          aria-live="polite"
          className="flex min-h-11 items-center gap-3 text-sky-100"
        >
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          公開履歴を準備し、Google Drive上の公開版を切り替えています。
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          className="min-h-11"
          disabled={!confirmed || publishing || disabled}
          onClick={onPublish}
        >
          {publishing ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          )}
          この内容を公開
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={publishing || disabled}
          onClick={onCancel}
        >
          確認を取り消す
        </Button>
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 break-all font-medium text-slate-100">{value}</dd>
    </div>
  );
}

function PublishSuccess({
  result,
  onNewReview,
}: {
  result: SanitizedPublishSuccess;
  onNewReview: () => void;
}) {
  return (
    <div
      role="status"
      className="space-y-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100"
    >
      <div>
        <h3 className="font-semibold">公開が完了しました。</h3>
        <p className="mt-2">{PROJECT_PUBLISH_DRIVE_SUCCESS_MESSAGE}</p>
        <p className="mt-2">{PROJECT_PUBLISH_OFFLINE_SYNC_MESSAGE}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <ReviewItem
          label="公開日時"
          value={formatUiDateTime(result.publishedAt)}
        />
        <ReviewItem
          label="公開履歴"
          value={getRevisionPreparationLabel(result.revisionStatus)}
        />
        <ReviewItem
          label="公開版"
          value={getManifestCommitLabel(result.manifestStatus)}
        />
      </dl>
      {result.refreshMessage ? (
        <p className="rounded-2xl border border-amber-300/30 bg-black/20 p-3 text-amber-100">
          {result.refreshMessage}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="secondary" className="min-h-11">
          <Link href="/admin/history">
            <History className="size-4" aria-hidden="true" />
            公開履歴を見る
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => void onNewReview()}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          新しい公開前確認
        </Button>
      </div>
    </div>
  );
}

function PublishError({
  state,
  onRetry,
  onNewReview,
}: {
  state: Extract<PublishUiState, { status: "error" }>;
  onRetry?: () => void;
  onNewReview: () => void;
}) {
  return (
    <div
      role="alert"
      className="space-y-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100"
    >
      <div>
        <h3 className="font-semibold">
          {state.phase === "preflight"
            ? "公開前確認を完了できませんでした。"
            : "公開処理を完了できませんでした。"}
        </h3>
        <p className="mt-2">
          {getProjectPublishFailureDisplayMessage({
            phase: state.phase,
            error: state.error,
          })}
        </p>
        {state.error.diagnosticCode ? (
          <p className="mt-2">
            診断: {getProjectPublishAssetDiagnosticLabel(
              state.error.diagnosticCode,
            )}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {state.error.canRetry && onRetry ? (
          <Button type="button" className="min-h-11" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden="true" />
            同じ内容で再試行
          </Button>
        ) : state.error.recoverability !== "requiresInspection" ? (
          <Button
            type="button"
            className="min-h-11"
            onClick={() => void onNewReview()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            公開前確認をやり直す
          </Button>
        ) : null}
        <Button asChild variant="secondary" className="min-h-11">
          <Link href="/admin/history">
            <History className="size-4" aria-hidden="true" />
            公開履歴を見る
          </Link>
        </Button>
      </div>
    </div>
  );
}
