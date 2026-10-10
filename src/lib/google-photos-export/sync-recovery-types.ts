export type GooglePhotosSyncRecoveryDesiredSlide = {
  slideId: string;
  renderKey: string;
  reuseEligible: boolean;
};

export type GooglePhotosSyncRecoveryManagedItem = {
  slideId: string;
  renderKey: string;
  mediaItemId: string;
};

export type GooglePhotosSyncRecoveryStableSnapshot = {
  generation: number;
  items: GooglePhotosSyncRecoveryManagedItem[];
} | null;

export type GooglePhotosSyncRecoveryPendingSnapshot = {
  pendingIdentity: string;
  phase: string;
  sourceFingerprint: string;
  previousManagedMediaItemIds: string[];
  targetItems: GooglePhotosSyncRecoveryManagedItem[];
};

export type GooglePhotosSyncVerifiedSuccessorRelation = {
  slideId: string;
  stableMediaItemId: string;
  pendingMediaItemId: string;
};

export type GooglePhotosSyncRecoveryClassification =
  | {
      classification: "REUSE_CANDIDATE";
      reason: "PROVEN_MATCH_PRESENT";
      slideId: string;
      renderKey: string;
      mediaItemId: string;
      provenance: "stable" | "pending" | "stable_and_pending";
    }
  | {
      classification: "CREATE_REQUIRED";
      reason:
        | "NO_MANAGED_CANDIDATE"
        | "RENDER_KEY_CHANGED"
        | "REUSE_NOT_ELIGIBLE"
        | "CANDIDATE_MISSING_FROM_MEMBERSHIP";
      slideId: string;
      renderKey: string;
    }
  | {
      classification: "INDETERMINATE";
      reason:
        | "AMBIGUOUS_MEDIA_CREATE"
        | "CONFLICTING_MANAGED_HISTORY"
        | "UNVERIFIED_PENDING_PROVENANCE";
      slideId: string;
      renderKey: string;
    };

export type GooglePhotosSyncRecoveryClassificationFailureReason =
  | "INVALID_INPUT"
  | "SOURCE_DRIFT"
  | "DUPLICATE_DESIRED_SLIDE_ID"
  | "DUPLICATE_STABLE_SLIDE_ID"
  | "DUPLICATE_PENDING_SLIDE_ID"
  | "DUPLICATE_MANAGED_MEDIA_ID"
  | "DUPLICATE_ALBUM_MEDIA_ID"
  | "INVALID_SUCCESSOR_RELATION";

export type GooglePhotosSyncRecoveryFutureTarget = {
  slideId: string;
  mediaItemId: string;
  provenance: "stable" | "pending" | "created_verified";
};

export type GooglePhotosSyncRecoveryCreatedItem = {
  slideId: string;
  mediaItemId: string;
};

export type GooglePhotosSyncRecoveryMembershipPlan = {
  disposition: "fully_provable_local_plan" | "requires_remote_verification";
  retainMediaItemIds: string[];
  createSlideIds: string[];
  removeMembershipMediaItemIds: string[];
  addMembershipMediaItemIds: string[];
  unmanagedMediaItemIds: string[];
  expectedRelativeOrder: string[];
  verificationRequired: true;
  remoteOrderAssumption: "unverified" | "request_order_documented";
  libraryDeleteMediaItemIds: [];
};

export type GooglePhotosSyncRecoveryMembershipFailureReason =
  | "INVALID_INPUT"
  | "DUPLICATE_ALBUM_MEDIA_ID"
  | "DUPLICATE_FUTURE_SLIDE_ID"
  | "DUPLICATE_FUTURE_MEDIA_ID"
  | "DUPLICATE_PROVEN_MEDIA_ID"
  | "UNPROVEN_MANAGED_IDENTITY"
  | "FUTURE_TARGET_NOT_PROVEN"
  | "CLASSIFICATION_INDETERMINATE"
  | "TARGET_CLASSIFICATION_MISMATCH"
  | "CREATED_TARGET_NOT_CONFIRMED"
  | "REMOTE_ORDER_UNSUPPORTED"
  | "CONTENT_DUPLICATION_UNVERIFIABLE";

export type GooglePhotosSyncRecoveryPhase =
  | "PREFLIGHT"
  | "PLANNED"
  | "MEDIA_CREATING"
  | "MEDIA_VERIFIED"
  | "MEMBERSHIP_PLANNED"
  | "MEMBERSHIP_VERIFIED"
  | "FINAL_READY"
  | "RECOVERY_REQUIRED";

export type GooglePhotosSyncRecoveryRetryPolicy =
  | "SAFE_FROM_CHECKPOINT"
  | "VERIFY_REMOTE_FIRST"
  | "AUTOMATIC_RETRY_FORBIDDEN";

export type GooglePhotosSyncRecoveryStopReason =
  | "CLASSIFICATION_INDETERMINATE"
  | "PRE_MEDIA_INTERRUPTED"
  | "UPLOAD_INTERRUPTED"
  | "MEDIA_CREATION_RESULT_UNKNOWN"
  | "MEDIA_CREATION_PARTIAL"
  | "CREATED_ITEMS_INCOMPLETE"
  | "CREATED_ITEM_CONFLICT"
  | "CHECKPOINT_FAILED"
  | "MEMBERSHIP_RESULT_UNKNOWN"
  | "MEMBERSHIP_PARTIAL"
  | "MEMBERSHIP_MISMATCH"
  | "MEMBERSHIP_PLAN_INVALID"
  | "MEMBERSHIP_DRIFT"
  | "SOURCE_DRIFT"
  | "STABLE_CHANGED"
  | "PENDING_CHANGED"
  | "CONCURRENT_OPERATION"
  | "DUPLICATE_OPERATION"
  | "RECOVERY_ID_MISMATCH"
  | "FINAL_CANDIDATE_UNKNOWN"
  | "PENDING_END_UNKNOWN"
  | "INVALID_PHASE"
  | "STATE_INTEGRITY_FAILED";

export type GooglePhotosSyncRecoveryAuthority = {
  recoveryId: string;
  sourceFingerprint: string;
  observedStable: GooglePhotosSyncRecoveryStableSnapshot;
  observedPending: GooglePhotosSyncRecoveryPendingSnapshot;
  unexpectedMembershipChange: boolean;
  concurrentOperationDetected: boolean;
};

export type GooglePhotosSyncRecoveryState = {
  recoveryId: string;
  phase: GooglePhotosSyncRecoveryPhase;
  originalStable: GooglePhotosSyncRecoveryStableSnapshot;
  originalPending: GooglePhotosSyncRecoveryPendingSnapshot;
  baseStableGeneration: number;
  initialMembershipMediaItemIds: string[];
  confirmedPendingMediaItemIds: string[];
  recoverySourceFingerprint: string;
  orderedTargetSlideIds: string[];
  classifications: GooglePhotosSyncRecoveryClassification[];
  mediaCreation: {
    requiredSlideIds: string[];
    confirmedItems: GooglePhotosSyncRecoveryCreatedItem[];
  };
  membershipPlan: GooglePhotosSyncRecoveryMembershipPlan | null;
  verifiedMembershipMediaItemIds: string[] | null;
  finalVerification: "not_started" | "passed";
  canResume: boolean;
  retryPolicy: GooglePhotosSyncRecoveryRetryPolicy;
  stopReason: GooglePhotosSyncRecoveryStopReason | null;
};

export type GooglePhotosSyncRecoveryEvent =
  | { type: "PREFLIGHT_CONFIRMED"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "INTERRUPTED_BEFORE_MEDIA"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "MEDIA_CREATION_STARTED"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "MEDIA_CREATION_NOT_REQUIRED"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "UPLOAD_INTERRUPTED"; authority: GooglePhotosSyncRecoveryAuthority }
  | {
      type: "MEDIA_CREATION_CONFIRMED";
      authority: GooglePhotosSyncRecoveryAuthority;
      createdItems: GooglePhotosSyncRecoveryCreatedItem[];
    }
  | { type: "MEDIA_CREATION_RESULT_UNKNOWN"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "MEDIA_CREATION_PARTIAL"; authority: GooglePhotosSyncRecoveryAuthority }
  | {
      type: "MEMBERSHIP_PLAN_CONFIRMED";
      authority: GooglePhotosSyncRecoveryAuthority;
      plan: GooglePhotosSyncRecoveryMembershipPlan;
    }
  | { type: "MEMBERSHIP_RESULT_UNKNOWN"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "MEMBERSHIP_PARTIAL"; authority: GooglePhotosSyncRecoveryAuthority }
  | {
      type: "MEMBERSHIP_VERIFIED_MATCH";
      authority: GooglePhotosSyncRecoveryAuthority;
      observedMediaItemIds: string[];
    }
  | { type: "MEMBERSHIP_VERIFIED_MISMATCH"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "CHECKPOINT_FAILED"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "FINAL_VERIFICATION_PASSED"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "FINAL_CANDIDATE_UNKNOWN"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "PENDING_END_UNKNOWN"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "MEMBERSHIP_DRIFT_DETECTED"; authority: GooglePhotosSyncRecoveryAuthority }
  | { type: "DUPLICATE_OPERATION_DETECTED"; authority: GooglePhotosSyncRecoveryAuthority };
