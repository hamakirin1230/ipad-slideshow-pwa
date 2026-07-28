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
  const listSequenceRef = useRef(0);
  const detailSequenceRef = useRef(0);
  const listAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const loadedProjectIdRef = useRef<string | null>(null);
  const detailOwnerRef = useRef<{ projectId: string; revisionId: string } | null>(
    null,
  );

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
    historyState !== "loading";
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
      listSequenceRef.current += 1;
      detailSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (isGoogleReady) return;
    listAbortRef.current?.abort();
    detailAbortRef.current?.abort();
    listSequenceRef.current += 1;
    detailSequenceRef.current += 1;
    loadedProjectIdRef.current = null;
    detailOwnerRef.current = null;
    const clearTimer = window.setTimeout(() => {
      setItems([]);
      setOverview(null);
      setDetail(null);
      setDetailState("closed");
      setSelectedRevisionId(null);
      setHistoryState("idle");
      setHistoryMessage("Google Driveに接続してください。");
    }, 0);
    return () => window.clearTimeout(clearTimer);
  }, [isGoogleReady]);

  function clearDetail() {
    detailAbortRef.current?.abort();
    detailSequenceRef.current += 1;
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
        "このprojectには公開履歴がありません。初回公開後に履歴が表示されます。",
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
      `${nextOverview.items.length}件の公開履歴metadataを読み込みました。`,
    );
  }

  async function loadDetail(projectId: string, revisionId: string) {
    detailAbortRef.current?.abort();
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

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 text-slate-50">
        <CardHeader>
          <CardTitle>閲覧対象</CardTitle>
          <CardDescription className="text-slate-300">
            公開履歴はproject単位です。project ID全文は表示しません。
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
              project
              <select
                id="history-project"
                value={selectedProjectId ?? ""}
                onChange={(event) => handleProjectChange(event.target.value)}
                disabled={!isGoogleReady || isDriveOperationInFlight || driveProjects.length === 0}
                className="min-h-11 w-full rounded-xl border border-white/20 bg-slate-900 px-3 text-base text-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <option value="">projectを選択</option>
                {driveProjects.map((project) => (
                  <option key={project.projectId} value={project.projectId}>
                    {project.title} ({project.projectIdPart})
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="secondary" className="min-h-11" onClick={handleReload} disabled={!canReload}>
              {historyState === "loading" ? "読込中" : "再読込"}
            </Button>
          </div>
          {driveProjects.length === 0 && projectStatus !== "checking" ? (
            <p className="text-sm text-slate-400">閲覧できるprojectがありません。</p>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <RevisionList
          items={items}
          selectedRevisionId={selectedRevisionId}
          invalidMetadataCount={invalidMetadataCount}
          ignoredFileCount={ignoredFileCount}
          duplicateRevisionIdCount={duplicateRevisionIdCount}
          publication={overview?.publication ?? null}
          onOpenDetail={handleOpenDetail}
        />
        <RevisionDetail
          state={detailState}
          detail={detail}
          message={detailMessage}
          publication={overview?.publication ?? null}
          onClose={clearDetail}
          onRetry={handleRetryDetail}
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
          現在のmanifest.jsonを再取得し、参照先revisionとの整合性を確認します。
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
              自動修復や自動retryは行いません。状態を確認して手動で再読込してください。
            </p>
          </div>
        ) : null}
        {!isLoading &&
        !publication &&
        state !== "invalid" &&
        state !== "error" ? (
          <p className="text-sm text-slate-400">
            projectを選択して公開情報を読み込んでください。
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
              <p className="mt-3 font-semibold">{publication.message}</p>
              {publication.diagnostics.map((diagnostic) => (
                <p key={diagnostic} className="mt-2 text-sm">
                  {diagnostic}
                </p>
              ))}
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <DetailField
                label="current revision ID"
                value={publication.currentRevisionId ?? "なし"}
                mono
              />
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
                label="revision一覧の表示範囲"
                value={
                  publication.currentRevisionId === null
                    ? "対象なし"
                    : publication.currentRevisionInList
                      ? "current revisionを含む"
                      : "current revisionは範囲外"
                }
              />
            </dl>
            <p className="text-xs leading-relaxed text-slate-400">
              current以外には過去の公開版と未commitのrevisionが含まれる可能性があります。この画面では自動分類しません。
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
  onOpenDetail: (item: ProjectPublishRevisionListItem) => void;
}) {
  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <CardTitle>revision一覧</CardTitle>
        <CardDescription className="text-slate-300">一覧ではmetadataだけを表示し、本文は選択時に取得します。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.invalidMetadataCount > 0 || props.duplicateRevisionIdCount > 0 ? (
          <div role="status" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            要確認metadata: {props.invalidMetadataCount}件 / 重複revision ID: {props.duplicateRevisionIdCount}件
          </div>
        ) : null}
        {props.ignoredFileCount > 0 ? (
          <p className="text-xs text-slate-400">履歴対象外file: {props.ignoredFileCount}件</p>
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
                <div><dt className="text-slate-400">revision ID</dt><dd className="break-all font-mono text-xs">{item.revisionId}</dd></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><dt className="text-slate-400">schema</dt><dd>{item.schemaVersion ?? "不明"}</dd></div>
                  <div><dt className="text-slate-400">metadata更新</dt><dd>{formatPublishedAt(item.modifiedTime)}</dd></div>
                </div>
              </dl>
              <Button
                type="button"
                variant={selected ? "secondary" : "outline"}
                className="mt-4 min-h-11 w-full"
                onClick={() => props.onOpenDetail(item)}
                disabled={item.metadataStatus !== "ready" || selected}
                aria-pressed={selected}
              >
                {item.metadataStatus !== "ready" ? "要確認のため詳細取得不可" : selected ? "詳細を表示中" : "詳細を開く"}
              </Button>
            </article>
          );
        })}
        {props.items.length === 0 ? <p className="text-sm text-slate-400">表示するrevisionはありません。</p> : null}
      </CardContent>
    </Card>
  );
}

function RevisionDetail(props: {
  state: RevisionDetailState;
  detail: ProjectPublishRevisionDetailViewModel | null;
  message: string;
  publication: ProjectPublicationOverview | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>revision詳細</CardTitle>
          {props.state !== "closed" ? <Button type="button" variant="outline" className="min-h-11" onClick={props.onClose}>閉じる</Button> : null}
        </div>
        <CardDescription className="text-slate-300">Drive内部ID、raw JSON、asset checksum本文は表示しません。</CardDescription>
      </CardHeader>
      <CardContent>
        {props.state === "closed" ? <p className="text-sm text-slate-400">一覧から有効なrevisionを選択してください。</p> : null}
        {props.state === "loading" ? <p role="status" aria-live="polite">{props.message}</p> : null}
        {props.state === "error" ? (
          <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100">
            <p>{props.message}</p>
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
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReadyRevisionDetail({
  detail,
  publicationMarker,
}: {
  detail: ProjectPublishRevisionDetailViewModel;
  publicationMarker: ProjectPublishRevisionPublicationMarker;
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
            ? "この検証済みrevisionが現在公開中です。"
            : publicationMarker === "needsInspection"
              ? "manifestの参照先ですが、現在公開中とは断定できません。"
              : "現在公開中のrevisionではありません。履歴上の位置づけは自動分類しません。"}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <DetailField label="revision ID" value={detail.revisionId} mono />
        <DetailField label="公開日時" value={detail.publishedAt} />
        <DetailField label="操作" value={detail.operation} />
        <DetailField label="schemaVersion" value={String(detail.schemaVersion)} />
        <DetailField label="rollback元" value={detail.restoredFromRevisionId ?? "なし"} mono />
        <DetailField label="直前revision" value={detail.previousRevisionId ?? "なし"} mono />
        <DetailField label="source manifest更新" value={detail.sourceManifestModifiedTime} />
        <DetailField label="revisionとの整合性" value="確認済み" />
      </dl>
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryBox label="slides" value={detail.summary.slideCount} />
        <SummaryBox label="assets" value={detail.summary.assetCount} />
        <SummaryBox label="remoteOnly" value={detail.summary.remoteOnlyAssetCount} />
      </div>
      <section aria-labelledby="history-slides-heading">
        <h3 id="history-slides-heading" className="text-lg font-semibold">slide一覧</h3>
        <div className="mt-3 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
          {detail.slides.map((slide) => (
            <article key={slide.slideId} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{slide.order}</Badge><span>{slide.type}</span>{slide.remoteOnly ? <Badge variant="secondary">remoteOnly</Badge> : null}</div>
              <p className="mt-2 break-words font-medium">{slide.assetName}</p>
              <p className="mt-1 break-all text-xs text-slate-400">asset: {slide.assetId}</p>
              <p className="mt-2 break-words text-slate-300">caption: {slide.caption || "なし"}</p>
              <p className="mt-1 text-slate-300">duration override: {slide.durationSeconds}秒</p>
            </article>
          ))}
          {detail.slides.length === 0 ? <p className="text-sm text-slate-400">slideはありません。</p> : null}
        </div>
      </section>
      <section aria-labelledby="history-assets-heading">
        <h3 id="history-assets-heading" className="text-lg font-semibold">asset一覧</h3>
        <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {detail.assets.map((asset) => (
            <article key={asset.assetId} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{asset.mimeType}</Badge>{asset.remoteOnly ? <Badge variant="secondary">remoteOnly</Badge> : null}</div>
              <p className="mt-2 break-all font-medium">{asset.assetId}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-slate-300"><div><dt className="text-slate-400">size</dt><dd>{asset.size}</dd></div><div><dt className="text-slate-400">checksum</dt><dd>{asset.checksumAvailable ? "あり" : "なし"}</dd></div><div className="col-span-2"><dt className="text-slate-400">更新日時</dt><dd>{asset.modifiedTime}</dd></div></dl>
            </article>
          ))}
          {detail.assets.length === 0 ? <p className="text-sm text-slate-400">assetはありません。</p> : null}
        </div>
      </section>
    </div>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-slate-400">{label}</dt><dd className={mono ? "break-all font-mono text-xs" : "break-words"}>{value}</dd></div>;
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}
