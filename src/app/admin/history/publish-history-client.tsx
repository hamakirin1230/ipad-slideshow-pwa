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
import {
  buildRevisionDetailViewModel,
  formatMetadataStatus,
  formatPublishedAt,
  formatPublishOperation,
  mapPublishHistoryErrorCode,
  type ProjectPublishRevisionDetailViewModel,
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
    listProjectPublishRevisionsForProject,
    loadProjectPublishRevisionForProject,
  } = useAppState();
  const [historyState, setHistoryState] = useState<HistoryViewState>("idle");
  const [items, setItems] = useState<ProjectPublishRevisionListItem[]>([]);
  const [historyMessage, setHistoryMessage] = useState(
    "閲覧するプロジェクトを選択してください。",
  );
  const [invalidMetadataCount, setInvalidMetadataCount] = useState(0);
  const [ignoredFileCount, setIgnoredFileCount] = useState(0);
  const [duplicateRevisionIdCount, setDuplicateRevisionIdCount] = useState(0);
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
    void loadHistoryList(projectId);
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
    detailOwnerRef.current = null;
    const clearTimer = window.setTimeout(() => {
      setItems([]);
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
    setInvalidMetadataCount(0);
    setIgnoredFileCount(0);
    setDuplicateRevisionIdCount(0);
    setHistoryState("idle");
    setHistoryMessage("選択したプロジェクトを確認しています。");
    clearDetail();
  }

  async function loadHistoryList(projectId: string) {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const sequence = listSequenceRef.current + 1;
    listSequenceRef.current = sequence;
    setItems([]);
    setInvalidMetadataCount(0);
    setIgnoredFileCount(0);
    setDuplicateRevisionIdCount(0);
    setHistoryState("loading");
    setHistoryMessage("Google Driveから公開履歴を読み込んでいます。");
    clearDetail();

    const result = await listProjectPublishRevisionsForProject(
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
      setHistoryMessage(mapPublishHistoryErrorCode(result.code));
      return;
    }
    if (result.status === "notConfigured") {
      setHistoryState("notConfigured");
      setHistoryMessage(
        "このプロジェクトには公開履歴がまだありません。公開機能は今後のGoalで追加されます。",
      );
      return;
    }
    setItems(result.items);
    setInvalidMetadataCount(result.invalidMetadataCount);
    setIgnoredFileCount(result.ignoredFileCount);
    setDuplicateRevisionIdCount(result.duplicateRevisionIdCount);
    if (result.items.length === 0) {
      setHistoryState("empty");
      setHistoryMessage("公開履歴はありません。");
      return;
    }
    setHistoryState("ready");
    setHistoryMessage(`${result.items.length}件の公開履歴metadataを読み込みました。`);
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
    void loadHistoryList(selectedProjectId);
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
          onOpenDetail={handleOpenDetail}
        />
        <RevisionDetail
          state={detailState}
          detail={detail}
          message={detailMessage}
          onClose={clearDetail}
          onRetry={handleRetryDetail}
        />
      </div>
    </div>
  );
}

function RevisionList(props: {
  items: ProjectPublishRevisionListItem[];
  selectedRevisionId: string | null;
  invalidMetadataCount: number;
  ignoredFileCount: number;
  duplicateRevisionIdCount: number;
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
          return (
            <article key={`${item.revisionId}:${item.publishedAt ?? "unknown"}:${index}`} className={selected ? "rounded-2xl border border-sky-400/50 bg-sky-400/10 p-4" : "rounded-2xl border border-white/10 bg-black/20 p-4"}>
              <div className="flex flex-wrap items-center gap-2">
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
        {props.state === "ready" && props.detail ? <ReadyRevisionDetail detail={props.detail} /> : null}
      </CardContent>
    </Card>
  );
}

function ReadyRevisionDetail({ detail }: { detail: ProjectPublishRevisionDetailViewModel }) {
  return (
    <div className="space-y-5">
      <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">詳細検証済み</div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <DetailField label="revision ID" value={detail.revisionId} mono />
        <DetailField label="公開日時" value={detail.publishedAt} />
        <DetailField label="操作" value={detail.operation} />
        <DetailField label="schemaVersion" value={String(detail.schemaVersion)} />
        <DetailField label="rollback元" value={detail.restoredFromRevisionId ?? "なし"} mono />
        <DetailField label="直前revision" value={detail.previousRevisionId ?? "なし"} mono />
        <DetailField label="source manifest更新" value={detail.sourceManifestModifiedTime} />
        <DetailField label="source manifest hash" value={detail.sourceManifestCanonicalHash} mono />
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
