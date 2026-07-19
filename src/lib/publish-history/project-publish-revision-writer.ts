import {
  createProjectPublishRevisionDriveAdapter,
  type ProjectPublishRevisionDriveItem,
  type ProjectPublishRevisionWriteAdapter,
} from "./project-publish-drive-adapter";
import { isValidProjectPublishOperationId } from "./project-publish-operation-id";
import { parseProjectManifestPublication } from "./project-manifest-publication";
import {
  PROJECT_HISTORY_FOLDER_ROLE,
  PROJECT_PUBLISH_REVISION_FILE_ROLE,
  PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
} from "./project-publish-revision-loader";
import {
  getProjectPublishRevisionCanonicalHash,
  isValidProjectPublishRevisionId,
  parseProjectPublishRevision,
  stringifyProjectPublishRevisionCanonical,
} from "./project-publish-revision";
import {
  buildProjectPublishRevisionAppProperties,
  type ProjectPublishWritePlan,
} from "./project-publish-write-plan";

const APP_ID = "ipad-slideshow-pwa";
const SCHEMA_VERSION_PROPERTY = "1";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const JSON_MIME_TYPE = "application/json";
const HISTORY_FOLDER_NAME = "history";
const REVISIONS_FOLDER_NAME = "revisions";
const EXPECTED_STEP_ORDER = [
  "ensureHistoryFolder",
  "ensureRevisionsFolder",
  "createRevisionFile",
  "verifyRevisionFile",
  "updateCurrentManifest",
  "verifyCurrentManifest",
] as const;

export type PrepareProjectPublishRevisionErrorCode =
  | "invalidWritePlan"
  | "projectFolderNotFound"
  | "duplicateProjectFolder"
  | "invalidProjectFolder"
  | "duplicateHistoryFolder"
  | "invalidHistoryFolder"
  | "historyFolderCreateFailed"
  | "historyFolderVerificationFailed"
  | "duplicateRevisionsFolder"
  | "invalidRevisionsFolder"
  | "revisionsFolderCreateFailed"
  | "revisionsFolderVerificationFailed"
  | "duplicateRevision"
  | "revisionConflict"
  | "revisionCreateFailed"
  | "revisionReadFailed"
  | "revisionVerificationFailed"
  | "driveWriteFailed"
  | "aborted";

export type PrepareProjectPublishRevisionRecoverability =
  | "retryable"
  | "requiresInspection"
  | "conflict";

export type PrepareProjectPublishRevisionResult =
  | {
      ok: true;
      status: "created" | "alreadyPrepared";
      revisionId: string;
      operationId: string;
      initialPublish: boolean;
      verified: true;
    }
  | {
      ok: false;
      code: PrepareProjectPublishRevisionErrorCode;
      message: string;
      recoverability: PrepareProjectPublishRevisionRecoverability;
    };

export type PrepareProjectPublishRevisionInput = {
  accessToken: string;
  plan: ProjectPublishWritePlan;
  signal?: AbortSignal;
};

type PrepareWithAdapterInput = {
  plan: ProjectPublishWritePlan;
  signal?: AbortSignal;
};

class ExecutorFailure extends Error {
  readonly code: PrepareProjectPublishRevisionErrorCode;

  constructor(code: PrepareProjectPublishRevisionErrorCode) {
    super(code);
    this.name = "ProjectPublishRevisionExecutorFailure";
    this.code = code;
  }
}

export async function prepareProjectPublishRevisionInDrive(
  input: PrepareProjectPublishRevisionInput,
): Promise<PrepareProjectPublishRevisionResult> {
  if (typeof input.accessToken !== "string" || input.accessToken.length === 0) {
    return failure("driveWriteFailed");
  }

  return prepareProjectPublishRevisionWithAdapter(
    { plan: input.plan, signal: input.signal },
    createProjectPublishRevisionDriveAdapter(input.accessToken),
  );
}

/**
 * Adapter-injected executor core. This is exported for isolated tests and for a
 * future non-UI orchestration layer; it never receives or returns an access token.
 */
export async function prepareProjectPublishRevisionWithAdapter(
  input: PrepareWithAdapterInput,
  adapter: ProjectPublishRevisionWriteAdapter,
): Promise<PrepareProjectPublishRevisionResult> {
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
    throwIfAborted(signal);
    const projectFolders = await callAdapter(
      signal,
      "driveWriteFailed",
      () => adapter.findProjectFolders(context),
    );
    if (projectFolders.length === 0) throw new ExecutorFailure("projectFolderNotFound");
    if (projectFolders.length > 1) throw new ExecutorFailure("duplicateProjectFolder");
    const projectFolder = projectFolders[0];
    if (!isValidProjectFolder(projectFolder, input.plan)) {
      throw new ExecutorFailure("invalidProjectFolder");
    }

    const historyFolder = await ensureHistoryFolder({
      adapter,
      plan: input.plan,
      projectFolderId: projectFolder.id,
      signal,
    });
    const revisionsFolder = await ensureRevisionsFolder({
      adapter,
      plan: input.plan,
      historyFolderId: historyFolder.id,
      signal,
    });

    const revisionContext = {
      ...context,
      parentFolderId: revisionsFolder.id,
      revisionId: input.plan.revisionFile.revisionId,
    };
    const existing = await callAdapter(signal, "driveWriteFailed", () =>
      adapter.findRevisionFiles(revisionContext),
    );
    if (existing.length > 1) throw new ExecutorFailure("duplicateRevision");
    if (existing.length === 1) {
      const matches = await verifyRevision({
        adapter,
        file: existing[0],
        plan: input.plan,
        revisionsFolderId: revisionsFolder.id,
        signal,
        readFailureCode: "revisionReadFailed",
      });
      if (!matches) throw new ExecutorFailure("revisionConflict");
      return success(input.plan, "alreadyPrepared");
    }

    await callAdapter(signal, "revisionCreateFailed", () =>
      adapter.createRevisionFile({
        ...context,
        parentFolderId: revisionsFolder.id,
        filename: input.plan.revisionFile.filename,
        canonicalBody: input.plan.revisionFile.canonicalBody,
        appProperties: { ...input.plan.revisionFile.appProperties },
      }),
    );

    const createdCandidates = await callAdapter(
      signal,
      "revisionVerificationFailed",
      () => adapter.findRevisionFiles(revisionContext),
    );
    if (createdCandidates.length > 1) throw new ExecutorFailure("duplicateRevision");
    if (createdCandidates.length !== 1) {
      throw new ExecutorFailure("revisionVerificationFailed");
    }
    const verified = await verifyRevision({
      adapter,
      file: createdCandidates[0],
      plan: input.plan,
      revisionsFolderId: revisionsFolder.id,
      signal,
      readFailureCode: "revisionVerificationFailed",
    });
    if (!verified) throw new ExecutorFailure("revisionVerificationFailed");

    return success(input.plan, "created");
  } catch (error) {
    if (isAbort(error, signal)) return failure("aborted");
    if (error instanceof ExecutorFailure) return failure(error.code);
    return failure("driveWriteFailed");
  }
}

async function ensureHistoryFolder(input: {
  adapter: ProjectPublishRevisionWriteAdapter;
  plan: ProjectPublishWritePlan;
  projectFolderId: string;
  signal: AbortSignal;
}): Promise<ProjectPublishRevisionDriveItem> {
  const context = {
    workspaceId: input.plan.workspaceId,
    projectId: input.plan.projectId,
    parentFolderId: input.projectFolderId,
    signal: input.signal,
  };
  let folders = await callAdapter(input.signal, "driveWriteFailed", () =>
    input.adapter.findHistoryFolders(context),
  );
  if (folders.length > 1) throw new ExecutorFailure("duplicateHistoryFolder");
  if (folders.length === 1) {
    if (!isValidHistoryFolder(folders[0], input.plan, input.projectFolderId)) {
      throw new ExecutorFailure("invalidHistoryFolder");
    }
    return folders[0];
  }
  if (!input.plan.folders.ensureHistoryFolder) {
    throw new ExecutorFailure("invalidHistoryFolder");
  }

  await callAdapter(input.signal, "historyFolderCreateFailed", () =>
    input.adapter.createHistoryFolder(context),
  );
  folders = await callAdapter(
    input.signal,
    "historyFolderVerificationFailed",
    () => input.adapter.findHistoryFolders(context),
  );
  if (folders.length > 1) throw new ExecutorFailure("duplicateHistoryFolder");
  if (
    folders.length !== 1 ||
    !isValidHistoryFolder(folders[0], input.plan, input.projectFolderId)
  ) {
    throw new ExecutorFailure("historyFolderVerificationFailed");
  }
  return folders[0];
}

async function ensureRevisionsFolder(input: {
  adapter: ProjectPublishRevisionWriteAdapter;
  plan: ProjectPublishWritePlan;
  historyFolderId: string;
  signal: AbortSignal;
}): Promise<ProjectPublishRevisionDriveItem> {
  const context = {
    workspaceId: input.plan.workspaceId,
    projectId: input.plan.projectId,
    parentFolderId: input.historyFolderId,
    signal: input.signal,
  };
  let folders = await callAdapter(input.signal, "driveWriteFailed", () =>
    input.adapter.findRevisionsFolders(context),
  );
  if (folders.length > 1) throw new ExecutorFailure("duplicateRevisionsFolder");
  if (folders.length === 1) {
    if (!isValidRevisionsFolder(folders[0], input.plan, input.historyFolderId)) {
      throw new ExecutorFailure("invalidRevisionsFolder");
    }
    return folders[0];
  }
  if (!input.plan.folders.ensureRevisionsFolder) {
    throw new ExecutorFailure("invalidRevisionsFolder");
  }

  await callAdapter(input.signal, "revisionsFolderCreateFailed", () =>
    input.adapter.createRevisionsFolder(context),
  );
  folders = await callAdapter(
    input.signal,
    "revisionsFolderVerificationFailed",
    () => input.adapter.findRevisionsFolders(context),
  );
  if (folders.length > 1) throw new ExecutorFailure("duplicateRevisionsFolder");
  if (
    folders.length !== 1 ||
    !isValidRevisionsFolder(folders[0], input.plan, input.historyFolderId)
  ) {
    throw new ExecutorFailure("revisionsFolderVerificationFailed");
  }
  return folders[0];
}

async function verifyRevision(input: {
  adapter: ProjectPublishRevisionWriteAdapter;
  file: ProjectPublishRevisionDriveItem;
  plan: ProjectPublishWritePlan;
  revisionsFolderId: string;
  signal: AbortSignal;
  readFailureCode: "revisionReadFailed" | "revisionVerificationFailed";
}) {
  if (!isValidRevisionFile(input.file, input.plan, input.revisionsFolderId)) {
    return false;
  }

  const text = await callAdapter(input.signal, input.readFailureCode, () =>
    input.adapter.readRevisionFile({ fileId: input.file.id, signal: input.signal }),
  );
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return false;
  }
  const parsed = parseProjectPublishRevision(body);
  if (!parsed.ok) return false;

  try {
    return (
      stringifyProjectPublishRevisionCanonical(parsed.value) ===
        input.plan.revisionFile.canonicalBody &&
      getProjectPublishRevisionCanonicalHash(parsed.value) ===
        input.plan.revisionFile.canonicalHash
    );
  } catch {
    return false;
  }
}

async function callAdapter<T>(
  signal: AbortSignal,
  failureCode: PrepareProjectPublishRevisionErrorCode,
  operation: () => Promise<T>,
): Promise<T> {
  throwIfAborted(signal);
  try {
    const result = await operation();
    throwIfAborted(signal);
    return result;
  } catch (error) {
    if (isAbort(error, signal)) throw new ExecutorFailure("aborted");
    throw new ExecutorFailure(failureCode);
  }
}

export function isValidProjectPublishWritePlan(plan: ProjectPublishWritePlan) {
  try {
    if (
      !isValidProjectPublishOperationId(plan.operationId) ||
      !isValidProjectPublishRevisionId(plan.revisionFile.revisionId) ||
      plan.projectId !== plan.revisionFile.body.projectId ||
      plan.workspaceId !== plan.revisionFile.body.manifest.workspaceId ||
      plan.projectId !== plan.revisionFile.body.manifest.projectId ||
      plan.revisionFile.body.operation !== "publish" ||
      Object.prototype.hasOwnProperty.call(
        plan.revisionFile.body,
        "restoredFromRevisionId",
      ) ||
      plan.revisionFile.filename !== `${plan.revisionFile.revisionId}.json` ||
      plan.revisionFile.revisionId !== plan.revisionFile.body.revisionId ||
      plan.revisionFile.canonicalBody !==
        stringifyProjectPublishRevisionCanonical(plan.revisionFile.body) ||
      plan.revisionFile.canonicalHash !==
        getProjectPublishRevisionCanonicalHash(plan.revisionFile.body) ||
      !sameStringRecord(
        plan.revisionFile.appProperties,
        buildProjectPublishRevisionAppProperties({
          workspaceId: plan.workspaceId,
          revision: plan.revisionFile.body,
        }),
      ) ||
      plan.initialPublish !== (plan.revisionFile.body.previousRevisionId === null) ||
      plan.currentManifestUpdate.publication.currentRevisionId !==
        plan.revisionFile.revisionId ||
      plan.currentManifestUpdate.publication.publishedAt !==
        plan.revisionFile.body.publishedAt ||
      plan.currentManifestUpdate.publication.operationId !== plan.operationId ||
      plan.currentManifestUpdate.publication.operation !== "publish" ||
      plan.currentManifestUpdate.publication.contentCanonicalHash !==
        plan.revisionFile.body.sourceManifestCanonicalHash ||
      plan.currentManifestUpdate.expectedPreviousRevisionId !==
        plan.expectedCurrent.currentRevisionId ||
      plan.steps.length !== EXPECTED_STEP_ORDER.length ||
      plan.steps.some(
        (step, index) => step.kind !== EXPECTED_STEP_ORDER[index],
      )
    ) {
      return false;
    }

    const parsed = parseProjectPublishRevision(plan.revisionFile.body);
    const publication = parseProjectManifestPublication(
      plan.currentManifestUpdate.publication,
    );
    return parsed.ok && publication.ok;
  } catch {
    return false;
  }
}

function isValidProjectFolder(
  file: ProjectPublishRevisionDriveItem,
  plan: ProjectPublishWritePlan,
) {
  return (
    file.name === plan.projectId &&
    file.mimeType === FOLDER_MIME_TYPE &&
    file.trashed !== true &&
    hasBaseMetadata(file, "projectRoot", plan)
  );
}

function isValidHistoryFolder(
  file: ProjectPublishRevisionDriveItem,
  plan: ProjectPublishWritePlan,
  projectFolderId: string,
) {
  return (
    file.name === HISTORY_FOLDER_NAME &&
    file.mimeType === FOLDER_MIME_TYPE &&
    file.parents?.includes(projectFolderId) === true &&
    file.trashed !== true &&
    hasBaseMetadata(file, PROJECT_HISTORY_FOLDER_ROLE, plan)
  );
}

function isValidRevisionsFolder(
  file: ProjectPublishRevisionDriveItem,
  plan: ProjectPublishWritePlan,
  historyFolderId: string,
) {
  return (
    file.name === REVISIONS_FOLDER_NAME &&
    file.mimeType === FOLDER_MIME_TYPE &&
    file.parents?.includes(historyFolderId) === true &&
    file.trashed !== true &&
    hasBaseMetadata(file, PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE, plan)
  );
}

function isValidRevisionFile(
  file: ProjectPublishRevisionDriveItem,
  plan: ProjectPublishWritePlan,
  revisionsFolderId: string,
) {
  const expected = plan.revisionFile.appProperties;
  return (
    file.name === plan.revisionFile.filename &&
    file.mimeType === JSON_MIME_TYPE &&
    file.parents?.includes(revisionsFolderId) === true &&
    file.trashed !== true &&
    Object.entries(expected).every(
      ([key, value]) => file.appProperties[key] === value,
    ) &&
    file.appProperties.role === PROJECT_PUBLISH_REVISION_FILE_ROLE
  );
}

function hasBaseMetadata(
  file: ProjectPublishRevisionDriveItem,
  role: string,
  plan: ProjectPublishWritePlan,
) {
  return (
    file.appProperties.app === APP_ID &&
    file.appProperties.role === role &&
    file.appProperties.schemaVersion === SCHEMA_VERSION_PROPERTY &&
    file.appProperties.workspaceId === plan.workspaceId &&
    file.appProperties.projectId === plan.projectId
  );
}

function sameStringRecord(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && left[key] === right[key],
    )
  );
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new ExecutorFailure("aborted");
}

function isAbort(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof ExecutorFailure && error.code === "aborted")
  );
}

function success(
  plan: ProjectPublishWritePlan,
  status: "created" | "alreadyPrepared",
): PrepareProjectPublishRevisionResult {
  return {
    ok: true,
    status,
    revisionId: plan.revisionFile.revisionId,
    operationId: plan.operationId,
    initialPublish: plan.initialPublish,
    verified: true,
  };
}

function failure(
  code: PrepareProjectPublishRevisionErrorCode,
): PrepareProjectPublishRevisionResult {
  const messages: Record<PrepareProjectPublishRevisionErrorCode, string> = {
    invalidWritePlan: "公開履歴の準備計画が正しくありません。",
    projectFolderNotFound: "対象プロジェクトの保存場所が見つかりません。",
    duplicateProjectFolder: "対象プロジェクトの保存場所が重複しています。",
    invalidProjectFolder: "対象プロジェクトの保存場所が正しくありません。",
    duplicateHistoryFolder: "公開履歴の保存場所が重複しています。",
    invalidHistoryFolder: "公開履歴の保存場所が正しくありません。",
    historyFolderCreateFailed: "公開履歴の保存場所を作成できませんでした。",
    historyFolderVerificationFailed: "作成した公開履歴の保存場所を確認できませんでした。",
    duplicateRevisionsFolder: "公開履歴ファイルの保存場所が重複しています。",
    invalidRevisionsFolder: "公開履歴ファイルの保存場所が正しくありません。",
    revisionsFolderCreateFailed: "公開履歴ファイルの保存場所を作成できませんでした。",
    revisionsFolderVerificationFailed:
      "作成した公開履歴ファイルの保存場所を確認できませんでした。",
    duplicateRevision: "同じ公開履歴IDのファイルが複数あります。",
    revisionConflict: "公開履歴の準備中に競合が見つかりました。",
    revisionCreateFailed: "公開履歴ファイルを作成できませんでした。",
    revisionReadFailed: "既存の公開履歴ファイルを確認できませんでした。",
    revisionVerificationFailed: "作成した公開履歴を確認できませんでした。",
    driveWriteFailed: "公開履歴の準備中にDrive処理を完了できませんでした。",
    aborted: "公開履歴の準備を中止しました。",
  };
  return {
    ok: false,
    code,
    message: messages[code],
    recoverability: recoverability(code),
  };
}

function recoverability(
  code: PrepareProjectPublishRevisionErrorCode,
): PrepareProjectPublishRevisionRecoverability {
  if (
    code === "duplicateProjectFolder" ||
    code === "duplicateHistoryFolder" ||
    code === "duplicateRevisionsFolder" ||
    code === "duplicateRevision" ||
    code === "revisionConflict"
  ) {
    return "conflict";
  }
  if (
    code === "invalidWritePlan" ||
    code === "invalidProjectFolder" ||
    code === "invalidHistoryFolder" ||
    code === "historyFolderVerificationFailed" ||
    code === "invalidRevisionsFolder" ||
    code === "revisionsFolderVerificationFailed" ||
    code === "revisionVerificationFailed"
  ) {
    return "requiresInspection";
  }
  return "retryable";
}
