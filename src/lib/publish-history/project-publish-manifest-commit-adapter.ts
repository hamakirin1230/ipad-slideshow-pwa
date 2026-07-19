import {
  readDriveTextFile,
  updateDriveJsonFileContent,
} from "../google-drive";
import {
  createProjectPublishRevisionDriveAdapter,
  listProjectPublishDriveChildren,
  type ProjectPublishRevisionDriveItem,
  type ProjectPublishRevisionWriteAdapter,
} from "./project-publish-drive-adapter";

export type ProjectPublishManifestCommitAdapter = Pick<
  ProjectPublishRevisionWriteAdapter,
  | "findProjectFolders"
  | "findHistoryFolders"
  | "findRevisionsFolders"
  | "findRevisionFiles"
  | "readRevisionFile"
> & {
  findCurrentManifestFiles(input: {
    workspaceId: string;
    projectId: string;
    parentFolderId: string;
    signal: AbortSignal;
  }): Promise<ProjectPublishRevisionDriveItem[]>;
  readCurrentManifest(input: {
    fileId: string;
    signal: AbortSignal;
  }): Promise<string>;
  updateCurrentManifest(input: {
    fileId: string;
    jsonText: string;
    signal: AbortSignal;
  }): Promise<void>;
};

export function createProjectPublishManifestCommitAdapter(
  accessToken: string,
): ProjectPublishManifestCommitAdapter {
  const revisionAdapter = createProjectPublishRevisionDriveAdapter(accessToken);

  return {
    findProjectFolders: revisionAdapter.findProjectFolders,
    findHistoryFolders: revisionAdapter.findHistoryFolders,
    findRevisionsFolders: revisionAdapter.findRevisionsFolders,
    findRevisionFiles: revisionAdapter.findRevisionFiles,
    readRevisionFile: revisionAdapter.readRevisionFile,

    async findCurrentManifestFiles(input) {
      return (
        await listProjectPublishDriveChildren(accessToken, input)
      ).filter(
        (file) =>
          file.name === "manifest.json" ||
          file.appProperties.role === "projectManifest",
      );
    },

    readCurrentManifest(input) {
      return readDriveTextFile(accessToken, input.fileId, input.signal);
    },

    updateCurrentManifest(input) {
      return updateDriveJsonFileContent({
        accessToken,
        fileId: input.fileId,
        jsonText: input.jsonText,
        signal: input.signal,
      });
    },
  };
}
