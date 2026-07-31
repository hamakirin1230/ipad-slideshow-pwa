import type {
  OfflinePublicationNeedsInspectionReason,
  OfflinePublicationOperation,
  OfflinePublicationProvenance,
} from "@/lib/offline-schema";
import { isValidProjectPublishRevisionId } from "./publish-history/project-publish-revision-id";

const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const STORED_KEYS = new Set([
  "status",
  "checkedAt",
  "currentPublishedRevisionId",
  "publishedAt",
  "operation",
  "restoredFromRevisionId",
  "needsInspectionReason",
]);

const INSPECTION_REASONS = new Set<OfflinePublicationNeedsInspectionReason>([
  "currentRevisionMissing",
  "publicationInconsistent",
  "historyStructureInvalid",
  "historyUnavailable",
  "publicationInvalid",
]);

export type OfflinePublicationProvenanceParseResult =
  | { ok: true; value: OfflinePublicationProvenance }
  | { ok: false; reason: "invalidProvenance" };

export type OfflinePublicationProvenanceViewStatus =
  | OfflinePublicationProvenance["status"]
  | "legacyUnknown";

export type OfflinePublicationProvenanceView = {
  status: OfflinePublicationProvenanceViewStatus;
  label: string;
  message: string;
  tone: "success" | "warning" | "neutral";
  warning: boolean;
  resyncRecommended: boolean;
  currentPublishedRevisionId?: string;
  publishedAt?: string;
  operation?: OfflinePublicationOperation;
  restoredFromRevisionId?: string;
  needsInspectionReason?: OfflinePublicationNeedsInspectionReason;
};

export type OfflinePublicationProvenancePairStatus =
  | "match"
  | "legacyMatch"
  | "mismatch"
  | "invalid";

export function parseOfflinePublicationProvenance(
  input: unknown,
): OfflinePublicationProvenanceParseResult {
  if (!isRecord(input)) {
    return invalid();
  }

  if (Object.keys(input).some((key) => !STORED_KEYS.has(key))) {
    return invalid();
  }

  const status = input.status;
  const checkedAt = input.checkedAt;

  if (
    (status !== "publishedMatch" &&
      status !== "unpublishedChanges" &&
      status !== "unpublished" &&
      status !== "needsInspection") ||
    !isIsoDateTime(checkedAt)
  ) {
    return invalid();
  }

  const revisionId = readOptionalNonEmptyString(
    input.currentPublishedRevisionId,
  );
  const publishedAt =
    input.publishedAt === undefined
      ? undefined
      : isIsoDateTime(input.publishedAt)
        ? input.publishedAt
        : null;
  const operation =
    input.operation === undefined
      ? undefined
      : input.operation === "publish" || input.operation === "rollback"
        ? input.operation
        : null;
  const restoredFromRevisionId = readOptionalNonEmptyString(
    input.restoredFromRevisionId,
  );
  const needsInspectionReason =
    input.needsInspectionReason === undefined
      ? undefined
      : typeof input.needsInspectionReason === "string" &&
          INSPECTION_REASONS.has(
            input.needsInspectionReason as OfflinePublicationNeedsInspectionReason,
          )
        ? (input.needsInspectionReason as OfflinePublicationNeedsInspectionReason)
        : null;

  if (
    revisionId === null ||
    publishedAt === null ||
    operation === null ||
    restoredFromRevisionId === null ||
    needsInspectionReason === null
  ) {
    return invalid();
  }
  if (
    (revisionId && !isValidProjectPublishRevisionId(revisionId)) ||
    (restoredFromRevisionId &&
      !isValidProjectPublishRevisionId(restoredFromRevisionId))
  ) {
    return invalid();
  }

  if (status === "publishedMatch" || status === "unpublishedChanges") {
    if (!revisionId || !publishedAt || !operation || needsInspectionReason) {
      return invalid();
    }
    if (
      (operation === "publish" && restoredFromRevisionId !== undefined) ||
      (operation === "rollback" && restoredFromRevisionId === undefined)
    ) {
      return invalid();
    }
  } else if (status === "unpublished") {
    if (
      revisionId !== undefined ||
      publishedAt !== undefined ||
      operation !== undefined ||
      restoredFromRevisionId !== undefined ||
      needsInspectionReason !== undefined
    ) {
      return invalid();
    }
  } else if (!needsInspectionReason || restoredFromRevisionId !== undefined) {
    return invalid();
  }

  return {
    ok: true,
    value: {
      status,
      checkedAt,
      ...(revisionId ? { currentPublishedRevisionId: revisionId } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(operation ? { operation } : {}),
      ...(restoredFromRevisionId ? { restoredFromRevisionId } : {}),
      ...(needsInspectionReason ? { needsInspectionReason } : {}),
    },
  };
}

export function compareOfflinePublicationProvenance(
  projectProvenance: unknown,
  syncStateProvenance: unknown,
): OfflinePublicationProvenancePairStatus {
  if (
    projectProvenance === undefined &&
    syncStateProvenance === undefined
  ) {
    return "legacyMatch";
  }
  if (
    projectProvenance === undefined ||
    syncStateProvenance === undefined
  ) {
    return "mismatch";
  }

  const project = parseOfflinePublicationProvenance(projectProvenance);
  const syncState = parseOfflinePublicationProvenance(syncStateProvenance);
  if (!project.ok || !syncState.ok) {
    return "invalid";
  }

  return areProvenanceValuesEqual(project.value, syncState.value)
    ? "match"
    : "mismatch";
}

export function getOfflinePublicationProvenanceView(
  provenance: unknown,
): OfflinePublicationProvenanceView {
  if (provenance === undefined) {
    return {
      status: "legacyUnknown",
      label: "旧形式",
      message:
        "このsnapshotには公開revision対応が記録されていません。明示的offline syncで更新できます。",
      tone: "warning",
      warning: true,
      resyncRecommended: true,
    };
  }

  const parsed = parseOfflinePublicationProvenance(provenance);
  if (!parsed.ok) {
    return buildNeedsInspectionView({
      status: "needsInspection",
      checkedAt: new Date(0).toISOString(),
      needsInspectionReason: "publicationInvalid",
    });
  }

  const value = parsed.value;
  switch (value.status) {
    case "publishedMatch":
      return {
        ...copySafeFields(value),
        status: value.status,
        label: "公開版と一致",
        message:
          "この端末のconfirmed snapshotは、現在公開中のrevisionと一致しています。",
        tone: "success",
        warning: false,
        resyncRecommended: false,
      };
    case "unpublishedChanges":
      return {
        ...copySafeFields(value),
        status: value.status,
        label: "未公開編集を同期",
        message:
          "この端末には、公開後に保存された未公開編集を含むcurrent manifestを同期しました。公開版そのものではありません。",
        tone: "warning",
        warning: true,
        resyncRecommended: false,
      };
    case "unpublished":
      return {
        status: value.status,
        label: "未公開project",
        message:
          "まだ公開revisionがないprojectのcurrent manifestを同期しました。",
        tone: "neutral",
        warning: false,
        resyncRecommended: false,
      };
    case "needsInspection":
      return buildNeedsInspectionView(value);
  }
}

function buildNeedsInspectionView(
  value: OfflinePublicationProvenance,
): OfflinePublicationProvenanceView {
  return {
    ...copySafeFields(value),
    status: "needsInspection",
    label: "公開対応を要確認",
    message:
      "offline snapshotは作成しましたが、公開revisionとの対応を正式確認できませんでした。再同期またはDrive公開履歴の確認が必要です。",
    tone: "warning",
    warning: true,
    resyncRecommended: true,
  };
}

function copySafeFields(
  value: OfflinePublicationProvenance,
): Pick<
  OfflinePublicationProvenanceView,
  | "currentPublishedRevisionId"
  | "publishedAt"
  | "operation"
  | "restoredFromRevisionId"
  | "needsInspectionReason"
> {
  return {
    ...(value.currentPublishedRevisionId
      ? { currentPublishedRevisionId: value.currentPublishedRevisionId }
      : {}),
    ...(value.publishedAt ? { publishedAt: value.publishedAt } : {}),
    ...(value.operation ? { operation: value.operation } : {}),
    ...(value.restoredFromRevisionId
      ? { restoredFromRevisionId: value.restoredFromRevisionId }
      : {}),
    ...(value.needsInspectionReason
      ? { needsInspectionReason: value.needsInspectionReason }
      : {}),
  };
}

function areProvenanceValuesEqual(
  left: OfflinePublicationProvenance,
  right: OfflinePublicationProvenance,
): boolean {
  return (
    left.status === right.status &&
    left.checkedAt === right.checkedAt &&
    left.currentPublishedRevisionId === right.currentPublishedRevisionId &&
    left.publishedAt === right.publishedAt &&
    left.operation === right.operation &&
    left.restoredFromRevisionId === right.restoredFromRevisionId &&
    left.needsInspectionReason === right.needsInspectionReason
  );
}

function readOptionalNonEmptyString(
  value: unknown,
): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" && value.trim().length > 0 && value === value.trim()
    ? value
    : null;
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE_TIME_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): OfflinePublicationProvenanceParseResult {
  return { ok: false, reason: "invalidProvenance" };
}
