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
    label: "GitHub Pages公開URL",
    value: "https://hamakirin1230.github.io/ipad-slideshow-pwa/",
  },
  {
    label: "basePath",
    value: "/ipad-slideshow-pwa",
  },
  {
    label: "正式対応方針",
    value: "iPadOS 17以上 / Safariからホーム画面に追加したPWA",
  },
];

const implementedItems = [
  "Next.js / TypeScript / Tailwind CSS / shadcn/ui の初期構成",
  "GitHub ActionsによるGitHub Pages自動deploy",
  "iPadホーム画面からのPWA起動確認",
  "Project / Asset / SlideItem の3層mock-data",
  "管理画面でのプロジェクト一覧・素材一覧・本編スライド順表示",
  "再生画面での仮データ表示・基本UI表示",
];

const currentScopeItems = [
  "ローカル仮データで画面設計を確認する",
  "保存処理や外部連携に入る前に、情報構造と導線を固める",
  "Google連携・同期・本番再生機能はまだ実装しない",
];

const futureItems = [
  {
    goal: "第3ゴール",
    title: "Google OAuth",
    description:
      "Google Identity Servicesを導入し、アクセストークンを永続保存しない方針を検証します。",
  },
  {
    goal: "第4ゴール",
    title: "Google Driveワークスペース",
    description:
      "Drive上にワークスペース、workspace.json、index.json、プロジェクトmanifestを作成します。",
  },
  {
    goal: "第5ゴール",
    title: "Google Photos Picker",
    description:
      "Googleフォトから候補素材を取り込み、重複登録を防ぐ候補素材トレイを作ります。",
  },
  {
    goal: "第6ゴール",
    title: "iPad同期とオフライン再生",
    description:
      "公開済みmanifestと素材をiPad内に保存し、オフライン再生テストを行います。",
  },
  {
    goal: "第7ゴール",
    title: "本番向け機能",
    description:
      "テロップ、動画、ピンチズーム、ランダム再生、公開履歴、本番モードを順番に追加します。",
  },
];

const notImplementedItems = [
  "Google OAuth",
  "Google Drive連携",
  "Google Photos Picker連携",
  "IndexedDBへの素材保存",
  "Service Worker",
  "iPad同期",
  "オフライン本番再生",
  "動画再生",
  "テロップ編集",
  "公開履歴・ロールバック",
  "本番モード",
  "操作ロック",
];

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
          <Badge variant="secondary">第4-1 Drive連携準備</Badge>
            <h1 className="mt-3 text-3xl font-bold">設定</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
            Google接続とDriveワークスペース状態を確認する正式導線です。
            このスライスではDrive確認・作成はまだ行いません。
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
      Google OAuthの接続確認用ページです。Drive作成・manifest保存はまだ行いません。
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
                第1ゴール完了後、第2ゴールで追加した画面設計用の内容です。
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
              <CardTitle>第2ゴールの範囲</CardTitle>
              <CardDescription className="text-slate-300">
                現在はローカル仮データで画面設計を進める段階です。
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
            <CardTitle>第3ゴール以降</CardTitle>
            <CardDescription className="text-slate-300">
              第2ゴール完了後に、外部連携・保存・同期・本番機能を段階的に追加します。
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
              ここにある機能は、第2ゴールでは実装対象外です。
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