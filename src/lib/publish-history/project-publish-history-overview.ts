import {
  parseProjectManifest,
  readDriveFileMetadata,
  readDriveTextFile,
  type DriveFileCandidate,
  type DriveProjectSummary,
  type ProjectManifest,
} from "../google-drive";
import {
  getProjectManifestContentCanonicalHash,
  type ProjectPublishOperation,
} from "./project-publish-revision";
import {
  listProjectPublishRevisions,
  loadProjectPublishRevision,
  type ListProjectPublishRevisionsResult,
  type LoadProjectPublishRevisionResult,
  type ProjectPublishRevisionListItem,
} from "./project-publish-revision-loader";

const APP_ID = "ipad-slideshow-pwa";
const SCHEMA_VERSION = "1";
const JSON_MIME_TYPE = "application/json";

export type ProjectPublicationOverviewStatus =
  | "unpublished"
  | "current"
  | "currentWithUnpublishedChanges"
  | "missingCurrentRevision"
  | "inconsistent"
  | "noPublicationWithHistory"
  | "unavailable";

export type ProjectPublicationOverview = {
  status: ProjectPublicationOverviewStatus;
  currentRevisionId: string | null;
  publishedAt: string | null;
  operation: ProjectPublishOperation | null;
  hasUnpublishedChanges: boolean | null;
  currentRevisionInList: boolean;
  currentRevisionMarker: "verified" | "needsInspection" | null;
  message: string;
  diagnostics: string[];
};

export type ProjectPublishHistoryOverview = {
  historyStatus: "notConfigured" | "ready";
  items: ProjectPublishRevisionListItem[];
  invalidMetadataCount: number;
  ignoredFileCount: number;
  duplicateRevisionIdCount: number;
  publication: ProjectPublicationOverview;
};

export type LoadProjectPublishHistoryOverviewResult =
  | { ok: true; overview: ProjectPublishHistoryOverview }
  | {
      ok: false;
      code:
        | "aborted"
        | "driveReadFailed"
        | "invalidManifestMetadata"
        | "invalidManifest"
        | "duplicateHistoryFolder"
        | "invalidHistoryFolder"
        | "duplicateRevisionsFolder"
        | "invalidRevisionsFolder";
      message: string;
    };

export type ProjectPublishHistoryOverviewAdapter = {
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
  loadRevision: (input: {
    accessToken: string;
    workspaceId: string;
    projectId: string;
    projectFolderId: string;
    revisionId: string;
    signal: AbortSignal;
  }) => Promise<LoadProjectPublishRevisionResult>;
};

const defaultAdapter: ProjectPublishHistoryOverviewAdapter = {
  readMetadata: readDriveFileMetadata,
  readText: readDriveTextFile,
  listRevisions: listProjectPublishRevisions,
  loadRevision: loadProjectPublishRevision,
};

export async function loadProjectPublishHistoryOverviewInDrive(input: {
  accessToken: string;
  workspaceId: string;
  project: DriveProjectSummary;
  signal: AbortSignal;
}): Promise<LoadProjectPublishHistoryOverviewResult> {
  return loadProjectPublishHistoryOverviewWithAdapter(input, defaultAdapter);
}

export async function loadProjectPublishHistoryOverviewWithAdapter(
  input: {
    accessToken: string;
    workspaceId: string;
    project: DriveProjectSummary;
    signal: AbortSignal;
  },
  adapter: ProjectPublishHistoryOverviewAdapter,
): Promise<LoadProjectPublishHistoryOverviewResult> {
  try {
    const [manifestFile, manifestText, history] = await Promise.all([
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
      adapter.listRevisions({
        accessToken: input.accessToken,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
        projectFolderId: input.project.projectFolderId,
        signal: input.signal,
      }),
    ]);

    if (input.signal.aborted) return overviewFailure("aborted");
    if (!isValidManifestMetadata(manifestFile, input)) {
      return overviewFailure("invalidManifestMetadata");
    }

    const manifest = parseFreshManifest(manifestText, input);
    if (!manifest) return overviewFailure("invalidManifest");
    if (!history.ok) return mapHistoryFailure(history.code);

    const historyOverview = {
      historyStatus: history.status,
      items: history.status === "ready" ? history.items : [],
      invalidMetadataCount:
        history.status === "ready" ? history.invalidMetadataCount : 0,
      ignoredFileCount: history.status === "ready" ? history.ignoredFileCount : 0,
      duplicateRevisionIdCount:
        history.status === "ready" ? history.duplicateRevisionIdCount : 0,
    } as const;
    const publication = manifest.publication;

    if (!publication) {
      const hasHistoryRevision =
        historyOverview.items.length > 0 ||
        historyOverview.invalidMetadataCount > 0 ||
        historyOverview.duplicateRevisionIdCount > 0;
      return {
        ok: true,
        overview: {
          ...historyOverview,
          publication: hasHistoryRevision
            ? publicationOverview({
                status: "noPublicationWithHistory",
                message:
                  "公開中のrevisionは設定されていませんが、履歴revisionが残っています。",
                diagnostics: [
                  "この画面では履歴revisionの自動分類や自動修復を行いません。",
                ],
              })
            : publicationOverview({
                status: "unpublished",
                message: "このprojectはまだ公開されていません。",
              }),
        },
      };
    }

    const currentRevisionInList = historyOverview.items.some(
      (item) => item.revisionId === publication.currentRevisionId,
    );
    const exact = await adapter.loadRevision({
      accessToken: input.accessToken,
      workspaceId: input.workspaceId,
      projectId: input.project.projectId,
      projectFolderId: input.project.projectFolderId,
      revisionId: publication.currentRevisionId,
      signal: input.signal,
    });
    if (input.signal.aborted) return overviewFailure("aborted");

    if (!exact.ok) {
      const status = classifyExactRevisionFailure(exact.code);
      return {
        ok: true,
        overview: {
          ...historyOverview,
          publication: publicationOverview({
            status,
            currentRevisionId: publication.currentRevisionId,
            publishedAt: publication.publishedAt,
            operation: publication.operation,
            currentRevisionInList,
            currentRevisionMarker: "needsInspection",
            message:
              status === "missingCurrentRevision"
                ? "manifestが参照する現在の公開revisionを確認できません。"
                : status === "unavailable"
                  ? "現在の公開情報をGoogle Driveから確認できませんでした。"
                  : "現在の公開情報と公開履歴が一致しません。",
            diagnostics:
              status === "missingCurrentRevision"
                ? ["自動修復は行いません。"]
                : status === "unavailable"
                  ? ["通信状態を確認して手動で再読込してください。"]
                  : ["Driveの状態を確認してください。自動修復は行いません。"],
          }),
        },
      };
    }

    const revision = exact.revision;
    if (
      revision.revisionId !== publication.currentRevisionId ||
      revision.publishedAt !== publication.publishedAt ||
      revision.operation !== publication.operation ||
      revision.sourceManifestCanonicalHash !== publication.contentCanonicalHash
    ) {
      return {
        ok: true,
        overview: {
          ...historyOverview,
          publication: publicationOverview({
            status: "inconsistent",
            currentRevisionId: publication.currentRevisionId,
            publishedAt: publication.publishedAt,
            operation: publication.operation,
            currentRevisionInList,
            currentRevisionMarker: "needsInspection",
            message: "現在の公開情報と公開履歴が一致しません。",
            diagnostics: [
              "publication metadataと参照先revisionの整合を確認できませんでした。",
              "自動修復は行いません。",
            ],
          }),
        },
      };
    }

    const hasUnpublishedChanges =
      getProjectManifestContentCanonicalHash(manifest) !==
      publication.contentCanonicalHash;
    return {
      ok: true,
      overview: {
        ...historyOverview,
        publication: publicationOverview({
          status: hasUnpublishedChanges
            ? "currentWithUnpublishedChanges"
            : "current",
          currentRevisionId: publication.currentRevisionId,
          publishedAt: publication.publishedAt,
          operation: publication.operation,
          hasUnpublishedChanges,
          currentRevisionInList,
          currentRevisionMarker: "verified",
          message: hasUnpublishedChanges
            ? "現在公開中のrevisionがあります。公開後に保存された未公開の編集があります。"
            : "このrevisionが現在公開中です。",
          diagnostics: currentRevisionInList
            ? []
            : [
                "現在公開中のrevisionは存在しますが、今回の一覧表示範囲には含まれていません。",
              ],
        }),
      },
    };
  } catch {
    return overviewFailure(input.signal.aborted ? "aborted" : "driveReadFailed");
  }
}

function isValidManifestMetadata(
  file: DriveFileCandidate,
  input: {
    workspaceId: string;
    project: DriveProjectSummary;
  },
) {
  const properties = file.appProperties;
  return (
    file.id === input.project.manifestFileId &&
    file.name === "manifest.json" &&
    file.mimeType === JSON_MIME_TYPE &&
    file.parents?.length === 1 &&
    file.parents[0] === input.project.projectFolderId &&
    file.trashed === false &&
    properties.app === APP_ID &&
    properties.role === "projectManifest" &&
    properties.schemaVersion === SCHEMA_VERSION &&
    properties.workspaceId === input.workspaceId &&
    properties.projectId === input.project.projectId
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
    parsed.value.projectId !== input.project.projectId
  ) {
    return null;
  }
  return parsed.value;
}

function publicationOverview(
  input: Partial<ProjectPublicationOverview> &
    Pick<ProjectPublicationOverview, "status" | "message">,
): ProjectPublicationOverview {
  return {
    status: input.status,
    currentRevisionId: input.currentRevisionId ?? null,
    publishedAt: input.publishedAt ?? null,
    operation: input.operation ?? null,
    hasUnpublishedChanges: input.hasUnpublishedChanges ?? null,
    currentRevisionInList: input.currentRevisionInList ?? false,
    currentRevisionMarker: input.currentRevisionMarker ?? null,
    message: input.message,
    diagnostics: input.diagnostics ? [...input.diagnostics] : [],
  };
}

function classifyExactRevisionFailure(
  code: Extract<LoadProjectPublishRevisionResult, { ok: false }>["code"],
): "missingCurrentRevision" | "inconsistent" | "unavailable" {
  if (code === "notFound") return "missingCurrentRevision";
  if (code === "driveReadFailed") return "unavailable";
  return "inconsistent";
}

function mapHistoryFailure(
  code: Extract<ListProjectPublishRevisionsResult, { ok: false }>["code"],
): LoadProjectPublishHistoryOverviewResult {
  if (
    code === "duplicateHistoryFolder" ||
    code === "invalidHistoryFolder" ||
    code === "duplicateRevisionsFolder" ||
    code === "invalidRevisionsFolder"
  ) {
    return overviewFailure(code);
  }
  return overviewFailure("driveReadFailed");
}

function overviewFailure(
  code: Extract<LoadProjectPublishHistoryOverviewResult, { ok: false }>["code"],
): Extract<LoadProjectPublishHistoryOverviewResult, { ok: false }> {
  const messages: Record<
    Extract<LoadProjectPublishHistoryOverviewResult, { ok: false }>["code"],
    string
  > = {
    aborted: "公開履歴の読込を中止しました。",
    driveReadFailed: "Google Driveから現在の公開情報を読み込めませんでした。",
    invalidManifestMetadata:
      "現在のmanifest.jsonのDrive情報が正しくありません。",
    invalidManifest: "現在のmanifest.jsonの内容が正しくありません。",
    duplicateHistoryFolder:
      "公開履歴フォルダが重複しています。自動選択は行いません。",
    invalidHistoryFolder: "公開履歴フォルダの構成が正しくありません。",
    duplicateRevisionsFolder:
      "公開履歴の保存場所が重複しています。自動選択は行いません。",
    invalidRevisionsFolder: "公開履歴の保存場所の構成が正しくありません。",
  };
  return { ok: false, code, message: messages[code] };
}
