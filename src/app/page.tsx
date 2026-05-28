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

const navigationItems = [
  {
    href: "/admin",
    title: "管理画面",
    description: "ワークスペース、プロジェクト、素材、公開状態を管理します。",
    badge: "PC向け",
  },
  {
    href: "/player",
    title: "再生画面",
    description: "iPadで同期済みスライドショーを検証・再生します。",
    badge: "iPad向け",
  },
  {
    href: "/settings",
    title: "設定",
    description: "PWA情報、対応環境、公開URL、未実装機能を確認します。",
    badge: "確認用",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl">
          <div className="flex flex-col gap-4">
            <Badge className="w-fit" variant="secondary">
              第1-1 ダミーUI
            </Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
                スライドショー
              </h1>
              <p className="max-w-3xl text-base leading-7 text-slate-300">
                iPadで安定して再生するためのスライドショーPWAです。
                現在は第1-1として、Windows上で起動する土台と画面入口を作っています。
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {navigationItems.map((item) => (
            <Card key={item.href} className="border-white/10 bg-white text-slate-950">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{item.title}</CardTitle>
                  <Badge variant="outline">{item.badge}</Badge>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href={item.href}>開く</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>現在の到達点</CardTitle>
              <CardDescription className="text-slate-300">
                GitHub Pages公開前のローカル開発段階です。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p>・Next.js / TypeScript / Tailwind CSS の雛形作成</p>
              <p>・shadcn/ui の最小導入</p>
              <p>・管理、再生、設定画面の入口作成</p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>まだ実装しないこと</CardTitle>
              <CardDescription className="text-slate-300">
                第1-1では外部連携や本番再生機能は扱いません。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p>・Google OAuth / Drive / Photos 連携</p>
              <p>・iPadへの同期、IndexedDB保存、オフライン再生</p>
              <p>・動画再生、テロップ編集、公開履歴</p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
