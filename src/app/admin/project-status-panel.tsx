"use client";

import { useEffect } from "react";
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

export function ProjectStatusPanel() {
  const {
    googleStatus,
    driveStatus,
    projectStatus,
    projectStatusLabel,
    projectMessage,
    projectSummary,
    projectDiagnostics,
    isDriveOperationInFlight,
    checkDriveWorkspace,
    checkProject,
    createProject,
  } = useAppState();

  const canCheckDriveWorkspace =
    googleStatus === "connected" && !isDriveOperationInFlight;

  const canCheckProject =
    driveStatus === "ready" &&
    projectStatus !== "checking" &&
    !isDriveOperationInFlight;

  const canCreateProject =
    driveStatus === "ready" &&
    projectStatus === "notCreated" &&
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
          第4-2 第4コミットでは、Drive上の index.json.projects を読み取り、
          未作成の場合は最初のプロジェクト1件を作成します。
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

        {projectSummary ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
            <p className="font-semibold">index.json上の登録</p>
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

          <Button
            type="button"
            onClick={createProject}
            disabled={!canCreateProject}
          >
            {projectStatus === "creating"
              ? "プロジェクト作成中"
              : "プロジェクトを作成"}
          </Button>
        </div>

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <p className="font-semibold">第4-2 第4コミットでまだ扱わないこと</p>
          <p className="mt-2">
            manifest.json 本文の完全検証、project folder / assets/ の
            appProperties 検証、素材保存、オフライン再生はまだ行いません。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}