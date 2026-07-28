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
  getProjectManifestContentCanonicalHash,
  parseProjectPublishRevision,
  stringifyCanonicalJson,
  stringifyProjectPublishRevisionCanonical,
  type CanonicalJsonValue,
} from "./project-publish-revision";
import {
  isValidProjectRollbackWritePlan,
  type ProjectRollbackWritePlan,
} from "./project-rollback-write-plan";

export type CommitProjectRollbackManifestResult =
  | {
      ok: true;
      status: "committed" | "alreadyCommitted";
      revisionId: string;
      committed: true;
    }
  | {
      ok: false;
      code: string;
      message: string;
      recoverability: "retryable" | "conflict" | "requiresInspection";
    };

export type ProjectRollbackManifestCommitAdapter =
  ProjectPublishManifestCommitAdapter;

export async function commitProjectRollbackManifestInDrive(input: {
  accessToken: string;
  plan: ProjectRollbackWritePlan;
  signal?: AbortSignal;
}): Promise<CommitProjectRollbackManifestResult> {
  if (!input.accessToken) return failure("driveWriteFailed", "retryable");
  return commitProjectRollbackManifestWithAdapter(
    input,
    createProjectPublishManifestCommitAdapter(input.accessToken),
  );
}

export async function commitProjectRollbackManifestWithAdapter(
  input: { plan: ProjectRollbackWritePlan; signal?: AbortSignal },
  adapter: ProjectRollbackManifestCommitAdapter,
): Promise<CommitProjectRollbackManifestResult> {
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
    const projects = await adapter.findProjectFolders(context);
    if (
      projects.length !== 1 ||
      projects[0].id !== input.plan.locations.projectFolder.id
    ) {
      return failure("projectFolderConflict", "conflict");
    }
    const prepared = await loadPreparedRevision(
      input.plan,
      projects[0].id,
      adapter,
      signal,
    );
    if (!prepared.ok) return prepared.failure;

    const manifests = await adapter.findCurrentManifestFiles({
      ...context,
      parentFolderId: projects[0].id,
    });
    if (
      manifests.length !== 1 ||
      manifests[0].id !== input.plan.locations.manifestFile.id
    ) {
      return failure(
        manifests.length > 1
          ? "duplicateCurrentManifest"
          : "currentManifestConflict",
        "conflict",
      );
    }
    const manifestFile = manifests[0];
    const currentText = await adapter.readCurrentManifest({
      fileId: manifestFile.id,
      signal,
    });
    const current = parseManifestText(currentText);
    if (!current) return failure("currentManifestInvalid", "conflict");

    if (manifestEquals(current, input.plan.currentManifestUpdate.body)) {
      return success(input.plan, "alreadyCommitted");
    }
    if (
      current.publication?.currentRevisionId ===
        input.plan.revisionFile.revisionId ||
      current.publication?.operationId === input.plan.operationId
    ) {
      return failure("publicationConflict", "requiresInspection");
    }
    if (
      manifestFile.modifiedTime !==
        input.plan.expectedCurrent.manifestModifiedTime ||
      getProjectManifestContentCanonicalHash(current) !==
        input.plan.expectedCurrent.manifestCanonicalHash ||
      current.publication?.currentRevisionId !==
        input.plan.expectedCurrent.currentRevisionId
    ) {
      return failure("currentManifestChanged", "conflict");
    }

    const nextText = stringifyProjectManifestJson(
      input.plan.currentManifestUpdate.body,
    );
    let updateThrew = false;
    try {
      await adapter.updateCurrentManifest({
        fileId: manifestFile.id,
        jsonText: nextText,
        signal,
      });
    } catch (error) {
      if (isAbort(error, signal)) throw error;
      updateThrew = true;
    }
    const verified = await readCommittedManifest(
      input.plan,
      projects[0].id,
      manifestFile.id,
      adapter,
      signal,
    );
    if (verified) return success(input.plan, "committed");
    return failure(
      updateThrew
        ? "currentManifestUpdateUnknown"
        : "currentManifestVerificationFailed",
      "requiresInspection",
    );
  } catch (error) {
    if (isAbort(error, signal)) return failure("aborted", "retryable");
    return failure("driveWriteFailed", "retryable");
  }
}

async function loadPreparedRevision(
  plan: ProjectRollbackWritePlan,
  projectFolderId: string,
  adapter: ProjectRollbackManifestCommitAdapter,
  signal: AbortSignal,
): Promise<
  | { ok: true }
  | {
      ok: false;
      failure: Extract<CommitProjectRollbackManifestResult, { ok: false }>;
    }
> {
  const history = await adapter.findHistoryFolders({
    workspaceId: plan.workspaceId,
    projectId: plan.projectId,
    parentFolderId: projectFolderId,
    signal,
  });
  if (
    history.length !== 1 ||
    history[0].id !== plan.locations.historyFolder.id
  ) {
    return { ok: false, failure: failure("historyFolderConflict", "conflict") };
  }
  const revisions = await adapter.findRevisionsFolders({
    workspaceId: plan.workspaceId,
    projectId: plan.projectId,
    parentFolderId: history[0].id,
    signal,
  });
  if (
    revisions.length !== 1 ||
    revisions[0].id !== plan.locations.revisionsFolder.id
  ) {
    return {
      ok: false,
      failure: failure("revisionsFolderConflict", "conflict"),
    };
  }
  const files = await adapter.findRevisionFiles({
    workspaceId: plan.workspaceId,
    projectId: plan.projectId,
    parentFolderId: revisions[0].id,
    revisionId: plan.revisionFile.revisionId,
    signal,
  });
  if (files.length !== 1) {
    return {
      ok: false,
      failure: failure(
        files.length > 1 ? "duplicatePreparedRevision" : "preparedRevisionNotFound",
        files.length > 1 ? "requiresInspection" : "conflict",
      ),
    };
  }
  const text = await adapter.readRevisionFile({
    fileId: files[0].id,
    signal,
  });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return {
      ok: false,
      failure: failure("preparedRevisionConflict", "requiresInspection"),
    };
  }
  const parsed = parseProjectPublishRevision(body);
  if (
    !parsed.ok ||
    stringifyProjectPublishRevisionCanonical(parsed.value) !==
      plan.revisionFile.canonicalBody
  ) {
    return {
      ok: false,
      failure: failure("preparedRevisionConflict", "requiresInspection"),
    };
  }
  return { ok: true };
}

async function readCommittedManifest(
  plan: ProjectRollbackWritePlan,
  projectFolderId: string,
  fileId: string,
  adapter: ProjectRollbackManifestCommitAdapter,
  signal: AbortSignal,
) {
  const files = await adapter.findCurrentManifestFiles({
    workspaceId: plan.workspaceId,
    projectId: plan.projectId,
    parentFolderId: projectFolderId,
    signal,
  });
  if (files.length !== 1 || files[0].id !== fileId) return false;
  const text = await adapter.readCurrentManifest({ fileId, signal });
  const manifest = parseManifestText(text);
  return manifest
    ? manifestEquals(manifest, plan.currentManifestUpdate.body)
    : false;
}

function parseManifestText(text: string): ProjectManifest | null {
  try {
    const parsed = parseProjectManifest(JSON.parse(text));
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

function manifestEquals(left: ProjectManifest, right: ProjectManifest) {
  return (
    stringifyCanonicalJson(left as unknown as CanonicalJsonValue) ===
      stringifyCanonicalJson(right as unknown as CanonicalJsonValue) &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.publication?.operation === "rollback" &&
    getProjectManifestContentCanonicalHash(left) ===
      right.publication?.contentCanonicalHash
  );
}

function success(
  plan: ProjectRollbackWritePlan,
  status: "committed" | "alreadyCommitted",
): Extract<CommitProjectRollbackManifestResult, { ok: true }> {
  return {
    ok: true,
    status,
    revisionId: plan.revisionFile.revisionId,
    committed: true,
  };
}

function failure(
  code: string,
  recoverability: "retryable" | "conflict" | "requiresInspection",
): Extract<CommitProjectRollbackManifestResult, { ok: false }> {
  return {
    ok: false,
    code,
    recoverability,
    message:
      recoverability === "retryable"
        ? "manifestのrollback反映を完了できませんでした。再試行できます。"
        : "manifestの反映状態を安全に確定できません。履歴と現在状態を確認してください。",
  };
}

function isAbort(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}
