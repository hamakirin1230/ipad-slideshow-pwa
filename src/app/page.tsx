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
    href: "/settings",
    title: "設定",
    description:
      "Google接続、Drive workspace 状態、OAuth scope、現在の接続状態を確認します。",
    badge: "Google / Drive",
  },
  {
    href: "/admin",
    title: "管理画面",
    description:
      "Drive project、Photos Picker、offline sync、confirmed store、project単位のローカル削除を扱います。",
    badge: "同期 / 保存管理",
  },
  {
    href: "/player",
    title: "再生画面",
    description:
      "この端末に保存済みの IndexedDB confirmed Blob から、offline-first でスライドを再生します。",
    badge: "iPad再生",
  },
];

const completedItems = [
  "Vercel production で公開中",
  "Google OAuth / drive.file scope 接続済み",
  "Google Drive workspace / project 検証済み",
  "Google Photos Picker から素材追加済み",
  "manifest.json / index.json 反映済み",
  "IndexedDB confirmed store への offline sync 済み",
  "confirmed asset Blob から /player 画像再生済み",
  "next / previous / 自動送り / swipe 操作確認済み",
  "Service Worker による app shell cache 追加済み",
  "project 単位のローカル保存削除を追加済み",
  "iPad 実機 PWA offline shell / player recovery 確認済み",
];

const storageItems = [
  {
    title: "Cache Storage",
    description:
      "Service Worker が app shell、manifest、icons、Next.js static chunks を保存します。",
    detail: "cache: ipad-slideshow-pwa-app-shell-v1",
  },
  {
    title: "IndexedDB",
    description:
      "project snapshot、asset metadata、asset Blob、sync state を保存します。",
    detail: "db: ipad-slideshow-offline",
  },
  {
    title: "Google Drive",
    description:
      "workspace、project folder、manifest、assets の本体を保持します。ローカル削除では消しません。",
    detail: "source of truth",
  },
];

const nextStepItems = [
  {
    title: "iPad再生UX polish",
    description:
      "横向き表示、操作ボタンの自動フェード、全画面寄せ、safe area 対応を整えます。",
  },
  {
    title: "offline storage 管理UI",
    description:
      "projectごとの保存容量、Blob合計サイズ、cache clear、last synced 表示を追加します。",
  },
  {
    title: "multi-project playback",
    description:
      "複数projectを正式に扱うため、player側にproject選択導線を追加します。",
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
                Google Drive上のprojectと素材を同期し、この端末のIndexedDBに保存した
                confirmed Blobからoffline-firstで再生します。
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

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>現在の到達点</CardTitle>
              <CardDescription className="text-slate-300">
                Vercel production、Drive連携、offline sync、iPad実機確認まで進んでいます。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              {completedItems.map((item) => (
                <p key={item}>・{item}</p>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>ローカル保存の扱い</CardTitle>
              <CardDescription className="text-slate-300">
                offline再生に必要なデータは、用途ごとに保存先を分けています。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              {storageItems.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <p className="font-semibold text-slate-50">{item.title}</p>
                  <p className="mt-2 leading-6">{item.description}</p>
                  <p className="mt-2 text-xs text-slate-500">{item.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>次の開発候補</CardTitle>
              <CardDescription className="text-slate-300">
                iPad実機でのoffline shell確認後は、再生体験と保存管理を磨く段階です。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-slate-300 md:grid-cols-3">
              {nextStepItems.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <p className="font-semibold text-slate-50">{item.title}</p>
                  <p className="mt-2 leading-6">{item.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
