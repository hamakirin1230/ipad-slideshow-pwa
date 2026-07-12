import {
  escapeDriveReadOnlyQueryValue,
  listDriveFilesReadOnlyPage,
  readDriveTextFile,
  type DriveFileCandidate,
  type DriveReadOnlyFileListPage,
} from "../google-drive";
import {
  isValidProjectPublishRevisionId,
  parseProjectPublishRevision,
  type ProjectPublishOperation,
  type ProjectPublishRevision,
  type ProjectPublishRevisionValidationError,
} from "./project-publish-revision";

export const PROJECT_HISTORY_FOLDER_ROLE = "projectHistory" as const;
export const PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE =
  "projectPublishRevisions" as const;
export const PROJECT_PUBLISH_REVISION_FILE_ROLE =
  "projectPublishRevision" as const;

const APP_ID = "ipad-slideshow-pwa";
const SCHEMA_VERSION_PROPERTY = "1";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const JSON_MIME_TYPE = "application/json";
const HISTORY_FOLDER_NAME = "history";
const REVISIONS_FOLDER_NAME = "revisions";
const MAX_SCAN_COUNT = 200;
const DEFAULT_LIST_LIMIT = 50;
const FILE_FIELDS = "id,name,mimeType,modifiedTime,appProperties,parents,trashed";
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

type HistoryContextInput = {
  accessToken: string;
  workspaceId: string;
  projectId: string;
  projectFolderId: string;
  signal: AbortSignal;
};

type InternalProjectPublishHistoryLocation = {
  revisionsFolderId: string;
};

type InternalRevisionDriveFile = {
  driveFileId: string;
  revisionId: string;
  operation: ProjectPublishOperation;
  publishedAt: string;
  schemaVersion: 1;
  modifiedTime: string | null;
};

export type ProjectPublishHistoryAvailability =
  | "notConfigured"
  | "ready";

export type LoadProjectPublishHistoryLocationResult =
  | { ok: true; status: ProjectPublishHistoryAvailability }
  | {
      ok: false;
      code:
        | "duplicateHistoryFolder"
        | "invalidHistoryFolder"
        | "duplicateRevisionsFolder"
        | "invalidRevisionsFolder"
        | "driveReadFailed";
      message: string;
    };

export type ProjectPublishRevisionListItem = {
  revisionId: string;
  operation: ProjectPublishOperation | null;
  publishedAt: string | null;
  schemaVersion: number | null;
  modifiedTime: string | null;
  metadataStatus: "ready" | "invalid";
};

export type ListProjectPublishRevisionsResult =
  | { ok: true; status: "notConfigured" }
  | {
      ok: true;
      status: "ready";
      items: ProjectPublishRevisionListItem[];
      invalidMetadataCount: number;
      ignoredFileCount: number;
      duplicateRevisionIdCount: number;
    }
  | {
      ok: false;
      code: LoadProjectPublishHistoryLocationErrorCode | "driveReadFailed";
      message: string;
    };

export type LoadProjectPublishRevisionResult =
  | { ok: true; revision: ProjectPublishRevision }
  | {
      ok: false;
      code:
        | LoadProjectPublishHistoryLocationErrorCode
        | "notFound"
        | "duplicateRevision"
        | "invalidMetadata"
        | "invalidJson"
        | "invalidRevision"
        | "metadataBodyMismatch"
        | "driveReadFailed";
      message: string;
      validationErrors?: ProjectPublishRevisionValidationError[];
    };

type LoadProjectPublishHistoryLocationErrorCode = Exclude<
  Extract<LoadProjectPublishHistoryLocationResult, { ok: false }>["code"],
  never
>;

type LoaderDependencies = {
  listPage: (input: Parameters<typeof listDriveFilesReadOnlyPage>[0]) => Promise<DriveReadOnlyFileListPage>;
  readText: typeof readDriveTextFile;
};

const defaultDependencies: LoaderDependencies = {
  listPage: listDriveFilesReadOnlyPage,
  readText: readDriveTextFile,
};

export async function loadProjectPublishHistoryLocation(
  input: HistoryContextInput,
): Promise<LoadProjectPublishHistoryLocationResult> {
  const resolved = await resolveHistoryLocation(input, defaultDependencies);
  return resolved.ok
    ? { ok: true, status: resolved.status }
    : resolved;
}

export async function listProjectPublishRevisions(
  input: HistoryContextInput & { limit?: number },
): Promise<ListProjectPublishRevisionsResult> {
  return listProjectPublishRevisionsWithDependencies(input, defaultDependencies);
}

export async function loadProjectPublishRevision(
  input: HistoryContextInput & { revisionId: string },
): Promise<LoadProjectPublishRevisionResult> {
  return loadProjectPublishRevisionWithDependencies(input, defaultDependencies);
}

async function resolveHistoryLocation(
  input: HistoryContextInput,
  dependencies: LoaderDependencies,
): Promise<
  | { ok: true; status: "notConfigured" }
  | { ok: true; status: "ready"; location: InternalProjectPublishHistoryLocation }
  | Extract<LoadProjectPublishHistoryLocationResult, { ok: false }>
> {
  try {
    const projectChildren = await listAllChildren(
      input,
      input.projectFolderId,
      dependencies,
    );
    const historyCandidates = projectChildren.filter(
      (file) =>
        file.name === HISTORY_FOLDER_NAME ||
        file.appProperties.role === PROJECT_HISTORY_FOLDER_ROLE,
    );
    if (historyCandidates.length === 0) return { ok: true, status: "notConfigured" };
    if (historyCandidates.length > 1) {
      return locationError("duplicateHistoryFolder", "公開履歴が重複しています。");
    }
    const historyFolder = historyCandidates[0];
    if (!isValidFolder(historyFolder, {
      expectedName: HISTORY_FOLDER_NAME,
      expectedRole: PROJECT_HISTORY_FOLDER_ROLE,
      expectedParentId: input.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    })) {
      return locationError("invalidHistoryFolder", "公開履歴フォルダが正しくありません。");
    }

    const historyChildren = await listAllChildren(
      input,
      historyFolder.id,
      dependencies,
    );
    const revisionsCandidates = historyChildren.filter(
      (file) =>
        file.name === REVISIONS_FOLDER_NAME ||
        file.appProperties.role === PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
    );
    if (revisionsCandidates.length !== 1) {
      return revisionsCandidates.length > 1
        ? locationError("duplicateRevisionsFolder", "公開履歴の保存場所が重複しています。")
        : locationError("invalidRevisionsFolder", "公開履歴の保存場所が正しくありません。");
    }
    const revisionsFolder = revisionsCandidates[0];
    if (!isValidFolder(revisionsFolder, {
      expectedName: REVISIONS_FOLDER_NAME,
      expectedRole: PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
      expectedParentId: historyFolder.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    })) {
      return locationError("invalidRevisionsFolder", "公開履歴の保存場所が正しくありません。");
    }
    return {
      ok: true,
      status: "ready",
      location: { revisionsFolderId: revisionsFolder.id },
    };
  } catch {
    return locationError("driveReadFailed", "公開履歴フォルダを確認できませんでした。");
  }
}

async function listProjectPublishRevisionsWithDependencies(
  input: HistoryContextInput & { limit?: number },
  dependencies: LoaderDependencies,
): Promise<ListProjectPublishRevisionsResult> {
  const limit = input.limit ?? DEFAULT_LIST_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DEFAULT_LIST_LIMIT) {
    return { ok: false, code: "driveReadFailed", message: "公開履歴の取得条件が正しくありません。" };
  }
  const location = await resolveHistoryLocation(input, dependencies);
  if (!location.ok) return location;
  if (location.status === "notConfigured") return location;

  try {
    const files = await listAllChildren(
      input,
      location.location.revisionsFolderId,
      dependencies,
    );
    const items: ProjectPublishRevisionListItem[] = [];
    let invalidMetadataCount = 0;
    let ignoredFileCount = 0;
    const revisionIdCounts = new Map<string, number>();

    for (const file of files) {
      if (!file.appProperties.role) {
        ignoredFileCount += 1;
        continue;
      }
      if (file.appProperties.role !== PROJECT_PUBLISH_REVISION_FILE_ROLE) {
        invalidMetadataCount += 1;
        continue;
      }
      const parsed = parseRevisionFileMetadata(
        file,
        input,
        location.location.revisionsFolderId,
      );
      if (!parsed.ok) {
        invalidMetadataCount += 1;
        const revisionId = file.appProperties.revisionId;
        if (isValidProjectPublishRevisionId(revisionId)) {
          items.push(toInvalidListItem(file, revisionId));
          revisionIdCounts.set(revisionId, (revisionIdCounts.get(revisionId) ?? 0) + 1);
        }
        continue;
      }
      items.push(toListItem(parsed.file));
      revisionIdCounts.set(
        parsed.file.revisionId,
        (revisionIdCounts.get(parsed.file.revisionId) ?? 0) + 1,
      );
    }

    let duplicateRevisionIdCount = 0;
    for (const [revisionId, count] of revisionIdCounts) {
      if (count > 1) {
        duplicateRevisionIdCount += 1;
        for (const item of items) {
          if (item.revisionId === revisionId) item.metadataStatus = "invalid";
        }
      }
    }

    items.sort(compareListItems);
    return {
      ok: true,
      status: "ready",
      items: items.slice(0, limit),
      invalidMetadataCount,
      ignoredFileCount,
      duplicateRevisionIdCount,
    };
  } catch {
    return { ok: false, code: "driveReadFailed", message: "公開履歴を読み込めませんでした。" };
  }
}

async function loadProjectPublishRevisionWithDependencies(
  input: HistoryContextInput & { revisionId: string },
  dependencies: LoaderDependencies,
): Promise<LoadProjectPublishRevisionResult> {
  if (!isValidProjectPublishRevisionId(input.revisionId)) {
    return { ok: false, code: "invalidMetadata", message: "公開履歴の識別子が正しくありません。" };
  }
  const location = await resolveHistoryLocation(input, dependencies);
  if (!location.ok) return location;
  if (location.status === "notConfigured") {
    return { ok: false, code: "notFound", message: "公開履歴が見つかりません。" };
  }

  try {
    const files = await listAllChildren(
      input,
      location.location.revisionsFolderId,
      dependencies,
    );
    const candidates = files.filter(
      (file) =>
        file.appProperties.role === PROJECT_PUBLISH_REVISION_FILE_ROLE &&
        file.appProperties.revisionId === input.revisionId,
    );
    if (candidates.length === 0) {
      return { ok: false, code: "notFound", message: "公開履歴が見つかりません。" };
    }
    if (candidates.length > 1) {
      return { ok: false, code: "duplicateRevision", message: "同じ公開履歴が重複しています。" };
    }
    const metadata = parseRevisionFileMetadata(
      candidates[0],
      input,
      location.location.revisionsFolderId,
    );
    if (!metadata.ok) {
      return { ok: false, code: "invalidMetadata", message: "公開履歴ファイルが正しくありません。" };
    }

    let body: unknown;
    try {
      body = JSON.parse(
        await dependencies.readText(input.accessToken, metadata.file.driveFileId, input.signal),
      ) as unknown;
    } catch (error) {
      return error instanceof SyntaxError
        ? { ok: false, code: "invalidJson", message: "公開履歴のJSONが正しくありません。" }
        : { ok: false, code: "driveReadFailed", message: "公開履歴ファイルを読み込めませんでした。" };
    }

    const parsed = parseProjectPublishRevision(body);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "invalidRevision",
        message: "公開履歴データが正しくありません。",
        validationErrors: parsed.errors.slice(0, 20).map(({ path, message }) => ({ path, message })),
      };
    }
    if (!metadataMatchesBody(metadata.file, parsed.value, input.projectId)) {
      return { ok: false, code: "metadataBodyMismatch", message: "公開履歴のmetadataと本文が一致しません。" };
    }
    return { ok: true, revision: parsed.value };
  } catch {
    return { ok: false, code: "driveReadFailed", message: "公開履歴ファイルを読み込めませんでした。" };
  }
}

async function listAllChildren(
  input: HistoryContextInput,
  parentId: string,
  dependencies: LoaderDependencies,
): Promise<DriveFileCandidate[]> {
  const files: DriveFileCandidate[] = [];
  let pageToken: string | undefined;
  do {
    const page = await dependencies.listPage({
      accessToken: input.accessToken,
      query: [`'${escapeDriveReadOnlyQueryValue(parentId)}' in parents`, "trashed = false"].join(" and "),
      pageSize: 100,
      ...(pageToken ? { pageToken } : {}),
      fields: FILE_FIELDS,
      signal: input.signal,
    });
    files.push(...page.files.filter((file) => file.trashed !== true));
    if (files.length > MAX_SCAN_COUNT) throw new Error("scan-limit");
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

function isValidFolder(
  file: DriveFileCandidate,
  expected: {
    expectedName: string;
    expectedRole: string;
    expectedParentId: string;
    workspaceId: string;
    projectId: string;
  },
) {
  return (
    file.name === expected.expectedName &&
    file.mimeType === FOLDER_MIME_TYPE &&
    file.parents?.includes(expected.expectedParentId) === true &&
    file.trashed !== true &&
    file.appProperties.app === APP_ID &&
    file.appProperties.role === expected.expectedRole &&
    file.appProperties.schemaVersion === SCHEMA_VERSION_PROPERTY &&
    file.appProperties.workspaceId === expected.workspaceId &&
    file.appProperties.projectId === expected.projectId
  );
}

function parseRevisionFileMetadata(
  file: DriveFileCandidate,
  input: Pick<HistoryContextInput, "workspaceId" | "projectId">,
  expectedParentId: string,
): { ok: true; file: InternalRevisionDriveFile } | { ok: false } {
  const metadata = file.appProperties;
  const revisionId = metadata.revisionId;
  const operation = metadata.operation;
  const publishedAt = metadata.publishedAt;
  if (
    file.mimeType !== JSON_MIME_TYPE ||
    file.parents?.includes(expectedParentId) !== true ||
    file.trashed === true ||
    metadata.app !== APP_ID ||
    metadata.role !== PROJECT_PUBLISH_REVISION_FILE_ROLE ||
    metadata.schemaVersion !== SCHEMA_VERSION_PROPERTY ||
    metadata.workspaceId !== input.workspaceId ||
    metadata.projectId !== input.projectId ||
    !isValidProjectPublishRevisionId(revisionId) ||
    file.name !== `${revisionId}.json` ||
    (operation !== "publish" && operation !== "rollback") ||
    typeof publishedAt !== "string" ||
    !isValidIsoDateTime(publishedAt)
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    file: {
      driveFileId: file.id,
      revisionId,
      operation,
      publishedAt,
      schemaVersion: 1,
      modifiedTime: file.modifiedTime ?? null,
    },
  };
}

function metadataMatchesBody(
  metadata: InternalRevisionDriveFile,
  revision: ProjectPublishRevision,
  projectId: string,
) {
  return (
    revision.projectId === projectId &&
    revision.revisionId === metadata.revisionId &&
    revision.schemaVersion === metadata.schemaVersion &&
    revision.operation === metadata.operation &&
    revision.publishedAt === metadata.publishedAt
  );
}

function toListItem(file: InternalRevisionDriveFile): ProjectPublishRevisionListItem {
  return {
    revisionId: file.revisionId,
    operation: file.operation,
    publishedAt: file.publishedAt,
    schemaVersion: file.schemaVersion,
    modifiedTime: file.modifiedTime,
    metadataStatus: "ready",
  };
}

function toInvalidListItem(
  file: DriveFileCandidate,
  revisionId: string,
): ProjectPublishRevisionListItem {
  return {
    revisionId,
    operation:
      file.appProperties.operation === "publish" || file.appProperties.operation === "rollback"
        ? file.appProperties.operation
        : null,
    publishedAt: isValidIsoDateTime(file.appProperties.publishedAt)
      ? file.appProperties.publishedAt
      : null,
    schemaVersion:
      file.appProperties.schemaVersion === SCHEMA_VERSION_PROPERTY ? 1 : null,
    modifiedTime: file.modifiedTime ?? null,
    metadataStatus: "invalid",
  };
}

function compareListItems(
  left: ProjectPublishRevisionListItem,
  right: ProjectPublishRevisionListItem,
) {
  return (
    toSortableTimestamp(right.publishedAt) - toSortableTimestamp(left.publishedAt) ||
    right.revisionId.localeCompare(left.revisionId) ||
    toSortableTimestamp(right.modifiedTime) - toSortableTimestamp(left.modifiedTime)
  );
}

function isValidIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_TIME_PATTERN.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!match) return false;
  const probe = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return (
    probe.getUTCFullYear() === Number(match[1]) &&
    probe.getUTCMonth() === Number(match[2]) - 1 &&
    probe.getUTCDate() === Number(match[3])
  );
}

function toSortableTimestamp(value: string | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function locationError(
  code: Extract<LoadProjectPublishHistoryLocationResult, { ok: false }>["code"],
  message: string,
): Extract<LoadProjectPublishHistoryLocationResult, { ok: false }> {
  return { ok: false, code, message };
}
