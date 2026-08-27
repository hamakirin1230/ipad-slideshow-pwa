import { getDriveVideoStorageDisposition } from "../drive-video-policy";
import {
  buildSafeSlideDiagnostic,
  classifyManagedDriveFileMismatch,
  classifyPublishAssetMetadataMismatch,
  findFirstSlideContext,
  DRIVE_PREFLIGHT_APP_ID,
  DRIVE_PREFLIGHT_SCHEMA_VERSION,
} from "../drive-preflight-diagnostics";
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
  buildProjectPublishInternalDiagnostics,
  buildProjectPublishReview,
  createPrepareReviewFailure,
  createRandomHexSuffix,
  getProjectPublishAssetDiagnosticCode,
  type PrepareProjectPublishReviewResult,
  type ProjectPublishDiagnosticCode,
  type ProjectPublishInternalDiagnostics,
  type ProjectPublishReview,
} from "./project-publish-ui";
import {
  getProjectManifestContentCanonicalHash,
} from "./project-publish-revision";
import type { ProjectPublishWritePlan } from "./project-publish-write-plan";

const APP_ID = DRIVE_PREFLIGHT_APP_ID;
const SCHEMA_VERSION = DRIVE_PREFLIGHT_SCHEMA_VERSION;
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
      const diagnosticCode = issue
        ? getProjectPublishAssetDiagnosticCode(issue.code)
        : undefined;
      return createPrepareReviewFailure({
        code: issue?.code ?? "preflightFailed",
        message: issue?.message,
        ...(diagnosticCode ? { diagnosticCode } : {}),
        diagnostics: buildProjectPublishInternalDiagnostics({
          issueCodes: preflight.issues.map((item) => item.code),
          slides: preflight.issues.flatMap((item) =>
            item.slide ? [item.slide] : [],
          ),
        }),
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
  const projectFolderMismatch = classifyManagedDriveFileMismatch(
    input.projectFolder,
    {
      id: input.project.projectFolderId,
      name: input.project.projectId,
      mimeType: FOLDER_MIME_TYPE,
      role: "projectRoot",
      parentId: input.projectsRootFolderId,
      ...common,
    },
  );
  const manifestMismatch = classifyManagedDriveFileMismatch(input.manifestFile, {
    id: input.project.manifestFileId,
    name: "manifest.json",
    mimeType: JSON_MIME_TYPE,
    role: "projectManifest",
    parentId: input.project.projectFolderId,
    ...common,
  });
  const assetsFolderMismatch = classifyManagedDriveFileMismatch(
    input.assetsFolder,
    {
      id: input.project.assetsFolderId,
      name: "assets",
      mimeType: FOLDER_MIME_TYPE,
      role: "assetsRoot",
      parentId: input.project.projectFolderId,
      ...common,
    },
  );

  if (
    projectFolderMismatch ||
    manifestMismatch ||
    assetsFolderMismatch ||
    !input.manifestFile.modifiedTime
  ) {
    return createPrepareReviewFailure({
      code: "invalidProjectLocation",
      message:
        "公開対象のDriveプロジェクト情報が正しくありません。プロジェクト状態を再確認してください。",
      diagnostics: buildProjectPublishInternalDiagnostics({
        issueCodes: [
          projectFolderMismatch
            ? "projectRootMetadataMismatch"
            : manifestMismatch
              ? "manifestMetadataMismatch"
              : assetsFolderMismatch
                ? "assetsRootMetadataMismatch"
                : "manifestModifiedTimeMismatch",
        ],
      }),
    });
  }
  return null;
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
      diagnosticCode: "invalidManifest",
      diagnostics: buildProjectPublishInternalDiagnostics({
        issueCodes: ["invalidManifest"],
      }),
    });
  }
  const parsed = parseProjectManifest(parsedJson);
  if (!parsed.ok) {
    return createPrepareReviewFailure({
      code: "invalidManifest",
      message: "現在のマニフェストを確認できませんでした。",
      diagnosticCode: "invalidManifest",
      diagnostics: buildProjectPublishInternalDiagnostics({
        issueCodes: ["invalidManifest"],
      }),
    });
  }
  if (parsed.value.workspaceId !== input.workspaceId) {
    return createPrepareReviewFailure({
      code: "invalidManifest",
      message: "現在のマニフェストを確認できませんでした。",
      diagnosticCode: "manifestWorkspaceMismatch",
      diagnostics: buildProjectPublishInternalDiagnostics({
        issueCodes: ["manifestWorkspaceMismatch"],
      }),
    });
  }
  if (parsed.value.projectId !== input.project.projectId) {
    return createPrepareReviewFailure({
      code: "invalidManifest",
      message: "現在のマニフェストを確認できませんでした。",
      diagnosticCode: "manifestProjectMismatch",
      diagnostics: buildProjectPublishInternalDiagnostics({
        issueCodes: ["manifestProjectMismatch"],
      }),
    });
  }
  if (
    parsed.value.title !== input.project.title ||
    parsed.value.createdAt !== input.project.createdAt ||
    parsed.value.updatedAt !== input.project.updatedAt
  ) {
    return createPrepareReviewFailure({
      code: "invalidManifest",
      message: "現在のマニフェストを確認できませんでした。",
      diagnosticCode: "invalidManifest",
      diagnostics: buildProjectPublishInternalDiagnostics({
        issueCodes: ["invalidManifest"],
      }),
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
        diagnosticCode: "invalidManifest",
        diagnostics: buildProjectPublishInternalDiagnostics({
          issueCodes: ["invalidManifest"],
        }),
      });
    }
    references.set(slide.assetId, slide);
  }

  const loaded = await Promise.all(
    [...references.values()].map(async (slide) => ({
      slide,
      metadata: await input.adapter.readMetadata({
        accessToken: input.input.accessToken,
        fileId: slide.assetFileId,
        signal: input.input.signal,
      }),
    })),
  );
  const assets: ProjectPublishAssetMetadataInput[] = [];
  for (const { slide, metadata } of loaded) {
    const diagnosticCode = classifyPublishAssetMetadataMismatch({
      metadata,
      expected: {
        fileId: slide.assetFileId,
        mimeType: slide.mimeType,
        parentId: input.input.project.assetsFolderId,
        app: APP_ID,
        role: "asset",
        schemaVersion: SCHEMA_VERSION,
        workspaceId: input.input.workspaceId,
        projectId: input.input.project.projectId,
        assetId: slide.assetId,
      },
    });
    if (diagnosticCode) {
      const slideContext = findFirstSlideContext(
        input.manifest.slides,
        slide.assetId,
      );
      return createPrepareReviewFailure({
        code: "invalidAssetMetadata",
        message: "公開対象のアセット情報が一致しません。",
        diagnosticCode,
        diagnostics: buildAssetSlideDiagnostics(
          diagnosticCode,
          slideContext
            ? {
                slideIndex: slideContext.slideIndex,
                assetName: slide.assetName,
                mimeType: slide.mimeType,
              }
            : {
                slideIndex: input.manifest.slides.findIndex(
                  (candidate) => candidate.assetId === slide.assetId,
                ),
                assetName: slide.assetName,
                mimeType: slide.mimeType,
              },
        ),
      });
    }

    const sizeBytes = metadata.sizeBytes ?? null;
    assets.push({
      assetId: slide.assetId,
      driveFileId: metadata.id,
      mimeType: metadata.mimeType,
      sizeBytes,
      modifiedTime: metadata.modifiedTime ?? null,
      checksum: metadata.checksum ?? null,
      remoteOnly:
        slide.type === "video" &&
        getDriveVideoStorageDisposition({
          mimeType: metadata.mimeType,
          sizeBytes,
        }) === "remoteOnly",
      trashed: metadata.trashed ?? false,
      role: "asset",
      workspaceId: input.input.workspaceId,
      projectId: input.input.project.projectId,
    });
  }
  return { ok: true, assets };
}

function buildAssetSlideDiagnostics(
  kind: ProjectPublishDiagnosticCode,
  slide: {
    slideIndex: number;
    assetName: string;
    mimeType: string;
  },
): ProjectPublishInternalDiagnostics {
  return buildProjectPublishInternalDiagnostics({
    issueCodes: [kind],
    slides: [
      buildSafeSlideDiagnostic({
        slideIndex: slide.slideIndex < 0 ? 0 : slide.slideIndex,
        assetName: slide.assetName,
        mimeType: slide.mimeType,
        kind,
      }),
    ],
  });
}
