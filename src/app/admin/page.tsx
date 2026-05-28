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

const sections = [
  {
    title: "ワークスペース",
    description: "Google Drive上の Slideshow Projects を登録・選択する予定です。",
    status: "未実装",
  },
  {
    title: "プロジェクト一覧",
    description: "スライドショー単位の作成、編集、公開状態を扱う予定です。",
    status: "未実装",
  },
  {
    title: "素材取り込み",
    description: "Google Photos Pickerから候補素材を取り込む予定です。",
    status: "未実装",
  },
  {
    title: "公開状態",
    description: "draft と published manifest を分けて管理する予定です。",
    status: "未実装",
  },
];

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">管理画面ダミー</Badge>
            <h1 className="mt-3 text-3xl font-bold">管理画面</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              PCでスライドショーを編集・公開するための入口です。
              第1-1では画面構成だけを確認します。
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.title} className="bg-white text-slate-950">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{section.title}</CardTitle>
                  <Badge variant="outline">{section.status}</Badge>
                </div>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Google連携、素材保存、公開処理は後続ゴールで実装します。
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
