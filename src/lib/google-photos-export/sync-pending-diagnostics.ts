import type { DriveProjectSummary } from "../google-drive";
import { readDrivePhotosSyncBinding } from "./drive-sync-binding";
import { parseGooglePhotosSyncBinding, type GooglePhotosSyncPendingPhase } from "./sync-binding";
import { prepareGooglePhotosSyncSourceWithAdapter } from "./sync-drive-source";
import { inspectGooglePhotosSyncPendingContinuation } from "./sync-pending";
import { readAllGooglePhotosSyncAlbumMediaItemIds } from "./sync-reconciliation";
import { getGooglePhotosSyncAlbum, searchGooglePhotosSyncAlbumMediaItemsPage } from "./sync-library-api";
import type { GooglePhotosSyncUiReviewAdapters } from "./sync-ui-review";

export type GooglePhotosSyncMembershipDiagnostic = {
  status: "match" | "missing" | "extra" | "indeterminate" | "unavailable";
  explanation: string;
  comparable: boolean;
  missingCount: number | null;
  extraCount: number | null;
  unmanagedCount: number | null;
};

// Only categorical explanations and counts cross the Provider/UI boundary.
export type GooglePhotosSyncPendingDiagnostics = {
  hasPending: boolean;
  phase: GooglePhotosSyncPendingPhase | null;
  phaseExplanation: string;
  sourceChanged: boolean | null;
  targetCount: number | null;
  previousManagedCount: number;
  stableManagedCount: number;
  membership: GooglePhotosSyncMembershipDiagnostic;
  manualConfirmationRequired: true;
  autoResume: false;
};

export type GooglePhotosSyncDiagnosticsResult =
  | { ok: true; diagnostics: GooglePhotosSyncPendingDiagnostics }
  | { ok: false; reason: "notReady" | "cancelled" | "bindingUnavailable" | "bindingInvalid" };

export const GOOGLE_PHOTOS_SYNC_PHASE_EXPLANATIONS: Record<GooglePhotosSyncPendingPhase, string> = {
  creatingAlbum: "同期先アルバムを作成する段階です。実際に作成されたかは確定できません。",
  albumBound: "同期先との紐付けは記録済みですが、写真の作成や更新は未確定です。",
  mediaCreating: "写真が作成された可能性があります。重複作成の危険があるため自動再送できません。",
  mediaPrepared: "目標写真は管理情報に記録済みです。アルバム内の写真構成は別途確認が必要です。",
  membershipRemoving: "前回の管理対象写真をアルバムから外す処理が途中の可能性があります。",
  membershipAdding: "目標写真をアルバムへ追加する処理が途中の可能性があります。",
  titleUpdating: "アルバム名の変更が途中の可能性があります。",
  finalizing: "前回の同期は最終確認または同期管理情報の確定の途中だった可能性があります。",
};

export type GooglePhotosSyncDiagnosticsAdapters = GooglePhotosSyncUiReviewAdapters & {
  getAlbum: typeof getGooglePhotosSyncAlbum;
  searchAlbumMediaItemsPage: typeof searchGooglePhotosSyncAlbumMediaItemsPage;
};

const defaultAdapters: GooglePhotosSyncDiagnosticsAdapters = {
  prepareSource: prepareGooglePhotosSyncSourceWithAdapter,
  readBinding: readDrivePhotosSyncBinding,
  getAlbum: getGooglePhotosSyncAlbum,
  searchAlbumMediaItemsPage: searchGooglePhotosSyncAlbumMediaItemsPage,
};

function unknownMembership(status: "indeterminate" | "unavailable", explanation: string): GooglePhotosSyncMembershipDiagnostic {
  return { status, explanation, comparable: false, missingCount: null, extraCount: null, unmanagedCount: null };
}

export async function diagnoseGooglePhotosSyncPending(
  input: {
    accessToken: string;
    photosAccessToken: string | null;
    selectedProjectId: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: DriveProjectSummary;
    signal: AbortSignal;
    isCurrent: () => boolean;
  },
  adapters: GooglePhotosSyncDiagnosticsAdapters = defaultAdapters,
): Promise<GooglePhotosSyncDiagnosticsResult> {
  function guard() {
    input.signal.throwIfAborted();
    if (!input.isCurrent()) throw new DOMException("Diagnostic authority changed", "AbortError");
  }
  try {
    guard();
    const read = await adapters.readBinding({
      accessToken: input.accessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      classifyAuthFailure: true,
      signal: input.signal,
    });
    guard();
    if (read.status === "unbound") {
      return { ok: true, diagnostics: {
        hasPending: false, phase: null, phaseExplanation: "未完了同期の管理情報はありません。",
        sourceChanged: null, targetCount: null, previousManagedCount: 0, stableManagedCount: 0,
        membership: unknownMembership("unavailable", "未完了同期の照合対象がありません。"),
        manualConfirmationRequired: true, autoResume: false,
      } };
    }
    if (read.status !== "ready") {
      return { ok: false, reason: read.status === "invalid" || read.status === "duplicate" ? "bindingInvalid" : "bindingUnavailable" };
    }
    const parsed = parseGooglePhotosSyncBinding(read.binding, {
      workspaceId: input.workspaceId, projectId: input.selectedProjectId,
    });
    if (!parsed.ok) return { ok: false, reason: "bindingInvalid" };
    const binding = parsed.value;
    const pending = binding.pending;
    if (pending && !inspectGooglePhotosSyncPendingContinuation({
      binding, expectedOperationId: pending.operationId,
      expectedSourceFingerprint: pending.sourceFingerprint, expectedTargetTitle: pending.targetTitle,
    }).ok) return { ok: false, reason: "bindingInvalid" };

    let sourceChanged: boolean | null = null;
    if (pending) {
      try {
        guard();
        const source = await adapters.prepareSource({
          accessToken: input.accessToken, selectedProjectId: input.selectedProjectId,
          workspaceId: input.workspaceId, projectsRootFolderId: input.projectsRootFolderId,
          project: input.project, signal: input.signal,
        });
        guard();
        if (source.ok) sourceChanged = pending.sourceFingerprint !== source.source.sourceFingerprint || pending.targetTitle !== source.source.targetAlbumTitle;
      } catch (error) {
        guard();
        if (error instanceof Error && error.name === "AbortError") throw error;
      }
    }
    const diagnostics: GooglePhotosSyncPendingDiagnostics = {
      hasPending: pending !== null, phase: pending?.phase ?? null,
      phaseExplanation: pending ? GOOGLE_PHOTOS_SYNC_PHASE_EXPLANATIONS[pending.phase] : "未完了同期は記録されていません。写真の同期完了を意味するものではありません。",
      sourceChanged, targetCount: pending && pending.targetItems.length > 0 ? pending.targetItems.length : null,
      previousManagedCount: pending?.previousManagedMediaItemIds.length ?? 0,
      stableManagedCount: binding.stable?.items.length ?? 0,
      membership: unknownMembership("unavailable", "Googleフォトの既存利用許可がないため、写真構成は確認していません。"),
      manualConfirmationRequired: true, autoResume: false,
    };
    if (!input.photosAccessToken) return { ok: true, diagnostics };
    if (!pending || !binding.album || pending.targetItems.length === 0 || pending.phase === "creatingAlbum" || pending.phase === "mediaCreating") {
      diagnostics.membership = unknownMembership("indeterminate", "目標写真の情報が未確定のため、写真構成は判定できません。要手動確認です。");
      return { ok: true, diagnostics };
    }
    try {
      guard();
      const album = await adapters.getAlbum({ accessToken: input.photosAccessToken, albumId: binding.album.albumId, signal: input.signal });
      guard();
      if (album.status !== "ready" || album.album.id !== binding.album.albumId) {
        diagnostics.membership = unknownMembership("indeterminate", "Googleフォト側のアルバムを確認できませんでした。");
        return { ok: true, diagnostics };
      }
      // isWriteable describes creation permission, not read-only inspection.
      const membership = await readAllGooglePhotosSyncAlbumMediaItemIds({
        accessToken: input.photosAccessToken, albumId: binding.album.albumId, signal: input.signal,
      }, async page => {
        guard();
        const result = await adapters.searchAlbumMediaItemsPage(page);
        guard();
        return result;
      });
      guard();
      if (!membership.ok) {
        diagnostics.membership = unknownMembership("indeterminate", "Googleフォト側の写真構成を最後まで確認できませんでした。");
        return { ok: true, diagnostics };
      }
      const targets = pending.targetItems.map(item => item.mediaItemId);
      const targetSet = new Set(targets);
      const current = new Set(membership.mediaItemIds);
      const known = new Set([...targets, ...pending.previousManagedMediaItemIds, ...(binding.stable?.items.map(item => item.mediaItemId) ?? [])]);
      const missingCount = targets.filter(id => !current.has(id)).length;
      const extraCount = membership.mediaItemIds.filter(id => !targetSet.has(id)).length;
      const unmanagedCount = membership.mediaItemIds.filter(id => !known.has(id)).length;
      const ordered = membership.mediaItemIds.filter(id => targetSet.has(id));
      const orderMatches = ordered.length === targets.length && ordered.every((id, index) => id === targets[index]);
      const status = missingCount > 0 ? "missing" : !orderMatches ? "indeterminate" : extraCount > 0 ? "extra" : "match";
      diagnostics.membership = {
        status, comparable: status !== "indeterminate", missingCount, extraCount, unmanagedCount,
        explanation: status === "match" ? "前回の目標写真と順序が一致しています。未完了同期の完了を意味しません。"
          : status === "missing" ? "前回の目標写真の一部がアルバム内で確認できません。要手動確認です。"
          : status === "extra" ? "前回の目標以外の写真もあります。手動追加・管理外の写真を含む可能性があり、削除対象とは判断しません。"
          : "前回の目標写真の順序を確認できません。要手動確認です。",
      };
    } catch (error) {
      guard();
      if (error instanceof Error && error.name === "AbortError") throw error;
      diagnostics.membership = unknownMembership("indeterminate", "Googleフォト側の写真構成は確認できませんでした。");
    }
    guard();
    return { ok: true, diagnostics };
  } catch (error) {
    return { ok: false, reason: input.signal.aborted || (error instanceof Error && error.name === "AbortError") ? "cancelled" : "bindingUnavailable" };
  }
}
