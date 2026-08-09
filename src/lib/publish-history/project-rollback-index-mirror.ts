import {
  readDriveFileMetadata,
  readDriveTextFile,
  updateDriveJsonFileContent,
  validateIndexJsonProjects,
  type DriveFileCandidate,
  type DriveProjectSummary,
} from "../google-drive";
import {
  getProjectRollbackIndexCanonicalHash,
  projectRollbackMetadataSnapshotEquals,
  snapshotProjectRollbackMetadata,
  type ProjectRollbackWritePlan,
} from "./project-rollback-write-plan";

export type MirrorProjectRollbackIndexResult =
  | {
      ok: true;
      status: "mirrored" | "alreadyMirrored";
      mirrored: true;
    }
  | {
      ok: false;
      code: string;
      message: string;
      recoverability: "retryable" | "conflict" | "requiresInspection";
    };

export type ProjectRollbackIndexMirrorAdapter = {
  readMetadata(input: {
    accessToken: string;
    fileId: string;
    signal: AbortSignal;
  }): Promise<DriveFileCandidate>;
  readText(
    accessToken: string,
    fileId: string,
    signal: AbortSignal,
  ): Promise<string>;
  update(input: {
    accessToken: string;
    fileId: string;
    jsonText: string;
    signal: AbortSignal;
  }): Promise<void>;
};

export function createProjectRollbackIndexMirrorDriveAdapter(): ProjectRollbackIndexMirrorAdapter {
  return {
    readMetadata: readDriveFileMetadata,
    readText: readDriveTextFile,
    update: updateDriveJsonFileContent,
  };
}

export async function mirrorProjectRollbackIndexInDrive(input: {
  accessToken: string;
  plan: ProjectRollbackWritePlan;
  signal?: AbortSignal;
}): Promise<MirrorProjectRollbackIndexResult> {
  return mirrorProjectRollbackIndexWithAdapter(
    input,
    createProjectRollbackIndexMirrorDriveAdapter(),
  );
}

export async function mirrorProjectRollbackIndexWithAdapter(
  input: {
    accessToken: string;
    plan: ProjectRollbackWritePlan;
    signal?: AbortSignal;
  },
  adapter: ProjectRollbackIndexMirrorAdapter,
): Promise<MirrorProjectRollbackIndexResult> {
  const signal = input.signal ?? new AbortController().signal;
  try {
    const [metadataFile, text] = await Promise.all([
      adapter.readMetadata({
        accessToken: input.accessToken,
        fileId: input.plan.indexMirror.fileId,
        signal,
      }),
      adapter.readText(
        input.accessToken,
        input.plan.indexMirror.fileId,
        signal,
      ),
    ]);
    const body = parseObject(text);
    if (!body || !formalIndexContains(text, input.plan.indexMirror.expectedProject)) {
      return failure("invalidIndex", "conflict");
    }
    if (indexProjectIsDesired(text, input.plan.indexMirror.nextProject)) {
      return success("alreadyMirrored");
    }
    if (
      !projectRollbackMetadataSnapshotEquals(
        snapshotProjectRollbackMetadata(metadataFile),
        input.plan.indexMirror.expectedMetadata,
      ) ||
      getProjectRollbackIndexCanonicalHash(body) !==
        input.plan.indexMirror.expectedCanonicalHash ||
      !indexProjectEquals(text, input.plan.indexMirror.expectedProject)
    ) {
      return failure("staleIndex", "conflict");
    }

    const desired = buildDesiredIndexBody(
      body,
      input.plan.indexMirror.expectedProject,
      input.plan.indexMirror.nextProject,
    );
    if (!desired) return failure("invalidIndex", "conflict");
    const desiredText = `${JSON.stringify(desired, null, 2)}\n`;
    let updateThrew = false;
    try {
      await adapter.update({
        accessToken: input.accessToken,
        fileId: input.plan.indexMirror.fileId,
        jsonText: desiredText,
        signal,
      });
    } catch (error) {
      if (isAbort(error, signal)) throw error;
      updateThrew = true;
    }
    const verifiedText = await adapter.readText(
      input.accessToken,
      input.plan.indexMirror.fileId,
      signal,
    );
    const verified = parseObject(verifiedText);
    if (
      verified &&
      validateIndexJsonProjects(verifiedText).status === "ready" &&
      getProjectRollbackIndexCanonicalHash(verified) ===
        getProjectRollbackIndexCanonicalHash(desired) &&
      indexProjectIsDesired(verifiedText, input.plan.indexMirror.nextProject)
    ) {
      return success("mirrored");
    }
    return failure(
      updateThrew ? "indexUpdateUnknown" : "indexVerificationFailed",
      "requiresInspection",
    );
  } catch (error) {
    if (isAbort(error, signal)) return failure("aborted", "retryable");
    return failure("driveWriteFailed", "retryable");
  }
}

export function buildDesiredIndexBody(
  indexBody: Record<string, unknown>,
  expectedProject: DriveProjectSummary,
  nextProject: DriveProjectSummary,
): Record<string, unknown> | null {
  if (!Array.isArray(indexBody.projects)) return null;
  let matches = 0;
  const projects = indexBody.projects.map((value) => {
    if (!isRecord(value) || value.projectId !== expectedProject.projectId) {
      return structuredClone(value);
    }
    matches += 1;
    if (!recordMatchesProject(value, expectedProject)) return null;
    return {
      ...structuredClone(value),
      title: nextProject.title,
      updatedAt: nextProject.updatedAt,
    };
  });
  if (matches !== 1 || projects.some((project) => project === null)) {
    return null;
  }
  return { ...structuredClone(indexBody), projects };
}

function formalIndexContains(text: string, project: DriveProjectSummary) {
  const result = validateIndexJsonProjects(text);
  return (
    result.status === "ready" &&
    result.projects.filter((item) => item.projectId === project.projectId)
      .length === 1
  );
}

function indexProjectEquals(text: string, project: DriveProjectSummary) {
  const result = validateIndexJsonProjects(text);
  const actual =
    result.status === "ready"
      ? result.projects.find((item) => item.projectId === project.projectId)
      : null;
  return actual ? JSON.stringify(actual) === JSON.stringify(project) : false;
}

function indexProjectIsDesired(text: string, project: DriveProjectSummary) {
  return indexProjectEquals(text, project);
}

function recordMatchesProject(
  value: Record<string, unknown>,
  project: DriveProjectSummary,
) {
  return (
    value.projectId === project.projectId &&
    value.title === project.title &&
    value.projectFolderId === project.projectFolderId &&
    value.manifestFileId === project.manifestFileId &&
    value.assetsFolderId === project.assetsFolderId &&
    value.manifestPath === project.manifestPath &&
    value.createdAt === project.createdAt &&
    value.updatedAt === project.updatedAt
  );
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function success(
  status: "mirrored" | "alreadyMirrored",
): Extract<MirrorProjectRollbackIndexResult, { ok: true }> {
  return { ok: true, status, mirrored: true };
}

function failure(
  code: string,
  recoverability: "retryable" | "conflict" | "requiresInspection",
): Extract<MirrorProjectRollbackIndexResult, { ok: false }> {
  return {
    ok: false,
    code,
    recoverability,
    message:
      recoverability === "retryable"
        ? "index mirrorを完了できませんでした。再試行できます。"
        : "rollback本体は成功しましたが、index mirrorは要確認です。",
  };
}

function isAbort(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}
