import Link from "next/link";
import { Activity, ArrowRight, Pencil, Play, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
            大切な写真や動画を、すぐに編集して、心地よく再生できます。
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              className="min-h-14 justify-between gap-8 rounded-xl bg-sky-300 px-6 text-base font-semibold text-slate-950 hover:bg-sky-200"
            >
              <Link href="/player">
                <span className="flex items-center gap-3">
                  <Play className="size-5 fill-current" aria-hidden="true" />
                  再生する
                </span>
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="min-h-14 gap-3 rounded-xl border-white/15 bg-white/5 px-6 text-base text-slate-50 hover:bg-white/10"
            >
              <Link href="/admin">
                <Pencil className="size-5" aria-hidden="true" />
                編集する
              </Link>
            </Button>
          </div>
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
            <Activity className="size-4" aria-hidden="true" />
            接続・端末の状態を見る
          </Link>
        </div>
      </div>
    </main>
  );
}
