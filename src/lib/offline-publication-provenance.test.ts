import { describe, expect, it } from "vitest";
import {
  compareOfflinePublicationProvenance,
  getOfflinePublicationProvenanceView,
  parseOfflinePublicationProvenance,
} from "./offline-publication-provenance";

const checkedAt = "2026-07-31T01:02:03.000Z";
const revisionId = "rev_20260731T010203000Z_ab12cd34";

const publishedMatch = {
  status: "publishedMatch",
  checkedAt,
  currentPublishedRevisionId: revisionId,
  publishedAt: checkedAt,
  operation: "publish",
} as const;

describe("offline publication provenance", () => {
  it("strictly validates published statuses", () => {
    expect(parseOfflinePublicationProvenance(publishedMatch).ok).toBe(true);
    expect(
      parseOfflinePublicationProvenance({
        ...publishedMatch,
        status: "unpublishedChanges",
      }).ok,
    ).toBe(true);
    expect(
      parseOfflinePublicationProvenance({
        status: "publishedMatch",
        checkedAt,
      }).ok,
    ).toBe(false);
    expect(
      parseOfflinePublicationProvenance({
        ...publishedMatch,
        operation: "rollback",
      }).ok,
    ).toBe(false);
    expect(
      parseOfflinePublicationProvenance({
        ...publishedMatch,
        operation: "rollback",
        restoredFromRevisionId: "rev_20260730T010203000Z_cd34ef56",
      }).ok,
    ).toBe(true);
  });

  it("rejects fields forbidden by unpublished", () => {
    expect(
      parseOfflinePublicationProvenance({
        status: "unpublished",
        checkedAt,
      }).ok,
    ).toBe(true);
    expect(
      parseOfflinePublicationProvenance({
        status: "unpublished",
        checkedAt,
        currentPublishedRevisionId: revisionId,
      }).ok,
    ).toBe(false);
  });

  it("requires a sanitized inspection reason", () => {
    expect(
      parseOfflinePublicationProvenance({
        status: "needsInspection",
        checkedAt,
        needsInspectionReason: "historyUnavailable",
      }).ok,
    ).toBe(true);
    expect(
      parseOfflinePublicationProvenance({
        status: "needsInspection",
        checkedAt,
      }).ok,
    ).toBe(false);
  });

  it("rejects unknown status, invalid dates, operations, and extra fields", () => {
    expect(
      parseOfflinePublicationProvenance({
        ...publishedMatch,
        status: "legacyUnknown",
      }).ok,
    ).toBe(false);
    expect(
      parseOfflinePublicationProvenance({
        ...publishedMatch,
        checkedAt: "not-a-date",
      }).ok,
    ).toBe(false);
    expect(
      parseOfflinePublicationProvenance({
        ...publishedMatch,
        operation: "restore",
      }).ok,
    ).toBe(false);
    expect(
      parseOfflinePublicationProvenance({
        ...publishedMatch,
        checksum: "must-not-be-stored",
      }).ok,
    ).toBe(false);
  });

  it("normalizes a missing legacy field without rewriting it", () => {
    expect(getOfflinePublicationProvenanceView(undefined)).toMatchObject({
      status: "legacyUnknown",
      label: "旧形式",
      warning: true,
      resyncRecommended: true,
    });
  });

  it("compares project and ready sync-state provenance", () => {
    expect(
      compareOfflinePublicationProvenance(publishedMatch, {
        ...publishedMatch,
      }),
    ).toBe("match");
    expect(compareOfflinePublicationProvenance(undefined, undefined)).toBe(
      "legacyMatch",
    );
    expect(
      compareOfflinePublicationProvenance(publishedMatch, {
        ...publishedMatch,
        checkedAt: "2026-07-31T01:02:04.000Z",
      }),
    ).toBe("mismatch");
    expect(
      compareOfflinePublicationProvenance(publishedMatch, undefined),
    ).toBe("mismatch");
  });

  it.each([
    ["publishedMatch", "公開版と一致", "success", false],
    ["unpublishedChanges", "未公開編集を同期", "warning", true],
    ["unpublished", "未公開project", "neutral", false],
    ["needsInspection", "公開対応を要確認", "warning", true],
  ] as const)("builds sanitized %s UI view", (status, label, tone, warning) => {
    const provenance =
      status === "unpublished"
        ? { status, checkedAt }
        : status === "needsInspection"
          ? {
              status,
              checkedAt,
              needsInspectionReason: "historyUnavailable" as const,
            }
          : { ...publishedMatch, status };
    const view = getOfflinePublicationProvenanceView(provenance);
    expect(view).toMatchObject({ status, label, tone, warning });
    expect(JSON.stringify(view)).not.toMatch(
      /token|authorization|bearer|drive-file|fnv1a64|checksum|raw error/i,
    );
  });
});
