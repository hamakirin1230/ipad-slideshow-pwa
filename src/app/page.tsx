import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const taskItems = [
  {
    href: "/player",
    title: "再生",
    description:
      "この端末に同期済みのスライドショーを開き、画像や動画を再生します。",
    badge: "iPad再生",
    action: "再生画面を開く",
  },
  {
    href: "/admin",
    title: "管理",
    description:
      "projectの編集、公開、公開履歴、ロールバック、端末へのoffline syncを行います。",
    badge: "編集 / 公開 / 同期",
    action: "管理画面を開く",
  },
  {
    href: "/settings",
    title: "設定 / Google Drive接続",
    description:
      "Google接続とDriveワークスペースの状態、この端末の保存準備を確認します。",
    badge: "Google / Drive",
    action: "設定を開く",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl">
          <div className="flex flex-col gap-4">
            <Badge className="w-fit" variant="secondary">
              Vercel production / iPad PWA
            </Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
                スライドショー
              </h1>
              <p className="max-w-3xl text-base leading-7 text-slate-300">
                iPadで安定して再生するためのスライドショーPWAです。
                Google Drive上でprojectを管理し、明示的なoffline syncでこの端末の再生用データを更新します。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="secondary">
                <Link href="/player">再生画面を開く</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin">管理画面を開く</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {taskItems.map((item) => (
            <Card
              key={item.href}
              className="border-white/10 bg-white text-slate-950"
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{item.title}</CardTitle>
                  <Badge variant="outline">{item.badge}</Badge>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href={item.href}>{item.action}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-white/10 bg-white/5 text-slate-50">
          <CardHeader>
            <CardTitle>反映と再生について</CardTitle>
            <CardDescription className="text-slate-300">
              Drive上の変更と、この端末で使用する再生用データは別に管理されます。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-slate-300 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="font-semibold text-slate-50">変更をiPadへ反映する</p>
              <p className="mt-2 leading-6">
                保存や公開だけでは再生用データは変わりません。管理画面で対象projectのoffline syncを明示的に実行してください。
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="font-semibold text-slate-50">remoteOnly動画を再生する</p>
              <p className="mt-2 leading-6">
                remoteOnly動画は動画本体を端末に保存せず、オンラインかつGoogle接続中の場合だけ再生します。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
