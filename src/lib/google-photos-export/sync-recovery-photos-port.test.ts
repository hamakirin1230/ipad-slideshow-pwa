import { describe, expect, it } from "vitest";
import { createFakeRecoveryPhotosReadPort, isVerifiedRecoveryPhotosSnapshot, rejectRecoveryPhotosWrite,
  validateRecoveryPhotosObservation } from "./sync-recovery-photos-port";
import { stage2bFixture } from "./sync-recovery-stage2b.test-fixtures";

describe("Stage 2B read-only Photos port", () => {
  it("validates full pagination and preserves response order", async () => {
    const f = stage2bFixture();
    const page = f.observation.pages[0];
    const items = page.items;
    f.observation.pages = [{ ...page, items: items.slice(0, 7), nextPageToken: "fixture-page-2" },
      { ...page, items: items.slice(7), requestPageToken: "fixture-page-2" }];
    const result = await createFakeRecoveryPhotosReadPort({ scope: f.photosScope, observation: f.observation }).readAlbum();
    expect(result.status).toBe("verified");
    if (result.status !== "verified") throw new Error("fixture observation failed");
    expect(result.snapshot.items).toEqual(items);
    expect(isVerifiedRecoveryPhotosSnapshot(result.snapshot)).toBe(true);
    expect(isVerifiedRecoveryPhotosSnapshot(structuredClone(result.snapshot))).toBe(false);
    result.snapshot.items.reverse();
    expect(isVerifiedRecoveryPhotosSnapshot(result.snapshot)).toBe(false);
  });

  it("T19 rejects duplicate IDs including across pages without deduplication", () => {
    const f = stage2bFixture();
    const page = f.observation.pages[0];
    f.observation.pages = [{ ...page, nextPageToken: "fixture-next" },
      { ...page, requestPageToken: "fixture-next", items: [page.items[0]] }];
    expect(validateRecoveryPhotosObservation(f.observation, f.photosScope)).toEqual({
      status: "invalid_observation", reason: "DUPLICATE_MEDIA_ID", duplicateCount: 1,
    });
  });

  it("T22 rejects incomplete, cyclic, unlinked and mixed-revision pages", () => {
    const f = stage2bFixture();
    const page = f.observation.pages[0];
    const cases = [
      [{ ...page, nextPageToken: "fixture-next" }],
      [{ ...page, nextPageToken: "fixture-next" }, { ...page, requestPageToken: "fixture-next", nextPageToken: "fixture-next" }],
      [page, page],
      [{ ...page, nextPageToken: "fixture-next" }, { ...page, requestPageToken: "fixture-wrong" }],
      [{ ...page, nextPageToken: "fixture-next" }, { ...page, requestPageToken: "fixture-next", observationRevision: 2 }],
    ];
    for (const pages of cases) {
      expect(validateRecoveryPhotosObservation({ ...f.observation, pages }, f.photosScope)).toEqual({
        status: "invalid_observation", reason: "INVALID_PAGING", duplicateCount: null,
      });
    }
  });

  it("rejects unknown fields, wrong albums and malformed ownership metadata", () => {
    const f = stage2bFixture();
    expect(validateRecoveryPhotosObservation({ ...f.observation, unexpected: true }, f.photosScope).status).toBe("invalid_observation");
    expect(validateRecoveryPhotosObservation(f.observation, { ...f.photosScope, albumIdentity: "fixture-other-album" }).status).toBe("invalid_observation");
    f.observation.pages[0].items[0].createdProvenance = { recoveryId: "fixture-created", slideId: "fixture-slide" };
    f.observation.pages[0].items[0].ownership = "unmanaged";
    expect(validateRecoveryPhotosObservation(f.observation, f.photosScope).status).toBe("invalid_observation");
  });

  it.each(["album_absent", "permission_denied", "unreadable", "response_unknown"] as const)("represents %s without inventing a verified read", async (fault) => {
    const f = stage2bFixture();
    expect(await createFakeRecoveryPhotosReadPort({ scope: f.photosScope, fault }).readAlbum()).toEqual({ status: fault });
  });

  it("T23 refuses writes at the execution boundary and has no mutation methods", () => {
    const f = stage2bFixture();
    expect(Object.keys(createFakeRecoveryPhotosReadPort({ scope: f.photosScope }))).toEqual(["readAlbum"]);
    expect(rejectRecoveryPhotosWrite()).toEqual({ status: "forbidden", productionWriteAllowed: false });
  });
});
