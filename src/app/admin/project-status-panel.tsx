"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppState } from "@/app/app-providers";
import { DRIVE_PROJECT_TITLE_MAX_LENGTH } from "@/lib/google-drive";

export function ProjectStatusPanel() {
  const {
    googleStatus,
    driveStatus,
    projectStatus,
    projectStatusLabel,
    projectMessage,
    driveProjects,
    selectedProjectId,
    projectSummary,
    projectDiagnostics,
    isDriveOperationInFlight,
    checkDriveWorkspace,
    checkProject,
    selectProject,
    createProject,
    updateSelectedProjectTitle,
  } = useAppState();

  const suggestedProjectTitle = getSuggestedProjectTitle(driveProjects.length);

  const canCheckDriveWorkspace =
    googleStatus === "connected" && !isDriveOperationInFlight;

  const canCheckProject =
    driveStatus === "ready" &&
    projectStatus !== "checking" &&
    !isDriveOperationInFlight;

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
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Driveプロジェクト状態</CardTitle>
          <Badge
            variant={projectStatus === "ready" ? "secondary" : "outline"}
            className={
              projectStatus === "ready"
                ? undefined
                : "border-slate-500 text-slate-200"
            }
          >
            {projectStatusLabel}
          </Badge>
        </div>
        <CardDescription className="text-slate-300">
          Drive上の index.json.projects 一覧と、選択中 project の manifest.json /
          assets/ の整合を確認します。project ready 後に素材追加と offline sync へ進めます。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm text-slate-300">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-semibold text-slate-50">状態メッセージ</p>
          <p className="mt-2">{projectMessage}</p>
        </div>

        {driveStatus !== "ready" ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <p className="font-semibold">Driveワークスペース確認が必要です</p>
            <p className="mt-2">
              プロジェクト状態は、Driveワークスペースが ready の場合だけ確認します。
              先に /settings でGoogle接続とDrive状態確認を行ってください。
            </p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-50">Drive project 一覧</p>
              <p className="mt-1 text-slate-400">
                index.json.projects: {driveProjects.length}件
              </p>
            </div>
            {selectedProjectId ? (
              <Badge variant="secondary">選択中あり</Badge>
            ) : (
              <Badge variant="outline" className="border-slate-500 text-slate-200">
                未選択
              </Badge>
            )}
          </div>

          {driveProjects.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {driveProjects.map((project) => {
                const isSelected = project.projectId === selectedProjectId;

                return (
                  <div
                    key={project.projectId}
                    className={
                      isSelected
                        ? "rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4 text-emerald-100"
                        : "rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-200"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{project.title}</p>
                        <p className="mt-1 text-xs opacity-80">
                          {project.projectIdPart}
                        </p>
                      </div>
                      {isSelected ? (
                        <Badge variant="secondary">選択中</Badge>
                      ) : null}
                    </div>

                    <dl className="mt-3 grid gap-2 text-xs">
                      <div>
                        <dt className="opacity-70">manifestPath</dt>
                        <dd className="break-all font-medium">
                          {project.manifestPath}
                        </dd>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <dt className="opacity-70">slides</dt>
                          <dd className="font-medium">{project.slideCount}</dd>
                        </div>
                        <div>
                          <dt className="opacity-70">assets</dt>
                          <dd className="font-medium">{project.assetCount}</dd>
                        </div>
                      </div>
                      <div>
                        <dt className="opacity-70">更新日時</dt>
                        <dd className="font-medium">{project.updatedAt}</dd>
                      </div>
                    </dl>

                    <Button
                      type="button"
                      variant={isSelected ? "secondary" : "outline"}
                      className="mt-4 w-full"
                      onClick={() => selectProject(project.projectId)}
                      disabled={isSelected || isDriveOperationInFlight}
                    >
                      {isSelected ? "このprojectを選択中" : "このprojectを選択"}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-slate-400">
              project はまだ登録されていません。新しいprojectを作成できます。
            </p>
          )}
        </div>

        {projectSummary ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
            <p className="font-semibold">選択中projectの登録</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-emerald-200/80">タイトル</dt>
                <dd className="font-medium">{projectSummary.title}</dd>
              </div>
              <div>
                <dt className="text-emerald-200/80">projectId</dt>
                <dd className="font-medium">{projectSummary.projectIdPart}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-emerald-200/80">manifestPath</dt>
                <dd className="break-all font-medium">
                  {projectSummary.manifestPath}
                </dd>
              </div>
              <div>
                <dt className="text-emerald-200/80">作成日時</dt>
                <dd className="font-medium">{projectSummary.createdAt}</dd>
              </div>
              <div>
                <dt className="text-emerald-200/80">更新日時</dt>
                <dd className="font-medium">{projectSummary.updatedAt}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
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

        {projectDiagnostics.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-slate-50">プロジェクト診断</p>
            <div className="mt-3 space-y-2">
              {projectDiagnostics.map((diagnostic) => (
                <p key={diagnostic}>・{diagnostic}</p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={checkDriveWorkspace}
            disabled={!canCheckDriveWorkspace}
          >
            {driveStatus === "checking"
              ? "Drive状態を確認中"
              : "Drive状態を再確認"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={checkProject}
            disabled={!canCheckProject}
          >
            {projectStatus === "checking"
              ? "プロジェクト状態を確認中"
              : "プロジェクト状態を再確認"}
          </Button>

        </div>

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <p className="font-semibold">project確認後の流れ</p>
          <p className="mt-2">
            project を選択して ready になったら、素材管理で Google Photos Picker から写真を追加し、
            offline sync でこの端末の IndexedDB confirmed store に選択中projectの再生用コピーを作成します。
          </p>
        </div>
      </CardContent>
    </Card>
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
      <p className="font-semibold text-slate-50">新しいprojectを作成</p>
      <label className="mt-3 block text-xs font-medium text-slate-400">
        project title
        <input
          type="text"
          value={projectTitle}
          onChange={(event) => setProjectTitle(event.target.value)}
          maxLength={DRIVE_PROJECT_TITLE_MAX_LENGTH}
          className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 transition focus:border-emerald-300"
          placeholder={input.suggestedProjectTitle}
          disabled={input.isDriveOperationInFlight}
        />
      </label>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
        <p>
          {projectTitleError ??
            "作成時に manifest.json と index.json の両方へ保存します。"}
        </p>
        <p>
          {[...normalizedProjectTitle].length}/{DRIVE_PROJECT_TITLE_MAX_LENGTH}
        </p>
      </div>
      <Button
        type="submit"
        className="mt-4 w-full"
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
      <p className="font-semibold text-slate-50">選択中projectのtitle変更</p>
      <label className="mt-3 block text-xs font-medium text-slate-400">
        project title
        <input
          type="text"
          value={projectTitle}
          onChange={(event) => setProjectTitle(event.target.value)}
          maxLength={DRIVE_PROJECT_TITLE_MAX_LENGTH}
          className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 transition focus:border-emerald-300 disabled:opacity-60"
          placeholder="Project A"
          disabled={!input.hasProject || input.isDriveOperationInFlight}
        />
      </label>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
        <p>
          {input.hasProject
            ? projectTitleError ??
              "変更後に manifest.json / index.json を再検証します。"
            : "先にprojectを選択してください。"}
        </p>
        <p>
          {[...normalizedProjectTitle].length}/{DRIVE_PROJECT_TITLE_MAX_LENGTH}
        </p>
      </div>
      <Button
        type="submit"
        className="mt-4 w-full"
        variant="secondary"
        disabled={!canSubmit}
      >
        titleを変更
      </Button>
    </form>
  );
}

function getCreateProjectButtonLabel(projectStatus: string) {
  if (projectStatus === "creating") {
    return "プロジェクト作成中";
  }

  if (projectStatus === "ready") {
    return "新しいprojectを作成";
  }

  return "新しいprojectを作成";
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
    return "project title を入力してください。";
  }

  if ([...title].length > DRIVE_PROJECT_TITLE_MAX_LENGTH) {
    return `project title は ${DRIVE_PROJECT_TITLE_MAX_LENGTH} 文字以内で入力してください。`;
  }

  return null;
}
