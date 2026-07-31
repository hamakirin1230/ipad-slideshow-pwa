import {
  parseProjectManifest,
  type ProjectManifest,
} from "./google-drive";
import type {
  OfflinePublicationNeedsInspectionReason,
  OfflinePublicationProvenance,
} from "./offline-schema";
import {
  getProjectManifestContentCanonicalHash,
  type ProjectPublishRevision,
} from "./publish-history/project-publish-revision";
import {
  loadProjectPublishRevision,
  type LoadProjectPublishRevisionResult,
} from "./publish-history/project-publish-revision-loader";

type LoadExactRevision = (input: {
  accessToken: string;
  workspaceId: string;
  projectId: string;
  projectFolderId: string;
  revisionId: string;
  signal: AbortSignal;
}) => Promise<LoadProjectPublishRevisionResult>;

export type ResolveDriveOfflinePublicationProvenanceInput = {
  accessToken: string;
  workspaceId: string;
  projectId: string;
  projectFolderId: string;
  manifest: unknown;
  checkedAt: string;
  signal: AbortSignal;
};

export type DriveOfflinePublicationProvenanceResolution = {
  provenance: OfflinePublicationProvenance;
  warning?: string;
};

export async function resolveDriveOfflinePublicationProvenance(
  input: ResolveDriveOfflinePublicationProvenanceInput,
): Promise<DriveOfflinePublicationProvenanceResolution> {
  return resolveDriveOfflinePublicationProvenanceWithLoader(
    input,
    loadProjectPublishRevision,
  );
}

export async function resolveDriveOfflinePublicationProvenanceWithLoader(
  input: ResolveDriveOfflinePublicationProvenanceInput,
  loadExactRevision: LoadExactRevision,
): Promise<DriveOfflinePublicationProvenanceResolution> {
  throwIfAborted(input.signal);
  const manifestResult = parseProjectManifest(input.manifest);
  if (!manifestResult.ok) {
    throw new TypeError("Current manifest must pass formal validation.");
  }
  if (
    manifestResult.value.workspaceId !== input.workspaceId ||
    manifestResult.value.projectId !== input.projectId
  ) {
    throw new TypeError("Current manifest identity does not match sync context.");
  }

  const publication = manifestResult.value.publication;
  if (!publication) {
    return {
      provenance: {
        status: "unpublished",
        checkedAt: input.checkedAt,
      },
    };
  }

  const loaded = await loadExactRevision({
    accessToken: input.accessToken,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    projectFolderId: input.projectFolderId,
    revisionId: publication.currentRevisionId,
    signal: input.signal,
  });
  throwIfAborted(input.signal);

  if (!loaded.ok) {
    return needsInspection(
      input.checkedAt,
      mapLoaderFailure(loaded.code),
      publication,
    );
  }

  if (!revisionMatchesPublication(loaded.revision, publication)) {
    return needsInspection(
      input.checkedAt,
      "publicationInconsistent",
      publication,
    );
  }

  const status =
    getProjectManifestContentCanonicalHash(manifestResult.value) ===
    publication.contentCanonicalHash
      ? "publishedMatch"
      : "unpublishedChanges";

  return {
    provenance: {
      status,
      checkedAt: input.checkedAt,
      currentPublishedRevisionId: publication.currentRevisionId,
      publishedAt: publication.publishedAt,
      operation: publication.operation,
      ...(loaded.revision.operation === "rollback"
        ? {
            restoredFromRevisionId:
              loaded.revision.restoredFromRevisionId,
          }
        : {}),
    },
  };
}

function revisionMatchesPublication(
  revision: ProjectPublishRevision,
  publication: NonNullable<ProjectManifest["publication"]>,
): boolean {
  return (
    revision.revisionId === publication.currentRevisionId &&
    revision.publishedAt === publication.publishedAt &&
    revision.operation === publication.operation &&
    revision.sourceManifestCanonicalHash === publication.contentCanonicalHash
  );
}

function needsInspection(
  checkedAt: string,
  reason: OfflinePublicationNeedsInspectionReason,
  publication: NonNullable<ProjectManifest["publication"]>,
): DriveOfflinePublicationProvenanceResolution {
  return {
    provenance: {
      status: "needsInspection",
      checkedAt,
      currentPublishedRevisionId: publication.currentRevisionId,
      publishedAt: publication.publishedAt,
      operation: publication.operation,
      needsInspectionReason: reason,
    },
    warning:
      "公開revisionとの対応を正式確認できませんでした。offline snapshotはcurrent manifestから作成を継続します。",
  };
}

function mapLoaderFailure(
  code: Extract<LoadProjectPublishRevisionResult, { ok: false }>["code"],
): OfflinePublicationNeedsInspectionReason {
  switch (code) {
    case "notFound":
      return "currentRevisionMissing";
    case "duplicateHistoryFolder":
    case "invalidHistoryFolder":
    case "duplicateRevisionsFolder":
    case "invalidRevisionsFolder":
      return "historyStructureInvalid";
    case "driveReadFailed":
      return "historyUnavailable";
    case "duplicateRevision":
    case "invalidMetadata":
    case "invalidJson":
    case "invalidRevision":
    case "metadataBodyMismatch":
      return "publicationInconsistent";
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}
