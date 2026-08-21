import { requestToPromise, runOfflineTransaction } from "@/lib/offline-db";
import {
  OFFLINE_PROJECTS_STORE,
  OFFLINE_SYNC_STATE_STORE,
  type OfflineProject,
  type OfflineSyncState,
} from "@/lib/offline-schema";

export type OfflineProjectPlaybackReadiness =
  | { status: "ready" }
  | { status: "notReady" }
  | { status: "unavailable" };

export type OfflineProjectPlaybackReadinessStores = {
  getProject: (projectId: string) => Promise<{ projectId: string } | undefined>;
  getSyncState: (
    projectId: string,
  ) => Promise<{ projectId: string; status: string } | undefined>;
};

export function evaluateOfflineProjectPlaybackReadiness(input: {
  projectId: string;
  project: { projectId: string } | null | undefined;
  syncState: { projectId: string; status: string } | null | undefined;
}): OfflineProjectPlaybackReadiness {
  const projectId = input.projectId.trim();
  if (!projectId) {
    return { status: "notReady" };
  }
  if (!input.project || !input.syncState) {
    return { status: "notReady" };
  }
  if (
    input.project.projectId !== projectId ||
    input.syncState.projectId !== projectId
  ) {
    return { status: "notReady" };
  }
  if (input.syncState.status !== "ready") {
    return { status: "notReady" };
  }
  return { status: "ready" };
}

export async function readOfflineProjectPlaybackReadiness(
  projectId: string,
  stores?: OfflineProjectPlaybackReadinessStores,
): Promise<OfflineProjectPlaybackReadiness> {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) {
    return { status: "notReady" };
  }

  try {
    const records = stores
      ? {
          project: await stores.getProject(normalizedProjectId),
          syncState: await stores.getSyncState(normalizedProjectId),
        }
      : await readOfflinePlaybackReadinessRecords(normalizedProjectId);
    return evaluateOfflineProjectPlaybackReadiness({
      projectId: normalizedProjectId,
      project: records.project,
      syncState: records.syncState,
    });
  } catch {
    return { status: "unavailable" };
  }
}

async function readOfflinePlaybackReadinessRecords(projectId: string) {
  return runOfflineTransaction(
    [OFFLINE_PROJECTS_STORE, OFFLINE_SYNC_STATE_STORE],
    "readonly",
    async ({ stores }) => {
      const project = await requestToPromise<OfflineProject | undefined>(
        stores[OFFLINE_PROJECTS_STORE].get(projectId),
      );
      const syncState = await requestToPromise<OfflineSyncState | undefined>(
        stores[OFFLINE_SYNC_STATE_STORE].get(projectId),
      );
      return { project, syncState };
    },
  );
}
