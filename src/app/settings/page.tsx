import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DriveSettingsPanel } from "./drive-settings-panel";

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50 sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-sky-300">SETTINGS</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">設定</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              ログインに相当する操作は、Googleアカウントでつなぐことだけです。このアプリの新規登録はありません。
            </p>
          </div>
          <Button asChild variant="outline" className="min-h-11 gap-2 border-white/15 bg-white/5">
            <Link href="/system">
              <LifeBuoy className="size-4" aria-hidden="true" />
              接続で困ったとき
            </Link>
          </Button>
        </div>

        <DriveSettingsPanel />
      </div>
    </main>
  );
}
