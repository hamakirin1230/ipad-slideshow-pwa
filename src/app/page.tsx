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
    description:
      "仮データでプロジェクト一覧、素材一覧、本編スライド順を確認します。",
    badge: "第2-1対応済み",
  },
  {
    href: "/player",
    title: "再生画面",
    description:
      "仮データで再生プレビュー、再生前チェック、スライド順リストを確認します。",
    badge: "第2-2対応済み",
  },
  {
    href: "/settings",
    title: "設定",
    description:
      "現在の実装状況、公開URL、未実装範囲、後続ゴールを確認します。",
    badge: "第2-3で更新",
  },
];

const completedItems = [
  "GitHub PagesでPWAを公開済み",
  "iPadのホーム画面からPWAとして起動確認済み",
  "Project / Asset / SlideItem の3層mock-dataを追加済み",
  "管理画面で仮データを表示済み",
  "再生画面で仮データによる基本UIを表示済み",
];

const deferredItems = [
  "Google OAuth",
  "Google Driveワークスペース",
  "Google Photos Picker",
  "IndexedDB保存",
  "iPad同期",
  "オフライン再生",
  "動画再生",
  "テロップ編集",
  "本番モード",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl">
          <div className="flex flex-col gap-4">
            <Badge className="w-fit" variant="secondary">
              第2ゴール進行中
            </Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
                スライドショー
              </h1>
              <p className="max-w-3xl text-base leading-7 text-slate-300">
                iPadで安定して再生するためのスライドショーPWAです。
                第2ゴールでは、Google連携や保存処理に入る前に、
                ローカル仮データで管理画面と再生画面の情報設計を確認しています。
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {navigationItems.map((item) => (
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
                  <Link href={item.href}>開く</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>現在の到達点</CardTitle>
              <CardDescription className="text-slate-300">
                第1ゴール完了後、第2ゴールの画面設計を進めています。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              {completedItems.map((item) => (
                <p key={item}>・{item}</p>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>まだ実装しないこと</CardTitle>
              <CardDescription className="text-slate-300">
                第2ゴールでは、外部連携・保存・同期・本番再生機能は扱いません。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {deferredItems.map((item) => (
                <Badge
                  key={item}
                  variant="outline"
                  className="border-slate-500 text-slate-200"
                >
                  {item}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>次の開発段階</CardTitle>
              <CardDescription className="text-slate-300">
                第2ゴール完了後は、第3ゴールとしてGoogle OAuthの検証に進みます。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-slate-300 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="font-semibold text-slate-50">第3ゴール</p>
                <p className="mt-2">Google OAuthを導入し、アクセストークンを永続保存しない方針を検証します。</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="font-semibold text-slate-50">第4ゴール</p>
                <p className="mt-2">Google Drive上にワークスペース、プロジェクト、manifestを作ります。</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="font-semibold text-slate-50">第5ゴール以降</p>
                <p className="mt-2">Googleフォト取り込み、iPad同期、オフライン再生、本番向け機能を順番に追加します。</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}