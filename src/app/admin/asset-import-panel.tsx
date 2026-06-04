"use client";

import { Badge } from "@/components/ui/badge";
import { useAppState } from "@/app/app-providers";

export function AssetImportPanel() {
  const {
    assetImportStatus,
    assetImportStatusLabel,
    assetImportMessage,
    assetImportDiagnostics,
    canImportAssets,
  } = useAppState();

  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-900">素材追加準備状態</p>
        <Badge variant={canImportAssets ? "secondary" : "outline"}>
          {assetImportStatusLabel}
        </Badge>
      </div>

      <p className="mt-3">{assetImportMessage}</p>

      <p className="mt-3 text-slate-500">
        第4-3-1では、Google Photos Picker連携、Photos権限要求、Drive
        assets/ への保存、manifest.json.slides への追加はまだ実行しません。
      </p>

      {assetImportDiagnostics.length > 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="font-medium text-slate-900">素材追加診断</p>
          <div className="mt-2 space-y-1">
            {assetImportDiagnostics.map((diagnostic) => (
              <p key={diagnostic}>・{diagnostic}</p>
            ))}
          </div>
        </div>
      ) : null}

      <p className="sr-only">現在の素材追加状態: {assetImportStatus}</p>
    </div>
  );
}