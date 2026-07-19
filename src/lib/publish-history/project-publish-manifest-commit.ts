import {
  parseProjectManifest,
  stringifyProjectManifestJson,
  type ProjectManifest,
} from "../google-drive";
import {
  createProjectPublishManifestCommitAdapter,
  type ProjectPublishManifestCommitAdapter,
} from "./project-publish-manifest-commit-adapter";
import {
  type ProjectManifestPublication,
} from "./project-manifest-publication";
import { isValidProjectPublishIsoDateTime } from "./project-publish-operation-id";
import {
  PROJECT_HISTORY_FOLDER_ROLE,
  PROJECT_PUBLISH_REVISION_FILE_ROLE,
  PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
} from "./project-publish-revision-loader";
import {
  getProjectManifestContentCanonicalHash,
  getProjectManifestPublishableContent,
  getProjectPublishRevisionCanonicalHash,
  parseProjectPublishRevision,
  stringifyProjectPublishRevisionCanonical,
} from "./project-publish-revision";
import { isValidProjectPublishWritePlan } from "./project-publish-revision-writer";
import type { ProjectPublishWritePlan } from "./project-publish-write-plan";
import type { ProjectPublishRevisionDriveItem } from "./project-publish-drive-adapter";

const APP_ID = "ipad-slideshow-pwa";
const SCHEMA_VERSION_PROPERTY = "1";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const JSON_MIME_TYPE = "application/json";

export type CommitProjectPublishManifestErrorCode =
  | "invalidWritePlan"
  | "preparedRevisionNotFound"
  | "duplicatePreparedRevision"
  | "preparedRevisionConflict"
  | "currentManifestNotFound"
  | "duplicateCurrentManifest"
  | "invalidCurrentManifestMetadata"
  | "currentManifestReadFailed"
  | "currentManifestInvalid"
  | "currentManifestModified"
  | "currentManifestContentChanged"
  | "currentRevisionChanged"
  | "publicationConflict"
  | "currentManifestUpdateFailed"
  | "currentManifestVerificationFailed"
  | "aborted"
  | "driveReadFailed"
  | "driveWriteFailed";

export type CommitProjectPublishManifestResult =
  | {
      ok: true;
      status: "committed" | "alreadyCommitted";
      revisionId: string;
      operationId: string;
      committed: true;
    }
  | {
      ok: false;
      code: CommitProjectPublishManifestErrorCode;
      message: string;
      recoverability: "retryable" | "conflict" | "requiresInspection";
    };

export type CommitProjectPublishManifestInput = {
  accessToken: string;
  plan: ProjectPublishWritePlan;
  signal?: AbortSignal;
};

class CommitFailure extends Error {
  constructor(readonly code: CommitProjectPublishManifestErrorCode) {
    super(code);
    this.name = "ProjectPublishManifestCommitFailure";
  }
}

export async function commitProjectPublishManifestInDrive(
  input: CommitProjectPublishManifestInput,
): Promise<CommitProjectPublishManifestResult> {
  if (typeof input.accessToken !== "string" || input.accessToken.length === 0) {
    return failure("driveReadFailed");
  }
  return commitProjectPublishManifestWithAdapter(
    { plan: input.plan, signal: input.signal },
    createProjectPublishManifestCommitAdapter(input.accessToken),
  );
}

export async function commitProjectPublishManifestWithAdapter(
  input: { plan: ProjectPublishWritePlan; signal?: AbortSignal },
  adapter: ProjectPublishManifestCommitAdapter,
): Promise<CommitProjectPublishManifestResult> {
  if (!isValidProjectPublishWritePlan(input.plan)) {
    return failure("invalidWritePlan");
  }

  const signal = input.signal ?? new AbortController().signal;
  const context = {
    workspaceId: input.plan.workspaceId,
    projectId: input.plan.projectId,
    signal,
  };

  try {
    const projectFolders = await callAdapter(signal, "driveReadFailed", () =>
      adapter.findProjectFolders(context),
    );
    if (projectFolders.length === 0) {
      throw new CommitFailure("preparedRevisionNotFound");
    }
    if (projectFolders.length > 1) {
      throw new CommitFailure("duplicatePreparedRevision");
    }
    const projectFolder = projectFolders[0];
    if (!isValidProjectFolder(projectFolder, input.plan)) {
      throw new CommitFailure("preparedRevisionConflict");
    }

    const preparedRevision = await loadPreparedRevision({
      adapter,
      plan: input.plan,
      projectFolderId: projectFolder.id,
      signal,
    });

    const manifestContext = {
      ...context,
      parentFolderId: projectFolder.id,
    };
    const manifests = await callAdapter(signal, "driveReadFailed", () =>
      adapter.findCurrentManifestFiles(manifestContext),
    );
    if (manifests.length === 0) throw new CommitFailure("currentManifestNotFound");
    if (manifests.length > 1) throw new CommitFailure("duplicateCurrentManifest");
    const manifestFile = manifests[0];
    if (!isValidCurrentManifestFile(manifestFile, input.plan, projectFolder.id)) {
      throw new CommitFailure("invalidCurrentManifestMetadata");
    }

    const currentText = await callAdapter(
      signal,
      "currentManifestReadFailed",
      () =>
        adapter.readCurrentManifest({
          fileId: manifestFile.id,
          signal,
        }),
    );
    const currentManifest = parseManifestText(currentText);
    if (!currentManifest) throw new CommitFailure("currentManifestInvalid");
    if (
      currentManifest.workspaceId !== input.plan.workspaceId ||
      currentManifest.projectId !== input.plan.projectId
    ) {
      throw new CommitFailure("currentManifestInvalid");
    }

    const targetPublication = input.plan.currentManifestUpdate.publication;
    const currentContentHash =
      getProjectManifestContentCanonicalHash(currentManifest);
    const currentPublication = currentManifest.publication;

    if (currentPublication && publicationEquals(currentPublication, targetPublication)) {
      if (currentContentHash === targetPublication.contentCanonicalHash) {
        return success(input.plan, "alreadyCommitted");
      }
      throw new CommitFailure("publicationConflict");
    }
    if (
      currentPublication &&
      (currentPublication.currentRevisionId === targetPublication.currentRevisionId ||
        currentPublication.operationId === targetPublication.operationId)
    ) {
      throw new CommitFailure("publicationConflict");
    }

    if (manifestFile.modifiedTime !== input.plan.expectedCurrent.manifestModifiedTime) {
      throw new CommitFailure("currentManifestModified");
    }
    if (currentContentHash !== input.plan.expectedCurrent.manifestCanonicalHash) {
      throw new CommitFailure("currentManifestContentChanged");
    }
    if (
      (currentPublication?.currentRevisionId ?? null) !==
      input.plan.expectedCurrent.currentRevisionId
    ) {
      throw new CommitFailure("currentRevisionChanged");
    }

    const nextManifest: ProjectManifest = {
      ...getProjectManifestPublishableContent(currentManifest),
      publication: structuredClone(targetPublication),
    };
    const nextParsed = parseProjectManifest(nextManifest);
    if (!nextParsed.ok) throw new CommitFailure("invalidWritePlan");
    const nextJsonText = stringifyProjectManifestJson(nextParsed.value);

    await callAdapter(signal, "currentManifestUpdateFailed", () =>
      adapter.updateCurrentManifest({
        fileId: manifestFile.id,
        jsonText: nextJsonText,
        signal,
      }),
    );

    const verifiedManifests = await callAdapter(
      signal,
      "currentManifestVerificationFailed",
      () => adapter.findCurrentManifestFiles(manifestContext),
    );
    if (
      verifiedManifests.length !== 1 ||
      verifiedManifests[0].id !== manifestFile.id ||
      !isValidCurrentManifestFile(
        verifiedManifests[0],
        input.plan,
        projectFolder.id,
      )
    ) {
      throw new CommitFailure("currentManifestVerificationFailed");
    }
    const verifiedText = await callAdapter(
      signal,
      "currentManifestVerificationFailed",
      () =>
        adapter.readCurrentManifest({
          fileId: verifiedManifests[0].id,
          signal,
        }),
    );
    const verifiedManifest = parseManifestText(verifiedText);
    if (
      !verifiedManifest ||
      !verifyCommittedManifest({
        manifest: verifiedManifest,
        targetPublication,
        preparedRevisionManifest: preparedRevision.manifest,
      })
    ) {
      throw new CommitFailure("currentManifestVerificationFailed");
    }

    return success(input.plan, "committed");
  } catch (error) {
    if (isAbort(error, signal)) return failure("aborted");
    if (error instanceof CommitFailure) return failure(error.code);
    return failure("driveWriteFailed");
  }
}

async function loadPreparedRevision(input: {
  adapter: ProjectPublishManifestCommitAdapter;
  plan: ProjectPublishWritePlan;
  projectFolderId: string;
  signal: AbortSignal;
}) {
  const context = {
    workspaceId: input.plan.workspaceId,
    projectId: input.plan.projectId,
    signal: input.signal,
  };
  const histories = await callAdapter(input.signal, "driveReadFailed", () =>
    input.adapter.findHistoryFolders({
      ...context,
      parentFolderId: input.projectFolderId,
    }),
  );
  if (histories.length === 0) throw new CommitFailure("preparedRevisionNotFound");
  if (histories.length > 1) throw new CommitFailure("duplicatePreparedRevision");
  if (!isValidFolder(histories[0], input.plan, input.projectFolderId, "history", PROJECT_HISTORY_FOLDER_ROLE)) {
    throw new CommitFailure("preparedRevisionConflict");
  }

  const revisionsFolders = await callAdapter(input.signal, "driveReadFailed", () =>
    input.adapter.findRevisionsFolders({
      ...context,
      parentFolderId: histories[0].id,
    }),
  );
  if (revisionsFolders.length === 0) {
    throw new CommitFailure("preparedRevisionNotFound");
  }
  if (revisionsFolders.length > 1) {
    throw new CommitFailure("duplicatePreparedRevision");
  }
  if (!isValidFolder(revisionsFolders[0], input.plan, histories[0].id, "revisions", PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE)) {
    throw new CommitFailure("preparedRevisionConflict");
  }

  const files = await callAdapter(input.signal, "driveReadFailed", () =>
    input.adapter.findRevisionFiles({
      ...context,
      parentFolderId: revisionsFolders[0].id,
      revisionId: input.plan.revisionFile.revisionId,
    }),
  );
  if (files.length === 0) throw new CommitFailure("preparedRevisionNotFound");
  if (files.length > 1) throw new CommitFailure("duplicatePreparedRevision");
  if (!isValidPreparedRevisionFile(files[0], input.plan, revisionsFolders[0].id)) {
    throw new CommitFailure("preparedRevisionConflict");
  }

  const text = await callAdapter(input.signal, "driveReadFailed", () =>
    input.adapter.readRevisionFile({ fileId: files[0].id, signal: input.signal }),
  );
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new CommitFailure("preparedRevisionConflict");
  }
  const parsed = parseProjectPublishRevision(body);
  if (
    !parsed.ok ||
    stringifyProjectPublishRevisionCanonical(parsed.value) !==
      input.plan.revisionFile.canonicalBody ||
    getProjectPublishRevisionCanonicalHash(parsed.value) !==
      input.plan.revisionFile.canonicalHash
  ) {
    throw new CommitFailure("preparedRevisionConflict");
  }
  return parsed.value;
}

function parseManifestText(text: string) {
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const parsed = parseProjectManifest(body);
  return parsed.ok ? parsed.value : null;
}

function verifyCommittedManifest(input: {
  manifest: ProjectManifest;
  targetPublication: ProjectManifestPublication;
  preparedRevisionManifest: ProjectManifest;
}) {
  const contentHash = getProjectManifestContentCanonicalHash(input.manifest);
  return (
    contentHash === input.targetPublication.contentCanonicalHash &&
    getProjectManifestContentCanonicalHash(input.preparedRevisionManifest) ===
      input.targetPublication.contentCanonicalHash &&
    input.manifest.publication !== undefined &&
    publicationEquals(input.manifest.publication, input.targetPublication) &&
    input.manifest.publication.contentCanonicalHash === contentHash
  );
}

function publicationEquals(
  left: ProjectManifestPublication,
  right: ProjectManifestPublication,
) {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.currentRevisionId === right.currentRevisionId &&
    left.publishedAt === right.publishedAt &&
    left.operation === right.operation &&
    left.operationId === right.operationId &&
    left.contentCanonicalHash === right.contentCanonicalHash
  );
}

function isValidProjectFolder(
  file: ProjectPublishRevisionDriveItem,
  plan: ProjectPublishWritePlan,
) {
  return (
    file.name === plan.projectId &&
    file.mimeType === FOLDER_MIME_TYPE &&
    file.trashed !== true &&
    hasBaseMetadata(file, plan, "projectRoot")
  );
}

function isValidFolder(
  file: ProjectPublishRevisionDriveItem,
  plan: ProjectPublishWritePlan,
  parentId: string,
  name: string,
  role: string,
) {
  return (
    file.name === name &&
    file.mimeType === FOLDER_MIME_TYPE &&
    file.parents?.includes(parentId) === true &&
    file.trashed !== true &&
    hasBaseMetadata(file, plan, role)
  );
}

function isValidPreparedRevisionFile(
  file: ProjectPublishRevisionDriveItem,
  plan: ProjectPublishWritePlan,
  parentId: string,
) {
  return (
    file.name === plan.revisionFile.filename &&
    file.mimeType === JSON_MIME_TYPE &&
    file.parents?.includes(parentId) === true &&
    file.trashed !== true &&
    file.appProperties.role === PROJECT_PUBLISH_REVISION_FILE_ROLE &&
    Object.entries(plan.revisionFile.appProperties).every(
      ([key, value]) => file.appProperties[key] === value,
    )
  );
}

function isValidCurrentManifestFile(
  file: ProjectPublishRevisionDriveItem,
  plan: ProjectPublishWritePlan,
  projectFolderId: string,
) {
  return (
    file.name === "manifest.json" &&
    file.mimeType === JSON_MIME_TYPE &&
    file.parents?.includes(projectFolderId) === true &&
    file.trashed !== true &&
    isValidProjectPublishIsoDateTime(file.modifiedTime) &&
    hasBaseMetadata(file, plan, "projectManifest")
  );
}

function hasBaseMetadata(
  file: ProjectPublishRevisionDriveItem,
  plan: ProjectPublishWritePlan,
  role: string,
) {
  return (
    file.appProperties.app === APP_ID &&
    file.appProperties.role === role &&
    file.appProperties.schemaVersion === SCHEMA_VERSION_PROPERTY &&
    file.appProperties.workspaceId === plan.workspaceId &&
    file.appProperties.projectId === plan.projectId
  );
}

async function callAdapter<T>(
  signal: AbortSignal,
  code: CommitProjectPublishManifestErrorCode,
  operation: () => Promise<T>,
) {
  throwIfAborted(signal);
  try {
    const result = await operation();
    throwIfAborted(signal);
    return result;
  } catch (error) {
    if (isAbort(error, signal)) throw new CommitFailure("aborted");
    if (error instanceof CommitFailure) throw error;
    throw new CommitFailure(code);
  }
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new CommitFailure("aborted");
}

function isAbort(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof CommitFailure && error.code === "aborted")
  );
}

function success(
  plan: ProjectPublishWritePlan,
  status: "committed" | "alreadyCommitted",
): CommitProjectPublishManifestResult {
  return {
    ok: true,
    status,
    revisionId: plan.revisionFile.revisionId,
    operationId: plan.operationId,
    committed: true,
  };
}

function failure(
  code: CommitProjectPublishManifestErrorCode,
): CommitProjectPublishManifestResult {
  const messages: Record<CommitProjectPublishManifestErrorCode, string> = {
    invalidWritePlan: "公開版の切替計画が正しくありません。",
    preparedRevisionNotFound: "準備済みの公開履歴が見つかりません。",
    duplicatePreparedRevision: "準備済みの公開履歴が重複しています。",
    preparedRevisionConflict: "公開履歴の準備状態が計画と一致しません。",
    currentManifestNotFound: "現在のマニフェストが見つかりません。",
    duplicateCurrentManifest: "現在のマニフェストが重複しています。",
    invalidCurrentManifestMetadata: "現在のマニフェスト情報が正しくありません。",
    currentManifestReadFailed: "現在のマニフェストを読み込めませんでした。",
    currentManifestInvalid: "現在のマニフェスト内容が正しくありません。",
    currentManifestModified: "現在のマニフェストが事前確認後に変更されています。",
    currentManifestContentChanged: "現在の再生内容が事前確認後に変更されています。",
    currentRevisionChanged: "現在の公開版が別の操作によって変更されています。",
    publicationConflict: "公開版の切替状態に競合があります。",
    currentManifestUpdateFailed: "現在の公開版を切り替えられませんでした。",
    currentManifestVerificationFailed: "公開版の切替後に内容を確認できませんでした。",
    aborted: "公開版の切替を中止しました。",
    driveReadFailed: "公開版の切替に必要なDrive情報を確認できませんでした。",
    driveWriteFailed: "公開版の切替処理を完了できませんでした。",
  };
  return {
    ok: false,
    code,
    message: messages[code],
    recoverability: getRecoverability(code),
  };
}

function getRecoverability(
  code: CommitProjectPublishManifestErrorCode,
): "retryable" | "conflict" | "requiresInspection" {
  if (
    code === "duplicatePreparedRevision" ||
    code === "preparedRevisionConflict" ||
    code === "duplicateCurrentManifest" ||
    code === "currentManifestModified" ||
    code === "currentManifestContentChanged" ||
    code === "currentRevisionChanged" ||
    code === "publicationConflict"
  ) {
    return "conflict";
  }
  if (
    code === "invalidWritePlan" ||
    code === "invalidCurrentManifestMetadata" ||
    code === "currentManifestInvalid" ||
    code === "currentManifestVerificationFailed"
  ) {
    return "requiresInspection";
  }
  return "retryable";
}
