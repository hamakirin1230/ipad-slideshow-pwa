import {
  parseProjectManifest,
  readDriveFileMetadata,
  readDriveTextFile,
  type DriveFileCandidate,
  type DriveProjectSummary,
  type ProjectManifest,
} from "../google-drive";
import {
  loadProjectPublishRevision,
  type LoadProjectPublishRevisionResult,
} from "./project-publish-revision-loader";
import {
  getProjectManifestContentCanonicalHash,
  stringifyProjectPublishRevisionCanonical,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import {
  buildProjectRollbackPreview,
  type ProjectRollbackFreshAsset,
  type ProjectRollbackPreview,
} from "./project-rollback-preview";

const APP_ID = "ipad-slideshow-pwa";
const SCHEMA_VERSION = "1";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const JSON_MIME_TYPE = "application/json";

export type PrepareProjectRollbackPreviewFailureCode =
  | "aborted"
  | "notReady"
  | "driveReadFailed"
  | "invalidProjectLocation"
  | "invalidManifest"
  | "unpublished"
  | "currentRevisionNotFound"
  | "currentRevisionDuplicate"
  | "currentRevisionInvalid"
  | "currentPublicationInconsistent"
  | "targetRevisionNotFound"
  | "targetRevisionDuplicate"
  | "targetRevisionInvalid"
  | "targetProjectMismatch"
  | "staleCurrent"
  | "staleTargetRevision";

export type PrepareProjectRollbackPreviewResult =
  | { ok: true; preview: ProjectRollbackPreview }
  | {
      ok: false;
      category: "blocked" | "stale" | "error";
      code: PrepareProjectRollbackPreviewFailureCode;
      message: string;
    };

export type ProjectRollbackReviewAdapter = {
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
  loadRevision: (input: {
    accessToken: string;
    workspaceId: string;
    projectId: string;
    projectFolderId: string;
    revisionId: string;
    signal: AbortSignal;
  }) => Promise<LoadProjectPublishRevisionResult>;
  now: () => string;
};

const defaultAdapter: ProjectRollbackReviewAdapter = {
  readMetadata: readDriveFileMetadata,
  readText: readDriveTextFile,
  loadRevision: loadProjectPublishRevision,
  now: () => new Date().toISOString(),
};

export async function prepareProjectRollbackPreviewInDrive(input: {
  accessToken: string;
  workspaceId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  targetRevisionId: string;
  signal: AbortSignal;
}): Promise<PrepareProjectRollbackPreviewResult> {
  return prepareProjectRollbackPreviewWithAdapter(input, defaultAdapter);
}

export async function prepareProjectRollbackPreviewWithAdapter(
  input: {
    accessToken: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: DriveProjectSummary;
    targetRevisionId: string;
    signal: AbortSignal;
  },
  adapter: ProjectRollbackReviewAdapter,
): Promise<PrepareProjectRollbackPreviewResult> {
  try {
    const [projectFolder, manifestFile, assetsFolder, manifestText] =
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
      ]);
    if (input.signal.aborted) return failure("aborted");
    if (
      !validProjectLocation({
        workspaceId: input.workspaceId,
        projectsRootFolderId: input.projectsRootFolderId,
        project: input.project,
        projectFolder,
        manifestFile,
        assetsFolder,
      })
    ) {
      return failure("invalidProjectLocation");
    }

    const currentManifest = parseFreshManifest(manifestText, input);
    if (!currentManifest) return failure("invalidManifest");
    const publication = currentManifest.publication;
    if (!publication) return failure("unpublished");

    const startSnapshot = {
      manifestModifiedTime: manifestFile.modifiedTime as string,
      manifestContentCanonicalHash:
        getProjectManifestContentCanonicalHash(currentManifest),
      currentRevisionId: publication.currentRevisionId,
    };
    const [currentExact, targetExact] = await Promise.all([
      adapter.loadRevision({
        accessToken: input.accessToken,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
        projectFolderId: input.project.projectFolderId,
        revisionId: publication.currentRevisionId,
        signal: input.signal,
      }),
      adapter.loadRevision({
        accessToken: input.accessToken,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
        projectFolderId: input.project.projectFolderId,
        revisionId: input.targetRevisionId,
        signal: input.signal,
      }),
    ]);
    if (input.signal.aborted) return failure("aborted");
    if (!currentExact.ok) {
      return mapRevisionFailure("current", currentExact.code);
    }
    if (!publicationMatchesRevision(publication, currentExact.revision)) {
      return failure("currentPublicationInconsistent");
    }
    if (!targetExact.ok) {
      return mapRevisionFailure("target", targetExact.code);
    }
    if (
      targetExact.revision.projectId !== input.project.projectId ||
      targetExact.revision.manifest.projectId !== input.project.projectId
    ) {
      return failure("targetProjectMismatch");
    }

    const targetCanonical = stringifyProjectPublishRevisionCanonical(
      targetExact.revision,
    );
    const freshAssets = await loadFreshTargetAssets({
      input,
      targetRevision: targetExact.revision,
      adapter,
    });
    if (input.signal.aborted) return failure("aborted");

    const [endManifestFile, endManifestText, endTargetExact] =
      await Promise.all([
        adapter.readMetadata({
          accessToken: input.accessToken,
          fileId: input.project.manifestFileId,
          signal: input.signal,
        }),
        adapter.readText(
          input.accessToken,
          input.project.manifestFileId,
          input.signal,
        ),
        adapter.loadRevision({
          accessToken: input.accessToken,
          workspaceId: input.workspaceId,
          projectId: input.project.projectId,
          projectFolderId: input.project.projectFolderId,
          revisionId: input.targetRevisionId,
          signal: input.signal,
        }),
      ]);
    if (input.signal.aborted) return failure("aborted");

    const endManifest = parseFreshManifest(endManifestText, input);
    if (
      !endManifest ||
      !endManifest.publication ||
      !validManifestMetadata(endManifestFile, input) ||
      endManifestFile.modifiedTime !== startSnapshot.manifestModifiedTime ||
      getProjectManifestContentCanonicalHash(endManifest) !==
        startSnapshot.manifestContentCanonicalHash ||
      endManifest.publication.currentRevisionId !==
        startSnapshot.currentRevisionId
    ) {
      return failure("staleCurrent");
    }
    if (
      !endTargetExact.ok ||
      stringifyProjectPublishRevisionCanonical(endTargetExact.revision) !==
        targetCanonical
    ) {
      return failure("staleTargetRevision");
    }

    return {
      ok: true,
      preview: buildProjectRollbackPreview({
        checkedAt: adapter.now(),
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
        assetsFolderId: input.project.assetsFolderId,
        currentManifest,
        currentRevision: currentExact.revision,
        targetRevision: targetExact.revision,
        freshAssets,
      }),
    };
  } catch (error) {
    return failure(
      input.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
        ? "aborted"
        : "driveReadFailed",
    );
  }
}

async function loadFreshTargetAssets(input: {
  input: {
    accessToken: string;
    signal: AbortSignal;
  };
  targetRevision: ProjectPublishRevision;
  adapter: ProjectRollbackReviewAdapter;
}): Promise<ProjectRollbackFreshAsset[]> {
  return Promise.all(
    input.targetRevision.assets.map(async (asset) => {
      try {
        return {
          assetId: asset.assetId,
          metadata: await input.adapter.readMetadata({
            accessToken: input.input.accessToken,
            fileId: asset.driveFileId,
            signal: input.input.signal,
          }),
        };
      } catch (error) {
        if (
          input.input.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          throw error;
        }
        return { assetId: asset.assetId, metadata: null };
      }
    }),
  );
}

function publicationMatchesRevision(
  publication: NonNullable<ProjectManifest["publication"]>,
  revision: ProjectPublishRevision,
) {
  return (
    publication.currentRevisionId === revision.revisionId &&
    publication.publishedAt === revision.publishedAt &&
    publication.operation === revision.operation &&
    publication.contentCanonicalHash === revision.sourceManifestCanonicalHash
  );
}

function parseFreshManifest(
  text: string,
  input: {
    workspaceId: string;
    project: DriveProjectSummary;
  },
): ProjectManifest | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = parseProjectManifest(body);
  if (
    !parsed.ok ||
    parsed.value.workspaceId !== input.workspaceId ||
    parsed.value.projectId !== input.project.projectId ||
    parsed.value.title !== input.project.title ||
    parsed.value.createdAt !== input.project.createdAt ||
    parsed.value.updatedAt !== input.project.updatedAt
  ) {
    return null;
  }
  return parsed.value;
}

function validProjectLocation(input: {
  workspaceId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  projectFolder: DriveFileCandidate;
  manifestFile: DriveFileCandidate;
  assetsFolder: DriveFileCandidate;
}) {
  const common = {
    workspaceId: input.workspaceId,
    projectId: input.project.projectId,
  };
  return (
    metadataMatches(input.projectFolder, {
      id: input.project.projectFolderId,
      name: input.project.projectId,
      mimeType: FOLDER_MIME_TYPE,
      role: "projectRoot",
      parentId: input.projectsRootFolderId,
      ...common,
    }) &&
    validManifestMetadata(input.manifestFile, input) &&
    metadataMatches(input.assetsFolder, {
      id: input.project.assetsFolderId,
      name: "assets",
      mimeType: FOLDER_MIME_TYPE,
      role: "assetsRoot",
      parentId: input.project.projectFolderId,
      ...common,
    })
  );
}

function validManifestMetadata(
  file: DriveFileCandidate,
  input: {
    workspaceId: string;
    project: DriveProjectSummary;
  },
) {
  return (
    metadataMatches(file, {
      id: input.project.manifestFileId,
      name: "manifest.json",
      mimeType: JSON_MIME_TYPE,
      role: "projectManifest",
      parentId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.project.projectId,
    }) && typeof file.modifiedTime === "string"
  );
}

function metadataMatches(
  file: DriveFileCandidate,
  expected: {
    id: string;
    name: string;
    mimeType: string;
    role: string;
    parentId: string;
    workspaceId: string;
    projectId: string;
  },
) {
  return (
    file.id === expected.id &&
    file.name === expected.name &&
    file.mimeType === expected.mimeType &&
    file.trashed === false &&
    file.parents?.length === 1 &&
    file.parents[0] === expected.parentId &&
    file.appProperties.app === APP_ID &&
    file.appProperties.role === expected.role &&
    file.appProperties.schemaVersion === SCHEMA_VERSION &&
    file.appProperties.workspaceId === expected.workspaceId &&
    file.appProperties.projectId === expected.projectId
  );
}

function mapRevisionFailure(
  owner: "current" | "target",
  code: Extract<LoadProjectPublishRevisionResult, { ok: false }>["code"],
): Extract<PrepareProjectRollbackPreviewResult, { ok: false }> {
  if (owner === "current") {
    if (code === "notFound") return failure("currentRevisionNotFound");
    if (code === "duplicateRevision") {
      return failure("currentRevisionDuplicate");
    }
    if (code === "driveReadFailed") return failure("driveReadFailed");
    return failure("currentRevisionInvalid");
  }
  if (code === "notFound") return failure("targetRevisionNotFound");
  if (code === "duplicateRevision") return failure("targetRevisionDuplicate");
  if (code === "driveReadFailed") return failure("driveReadFailed");
  return failure("targetRevisionInvalid");
}

export function createPrepareProjectRollbackPreviewFailure(
  code: PrepareProjectRollbackPreviewFailureCode,
): Extract<PrepareProjectRollbackPreviewResult, { ok: false }> {
  return failure(code);
}

function failure(
  code: PrepareProjectRollbackPreviewFailureCode,
): Extract<PrepareProjectRollbackPreviewResult, { ok: false }> {
  const category =
    code === "staleCurrent" || code === "staleTargetRevision"
      ? "stale"
      : code === "driveReadFailed" || code === "notReady"
        ? "error"
        : "blocked";
  const messages: Record<PrepareProjectRollbackPreviewFailureCode, string> = {
    aborted: "rollback previewを中止しました。",
    notReady: "rollback previewを開始する準備ができていません。",
    driveReadFailed:
      "Google Driveからrollback previewに必要な情報を読み込めませんでした。",
    invalidProjectLocation:
      "project、manifest、assets folderの正式metadataを確認できませんでした。",
    invalidManifest: "現在のmanifestを正式な内容として確認できませんでした。",
    unpublished: "未公開projectではrollback previewを作成できません。",
    currentRevisionNotFound:
      "publicationが参照するcurrent revisionが見つかりません。",
    currentRevisionDuplicate:
      "publicationが参照するcurrent revisionが重複しています。",
    currentRevisionInvalid:
      "publicationが参照するcurrent revisionを正式な内容として確認できません。",
    currentPublicationInconsistent:
      "publicationとcurrent revisionの内容が一致しません。",
    targetRevisionNotFound: "preview対象revisionが見つかりません。",
    targetRevisionDuplicate: "preview対象revisionが重複しています。",
    targetRevisionInvalid:
      "preview対象revisionを正式な内容として確認できません。",
    targetProjectMismatch:
      "preview対象revisionは選択projectと一致しません。",
    staleCurrent:
      "確認中に現在の内容が変更されました。最新状態でpreviewをやり直してください。",
    staleTargetRevision:
      "確認中にpreview対象revisionが変更されました。最新状態でpreviewをやり直してください。",
  };
  return { ok: false, category, code, message: messages[code] };
}
