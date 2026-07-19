import { DRIVE_VIDEO_OFFLINE_MAX_BYTES } from "../drive-video-policy";
import {
  parseProjectManifest,
  type ProjectManifest,
} from "../google-drive";
import type { ProjectPublishRevisionListItem } from "./project-publish-revision-loader";
import {
  isValidProjectPublishIsoDateTime,
  isValidProjectPublishOperationId,
} from "./project-publish-operation-id";
import {
  PROJECT_PUBLISH_REVISION_SCHEMA_VERSION,
  deriveProjectPublishRevisionSummary,
  getProjectManifestCanonicalHash,
  isValidProjectPublishRevisionId,
  parseProjectPublishRevision,
  type ProjectPublishAssetReference,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import {
  buildProjectPublishWritePlan,
  type ProjectPublishExpectedCurrentState,
  type ProjectPublishHistoryStatus,
  type ProjectPublishWritePlan,
} from "./project-publish-write-plan";

export {
  createProjectPublishOperationId,
  isValidProjectPublishOperationId,
} from "./project-publish-operation-id";
export {
  buildProjectPublishRevisionAppProperties,
  buildProjectPublishWritePlan,
} from "./project-publish-write-plan";
export type {
  ProjectManifestPublicationMetadata,
  ProjectPublishExpectedCurrentState,
  ProjectPublishHistoryStatus,
  ProjectPublishWritePlan,
  ProjectPublishWriteStep,
} from "./project-publish-write-plan";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/;

export type ProjectPublishAssetMetadataInput = {
  assetId: string;
  driveFileId: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  checksum: string | null;
  remoteOnly: boolean;
  trashed: boolean;
  role: "asset";
  workspaceId: string;
  projectId: string;
};

export type ProjectPublishPreflightInput = {
  projectId: string;
  workspaceId: string;
  checkedAt: string;
  publishedAt: string;
  revisionId: string;
  operationId: string;
  manifest: ProjectManifest;
  sourceManifest: {
    modifiedTime: string;
    canonicalHash: string;
    currentRevisionId: string | null;
  };
  expectedCurrent: ProjectPublishExpectedCurrentState;
  latestPublishedRevision:
    | Pick<
        ProjectPublishRevisionListItem,
        "revisionId" | "publishedAt" | "metadataStatus"
      >
    | null;
  historyStatus: ProjectPublishHistoryStatus;
  assets: ProjectPublishAssetMetadataInput[];
};

export type ProjectPublishPreflightIssueCode =
  | "invalidProjectId"
  | "invalidWorkspaceId"
  | "invalidCheckedAt"
  | "invalidPublishedAt"
  | "invalidRevisionId"
  | "invalidOperationId"
  | "invalidManifest"
  | "manifestProjectMismatch"
  | "manifestWorkspaceMismatch"
  | "invalidSourceManifestState"
  | "invalidExpectedCurrentState"
  | "manifestHashMismatch"
  | "manifestModifiedTimeMismatch"
  | "missingAssetMetadata"
  | "unexpectedAssetMetadata"
  | "duplicateAssetId"
  | "duplicateDriveFileReference"
  | "trashedAsset"
  | "invalidAssetMetadata"
  | "remoteOnlyMismatch"
  | "historyStateInvalid"
  | "latestRevisionInvalid"
  | "previousRevisionSelfReference"
  | "currentRevisionConflict"
  | "publishedAtBeforePreviousRevision"
  | "revisionBuildFailed"
  | "missingAssetChecksum"
  | "missingAssetSize"
  | "missingAssetModifiedTime"
  | "historyNotConfigured"
  | "remoteOnlyAsset"
  | "publishedAtMatchesPreviousRevision";

export type ProjectPublishPreflightIssue = {
  code: ProjectPublishPreflightIssueCode;
  severity: "error" | "warning";
  path?: string;
  message: string;
};

export type ProjectPublishPreflightSummary = {
  initialPublish: boolean;
  revisionId: string;
  previousRevisionId: string | null;
  slideCount: number;
  assetCount: number;
  remoteOnlyAssetCount: number;
  warningCount: number;
};

export type ProjectPublishPreflightResult =
  | {
      ok: true;
      checkedAt: string;
      plan: ProjectPublishWritePlan;
      summary: ProjectPublishPreflightSummary;
      warnings: ProjectPublishPreflightIssue[];
    }
  | { ok: false; issues: ProjectPublishPreflightIssue[] };

type ManifestAssetExpectation = {
  assetId: string;
  driveFileId: string;
  mimeType: string;
  assetType: "image" | "video";
  fileSize: number | null;
};

export function buildProjectPublishRevisionDraft(input: {
  projectId: string;
  publishedAt: string;
  revisionId: string;
  manifest: ProjectManifest;
  sourceManifestModifiedTime: string;
  sourceManifestCanonicalHash: string;
  previousRevisionId: string | null;
  assets: readonly ProjectPublishAssetReference[];
}): ProjectPublishRevision {
  const manifestResult = parseProjectManifest(input.manifest);
  if (!manifestResult.ok) {
    throw new TypeError("manifest must pass project manifest validation");
  }

  const manifest = manifestResult.value;
  const canonicalHash = getProjectManifestCanonicalHash(manifest);
  if (canonicalHash !== input.sourceManifestCanonicalHash) {
    throw new TypeError("source manifest canonical hash must match manifest");
  }

  const assets = input.assets
    .map((asset) => ({ ...asset }))
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
  const candidate: ProjectPublishRevision = {
    schemaVersion: PROJECT_PUBLISH_REVISION_SCHEMA_VERSION,
    revisionId: input.revisionId,
    projectId: input.projectId,
    publishedAt: input.publishedAt,
    operation: "publish",
    sourceManifestModifiedTime: input.sourceManifestModifiedTime,
    sourceManifestCanonicalHash: canonicalHash,
    previousRevisionId: input.previousRevisionId,
    summary: deriveProjectPublishRevisionSummary(manifest, assets),
    assets,
    manifest,
  };
  const parsed = parseProjectPublishRevision(candidate);
  if (!parsed.ok) {
    throw new TypeError("publish revision draft failed validation");
  }
  return parsed.value;
}

export function runProjectPublishPreflight(
  input: ProjectPublishPreflightInput,
): ProjectPublishPreflightResult {
  const issues: ProjectPublishPreflightIssue[] = [];
  const warnings: ProjectPublishPreflightIssue[] = [];

  validateIdentityAndTime(input, issues);
  const manifest = validateManifestAndCurrentState(input, issues);
  const previousRevisionId = validateHistory(input, issues, warnings);
  const assets = manifest
    ? validateAssets(input, manifest, issues, warnings)
    : [];

  if (issues.length > 0 || !manifest || previousRevisionId === undefined) {
    return { ok: false, issues };
  }

  let revision: ProjectPublishRevision;
  try {
    revision = buildProjectPublishRevisionDraft({
      projectId: input.projectId,
      publishedAt: input.publishedAt,
      revisionId: input.revisionId,
      manifest,
      sourceManifestModifiedTime: input.sourceManifest.modifiedTime,
      sourceManifestCanonicalHash: input.sourceManifest.canonicalHash,
      previousRevisionId,
      assets,
    });
  } catch {
    return {
      ok: false,
      issues: [
        issue(
          "revisionBuildFailed",
          "error",
          "公開履歴の作成計画を生成できませんでした。",
          "revision",
        ),
      ],
    };
  }

  const plan = buildProjectPublishWritePlan({
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    checkedAt: input.checkedAt,
    historyStatus: input.historyStatus,
    expectedCurrent: input.expectedCurrent,
    revision,
  });

  return {
    ok: true,
    checkedAt: input.checkedAt,
    plan,
    summary: {
      initialPublish: plan.initialPublish,
      revisionId: revision.revisionId,
      previousRevisionId: revision.previousRevisionId,
      ...revision.summary,
      warningCount: warnings.length,
    },
    warnings,
  };
}

function validateIdentityAndTime(
  input: ProjectPublishPreflightInput,
  issues: ProjectPublishPreflightIssue[],
) {
  if (!isUuidV4(input.projectId)) {
    issues.push(
      issue("invalidProjectId", "error", "公開対象のprojectIdが正しくありません。", "projectId"),
    );
  }
  if (!isUuidV4(input.workspaceId)) {
    issues.push(
      issue(
        "invalidWorkspaceId",
        "error",
        "公開対象のworkspaceIdが正しくありません。",
        "workspaceId",
      ),
    );
  }
  if (!isValidProjectPublishIsoDateTime(input.checkedAt)) {
    issues.push(
      issue("invalidCheckedAt", "error", "事前確認日時が正しくありません。", "checkedAt"),
    );
  }
  if (!isValidProjectPublishIsoDateTime(input.publishedAt)) {
    issues.push(
      issue("invalidPublishedAt", "error", "公開日時が正しくありません。", "publishedAt"),
    );
  }
  if (!isValidProjectPublishRevisionId(input.revisionId)) {
    issues.push(
      issue("invalidRevisionId", "error", "公開履歴の識別子が正しくありません。", "revisionId"),
    );
  }
  if (!isValidProjectPublishOperationId(input.operationId)) {
    issues.push(
      issue("invalidOperationId", "error", "公開操作の識別子が正しくありません。", "operationId"),
    );
  }
}

function validateManifestAndCurrentState(
  input: ProjectPublishPreflightInput,
  issues: ProjectPublishPreflightIssue[],
): ProjectManifest | null {
  const manifestResult = parseProjectManifest(input.manifest);
  if (!manifestResult.ok) {
    issues.push(
      issue("invalidManifest", "error", "現在のマニフェストが正しくありません。", "manifest"),
    );
    return null;
  }

  const manifest = manifestResult.value;
  if (manifest.projectId !== input.projectId) {
    issues.push(
      issue(
        "manifestProjectMismatch",
        "error",
        "マニフェストのprojectが公開対象と一致しません。",
        "manifest.projectId",
      ),
    );
  }
  if (manifest.workspaceId !== input.workspaceId) {
    issues.push(
      issue(
        "manifestWorkspaceMismatch",
        "error",
        "マニフェストのworkspaceが公開対象と一致しません。",
        "manifest.workspaceId",
      ),
    );
  }

  const sourceStateValid =
    isValidProjectPublishIsoDateTime(input.sourceManifest.modifiedTime) &&
    CANONICAL_HASH_PATTERN.test(input.sourceManifest.canonicalHash) &&
    isNullableRevisionId(input.sourceManifest.currentRevisionId);
  if (!sourceStateValid) {
    issues.push(
      issue(
        "invalidSourceManifestState",
        "error",
        "現在のマニフェスト状態を確認できません。",
        "sourceManifest",
      ),
    );
  }

  const expectedStateValid =
    isValidProjectPublishIsoDateTime(
      input.expectedCurrent.manifestModifiedTime,
    ) &&
    CANONICAL_HASH_PATTERN.test(input.expectedCurrent.manifestCanonicalHash) &&
    isNullableRevisionId(input.expectedCurrent.currentRevisionId);
  if (!expectedStateValid) {
    issues.push(
      issue(
        "invalidExpectedCurrentState",
        "error",
        "公開前に期待するcurrent状態が正しくありません。",
        "expectedCurrent",
      ),
    );
  }

  if (sourceStateValid) {
    const canonicalHash = getProjectManifestCanonicalHash(manifest);
    if (canonicalHash !== input.sourceManifest.canonicalHash) {
      issues.push(
        issue(
          "manifestHashMismatch",
          "error",
          "現在のマニフェスト本文が事前確認情報と一致しません。",
          "sourceManifest.canonicalHash",
        ),
      );
    }
  }
  if (
    sourceStateValid &&
    expectedStateValid &&
    input.sourceManifest.canonicalHash !==
      input.expectedCurrent.manifestCanonicalHash
  ) {
    issues.push(
      issue(
        "manifestHashMismatch",
        "error",
        "現在のマニフェストが事前確認時から変更されています。",
        "expectedCurrent.manifestCanonicalHash",
      ),
    );
  }
  if (
    sourceStateValid &&
    expectedStateValid &&
    input.sourceManifest.modifiedTime !==
      input.expectedCurrent.manifestModifiedTime
  ) {
    issues.push(
      issue(
        "manifestModifiedTimeMismatch",
        "error",
        "現在のマニフェストが事前確認時から変更されています。",
        "expectedCurrent.manifestModifiedTime",
      ),
    );
  }
  if (
    sourceStateValid &&
    expectedStateValid &&
    input.sourceManifest.currentRevisionId !==
      input.expectedCurrent.currentRevisionId
  ) {
    issues.push(
      issue(
        "currentRevisionConflict",
        "error",
        "現在の公開版が事前確認時から変更されています。",
        "expectedCurrent.currentRevisionId",
      ),
    );
  }

  return manifest;
}

function validateHistory(
  input: ProjectPublishPreflightInput,
  issues: ProjectPublishPreflightIssue[],
  warnings: ProjectPublishPreflightIssue[],
): string | null | undefined {
  if (!isHistoryStatus(input.historyStatus)) {
    issues.push(
      issue(
        "historyStateInvalid",
        "error",
        "公開履歴の状態を確認できません。",
        "historyStatus",
      ),
    );
    return undefined;
  }

  const latest = input.latestPublishedRevision;
  const initialPublish =
    input.historyStatus.status === "notConfigured" ||
    input.historyStatus.validRevisionCount === 0;

  if (initialPublish) {
    if (latest !== null) {
      issues.push(
        issue(
          "historyStateInvalid",
          "error",
          "公開履歴の状態を確認できません。",
          "latestPublishedRevision",
        ),
      );
      return undefined;
    }
    if (input.historyStatus.status === "notConfigured") {
      warnings.push(
        issue(
          "historyNotConfigured",
          "warning",
          "公開履歴を初回公開時に準備する計画です。",
          "historyStatus",
        ),
      );
    }
    return null;
  }

  if (!latest || !isValidLatestRevision(latest)) {
    issues.push(
      issue(
        "latestRevisionInvalid",
        "error",
        "直前の公開履歴を確認できません。",
        "latestPublishedRevision",
      ),
    );
    return undefined;
  }
  if (latest.revisionId === input.revisionId) {
    issues.push(
      issue(
        "previousRevisionSelfReference",
        "error",
        "公開履歴が自分自身を直前の版として参照しています。",
        "latestPublishedRevision.revisionId",
      ),
    );
  }

  if (isValidProjectPublishIsoDateTime(input.publishedAt)) {
    const publishedTime = Date.parse(input.publishedAt);
    const latestTime = Date.parse(latest.publishedAt as string);
    if (publishedTime < latestTime) {
      issues.push(
        issue(
          "publishedAtBeforePreviousRevision",
          "error",
          "公開日時が直前の公開日時より前です。",
          "publishedAt",
        ),
      );
    } else if (publishedTime === latestTime) {
      warnings.push(
        issue(
          "publishedAtMatchesPreviousRevision",
          "warning",
          "公開日時が直前の公開日時と同じです。",
          "publishedAt",
        ),
      );
    }
  }

  return latest.revisionId;
}

function validateAssets(
  input: ProjectPublishPreflightInput,
  manifest: ProjectManifest,
  issues: ProjectPublishPreflightIssue[],
  warnings: ProjectPublishPreflightIssue[],
): ProjectPublishAssetReference[] {
  if (!Array.isArray(input.assets)) {
    issues.push(
      issue(
        "invalidAssetMetadata",
        "error",
        "公開対象のアセット情報が正しくありません。",
        "assets",
      ),
    );
    return [];
  }

  const expectations = collectManifestAssetExpectations(manifest, issues);
  const assetIds = new Set<string>();
  const driveFileIds = new Set<string>();
  const usableAssets = new Map<string, ProjectPublishAssetReference>();

  input.assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    if (!isPlainRecord(asset)) {
      issues.push(
        issue(
          "invalidAssetMetadata",
          "error",
          "公開対象のアセット情報が正しくありません。",
          path,
        ),
      );
      return;
    }

    const assetId = asset.assetId;
    const driveFileId = asset.driveFileId;
    if (typeof assetId === "string") {
      if (assetIds.has(assetId)) {
        issues.push(
          issue(
            "duplicateAssetId",
            "error",
            "公開対象のassetIdが重複しています。",
            `${path}.assetId`,
          ),
        );
      }
      assetIds.add(assetId);
    }
    if (typeof driveFileId === "string") {
      if (driveFileIds.has(driveFileId)) {
        issues.push(
          issue(
            "duplicateDriveFileReference",
            "error",
            "公開対象のDrive file参照が重複しています。",
            `${path}.driveFileId`,
          ),
        );
      }
      driveFileIds.add(driveFileId);
    }

    const structurallyValid = isValidAssetMetadataShape(asset);
    if (!structurallyValid) {
      issues.push(
        issue(
          "invalidAssetMetadata",
          "error",
          "公開対象のアセット情報が正しくありません。",
          path,
        ),
      );
      return;
    }

    const expectation = expectations.get(asset.assetId);
    if (!expectation) {
      issues.push(
        issue(
          "unexpectedAssetMetadata",
          "error",
          "マニフェストから参照されていないアセット情報が含まれています。",
          path,
        ),
      );
      return;
    }

    if (asset.trashed) {
      issues.push(
        issue(
          "trashedAsset",
          "error",
          "公開対象に削除済みのアセットが含まれています。",
          `${path}.trashed`,
        ),
      );
    }
    if (
      asset.role !== "asset" ||
      asset.workspaceId !== input.workspaceId ||
      asset.projectId !== input.projectId ||
      asset.driveFileId !== expectation.driveFileId ||
      asset.mimeType !== expectation.mimeType ||
      (expectation.fileSize !== null &&
        asset.sizeBytes !== null &&
        asset.sizeBytes !== expectation.fileSize) ||
      !mimeMatchesAssetType(asset.mimeType, expectation.assetType)
    ) {
      issues.push(
        issue(
          "invalidAssetMetadata",
          "error",
          "公開対象のアセット情報がマニフェストと一致しません。",
          path,
        ),
      );
    }

    const expectedRemoteOnly =
      expectation.assetType === "video" &&
      asset.mimeType === "video/mp4" &&
      asset.sizeBytes !== null &&
      asset.sizeBytes > DRIVE_VIDEO_OFFLINE_MAX_BYTES;
    if (asset.remoteOnly !== expectedRemoteOnly) {
      issues.push(
        issue(
          "remoteOnlyMismatch",
          "error",
          "アセットのremoteOnly状態が検証済みmetadataと一致しません。",
          `${path}.remoteOnly`,
        ),
      );
    }

    if (asset.sizeBytes === null) {
      warnings.push(
        issue(
          "missingAssetSize",
          "warning",
          "サイズを確認できないアセットが含まれています。",
          `${path}.sizeBytes`,
        ),
      );
    }
    if (asset.modifiedTime === null) {
      warnings.push(
        issue(
          "missingAssetModifiedTime",
          "warning",
          "更新日時を確認できないアセットが含まれています。",
          `${path}.modifiedTime`,
        ),
      );
    }
    if (asset.checksum === null) {
      warnings.push(
        issue(
          "missingAssetChecksum",
          "warning",
          "checksumを確認できないアセットが含まれています。",
          `${path}.checksum`,
        ),
      );
    }
    if (asset.remoteOnly) {
      warnings.push(
        issue(
          "remoteOnlyAsset",
          "warning",
          "remoteOnlyのアセットが含まれています。",
          `${path}.remoteOnly`,
        ),
      );
    }

    usableAssets.set(asset.assetId, {
      assetId: asset.assetId,
      driveFileId: asset.driveFileId,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      modifiedTime: asset.modifiedTime,
      checksum: asset.checksum,
      remoteOnly: asset.remoteOnly,
    });
  });

  for (const expectation of expectations.values()) {
    if (!usableAssets.has(expectation.assetId)) {
      issues.push(
        issue(
          "missingAssetMetadata",
          "error",
          "公開対象のアセット情報が不足しています。",
          "assets",
        ),
      );
    }
  }

  return [...usableAssets.values()];
}

function collectManifestAssetExpectations(
  manifest: ProjectManifest,
  issues: ProjectPublishPreflightIssue[],
) {
  const expectations = new Map<string, ManifestAssetExpectation>();
  const driveFileIds = new Map<string, string>();

  manifest.slides.forEach((slide, index) => {
    const expectation: ManifestAssetExpectation = {
      assetId: slide.assetId,
      driveFileId: slide.assetFileId,
      mimeType: slide.mimeType,
      assetType: slide.type === "video" ? "video" : "image",
      fileSize: typeof slide.fileSize === "number" ? slide.fileSize : null,
    };
    const existing = expectations.get(slide.assetId);
    if (
      existing &&
      (existing.driveFileId !== expectation.driveFileId ||
        existing.mimeType !== expectation.mimeType ||
        existing.assetType !== expectation.assetType ||
        existing.fileSize !== expectation.fileSize)
    ) {
      issues.push(
        issue(
          "invalidManifest",
          "error",
          "同じassetIdのマニフェスト参照が一致しません。",
          `manifest.slides[${index}]`,
        ),
      );
    } else if (!existing) {
      expectations.set(slide.assetId, expectation);
    }

    const existingAssetId = driveFileIds.get(slide.assetFileId);
    if (existingAssetId && existingAssetId !== slide.assetId) {
      issues.push(
        issue(
          "duplicateDriveFileReference",
          "error",
          "複数のassetIdが同じDrive fileを参照しています。",
          `manifest.slides[${index}]`,
        ),
      );
    }
    driveFileIds.set(slide.assetFileId, slide.assetId);
  });

  return expectations;
}

function isValidAssetMetadataShape(
  asset: Record<string, unknown>,
): asset is ProjectPublishAssetMetadataInput {
  return (
    isUuidV4(asset.assetId) &&
    isNonEmptyString(asset.driveFileId) &&
    isNonEmptyString(asset.mimeType) &&
    (asset.sizeBytes === null ||
      (Number.isSafeInteger(asset.sizeBytes) && (asset.sizeBytes as number) >= 0)) &&
    (asset.modifiedTime === null ||
      (typeof asset.modifiedTime === "string" &&
        isValidProjectPublishIsoDateTime(asset.modifiedTime))) &&
    (asset.checksum === null || isNonEmptyString(asset.checksum)) &&
    typeof asset.remoteOnly === "boolean" &&
    typeof asset.trashed === "boolean" &&
    typeof asset.role === "string" &&
    typeof asset.workspaceId === "string" &&
    typeof asset.projectId === "string"
  );
}

function isValidLatestRevision(
  revision: ProjectPublishPreflightInput["latestPublishedRevision"],
): revision is NonNullable<ProjectPublishPreflightInput["latestPublishedRevision"]> & {
  publishedAt: string;
} {
  return (
    revision !== null &&
    revision.metadataStatus === "ready" &&
    isValidProjectPublishRevisionId(revision.revisionId) &&
    typeof revision.publishedAt === "string" &&
    isValidProjectPublishIsoDateTime(revision.publishedAt)
  );
}

function isHistoryStatus(value: unknown): value is ProjectPublishHistoryStatus {
  if (!isPlainRecord(value)) return false;
  if (value.status === "notConfigured") {
    return Object.keys(value).length === 1;
  }
  return (
    value.status === "ready" &&
    Object.keys(value).every(
      (key) => key === "status" || key === "validRevisionCount",
    ) &&
    Number.isSafeInteger(value.validRevisionCount) &&
    (value.validRevisionCount as number) >= 0
  );
}

function isNullableRevisionId(value: unknown): value is string | null {
  return value === null || isValidProjectPublishRevisionId(value);
}

function mimeMatchesAssetType(
  mimeType: string,
  assetType: "image" | "video",
) {
  return mimeType.toLowerCase().startsWith(`${assetType}/`);
}

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  code: ProjectPublishPreflightIssueCode,
  severity: ProjectPublishPreflightIssue["severity"],
  message: string,
  path?: string,
): ProjectPublishPreflightIssue {
  return { code, severity, message, ...(path ? { path } : {}) };
}
