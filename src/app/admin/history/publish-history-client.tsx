"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAppState } from "@/app/app-providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProjectPublishRevisionListItem } from "@/lib/publish-history/project-publish-revision-loader";
import type {
  ProjectPublicationOverview,
  ProjectPublishHistoryOverview,
} from "@/lib/publish-history/project-publish-history-overview";
import {
  isCurrentProjectRollbackPreviewRequest,
  type ProjectRollbackPreview,
} from "@/lib/publish-history/project-rollback-preview";
import type { ProjectRollbackExecutionReview } from "@/lib/publish-history/project-rollback-execution-review";
import {
  areProjectRollbackConfirmationsComplete,
  getProjectRollbackFailureDisplayMessage,
  type ProjectRollbackConfirmations,
} from "@/lib/publish-history/project-rollback-ui";
import { sanitizeUserFacingDiagnostic } from "@/lib/user-facing-diagnostics";
import {
  buildRevisionDetailViewModel,
  formatMetadataStatus,
  formatPublicationStatus,
  formatPublishedAt,
  formatPublishOperation,
  formatRevisionPublicationMarker,
  getRevisionPublicationMarker,
  mapPublishHistoryErrorCode,
  type ProjectPublishRevisionDetailViewModel,
  type ProjectPublishRevisionPublicationMarker,
} from "@/lib/publish-history/project-publish-history-view";

type HistoryViewState =
  | "idle"
  | "loading"
  | "notConfigured"
  | "empty"
  | "ready"
  | "invalid"
  | "error";

type RevisionDetailState = "closed" | "loading" | "ready" | "error";
type RollbackPreviewState =
  | "closed"
  | "loading"
  | "ready"
  | "degraded"
  | "blocked"
  | "noChange"
  | "stale"
  | "error";
type RollbackExecutionState =
  | "idle"
  | "preparing"
  | "prepared"
  | "executing"
  | "error";

const emptyRollbackConfirmations: ProjectRollbackConfirmations = {
  createsNewRevision: false,
  driveOnly: false,
  replacesUnpublishedChanges: false,
};

const invalidLocationCodes = new Set([
  "duplicateHistoryFolder",
  "invalidHistoryFolder",
  "duplicateRevisionsFolder",
  "invalidRevisionsFolder",
  "invalidManifestMetadata",
  "invalidManifest",
]);

export function PublishHistoryClient() {
  const {
    googleStatus,
    googleStatusLabel,
    driveFileGranted,
    driveStatus,
    projectStatus,
    driveProjects,
    selectedProjectId,
    isDriveOperationInFlight,
    checkProject,
    selectProject,
    loadProjectPublishRevisionForProject,
    loadProjectPublishHistoryOverviewForProject,
    prepareProjectRollbackPreview,
    prepareProjectRollbackExecutionReview,
    commitPreparedProjectRollback,
    cancelPreparedProjectRollback,
    isProjectRollbackInFlight,
  } = useAppState();
  const [historyState, setHistoryState] = useState<HistoryViewState>("idle");
  const [items, setItems] = useState<ProjectPublishRevisionListItem[]>([]);
  const [historyMessage, setHistoryMessage] = useState(
    "閲覧するプロジェクトを選択してください。",
  );
  const [invalidMetadataCount, setInvalidMetadataCount] = useState(0);
  const [ignoredFileCount, setIgnoredFileCount] = useState(0);
  const [duplicateRevisionIdCount, setDuplicateRevisionIdCount] = useState(0);
  const [overview, setOverview] =
    useState<ProjectPublishHistoryOverview | null>(null);
  const [detailState, setDetailState] = useState<RevisionDetailState>("closed");
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectPublishRevisionDetailViewModel | null>(null);
  const [detailMessage, setDetailMessage] = useState("");
  const [previewState, setPreviewState] =
    useState<RollbackPreviewState>("closed");
  const [preview, setPreview] = useState<ProjectRollbackPreview | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [executionState, setExecutionState] =
    useState<RollbackExecutionState>("idle");
  const [executionReview, setExecutionReview] =
    useState<ProjectRollbackExecutionReview | null>(null);
  const [executionMessage, setExecutionMessage] = useState("");
  const [confirmations, setConfirmations] =
    useState<ProjectRollbackConfirmations>(emptyRollbackConfirmations);
  const [rollbackOutcome, setRollbackOutcome] = useState<{
    kind: "success" | "warning";
    message: string;
  } | null>(null);
  const listSequenceRef = useRef(0);
  const detailSequenceRef = useRef(0);
  const listAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const loadedProjectIdRef = useRef<string | null>(null);
  const detailOwnerRef = useRef<{ projectId: string; revisionId: string } | null>(
    null,
  );
  const previewSequenceRef = useRef(0);
  const previewInFlightRef = useRef(false);
  const rollbackActionInFlightRef = useRef(false);
  const previewOwnerRef = useRef<{
    projectId: string;
    targetRevisionId: string;
  } | null>(null);

  const isGoogleReady =
    googleStatus === "connected" && driveFileGranted === true;
  const selectedProject = driveProjects.find(
    (project) => project.projectId === selectedProjectId,
  );
  const canReload =
    isGoogleReady &&
    driveStatus === "ready" &&
    projectStatus === "ready" &&
    Boolean(selectedProjectId) &&
    historyState !== "loading" &&
    !isProjectRollbackInFlight &&
    executionState !== "executing" &&
    executionState !== "preparing";
  const rollbackBusy =
    isProjectRollbackInFlight ||
    executionState === "preparing" ||
    executionState === "executing";
  const loadHistoryListEffect = useEffectEvent((projectId: string) => {
    void loadHistoryOverview(projectId);
  });

  useEffect(() => {
    if (
      isGoogleReady &&
      driveStatus === "ready" &&
      projectStatus === "idle" &&
      !isDriveOperationInFlight
    ) {
      checkProject();
    }
  }, [
    checkProject,
    driveStatus,
    isDriveOperationInFlight,
    isGoogleReady,
    projectStatus,
  ]);

  useEffect(() => {
    if (
      !isGoogleReady ||
      driveStatus !== "ready" ||
      projectStatus !== "ready" ||
      !selectedProjectId ||
      loadedProjectIdRef.current === selectedProjectId
    ) {
      return;
    }
    loadedProjectIdRef.current = selectedProjectId;
    loadHistoryListEffect(selectedProjectId);
  }, [
    driveStatus,
    isGoogleReady,
    projectStatus,
    selectedProjectId,
  ]);

  useEffect(() => {
    return () => {
      listAbortRef.current?.abort();
      detailAbortRef.current?.abort();
      previewAbortRef.current?.abort();
      listSequenceRef.current += 1;
      detailSequenceRef.current += 1;
      previewSequenceRef.current += 1;
      previewInFlightRef.current = false;
      rollbackActionInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isGoogleReady) return;
    listAbortRef.current?.abort();
    detailAbortRef.current?.abort();
    previewAbortRef.current?.abort();
    listSequenceRef.current += 1;
    detailSequenceRef.current += 1;
    previewSequenceRef.current += 1;
    previewInFlightRef.current = false;
    loadedProjectIdRef.current = null;
    detailOwnerRef.current = null;
    previewOwnerRef.current = null;
    const clearTimer = window.setTimeout(() => {
      setItems([]);
      setOverview(null);
      setDetail(null);
      setDetailState("closed");
      setSelectedRevisionId(null);
      setPreview(null);
      setPreviewState("closed");
      setPreviewMessage("");
      setExecutionState("idle");
      setExecutionReview(null);
      setExecutionMessage("");
      setConfirmations(emptyRollbackConfirmations);
      setRollbackOutcome(null);
      setHistoryState("idle");
      setHistoryMessage("Google Driveに接続してください。");
    }, 0);
    return () => window.clearTimeout(clearTimer);
  }, [isGoogleReady]);

  useEffect(() => {
    if (driveStatus === "ready" && projectStatus === "ready") return;
    previewAbortRef.current?.abort();
    previewSequenceRef.current += 1;
    previewInFlightRef.current = false;
    previewOwnerRef.current = null;
    const clearTimer = window.setTimeout(() => {
      setPreview(null);
      setPreviewState("closed");
      setPreviewMessage("");
    }, 0);
    return () => window.clearTimeout(clearTimer);
  }, [driveStatus, projectStatus]);

  function clearRollbackPreview() {
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    previewSequenceRef.current += 1;
    previewInFlightRef.current = false;
    previewOwnerRef.current = null;
    rollbackActionInFlightRef.current = false;
    cancelPreparedProjectRollback();
    setPreview(null);
    setPreviewState("closed");
    setPreviewMessage("");
    setExecutionState("idle");
    setExecutionReview(null);
    setExecutionMessage("");
    setConfirmations(emptyRollbackConfirmations);
  }

  function clearDetail() {
    detailAbortRef.current?.abort();
    detailSequenceRef.current += 1;
    clearRollbackPreview();
    setDetailState("closed");
    detailOwnerRef.current = null;
    setSelectedRevisionId(null);
    setDetail(null);
    setDetailMessage("");
  }

  function clearHistoryForSelection() {
    listAbortRef.current?.abort();
    listSequenceRef.current += 1;
    loadedProjectIdRef.current = null;
    setItems([]);
    setOverview(null);
    setInvalidMetadataCount(0);
    setIgnoredFileCount(0);
    setDuplicateRevisionIdCount(0);
    setHistoryState("idle");
    setHistoryMessage("選択したプロジェクトを確認しています。");
    setRollbackOutcome(null);
    clearDetail();
  }

  async function loadHistoryOverview(projectId: string) {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const sequence = listSequenceRef.current + 1;
    listSequenceRef.current = sequence;
    setItems([]);
    setOverview(null);
    setInvalidMetadataCount(0);
    setIgnoredFileCount(0);
    setDuplicateRevisionIdCount(0);
    setHistoryState("loading");
    setHistoryMessage("Google Driveから公開履歴を読み込んでいます。");
    clearDetail();

    const result = await loadProjectPublishHistoryOverviewForProject(
      projectId,
      controller.signal,
    );
    if (
      controller.signal.aborted ||
      sequence !== listSequenceRef.current ||
      projectId !== selectedProjectId
    ) {
      return;
    }
    if (!result.ok) {
      setHistoryState(invalidLocationCodes.has(result.code) ? "invalid" : "error");
      setHistoryMessage(result.message);
      return;
    }
    const nextOverview = result.overview;
    setOverview(nextOverview);
    setItems(nextOverview.items);
    setInvalidMetadataCount(nextOverview.invalidMetadataCount);
    setIgnoredFileCount(nextOverview.ignoredFileCount);
    setDuplicateRevisionIdCount(nextOverview.duplicateRevisionIdCount);
    if (nextOverview.historyStatus === "notConfigured") {
      setHistoryState("notConfigured");
      setHistoryMessage(
        "このプロジェクトには公開履歴がありません。初回公開後に履歴が表示されます。",
      );
      return;
    }
    if (nextOverview.items.length === 0) {
      setHistoryState("empty");
      setHistoryMessage("公開履歴はありません。");
      return;
    }
    setHistoryState("ready");
    setHistoryMessage(
      `${nextOverview.items.length}件の公開履歴情報を読み込みました。`,
    );
  }

  async function loadDetail(projectId: string, revisionId: string) {
    detailAbortRef.current?.abort();
    clearRollbackPreview();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const sequence = detailSequenceRef.current + 1;
    detailSequenceRef.current = sequence;
    setSelectedRevisionId(revisionId);
    detailOwnerRef.current = { projectId, revisionId };
    setDetail(null);
    setDetailState("loading");
    setDetailMessage("公開履歴の詳細を読み込んでいます。");

    const result = await loadProjectPublishRevisionForProject(
      projectId,
      revisionId,
      controller.signal,
    );
    if (
      controller.signal.aborted ||
      sequence !== detailSequenceRef.current ||
      detailOwnerRef.current?.projectId !== projectId ||
      detailOwnerRef.current?.revisionId !== revisionId
    ) {
      return;
    }
    if (!result.ok) {
      setDetailState("error");
      setDetailMessage(mapPublishHistoryErrorCode(result.code));
      return;
    }
    setDetail(buildRevisionDetailViewModel(result.revision));
    setDetailState("ready");
    setDetailMessage("公開履歴の詳細を読み込みました。");
  }

  function handleProjectChange(projectId: string) {
    clearHistoryForSelection();
    if (projectId) selectProject(projectId);
  }

  function handleReload() {
    if (!selectedProjectId || !canReload) return;
    loadedProjectIdRef.current = selectedProjectId;
    void loadHistoryOverview(selectedProjectId);
  }

  function handleOpenDetail(item: ProjectPublishRevisionListItem) {
    if (!selectedProjectId || item.metadataStatus !== "ready") return;
    void loadDetail(selectedProjectId, item.revisionId);
  }

  function handleRetryDetail() {
    if (!selectedProjectId || !selectedRevisionId || detailState === "loading") return;
    void loadDetail(selectedProjectId, selectedRevisionId);
  }

  async function startRollbackPreview() {
    if (
      !selectedProjectId ||
      !selectedRevisionId ||
      detailState !== "ready" ||
      previewInFlightRef.current
    ) {
      return;
    }
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    const sequence = previewSequenceRef.current + 1;
    previewSequenceRef.current = sequence;
    previewInFlightRef.current = true;
    const owner = {
      projectId: selectedProjectId,
      targetRevisionId: selectedRevisionId,
    };
    previewOwnerRef.current = owner;
    cancelPreparedProjectRollback();
    setExecutionState("idle");
    setExecutionReview(null);
    setExecutionMessage("");
    setConfirmations(emptyRollbackConfirmations);
    setRollbackOutcome(null);
    setPreview(null);
    setPreviewState("loading");
    setPreviewMessage(
      "Google Driveの最新状態からロールバックの影響を確認しています。",
    );

    const result = await prepareProjectRollbackPreview(
      owner.projectId,
      owner.targetRevisionId,
      controller.signal,
    );
    if (
      !isCurrentProjectRollbackPreviewRequest({
        owner,
        activeOwner: previewOwnerRef.current,
        sequence,
        activeSequence: previewSequenceRef.current,
        currentProjectId: selectedProjectId,
        currentTargetRevisionId: selectedRevisionId,
        aborted: controller.signal.aborted,
      })
    ) {
      return;
    }
    previewInFlightRef.current = false;
    previewAbortRef.current = null;
    if (!result.ok) {
      setPreview(null);
      setPreviewState(
        result.category === "stale"
          ? "stale"
          : result.category === "blocked"
            ? "blocked"
            : "error",
      );
      setPreviewMessage(result.message);
      return;
    }
    setPreview(result.preview);
    setPreviewState(result.preview.readiness);
    setPreviewMessage(result.preview.message);
  }

  async function prepareRollbackExecutionReview() {
    if (
      !selectedProjectId ||
      !selectedRevisionId ||
      previewState !== "ready" ||
      !preview ||
      !areProjectRollbackConfirmationsComplete({
        confirmations,
        replacesUnpublishedChanges: preview.replacesUnpublishedChanges,
      }) ||
      rollbackActionInFlightRef.current
    ) {
      return;
    }
    rollbackActionInFlightRef.current = true;
    setExecutionState("preparing");
    setExecutionReview(null);
    setExecutionMessage("実行前の最新状態を再確認しています。");
    const result = await prepareProjectRollbackExecutionReview(
      selectedProjectId,
      selectedRevisionId,
    );
    rollbackActionInFlightRef.current = false;
    if (!result.ok) {
      setExecutionState("error");
      setExecutionMessage(result.message);
      if (result.category === "stale") {
        setPreviewState("stale");
        setPreview(null);
        setConfirmations(emptyRollbackConfirmations);
      }
      return;
    }
    setExecutionReview(result.review);
    setExecutionState("prepared");
    setExecutionMessage(
      "最新状態の再確認が完了しました。最終内容を確認してロールバックを実行してください。",
    );
  }

  async function commitRollback() {
    if (
      !selectedProjectId ||
      !selectedRevisionId ||
      !executionReview ||
      executionState !== "prepared" ||
      !preview ||
      !areProjectRollbackConfirmationsComplete({
        confirmations,
        replacesUnpublishedChanges: preview.replacesUnpublishedChanges,
      }) ||
      rollbackActionInFlightRef.current
    ) {
      return;
    }
    rollbackActionInFlightRef.current = true;
    setExecutionState("executing");
    setExecutionMessage("ロールバックを実行し、Driveへの反映結果を確認しています。");
    const result = await commitPreparedProjectRollback({
      projectId: selectedProjectId,
      targetRevisionId: selectedRevisionId,
      revisionId: executionReview.revisionId,
    });
    rollbackActionInFlightRef.current = false;
    if (!result.ok) {
      setExecutionState("error");
      setExecutionMessage(
        getProjectRollbackFailureDisplayMessage(result.error),
      );
      if (!result.error.canRetry) {
        setExecutionReview(null);
        setConfirmations(emptyRollbackConfirmations);
      } else {
        setExecutionState("prepared");
      }
      return;
    }
    const warning = result.result.indexStatus === "warning";
    setRollbackOutcome({
      kind: warning ? "warning" : "success",
      message: warning
        ? "ロールバック本体は成功しました。プロジェクト一覧の更新結果は要確認です。ロールバック本体は取り消していません。"
        : "ロールバックが完了し、プロジェクト設定と一覧の再確認に成功しました。",
    });
    setExecutionState("idle");
    setExecutionReview(null);
    setConfirmations(emptyRollbackConfirmations);
    setPreview(null);
    setPreviewState("closed");
    setPreviewMessage("");
    if (selectedProjectId) {
      loadedProjectIdRef.current = selectedProjectId;
      void loadHistoryOverview(selectedProjectId);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 text-slate-50">
        <CardHeader>
          <CardTitle>閲覧対象</CardTitle>
          <CardDescription className="text-slate-300">
            公開履歴はプロジェクト単位です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isGoogleReady ? (
            <div role="status" className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
              <p className="font-semibold">Google Driveに接続してください。</p>
              <p className="mt-2 text-sm">現在の状態: {googleStatusLabel}</p>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="grid gap-2 text-sm font-medium" htmlFor="history-project">
              プロジェクト
              <select
                id="history-project"
                value={selectedProjectId ?? ""}
                onChange={(event) => handleProjectChange(event.target.value)}
                disabled={!isGoogleReady || isDriveOperationInFlight || driveProjects.length === 0 || rollbackBusy}
                className="min-h-11 w-full rounded-xl border border-white/20 bg-slate-900 px-3 text-base text-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <option value="">プロジェクトを選択</option>
                {driveProjects.map((project) => (
                  <option key={project.projectId} value={project.projectId}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="secondary" className="min-h-11" onClick={handleReload} disabled={!canReload}>
              {historyState === "loading" ? "読込中" : "再読込"}
            </Button>
          </div>
          {driveProjects.length === 0 && projectStatus !== "checking" ? (
            <p className="text-sm text-slate-400">閲覧できるプロジェクトがありません。</p>
          ) : null}
          {selectedProject ? (
            <p className="text-sm text-slate-300">選択中: {selectedProject.title}</p>
          ) : null}
        </CardContent>
      </Card>

      <PublicationStatusCard
        state={historyState}
        publication={overview?.publication ?? null}
        message={historyMessage}
      />

      <div
        role={historyState === "invalid" || historyState === "error" ? "alert" : "status"}
        aria-live="polite"
        className={
          historyState === "invalid" || historyState === "error"
            ? "rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100"
            : "rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-200"
        }
      >
        <p className="font-semibold">公開履歴状態</p>
        <p className="mt-2">{historyMessage}</p>
        {historyState === "invalid" ? (
          <p className="mt-2 text-sm">自動修復や自動選択は行いません。</p>
        ) : null}
      </div>

      {rollbackOutcome ? (
        <div
          role={rollbackOutcome.kind === "warning" ? "alert" : "status"}
          aria-live="polite"
          className={
            rollbackOutcome.kind === "warning"
              ? "rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-amber-100"
              : "rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4 text-emerald-100"
          }
        >
          <p className="font-semibold">
            {rollbackOutcome.kind === "warning"
              ? "ロールバック完了・プロジェクト一覧は要確認"
              : "ロールバック完了"}
          </p>
          <p className="mt-2">{rollbackOutcome.message}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <RevisionList
          items={items}
          selectedRevisionId={selectedRevisionId}
          invalidMetadataCount={invalidMetadataCount}
          ignoredFileCount={ignoredFileCount}
          duplicateRevisionIdCount={duplicateRevisionIdCount}
          publication={overview?.publication ?? null}
          disabled={rollbackBusy}
          onOpenDetail={handleOpenDetail}
        />
        <RevisionDetail
          state={detailState}
          detail={detail}
          message={detailMessage}
          publication={overview?.publication ?? null}
          previewState={previewState}
          preview={preview}
          previewMessage={previewMessage}
          executionState={executionState}
          executionReview={executionReview}
          executionMessage={executionMessage}
          confirmations={confirmations}
          rollbackBusy={rollbackBusy}
          onClose={clearDetail}
          onRetry={handleRetryDetail}
          onStartPreview={() => void startRollbackPreview()}
          onClosePreview={clearRollbackPreview}
          onConfirmationsChange={setConfirmations}
          onPrepareExecution={() => void prepareRollbackExecutionReview()}
          onCommitRollback={() => void commitRollback()}
        />
      </div>
    </div>
  );
}

function PublicationStatusCard({
  state,
  publication,
  message,
}: {
  state: HistoryViewState;
  publication: ProjectPublicationOverview | null;
  message: string;
}) {
  const isLoading = state === "loading";
  const isUnavailable =
    publication?.status === "missingCurrentRevision" ||
    publication?.status === "inconsistent" ||
    publication?.status === "unavailable";
  const isCurrent =
    publication?.status === "current" ||
    publication?.status === "currentWithUnpublishedChanges";
  const hasHistoryWithoutPublication =
    publication?.status === "noPublicationWithHistory";
  const badgeClassName =
    publication?.status === "currentWithUnpublishedChanges"
      ? "border-amber-400/50 text-amber-100"
      : isCurrent
        ? "border-emerald-400/50 text-emerald-100"
        : isUnavailable
          ? "border-rose-400/50 text-rose-100"
          : hasHistoryWithoutPublication
            ? "border-amber-400/50 text-amber-100"
          : "border-slate-500 text-slate-200";

  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <CardTitle>
          <h2 id="current-publication-heading">現在の公開状態</h2>
        </CardTitle>
        <CardDescription className="text-slate-300">
          現在のプロジェクト設定を再取得し、参照している公開版との整合性を確認します。
        </CardDescription>
      </CardHeader>
      <CardContent
        aria-labelledby="current-publication-heading"
        className="space-y-4"
      >
        {isLoading ? (
          <p role="status" aria-live="polite">
            現在の公開情報を確認しています。
          </p>
        ) : null}
        {!isLoading &&
        !publication &&
        (state === "invalid" || state === "error") ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100"
          >
            <Badge
              variant="outline"
              className="border-rose-400/50 text-rose-100"
            >
              現在の公開情報を確認できない
            </Badge>
            <p className="mt-3 font-semibold">{message}</p>
            <p className="mt-2 text-sm">
              自動修復や自動再試行は行いません。状態を確認して手動で再読込してください。
            </p>
          </div>
        ) : null}
        {!isLoading &&
        !publication &&
        state !== "invalid" &&
        state !== "error" ? (
          <p className="text-sm text-slate-400">
            プロジェクトを選択して公開情報を読み込んでください。
          </p>
        ) : null}
        {!isLoading && publication ? (
          <>
            <div
              role={isUnavailable ? "alert" : "status"}
              className={
                isUnavailable
                  ? "rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100"
                  : publication.status === "currentWithUnpublishedChanges" ||
                      hasHistoryWithoutPublication
                    ? "rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100"
                    : "rounded-xl border border-white/10 bg-black/20 p-4 text-slate-200"
              }
            >
              <Badge variant="outline" className={badgeClassName}>
                {formatPublicationStatus(publication.status)}
              </Badge>
              <p className="mt-3 font-semibold">
                {sanitizeUserFacingDiagnostic(publication.message)}
              </p>
              {publication.diagnostics.map((diagnostic) => (
                <p key={diagnostic} className="mt-2 text-sm">
                  {sanitizeUserFacingDiagnostic(diagnostic)}
                </p>
              ))}
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <DetailField
                label="公開日時"
                value={
                  publication.currentRevisionId === null
                    ? "なし"
                    : formatPublishedAt(publication.publishedAt)
                }
              />
              <DetailField
                label="操作"
                value={
                  publication.currentRevisionId === null
                    ? "なし"
                    : formatPublishOperation(publication.operation)
                }
              />
              <DetailField
                label="公開後の未公開編集"
                value={
                  publication.hasUnpublishedChanges === null
                    ? publication.currentRevisionId === null
                      ? "対象なし"
                      : "確認不可"
                    : publication.hasUnpublishedChanges
                      ? "あり"
                      : "なし"
                }
              />
              <DetailField
                label="公開履歴の表示範囲"
                value={
                  publication.currentRevisionId === null
                    ? "対象なし"
                    : publication.currentRevisionInList
                      ? "現在公開中の版を含む"
                      : "現在公開中の版は一覧の範囲外"
                }
              />
            </dl>
            <p className="text-xs leading-relaxed text-slate-400">
              現在公開中以外には、過去の公開版と作成途中の公開版が含まれる可能性があります。この画面では自動分類しません。
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RevisionList(props: {
  items: ProjectPublishRevisionListItem[];
  selectedRevisionId: string | null;
  invalidMetadataCount: number;
  ignoredFileCount: number;
  duplicateRevisionIdCount: number;
  publication: ProjectPublicationOverview | null;
  disabled: boolean;
  onOpenDetail: (item: ProjectPublishRevisionListItem) => void;
}) {
  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <CardTitle>公開版一覧</CardTitle>
        <CardDescription className="text-slate-300">一覧では公開日時と状態を表示し、内容は選択時に取得します。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.invalidMetadataCount > 0 || props.duplicateRevisionIdCount > 0 ? (
          <div role="status" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            確認が必要な公開版情報: {props.invalidMetadataCount}件 / 重複した公開版: {props.duplicateRevisionIdCount}件
          </div>
        ) : null}
        {props.ignoredFileCount > 0 ? (
          <p className="text-xs text-slate-400">履歴対象外のファイル: {props.ignoredFileCount}件</p>
        ) : null}
        {props.items.map((item, index) => {
          const selected = props.selectedRevisionId === item.revisionId;
          const publicationMarker = getRevisionPublicationMarker(
            props.publication,
            item.revisionId,
          );
          return (
            <article key={`${item.revisionId}:${item.publishedAt ?? "unknown"}:${index}`} className={selected ? "rounded-2xl border border-sky-400/50 bg-sky-400/10 p-4" : "rounded-2xl border border-white/10 bg-black/20 p-4"}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    publicationMarker === "current" ? "secondary" : "outline"
                  }
                  className={
                    publicationMarker === "needsInspection"
                      ? "border-amber-400/50 text-amber-100"
                      : publicationMarker === "history"
                        ? "border-slate-500 text-slate-200"
                        : undefined
                  }
                >
                  {formatRevisionPublicationMarker(publicationMarker)}
                </Badge>
                <Badge variant={item.metadataStatus === "ready" ? "secondary" : "outline"}>{formatMetadataStatus(item.metadataStatus)}</Badge>
                <span className="text-sm font-semibold">{formatPublishOperation(item.operation)}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm">
                <div><dt className="text-slate-400">公開日時</dt><dd>{formatPublishedAt(item.publishedAt)}</dd></div>
                <div><dt className="text-slate-400">履歴更新日時</dt><dd>{formatPublishedAt(item.modifiedTime)}</dd></div>
              </dl>
              <Button
                type="button"
                variant={selected ? "secondary" : "outline"}
                className="mt-4 min-h-11 w-full"
                onClick={() => props.onOpenDetail(item)}
                disabled={item.metadataStatus !== "ready" || selected || props.disabled}
                aria-pressed={selected}
              >
                {item.metadataStatus !== "ready" ? "要確認のため詳細取得不可" : selected ? "詳細を表示中" : "詳細を開く"}
              </Button>
            </article>
          );
        })}
        {props.items.length === 0 ? <p className="text-sm text-slate-400">表示する公開版はありません。</p> : null}
      </CardContent>
    </Card>
  );
}

function RevisionDetail(props: {
  state: RevisionDetailState;
  detail: ProjectPublishRevisionDetailViewModel | null;
  message: string;
  publication: ProjectPublicationOverview | null;
  previewState: RollbackPreviewState;
  preview: ProjectRollbackPreview | null;
  previewMessage: string;
  executionState: RollbackExecutionState;
  executionReview: ProjectRollbackExecutionReview | null;
  executionMessage: string;
  confirmations: ProjectRollbackConfirmations;
  rollbackBusy: boolean;
  onClose: () => void;
  onRetry: () => void;
  onStartPreview: () => void;
  onClosePreview: () => void;
  onConfirmationsChange: (value: ProjectRollbackConfirmations) => void;
  onPrepareExecution: () => void;
  onCommitRollback: () => void;
}) {
  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>公開版の詳細</CardTitle>
          {props.state !== "closed" ? <Button type="button" variant="outline" className="min-h-11" onClick={props.onClose} disabled={props.rollbackBusy}>閉じる</Button> : null}
        </div>
        <CardDescription className="text-slate-300">公開日時、操作、対象内容を確認できます。</CardDescription>
      </CardHeader>
      <CardContent>
        {props.state === "closed" ? <p className="text-sm text-slate-400">一覧から確認できる公開版を選択してください。</p> : null}
        {props.state === "loading" ? <p role="status" aria-live="polite">{props.message}</p> : null}
        {props.state === "error" ? (
          <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100">
            <p>{sanitizeUserFacingDiagnostic(props.message)}</p>
            <Button type="button" variant="secondary" className="mt-3 min-h-11" onClick={props.onRetry}>詳細を再読込</Button>
          </div>
        ) : null}
        {props.state === "ready" && props.detail ? (
          <ReadyRevisionDetail
            detail={props.detail}
            publicationMarker={getRevisionPublicationMarker(
              props.publication,
              props.detail.revisionId,
            )}
            previewState={props.previewState}
            rollbackBusy={props.rollbackBusy}
            onStartPreview={props.onStartPreview}
          />
        ) : null}
        {props.state === "ready" && props.previewState !== "closed" ? (
          <RollbackPreviewPanel
            state={props.previewState}
            preview={props.preview}
            message={props.previewMessage}
            onRecheck={props.onStartPreview}
            onClose={props.onClosePreview}
            executionState={props.executionState}
            executionReview={props.executionReview}
            executionMessage={props.executionMessage}
            confirmations={props.confirmations}
            rollbackBusy={props.rollbackBusy}
            onConfirmationsChange={props.onConfirmationsChange}
            onPrepareExecution={props.onPrepareExecution}
            onCommitRollback={props.onCommitRollback}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReadyRevisionDetail({
  detail,
  publicationMarker,
  previewState,
  rollbackBusy,
  onStartPreview,
}: {
  detail: ProjectPublishRevisionDetailViewModel;
  publicationMarker: ProjectPublishRevisionPublicationMarker;
  previewState: RollbackPreviewState;
  rollbackBusy: boolean;
  onStartPreview: () => void;
}) {
  return (
    <div className="space-y-5">
      <div
        role="status"
        className={
          publicationMarker === "current"
            ? "rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100"
            : publicationMarker === "needsInspection"
              ? "rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100"
              : "rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-200"
        }
      >
        <p className="font-semibold">
          {formatRevisionPublicationMarker(publicationMarker)}
        </p>
        <p className="mt-1">
          {publicationMarker === "current"
            ? "この確認済みの公開版が現在公開中です。"
            : publicationMarker === "needsInspection"
              ? "プロジェクト設定の参照先ですが、現在公開中とは断定できません。"
              : "現在公開中の版ではありません。履歴上の位置づけは自動分類しません。"}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <DetailField label="公開日時" value={detail.publishedAt} />
        <DetailField label="操作" value={detail.operation} />
        <DetailField label="元データの更新日時" value={detail.sourceManifestModifiedTime} />
        <DetailField label="公開版との整合性" value="確認済み" />
      </dl>
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryBox label="スライド" value={detail.summary.slideCount} />
        <SummaryBox label="素材" value={detail.summary.assetCount} />
        <SummaryBox label="remoteOnly素材" value={detail.summary.remoteOnlyAssetCount} />
      </div>
      <section aria-labelledby="history-slides-heading">
        <h3 id="history-slides-heading" className="text-lg font-semibold">スライド一覧</h3>
        <div className="mt-3 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
          {detail.slides.map((slide) => (
            <article key={slide.slideId} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{slide.order}</Badge><span>{formatMediaType(slide.type)}</span>{slide.remoteOnly ? <Badge variant="secondary">remoteOnly</Badge> : null}</div>
              <p className="mt-2 break-words font-medium">{slide.assetName}</p>
              <p className="mt-2 break-words text-slate-300">テロップ: {slide.caption || "なし"}</p>
              <p className="mt-1 text-slate-300">表示時間: {slide.durationSeconds}秒</p>
            </article>
          ))}
          {detail.slides.length === 0 ? <p className="text-sm text-slate-400">スライドはありません。</p> : null}
        </div>
      </section>
      <section aria-labelledby="history-assets-heading">
        <h3 id="history-assets-heading" className="text-lg font-semibold">素材一覧</h3>
        <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {detail.assets.map((asset, index) => (
            <article key={asset.assetId} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{formatMediaType(asset.mimeType)}</Badge>{asset.remoteOnly ? <Badge variant="secondary">remoteOnly</Badge> : null}</div>
              <p className="mt-2 font-medium">素材 {index + 1}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-slate-300"><div><dt className="text-slate-400">容量</dt><dd>{asset.size}</dd></div><div><dt className="text-slate-400">更新日時</dt><dd>{asset.modifiedTime}</dd></div></dl>
            </article>
          ))}
          {detail.assets.length === 0 ? <p className="text-sm text-slate-400">素材はありません。</p> : null}
        </div>
      </section>
      <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4">
        <p className="font-semibold text-sky-100">
          ロールバックの影響確認
        </p>
        <p className="mt-2 text-sm text-slate-200">
          ボタンを押した時点のGoogle Driveから最新状態を読み取り、影響だけを確認します。
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4 min-h-11 w-full"
          onClick={onStartPreview}
          disabled={previewState === "loading" || rollbackBusy}
        >
          {previewState === "loading"
            ? "ロールバックの影響を確認中"
            : previewState === "closed"
              ? "ロールバック影響を確認"
              : "影響を再確認"}
        </Button>
      </div>
    </div>
  );
}

function RollbackPreviewPanel(props: {
  state: Exclude<RollbackPreviewState, "closed">;
  preview: ProjectRollbackPreview | null;
  message: string;
  onRecheck: () => void;
  onClose: () => void;
  executionState: RollbackExecutionState;
  executionReview: ProjectRollbackExecutionReview | null;
  executionMessage: string;
  confirmations: ProjectRollbackConfirmations;
  rollbackBusy: boolean;
  onConfirmationsChange: (value: ProjectRollbackConfirmations) => void;
  onPrepareExecution: () => void;
  onCommitRollback: () => void;
}) {
  const isFailure =
    props.state === "blocked" ||
    props.state === "stale" ||
    props.state === "error";
  const statusLabel =
    props.state === "loading"
      ? "確認中"
      : props.state === "ready"
        ? "実行可能"
        : props.state === "degraded"
          ? "一部を確認できない・要確認"
          : props.state === "noChange"
            ? "変更なし"
            : props.state === "stale"
              ? "状態が変更済み・再確認が必要"
              : props.state === "blocked"
                ? "安全確認で停止"
                : "読込エラー";
  const impact = props.preview?.manifestImpact;
  const confirmationsComplete =
    props.preview !== null &&
    areProjectRollbackConfirmationsComplete({
      confirmations: props.confirmations,
      replacesUnpublishedChanges: props.preview.replacesUnpublishedChanges,
    });

  return (
    <section
      aria-labelledby="rollback-preview-heading"
      className="mt-6 min-w-0 rounded-2xl border border-white/15 bg-black/25 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="rollback-preview-heading" className="text-lg font-semibold">
            読み取り専用の影響確認
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            この画面ではDriveの内容を変更しません。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={props.onClose}
          disabled={props.rollbackBusy}
        >
          影響確認を閉じる
        </Button>
      </div>

      <div
        role={isFailure ? "alert" : "status"}
        aria-live="polite"
        className={
          isFailure
            ? "mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100"
            : props.state === "degraded"
              ? "mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100"
              : "mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-slate-100"
        }
      >
        <Badge variant="outline">{statusLabel}</Badge>
        <p className="mt-3 font-semibold">
          {sanitizeUserFacingDiagnostic(props.message)}
        </p>
        {props.state === "loading" ? (
          <p className="mt-2 text-sm">
            現在のプロジェクト設定、現在公開中の版、復元対象の公開版、すべての参照素材を確認しています。
          </p>
        ) : null}
      </div>

      {props.state !== "loading" ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={props.onRecheck}
            disabled={props.rollbackBusy}
          >
            影響を再確認
          </Button>
        </div>
      ) : null}

      {props.preview && impact ? (
        <div className="mt-5 space-y-5">
          {props.preview.warnings.map((warning) => (
            <div
              key={warning}
              role="status"
              className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 font-semibold text-amber-100"
            >
              {sanitizeUserFacingDiagnostic(warning)}
            </div>
          ))}

          <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <DetailField
              label="確認日時（東京）"
              value={formatPublishedAt(props.preview.checkedAt)}
            />
            <DetailField
                label="復元対象の公開日時"
              value={formatPublishedAt(props.preview.targetPublishedAt)}
            />
            <DetailField
                label="復元対象の操作"
              value={formatPublishOperation(props.preview.targetOperation)}
            />
            <DetailField
              label="公開後の未公開編集"
              value={impact.hasUnpublishedChanges ? "あり・置換対象" : "なし"}
            />
          </dl>

          <section aria-labelledby="rollback-manifest-impact-heading">
            <h4
              id="rollback-manifest-impact-heading"
              className="font-semibold"
            >
              プロジェクト設定とスライドへの影響
            </h4>
            <dl className="mt-3 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
              <DetailField
                label="現在のプロジェクト名"
                value={impact.currentProjectTitle}
              />
              <DetailField
                label="ロールバック後のプロジェクト名"
                value={impact.rollbackProjectTitle}
              />
              <DetailField
                label="名前の変更"
                value={impact.titleChanged ? "あり" : "なし"}
              />
              <DetailField
                label="スライド数"
                value={`${impact.currentSlideCount} → ${impact.rollbackSlideCount}`}
              />
              <DetailField
                label="参照素材数"
                value={`${impact.currentUniqueAssetCount} → ${impact.rollbackUniqueAssetCount}`}
              />
              <DetailField
                label="スライド追加 / 削除 / 内容変更"
                value={`${impact.addedSlideCount} / ${impact.removedSlideCount} / ${impact.changedSlideCount}`}
              />
              <DetailField
                label="スライド順変更"
                value={impact.slideOrderChanged ? "あり" : "なし"}
              />
              <DetailField
                label="ロールバック後の端末保存対象 / remoteOnly"
                value={`${impact.rollbackOfflineEligibleAssetCount} / ${impact.rollbackRemoteOnlyAssetCount}`}
              />
              <DetailField
                label="取得不可 / 内容変更"
                value={`${impact.unavailableAssetCount} / ${impact.contentChangedAssetCount}`}
              />
              <DetailField
                label="確認不可 / 素材情報変更"
                value={`${impact.unverifiableAssetCount} / ${impact.metadataChangedAssetCount}`}
              />
            </dl>
          </section>

          <section aria-labelledby="rollback-assets-heading">
            <h4 id="rollback-assets-heading" className="font-semibold">
              復元対象の素材確認
            </h4>
            <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {props.preview.assets.map((asset) => (
                <article
                  key={asset.assetId}
                  className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {formatRollbackAssetImpact(asset.impactStatus)}
                    </Badge>
                    <Badge variant="outline">
                      {formatRollbackOfflineDisposition(
                        asset.offlineDisposition,
                      )}
                    </Badge>
                    <span className="break-all text-xs text-slate-400">
                      {formatMediaType(asset.mimeType)}
                    </span>
                  </div>
                  <p className="mt-2 break-words font-medium">
                    {asset.displayName}
                  </p>
                  {asset.sanitizedReasons.map((reason) => (
                    <p key={reason} className="mt-1 break-words text-slate-300">
                      {sanitizeUserFacingDiagnostic(reason)}
                    </p>
                  ))}
                </article>
              ))}
              {props.preview.assets.length === 0 ? (
                <p className="text-sm text-slate-400">参照素材はありません。</p>
              ) : null}
            </div>
          </section>

          <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
            この結果は確認時点の状態です。実行時には最新状態をもう一度確認し、
            この確認結果をそのまま書き込みには使いません。
          </p>

          {props.state === "ready" ? (
            <section
              aria-labelledby="rollback-confirmations-heading"
              className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4"
            >
              <h4
                id="rollback-confirmations-heading"
                className="font-semibold text-amber-100"
              >
                ロールバック実行前の確認
              </h4>
              <div className="mt-3 space-y-3 text-sm text-amber-50">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-amber-300/20 p-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-5 shrink-0"
                    checked={props.confirmations.createsNewRevision}
                    disabled={props.rollbackBusy}
                    onChange={(event) =>
                      props.onConfirmationsChange({
                        ...props.confirmations,
                        createsNewRevision: event.target.checked,
                      })
                    }
                  />
                  <span>
                    過去の公開版は変更せず、復元内容から新しいロールバック版を作成することを理解しました。
                  </span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-amber-300/20 p-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-5 shrink-0"
                    checked={props.confirmations.driveOnly}
                    disabled={props.rollbackBusy}
                    onChange={(event) =>
                      props.onConfirmationsChange({
                        ...props.confirmations,
                        driveOnly: event.target.checked,
                      })
                    }
                  />
                  <span>
                    Driveの公開版だけが更新され、端末利用には別途「端末へ同期」が必要です。
                  </span>
                </label>
                {props.preview.replacesUnpublishedChanges ? (
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-rose-300/30 bg-rose-400/10 p-3 text-rose-50">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0"
                      checked={
                        props.confirmations.replacesUnpublishedChanges
                      }
                      disabled={props.rollbackBusy}
                      onChange={(event) =>
                        props.onConfirmationsChange({
                          ...props.confirmations,
                          replacesUnpublishedChanges: event.target.checked,
                        })
                      }
                    />
                    <span>
                      保存済みの未公開編集が復元対象の公開版の内容で置き換えられることを理解しました。
                    </span>
                  </label>
                ) : null}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="mt-4 min-h-11 w-full"
                disabled={
                  !confirmationsComplete ||
                  props.rollbackBusy ||
                  props.executionState === "prepared"
                }
                onClick={props.onPrepareExecution}
              >
                {props.executionState === "preparing"
                  ? "最新状態を再確認中"
                  : "実行前の最新状態を再確認"}
              </Button>
            </section>
          ) : null}

          {props.executionState !== "idle" ? (
            <div
              role={props.executionState === "error" ? "alert" : "status"}
              aria-live="polite"
              className={
                props.executionState === "error"
                  ? "rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100"
                  : "rounded-xl border border-sky-400/30 bg-sky-400/10 p-4 text-sky-100"
              }
            >
              {sanitizeUserFacingDiagnostic(props.executionMessage)}
            </div>
          ) : null}

          {props.executionState === "prepared" &&
          props.executionReview ? (
            <section
              aria-labelledby="rollback-final-review-heading"
              className="rounded-2xl border-2 border-rose-400/60 bg-rose-950/40 p-4"
            >
              <h4
                id="rollback-final-review-heading"
                className="text-lg font-semibold text-rose-100"
              >
                ロールバック最終確認
              </h4>
              <p className="mt-2 text-sm text-rose-50">
                最新状態の確認が完了しています。この操作は新しいロールバック版を作成し、
                現在のプロジェクト設定とプロジェクト一覧を更新します。
              </p>
              <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                <DetailField
                  label="復元対象の公開日時"
                  value={formatPublishedAt(
                    props.executionReview.targetPublishedAt,
                  )}
                />
                <DetailField
                  label="復元対象の操作"
                  value={formatPublishOperation(
                    props.executionReview.targetOperation,
                  )}
                />
                <DetailField
                  label="ロールバック後の名前"
                  value={props.executionReview.rollbackProjectTitle}
                />
                <DetailField
                  label="スライド / 素材 / remoteOnly"
                  value={`${props.executionReview.rollbackSlideCount} / ${props.executionReview.rollbackAssetCount} / ${props.executionReview.rollbackRemoteOnlyAssetCount}`}
                />
                <DetailField
                  label="最新確認日時（東京）"
                  value={formatPublishedAt(
                    props.executionReview.checkedAt,
                  )}
                />
                <DetailField
                  label="端末への同期"
                  value="ロールバック後に別途必要"
                />
              </dl>
              {props.executionReview.replacesUnpublishedChanges ? (
                <p className="mt-4 rounded-xl border border-rose-300/40 bg-rose-400/10 p-3 font-semibold text-rose-50">
                  保存済みの未公開編集は置き換えられます。
                </p>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                className="mt-5 min-h-11 w-full"
                disabled={!confirmationsComplete || props.rollbackBusy}
                onClick={props.onCommitRollback}
              >
                この内容へロールバック
              </Button>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatRollbackAssetImpact(
  status: ProjectRollbackPreview["assets"][number]["impactStatus"],
) {
  switch (status) {
    case "unchanged":
      return "変更なし";
    case "metadataChanged":
      return "素材情報変更・要確認";
    case "contentChanged":
      return "内容変更・安全確認で停止";
    case "unverifiable":
      return "確認不可・要確認";
    case "unavailable":
      return "取得不可・安全確認で停止";
  }
}

function formatRollbackOfflineDisposition(
  disposition: ProjectRollbackPreview["assets"][number]["offlineDisposition"],
) {
  if (disposition === "offlineEligible") return "端末保存対象";
  if (disposition === "remoteOnly") return "remoteOnly";
  return "端末保存対象外";
}

function formatMediaType(value: string) {
  if (value === "image" || value.startsWith("image/")) return "画像";
  if (value === "video" || value.startsWith("video/")) return "動画";
  return "その他";
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-400">{label}</dt><dd className="break-words">{value}</dd></div>;
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}
