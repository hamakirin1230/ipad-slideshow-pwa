"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Play, Shuffle } from "lucide-react";
import { useAppState } from "@/app/app-providers";
import { ProductDisclosure } from "@/components/product-disclosure";
import { Button } from "@/components/ui/button";
import {
  readOfflineProjectPlaybackReadiness,
  type OfflineProjectPlaybackReadiness,
} from "@/lib/offline-project-playback-readiness";
import { createPlayerProjectLinkHref } from "@/lib/player-route";
import {
  formatProjectMediaCounts,
  countProjectMedia,
} from "@/lib/project-media-counts";
import { cn } from "@/lib/utils";
import { DriveProjectWorkspacePanel } from "./drive-project-workspace-panel";
import { OfflineConfirmedStorePanel } from "./offline-confirmed-store-panel";
import { OfflineSyncPanel } from "./offline-sync-panel";
import { GooglePhotosExportPanel } from "./google-photos-export-panel";
import { ProjectPublishPanel } from "./project-publish-panel";
import { ProjectStatusPanel } from "./project-status-panel";

const workspaceTabs = [
  { id: "project", label: "アルバム" },
  { id: "edit", label: "スライド" },
  { id: "device", label: "ローカル" },
  { id: "publish", label: "公開" },
] as const;

type WorkspaceTab = (typeof workspaceTabs)[number]["id"];

export function AdminWorkspace() {
  const {
    projectSummary,
    projectDetails,
    selectedProjectId,
    offlineSyncStatus,
  } = useAppState();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("project");
  const [checkedPlaybackReadiness, setCheckedPlaybackReadiness] = useState<{
    projectId: string;
    syncStatus: typeof offlineSyncStatus;
    status: OfflineProjectPlaybackReadiness["status"];
  } | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const readinessRequestIdRef = useRef(0);
  const selectedId = selectedProjectId ?? projectSummary?.projectId ?? null;
  const mediaCounts = countProjectMedia(projectDetails?.slides);
  const playerHref = selectedId
    ? createPlayerProjectLinkHref(selectedId)
    : null;
  const playbackReadiness = !selectedId
    ? "notReady"
    : checkedPlaybackReadiness?.projectId === selectedId &&
        checkedPlaybackReadiness.syncStatus === offlineSyncStatus
      ? checkedPlaybackReadiness.status
      : "checking";

  useEffect(() => {
    function selectHashTab() {
      const hashTab = window.location.hash.slice(1);
      if (isWorkspaceTab(hashTab)) setActiveTab(hashTab);
    }

    selectHashTab();
    window.addEventListener("hashchange", selectHashTab);
    return () => window.removeEventListener("hashchange", selectHashTab);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const requestId = readinessRequestIdRef.current + 1;
    readinessRequestIdRef.current = requestId;

    void readOfflineProjectPlaybackReadiness(selectedId).then((result) => {
      if (requestId !== readinessRequestIdRef.current) {
        return;
      }
      setCheckedPlaybackReadiness({
        projectId: selectedId,
        syncStatus: offlineSyncStatus,
        status: result.status,
      });
    });
  }, [selectedId, offlineSyncStatus]);

  function selectTab(tab: WorkspaceTab, focus = false) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
    if (focus) {
      tabRefs.current[workspaceTabs.findIndex((item) => item.id === tab)]?.focus();
    }
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % workspaceTabs.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + workspaceTabs.length) % workspaceTabs.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = workspaceTabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    selectTab(workspaceTabs[nextIndex].id, true);
  }

  return (
    <main className="min-h-svh bg-slate-950 px-4 py-5 text-slate-50 sm:px-7 sm:py-7 lg:px-10">
      <div className="mx-auto w-full max-w-[90rem]">
        <header className="flex flex-col gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.18em] text-slate-500">
              つくる
            </p>
            {projectSummary ? (
              <>
                <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                  {projectSummary.title}
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  {formatProjectMediaCounts(mediaCounts)}
                </p>
              </>
            ) : (
              <>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  アルバムを選択
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  編集するアルバムを選ぶか、新しく作成してください。
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => selectTab("project")}
            >
              <Shuffle className="size-4" aria-hidden="true" />
              {projectSummary ? "アルバムを切り替える" : "アルバムを選択"}
            </Button>
            {selectedId && playbackReadiness === "checking" ? (
              <Button
                type="button"
                className="min-h-11 bg-sky-300 text-slate-950"
                disabled
              >
                再生準備を確認中
              </Button>
            ) : null}
            {selectedId &&
            playbackReadiness === "ready" &&
            playerHref ? (
              <Button
                asChild
                className="min-h-11 bg-sky-300 text-slate-950 hover:bg-sky-200"
              >
                <Link href={playerHref}>
                  <Play className="size-4 fill-current" aria-hidden="true" />
                  再生
                </Link>
              </Button>
            ) : null}
            {selectedId &&
            (playbackReadiness === "notReady" ||
              playbackReadiness === "unavailable") ? (
              <Button
                type="button"
                className="min-h-11 bg-sky-300 text-slate-950 hover:bg-sky-200"
                onClick={() => selectTab("device")}
              >
                ローカルに保存
              </Button>
            ) : null}
          </div>
        </header>

        <div className="sticky top-0 z-30 -mx-4 border-b border-white/8 bg-slate-950/95 px-4 py-3 backdrop-blur-xl sm:-mx-7 sm:px-7 lg:-mx-10 lg:px-10">
          <div
            role="tablist"
            aria-label="制作ワークスペース"
            className="mx-auto grid max-w-[90rem] grid-cols-4 gap-1 rounded-xl bg-white/[0.035] p-1"
          >
            {workspaceTabs.map((tab, index) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  id={`admin-${tab.id}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={tab.id}
                  tabIndex={selected ? 0 : -1}
                  className={cn(
                    "relative min-h-11 min-w-0 rounded-lg px-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
                    selected
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                  )}
                  onClick={() => selectTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  {tab.label}
                  {selected ? (
                    <span
                      className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-sky-300"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-7 sm:pt-9">
          <WorkspacePane id="project" activeTab={activeTab}>
            <ProjectStatusPanel />
          </WorkspacePane>
          <WorkspacePane id="edit" activeTab={activeTab}>
            <DriveProjectWorkspacePanel />
          </WorkspacePane>
          <WorkspacePane id="device" activeTab={activeTab}>
            <div className="space-y-8">
              <div>
                <h2 className="mt-2 text-2xl font-semibold">
                  ローカルで再生できるようにする
                </h2>
              </div>
              <OfflineSyncPanel />
              <ProductDisclosure label="ローカルの保存データを管理">
                <p className="mb-5">
                  公開とは別に、選択中のアルバムをローカルへ明示的に保存します。
                </p>
                <OfflineConfirmedStorePanel />
              </ProductDisclosure>
            </div>
          </WorkspacePane>
          <WorkspacePane id="publish" activeTab={activeTab}>
            <div className="space-y-8">
              <GooglePhotosExportPanel />
              <ProjectPublishPanel />
            </div>
          </WorkspacePane>
        </div>
      </div>
    </main>
  );
}

function WorkspacePane({
  id,
  activeTab,
  children,
}: {
  id: WorkspaceTab;
  activeTab: WorkspaceTab;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={`admin-${id}-tab`}
      tabIndex={0}
      hidden={activeTab !== id}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
    >
      {children}
    </section>
  );
}

function isWorkspaceTab(value: string): value is WorkspaceTab {
  return workspaceTabs.some((tab) => tab.id === value);
}
