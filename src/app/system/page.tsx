import { SystemStatusOverview } from "./system-status-overview";

export default function SystemPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50 sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-sky-300">
            SYSTEM
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            システム
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-400">
            接続・保存・端末の状態
          </p>
        </header>

        <SystemStatusOverview />
      </div>
    </main>
  );
}
