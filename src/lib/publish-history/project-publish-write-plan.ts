import { PROJECT_PUBLISH_REVISION_FILE_ROLE } from "./project-publish-revision-loader";
import {
  PROJECT_MANIFEST_PUBLICATION_SCHEMA_VERSION,
  type ProjectManifestPublication,
} from "./project-manifest-publication";
import {
  getProjectPublishRevisionCanonicalHash,
  stringifyProjectPublishRevisionCanonical,
  type ProjectPublishRevision,
} from "./project-publish-revision";

export type ProjectPublishHistoryStatus =
  | { status: "notConfigured" }
  | { status: "ready"; validRevisionCount: number };

export type ProjectPublishExpectedCurrentState = {
  manifestModifiedTime: string;
  manifestCanonicalHash: string;
  currentRevisionId: string | null;
};

export type ProjectManifestPublicationMetadata = ProjectManifestPublication;

export type ProjectPublishWriteStep =
  | { kind: "ensureHistoryFolder" }
  | { kind: "ensureRevisionsFolder" }
  | { kind: "createRevisionFile" }
  | { kind: "verifyRevisionFile" }
  | { kind: "updateCurrentManifest" }
  | { kind: "verifyCurrentManifest" };

export type ProjectPublishWritePlan = {
  operationId: string;
  projectId: string;
  workspaceId: string;
  checkedAt: string;
  initialPublish: boolean;
  expectedCurrent: ProjectPublishExpectedCurrentState;
  folders: {
    ensureHistoryFolder: boolean;
    ensureRevisionsFolder: boolean;
  };
  revisionFile: {
    revisionId: string;
    filename: string;
    body: ProjectPublishRevision;
    canonicalBody: string;
    canonicalHash: string;
    appProperties: Record<string, string>;
  };
  currentManifestUpdate: {
    publication: ProjectManifestPublicationMetadata;
    expectedPreviousRevisionId: string | null;
  };
  steps: ProjectPublishWriteStep[];
};

export function buildProjectPublishRevisionAppProperties(input: {
  workspaceId: string;
  revision: ProjectPublishRevision;
}): Record<string, string> {
  return {
    app: input.revision.manifest.app,
    role: PROJECT_PUBLISH_REVISION_FILE_ROLE,
    schemaVersion: String(input.revision.schemaVersion),
    workspaceId: input.workspaceId,
    projectId: input.revision.projectId,
    revisionId: input.revision.revisionId,
    operation: input.revision.operation,
    publishedAt: input.revision.publishedAt,
  };
}

export function buildProjectPublishWritePlan(input: {
  operationId: string;
  workspaceId: string;
  checkedAt: string;
  historyStatus: ProjectPublishHistoryStatus;
  expectedCurrent: ProjectPublishExpectedCurrentState;
  revision: ProjectPublishRevision;
}): ProjectPublishWritePlan {
  const initialPublish = input.revision.previousRevisionId === null;
  const ensureFolders = input.historyStatus.status === "notConfigured";

  return {
    operationId: input.operationId,
    projectId: input.revision.projectId,
    workspaceId: input.workspaceId,
    checkedAt: input.checkedAt,
    initialPublish,
    expectedCurrent: { ...input.expectedCurrent },
    folders: {
      ensureHistoryFolder: ensureFolders,
      ensureRevisionsFolder: ensureFolders,
    },
    revisionFile: {
      revisionId: input.revision.revisionId,
      filename: `${input.revision.revisionId}.json`,
      body: structuredClone(input.revision),
      canonicalBody: stringifyProjectPublishRevisionCanonical(input.revision),
      canonicalHash: getProjectPublishRevisionCanonicalHash(input.revision),
      appProperties: buildProjectPublishRevisionAppProperties({
        workspaceId: input.workspaceId,
        revision: input.revision,
      }),
    },
    currentManifestUpdate: {
      publication: {
        schemaVersion: PROJECT_MANIFEST_PUBLICATION_SCHEMA_VERSION,
        currentRevisionId: input.revision.revisionId,
        publishedAt: input.revision.publishedAt,
        operation: "publish",
        operationId: input.operationId,
        contentCanonicalHash: input.revision.sourceManifestCanonicalHash,
      },
      expectedPreviousRevisionId: input.expectedCurrent.currentRevisionId,
    },
    steps: [
      { kind: "ensureHistoryFolder" },
      { kind: "ensureRevisionsFolder" },
      { kind: "createRevisionFile" },
      { kind: "verifyRevisionFile" },
      { kind: "updateCurrentManifest" },
      { kind: "verifyCurrentManifest" },
    ],
  };
}
