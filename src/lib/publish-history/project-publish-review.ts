import { DRIVE_VIDEO_OFFLINE_MAX_BYTES } from "../drive-video-policy";
import {
  readDriveFileMetadata,
  readDriveTextFile,
  parseProjectManifest,
  type DriveFileCandidate,
  type DriveProjectSummary,
  type ProjectManifest,
} from "../google-drive";
import {
  runProjectPublishPreflight,
  type ProjectPublishAssetMetadataInput,
} from "./project-publish-preflight";
import { createProjectPublishOperationId } from "./project-publish-operation-id";
import { createProjectPublishRevisionId } from "./project-publish-revision-id";
import {
  listProjectPublishRevisions,
  type ListProjectPublishRevisionsResult,
} from "./project-publish-revision-loader";
import {
  buildProjectPublishReview,
  createPrepareReviewFailure,
  createRandomHexSuffix,
  type PrepareProjectPublishReviewResult,
  type ProjectPublishReview,
} from "./project-publish-ui";
import {
  getProjectManifestContentCanonicalHash,
} from "./project-publish-revision";
import type { ProjectPublishWritePlan } from "./project-publish-write-plan";

const APP_ID = "ipad-slideshow-pwa";
const SCHEMA_VERSION = "1";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const JSON_MIME_TYPE = "application/json";

export type InternalProjectPublishReviewPreparationResult =
  | {
      ok: true;
      review: ProjectPublishReview;
      plan: ProjectPublishWritePlan;
    }
  | Extract<PrepareProjectPublishReviewResult, { ok: false }>;

export type ProjectPublishReviewAdapter = {
  readMetadata: (input: {
    accessToken: string;
    fileId: string;
    signal: AbortSignal;
  }) => Promise<DriveFileCandidate>;
  readText: (
    accessToken: string,
    fileId: string,
    signal: AbortSignal,
  ) => Promise<string>;
  listRevisions: (input: {
    accessToken: string;
    workspaceId: string;
    projectId: string;
    projectFolderId: string;
    signal: AbortSignal;
  }) => Promise<ListProjectPublishRevisionsResult>;
};

const defaultAdapter: ProjectPublishReviewAdapter = {
  readMetadata: readDriveFileMetadata,
  readText: readDriveTextFile,
  listRevisions: listProjectPublishRevisions,
};

export async function prepareProjectPublishReviewInDrive(input: {
  accessToken: string;
  workspaceId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  signal: AbortSignal;
}): Promise<InternalProjectPublishReviewPreparationResult> {
  const publishedAt = new Date().toISOString();

  try {
    return prepareProjectPublishReviewWithAdapter(
      {
        ...input,
        publishedAt,
        revisionRandomSuffix: createRandomHexSuffix(),
        operationRandomSuffix: createRandomHexSuffix(),
      },
      defaultAdapter,
    );
  } catch {
    return createPrepareReviewFailure({ code: "reviewInitializationFailed" });
  }
}

export async function prepareProjectPublishReviewWithAdapter(
  input: {
    accessToken: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: DriveProjectSummary;
    publishedAt: string;
    revisionRandomSuffix: string;
    operationRandomSuffix: string;
    signal: AbortSignal;
  },
  adapter: ProjectPublishReviewAdapter,
): Promise<InternalProjectPublishReviewPreparationResult> {
  try {
    const [projectFolder, manifestFile, assetsFolder, manifestText, history] =
      await Promise.all([
        adapter.readMetadata({
          accessToken: input.accessToken,
          fileId: input.project.projectFolderId,
          signal: input.signal,
        }),
        adapter.readMetadata({
          accessToken: input.accessToken,
          fileId: input.project.manifestFileId,
          signal: input.signal,
        }),
        adapter.readMetadata({
          accessToken: input.accessToken,
          fileId: input.project.assetsFolderId,
          signal: input.signal,
        }),
        adapter.readText(
          input.accessToken,
          input.project.manifestFileId,
          input.signal,
        ),
        adapter.listRevisions({
          accessToken: input.accessToken,
          workspaceId: input.workspaceId,
          projectId: input.project.projectId,
          projectFolderId: input.project.projectFolderId,
          signal: input.signal,
        }),
      ]);

    const locationError = validateProjectLocation({
      workspaceId: input.workspaceId,
      projectsRootFolderId: input.projectsRootFolderId,
      project: input.project,
      projectFolder,
      manifestFile,
      assetsFolder,
    });
    if (locationError) return locationError;

    const manifestResult = parseFreshManifest(manifestText, input);
    if (!manifestResult.ok) return manifestResult;
    const manifest = manifestResult.manifest;

    const historyResult = resolveHistory(history, manifest);
    if (!historyResult.ok) return historyResult;

    const assetMetadata = await loadReferencedAssetMetadata({
      input,
      manifest,
      adapter,
    });
    if (!assetMetadata.ok) return assetMetadata;

    const revisionId = createProjectPublishRevisionId({
      publishedAt: input.publishedAt,
      randomSuffix: input.revisionRandomSuffix,
    });
    const operationId = createProjectPublishOperationId({
      startedAt: input.publishedAt,
      randomSuffix: input.operationRandomSuffix,
    });
    const canonicalHash = getProjectManifestContentCanonicalHash(manifest);
    const currentRevisionId = manifest.publication?.currentRevisionId ?? null;
    const preflight = runProjectPublishPreflight({
      projectId: input.project.projectId,
      workspaceId: input.workspaceId,
      checkedAt: input.publishedAt,
      publishedAt: input.publishedAt,
      revisionId,
      operationId,
      manifest,
      sourceManifest: {
        modifiedTime: manifestFile.modifiedTime as string,
        canonicalHash,
        currentRevisionId,
      },
      expectedCurrent: {
        manifestModifiedTime: manifestFile.modifiedTime as string,
        manifestCanonicalHash: canonicalHash,
        currentRevisionId,
      },
      latestPublishedRevision: historyResult.latestRevision,
      historyStatus: historyResult.historyStatus,
      assets: assetMetadata.assets,
    });

    if (!preflight.ok) {
      const issue = preflight.issues[0];
      return createPrepareReviewFailure({
        code: issue?.code ?? "preflightFailed",
        message: issue?.message,
      });
    }

    return {
      ok: true,
      plan: preflight.plan,
      review: buildProjectPublishReview({
        projectId: input.project.projectId,
        projectTitle: manifest.title,
        publishedAt: input.publishedAt,
        summary: preflight.summary,
        warnings: preflight.warnings,
      }),
    };
  } catch (error) {
    return createPrepareReviewFailure({
      code:
        input.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
          ? "aborted"
          : "driveReadFailed",
    });
  }
}

function validateProjectLocation(input: {
  workspaceId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  projectFolder: DriveFileCandidate;
  manifestFile: DriveFileCandidate;
  assetsFolder: DriveFileCandidate;
}): Extract<PrepareProjectPublishReviewResult, { ok: false }> | null {
  const common = {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    projectId: input.project.projectId,
  };
  const validProjectFolder = metadataMatches(input.projectFolder, {
    id: input.project.projectFolderId,
    name: input.project.projectId,
    mimeType: FOLDER_MIME_TYPE,
    role: "projectRoot",
    parentId: input.projectsRootFolderId,
    ...common,
  });
  const validManifest = metadataMatches(input.manifestFile, {
    id: input.project.manifestFileId,
    name: "manifest.json",
    mimeType: JSON_MIME_TYPE,
    role: "projectManifest",
    parentId: input.project.projectFolderId,
    ...common,
  });
  const validAssetsFolder = metadataMatches(input.assetsFolder, {
    id: input.project.assetsFolderId,
    name: "assets",
    mimeType: FOLDER_MIME_TYPE,
    role: "assetsRoot",
    parentId: input.project.projectFolderId,
    ...common,
  });

  if (
    !validProjectFolder ||
    !validManifest ||
    !validAssetsFolder ||
    !input.manifestFile.modifiedTime
  ) {
    return createPrepareReviewFailure({
      code: "invalidProjectLocation",
      message:
        "公開対象のDriveプロジェクト情報が正しくありません。プロジェクト状態を再確認してください。",
    });
  }
  return null;
}

function metadataMatches(
  file: DriveFileCandidate,
  expected: {
    id: string;
    name: string;
    mimeType: string;
    role: string;
    parentId: string;
    app: string;
    schemaVersion: string;
    workspaceId: string;
    projectId: string;
  },
) {
  const properties = file.appProperties;
  return (
    file.id === expected.id &&
    file.name === expected.name &&
    file.mimeType === expected.mimeType &&
    file.trashed !== true &&
    file.parents?.length === 1 &&
    file.parents[0] === expected.parentId &&
    properties.app === expected.app &&
    properties.role === expected.role &&
    properties.schemaVersion === expected.schemaVersion &&
    properties.workspaceId === expected.workspaceId &&
    properties.projectId === expected.projectId
  );
}

function parseFreshManifest(
  manifestText: string,
  input: {
    workspaceId: string;
    project: DriveProjectSummary;
  },
):
  | { ok: true; manifest: ProjectManifest }
  | Extract<PrepareProjectPublishReviewResult, { ok: false }> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(manifestText);
  } catch {
    return createPrepareReviewFailure({
      code: "invalidManifest",
      message: "現在のマニフェストを確認できませんでした。",
    });
  }
  const parsed = parseProjectManifest(parsedJson);
  if (
    !parsed.ok ||
    parsed.value.workspaceId !== input.workspaceId ||
    parsed.value.projectId !== input.project.projectId ||
    parsed.value.title !== input.project.title ||
    parsed.value.createdAt !== input.project.createdAt ||
    parsed.value.updatedAt !== input.project.updatedAt
  ) {
    return createPrepareReviewFailure({
      code: "invalidManifest",
      message: "現在のマニフェストを確認できませんでした。",
    });
  }
  return { ok: true, manifest: parsed.value };
}

function resolveHistory(
  history: ListProjectPublishRevisionsResult,
  manifest: ProjectManifest,
):
  | {
      ok: true;
      historyStatus:
        | { status: "notConfigured" }
        | { status: "ready"; validRevisionCount: number };
      latestRevision:
        | {
            revisionId: string;
            publishedAt: string;
            metadataStatus: "ready";
          }
        | null;
    }
  | Extract<PrepareProjectPublishReviewResult, { ok: false }> {
  if (!history.ok) {
    return createPrepareReviewFailure({
      code: history.code,
      message: "公開履歴の保存状態を確認できませんでした。",
    });
  }

  const currentRevisionId = manifest.publication?.currentRevisionId ?? null;
  if (history.status === "notConfigured") {
    return currentRevisionId === null
      ? {
          ok: true,
          historyStatus: { status: "notConfigured" },
          latestRevision: null,
        }
      : createPrepareReviewFailure({
          code: "historyCurrentMismatch",
          message: "現在の公開版と公開履歴の状態が一致しません。",
        });
  }

  if (
    history.invalidMetadataCount > 0 ||
    history.duplicateRevisionIdCount > 0
  ) {
    return createPrepareReviewFailure({
      code: "invalidHistoryMetadata",
      message:
        "公開履歴に無効または重複した情報があります。公開履歴を確認してください。",
    });
  }

  const validItems = history.items.filter(
    (
      item,
    ): item is typeof item & {
      metadataStatus: "ready";
      publishedAt: string;
    } => item.metadataStatus === "ready" && item.publishedAt !== null,
  );
  const latest = validItems[0] ?? null;
  if (
    (latest === null && currentRevisionId !== null) ||
    (latest !== null && currentRevisionId !== latest.revisionId)
  ) {
    return createPrepareReviewFailure({
      code: "historyCurrentMismatch",
      message: "現在の公開版と最新の公開履歴が一致しません。",
    });
  }

  return {
    ok: true,
    historyStatus: {
      status: "ready",
      validRevisionCount: validItems.length,
    },
    latestRevision: latest
      ? {
          revisionId: latest.revisionId,
          publishedAt: latest.publishedAt,
          metadataStatus: "ready",
        }
      : null,
  };
}

async function loadReferencedAssetMetadata(input: {
  input: {
    accessToken: string;
    workspaceId: string;
    project: DriveProjectSummary;
    signal: AbortSignal;
  };
  manifest: ProjectManifest;
  adapter: ProjectPublishReviewAdapter;
}): Promise<
  | { ok: true; assets: ProjectPublishAssetMetadataInput[] }
  | Extract<PrepareProjectPublishReviewResult, { ok: false }>
> {
  const references = new Map<
    string,
    ProjectManifest["slides"][number]
  >();
  for (const slide of input.manifest.slides) {
    const existing = references.get(slide.assetId);
    if (
      existing &&
      (existing.assetFileId !== slide.assetFileId ||
        existing.mimeType !== slide.mimeType)
    ) {
      return createPrepareReviewFailure({
        code: "invalidManifest",
        message: "現在のマニフェストのasset参照が正しくありません。",
      });
    }
    references.set(slide.assetId, slide);
  }

  const assets = await Promise.all(
    [...references.values()].map(async (slide) => {
      const metadata = await input.adapter.readMetadata({
        accessToken: input.input.accessToken,
        fileId: slide.assetFileId,
        signal: input.input.signal,
      });
      if (
        metadata.id !== slide.assetFileId ||
        metadata.name !== slide.assetName ||
        metadata.mimeType !== slide.mimeType ||
        metadata.parents?.length !== 1 ||
        metadata.parents[0] !== input.input.project.assetsFolderId ||
        metadata.appProperties.app !== APP_ID ||
        metadata.appProperties.role !== "asset" ||
        metadata.appProperties.schemaVersion !== SCHEMA_VERSION ||
        metadata.appProperties.workspaceId !== input.input.workspaceId ||
        metadata.appProperties.projectId !== input.input.project.projectId ||
        metadata.appProperties.assetId !== slide.assetId
      ) {
        throw new InvalidAssetMetadataError();
      }

      const sizeBytes = metadata.sizeBytes ?? null;
      return {
        assetId: slide.assetId,
        driveFileId: metadata.id,
        mimeType: metadata.mimeType,
        sizeBytes,
        modifiedTime: metadata.modifiedTime ?? null,
        checksum: metadata.checksum ?? null,
        remoteOnly:
          slide.type === "video" &&
          metadata.mimeType === "video/mp4" &&
          sizeBytes !== null &&
          sizeBytes > DRIVE_VIDEO_OFFLINE_MAX_BYTES,
        trashed: metadata.trashed ?? false,
        role: "asset" as const,
        workspaceId: input.input.workspaceId,
        projectId: input.input.project.projectId,
      };
    }),
  ).catch((error: unknown) => {
    if (error instanceof InvalidAssetMetadataError) return null;
    throw error;
  });

  return assets
    ? { ok: true, assets }
    : createPrepareReviewFailure({
        code: "invalidAssetMetadata",
        message: "公開対象のアセット情報がマニフェストと一致しません。",
      });
}

class InvalidAssetMetadataError extends Error {}
