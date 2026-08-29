import {
  getDriveVideoStorageDisposition,
  isSupportedDriveVideoMimeType,
} from "../drive-video-policy";
import {
  buildDriveProjectAssetStorageFilename,
  type DriveFileCandidate,
  type DriveSlideSummary,
  type ProjectManifest,
} from "../google-drive";
import {
  getProjectManifestContentCanonicalHash,
  type ProjectPublishRevision,
} from "./project-publish-revision";

export type ProjectRollbackAssetImpactStatus =
  | "unchanged"
  | "metadataChanged"
  | "contentChanged"
  | "unverifiable"
  | "unavailable";

export type ProjectRollbackOfflineDisposition =
  | "offlineEligible"
  | "remoteOnly"
  | "unavailable";

export type ProjectRollbackPreviewReadiness =
  | "ready"
  | "degraded"
  | "blocked"
  | "noChange";

export type ProjectRollbackAssetPreview = {
  assetId: string;
  displayName: string;
  mimeType: string;
  impactStatus: ProjectRollbackAssetImpactStatus;
  offlineDisposition: ProjectRollbackOfflineDisposition;
  sanitizedReasons: string[];
};

export type ProjectRollbackManifestImpact = {
  currentProjectTitle: string;
  rollbackProjectTitle: string;
  titleChanged: boolean;
  currentSlideCount: number;
  rollbackSlideCount: number;
  currentUniqueAssetCount: number;
  rollbackUniqueAssetCount: number;
  rollbackOfflineEligibleAssetCount: number;
  rollbackRemoteOnlyAssetCount: number;
  unavailableAssetCount: number;
  contentChangedAssetCount: number;
  unverifiableAssetCount: number;
  metadataChangedAssetCount: number;
  hasUnpublishedChanges: boolean;
  addedSlideCount: number;
  removedSlideCount: number;
  changedSlideCount: number;
  slideOrderChanged: boolean;
};

export type ProjectRollbackPreview = {
  readiness: ProjectRollbackPreviewReadiness;
  checkedAt: string;
  targetRevisionId: string;
  targetPublishedAt: string;
  targetOperation: "publish" | "rollback";
  restoredFromRevisionId: string | null;
  replacesUnpublishedChanges: boolean;
  message: string;
  warnings: string[];
  manifestImpact: ProjectRollbackManifestImpact;
  assets: ProjectRollbackAssetPreview[];
};

export type ProjectRollbackPreviewOwner = {
  projectId: string;
  targetRevisionId: string;
};

export type ProjectRollbackFreshAsset =
  | { assetId: string; metadata: DriveFileCandidate }
  | { assetId: string; metadata: null };

export function isCurrentProjectRollbackPreviewRequest(input: {
  owner: ProjectRollbackPreviewOwner;
  activeOwner: ProjectRollbackPreviewOwner | null;
  sequence: number;
  activeSequence: number;
  currentProjectId: string | null;
  currentTargetRevisionId: string | null;
  aborted: boolean;
}) {
  return (
    !input.aborted &&
    input.sequence === input.activeSequence &&
    input.activeOwner?.projectId === input.owner.projectId &&
    input.activeOwner.targetRevisionId === input.owner.targetRevisionId &&
    input.currentProjectId === input.owner.projectId &&
    input.currentTargetRevisionId === input.owner.targetRevisionId
  );
}

export function buildProjectRollbackPreview(input: {
  checkedAt: string;
  workspaceId: string;
  projectId: string;
  assetsFolderId: string;
  currentManifest: ProjectManifest;
  currentRevision: ProjectPublishRevision;
  targetRevision: ProjectPublishRevision;
  freshAssets: readonly ProjectRollbackFreshAsset[];
}): ProjectRollbackPreview {
  const targetSlidesByAsset = groupTargetSlidesByAsset(
    input.targetRevision.manifest.slides,
  );
  const freshByAssetId = new Map(
    input.freshAssets.map((asset) => [asset.assetId, asset.metadata]),
  );
  const assets = input.targetRevision.assets.map((savedAsset) => {
    const slides = targetSlidesByAsset.get(savedAsset.assetId) ?? [];
    return classifyRollbackAsset({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      assetsFolderId: input.assetsFolderId,
      savedAsset,
      slides,
      freshMetadata: freshByAssetId.get(savedAsset.assetId) ?? null,
    });
  });

  const hasUnpublishedChanges =
    getProjectManifestContentCanonicalHash(input.currentManifest) !==
    input.currentRevision.sourceManifestCanonicalHash;
  const slideImpact = compareRollbackSlides(
    input.currentManifest.slides,
    input.targetRevision.manifest.slides,
  );
  const statusCounts = countAssetStatuses(assets);
  const titleChanged =
    input.currentManifest.title !== input.targetRevision.manifest.title;
  const playbackContentIsSame =
    !titleChanged &&
    slideImpact.addedSlideCount === 0 &&
    slideImpact.removedSlideCount === 0 &&
    slideImpact.changedSlideCount === 0 &&
    !slideImpact.slideOrderChanged;
  const hasBlockingAsset =
    statusCounts.unavailable > 0 || statusCounts.contentChanged > 0;
  const hasDegradedAsset =
    statusCounts.metadataChanged > 0 || statusCounts.unverifiable > 0;

  const readiness: ProjectRollbackPreviewReadiness =
    hasBlockingAsset
      ? "blocked"
      : hasDegradedAsset
        ? "degraded"
        : playbackContentIsSame && !hasUnpublishedChanges
          ? "noChange"
          : "ready";
  const warnings: string[] = [];
  if (hasUnpublishedChanges) {
    warnings.push(
      "現在のmanifestには公開後に保存された未公開編集があります。将来rollbackを実行すると、その内容はtarget revisionの内容で置き換えられます。",
    );
  }
  if (assets.some((asset) => asset.offlineDisposition === "remoteOnly")) {
    warnings.push(
      "remoteOnly動画はonlineかつGoogle接続済みの場合だけDrive streamingで再生されます。offlineでは利用できません。",
    );
  }
  if (playbackContentIsSame && hasUnpublishedChanges) {
    warnings.push("公開後に保存された未公開編集が置き換えられます。");
  }

  return {
    readiness,
    checkedAt: input.checkedAt,
    targetRevisionId: input.targetRevision.revisionId,
    targetPublishedAt: input.targetRevision.publishedAt,
    targetOperation: input.targetRevision.operation,
    restoredFromRevisionId:
      input.targetRevision.restoredFromRevisionId ?? null,
    replacesUnpublishedChanges: hasUnpublishedChanges,
    message: readinessMessage(readiness),
    warnings,
    manifestImpact: {
      currentProjectTitle: input.currentManifest.title,
      rollbackProjectTitle: input.targetRevision.manifest.title,
      titleChanged,
      currentSlideCount: input.currentManifest.slides.length,
      rollbackSlideCount: input.targetRevision.manifest.slides.length,
      currentUniqueAssetCount: countUniqueAssets(input.currentManifest.slides),
      rollbackUniqueAssetCount: input.targetRevision.assets.length,
      rollbackOfflineEligibleAssetCount: assets.filter(
        (asset) => asset.offlineDisposition === "offlineEligible",
      ).length,
      rollbackRemoteOnlyAssetCount: assets.filter(
        (asset) => asset.offlineDisposition === "remoteOnly",
      ).length,
      unavailableAssetCount: statusCounts.unavailable,
      contentChangedAssetCount: statusCounts.contentChanged,
      unverifiableAssetCount: statusCounts.unverifiable,
      metadataChangedAssetCount: statusCounts.metadataChanged,
      hasUnpublishedChanges,
      ...slideImpact,
    },
    assets,
  };
}

function classifyRollbackAsset(input: {
  workspaceId: string;
  projectId: string;
  assetsFolderId: string;
  savedAsset: ProjectPublishRevision["assets"][number];
  slides: DriveSlideSummary[];
  freshMetadata: DriveFileCandidate | null;
}): ProjectRollbackAssetPreview {
  const displayName =
    input.slides[0]?.assetName?.trim() || "名称不明のasset";
  const unavailableReasons = validateAssetIdentity(input);
  if (unavailableReasons.length > 0) {
    return assetPreview(
      input.savedAsset.assetId,
      displayName,
      input.savedAsset.mimeType,
      "unavailable",
      "unavailable",
      unavailableReasons,
    );
  }

  const metadata = input.freshMetadata as DriveFileCandidate;
  const sizeBytes = metadata.sizeBytes ?? null;
  const offlineDisposition = deriveOfflineDisposition(
    metadata.mimeType,
    sizeBytes,
  );
  if (!isSupportedRollbackMime(metadata.mimeType)) {
    return assetPreview(
      input.savedAsset.assetId,
      displayName,
      input.savedAsset.mimeType,
      "unavailable",
      "unavailable",
      ["対応していないasset形式です。"],
    );
  }

  const contentReasons: string[] = [];
  if (
    input.savedAsset.sizeBytes !== null &&
    sizeBytes !== null &&
    input.savedAsset.sizeBytes !== sizeBytes
  ) {
    contentReasons.push("保存時と現在でasset sizeが一致しません。");
  }
  if (
    input.savedAsset.checksum !== null &&
    metadata.checksum !== undefined &&
    input.savedAsset.checksum !== metadata.checksum
  ) {
    contentReasons.push("保存時と現在でasset内容の識別情報が一致しません。");
  }
  if (contentReasons.length > 0) {
    return assetPreview(
      input.savedAsset.assetId,
      displayName,
      input.savedAsset.mimeType,
      "contentChanged",
      offlineDisposition,
      contentReasons,
    );
  }

  const unverifiableReasons: string[] = [];
  if (input.savedAsset.checksum === null || metadata.checksum === undefined) {
    unverifiableReasons.push("asset内容の識別情報を完全に確認できません。");
  }
  if (input.savedAsset.sizeBytes === null || sizeBytes === null) {
    unverifiableReasons.push("asset sizeを完全に確認できません。");
  }
  if (
    input.savedAsset.modifiedTime === null ||
    metadata.modifiedTime === undefined
  ) {
    unverifiableReasons.push("asset更新日時を完全に確認できません。");
  }
  if (
    input.savedAsset.checksum === null &&
    input.savedAsset.modifiedTime !== null &&
    metadata.modifiedTime !== undefined &&
    input.savedAsset.modifiedTime !== metadata.modifiedTime
  ) {
    unverifiableReasons.push(
      "checksumがないため、更新日時の差が内容へ与える影響を確定できません。",
    );
  }
  const savedDisposition: ProjectRollbackOfflineDisposition =
    input.savedAsset.remoteOnly ? "remoteOnly" : "offlineEligible";
  if (
    savedDisposition !== offlineDisposition &&
    unverifiableReasons.length > 0
  ) {
    unverifiableReasons.push(
      "offlineでの利用区分が保存時から変更または確認不能になっています。",
    );
  }
  if (unverifiableReasons.length > 0) {
    return assetPreview(
      input.savedAsset.assetId,
      displayName,
      input.savedAsset.mimeType,
      "unverifiable",
      offlineDisposition,
      unverifiableReasons,
    );
  }

  const metadataReasons: string[] = [];
  const expectedStorageFilename = buildDriveProjectAssetStorageFilename({
    assetId: input.savedAsset.assetId,
    mimeType: input.savedAsset.mimeType,
  });
  if (expectedStorageFilename === null) {
    return assetPreview(
      input.savedAsset.assetId,
      displayName,
      input.savedAsset.mimeType,
      "unavailable",
      "unavailable",
      ["対応していないasset形式です。"],
    );
  }
  if (metadata.name !== expectedStorageFilename) {
    metadataReasons.push("asset名が保存時から変更されています。");
  }
  if (input.savedAsset.modifiedTime !== metadata.modifiedTime) {
    metadataReasons.push("asset更新日時が保存時から変更されています。");
  }
  if (savedDisposition !== offlineDisposition) {
    metadataReasons.push("offlineでの利用区分が保存時から変更されています。");
  }
  if (metadataReasons.length > 0) {
    return assetPreview(
      input.savedAsset.assetId,
      displayName,
      input.savedAsset.mimeType,
      "metadataChanged",
      offlineDisposition,
      metadataReasons,
    );
  }

  return assetPreview(
    input.savedAsset.assetId,
    displayName,
    input.savedAsset.mimeType,
    "unchanged",
    offlineDisposition,
    ["保存時と現在のasset metadataは一致しています。"],
  );
}

function validateAssetIdentity(input: {
  workspaceId: string;
  projectId: string;
  assetsFolderId: string;
  savedAsset: ProjectPublishRevision["assets"][number];
  slides: DriveSlideSummary[];
  freshMetadata: DriveFileCandidate | null;
}) {
  const reasons: string[] = [];
  const metadata = input.freshMetadata;
  if (!metadata) return ["assetをGoogle Driveで確認できませんでした。"];
  if (metadata.trashed !== false) {
    reasons.push("assetの削除状態を正常として確認できません。");
  }
  if (metadata.id !== input.savedAsset.driveFileId) {
    reasons.push("assetのDrive参照がrevisionと一致しません。");
  }
  if (
    metadata.parents?.length !== 1 ||
    metadata.parents[0] !== input.assetsFolderId
  ) {
    reasons.push("assetは選択projectのassets folderにありません。");
  }
  if (
    metadata.appProperties.app !== "ipad-slideshow-pwa" ||
    metadata.appProperties.role !== "asset" ||
    metadata.appProperties.schemaVersion !== "1" ||
    metadata.appProperties.workspaceId !== input.workspaceId ||
    metadata.appProperties.projectId !== input.projectId ||
    metadata.appProperties.assetId !== input.savedAsset.assetId
  ) {
    reasons.push("assetの正式metadata規則が一致しません。");
  }
  if (
    metadata.mimeType !== input.savedAsset.mimeType ||
    input.slides.some(
      (slide) =>
        slide.assetFileId !== input.savedAsset.driveFileId ||
        slide.mimeType !== input.savedAsset.mimeType,
    )
  ) {
    reasons.push("assetのMIME typeまたはrevision参照が一致しません。");
  }
  return reasons;
}

function deriveOfflineDisposition(
  mimeType: string,
  sizeBytes: number | null,
): ProjectRollbackOfflineDisposition {
  if (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  ) {
    return "offlineEligible";
  }
  const disposition = getDriveVideoStorageDisposition({
    mimeType,
    sizeBytes,
  });
  return disposition === "unsupported" ? "unavailable" : disposition;
}

function isSupportedRollbackMime(mimeType: string) {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp" ||
    isSupportedDriveVideoMimeType(mimeType)
  );
}

function compareRollbackSlides(
  currentSlides: readonly DriveSlideSummary[],
  targetSlides: readonly DriveSlideSummary[],
) {
  const currentById = new Map(
    currentSlides.map((slide) => [slide.slideId, slide]),
  );
  const targetById = new Map(
    targetSlides.map((slide) => [slide.slideId, slide]),
  );
  const addedSlideCount = targetSlides.filter(
    (slide) => !currentById.has(slide.slideId),
  ).length;
  const removedSlideCount = currentSlides.filter(
    (slide) => !targetById.has(slide.slideId),
  ).length;
  const changedSlideCount = targetSlides.filter((target) => {
    const current = currentById.get(target.slideId);
    return current
      ? JSON.stringify(playbackSlideContent(current)) !==
          JSON.stringify(playbackSlideContent(target))
      : false;
  }).length;
  const currentCommonOrder = currentSlides
    .filter((slide) => targetById.has(slide.slideId))
    .map((slide) => slide.slideId);
  const targetCommonOrder = targetSlides
    .filter((slide) => currentById.has(slide.slideId))
    .map((slide) => slide.slideId);
  const slideOrderChanged =
    JSON.stringify(currentCommonOrder) !== JSON.stringify(targetCommonOrder);
  return {
    addedSlideCount,
    removedSlideCount,
    changedSlideCount,
    slideOrderChanged,
  };
}

function playbackSlideContent(slide: DriveSlideSummary) {
  return {
    assetId: slide.assetId,
    assetFileId: slide.assetFileId,
    assetName: slide.assetName,
    type: slide.type ?? "image",
    mimeType: slide.mimeType,
    durationSeconds: slide.durationSeconds,
    caption: slide.caption,
    imageEdit: slide.imageEdit ?? null,
    durationMs: slide.durationMs ?? null,
  };
}

function groupTargetSlidesByAsset(slides: readonly DriveSlideSummary[]) {
  const grouped = new Map<string, DriveSlideSummary[]>();
  for (const slide of slides) {
    const existing = grouped.get(slide.assetId) ?? [];
    existing.push(slide);
    grouped.set(slide.assetId, existing);
  }
  return grouped;
}

function countUniqueAssets(slides: readonly DriveSlideSummary[]) {
  return new Set(slides.map((slide) => slide.assetId)).size;
}

function countAssetStatuses(assets: readonly ProjectRollbackAssetPreview[]) {
  return {
    metadataChanged: assets.filter(
      (asset) => asset.impactStatus === "metadataChanged",
    ).length,
    contentChanged: assets.filter(
      (asset) => asset.impactStatus === "contentChanged",
    ).length,
    unverifiable: assets.filter(
      (asset) => asset.impactStatus === "unverifiable",
    ).length,
    unavailable: assets.filter(
      (asset) => asset.impactStatus === "unavailable",
    ).length,
  };
}

function assetPreview(
  assetId: string,
  displayName: string,
  mimeType: string,
  impactStatus: ProjectRollbackAssetImpactStatus,
  offlineDisposition: ProjectRollbackOfflineDisposition,
  sanitizedReasons: string[],
): ProjectRollbackAssetPreview {
  return {
    assetId,
    displayName,
    mimeType,
    impactStatus,
    offlineDisposition,
    sanitizedReasons,
  };
}

function readinessMessage(readiness: ProjectRollbackPreviewReadiness) {
  switch (readiness) {
    case "ready":
      return "rollback対象の内容とassetを確認できました。";
    case "degraded":
      return "rollback対象は確認できましたが、完全な同一性を確認できないassetがあります。この状態を自動的に実行可能とは扱いません。";
    case "blocked":
      return "変更済みまたは利用できないassetがあるため、rollback対象として使用できません。";
    case "noChange":
      return "現在公開中の内容と同じため、rollbackによる再生内容の変更はありません。";
  }
}
