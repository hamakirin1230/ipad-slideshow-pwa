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

const settings = [
  {
    label: "アプリ名",
    value: "スライドショー",
  },
  {
    label: "GitHub Pages想定URL",
    value: "https://hamakirin1230.github.io/ipad-slideshow-pwa/",
  },
  {
    label: "basePath",
    value: "/ipad-slideshow-pwa",
  },
  {
    label: "対応方針",
    value: "iPadOS 17以上 / ホーム画面追加PWA",
  },
];

const notImplemented = [
  "Google OAuth",
  "Google Drive連携",
  "Google Photos Picker連携",
  "IndexedDBへの素材保存",
  "Service Worker",
  "オフライン本番再生",
];

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">設定画面ダミー</Badge>
            <h1 className="mt-3 text-3xl font-bold">設定</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              PWA情報、公開予定URL、対応環境、未実装機能を確認する画面です。
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          {settings.map((item) => (
            <Card key={item.label} className="bg-white text-slate-950">
              <CardHeader>
                <CardTitle className="text-base">{item.label}</CardTitle>
                <CardDescription className="break-all text-lg font-semibold text-slate-900">
                  {item.value}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <Card className="border-white/10 bg-white/5 text-slate-50">
          <CardHeader>
            <CardTitle>第1-1では未実装</CardTitle>
            <CardDescription className="text-slate-300">
              ここにある機能は後続ゴールで段階的に追加します。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {notImplemented.map((item) => (
              <div
                key={item}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <span>{item}</span>
                <Badge variant="outline" className="border-slate-500 text-slate-200">
                  未実装
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
