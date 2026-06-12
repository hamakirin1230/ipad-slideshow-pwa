import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriveSettingsPanel } from "./drive-settings-panel";
import { OfflineDbCheckPanel } from "./offline-db-check-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const appSettings = [
  {
    label: "アプリ名",
    value: "スライドショー",
  },
  {
    label: "Vercel production URL",
    value: "https://ipad-slideshow-pwa.vercel.app/",
  },
  {
    label: "PWA path",
    value: "root path / manifest.json / sw.js",
  },
  {
    label: "正式対応方針",
    value: "iPadOS 17以上 / Safariからホーム画面に追加したPWA",
  },
];

const implementedItems = [
  "Google OAuth / drive.file scope 接続",
  "Drive workspace / project 作成・再確認",
  "Google Photos Picker から素材追加",
  "Drive manifest / assets の保存と再確認",
  "IndexedDB staging / confirmed store への offline sync",
  "confirmed Blob からの offline-first 再生",
  "Service Worker による app shell cache",
  "端末ストレージ概要と app shell cache 管理",
  "複数 project 再生に向けた project selector",
];

const currentScopeItems = [
  "Google接続状態と Drive workspace 状態を確認する",
  "IndexedDB をこのブラウザで開けるか確認する",
  "認証・Drive・端末内保存の前提を管理画面へ渡す",
];

const futureItems = [
  {
    goal: "次の確認",
    title: "multi-project playback 実機確認",
    description:
      "Vercel productionで複数projectをoffline syncし、/player/のproject selectorをiPad PWAで確認します。",
  },
  {
    goal: "本番向け",
    title: "本番モード・操作ロック",
    description:
      "本番中の誤操作を防ぐためのロック、解除導線、表示制限を設計します。",
  },
  {
    goal: "再生拡張",
    title: "動画・テロップ",
    description:
      "動画再生、テロップ、表示時間、素材ごとの再生挙動を段階的に追加します。",
  },
  {
    goal: "運用",
    title: "公開履歴・ロールバック",
    description:
      "公開済みmanifestの履歴管理と、事故時に前の状態へ戻す導線を追加します。",
  },
];

const notImplementedItems = [
  "動画再生",
  "テロップ編集",
  "公開履歴・ロールバック",
  "本番モード",
  "操作ロック",
  "ピンチズーム",
  "ランダム再生",
];

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">Google / Drive / IndexedDB</Badge>
            <h1 className="mt-3 text-3xl font-bold">設定</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              Google接続、Drive workspace 状態、IndexedDB 疎通を確認する画面です。
              Drive project、素材追加、offline sync、再生確認は管理画面と再生画面で扱います。
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>

        <DriveSettingsPanel />

        <OfflineDbCheckPanel />

        <section className="grid gap-4 md:grid-cols-2">
          {appSettings.map((item) => (
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
            <CardTitle>開発用ページ</CardTitle>
            <CardDescription className="text-slate-300">
              Google OAuth単体の接続確認用ページです。通常の運用導線はこの設定画面を使います。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link href="/auth-test">Google認証テストを開く</Link>
            </Button>
          </CardContent>
        </Card>
        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>実装済み</CardTitle>
              <CardDescription className="text-slate-300">
                Vercel production とiPad PWAで確認済み、またはローカル検証済みの主要機能です。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              {implementedItems.map((item) => (
                <p key={item}>・{item}</p>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-slate-50">
            <CardHeader>
              <CardTitle>この画面の範囲</CardTitle>
              <CardDescription className="text-slate-300">
                設定画面では認証と基礎状態の確認に絞ります。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              {currentScopeItems.map((item) => (
                <p key={item}>・{item}</p>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card className="border-white/10 bg-white/5 text-slate-50">
          <CardHeader>
            <CardTitle>次の候補</CardTitle>
            <CardDescription className="text-slate-300">
              offline再生の縦線が通った後に進める候補です。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {futureItems.map((item) => (
              <div
                key={item.goal}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-slate-500 text-slate-200">
                    {item.goal}
                  </Badge>
                  <p className="font-semibold text-slate-50">{item.title}</p>
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  {item.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 text-slate-50">
          <CardHeader>
            <CardTitle>まだ未実装</CardTitle>
            <CardDescription className="text-slate-300">
              本番運用向けに今後追加する機能です。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {notImplementedItems.map((item) => (
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
      </div>
    </main>
  );
}
