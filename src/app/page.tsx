import Link from "next/link";
import { LifeBuoy, Settings2 } from "lucide-react";
import { HomeLaunchActions } from "@/app/home-launch-actions";
import { HomeScreenInstallGuide } from "@/components/home-screen-install-guide";

export default function Home() {
  return (
    <main className="relative isolate min-h-svh overflow-hidden bg-slate-950 px-5 py-10 text-slate-50 sm:px-8 md:flex md:items-center md:px-12 md:py-14">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_18%,rgba(56,189,248,0.10),transparent_32%),radial-gradient(circle_at_20%_85%,rgba(14,165,233,0.06),transparent_28%)]"
      />
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-sky-300">
          <span className="h-px w-8 bg-sky-300/60" aria-hidden="true" />
          SLIDESHOW
        </div>

        <section className="mt-14 max-w-3xl sm:mt-20 md:mt-0">
          <h1 className="text-5xl font-semibold tracking-[-0.04em] text-balance sm:text-7xl md:text-8xl">
            スライドショー
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            写真の保存にGoogleアカウント（Drive）を使います。このアプリの新規登録はありません。
          </p>

          <HomeLaunchActions />

          <HomeScreenInstallGuide />
        </section>

        <div className="mt-20 flex flex-col gap-2 border-t border-white/8 pt-6 text-sm sm:mt-24 sm:flex-row sm:items-center sm:gap-6">
          <Link
            href="/settings"
            className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <Settings2 className="size-4" aria-hidden="true" />
            Google Driveから準備する
          </Link>
          <Link
            href="/system"
            className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <LifeBuoy className="size-4" aria-hidden="true" />
            サポート
          </Link>
        </div>
      </div>
    </main>
  );
}
