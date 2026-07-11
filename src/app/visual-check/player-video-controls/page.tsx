"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const safeDiagnostics = [
  "remote video slides: 2",
  "current remote video: video/mp4",
  "service worker: ready",
  "stream response status: ok",
  "stream response content-type: video/mp4",
  "stream response content-range: synthesized",
  "stream response accept-ranges: synthesized",
  "stream response content-length: present",
  "stream response range window: capped",
  "stream response range kind: start-open",
  "stream response content-length match: yes",
  "stream response upstream range status: honored",
  "stream request: range present",
  "media error: none",
  "media readyState: 4",
  "media networkState: 2",
  "buffered ahead: 5-15s",
  "stall count: waiting 2 / stalled 0",
  "stall recovered: 2",
  "stall state: recovered",
  "media events: waiting -> canplay -> playing",
];

const safetyItems = [
  "認証なしで表示できます。",
  "Drive APIは呼びません。",
  "Google scriptは読み込みません。",
  "実動画ファイルは読み込みません。",
  "native video controlsは使いません。",
  "認証情報、取得用URL、file id全文、バイナリ参照は表示しません。",
];

const unavailableStateMocks = [
  {
    state: "remote / offline",
    badge: "オンライン再生専用",
    title: "この動画はオンライン再生が必要です",
    description:
      "この端末には動画本体を保存していないため、オフラインでは再生できません。インターネット接続を確認してから再度開くか、前後のスライドへ移動してください。",
  },
  {
    state: "remote / online error",
    badge: "オンライン動画",
    title: "動画を再生できませんでした",
    description:
      "インターネット接続とGoogle接続を確認してください。この動画はオンライン時にDriveから再生します。",
  },
  {
    state: "offline Blob / error",
    title: "この動画を再生できませんでした",
    description:
      "前後のスライドへ移動するか、管理画面でoffline syncの状態を確認してください。",
  },
  {
    state: "production mode / remote offline",
    badge: "オンライン再生専用",
    title: "この動画はオンライン再生が必要です",
    description:
      "通常controlsが非表示でも、再生不能から退避するための前後移動だけを表示します。",
  },
];

export default function PlayerVideoControlsVisualCheckPage() {
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [mockState, setMockState] = useState<"normal" | "buffering" | "error">(
    "normal",
  );
  const canShowDiagnosticsToggle = mockState === "error";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="space-y-3">
          <Badge className="w-fit" variant="secondary">
            mock visual check
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Visual Check: Player Video Controls
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300">
              iPad横向き相当の幅で、動画custom controlsのhit area、paused、
              error、安全診断の見え方を確認します。
            </p>
          </div>
        </section>

        <Card className="border-emerald-300/30 bg-emerald-50 text-emerald-950">
          <CardHeader>
            <CardTitle>安全説明</CardTitle>
            <CardDescription className="text-emerald-900">
              実データ、認証、Drive接続なしの静的mockです。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm leading-6 sm:grid-cols-2">
              {safetyItems.map((item) => (
                <li key={item} className="rounded-lg bg-white/70 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black text-slate-50">
          <CardHeader>
            <CardTitle>iPad landscape mock</CardTitle>
            <CardDescription className="text-slate-300">
              1366x768相当の黒背景stageで、controls overlayだけを表示します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mx-auto aspect-[16/9] max-h-[768px] min-h-[520px] w-full overflow-hidden rounded-lg border border-white/10 bg-black">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.18),transparent_45%)]" />
              <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-white/15 bg-black/50 px-3 py-1">
                  muted autoplay
                </span>
                <span className="rounded-full border border-white/15 bg-black/50 px-3 py-1">
                  playsInline
                </span>
                <span className="rounded-full border border-white/15 bg-black/50 px-3 py-1">
                  controls off
                </span>
                <span className="rounded-full border border-white/15 bg-black/50 px-3 py-1">
                  duration override configured
                </span>
              </div>

              {mockState === "error" ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="mx-4 max-w-md rounded-2xl border border-amber-300/30 bg-amber-950/85 p-5 text-center text-amber-50 shadow-2xl">
                    <Badge variant="outline" className="border-amber-200/40 text-amber-50">
                      オンライン動画
                    </Badge>
                    <p className="text-lg font-semibold">
                      動画を再生できませんでした
                    </p>
                    <p className="mt-3 text-sm leading-6 text-amber-100/80">
                      インターネット接続とGoogle接続を確認してください。
                      この動画はオンライン時にDriveから再生します。
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                      <Button type="button" variant="secondary" className="h-12 rounded-full">
                        <ChevronLeft className="size-5" />
                        前のスライド
                      </Button>
                      <Button type="button" variant="secondary" className="h-12 rounded-full">
                        次のスライド
                        <ChevronRight className="size-5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pt-16 sm:px-6">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-white/10 bg-black/50 p-3 text-slate-50 shadow-2xl backdrop-blur-sm">
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-lg"
                      className="h-12 min-w-20 rounded-full border border-white/15 bg-black/45 px-4 text-slate-50 hover:bg-white/20"
                    >
                      <ChevronLeft className="size-7" />
                      前へ
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-lg"
                      className="h-12 min-w-24 rounded-full border border-white/15 bg-white/15 px-5 text-slate-50 hover:bg-white/25"
                      onClick={() => setIsPaused((current) => !current)}
                    >
                      {isPaused ? (
                        <>
                          <Play className="size-5" />
                          再生
                        </>
                      ) : (
                        <>
                          <Pause className="size-5" />
                          一時停止
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-lg"
                      className="h-12 min-w-20 rounded-full border border-white/15 bg-black/45 px-4 text-slate-50 hover:bg-white/20"
                    >
                      次へ
                      <ChevronRight className="size-7" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm tabular-nums text-slate-100">
                    <span className="text-right">0:12</span>
                    <input
                      type="range"
                      min={0}
                      max={225}
                      value={72}
                      readOnly
                      aria-label="動画の再生位置"
                      className="h-9 w-full accent-white"
                    />
                    <span>3:45</span>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-lg"
                      className="h-12 min-w-32 rounded-full border border-white/15 bg-black/45 px-4 text-slate-50 hover:bg-white/20"
                      onClick={() => setIsMuted((current) => !current)}
                    >
                      {isMuted ? (
                        <>
                          <VolumeX className="size-5" />
                          音声ON
                        </>
                      ) : (
                        <>
                          <Volume2 className="size-5" />
                          ミュート
                        </>
                      )}
                    </Button>
                    <label className="flex h-12 min-w-48 items-center gap-3 rounded-full border border-white/15 bg-black/45 px-4 text-sm">
                      <span>音量</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : 0.8}
                        readOnly
                        aria-label="動画の音量"
                        className="h-9 w-28 accent-white"
                      />
                    </label>
                    {canShowDiagnosticsToggle ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-lg"
                        className="h-12 rounded-full border border-sky-200/25 bg-sky-400/15 px-5 text-sky-50 hover:bg-sky-300/25"
                        aria-pressed={diagnosticsVisible}
                        onClick={() =>
                          setDiagnosticsVisible((current) => !current)
                        }
                      >
                        診断
                      </Button>
                    ) : null}
                  </div>

                  {mockState === "buffering" ? (
                    <p className="text-center text-sm text-slate-200">
                      読み込み中
                    </p>
                  ) : null}

                  {canShowDiagnosticsToggle && diagnosticsVisible ? (
                    <div className="max-h-36 overflow-auto rounded-lg border border-sky-200/20 bg-black/55 p-3 text-xs leading-5 text-sky-50">
                      {safeDiagnostics.map((diagnostic) => (
                        <p key={diagnostic}>{diagnostic}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-300/30 bg-amber-50 text-amber-950">
          <CardHeader>
            <CardTitle>video unavailable states</CardTitle>
            <CardDescription className="text-amber-900">
              remoteOnlyと端末保存済みvideoを分け、自動retry・自動nextなしで案内します。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {unavailableStateMocks.map((mock) => (
              <div key={mock.state} className="rounded-xl border border-amber-200 bg-white p-4">
                <p className="text-xs font-medium text-amber-700">{mock.state}</p>
                {mock.badge ? (
                  <Badge variant="outline" className="mt-3 border-amber-300 text-amber-900">
                    {mock.badge}
                  </Badge>
                ) : null}
                <p className="mt-3 font-semibold">{mock.title}</p>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  {mock.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary">
                    <ChevronLeft className="size-4" />
                    前のスライド
                  </Button>
                  <Button type="button" variant="secondary">
                    次のスライド
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setMockState("normal");
              setDiagnosticsVisible(false);
            }}
          >
            通常
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setMockState("normal");
              setIsPaused(true);
              setDiagnosticsVisible(false);
            }}
          >
            paused
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setMockState("buffering");
              setDiagnosticsVisible(false);
            }}
          >
            読み込み中
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setMockState("error");
              setDiagnosticsVisible(true);
            }}
          >
            error
          </Button>
        </div>
      </div>
    </main>
  );
}
