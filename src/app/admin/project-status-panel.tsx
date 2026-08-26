"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ProductAlertDialog } from "@/components/product-alert-dialog";
import { ProductDisclosure } from "@/components/product-disclosure";
import { useAppState, type DriveWorkspaceStatus, type ProjectDeleteStatus, type ProjectSummary } from "@/app/app-providers";
import type { DriveProjectDeleteReview } from "@/lib/drive-project-delete";
import type { GoogleConnectionStatus } from "@/lib/google-auth";
import { DRIVE_PROJECT_TITLE_MAX_LENGTH } from "@/lib/google-drive";
import { formatUiDateTime } from "@/lib/ui-format";
import {
  formatProjectMediaCounts,
  projectMediaCountsFromSummary,
} from "@/lib/project-media-counts";
import { sanitizeUserFacingDiagnostic } from "@/lib/user-facing-diagnostics";
import {
  buildProjectDeleteConfirmationDescription,
  canStartProjectDeletion,
  getProjectDeleteButtonLabel,
  getProjectDeleteViewClassName,
  getProjectDeleteViewState,
  PROJECT_DELETE_DIALOG_CONFIRM_LABEL,
  PROJECT_DELETE_DIALOG_TITLE,
  shouldAutoCheckProject,
} from "./project-delete-view";

export function ProjectStatusPanel() {
  const {
    googleStatus,
    driveStatus,
    projectStatus,
    driveProjects,
    selectedProjectId,
    projectSummary,
    projectMessage,
    projectDiagnostics,
    isDriveOperationInFlight,
    checkProject,
    selectProject,
    createProject,
    updateSelectedProjectTitle,
    projectDeleteStatus,
    projectDeleteMessage,
    projectDeleteDiagnostics,
    projectDeleteReview,
    projectDeleteLocalCopyStatus,
    isProjectDeleteInFlight,
    projectDeleteBlockedReason,
    prepareProjectDeletion,
    cancelProjectDeletion,
    confirmProjectDeletion,
  } = useAppState();
  const projectDeleteTriggerRef = useRef<HTMLButtonElement>(null);

  const suggestedProjectTitle = getSuggestedProjectTitle(driveProjects.length);
  const driveNotReadyNotice = getProjectDriveNotReadyNotice({
    googleStatus,
    driveStatus,
  });

  const canCreateProject =
    driveStatus === "ready" &&
    (projectStatus === "notCreated" || projectStatus === "ready") &&
    !isDriveOperationInFlight;
  const canUpdateSelectedProjectTitle =
    driveStatus === "ready" &&
    projectStatus === "ready" &&
    projectSummary !== null &&
    !isDriveOperationInFlight;

  const canStartSelectedProjectDeletion = canStartProjectDeletion({
    hasSelectedProject: projectSummary !== null && selectedProjectId !== null,
    blockedReason: projectDeleteBlockedReason,
    status: projectDeleteStatus,
    isProjectDeleteInFlight,
  });
  const projectDeleteView = getProjectDeleteViewState({
    status: projectDeleteStatus,
    localCopyStatus: projectDeleteLocalCopyStatus,
    message: projectDeleteMessage,
    diagnostics: projectDeleteDiagnostics,
  });

  useEffect(() => {
    if (
      shouldAutoCheckProject({
        driveStatus,
        projectStatus,
        isDriveOperationInFlight,
      })
    ) {
      checkProject();
    }
  }, [checkProject, driveStatus, isDriveOperationInFlight, projectStatus]);

  return (
    <div className="space-y-8 text-sm text-slate-300">
      <div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-50">
          どの作品を編集しますか？
        </h2>
      </div>

      {driveNotReadyNotice ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/8 p-4 text-amber-100">
          <p className="font-semibold">{driveNotReadyNotice.title}</p>
          <p className="mt-1 leading-6">{driveNotReadyNotice.body}</p>
          <Link
            href="/settings"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-amber-100 underline decoration-amber-300/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            設定を開く
          </Link>
          <Link
            href="/system"
            className="ml-5 inline-flex min-h-11 items-center text-sm font-medium text-amber-100 underline decoration-amber-300/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            サポートを見る
          </Link>
        </div>
      ) : null}

      {driveStatus === "ready" &&
      (projectStatus === "invalid" || projectStatus === "error") ? (
        <div
          role="alert"
          className="rounded-xl border border-red-400/25 bg-red-400/8 p-4 text-red-100"
        >
          <p className="font-semibold">作品の情報を確認できません</p>
          <Link
            href="/system"
            className="mt-3 inline-flex min-h-11 items-center font-medium underline decoration-red-300/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
          >
            サポートを見る
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="project-list-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3
              id="project-list-heading"
              className="text-lg font-semibold text-slate-100"
            >
              作品
            </h3>
            <p className="mt-1 text-sm text-slate-500">{driveProjects.length}作品</p>
          </div>
        </div>

        <ProjectList
          projects={driveProjects}
          selectedProjectId={selectedProjectId}
          disabled={isDriveOperationInFlight}
          onSelect={selectProject}
        />
      </section>

      <ProductDisclosure label="詳しい状態を見る">
        <p>{sanitizeUserFacingDiagnostic(projectMessage)}</p>
        {projectDiagnostics.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {projectDiagnostics.map((item) => (
              <li key={item}>{sanitizeUserFacingDiagnostic(item)}</li>
            ))}
          </ul>
        ) : null}
      </ProductDisclosure>

      <section aria-labelledby="project-editing-heading">
        <h3
          id="project-editing-heading"
          className="text-lg font-semibold text-slate-100"
        >
          作品の管理
        </h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <CreateProjectTitleForm
            key={suggestedProjectTitle}
            suggestedProjectTitle={suggestedProjectTitle}
            projectStatus={projectStatus}
            canCreateProject={canCreateProject}
            isDriveOperationInFlight={isDriveOperationInFlight}
            createProject={createProject}
          />

          <SelectedProjectTitleForm
            key={`${projectSummary?.projectId ?? "none"}:${projectSummary?.title ?? ""}`}
            projectTitle={projectSummary?.title ?? ""}
            hasProject={projectSummary !== null}
            canUpdateSelectedProjectTitle={canUpdateSelectedProjectTitle}
            isDriveOperationInFlight={isDriveOperationInFlight}
            updateSelectedProjectTitle={updateSelectedProjectTitle}
          />
        </div>

        <SelectedProjectDeleteCard
          hasSelectedProject={
            projectSummary !== null && selectedProjectId !== null
          }
          selectedProjectTitle={projectSummary?.title ?? null}
          canStartDeletion={canStartSelectedProjectDeletion}
          blockedReason={projectDeleteBlockedReason}
          status={projectDeleteStatus}
          review={projectDeleteReview}
          view={projectDeleteView}
          isProjectDeleteInFlight={isProjectDeleteInFlight}
          triggerRef={projectDeleteTriggerRef}
          onPrepare={() => {
            void prepareProjectDeletion();
          }}
          onCancel={cancelProjectDeletion}
          onConfirm={() => {
            if (isProjectDeleteInFlight) {
              return;
            }
            void confirmProjectDeletion();
          }}
        />
      </section>
    </div>
  );
}

export function ProjectList({
  projects,
  selectedProjectId,
  disabled,
  onSelect,
}: {
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  disabled: boolean;
  onSelect: (projectId: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <p className="mt-4 rounded-xl bg-white/[0.035] p-5 text-slate-400">
        作品はまだありません。下から新しい作品を作成できます。
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => {
        const isSelected = project.projectId === selectedProjectId;
        return (
          <button
            key={project.projectId}
            type="button"
            aria-pressed={isSelected}
            aria-label={`${project.title}を選択`}
            className={
              isSelected
                ? "min-h-11 w-full rounded-xl bg-white/10 p-4 text-left ring-1 ring-sky-300/45 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                : "min-h-11 w-full rounded-xl bg-white/[0.035] p-4 text-left ring-1 ring-white/8 transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            }
            onClick={() => {
              if (!isSelected) onSelect(project.projectId);
            }}
            disabled={disabled}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-100">
                  {project.title}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {formatProjectMediaCounts(
                    projectMediaCountsFromSummary(project),
                  )}{" "}
                  <span aria-hidden="true">·</span> 更新{" "}
                  {formatUiDateTime(project.updatedAt)}
                </p>
              </div>
              {isSelected ? (
                <Check
                  className="size-5 shrink-0 text-sky-300"
                  aria-label="選択中"
                />
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CreateProjectTitleForm(input: {
  suggestedProjectTitle: string;
  projectStatus: string;
  canCreateProject: boolean;
  isDriveOperationInFlight: boolean;
  createProject: (title: string) => void;
}) {
  const [projectTitle, setProjectTitle] = useState(input.suggestedProjectTitle);
  const normalizedProjectTitle = normalizeProjectTitleInput(projectTitle);
  const projectTitleError = getProjectTitleError(normalizedProjectTitle);
  const canSubmit = input.canCreateProject && projectTitleError === null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    input.createProject(normalizedProjectTitle);
  }

  return (
    <form
      className="rounded-2xl border border-white/10 bg-black/30 p-4"
      onSubmit={handleSubmit}
    >
      <p className="font-semibold text-slate-50">新しい作品を作成</p>
      <label className="mt-3 block text-xs font-medium text-slate-400">
        作品名
        <input
          type="text"
          value={projectTitle}
          onChange={(event) => setProjectTitle(event.target.value)}
          maxLength={DRIVE_PROJECT_TITLE_MAX_LENGTH}
          className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 transition focus:border-sky-300"
          placeholder={input.suggestedProjectTitle}
          disabled={input.isDriveOperationInFlight}
        />
      </label>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
        <p>
          {projectTitleError ??
            "作品を作成して一覧へ追加します。"}
        </p>
        <p>
          {[...normalizedProjectTitle].length}/{DRIVE_PROJECT_TITLE_MAX_LENGTH}
        </p>
      </div>
      <Button
        type="submit"
        className="mt-4 min-h-11 w-full"
        variant={input.projectStatus === "notCreated" ? "default" : "secondary"}
        disabled={!canSubmit}
      >
        {getCreateProjectButtonLabel(input.projectStatus)}
      </Button>
    </form>
  );
}

function SelectedProjectTitleForm(input: {
  projectTitle: string;
  hasProject: boolean;
  canUpdateSelectedProjectTitle: boolean;
  isDriveOperationInFlight: boolean;
  updateSelectedProjectTitle: (title: string) => void;
}) {
  const [projectTitle, setProjectTitle] = useState(input.projectTitle);
  const normalizedProjectTitle = normalizeProjectTitleInput(projectTitle);
  const projectTitleError = getProjectTitleError(normalizedProjectTitle);
  const canSubmit =
    input.canUpdateSelectedProjectTitle &&
    projectTitleError === null &&
    normalizedProjectTitle !== input.projectTitle;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    input.updateSelectedProjectTitle(normalizedProjectTitle);
  }

  return (
    <form
      className="rounded-2xl border border-white/10 bg-black/30 p-4"
      onSubmit={handleSubmit}
    >
      <p className="font-semibold text-slate-50">選択中の作品名を変更</p>
      <label className="mt-3 block text-xs font-medium text-slate-400">
        作品名
        <input
          type="text"
          value={projectTitle}
          onChange={(event) => setProjectTitle(event.target.value)}
          maxLength={DRIVE_PROJECT_TITLE_MAX_LENGTH}
          className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 transition focus:border-sky-300 disabled:opacity-60"
          placeholder="Project A"
          disabled={!input.hasProject || input.isDriveOperationInFlight}
        />
      </label>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
        <p>
          {input.hasProject
            ? projectTitleError ??
              "変更後に作品の情報を再確認します。"
            : "先に作品を選択してください。"}
        </p>
        <p>
          {[...normalizedProjectTitle].length}/{DRIVE_PROJECT_TITLE_MAX_LENGTH}
        </p>
      </div>
      <Button
        type="submit"
        className="mt-4 min-h-11 w-full"
        variant="secondary"
        disabled={!canSubmit}
      >
        名前を変更
      </Button>
    </form>
  );
}

export function SelectedProjectDeleteCard({
  hasSelectedProject,
  selectedProjectTitle,
  canStartDeletion,
  blockedReason,
  status,
  review,
  view,
  isProjectDeleteInFlight,
  triggerRef,
  onPrepare,
  onCancel,
  onConfirm,
}: {
  hasSelectedProject: boolean;
  selectedProjectTitle: string | null;
  canStartDeletion: boolean;
  blockedReason: string | null;
  status: ProjectDeleteStatus;
  review: DriveProjectDeleteReview | null;
  view: ReturnType<typeof getProjectDeleteViewState>;
  isProjectDeleteInFlight: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onPrepare: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const showConfirmation = status === "confirming" && review !== null;
  const disabledReason = hasSelectedProject
    ? blockedReason
    : "先に作品を選択してください。";

  return (
    <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/5 p-4">
      <p className="font-semibold text-slate-50">選択中の作品を削除</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        {hasSelectedProject && selectedProjectTitle
          ? `『${selectedProjectTitle}』のGoogle Drive上の作品データと、この端末の保存コピーを削除します。Googleフォトへ書き出した写真は削除しません。`
          : "選択中の作品のGoogle Drive上のデータと、この端末の保存コピーを削除します。Googleフォトへ書き出した写真は削除しません。"}
      </p>

      {view ? (
        <div
          className={`mt-4 ${getProjectDeleteViewClassName(view.tone)}`}
          role={view.liveRole}
          aria-live={view.liveRole === "status" ? "polite" : undefined}
        >
          <p className="font-semibold">{view.title}</p>
          {view.body.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {view.body.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Button
        ref={triggerRef}
        type="button"
        variant="destructive"
        className="mt-4 min-h-11 w-full"
        disabled={!canStartDeletion}
        onClick={onPrepare}
      >
        {getProjectDeleteButtonLabel(status)}
      </Button>
      {disabledReason ? (
        <p className="mt-2 text-xs leading-5 text-slate-400">{disabledReason}</p>
      ) : null}

      {showConfirmation && review ? (
        <ProductAlertDialog
          title={PROJECT_DELETE_DIALOG_TITLE}
          description={buildProjectDeleteConfirmationDescription(
            review.projectTitle,
          )}
          confirmLabel={PROJECT_DELETE_DIALOG_CONFIRM_LABEL}
          triggerRef={triggerRef}
          onCancel={onCancel}
          onConfirm={() => {
            if (isProjectDeleteInFlight) {
              return;
            }
            onConfirm();
          }}
        />
      ) : null}
    </div>
  );
}

export function getProjectDriveNotReadyNotice(input: {
  googleStatus: GoogleConnectionStatus;
  driveStatus: DriveWorkspaceStatus;
}): { title: string; body: string } | null {
  if (input.driveStatus === "ready") {
    return null;
  }

  if (input.googleStatus !== "connected") {
    return {
      title: "Google Driveへの接続が必要です",
      body: "設定を完了すると、作品を選べます。",
    };
  }

  if (input.driveStatus === "unchecked" || input.driveStatus === "checking") {
    return {
      title: "Google Driveの保存場所を確認しています",
      body: "確認が終わると、作品を選べます。",
    };
  }

  if (input.driveStatus === "creating" || input.driveStatus === "notCreated") {
    return {
      title: "Google Driveの保存場所の準備が必要です",
      body: "設定で保存場所を準備すると、作品を選べます。",
    };
  }

  return {
    title: "Google Driveの保存場所を確認できません",
    body: "設定で保存場所を確認すると、作品を選べます。",
  };
}

function getCreateProjectButtonLabel(projectStatus: string) {
  if (projectStatus === "creating") {
    return "作品を作成中";
  }

  if (projectStatus === "ready") {
    return "新しい作品を作成";
  }

  return "新しい作品を作成";
}

function getSuggestedProjectTitle(projectCount: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  if (projectCount >= 0 && projectCount < alphabet.length) {
    return `Project ${alphabet[projectCount]}`;
  }

  return `Project ${projectCount + 1}`;
}

function normalizeProjectTitleInput(value: string) {
  return value.trim();
}

function getProjectTitleError(title: string) {
  if (title.length === 0) {
    return "作品名を入力してください。";
  }

  if ([...title].length > DRIVE_PROJECT_TITLE_MAX_LENGTH) {
    return `作品名は ${DRIVE_PROJECT_TITLE_MAX_LENGTH} 文字以内で入力してください。`;
  }

  return null;
}
