import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyGooglePhotosSyncRecoveryTargets,
  planGooglePhotosSyncRecoveryMembership,
} from "./sync-recovery-plan";
import type {
  GooglePhotosSyncRecoveryClassification,
  GooglePhotosSyncRecoveryManagedItem,
} from "./sync-recovery-types";

const CURRENT_SOURCE = "fixture-current-source";
const KEY_A = "fixture-render-a";
const KEY_B = "fixture-render-b";
const KEY_C = "fixture-render-c";

function managed(
  slideId: string,
  renderKey: string,
  mediaItemId: string,
): GooglePhotosSyncRecoveryManagedItem {
  return { slideId, renderKey, mediaItemId };
}

function classificationInput() {
  return {
    desiredSlides: [{ slideId: "slide-a", renderKey: KEY_A, reuseEligible: true }],
    stableItems: [managed("slide-a", KEY_A, "stable-media-a")],
    pendingTargetItems: [] as GooglePhotosSyncRecoveryManagedItem[],
    albumMediaItemIds: ["stable-media-a"],
    recoverySourceFingerprint: CURRENT_SOURCE,
    observedSourceFingerprint: CURRENT_SOURCE,
    confirmedPendingMediaItemIds: [] as string[],
    verifiedSuccessorRelations: [] as Array<{
      slideId: string;
      stableMediaItemId: string;
      pendingMediaItemId: string;
    }>,
    ambiguousCreateSlideIds: [] as string[],
  };
}

function classify(input = classificationInput()) {
  const result = classifyGooglePhotosSyncRecoveryTargets(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("fixture classification failed");
  return result.classifications;
}

function reusable(
  slideId: string,
  renderKey: string,
  mediaItemId: string,
  provenance: "stable" | "pending" | "stable_and_pending" = "pending",
): GooglePhotosSyncRecoveryClassification {
  return {
    classification: "REUSE_CANDIDATE",
    reason: "PROVEN_MATCH_PRESENT",
    slideId,
    renderKey,
    mediaItemId,
    provenance,
  };
}

function createRequired(
  slideId: string,
  renderKey: string,
): GooglePhotosSyncRecoveryClassification {
  return {
    classification: "CREATE_REQUIRED",
    reason: "RENDER_KEY_CHANGED",
    slideId,
    renderKey,
  };
}

function membershipInput() {
  return {
    currentAlbumMediaItemIds: ["unmanaged", "pending-a", "pending-b"],
    stableItems: [
      managed("slide-a", "old-a", "stable-a"),
      managed("slide-b", "old-b", "stable-b"),
    ],
    pendingTargetItems: [
      managed("slide-a", KEY_A, "pending-a"),
      managed("slide-b", KEY_B, "pending-b"),
    ],
    futureTargetItems: [
      { slideId: "slide-a", mediaItemId: "pending-a", provenance: "pending" as const },
      { slideId: "slide-b", mediaItemId: "pending-b", provenance: "pending" as const },
    ],
    classifications: [
      reusable("slide-a", KEY_A, "pending-a"),
      reusable("slide-b", KEY_B, "pending-b"),
    ],
    confirmedCreatedItems: [] as Array<{ slideId: string; mediaItemId: string }>,
    confirmedPendingMediaItemIds: ["pending-a", "pending-b"],
    provenManagedMediaItemIds: ["stable-a", "stable-b", "pending-a", "pending-b"],
    remoteOrderCapability: "unverified" as const,
    differentIdContentDuplicateRisk: false,
  };
}

describe("Google Photos sync recovery classification", () => {
  it("classifies a stable-only matching mapping as a reuse candidate", () => {
    expect(classify()).toEqual([
      expect.objectContaining({
        classification: "REUSE_CANDIDATE",
        reason: "PROVEN_MATCH_PRESENT",
        provenance: "stable",
      }),
    ]);
  });

  it("requires explicit provenance for a pending-only mapping", () => {
    const input = classificationInput();
    input.stableItems = [];
    input.pendingTargetItems = [managed("slide-a", KEY_A, "pending-media-a")];
    input.albumMediaItemIds = ["pending-media-a"];

    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "INDETERMINATE",
        reason: "UNVERIFIED_PENDING_PROVENANCE",
      }),
    ]);

    input.confirmedPendingMediaItemIds = ["pending-media-a"];
    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "REUSE_CANDIDATE",
        provenance: "pending",
      }),
    ]);
  });

  it("accepts stable and pending when both identify the same render and media", () => {
    const input = classificationInput();
    input.pendingTargetItems = [managed("slide-a", KEY_A, "stable-media-a")];
    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "REUSE_CANDIDATE",
        provenance: "stable_and_pending",
      }),
    ]);
  });

  it("fails closed for different stable and pending IDs without a verified successor", () => {
    const input = classificationInput();
    input.pendingTargetItems = [managed("slide-a", KEY_A, "pending-media-a")];
    input.albumMediaItemIds.push("pending-media-a");
    input.confirmedPendingMediaItemIds = ["pending-media-a"];
    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "INDETERMINATE",
        reason: "CONFLICTING_MANAGED_HISTORY",
      }),
    ]);
  });

  it("FAIL-2 does not treat a successor relation as pending provenance evidence", () => {
    const input = classificationInput();
    input.pendingTargetItems = [managed("slide-a", KEY_A, "pending-media-a")];
    input.albumMediaItemIds.push("pending-media-a");
    input.verifiedSuccessorRelations = [
      {
        slideId: "slide-a",
        stableMediaItemId: "stable-media-a",
        pendingMediaItemId: "pending-media-a",
      },
    ];
    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "REUSE_CANDIDATE",
        mediaItemId: "stable-media-a",
        provenance: "stable",
      }),
    ]);

    input.desiredSlides[0]!.renderKey = KEY_B;
    input.pendingTargetItems[0]!.renderKey = KEY_B;
    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "INDETERMINATE",
        reason: "UNVERIFIED_PENDING_PROVENANCE",
      }),
    ]);

    input.confirmedPendingMediaItemIds = ["pending-media-a"];
    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "REUSE_CANDIDATE",
        mediaItemId: "pending-media-a",
        provenance: "pending",
      }),
    ]);
  });

  it.each([
    ["caption", KEY_B],
    ["asset", KEY_C],
  ])("requires creation when a %s change changes renderKey", (_label, renderKey) => {
    const input = classificationInput();
    input.desiredSlides[0]!.renderKey = renderKey;
    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "CREATE_REQUIRED",
        reason: "RENDER_KEY_CHANGED",
      }),
    ]);
  });

  it("does not reuse a checksum-ineligible desired image", () => {
    const input = classificationInput();
    input.desiredSlides[0]!.reuseEligible = false;
    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "CREATE_REQUIRED",
        reason: "REUSE_NOT_ELIGIBLE",
      }),
    ]);
  });

  it("requires creation when the proven matching ID is absent from fresh membership", () => {
    const input = classificationInput();
    input.albumMediaItemIds = [];
    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "CREATE_REQUIRED",
        reason: "CANDIDATE_MISSING_FROM_MEMBERSHIP",
      }),
    ]);
  });

  it("keeps an ambiguous create result indeterminate instead of resending", () => {
    const input = classificationInput();
    input.ambiguousCreateSlideIds = ["slide-a"];
    expect(classify(input)).toEqual([
      expect.objectContaining({
        classification: "INDETERMINATE",
        reason: "AMBIGUOUS_MEDIA_CREATE",
      }),
    ]);
  });

  it("rejects source drift with a fixed reason code", () => {
    const input = classificationInput();
    input.observedSourceFingerprint = "fixture-changed-source";
    expect(classifyGooglePhotosSyncRecoveryTargets(input)).toEqual({
      ok: false,
      reason: "SOURCE_DRIFT",
    });
  });

  it.each([
    ["desired slide", (input: ReturnType<typeof classificationInput>) => input.desiredSlides.push({ ...input.desiredSlides[0]! }), "DUPLICATE_DESIRED_SLIDE_ID"],
    ["stable slide", (input: ReturnType<typeof classificationInput>) => input.stableItems.push(managed("slide-a", KEY_B, "stable-media-b")), "DUPLICATE_STABLE_SLIDE_ID"],
    ["album media", (input: ReturnType<typeof classificationInput>) => input.albumMediaItemIds.push("stable-media-a"), "DUPLICATE_ALBUM_MEDIA_ID"],
  ] as const)("rejects duplicate %s", (_label, mutate, reason) => {
    const input = classificationInput();
    mutate(input);
    expect(classifyGooglePhotosSyncRecoveryTargets(input)).toEqual({ ok: false, reason });
  });

  it("does not mutate deeply frozen classification input", () => {
    const input = deepFreeze(classificationInput());
    expect(() => classifyGooglePhotosSyncRecoveryTargets(input)).not.toThrow();
    expect(classifyGooglePhotosSyncRecoveryTargets(input).ok).toBe(true);
  });
});

describe("Google Photos sync recovery membership plan", () => {
  it("FAIL-2 rejects a direct planner call with unconfirmed pending provenance", () => {
    const input = membershipInput();
    input.confirmedPendingMediaItemIds = [];
    expect(planGooglePhotosSyncRecoveryMembership(input)).toEqual({
      ok: false,
      reason: "TARGET_CLASSIFICATION_MISMATCH",
    });
  });

  it("returns a local no-mutation plan when targets already appear in relative order", () => {
    const result = planGooglePhotosSyncRecoveryMembership(membershipInput());
    expect(result).toEqual({
      ok: true,
      plan: expect.objectContaining({
        disposition: "fully_provable_local_plan",
        retainMediaItemIds: ["unmanaged"],
        removeMembershipMediaItemIds: [],
        addMembershipMediaItemIds: [],
        libraryDeleteMediaItemIds: [],
      }),
    });
  });

  it("protects unmanaged membership while planning a managed-only order rebuild", () => {
    const input = membershipInput();
    input.currentAlbumMediaItemIds = ["pending-b", "unmanaged", "pending-a"];
    const result = planGooglePhotosSyncRecoveryMembership(input);
    expect(result).toEqual({
      ok: true,
      plan: expect.objectContaining({
        disposition: "requires_remote_verification",
        retainMediaItemIds: ["unmanaged"],
        unmanagedMediaItemIds: ["unmanaged"],
        removeMembershipMediaItemIds: ["pending-b", "pending-a"],
        addMembershipMediaItemIds: ["pending-a", "pending-b"],
        expectedRelativeOrder: ["pending-a", "pending-b"],
        libraryDeleteMediaItemIds: [],
      }),
    });
  });

  it("plans an added verified image and a deleted managed slide without library deletion", () => {
    const input = membershipInput();
    input.futureTargetItems = [
      { slideId: "slide-a", mediaItemId: "pending-a", provenance: "pending" },
      { slideId: "slide-c", mediaItemId: "created-c", provenance: "created_verified" },
    ];
    input.classifications = [
      reusable("slide-a", KEY_A, "pending-a"),
      createRequired("slide-c", KEY_C),
    ];
    input.confirmedCreatedItems = [{ slideId: "slide-c", mediaItemId: "created-c" }];
    input.provenManagedMediaItemIds.push("created-c");
    const result = planGooglePhotosSyncRecoveryMembership(input);
    expect(result).toEqual({
      ok: true,
      plan: expect.objectContaining({
        createSlideIds: ["slide-c"],
        removeMembershipMediaItemIds: ["pending-a", "pending-b"],
        addMembershipMediaItemIds: ["pending-a", "created-c"],
        libraryDeleteMediaItemIds: [],
      }),
    });
  });

  it("FAIL-1 rejects classification and future-target provenance contradictions", () => {
    const oldPending = membershipInput();
    oldPending.classifications[0] = createRequired("slide-a", KEY_A);
    expect(planGooglePhotosSyncRecoveryMembership(oldPending)).toEqual({
      ok: false,
      reason: "CREATED_TARGET_NOT_CONFIRMED",
    });

    const oldStable = membershipInput();
    oldStable.futureTargetItems[0] = {
      slideId: "slide-a",
      mediaItemId: "stable-a",
      provenance: "stable",
    };
    oldStable.classifications[0] = createRequired("slide-a", KEY_A);
    expect(planGooglePhotosSyncRecoveryMembership(oldStable)).toEqual({
      ok: false,
      reason: "CREATED_TARGET_NOT_CONFIRMED",
    });

    const wrongReuseId = membershipInput();
    wrongReuseId.futureTargetItems[0] = {
      slideId: "slide-a",
      mediaItemId: "stable-a",
      provenance: "stable",
    };
    expect(planGooglePhotosSyncRecoveryMembership(wrongReuseId)).toEqual({
      ok: false,
      reason: "TARGET_CLASSIFICATION_MISMATCH",
    });
  });

  it("FAIL-1 requires an exact created-media checkpoint before planning membership", () => {
    const input = membershipInput();
    input.futureTargetItems[1] = {
      slideId: "slide-b",
      mediaItemId: "created-b",
      provenance: "created_verified",
    };
    input.classifications[1] = createRequired("slide-b", KEY_B);
    input.provenManagedMediaItemIds.push("created-b");

    expect(planGooglePhotosSyncRecoveryMembership(input)).toEqual({
      ok: false,
      reason: "CREATED_TARGET_NOT_CONFIRMED",
    });

    input.confirmedCreatedItems = [{ slideId: "slide-b", mediaItemId: "created-b" }];
    expect(planGooglePhotosSyncRecoveryMembership(input)).toMatchObject({
      ok: true,
      plan: {
        expectedRelativeOrder: ["pending-a", "created-b"],
      },
    });
  });

  it("does not call an unverified ordering capability executable", () => {
    const input = membershipInput();
    input.currentAlbumMediaItemIds.reverse();
    const result = planGooglePhotosSyncRecoveryMembership(input);
    expect(result).toMatchObject({
      ok: true,
      plan: {
        disposition: "requires_remote_verification",
        remoteOrderAssumption: "unverified",
        verificationRequired: true,
      },
    });
  });

  it("rejects unsupported remote ordering when a rebuild is required", () => {
    const input = membershipInput();
    input.currentAlbumMediaItemIds.reverse();
    input.remoteOrderCapability = "unsupported";
    expect(planGooglePhotosSyncRecoveryMembership(input)).toEqual({
      ok: false,
      reason: "REMOTE_ORDER_UNSUPPORTED",
    });
  });

  it("distinguishes duplicate IDs from unprovable same-pixel different IDs", () => {
    const duplicateId = membershipInput();
    duplicateId.currentAlbumMediaItemIds.push("pending-a");
    expect(planGooglePhotosSyncRecoveryMembership(duplicateId)).toEqual({
      ok: false,
      reason: "DUPLICATE_ALBUM_MEDIA_ID",
    });

    const possibleSamePixels = membershipInput();
    possibleSamePixels.differentIdContentDuplicateRisk = true;
    expect(planGooglePhotosSyncRecoveryMembership(possibleSamePixels)).toEqual({
      ok: false,
      reason: "CONTENT_DUPLICATION_UNVERIFIABLE",
    });
  });

  it("rejects unproven managed IDs and indeterminate classifications", () => {
    const unproven = membershipInput();
    unproven.provenManagedMediaItemIds = ["pending-a", "pending-b"];
    expect(planGooglePhotosSyncRecoveryMembership(unproven)).toEqual({
      ok: false,
      reason: "UNPROVEN_MANAGED_IDENTITY",
    });

    const indeterminate = membershipInput();
    indeterminate.classifications[0] = {
      classification: "INDETERMINATE",
      reason: "AMBIGUOUS_MEDIA_CREATE",
      slideId: "slide-a",
      renderKey: KEY_A,
    };
    expect(planGooglePhotosSyncRecoveryMembership(indeterminate)).toEqual({
      ok: false,
      reason: "CLASSIFICATION_INDETERMINATE",
    });
  });

  it("does not mutate deeply frozen membership input", () => {
    const input = deepFreeze(membershipInput());
    expect(() => planGooglePhotosSyncRecoveryMembership(input)).not.toThrow();
  });
});

describe("Google Photos sync recovery static safety boundary", () => {
  it("has no API, OAuth, persistence, logging, or application import path", () => {
    const files = ["sync-recovery-types.ts", "sync-recovery-plan.ts"];
    const source = files
      .map((file) =>
        readFileSync(new URL(`./${file}`, import.meta.url), "utf8"),
      )
      .join("\n");
    for (const forbidden of [
      "fetch(",
      "mediaItems:batchCreate",
      "batchAddMediaItems",
      "batchRemoveMediaItems",
      "requestAccessToken",
      "updateDrivePhotosSyncBinding",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "console.",
      "app-providers",
      "sync-coordinator",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}
