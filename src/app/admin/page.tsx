import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectStatusPanel } from "./project-status-panel";
import { ProjectPublishPanel } from "./project-publish-panel";
import { OfflineSyncPanel } from "./offline-sync-panel";
import { OfflineConfirmedStorePanel } from "./offline-confirmed-store-panel";
import { DriveProjectWorkspacePanel } from "./drive-project-workspace-panel";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-50 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">Drive / 端末同期 / 保存管理</Badge>
            <h1 className="mt-3 text-3xl font-bold">管理画面</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              Google Driveの保存領域とプロジェクトを確認し、編集・公開・端末への同期を行う管理画面です。
              端末保存データの確認、ストレージ管理、プロジェクト単位のローカル削除、
              再生画面への移動もここから行えます。
            </p>
          </div>
          <Button asChild variant="secondary" className="min-h-11">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>

        <nav
          aria-label="管理画面の主要セクション"
          className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4"
        >
          <p className="mb-3 text-sm font-semibold text-slate-200">
            作業セクション
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <AdminSectionLink href="#project">プロジェクト</AdminSectionLink>
            <AdminSectionLink href="#edit">編集</AdminSectionLink>
            <AdminSectionLink href="#publish">公開</AdminSectionLink>
            <AdminSectionLink href="#device">
              端末同期・保存
            </AdminSectionLink>
          </div>
        </nav>

        <AdminSection
          id="project"
          title="プロジェクト"
          description="Google Driveとの接続状態を確認し、作業対象のプロジェクトを選択または作成します。"
        >
          <ProjectStatusPanel />
        </AdminSection>

        <AdminSection
          id="edit"
          title="編集"
          description="素材の追加・整理と、スライド順・テロップ・表示時間の編集を行います。"
        >
          <DriveProjectWorkspacePanel />
        </AdminSection>

        <AdminSection
          id="publish"
          title="公開"
          description="公開前確認を行い、確認した内容をGoogle Driveの公開版へ反映します。"
        >
          <ProjectPublishPanel />
        </AdminSection>

        <AdminSection
          id="device"
          title="端末同期・保存"
          description="公開とは別に、この端末の再生用コピーと保存状態を確認・管理します。"
        >
          <OfflineSyncPanel />
          <OfflineConfirmedStorePanel />
        </AdminSection>
      </div>
    </main>
  );
}

function AdminSectionLink({
  href,
  children,
}: {
  href: `#${string}`;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 min-w-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-center text-sm font-medium leading-5 text-slate-100 transition hover:border-sky-300/50 hover:bg-sky-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      {children}
    </Link>
  );
}

function AdminSection({
  id,
  title,
  description,
  children,
}: {
  id: "project" | "edit" | "publish" | "device";
  title: string;
  description: string;
  children: ReactNode;
}) {
  const headingId = `admin-${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-4 space-y-4"
    >
      <div className="border-l-4 border-sky-400 pl-4">
        <h2 id={headingId} className="text-2xl font-bold text-slate-50">
          {title}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
