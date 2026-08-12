"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronRight, RefreshCw } from "lucide-react";
import { useAppState } from "@/app/app-providers";
import { Button } from "@/components/ui/button";
import { ProductDisclosure } from "@/components/product-disclosure";
import {
  readOfflineConfirmedStoreSnapshot,
  type OfflineConfirmedStoreSnapshot,
} from "@/lib/offline-confirmed-store-snapshot";
import type { OfflinePublicationProvenanceViewStatus } from "@/lib/offline-publication-provenance";
import {
  readOfflineStorageManagementSnapshot,
  type OfflineStorageManagementSnapshot,
} from "@/lib/offline-storage-management";
import { sanitizeUserFacingDiagnostic } from "@/lib/user-facing-diagnostics";
import { formatUiCount } from "@/lib/ui-format";

type DeviceStatusState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "ready";
      localData: OfflineConfirmedStoreSnapshot;
      storage: OfflineStorageManagementSnapshot;
    }
  | { status: "error" };

type StatusTone = "neutral" | "attention" | "danger";

export function SystemStatusOverview() {
  const {
    googleStatus,
    googleStatusLabel,
    googleMessage,
    driveStatus,
    driveStatusLabel,
    driveMessage,
    driveDiagnostics,
    projectStatus,
    projectStatusLabel,
    projectMessage,
    projectSummary,
    projectDiagnostics,
    offlineSyncStatus,
    offlineSyncStatusLabel,
    offlineSyncMessage,
    isDriveOperationInFlight,
    checkDriveWorkspace,
    checkProject,
  } = useAppState();
  const [deviceState, setDeviceState] = useState<DeviceStatusState>({
    status: "idle",
  });

  const health = getSystemHealth({
    googleStatus,
    driveStatus,
    projectStatus,
    offlineSyncStatus,
    deviceStatus: deviceState.status,
  });
  const canCheckDriveWorkspace =
    googleStatus === "connected" && !isDriveOperationInFlight;
  const canCheckProject =
    driveStatus === "ready" &&
    projectStatus !== "checking" &&
    !isDriveOperationInFlight;

  async function handleCheckDeviceStatus() {
    setDeviceState({ status: "checking" });

    try {
      const [localData, storage] = await Promise.all([
        readOfflineConfirmedStoreSnapshot(),
        readOfflineStorageManagementSnapshot(),
      ]);
      setDeviceState({ status: "ready", localData, storage });
    } catch {
      setDeviceState({ status: "error" });
    }
  }

  return (
    <div className="mt-10 space-y-12">
      <section
        aria-labelledby="system-summary-heading"
        className="flex flex-col gap-5 border-b border-white/8 pb-10 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-sm text-slate-500">全体の状態</p>
          <div className="mt-2 flex items-center gap-3">
            <span
              className={
                health.tone === "danger"
                  ? "flex size-9 items-center justify-center rounded-full bg-red-400/12 text-red-300"
                  : health.tone === "attention"
                    ? "flex size-9 items-center justify-center rounded-full bg-amber-400/12 text-amber-200"
                    : "flex size-9 items-center justify-center rounded-full bg-white/8 text-slate-200"
              }
              aria-hidden="true"
            >
              {health.label === "問題なし" ? (
                <Check className="size-5" />
              ) : (
                health.tone === "neutral" ? (
                  <RefreshCw className="size-5" />
                ) : (
                  <AlertTriangle className="size-5" />
                )
              )}
            </span>
            <div>
              <h2 id="system-summary-heading" className="text-2xl font-semibold">
                {health.label}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{health.message}</p>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-2 border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
          onClick={handleCheckDeviceStatus}
          disabled={deviceState.status === "checking"}
        >
          <RefreshCw
            className={deviceState.status === "checking" ? "size-4 animate-spin" : "size-4"}
            aria-hidden="true"
          />
          {deviceState.status === "checking" ? "端末状態を確認中" : "端末状態を確認"}
        </Button>
      </section>

      <StatusSection title="Google Drive">
        <StatusRow
          label="Google"
          status={googleStatusLabel}
          description={sanitizeUserFacingDiagnostic(googleMessage)}
          tone={getGoogleTone(googleStatus)}
        />
        <StatusRow
          label="Google Drive"
          status={driveStatusLabel}
          description={sanitizeUserFacingDiagnostic(driveMessage)}
          tone={getDriveTone(driveStatus)}
        />
        {driveDiagnostics.length > 0 ? (
          <DiagnosticList items={driveDiagnostics} />
        ) : null}
        <SectionAction
          label={driveStatus === "checking" ? "再確認中" : "再確認"}
          onClick={checkDriveWorkspace}
          disabled={!canCheckDriveWorkspace}
        />
        <UtilityLink href="/settings">接続と保存領域を設定する</UtilityLink>
      </StatusSection>

      <StatusSection title="作品">
        <StatusRow
          label="選択中の作品"
          status={projectSummary ? projectSummary.title : "未選択"}
          description={
            projectSummary
              ? `スライド ${formatUiCount(projectSummary.slideCount)}・素材 ${formatUiCount(projectSummary.assetCount)}`
              : "「つくる」で編集する作品を選択してください。"
          }
          tone={projectSummary ? "neutral" : "attention"}
        />
        <StatusRow
          label="作品の状態"
          status={projectStatusLabel}
          description={sanitizeUserFacingDiagnostic(projectMessage)}
          tone={getProjectTone(projectStatus)}
        />
        {projectDiagnostics.length > 0 ? (
          <DiagnosticList items={projectDiagnostics} />
        ) : null}
        <SectionAction
          label={projectStatus === "checking" ? "再確認中" : "再確認"}
          onClick={checkProject}
          disabled={!canCheckProject}
        />
        <UtilityLink href="/admin">作品を選ぶ</UtilityLink>
      </StatusSection>

      <StatusSection title="このiPad">
        <StatusRow
          label="端末内データベース（IndexedDB）"
          status={getDeviceDatabaseStatus(deviceState)}
          description={getDeviceDatabaseDescription(deviceState)}
          tone={deviceState.status === "error" ? "danger" : "neutral"}
        />
        <StatusRow
          label="端末の再生データ"
          status={getLocalCopyStatus(deviceState)}
          description={getLocalCopyDescription(deviceState)}
          tone={deviceState.status === "error" ? "danger" : "neutral"}
        />
        <StatusRow
          label="ブラウザ保存容量"
          status={getStorageStatus(deviceState)}
          description={getStorageDescription(deviceState)}
          tone={deviceState.status === "error" ? "danger" : "neutral"}
        />
        <StatusRow
          label="アプリ表示用キャッシュ"
          status={getCacheStatus(deviceState)}
          description={getCacheDescription(deviceState)}
          tone={deviceState.status === "error" ? "danger" : "neutral"}
        />
      </StatusSection>

      <StatusSection title="公開・同期">
        <StatusRow
          label="直近の端末同期"
          status={offlineSyncStatusLabel}
          description={sanitizeUserFacingDiagnostic(offlineSyncMessage)}
          tone={getOfflineSyncTone(offlineSyncStatus)}
        />
        {deviceState.status === "ready" && deviceState.localData.projects.length > 0 ? (
          deviceState.localData.projects.map((project) => {
            const provenance = getPublicationCopy(project.publicationProvenance.status);
            return (
              <StatusRow
                key={project.projectId}
                label={project.projectTitle ?? "端末保存プロジェクト"}
                status={provenance.label}
                description={provenance.message}
                tone={provenance.tone}
              />
            );
          })
        ) : (
          <StatusRow
            label="公開内容との一致"
            status="未確認"
            description="端末状態を確認すると、保存済みプロジェクトの公開状態を表示します。"
            tone="neutral"
          />
        )}
      </StatusSection>
    </div>
  );
}

function StatusSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <ProductDisclosure label={title}>
        <dl className="divide-y divide-white/8 border-y border-white/8">{children}</dl>
      </ProductDisclosure>
    </section>
  );
}

function StatusRow({
  label,
  status,
  description,
  tone = "neutral",
}: {
  label: string;
  status: string;
  description: string;
  tone?: StatusTone;
}) {
  return (
    <div className="grid gap-2 py-5 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(9rem,0.65fr)_minmax(16rem,1.5fr)] sm:items-start sm:gap-6">
      <dt className="text-sm font-medium text-slate-300">{label}</dt>
      <dd
        className={
          tone === "danger"
            ? "flex items-center gap-2 text-sm font-semibold text-red-300"
            : tone === "attention"
              ? "flex items-center gap-2 text-sm font-semibold text-amber-200"
              : "flex items-center gap-2 text-sm font-semibold text-slate-100"
        }
      >
        <span
          className={
            tone === "danger"
              ? "size-1.5 rounded-full bg-red-300"
              : tone === "attention"
                ? "size-1.5 rounded-full bg-amber-200"
                : "size-1.5 rounded-full bg-slate-500"
          }
          aria-hidden="true"
        />
        {status}
      </dd>
      <dd className="text-sm leading-6 text-slate-400">{description}</dd>
    </div>
  );
}

function DiagnosticList({ items }: { items: string[] }) {
  return (
    <div className="py-4 text-sm text-amber-100">
      <dt className="font-medium">確認事項</dt>
      <dd className="mt-2 space-y-1 text-amber-100/80">
        {items.map((item) => (
          <p key={item}>{sanitizeUserFacingDiagnostic(item)}</p>
        ))}
      </dd>
    </div>
  );
}

function UtilityLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="py-3">
      <dt className="sr-only">操作</dt>
      <dd>
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-medium text-sky-300 transition hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          {children}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </dd>
    </div>
  );
}

function SectionAction({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <div className="py-3">
      <dt className="sr-only">再確認操作</dt>
      <dd>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
          onClick={onClick}
          disabled={disabled}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {label}
        </Button>
      </dd>
    </div>
  );
}

function getSystemHealth(input: {
  googleStatus: string;
  driveStatus: string;
  projectStatus: string;
  offlineSyncStatus: string;
  deviceStatus: DeviceStatusState["status"];
}) {
  const hasError =
    input.googleStatus === "error" ||
    ["invalidWorkspace", "unsupportedVersion", "operationFailed"].includes(input.driveStatus) ||
    ["invalid", "error"].includes(input.projectStatus) ||
    ["failed", "stale", "blocked"].includes(input.offlineSyncStatus) ||
    input.deviceStatus === "error";

  if (hasError) {
    return {
      tone: "danger" as const,
      label: "確認が必要",
      message: "対応が必要な項目があります。下の状態を確認してください。",
    };
  }

  const needsAction =
    ["scopeMissing", "missingClientId"].includes(input.googleStatus) ||
    ["notCreated", "multipleCandidates", "authRequired"].includes(input.driveStatus) ||
    input.projectStatus === "notCreated";

  if (needsAction) {
    return {
      tone: "attention" as const,
      label: "対応が必要",
      message: "利用を始めるために必要な項目があります。下の案内を確認してください。",
    };
  }

  const isReady =
    input.googleStatus === "connected" &&
    input.driveStatus === "ready" &&
    input.projectStatus === "ready" &&
    input.deviceStatus === "ready";

  return isReady
    ? {
        tone: "neutral" as const,
        label: "問題なし",
        message: "接続と端末データを利用できます。",
      }
    : {
        tone: "neutral" as const,
        label: "準備中 / 一部未確認",
        message: "未確認の項目は異常ではありません。必要なときに確認できます。",
      };
}

function getGoogleTone(status: string): StatusTone {
  if (status === "error") return "danger";
  if (["scopeMissing", "missingClientId"].includes(status)) return "attention";
  return "neutral";
}

function getDriveTone(status: string): StatusTone {
  if (["invalidWorkspace", "unsupportedVersion", "operationFailed"].includes(status)) return "danger";
  if (["notCreated", "multipleCandidates", "authRequired"].includes(status)) return "attention";
  return "neutral";
}

function getProjectTone(status: string): StatusTone {
  if (["invalid", "error"].includes(status)) return "danger";
  return status === "notCreated" ? "attention" : "neutral";
}

function getOfflineSyncTone(status: string): StatusTone {
  if (["failed", "stale", "blocked"].includes(status)) return "danger";
  return "neutral";
}

function getDeviceDatabaseStatus(state: DeviceStatusState) {
  if (state.status === "checking") return "確認中";
  if (state.status === "ready") return "利用可能";
  if (state.status === "error") return "確認できません";
  return "未確認";
}

function getDeviceDatabaseDescription(state: DeviceStatusState) {
  if (state.status === "ready") return "このiPadに再生データを保存できます。";
  if (state.status === "error") return "端末の保存領域を読み込めませんでした。";
  return "「端末状態を確認」で利用可否を確認します。";
}

function getLocalCopyStatus(state: DeviceStatusState) {
  if (state.status !== "ready") return state.status === "error" ? "確認できません" : "未確認";
  return state.localData.projectCount > 0 ? "保存済み" : "未保存";
}

function getLocalCopyDescription(state: DeviceStatusState) {
  if (state.status !== "ready") return "保存済みの再生データを確認します。";
  return `ローカルコピー ${state.localData.projectCount}件・スライド ${state.localData.projects.reduce((total, project) => total + project.slideCount, 0)}件・素材 ${state.localData.assetCount}件`;
}

function getStorageStatus(state: DeviceStatusState) {
  if (state.status !== "ready") return state.status === "error" ? "確認できません" : "未確認";
  return state.storage.storageEstimate.supported ? "利用可能" : "非対応";
}

function getStorageDescription(state: DeviceStatusState) {
  if (state.status !== "ready") return "使用量と空き容量を確認します。";
  const estimate = state.storage.storageEstimate;
  if (!estimate.supported || estimate.usageBytes === null || estimate.quotaBytes === null) {
    return "このブラウザでは容量の詳細を取得できません。";
  }
  return `使用中 ${formatBytes(estimate.usageBytes)} / 上限 ${formatBytes(estimate.quotaBytes)}`;
}

function getCacheStatus(state: DeviceStatusState) {
  if (state.status !== "ready") return state.status === "error" ? "確認できません" : "未確認";
  if (!state.storage.cacheStorage.supported) return "非対応";
  return state.storage.cacheStorage.appShellCacheExists ? "準備済み" : "未準備";
}

function getCacheDescription(state: DeviceStatusState) {
  if (state.status !== "ready") return "オフライン起動に使う基本ファイルを確認します。";
  if (!state.storage.cacheStorage.supported) return "このブラウザではキャッシュを利用できません。";
  return state.storage.cacheStorage.appShellCacheExists
    ? `基本ファイル ${state.storage.cacheStorage.appShellRequestCount}件を保存しています。`
    : "オンラインで画面を開くと基本ファイルが準備されます。";
}

function getPublicationCopy(status: OfflinePublicationProvenanceViewStatus): {
  label: string;
  message: string;
  tone: StatusTone;
} {
  switch (status) {
    case "publishedMatch":
      return {
        label: "公開版と一致",
        message: "この端末の再生データは現在の公開内容と一致しています。",
        tone: "neutral",
      };
    case "unpublishedChanges":
      return {
        label: "未公開の変更あり",
        message: "公開後に編集した内容がこのiPadに保存されています。",
        tone: "attention",
      };
    case "unpublished":
      return {
        label: "未公開",
        message: "まだ公開していない内容がこのiPadに保存されています。",
        tone: "attention",
      };
    case "needsInspection":
      return {
        label: "確認が必要",
        message: "公開内容との一致を確認できません。このiPadへの保存をもう一度実行してください。",
        tone: "danger",
      };
    case "legacyUnknown":
      return {
        label: "再保存を推奨",
        message: "以前の形式で保存されています。このiPadへの保存で状態を更新できます。",
        tone: "attention",
      };
  }
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(1)} ${units[unitIndex]}`;
}
