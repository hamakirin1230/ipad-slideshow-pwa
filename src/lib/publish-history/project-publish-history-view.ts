import type {
  ProjectPublishOperation,
  ProjectPublishRevision,
} from "./project-publish-revision";
import type { ProjectPublicationOverview } from "./project-publish-history-overview";

export function formatPublishOperation(
  operation: ProjectPublishOperation | null | undefined,
) {
  if (operation === "publish") return "公開";
  if (operation === "rollback") return "ロールバック";
  return "不明";
}

export function formatMetadataStatus(status: "ready" | "invalid") {
  return status === "ready" ? "有効" : "要確認";
}

export type ProjectPublishRevisionPublicationMarker =
  | "current"
  | "needsInspection"
  | "history";

export function getRevisionPublicationMarker(
  publication: ProjectPublicationOverview | null,
  revisionId: string,
): ProjectPublishRevisionPublicationMarker {
  if (!publication || publication.currentRevisionId !== revisionId) {
    return "history";
  }
  if (publication.currentRevisionMarker === "verified") return "current";
  if (publication.currentRevisionMarker === "needsInspection") {
    return "needsInspection";
  }
  return "history";
}

export function formatRevisionPublicationMarker(
  marker: ProjectPublishRevisionPublicationMarker,
) {
  if (marker === "current") return "現在公開中";
  if (marker === "needsInspection") return "プロジェクト設定の参照先・要確認";
  return "過去の公開版";
}

export function formatPublicationStatus(
  status: ProjectPublicationOverview["status"],
) {
  switch (status) {
    case "unpublished":
      return "未公開";
    case "current":
      return "現在公開中";
    case "currentWithUnpublishedChanges":
      return "現在公開中・未公開編集あり";
    case "missingCurrentRevision":
    case "inconsistent":
    case "unavailable":
      return "現在の公開情報を確認できない";
    case "noPublicationWithHistory":
      return "現在の公開情報なし・公開履歴あり";
  }
}

export function formatPublishedAt(value: string | null | undefined) {
  if (!value) return "不明";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "不明";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

export function formatAssetSize(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) {
    return "不明";
  }
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(1)} ${units[unitIndex]}`;
}

export function mapPublishHistoryErrorCode(code: string | null | undefined) {
  switch (code) {
    case "duplicateHistoryFolder":
      return "公開履歴フォルダが重複しています。自動選択は行いません。";
    case "duplicateRevisionsFolder":
      return "公開履歴の保存場所が重複しています。自動選択は行いません。";
    case "invalidHistoryFolder":
      return "公開履歴フォルダの構成が正しくありません。";
    case "invalidRevisionsFolder":
      return "公開履歴の保存場所の構成が正しくありません。";
    case "duplicateRevision":
      return "同じ公開履歴が重複しています。";
    case "invalidMetadata":
      return "公開履歴ファイルの情報が正しくありません。";
    case "invalidJson":
    case "invalidRevision":
    case "metadataBodyMismatch":
      return "公開履歴データが正しくありません。";
    case "notFound":
      return "公開履歴が見つかりません。";
    case "driveReadFailed":
    default:
      return "Google Driveから公開履歴を読み込めませんでした。";
  }
}

export type ProjectPublishRevisionDetailViewModel = {
  revisionId: string;
  publishedAt: string;
  operation: string;
  restoredFromRevisionId: string | null;
  previousRevisionId: string | null;
  schemaVersion: number;
  sourceManifestModifiedTime: string;
  summary: {
    slideCount: number;
    assetCount: number;
    remoteOnlyAssetCount: number;
  };
  slides: Array<{
    order: number;
    slideId: string;
    assetId: string;
    assetName: string;
    type: "image" | "video";
    caption: string;
    durationSeconds: number;
    remoteOnly: boolean;
  }>;
  assets: Array<{
    assetId: string;
    mimeType: string;
    size: string;
    modifiedTime: string;
    checksumAvailable: boolean;
    remoteOnly: boolean;
  }>;
};

export function buildRevisionDetailViewModel(
  revision: ProjectPublishRevision,
): ProjectPublishRevisionDetailViewModel {
  const assetById = new Map(revision.assets.map((asset) => [asset.assetId, asset]));
  return {
    revisionId: revision.revisionId,
    publishedAt: formatPublishedAt(revision.publishedAt),
    operation: formatPublishOperation(revision.operation),
    restoredFromRevisionId: revision.restoredFromRevisionId ?? null,
    previousRevisionId: revision.previousRevisionId,
    schemaVersion: revision.schemaVersion,
    sourceManifestModifiedTime: formatPublishedAt(
      revision.sourceManifestModifiedTime,
    ),
    summary: { ...revision.summary },
    slides: revision.manifest.slides.map((slide, index) => ({
      order: index + 1,
      slideId: slide.slideId,
      assetId: slide.assetId,
      assetName: slide.assetName,
      type: slide.type ?? "image",
      caption: slide.caption,
      durationSeconds: slide.durationSeconds,
      remoteOnly: assetById.get(slide.assetId)?.remoteOnly ?? false,
    })),
    assets: revision.assets.map((asset) => ({
      assetId: asset.assetId,
      mimeType: asset.mimeType,
      size: formatAssetSize(asset.sizeBytes),
      modifiedTime: formatPublishedAt(asset.modifiedTime),
      checksumAvailable: asset.checksum !== null,
      remoteOnly: asset.remoteOnly,
    })),
  };
}
