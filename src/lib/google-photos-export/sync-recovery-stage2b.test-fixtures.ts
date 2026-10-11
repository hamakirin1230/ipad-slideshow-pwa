import { classifyGooglePhotosSyncRecoveryTargets } from "./sync-recovery-plan";
import { createGooglePhotosSyncRecoveryJournalV3FromBinding } from "./sync-recovery-journal-v3";
import { createFakeRecoveryDriveJournalPort } from "./sync-recovery-drive-port";
import { createFakeRecoveryPhotosReadPort, type RecoveryPhotosObservation } from "./sync-recovery-photos-port";
import type { RecoveryPreflightInput } from "./sync-recovery-preflight";
import type { GooglePhotosSyncRecoveryDesiredSlide } from "./sync-recovery-types";

/** Fictional data only. No provider runtime, real images or account identifiers. */
export function stage2bFixture(variant: "normal" | "caption_changed" | "two_captions" | "unmanaged" = "normal") {
  const scope = { workspaceId: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222" };
  const photosScope = { ...scope, albumIdentity: "fixture-album-stage2b" };
  const targetItems = Array.from({ length: 13 }, (_, index) => ({
    slideId: `fixture-slide-${index + 1}`, renderKey: `fixture-render-${index + 1}`,
    mediaItemId: `fixture-media-${index + 1}`, snapshot: null,
  }));
  const binding = {
    app: "ipad-slideshow-pwa", role: "googlePhotosSync", schemaVersion: 2, ...scope,
    album: { albumId: photosScope.albumIdentity, createdAt: "2026-10-01T00:00:00.000Z", lastKnownTitle: "fixture album" },
    stable: { generation: 7, completedAt: "2026-10-01T00:00:00.000Z", rendererVersion: 3, items: targetItems.slice(0, 11) },
    pending: { operationId: "fixture-pending-stage2b", startedAt: "2026-10-02T00:00:00.000Z",
      phase: "membershipAdding", sourceFingerprint: "fixture-source-old", targetTitle: "fixture album",
      previousManagedMediaItemIds: targetItems.slice(0, 11).map((item) => item.mediaItemId), targetItems },
  };
  const desiredSlides: GooglePhotosSyncRecoveryDesiredSlide[] = targetItems.map((item, index) => ({
    slideId: item.slideId,
    renderKey: ((variant === "caption_changed" && index === 11) ||
      (variant === "two_captions" && (index === 10 || index === 11)))
      ? `fixture-render-caption-edited-${index}` : item.renderKey,
    reuseEligible: true,
  }));
  const membership = targetItems.map((item) => item.mediaItemId);
  if (variant === "unmanaged") membership.splice(4, 0, "fixture-unmanaged-stage2b");
  const classified = classifyGooglePhotosSyncRecoveryTargets({ desiredSlides,
    stableItems: binding.stable.items, pendingTargetItems: targetItems,
    albumMediaItemIds: membership, recoverySourceFingerprint: "fixture-source-current",
    observedSourceFingerprint: "fixture-source-current",
    confirmedPendingMediaItemIds: membership.filter((id) => targetItems.slice(11).some((item) => item.mediaItemId === id)),
    verifiedSuccessorRelations: [], ambiguousCreateSlideIds: [],
  });
  if (!classified.ok) throw new Error("fixture classification rejected");
  const created = createGooglePhotosSyncRecoveryJournalV3FromBinding({ binding, expected: scope,
    recoveryId: "fixture-recovery-stage2b", now: "2026-10-11T00:00:00.000Z",
    recoverySourceFingerprint: "fixture-source-current", initialMembershipMediaItemIds: membership,
    confirmedPendingMediaItemIds: targetItems.slice(11).map((item) => item.mediaItemId),
    orderedTargetSlideIds: targetItems.map((item) => item.slideId), classifications: classified.classifications,
  });
  if (!created.ok) throw new Error("fixture journal rejected");
  const observation: RecoveryPhotosObservation = { scope: photosScope, albumExists: true, pages: [{
    scope: photosScope, observationRevision: 1, requestPageToken: null, nextPageToken: null,
    orderEvidence: "album_order", items: membership.map((mediaItemId) => ({ mediaItemId,
      ownership: mediaItemId === "fixture-unmanaged-stage2b" ? "unmanaged" : "app_managed",
      createdProvenance: null,
    })),
  }] };
  return { scope, photosScope, binding, journal: created.journal, desiredSlides, observation };
}

export async function stage2bPreflightInput(
  fixture: ReturnType<typeof stage2bFixture> = stage2bFixture(),
): Promise<RecoveryPreflightInput> {
  return {
    journal: fixture.journal, scope: fixture.scope,
    drive: await createFakeRecoveryDriveJournalPort({ scope: fixture.scope, candidates: [fixture.journal] }).read(),
    photos: await createFakeRecoveryPhotosReadPort({ scope: fixture.photosScope, observation: fixture.observation }).readAlbum(),
    authority: { recoveryId: fixture.journal.recoveryId,
      sourceFingerprint: fixture.journal.recoverySourceFingerprint,
      stableGeneration: fixture.journal.baseStableGeneration,
      pendingIdentity: fixture.journal.originalPending.pendingIdentity,
      desiredSlides: fixture.desiredSlides, concurrentOperationDetected: false },
  };
}
