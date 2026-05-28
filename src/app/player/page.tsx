import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const checks = [
  "公開済みmanifestの確認",
  "同期済み素材の確認",
  "オフライン再生テスト",
  "本番モードへの切り替え",
];

export default function PlayerPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-8 text-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">再生画面ダミー</Badge>
            <h1 className="mt-3 text-3xl font-bold">再生画面</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              iPadで同期済みスライドショーを検証し、本番再生するための入口です。
              第1-1ではローカル再生機能はまだ実装しません。
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>

        <Card className="border-white/10 bg-white/5 text-slate-50">
          <CardHeader>
            <CardTitle>サンプルスライドショー</CardTitle>
            <CardDescription className="text-slate-300">
              同期・検証・再生の状態表示イメージです。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-300">
                <span>同期進捗</span>
                <span>0%</span>
              </div>
              <Progress value={0} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {checks.map((check) => (
                <div
                  key={check}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span>{check}</span>
                    <Badge variant="outline" className="border-slate-500 text-slate-200">
                      未実装
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-dashed border-white/20 bg-black/40 p-6 text-center">
              <p className="text-sm text-slate-400">本番再生プレビュー領域</p>
              <p className="mt-3 text-2xl font-bold">スライド表示エリア</p>
              <p className="mt-2 text-sm text-slate-400">
                画像、動画、テロップ、ページ番号は後続ゴールで実装します。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
