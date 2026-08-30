import { GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH } from "./contract";
import {
  createGooglePhotosSyncSourceFingerprint,
  type GooglePhotosSyncDigestHost,
} from "./render-key";
import type { GooglePhotosSyncManagedItem } from "./sync-binding";

export type GooglePhotosSyncDesiredItem = {
  slideId: string;
  renderKey: string;
  reuseEligible: boolean;
};

export type GooglePhotosSyncTargetItem =
  | {
      kind: "reuse";
      slideId: string;
      renderKey: string;
      mediaItemId: string;
    }
  | { kind: "create"; slideId: string; renderKey: string };

export type GooglePhotosIncrementalSyncPlan = {
  targetItems: GooglePhotosSyncTargetItem[];
  createItems: Array<Extract<GooglePhotosSyncTargetItem, { kind: "create" }>>;
  removeManagedMediaItemIds: string[];
  membershipNeedsRebuild: boolean;
  titleNeedsUpdate: boolean;
  sourceFingerprint: string;
};

export type GooglePhotosIncrementalSyncPlanFailureReason =
  | "invalidTargetTitle"
  | "noExportablePhotos"
  | "invalidDesiredItems"
  | "invalidStableItems"
  | "invalidCurrentMembership"
  | "duplicateDesiredSlideId"
  | "duplicateStableSlideId"
  | "duplicateStableMediaItemId"
  | "duplicateCurrentMediaItemId"
  | "digestUnavailable";

export type GooglePhotosIncrementalSyncPlanResult =
  | { ok: true; plan: GooglePhotosIncrementalSyncPlan }
  | { ok: false; reason: GooglePhotosIncrementalSyncPlanFailureReason };

export async function planGooglePhotosIncrementalSync(
  input: {
    targetAlbumTitle: string;
    currentGoogleAlbumTitle: string;
    desiredSlides: GooglePhotosSyncDesiredItem[];
    stableManagedItems: GooglePhotosSyncManagedItem[];
    currentAlbumMediaItemIds: string[];
  },
  digestHost: GooglePhotosSyncDigestHost = {},
): Promise<GooglePhotosIncrementalSyncPlanResult> {
  if (
    !isNonBlankTrimmedString(input.targetAlbumTitle) ||
    [...input.targetAlbumTitle].length > GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH ||
    typeof input.currentGoogleAlbumTitle !== "string"
  ) {
    return fail("invalidTargetTitle");
  }
  if (!Array.isArray(input.desiredSlides)) {
    return fail("invalidDesiredItems");
  }
  if (input.desiredSlides.length === 0) {
    return fail("noExportablePhotos");
  }
  if (!Array.isArray(input.stableManagedItems)) {
    return fail("invalidStableItems");
  }
  if (!Array.isArray(input.currentAlbumMediaItemIds)) {
    return fail("invalidCurrentMembership");
  }

  const desiredValidation = validateDesiredItems(input.desiredSlides);
  if (!desiredValidation.ok) return fail(desiredValidation.reason);
  const stableValidation = validateStableItems(input.stableManagedItems);
  if (!stableValidation.ok) return fail(stableValidation.reason);
  const membershipValidation = validateCurrentMembership(
    input.currentAlbumMediaItemIds,
  );
  if (!membershipValidation.ok) return fail(membershipValidation.reason);

  const stableBySlideId = new Map(
    input.stableManagedItems.map((item) => [item.slideId, item]),
  );
  const currentMembership = new Set(input.currentAlbumMediaItemIds);
  const targetItems: GooglePhotosSyncTargetItem[] = input.desiredSlides.map(
    (desired) => {
      const stable = stableBySlideId.get(desired.slideId);
      if (
        desired.reuseEligible &&
        stable?.renderKey === desired.renderKey &&
        currentMembership.has(stable.mediaItemId)
      ) {
        return {
          kind: "reuse",
          slideId: desired.slideId,
          renderKey: desired.renderKey,
          mediaItemId: stable.mediaItemId,
        };
      }
      return {
        kind: "create",
        slideId: desired.slideId,
        renderKey: desired.renderKey,
      };
    },
  );
  const createItems = targetItems.filter(
    (item): item is Extract<GooglePhotosSyncTargetItem, { kind: "create" }> =>
      item.kind === "create",
  );

  const stableMediaItemIds = new Set(
    input.stableManagedItems.map((item) => item.mediaItemId),
  );
  const currentManagedMediaItemIds = input.currentAlbumMediaItemIds.filter((id) =>
    stableMediaItemIds.has(id),
  );
  const desiredReuseMediaItemIds = targetItems.flatMap((item) =>
    item.kind === "reuse" ? [item.mediaItemId] : [],
  );
  const desiredSlideIds = new Set(input.desiredSlides.map((item) => item.slideId));
  const hasDeletedManagedSlide = input.stableManagedItems.some(
    (item) => !desiredSlideIds.has(item.slideId),
  );
  const managedMembershipDiffers = !arraysEqual(
    currentManagedMediaItemIds,
    desiredReuseMediaItemIds,
  );
  const membershipNeedsRebuild =
    createItems.length > 0 ||
    hasDeletedManagedSlide ||
    managedMembershipDiffers;
  const removeManagedMediaItemIds = membershipNeedsRebuild
    ? currentManagedMediaItemIds
    : [];

  const fingerprint = await createGooglePhotosSyncSourceFingerprint(
    {
      targetAlbumTitle: input.targetAlbumTitle,
      slides: input.desiredSlides,
    },
    digestHost,
  );
  if (!fingerprint.ok) {
    return fail(
      fingerprint.reason === "digestUnavailable"
        ? "digestUnavailable"
        : "invalidDesiredItems",
    );
  }

  return {
    ok: true,
    plan: {
      targetItems,
      createItems,
      removeManagedMediaItemIds,
      membershipNeedsRebuild,
      titleNeedsUpdate:
        input.currentGoogleAlbumTitle !== input.targetAlbumTitle,
      sourceFingerprint: fingerprint.sourceFingerprint,
    },
  };
}

function validateDesiredItems(
  items: GooglePhotosSyncDesiredItem[],
):
  | { ok: true }
  | {
      ok: false;
      reason: "invalidDesiredItems" | "duplicateDesiredSlideId";
    } {
  const slideIds = new Set<string>();
  for (const item of items) {
    if (
      !isRecord(item) ||
      !isNonBlankTrimmedString(item.slideId) ||
      !isRenderKey(item.renderKey) ||
      typeof item.reuseEligible !== "boolean"
    ) {
      return { ok: false, reason: "invalidDesiredItems" };
    }
    if (slideIds.has(item.slideId)) {
      return { ok: false, reason: "duplicateDesiredSlideId" };
    }
    slideIds.add(item.slideId);
  }
  return { ok: true };
}

function validateStableItems(
  items: GooglePhotosSyncManagedItem[],
):
  | { ok: true }
  | {
      ok: false;
      reason:
        | "invalidStableItems"
        | "duplicateStableSlideId"
        | "duplicateStableMediaItemId";
    } {
  const slideIds = new Set<string>();
  const mediaItemIds = new Set<string>();
  for (const item of items) {
    if (
      !isRecord(item) ||
      !isNonBlankTrimmedString(item.slideId) ||
      !isRenderKey(item.renderKey) ||
      !isNonBlankTrimmedString(item.mediaItemId)
    ) {
      return { ok: false, reason: "invalidStableItems" };
    }
    if (slideIds.has(item.slideId)) {
      return { ok: false, reason: "duplicateStableSlideId" };
    }
    if (mediaItemIds.has(item.mediaItemId)) {
      return { ok: false, reason: "duplicateStableMediaItemId" };
    }
    slideIds.add(item.slideId);
    mediaItemIds.add(item.mediaItemId);
  }
  return { ok: true };
}

function validateCurrentMembership(
  mediaItemIds: string[],
):
  | { ok: true }
  | {
      ok: false;
      reason: "invalidCurrentMembership" | "duplicateCurrentMediaItemId";
    } {
  const seen = new Set<string>();
  for (const id of mediaItemIds) {
    if (!isNonBlankTrimmedString(id)) {
      return { ok: false, reason: "invalidCurrentMembership" };
    }
    if (seen.has(id)) {
      return { ok: false, reason: "duplicateCurrentMediaItemId" };
    }
    seen.add(id);
  }
  return { ok: true };
}

function isRenderKey(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(
  reason: GooglePhotosIncrementalSyncPlanFailureReason,
): GooglePhotosIncrementalSyncPlanResult {
  return { ok: false, reason };
}
