import {
  createProjectPublishRevisionDriveAdapter,
  type ProjectPublishRevisionDriveItem,
  type ProjectPublishRevisionWriteAdapter,
} from "./project-publish-drive-adapter";
import {
  getProjectPublishRevisionCanonicalHash,
  parseProjectPublishRevision,
  stringifyProjectPublishRevisionCanonical,
} from "./project-publish-revision";
import {
  isValidProjectRollbackWritePlan,
  type ProjectRollbackWritePlan,
} from "./project-rollback-write-plan";

export type PrepareProjectRollbackRevisionResult =
  | {
      ok: true;
      status: "created" | "alreadyPrepared";
      revisionId: string;
      verified: true;
    }
  | {
      ok: false;
      code: string;
      message: string;
      recoverability: "retryable" | "conflict" | "requiresInspection";
    };

export type ProjectRollbackRevisionWriterAdapter = Pick<
  ProjectPublishRevisionWriteAdapter,
  | "findProjectFolders"
  | "findHistoryFolders"
  | "findRevisionsFolders"
  | "findRevisionFiles"
  | "createRevisionFile"
  | "readRevisionFile"
>;

export async function prepareProjectRollbackRevisionInDrive(input: {
  accessToken: string;
  plan: ProjectRollbackWritePlan;
  signal?: AbortSignal;
}): Promise<PrepareProjectRollbackRevisionResult> {
  if (!input.accessToken) return failure("driveWriteFailed", "retryable");
  return prepareProjectRollbackRevisionWithAdapter(
    input,
    createProjectPublishRevisionDriveAdapter(input.accessToken),
  );
}

export async function prepareProjectRollbackRevisionWithAdapter(
  input: {
    plan: ProjectRollbackWritePlan;
    signal?: AbortSignal;
  },
  adapter: ProjectRollbackRevisionWriterAdapter,
): Promise<PrepareProjectRollbackRevisionResult> {
  if (!isValidProjectRollbackWritePlan(input.plan)) {
    return failure("invalidWritePlan", "requiresInspection");
  }
  const signal = input.signal ?? new AbortController().signal;
  const context = {
    workspaceId: input.plan.workspaceId,
    projectId: input.plan.projectId,
    signal,
  };
  try {
    throwIfAborted(signal);
    const projects = await adapter.findProjectFolders(context);
    if (
      projects.length !== 1 ||
      projects[0].id !== input.plan.locations.projectFolder.id
    ) {
      return failure(
        projects.length > 1 ? "duplicateProjectFolder" : "projectFolderConflict",
        "conflict",
      );
    }
    const history = await adapter.findHistoryFolders({
      ...context,
      parentFolderId: projects[0].id,
    });
    if (
      history.length !== 1 ||
      history[0].id !== input.plan.locations.historyFolder.id
    ) {
      return failure(
        history.length > 1 ? "duplicateHistoryFolder" : "historyFolderConflict",
        "conflict",
      );
    }
    const revisions = await adapter.findRevisionsFolders({
      ...context,
      parentFolderId: history[0].id,
    });
    if (
      revisions.length !== 1 ||
      revisions[0].id !== input.plan.locations.revisionsFolder.id
    ) {
      return failure(
        revisions.length > 1
          ? "duplicateRevisionsFolder"
          : "revisionsFolderConflict",
        "conflict",
      );
    }
    const revisionContext = {
      ...context,
      parentFolderId: revisions[0].id,
      revisionId: input.plan.revisionFile.revisionId,
    };
    let candidates = await adapter.findRevisionFiles(revisionContext);
    if (candidates.length > 1) {
      return failure("duplicateRevision", "requiresInspection");
    }
    if (candidates.length === 1) {
      return (await verifyExactRevision(
        candidates[0],
        revisions[0].id,
        input.plan,
        adapter,
        signal,
      ))
        ? success(input.plan, "alreadyPrepared")
        : failure("revisionConflict", "conflict");
    }

    let createThrew = false;
    try {
      await adapter.createRevisionFile({
        ...context,
        parentFolderId: revisions[0].id,
        filename: input.plan.revisionFile.filename,
        canonicalBody: input.plan.revisionFile.canonicalBody,
        appProperties: { ...input.plan.revisionFile.appProperties },
      });
    } catch (error) {
      if (isAbort(error, signal)) throw error;
      createThrew = true;
    }
    candidates = await adapter.findRevisionFiles(revisionContext);
    if (candidates.length > 1) {
      return failure("duplicateRevision", "requiresInspection");
    }
    if (candidates.length !== 1) {
      return failure(
        createThrew ? "revisionCreateUnknown" : "revisionVerificationFailed",
        createThrew ? "requiresInspection" : "retryable",
      );
    }
    const exact = await verifyExactRevision(
      candidates[0],
      revisions[0].id,
      input.plan,
      adapter,
      signal,
    );
    if (!exact) {
      return failure(
        createThrew ? "revisionCreateUnknown" : "revisionVerificationFailed",
        "requiresInspection",
      );
    }
    return success(input.plan, "created");
  } catch (error) {
    if (isAbort(error, signal)) return failure("aborted", "retryable");
    return failure("driveWriteFailed", "retryable");
  }
}

async function verifyExactRevision(
  file: ProjectPublishRevisionDriveItem,
  revisionsFolderId: string,
  plan: ProjectRollbackWritePlan,
  adapter: ProjectRollbackRevisionWriterAdapter,
  signal: AbortSignal,
) {
  if (
    file.name !== plan.revisionFile.filename ||
    file.mimeType !== "application/json" ||
    file.trashed === true ||
    file.parents?.length !== 1 ||
    file.parents[0] !== revisionsFolderId ||
    Object.entries(plan.revisionFile.appProperties).some(
      ([key, value]) => file.appProperties[key] !== value,
    )
  ) {
    return false;
  }
  const text = await adapter.readRevisionFile({ fileId: file.id, signal });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return false;
  }
  const parsed = parseProjectPublishRevision(body);
  return (
    parsed.ok &&
    stringifyProjectPublishRevisionCanonical(parsed.value) ===
      plan.revisionFile.canonicalBody &&
    getProjectPublishRevisionCanonicalHash(parsed.value) ===
      plan.revisionFile.canonicalHash
  );
}

function success(
  plan: ProjectRollbackWritePlan,
  status: "created" | "alreadyPrepared",
): Extract<PrepareProjectRollbackRevisionResult, { ok: true }> {
  return {
    ok: true,
    status,
    revisionId: plan.revisionFile.revisionId,
    verified: true,
  };
}

function failure(
  code: string,
  recoverability: "retryable" | "conflict" | "requiresInspection",
): Extract<PrepareProjectRollbackRevisionResult, { ok: false }> {
  return {
    ok: false,
    code,
    recoverability,
    message:
      recoverability === "retryable"
        ? "rollback revisionの準備を完了できませんでした。再試行できます。"
        : "rollback revisionの状態を安全に確定できません。最新履歴を確認してください。",
  };
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}

function isAbort(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}
