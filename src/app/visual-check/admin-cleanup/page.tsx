import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MockCleanupAsset = {
  assetName: string;
  assetType: "image" | "video" | "unknown";
  assetFileId: string;
  assetId: string;
  mimeType: string;
  size: string;
  durationMs: string;
  unsupportedReason: string;
  createdTime: string;
  modifiedTime: string;
  references: string;
  status: "eligible" | "blocked" | "unknown";
  blockedReason: string;
};

const cleanupTableGridStyle: CSSProperties = {
  gridTemplateColumns:
    "4rem 24rem 8rem 18rem 18rem 14rem 10rem 12rem 18rem 18rem 10rem 34rem",
};

const preflightSummaryGridStyle: CSSProperties = {
  gridTemplateColumns: "8rem 18rem 14rem 12rem 10rem 9rem 34rem 34rem",
};

const mockAssets: MockCleanupAsset[] = [
  {
    assetName:
      "2026年度_体育館_卒業式リハーサル_横長スクリーン確認用_とても長いファイル名_mock_only_image_001.jpg",
    assetType: "image",
    assetFileId:
      "mock-file-id-visual-check-admin-cleanup-super-long-segment-001-not-real",
    assetId:
      "mock-asset-id-project-alpha-section-main-visual-check-row-001-not-real",
    mimeType: "image/jpeg; mock-preview-long-mimetype-label",
    size: "2.4 MB",
    durationMs: "未設定",
    unsupportedReason: "なし",
    createdTime: "2026-06-23T09:12:34.000+09:00 mock-created",
    modifiedTime: "2026-06-23T10:45:21.000+09:00 mock-modified",
    references: "0",
    status: "eligible",
    blockedReason: "なし",
  },
  {
    assetName:
      "文化祭_入口サイネージ_差し替え前_旧バージョン_参照が残っている想定_mock_only_image_very_long_name.webp",
    assetType: "image",
    assetFileId:
      "mock-file-id-visual-check-admin-cleanup-blocked-row-002-not-real",
    assetId:
      "mock-asset-id-project-beta-stage-left-visual-check-row-002-not-real",
    mimeType: "image/webp; mock-preview-long-mimetype-label",
    size: "5.8 MB",
    durationMs: "未設定",
    unsupportedReason: "なし",
    createdTime: "2026-06-20T18:01:02.000+09:00 mock-created",
    modifiedTime: "2026-06-22T21:09:44.000+09:00 mock-modified",
    references: "2",
    status: "blocked",
    blockedReason:
      "still referenced, metadata mismatch, wrong parent folder label for visual check",
  },
  {
    assetName:
      "metadata_missing_mock_only_asset_name_is_long_enough_to_test_truncation_without_real_drive_data.png",
    assetType: "unknown",
    assetFileId:
      "mock-file-id-missing-metadata-row-003-not-real-and-not-drive-shaped",
    assetId:
      "mock-asset-id-missing-metadata-row-003-not-real-and-not-drive-shaped",
    mimeType: "取得なし mock-missing-mimetype",
    size: "取得なし",
    durationMs: "取得なし",
    unsupportedReason: "unsupportedMimeType",
    createdTime: "取得なし mock-created-time",
    modifiedTime: "取得なし mock-modified-time",
    references: "不明",
    status: "unknown",
    blockedReason:
      "missing required metadata, unsupported type label, visual check only",
  },
  {
    assetName:
      "mock-only-video-001_long_name_for_video_schema_groundwork_visual_check.mp4",
    assetType: "video",
    assetFileId:
      "mock-file-id-video-schema-groundwork-row-004-not-real-and-not-drive-shaped",
    assetId:
      "mock-asset-id-video-schema-groundwork-row-004-not-real-and-not-drive-shaped",
    mimeType: "video/mp4",
    size: "18.4 MB",
    durationMs: "124000 ms / 124秒",
    unsupportedReason: "videoPlaybackNotImplemented",
    createdTime: "2026-06-27T09:30:00.000+09:00 mock-created",
    modifiedTime: "2026-06-27T09:45:00.000+09:00 mock-modified",
    references: "0",
    status: "blocked",
    blockedReason: "video playback not implemented yet; schema mock only",
  },
  {
    assetName:
      "mock-only-video-quicktime-unsupported-long-name-for-admin-visibility-check.mov",
    assetType: "video",
    assetFileId:
      "mock-file-id-video-quicktime-row-005-not-real-and-not-drive-shaped",
    assetId:
      "mock-asset-id-video-quicktime-row-005-not-real-and-not-drive-shaped",
    mimeType: "video/quicktime",
    size: "42.9 MB",
    durationMs: "305000 ms / 305秒",
    unsupportedReason:
      "unsupportedVideoMimeType: quicktime is recognized for admin review but playback download offline storage are not implemented",
    createdTime: "2026-06-27T10:00:00.000+09:00 mock-created",
    modifiedTime: "2026-06-27T10:05:00.000+09:00 mock-modified",
    references: "0",
    status: "blocked",
    blockedReason:
      "unsupportedVideoMimeType, video playback not implemented yet, visual check only",
  },
  {
    assetName:
      "mock-only-video-webm-unsupported-long-name-for-admin-visibility-check.webm",
    assetType: "video",
    assetFileId:
      "mock-file-id-video-webm-row-006-not-real-and-not-drive-shaped",
    assetId:
      "mock-asset-id-video-webm-row-006-not-real-and-not-drive-shaped",
    mimeType: "video/webm",
    size: "29.7 MB",
    durationMs: "98000 ms / 98秒",
    unsupportedReason: "unsupportedVideoMimeType",
    createdTime: "2026-06-27T10:10:00.000+09:00 mock-created",
    modifiedTime: "2026-06-27T10:15:00.000+09:00 mock-modified",
    references: "1",
    status: "blocked",
    blockedReason: "still referenced, unsupportedVideoMimeType",
  },
  {
    assetName:
      "mock-only-unknown-mimetype-long-name-for-admin-video-visibility-check.bin",
    assetType: "unknown",
    assetFileId:
      "mock-file-id-unknown-mimetype-row-007-not-real-and-not-drive-shaped",
    assetId:
      "mock-asset-id-unknown-mimetype-row-007-not-real-and-not-drive-shaped",
    mimeType: "application/octet-stream; mock-unknown",
    size: "9.1 MB",
    durationMs: "取得なし",
    unsupportedReason: "unsupportedMimeType",
    createdTime: "2026-06-27T10:20:00.000+09:00 mock-created",
    modifiedTime: "2026-06-27T10:25:00.000+09:00 mock-modified",
    references: "0",
    status: "unknown",
    blockedReason: "unsupportedMimeType, visual check only",
  },
];

const emptyAssets: MockCleanupAsset[] = [];

const safetyItems = [
  "mock-only の表示確認ページです。",
  "Google login は不要です。",
  "Drive API は使いません。",
  "削除処理はありません。",
  "動画は認識のみ。再生・download・offline保存は未実装です。",
  "秘密値、認証ヘッダー、生レスポンス、取得用URL、バイナリ参照は表示しません。",
];

const screenshotNotes = [
  "Mac narrow width",
  "iPad portrait",
  "iPad landscape",
  "long-value truncation",
  "horizontal scroll containment",
];

export default function AdminCleanupVisualCheckPage() {
  const eligibleAssets = mockAssets.filter((asset) => asset.status === "eligible");
  const blockedAssets = mockAssets.filter((asset) => asset.status === "blocked");

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="space-y-3">
          <Badge className="w-fit" variant="secondary">
            mock visual check
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Visual Check: Admin Cleanup
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300">
              認証なし・実データなしの表示確認ページです。cleanup preview
              周辺の横長table、preflight list、confirm previewをスクリーンショットで確認するためのmockです。
            </p>
          </div>
        </section>

        <Card className="border-emerald-300/30 bg-emerald-50 text-emerald-950">
          <CardHeader>
            <CardTitle>安全説明</CardTitle>
            <CardDescription className="text-emerald-900">
              このページはDriveや端末内保存へ接続しない静的mockです。
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

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryPill label="scanned asset files" value="46件" />
          <SummaryPill label="referenced asset files" value="31件" />
          <SummaryPill label="unused asset files" value="7件" />
          <SummaryPill label="ignored files" value="8件" />
          <SummaryPill label="unused total size" value="108.3 MB" />
        </section>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>cleanup preview table mock</CardTitle>
                <CardDescription>
                  長いasset名、mock ID、MIME type、timestamp、blocked reasonの表示崩れを確認します。
                </CardDescription>
              </div>
              <Badge variant="outline">mock data</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <MockCleanupTable assets={mockAssets} />
          </CardContent>
        </Card>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>削除前preflight mock</CardTitle>
            <CardDescription>
              eligible / blocked list は個別の横スクロール領域に閉じ込めます。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryPill label="checked" value="7件" subtle />
              <SummaryPill label="eligible" value="1件" subtle />
              <SummaryPill label="blocked" value="4件" subtle />
              <SummaryPill label="unknown" value="2件" subtle />
              <SummaryPill label="eligible total size" value="2.4 MB" subtle />
            </div>

            <PreflightAssetList
              title="preflight eligible list mock"
              assets={eligibleAssets}
              emptyMessage="eligible asset はありません。"
            />
            <PreflightAssetList
              title="preflight blocked list mock"
              assets={blockedAssets}
              emptyMessage="blocked asset はありません。"
            />
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50 text-red-950">
          <CardHeader>
            <CardTitle>confirm preview mock</CardTitle>
            <CardDescription className="text-red-900">
              実行不可の確認表示です。mock candidateの再表示だけを行います。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-full overflow-x-auto">
              <div className="min-w-[156rem] space-y-2 pr-1">
                {eligibleAssets.map((asset) => (
                  <PreflightAssetSummary key={asset.assetFileId} asset={asset} />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled
                className="rounded-lg bg-red-200 px-3 py-2 text-sm font-medium text-red-950 opacity-70"
              >
                mock: 物理削除は実行不可
              </button>
              <p className="max-w-2xl text-sm leading-6">
                このvisual check routeには実行handlerがありません。既存のcleanup preview /
                preflight / confirm previewの挙動も変更していません。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>空状態 mock</CardTitle>
            <CardDescription>
              candidatesなし、eligibleなし、blockedなしの余白と文言を確認します。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MockCleanupTable assets={emptyAssets} />
            <PreflightAssetList
              title="preflight eligible empty"
              assets={emptyAssets}
              emptyMessage="eligible asset はありません。"
            />
            <PreflightAssetList
              title="preflight blocked empty"
              assets={emptyAssets}
              emptyMessage="blocked asset はありません。"
            />
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-900 text-slate-50">
          <CardHeader>
            <CardTitle>スクリーンショット確認用メモ</CardTitle>
            <CardDescription className="text-slate-300">
              画面幅を変えながら、ページ全体ではなく各section内だけで横スクロールすることを確認します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {screenshotNotes.map((item) => (
                <li
                  key={item}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function MockCleanupTable({ assets }: { assets: MockCleanupAsset[] }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200">
      <div className="min-w-[190rem]">
        <div
          className="grid gap-4 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-500"
          style={cleanupTableGridStyle}
        >
          <p className="whitespace-nowrap">select</p>
          <p className="whitespace-nowrap">assetName</p>
          <p className="whitespace-nowrap">type</p>
          <p className="whitespace-nowrap">assetFileId</p>
          <p className="whitespace-nowrap">assetId</p>
          <p className="whitespace-nowrap">mimeType</p>
          <p className="whitespace-nowrap">size</p>
          <p className="whitespace-nowrap">durationMs</p>
          <p className="whitespace-nowrap">createdTime</p>
          <p className="whitespace-nowrap">modifiedTime</p>
          <p className="whitespace-nowrap">status</p>
          <p className="whitespace-nowrap">unsupportedReason</p>
          <p className="whitespace-nowrap">blocked reason</p>
        </div>

        {assets.length > 0 ? (
          <div className="divide-y divide-slate-200">
            {assets.map((asset) => (
              <div
                key={asset.assetFileId}
                className="grid items-center gap-4 bg-white px-4 py-3 text-sm"
                style={cleanupTableGridStyle}
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    readOnly
                    checked={asset.status === "eligible"}
                    className="size-4 rounded border-slate-300"
                    aria-label={`${asset.assetName} mock selection`}
                  />
                </label>
                <TruncatedCell value={asset.assetName} strong />
                <TruncatedCell value={asset.assetType} mono />
                <TruncatedCell value={asset.assetFileId} mono />
                <TruncatedCell value={asset.assetId} mono />
                <TruncatedCell value={asset.mimeType} mono />
                <p className="whitespace-nowrap font-mono text-xs text-slate-900">
                  {asset.size}
                </p>
                <TruncatedCell value={asset.durationMs} mono />
                <TruncatedCell value={asset.createdTime} mono />
                <TruncatedCell value={asset.modifiedTime} mono />
                <StatusBadge status={asset.status} />
                <TruncatedCell value={asset.unsupportedReason} />
                <TruncatedCell value={asset.blockedReason} />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white px-4 py-6 text-sm text-slate-500">
            cleanup candidates はありません。
          </div>
        )}
      </div>
    </div>
  );
}

function PreflightAssetList({
  title,
  assets,
  emptyMessage,
}: {
  title: string;
  assets: MockCleanupAsset[];
  emptyMessage: string;
}) {
  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-slate-200 p-3">
      <p className="font-medium text-slate-900">{title}</p>
      {assets.length > 0 ? (
        <div className="mt-2 max-w-full overflow-x-auto">
          <div className="min-w-[156rem] space-y-2 pr-1">
            {assets.map((asset) => (
              <PreflightAssetSummary key={asset.assetFileId} asset={asset} />
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{emptyMessage}</p>
      )}
    </div>
  );
}

function PreflightAssetSummary({ asset }: { asset: MockCleanupAsset }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TruncatedCell value={asset.assetName} strong />
        <StatusBadge status={asset.status} />
      </div>
      <dl className="mt-2 grid gap-2" style={preflightSummaryGridStyle}>
        <SummaryRow label="type" value={asset.assetType} mono />
        <SummaryRow label="assetFileId" value={asset.assetFileId} mono />
        <SummaryRow label="mimeType" value={asset.mimeType} mono />
        <SummaryRow label="durationMs" value={asset.durationMs} mono />
        <SummaryRow label="size" value={asset.size} mono />
        <SummaryRow label="references" value={asset.references} mono />
        <SummaryRow label="unsupported" value={asset.unsupportedReason} />
        <SummaryRow label="blocked" value={asset.blockedReason} />
      </dl>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  subtle = false,
}: {
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <div
      className={
        subtle
          ? "rounded-lg border border-slate-200 bg-slate-50 p-2"
          : "rounded-lg border border-white/10 bg-white p-2 text-slate-950"
      }
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-1 truncate text-slate-900 ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function TruncatedCell({
  value,
  mono = false,
  strong = false,
}: {
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <p
      className={`min-w-0 truncate text-slate-900 ${mono ? "font-mono text-xs" : ""} ${strong ? "font-medium" : ""}`}
      title={value}
    >
      {value}
    </p>
  );
}

function StatusBadge({ status }: { status: MockCleanupAsset["status"] }) {
  const variant =
    status === "eligible"
      ? "default"
      : status === "blocked"
        ? "destructive"
        : "secondary";

  return <Badge variant={variant}>{status}</Badge>;
}
