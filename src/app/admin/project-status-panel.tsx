"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useAppState } from "@/app/app-providers";
import { DRIVE_PROJECT_TITLE_MAX_LENGTH } from "@/lib/google-drive";

export function ProjectStatusPanel() {
  const {
    driveStatus,
    projectStatus,
    driveProjects,
    selectedProjectId,
    projectSummary,
    isDriveOperationInFlight,
    checkProject,
    selectProject,
    createProject,
    updateSelectedProjectTitle,
  } = useAppState();

  const suggestedProjectTitle = getSuggestedProjectTitle(driveProjects.length);

  const canCreateProject =
    driveStatus === "ready" &&
    (projectStatus === "notCreated" || projectStatus === "ready") &&
    !isDriveOperationInFlight;
  const canUpdateSelectedProjectTitle =
    driveStatus === "ready" &&
    projectStatus === "ready" &&
    projectSummary !== null &&
    !isDriveOperationInFlight;

  useEffect(() => {
    if (
      driveStatus === "ready" &&
      projectStatus === "idle" &&
      !isDriveOperationInFlight
    ) {
      checkProject();
    }
  }, [checkProject, driveStatus, isDriveOperationInFlight, projectStatus]);

  return (
    <div className="space-y-10 text-sm text-slate-300">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-slate-500">プロジェクト管理</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-50">どの作品を編集しますか？</h2>
      </div>

      {driveStatus !== "ready" ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/8 p-4 text-amber-100">
          <p className="font-semibold">Google Driveの準備が必要です</p>
          <p className="mt-1 leading-6">設定でGoogle接続と保存領域を準備すると、作品を選択できます。</p>
          <Link href="/settings" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-amber-100 underline decoration-amber-300/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
            設定を開く
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="project-list-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 id="project-list-heading" className="text-lg font-semibold text-slate-100">作品</h3>
            <p className="mt-1 text-sm text-slate-500">{driveProjects.length}件</p>
          </div>
        </div>

        {driveProjects.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {driveProjects.map((project) => {
              const isSelected = project.projectId === selectedProjectId;
              return (
                <div key={project.projectId} className={isSelected ? "rounded-xl bg-white/10 p-4 ring-1 ring-sky-300/45" : "rounded-xl bg-white/[0.035] p-4 ring-1 ring-white/8"}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-100">{project.title}</p>
                      <p className="mt-2 text-xs text-slate-500">スライド {project.slideCount}件 · 素材 {project.assetCount}件</p>
                    </div>
                    {isSelected ? <Check className="size-5 shrink-0 text-sky-300" aria-label="選択中" /> : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 min-h-11 w-full border-white/15 bg-transparent text-slate-100 hover:bg-white/8"
                    onClick={() => selectProject(project.projectId)}
                    disabled={isSelected || isDriveOperationInFlight}
                  >
                    {isSelected ? "選択中" : "この作品を選択"}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-white/[0.035] p-5 text-slate-400">作品はまだありません。下から新しい作品を作成できます。</p>
        )}
      </section>

      <section aria-labelledby="project-editing-heading">
        <h3 id="project-editing-heading" className="text-lg font-semibold text-slate-100">作品を作成・名前を変更</h3>
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
      </section>
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
      <p className="font-semibold text-slate-50">新しいプロジェクトを作成</p>
      <label className="mt-3 block text-xs font-medium text-slate-400">
        プロジェクト名
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
            "作成した内容をDriveへ保存し、プロジェクト一覧へ反映します。"}
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
      <p className="font-semibold text-slate-50">選択中プロジェクトの名前を変更</p>
      <label className="mt-3 block text-xs font-medium text-slate-400">
        プロジェクト名
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
              "変更後にプロジェクト設定と一覧を再確認します。"
            : "先にプロジェクトを選択してください。"}
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

function getCreateProjectButtonLabel(projectStatus: string) {
  if (projectStatus === "creating") {
    return "プロジェクト作成中";
  }

  if (projectStatus === "ready") {
    return "新しいプロジェクトを作成";
  }

  return "新しいプロジェクトを作成";
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
    return "プロジェクト名を入力してください。";
  }

  if ([...title].length > DRIVE_PROJECT_TITLE_MAX_LENGTH) {
    return `プロジェクト名は ${DRIVE_PROJECT_TITLE_MAX_LENGTH} 文字以内で入力してください。`;
  }

  return null;
}
