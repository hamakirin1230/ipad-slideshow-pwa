import {
  createDriveFolderWithAppProperties,
  createDriveJsonFileWithAppProperties,
  escapeDriveReadOnlyQueryValue,
  listDriveFilesReadOnlyPage,
  readDriveTextFile,
  type DriveFileCandidate,
} from "../google-drive";
import {
  PROJECT_HISTORY_FOLDER_ROLE,
  PROJECT_PUBLISH_REVISION_FILE_ROLE,
  PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
} from "./project-publish-revision-loader";

const APP_ID = "ipad-slideshow-pwa";
const SCHEMA_VERSION_PROPERTY = "1";
const HISTORY_FOLDER_NAME = "history";
const REVISIONS_FOLDER_NAME = "revisions";
const MAX_SCAN_COUNT = 200;
const FILE_FIELDS = "id,name,mimeType,modifiedTime,appProperties,parents,trashed";

export type ProjectPublishRevisionDriveItem = DriveFileCandidate;

type ProjectContext = {
  workspaceId: string;
  projectId: string;
  signal: AbortSignal;
};

type ChildContext = ProjectContext & {
  parentFolderId: string;
};

export type ProjectPublishRevisionWriteAdapter = {
  findProjectFolders(
    input: ProjectContext,
  ): Promise<ProjectPublishRevisionDriveItem[]>;
  findHistoryFolders(
    input: ChildContext,
  ): Promise<ProjectPublishRevisionDriveItem[]>;
  createHistoryFolder(input: ChildContext): Promise<void>;
  findRevisionsFolders(
    input: ChildContext,
  ): Promise<ProjectPublishRevisionDriveItem[]>;
  createRevisionsFolder(input: ChildContext): Promise<void>;
  findRevisionFiles(
    input: ChildContext & { revisionId: string },
  ): Promise<ProjectPublishRevisionDriveItem[]>;
  createRevisionFile(
    input: ChildContext & {
      filename: string;
      canonicalBody: string;
      appProperties: Record<string, string>;
    },
  ): Promise<void>;
  readRevisionFile(input: {
    fileId: string;
    signal: AbortSignal;
  }): Promise<string>;
};

export function createProjectPublishRevisionDriveAdapter(
  accessToken: string,
): ProjectPublishRevisionWriteAdapter {
  return {
    async findProjectFolders(input) {
      const files = await listAll({
        accessToken,
        query: [
          "trashed = false",
          `appProperties has { key='projectId' and value='${escapeDriveReadOnlyQueryValue(input.projectId)}' }`,
        ].join(" and "),
        signal: input.signal,
      });
      return files.filter(
        (file) =>
          file.name === input.projectId || file.appProperties.role === "projectRoot",
      );
    },

    async findHistoryFolders(input) {
      return (await listProjectPublishDriveChildren(accessToken, input)).filter(
        (file) =>
          file.name === HISTORY_FOLDER_NAME ||
          file.appProperties.role === PROJECT_HISTORY_FOLDER_ROLE,
      );
    },

    async createHistoryFolder(input) {
      await createDriveFolderWithAppProperties({
        accessToken,
        name: HISTORY_FOLDER_NAME,
        parentId: input.parentFolderId,
        appProperties: buildFolderAppProperties({
          role: PROJECT_HISTORY_FOLDER_ROLE,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        }),
        signal: input.signal,
      });
    },

    async findRevisionsFolders(input) {
      return (await listProjectPublishDriveChildren(accessToken, input)).filter(
        (file) =>
          file.name === REVISIONS_FOLDER_NAME ||
          file.appProperties.role === PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
      );
    },

    async createRevisionsFolder(input) {
      await createDriveFolderWithAppProperties({
        accessToken,
        name: REVISIONS_FOLDER_NAME,
        parentId: input.parentFolderId,
        appProperties: buildFolderAppProperties({
          role: PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        }),
        signal: input.signal,
      });
    },

    async findRevisionFiles(input) {
      const expectedName = `${input.revisionId}.json`;
      return (await listProjectPublishDriveChildren(accessToken, input)).filter(
        (file) =>
          file.name === expectedName ||
          file.appProperties.revisionId === input.revisionId ||
          (file.appProperties.role === PROJECT_PUBLISH_REVISION_FILE_ROLE &&
            file.name === expectedName),
      );
    },

    async createRevisionFile(input) {
      await createDriveJsonFileWithAppProperties({
        accessToken,
        name: input.filename,
        parentId: input.parentFolderId,
        appProperties: input.appProperties,
        canonicalJsonText: input.canonicalBody,
        signal: input.signal,
      });
    },

    readRevisionFile(input) {
      return readDriveTextFile(accessToken, input.fileId, input.signal);
    },
  };
}

export async function listProjectPublishDriveChildren(
  accessToken: string,
  input: ChildContext,
): Promise<ProjectPublishRevisionDriveItem[]> {
  return listAll({
    accessToken,
    query: [
      `'${escapeDriveReadOnlyQueryValue(input.parentFolderId)}' in parents`,
      "trashed = false",
    ].join(" and "),
    signal: input.signal,
  });
}

async function listAll(input: {
  accessToken: string;
  query: string;
  signal: AbortSignal;
}): Promise<ProjectPublishRevisionDriveItem[]> {
  const files: ProjectPublishRevisionDriveItem[] = [];
  let pageToken: string | undefined;

  do {
    const page = await listDriveFilesReadOnlyPage({
      accessToken: input.accessToken,
      query: input.query,
      pageSize: 100,
      ...(pageToken ? { pageToken } : {}),
      fields: FILE_FIELDS,
      signal: input.signal,
    });
    files.push(...page.files.filter((file) => file.trashed !== true));
    if (files.length > MAX_SCAN_COUNT) throw new Error("publish-history-scan-limit");
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

function buildFolderAppProperties(input: {
  role:
    | typeof PROJECT_HISTORY_FOLDER_ROLE
    | typeof PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE;
  workspaceId: string;
  projectId: string;
}) {
  return {
    app: APP_ID,
    role: input.role,
    schemaVersion: SCHEMA_VERSION_PROPERTY,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  };
}
