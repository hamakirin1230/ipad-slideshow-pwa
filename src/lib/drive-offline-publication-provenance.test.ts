import { describe, expect, it, vi } from "vitest";
import type { ProjectManifest } from "./google-drive";
import {
  resolveDriveOfflinePublicationProvenanceWithLoader,
} from "./drive-offline-publication-provenance";
import {
  deriveProjectPublishRevisionSummary,
  getProjectManifestContentCanonicalHash,
  getProjectManifestPublishableContent,
  type ProjectPublishRevision,
} from "./publish-history/project-publish-revision";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "rev_20260731T010203000Z_ab12cd34";
const RESTORED_REVISION_ID = "rev_20260730T010203000Z_cd34ef56";
const CHECKED_AT = "2026-07-31T01:03:00.000Z";
const PUBLISHED_AT = "2026-07-31T01:02:03.000Z";

function buildManifest(input?: {
  publication?: boolean;
  title?: string;
  operation?: "publish" | "rollback";
}): ProjectManifest {
  const manifest: ProjectManifest = {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: input?.title ?? "Fixture",
    slides: [],
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-31T01:00:00.000Z",
  };
  if (input?.publication !== false) {
    manifest.publication = {
      schemaVersion: 1,
      currentRevisionId: REVISION_ID,
      publishedAt: PUBLISHED_AT,
      operation: input?.operation ?? "publish",
      operationId:
        input?.operation === "rollback"
          ? "rbop_20260731T010203000Z_ab12cd34"
          : "pubop_20260731T010203000Z_ab12cd34",
      contentCanonicalHash: getProjectManifestContentCanonicalHash(manifest),
    };
  }
  return manifest;
}

function buildRevision(
  manifest: ProjectManifest,
  operation: "publish" | "rollback" =
    manifest.publication?.operation ?? "publish",
): ProjectPublishRevision {
  return {
    schemaVersion: 1,
    revisionId: REVISION_ID,
    projectId: PROJECT_ID,
    publishedAt: PUBLISHED_AT,
    operation,
    ...(operation === "rollback"
      ? { restoredFromRevisionId: RESTORED_REVISION_ID }
      : {}),
    sourceManifestModifiedTime: null,
    sourceManifestCanonicalHash:
      manifest.publication?.contentCanonicalHash ??
      getProjectManifestContentCanonicalHash(manifest),
    previousRevisionId: null,
    summary: deriveProjectPublishRevisionSummary(manifest, []),
    assets: [],
    manifest: getProjectManifestPublishableContent(manifest),
  };
}

function input(manifest: ProjectManifest, signal = new AbortController().signal) {
  return {
    accessToken: "dummy-token",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    projectFolderId: "dummy-project-folder",
    manifest,
    checkedAt: CHECKED_AT,
    signal,
  };
}

describe("Drive offline publication provenance", () => {
  it("returns unpublished without reading history", async () => {
    const loader = vi.fn();
    const result = await resolveDriveOfflinePublicationProvenanceWithLoader(
      input(buildManifest({ publication: false })),
      loader,
    );
    expect(result.provenance).toEqual({
      status: "unpublished",
      checkedAt: CHECKED_AT,
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it("returns publishedMatch only for exact revision and content", async () => {
    const manifest = buildManifest();
    const loader = vi.fn(async () => ({
      ok: true as const,
      revision: buildRevision(manifest),
    }));
    const result = await resolveDriveOfflinePublicationProvenanceWithLoader(
      input(manifest),
      loader,
    );
    expect(result.provenance).toMatchObject({
      status: "publishedMatch",
      currentPublishedRevisionId: REVISION_ID,
      publishedAt: PUBLISHED_AT,
      operation: "publish",
    });
    expect(loader).toHaveBeenCalledWith(
      expect.objectContaining({ revisionId: REVISION_ID }),
    );
  });

  it("returns unpublishedChanges when current content changed", async () => {
    const publishedManifest = buildManifest();
    const currentManifest = buildManifest({ title: "Saved edit" });
    currentManifest.publication = publishedManifest.publication;
    const result = await resolveDriveOfflinePublicationProvenanceWithLoader(
      input(currentManifest),
      vi.fn(async () => ({
        ok: true as const,
        revision: buildRevision(publishedManifest),
      })),
    );
    expect(result.provenance.status).toBe("unpublishedChanges");
  });

  it.each([
    ["notFound", "currentRevisionMissing"],
    ["duplicateRevision", "publicationInconsistent"],
    ["invalidMetadata", "publicationInconsistent"],
    ["invalidJson", "publicationInconsistent"],
    ["invalidRevision", "publicationInconsistent"],
    ["duplicateHistoryFolder", "historyStructureInvalid"],
    ["driveReadFailed", "historyUnavailable"],
  ] as const)("maps %s to sanitized %s", async (code, reason) => {
    const result = await resolveDriveOfflinePublicationProvenanceWithLoader(
      input(buildManifest()),
      vi.fn(async () => ({ ok: false as const, code, message: "raw failure" })),
    );
    expect(result.provenance).toMatchObject({
      status: "needsInspection",
      needsInspectionReason: reason,
    });
    expect(JSON.stringify(result)).not.toContain("raw failure");
  });

  it.each([
    ["revision ID", { revisionId: RESTORED_REVISION_ID }],
    ["publishedAt", { publishedAt: "2026-07-31T01:02:04.000Z" }],
    ["operation", { operation: "rollback" as const, restoredFromRevisionId: RESTORED_REVISION_ID }],
    ["content hash", { sourceManifestCanonicalHash: "fnv1a64:0000000000000000" }],
  ])("rejects publication/revision %s mismatch", async (_label, override) => {
    const manifest = buildManifest();
    const revision = { ...buildRevision(manifest), ...override };
    const result = await resolveDriveOfflinePublicationProvenanceWithLoader(
      input(manifest),
      vi.fn(async () => ({ ok: true as const, revision })),
    );
    expect(result.provenance).toMatchObject({
      status: "needsInspection",
      needsInspectionReason: "publicationInconsistent",
    });
  });

  it("stores restoredFromRevisionId for an exact rollback revision", async () => {
    const manifest = buildManifest({ operation: "rollback" });
    const result = await resolveDriveOfflinePublicationProvenanceWithLoader(
      input(manifest),
      vi.fn(async () => ({
        ok: true as const,
        revision: buildRevision(manifest, "rollback"),
      })),
    );
    expect(result.provenance).toMatchObject({
      status: "publishedMatch",
      operation: "rollback",
      restoredFromRevisionId: RESTORED_REVISION_ID,
    });
  });

  it("preserves abort instead of returning needsInspection", async () => {
    const controller = new AbortController();
    const promise = resolveDriveOfflinePublicationProvenanceWithLoader(
      input(buildManifest(), controller.signal),
      vi.fn(async () => {
        controller.abort();
        return {
          ok: false as const,
          code: "driveReadFailed" as const,
          message: "aborted",
        };
      }),
    );
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not expose raw hashes, checksums, errors, or internal IDs", async () => {
    const manifest = buildManifest();
    const result = await resolveDriveOfflinePublicationProvenanceWithLoader(
      input(manifest),
      vi.fn(async () => ({
        ok: true as const,
        revision: buildRevision(manifest),
      })),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(
      /fnv1a64|checksum|dummy-token|dummy-project-folder|operationId|raw/i,
    );
  });
});
