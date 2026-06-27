import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const safetyItems = [
  "mock-only の表示確認ページです。",
  "Google login は不要です。",
  "Drive API は使いません。",
  "実動画ファイルは読み込みません。",
  "動画download、offline保存、player用保存形式の変更はありません。",
  "秘密値、認証ヘッダー、生レスポンス、取得用URL、バイナリ参照は表示しません。",
];

const mockSlides = [
  {
    label: "image slide",
    type: "image",
    mimeType: "image/jpeg",
    status: "従来どおり画像として表示",
    tone: "emerald",
  },
  {
    label: "video/mp4",
    type: "video",
    mimeType: "video/mp4",
    status: "muted + playsInline のvideo候補",
    tone: "sky",
  },
  {
    label: "video/quicktime",
    type: "video",
    mimeType: "video/quicktime",
    status: "unsupported fallback",
    tone: "amber",
  },
  {
    label: "video/webm",
    type: "video",
    mimeType: "video/webm",
    status: "unsupported fallback",
    tone: "amber",
  },
  {
    label: "unsupportedReasonあり",
    type: "video",
    mimeType: "video/mp4",
    status: "理由ありfallback",
    tone: "red",
  },
];

const fallbackStates = [
  "autoplay failure: 短いfallback表示後に次へ進む",
  "media error: Player全体は止めず次へ進む",
  "timeout: 再生開始または終了しない場合は次へ進む",
  "empty state: confirmed storeにslideがない状態を維持",
];

export default function PlayerVideoVisualCheckPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="space-y-3">
          <Badge className="w-fit" variant="secondary">
            mock visual check
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Visual Check: Player Video
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300">
              認証なし・実データなしの表示確認ページです。将来confirmed
              storeにvideo slideが入った場合のPlayer分岐とfallback表示を確認します。
            </p>
          </div>
        </section>

        <Card className="border-emerald-300/30 bg-emerald-50 text-emerald-950">
          <CardHeader>
            <CardTitle>安全説明</CardTitle>
            <CardDescription className="text-emerald-900">
              このページはDrive、端末内保存、実動画再生へ接続しない静的mockです。
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
            <CardTitle>Player stage mock</CardTitle>
            <CardDescription className="text-slate-300">
              実際のPlayerと同じ黒背景で、image / video /
              fallbackの見え方だけを確認します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative flex min-h-[58svh] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black">
              <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                  <Badge variant="outline" className="border-white/20 text-slate-100">
                    video branch mock
                  </Badge>
                  <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5">
                    muted
                  </span>
                  <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5">
                    playsInline
                  </span>
                  <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5">
                    controls off
                  </span>
                </div>
              </div>

              <div className="mx-4 max-w-md rounded-2xl border border-amber-300/30 bg-amber-950/80 p-5 text-center text-amber-50 shadow-2xl">
                <p className="text-lg font-semibold">
                  動画はこの端末では再生できません
                </p>
                <p className="mt-3 text-sm leading-6 text-amber-100/80">
                  このスライドは現在の再生対象外です。次のスライドへ進みます。
                </p>
              </div>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 py-4">
                <p className="mx-auto max-w-4xl rounded-xl bg-black/60 px-4 py-2 text-center text-base leading-7 text-white shadow-2xl">
                  mock caption: 動画fallback中もテロップの表示領域を確認します。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {mockSlides.map((slide) => (
            <div
              key={slide.label}
              className={`rounded-lg border p-3 ${getToneClassName(slide.tone)}`}
            >
              <p className="font-semibold">{slide.label}</p>
              <dl className="mt-3 space-y-2 text-xs">
                <div>
                  <dt className="opacity-70">type</dt>
                  <dd className="font-mono">{slide.type}</dd>
                </div>
                <div>
                  <dt className="opacity-70">mimeType</dt>
                  <dd className="font-mono">{slide.mimeType}</dd>
                </div>
                <div>
                  <dt className="opacity-70">status</dt>
                  <dd>{slide.status}</dd>
                </div>
              </dl>
            </div>
          ))}
        </section>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>fallback states</CardTitle>
            <CardDescription>
              Player全体を止めず、短い表示後に次へ進む状態の文言確認です。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm md:grid-cols-2">
              {fallbackStates.map((state) => (
                <li key={state} className="rounded-lg bg-slate-50 px-3 py-2">
                  {state}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function getToneClassName(tone: string) {
  switch (tone) {
    case "emerald":
      return "border-emerald-300/30 bg-emerald-50 text-emerald-950";
    case "sky":
      return "border-sky-300/30 bg-sky-50 text-sky-950";
    case "amber":
      return "border-amber-300/40 bg-amber-50 text-amber-950";
    case "red":
      return "border-red-300/40 bg-red-50 text-red-950";
    default:
      return "border-slate-200 bg-white text-slate-950";
  }
}
