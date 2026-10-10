import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planGooglePhotosSyncRecoveryMembership } from "./sync-recovery-plan";
import {
  createGooglePhotosSyncRecoveryState,
  transitionGooglePhotosSyncRecovery,
} from "./sync-recovery-transition";
import type {
  GooglePhotosSyncRecoveryAuthority,
  GooglePhotosSyncRecoveryClassification,
  GooglePhotosSyncRecoveryEvent,
  GooglePhotosSyncRecoveryMembershipPlan,
  GooglePhotosSyncRecoveryState,
  GooglePhotosSyncRecoveryStopReason,
} from "./sync-recovery-types";

const OLD_SOURCE = "fixture-original-source";
const CURRENT_SOURCE = "fixture-recovery-source";

function recoveryInput() {
  const classifications: GooglePhotosSyncRecoveryClassification[] = [
    {
      classification: "REUSE_CANDIDATE",
      reason: "PROVEN_MATCH_PRESENT",
      slideId: "slide-a",
      renderKey: "render-a",
      mediaItemId: "pending-a",
      provenance: "pending",
    },
    {
      classification: "CREATE_REQUIRED",
      reason: "RENDER_KEY_CHANGED",
      slideId: "slide-b",
      renderKey: "render-b-new",
    },
  ];
  return {
    recoveryId: "fixture-recovery",
    originalStable: {
      generation: 4,
      items: [
        { slideId: "slide-a", renderKey: "render-a-old", mediaItemId: "stable-a" },
        { slideId: "slide-b", renderKey: "render-b-old", mediaItemId: "stable-b" },
      ],
    },
    originalPending: {
      pendingIdentity: "fixture-pending",
      phase: "membershipAdding",
      sourceFingerprint: OLD_SOURCE,
      previousManagedMediaItemIds: ["stable-a", "stable-b"],
      targetItems: [
        { slideId: "slide-a", renderKey: "render-a", mediaItemId: "pending-a" },
        { slideId: "slide-b", renderKey: "render-b-old", mediaItemId: "pending-b" },
      ],
    },
    initialMembershipMediaItemIds: ["unmanaged", "pending-a", "pending-b"],
    confirmedPendingMediaItemIds: ["pending-a"],
    recoverySourceFingerprint: CURRENT_SOURCE,
    orderedTargetSlideIds: ["slide-a", "slide-b"],
    classifications,
  };
}

function initialState() {
  const result = createGooglePhotosSyncRecoveryState(recoveryInput());
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("fixture state failed");
  return result.state;
}

function authority(
  state: GooglePhotosSyncRecoveryState,
  overrides: Partial<GooglePhotosSyncRecoveryAuthority> = {},
): GooglePhotosSyncRecoveryAuthority {
  return {
    recoveryId: state.recoveryId,
    sourceFingerprint: state.recoverySourceFingerprint,
    observedStable: structuredClone(state.originalStable),
    observedPending: structuredClone(state.originalPending),
    unexpectedMembershipChange: false,
    concurrentOperationDetected: false,
    ...overrides,
  };
}

function dispatch(
  state: GooglePhotosSyncRecoveryState,
  event: Omit<GooglePhotosSyncRecoveryEvent, "authority"> & {
    authority?: GooglePhotosSyncRecoveryAuthority;
  },
) {
  return transitionGooglePhotosSyncRecovery(state, {
    ...event,
    authority: event.authority ?? authority(state),
  } as GooglePhotosSyncRecoveryEvent);
}

function planned() {
  const state = initialState();
  return dispatch(state, { type: "PREFLIGHT_CONFIRMED" });
}

function mediaCreating() {
  return dispatch(planned(), { type: "MEDIA_CREATION_STARTED" });
}

function mediaVerified() {
  return dispatch(mediaCreating(), {
    type: "MEDIA_CREATION_CONFIRMED",
    createdItems: [{ slideId: "slide-b", mediaItemId: "created-b" }],
  });
}

function membershipPlan(): GooglePhotosSyncRecoveryMembershipPlan {
  return {
    disposition: "requires_remote_verification",
    retainMediaItemIds: ["unmanaged"],
    createSlideIds: ["slide-b"],
    removeMembershipMediaItemIds: ["pending-a", "pending-b"],
    addMembershipMediaItemIds: ["pending-a", "created-b"],
    unmanagedMediaItemIds: ["unmanaged"],
    expectedRelativeOrder: ["pending-a", "created-b"],
    verificationRequired: true,
    remoteOrderAssumption: "unverified",
    libraryDeleteMediaItemIds: [],
  };
}

function membershipPlanned() {
  return dispatch(mediaVerified(), {
    type: "MEMBERSHIP_PLAN_CONFIRMED",
    plan: membershipPlan(),
  });
}

function membershipVerified() {
  return dispatch(membershipPlanned(), {
    type: "MEMBERSHIP_VERIFIED_MATCH",
    observedMediaItemIds: ["unmanaged", "pending-a", "created-b"],
  });
}

function expectStopped(
  state: GooglePhotosSyncRecoveryState,
  reason: GooglePhotosSyncRecoveryStopReason,
  retryPolicy:
    | "SAFE_FROM_CHECKPOINT"
    | "VERIFY_REMOTE_FIRST"
    | "AUTOMATIC_RETRY_FORBIDDEN",
) {
  expect(state).toMatchObject({
    phase: "RECOVERY_REQUIRED",
    stopReason: reason,
    retryPolicy,
    canResume: retryPolicy !== "AUTOMATIC_RETRY_FORBIDDEN",
  });
  expect(state.originalStable).toEqual(recoveryInput().originalStable);
  expect(state.originalPending).toEqual(recoveryInput().originalPending);
}

describe("Google Photos sync recovery state model", () => {
  it("clones and preserves original stable and pending snapshots", () => {
    const input = deepFreeze(recoveryInput());
    const result = createGooglePhotosSyncRecoveryState(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.originalStable).toEqual(input.originalStable);
    expect(result.state.originalPending).toEqual(input.originalPending);
    expect(result.state.originalStable).not.toBe(input.originalStable);
    expect(result.state.originalPending).not.toBe(input.originalPending);
    expect(input).toEqual(recoveryInput());
  });

  it("keeps the old pending fingerprint separate from the recovery anchor", () => {
    const result = createGooglePhotosSyncRecoveryState(recoveryInput());
    expect(result).toMatchObject({
      ok: true,
      state: {
        originalPending: { sourceFingerprint: OLD_SOURCE },
        recoverySourceFingerprint: CURRENT_SOURCE,
      },
    });

    const unchanged = recoveryInput();
    unchanged.recoverySourceFingerprint = OLD_SOURCE;
    expect(createGooglePhotosSyncRecoveryState(unchanged)).toEqual({
      ok: false,
      reason: "RECOVERY_SOURCE_NOT_CHANGED",
    });
  });

  it("rejects a pending previous-ID snapshot that does not match stable", () => {
    const input = recoveryInput();
    input.originalPending.previousManagedMediaItemIds.reverse();
    expect(createGooglePhotosSyncRecoveryState(input)).toEqual({
      ok: false,
      reason: "STABLE_PENDING_MISMATCH",
    });
  });

  it("FAIL-2 rejects an unconfirmed pending classification at state creation", () => {
    const input = recoveryInput();
    input.confirmedPendingMediaItemIds = [];
    expect(createGooglePhotosSyncRecoveryState(input)).toEqual({
      ok: false,
      reason: "TARGET_CLASSIFICATION_MISMATCH",
    });
  });

  it("reaches FINAL_READY without finalizing production stable or pending", () => {
    const final = dispatch(membershipVerified(), { type: "FINAL_VERIFICATION_PASSED" });
    expect(final).toMatchObject({
      phase: "FINAL_READY",
      finalVerification: "passed",
      canResume: false,
      stopReason: null,
    });
    expect(final.originalStable).toEqual(recoveryInput().originalStable);
    expect(final.originalPending).toEqual(recoveryInput().originalPending);
  });

  it("does not advance an indeterminate classification from preflight", () => {
    const input = recoveryInput();
    input.classifications[0] = {
      classification: "INDETERMINATE",
      reason: "CONFLICTING_MANAGED_HISTORY",
      slideId: "slide-a",
      renderKey: "render-a",
    };
    const created = createGooglePhotosSyncRecoveryState(input);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expectStopped(
      dispatch(created.state, { type: "PREFLIGHT_CONFIRMED" }),
      "CLASSIFICATION_INDETERMINATE",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });
});

describe("Google Photos sync recovery fault cases 1-17", () => {
  it("CASE 1 stops before media creation and allows checkpoint restart", () => {
    expectStopped(
      dispatch(planned(), { type: "INTERRUPTED_BEFORE_MEDIA" }),
      "PRE_MEDIA_INTERRUPTED",
      "SAFE_FROM_CHECKPOINT",
    );
  });

  it("CASE 2 stops after an interrupted upload and requires remote verification", () => {
    expectStopped(
      dispatch(mediaCreating(), { type: "UPLOAD_INTERRUPTED" }),
      "UPLOAD_INTERRUPTED",
      "VERIFY_REMOTE_FIRST",
    );
  });

  it("CASE 3 forbids automatic replay after an unknown media-create result", () => {
    expectStopped(
      dispatch(mediaCreating(), { type: "MEDIA_CREATION_RESULT_UNKNOWN" }),
      "MEDIA_CREATION_RESULT_UNKNOWN",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("CASE 4 forbids automatic continuation after partial media creation", () => {
    expectStopped(
      dispatch(mediaCreating(), { type: "MEDIA_CREATION_PARTIAL" }),
      "MEDIA_CREATION_PARTIAL",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("CASE 5 stops before membership when its checkpoint is not confirmed", () => {
    expectStopped(
      dispatch(mediaVerified(), { type: "CHECKPOINT_FAILED" }),
      "CHECKPOINT_FAILED",
      "VERIFY_REMOTE_FIRST",
    );
  });

  it("CASE 6 verifies remote state before retrying an unknown membership result", () => {
    expectStopped(
      dispatch(membershipPlanned(), { type: "MEMBERSHIP_RESULT_UNKNOWN" }),
      "MEMBERSHIP_RESULT_UNKNOWN",
      "VERIFY_REMOTE_FIRST",
    );
  });

  it("CASE 7 forbids automatic continuation after partial membership", () => {
    expectStopped(
      dispatch(membershipPlanned(), { type: "MEMBERSHIP_PARTIAL" }),
      "MEMBERSHIP_PARTIAL",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("CASE 8 rejects a complete target set in reverse order", () => {
    expectStopped(
      dispatch(membershipPlanned(), {
        type: "MEMBERSHIP_VERIFIED_MATCH",
        observedMediaItemIds: ["created-b", "pending-a", "unmanaged"],
      }),
      "MEMBERSHIP_MISMATCH",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("CASE 9 rejects a mixed old and new managed membership", () => {
    expectStopped(
      dispatch(membershipPlanned(), {
        type: "MEMBERSHIP_VERIFIED_MATCH",
        observedMediaItemIds: ["pending-a", "pending-b", "created-b", "unmanaged"],
      }),
      "MEMBERSHIP_MISMATCH",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("CASE 10 distinguishes duplicate IDs from possible same-pixel different IDs", () => {
    const base = {
      currentAlbumMediaItemIds: ["media-a", "media-a"],
      stableItems: [],
      pendingTargetItems: [],
      futureTargetItems: [
        { slideId: "slide-a", mediaItemId: "media-a", provenance: "created_verified" as const },
      ],
      classifications: [
        {
          classification: "CREATE_REQUIRED" as const,
          reason: "NO_MANAGED_CANDIDATE" as const,
          slideId: "slide-a",
          renderKey: "render-a",
        },
      ],
      confirmedCreatedItems: [{ slideId: "slide-a", mediaItemId: "media-a" }],
      confirmedPendingMediaItemIds: [],
      provenManagedMediaItemIds: ["media-a"],
      remoteOrderCapability: "unverified" as const,
      differentIdContentDuplicateRisk: false,
    };
    expect(planGooglePhotosSyncRecoveryMembership(base)).toEqual({
      ok: false,
      reason: "DUPLICATE_ALBUM_MEDIA_ID",
    });
    const differentIds = structuredClone(base);
    differentIds.currentAlbumMediaItemIds = ["media-a"];
    differentIds.differentIdContentDuplicateRisk = true;
    expect(planGooglePhotosSyncRecoveryMembership(differentIds)).toEqual({
      ok: false,
      reason: "CONTENT_DUPLICATION_UNVERIFIABLE",
    });
  });

  it("CASE 11 preserves an unmanaged image while accepting target relative order", () => {
    const result = dispatch(membershipPlanned(), {
      type: "MEMBERSHIP_VERIFIED_MATCH",
      observedMediaItemIds: ["pending-a", "unmanaged", "created-b"],
    });
    expect(result.phase).toBe("MEMBERSHIP_VERIFIED");
    expect(result.originalPending).toEqual(recoveryInput().originalPending);
  });

  it("CASE 12 stops on an unexpected manual membership reorder", () => {
    const state = membershipPlanned();
    expectStopped(
      dispatch(state, {
        type: "MEMBERSHIP_VERIFIED_MATCH",
        observedMediaItemIds: ["pending-a", "created-b", "unmanaged"],
        authority: authority(state, { unexpectedMembershipChange: true }),
      }),
      "MEMBERSHIP_DRIFT",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("CASE 13 stops when the recovery source changes again", () => {
    const state = mediaVerified();
    expectStopped(
      dispatch(state, {
        type: "MEMBERSHIP_PLAN_CONFIRMED",
        plan: membershipPlan(),
        authority: authority(state, { sourceFingerprint: "fixture-new-drift" }),
      }),
      "SOURCE_DRIFT",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("CASE 14 stops on a binding-checkpoint-equivalent failure", () => {
    expectStopped(
      dispatch(mediaCreating(), { type: "CHECKPOINT_FAILED" }),
      "CHECKPOINT_FAILED",
      "VERIFY_REMOTE_FIRST",
    );
  });

  it("CASE 15 does not treat an unknown final candidate as committed", () => {
    expectStopped(
      dispatch(membershipVerified(), { type: "FINAL_CANDIDATE_UNKNOWN" }),
      "FINAL_CANDIDATE_UNKNOWN",
      "VERIFY_REMOTE_FIRST",
    );
  });

  it("CASE 16 does not treat an unknown pending end as finalization", () => {
    expectStopped(
      dispatch(membershipVerified(), { type: "PENDING_END_UNKNOWN" }),
      "PENDING_END_UNKNOWN",
      "VERIFY_REMOTE_FIRST",
    );
  });

  it("CASE 17 stops when membership and the anchored snapshot disagree", () => {
    const state = planned();
    expectStopped(
      dispatch(state, {
        type: "MEDIA_CREATION_STARTED",
        authority: authority(state, { unexpectedMembershipChange: true }),
      }),
      "MEMBERSHIP_DRIFT",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });
});

describe("Google Photos sync recovery conflict guards", () => {
  it.each([
    ["stable generation", (state: GooglePhotosSyncRecoveryState) => authority(state, { observedStable: { generation: 5, items: structuredClone(state.originalStable?.items ?? []) } }), "STABLE_CHANGED"],
    ["pending content", (state: GooglePhotosSyncRecoveryState) => authority(state, { observedPending: { ...structuredClone(state.originalPending), phase: "finalizing" } }), "PENDING_CHANGED"],
    ["concurrent operation", (state: GooglePhotosSyncRecoveryState) => authority(state, { concurrentOperationDetected: true }), "CONCURRENT_OPERATION"],
    ["recovery identity", (state: GooglePhotosSyncRecoveryState) => authority(state, { recoveryId: "fixture-other-recovery" }), "RECOVERY_ID_MISMATCH"],
  ] as const)("stops for %s conflict", (_label, makeAuthority, reason) => {
    const state = planned();
    expectStopped(
      dispatch(state, {
        type: "MEDIA_CREATION_STARTED",
        authority: makeAuthority(state),
      }),
      reason,
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("stops a duplicate recovery operation", () => {
    const state = planned();
    expectStopped(
      dispatch(state, { type: "DUPLICATE_OPERATION_DETECTED" }),
      "DUPLICATE_OPERATION",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("rejects incomplete or duplicate created mappings", () => {
    const incomplete = dispatch(mediaCreating(), {
      type: "MEDIA_CREATION_CONFIRMED",
      createdItems: [],
    });
    expectStopped(
      incomplete,
      "CREATED_ITEMS_INCOMPLETE",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it.each([
    ["stable", "stable-a"],
    ["pending", "pending-b"],
    ["initial unmanaged membership", "unmanaged"],
    ["reuse candidate", "pending-a"],
  ])("FAIL-4 rejects a created ID that collides with %s ownership", (_label, mediaItemId) => {
    expectStopped(
      dispatch(mediaCreating(), {
        type: "MEDIA_CREATION_CONFIRMED",
        createdItems: [{ slideId: "slide-b", mediaItemId }],
      }),
      "CREATED_ITEM_CONFLICT",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("FAIL-4 rejects duplicate created IDs within one checkpoint", () => {
    const input = recoveryInput();
    input.classifications[0] = {
      classification: "CREATE_REQUIRED",
      reason: "RENDER_KEY_CHANGED",
      slideId: "slide-a",
      renderKey: "render-a-new",
    };
    const created = createGooglePhotosSyncRecoveryState(input);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const creating = dispatch(
      dispatch(created.state, { type: "PREFLIGHT_CONFIRMED" }),
      { type: "MEDIA_CREATION_STARTED" },
    );
    expectStopped(
      dispatch(creating, {
        type: "MEDIA_CREATION_CONFIRMED",
        createdItems: [
          { slideId: "slide-a", mediaItemId: "created-duplicate" },
          { slideId: "slide-b", mediaItemId: "created-duplicate" },
        ],
      }),
      "CREATED_ITEMS_INCOMPLETE",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("accepts a non-conflicting complete created-media checkpoint", () => {
    expect(mediaVerified()).toMatchObject({
      phase: "MEDIA_VERIFIED",
      mediaCreation: {
        confirmedItems: [{ slideId: "slide-b", mediaItemId: "created-b" }],
      },
    });
  });
});

describe("Google Photos sync recovery membership plan guards", () => {
  it("FAIL-3 rejects removal of an independently derived unmanaged membership", () => {
    const plan = membershipPlan();
    plan.removeMembershipMediaItemIds = ["unmanaged"];
    expectStopped(
      dispatch(mediaVerified(), { type: "MEMBERSHIP_PLAN_CONFIRMED", plan }),
      "MEMBERSHIP_PLAN_INVALID",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("FAIL-3 rejects a plan that hides the protected unmanaged membership", () => {
    const plan = membershipPlan();
    plan.retainMediaItemIds = [];
    plan.unmanagedMediaItemIds = [];
    expectStopped(
      dispatch(mediaVerified(), { type: "MEMBERSHIP_PLAN_CONFIRMED", plan }),
      "MEMBERSHIP_PLAN_INVALID",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("FAIL-3 rejects reordered targets and state-plan contradictions", () => {
    const reordered = membershipPlan();
    reordered.expectedRelativeOrder.reverse();
    reordered.addMembershipMediaItemIds.reverse();
    expectStopped(
      dispatch(mediaVerified(), {
        type: "MEMBERSHIP_PLAN_CONFIRMED",
        plan: reordered,
      }),
      "MEMBERSHIP_PLAN_INVALID",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );

    const contradictory = membershipPlan();
    contradictory.createSlideIds = [];
    expectStopped(
      dispatch(mediaVerified(), {
        type: "MEMBERSHIP_PLAN_CONFIRMED",
        plan: contradictory,
      }),
      "MEMBERSHIP_PLAN_INVALID",
      "AUTOMATIC_RETRY_FORBIDDEN",
    );
  });

  it("allows the managed-only plan and revalidates observed membership before final", () => {
    const plannedState = membershipPlanned();
    expect(plannedState.phase).toBe("MEMBERSHIP_PLANNED");
    const verified = dispatch(plannedState, {
      type: "MEMBERSHIP_VERIFIED_MATCH",
      observedMediaItemIds: ["unmanaged", "pending-a", "created-b"],
    });
    expect(verified).toMatchObject({
      phase: "MEMBERSHIP_VERIFIED",
      verifiedMembershipMediaItemIds: ["unmanaged", "pending-a", "created-b"],
    });
    expect(dispatch(verified, { type: "FINAL_VERIFICATION_PASSED" }).phase).toBe(
      "FINAL_READY",
    );
  });
});

describe("Google Photos sync recovery transition static safety boundary", () => {
  it("contains pure state transitions only and no production side-effect path", () => {
    const source = readFileSync(
      new URL("./sync-recovery-transition.ts", import.meta.url),
      "utf8",
    );
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
      "sync-coordinator",
      "sync-media",
      "sync-membership",
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
