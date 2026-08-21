"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  readOfflinePlaybackSnapshot,
  type OfflinePlaybackSnapshot,
} from "@/lib/offline-playback-snapshot";

const LAST_PLAYBACK_PROJECT_ID_STORAGE_KEY =
  "ipad-slideshow:last-playback-project-id";

export type UseOfflinePlaybackSnapshotState =
  | {
      status: "loading";
      snapshot: null;
      errorMessage: null;
    }
  | {
      status: "ready";
      snapshot: OfflinePlaybackSnapshot;
      errorMessage: null;
    }
  | {
      status: "error";
      snapshot: null;
      errorMessage: string;
    };

export type UseOfflinePlaybackSnapshotResult =
  UseOfflinePlaybackSnapshotState & {
    selectedProjectId: string | null;
    selectProject: (projectId: string) => void;
    clearSelectedProject: () => void;
    reload: () => void;
  };

export type ReadOfflinePlaybackSnapshotFn = (input: {
  projectId: string | null;
}) => Promise<OfflinePlaybackSnapshot>;

const offlinePlaybackSnapshotErrorMessage =
  "offline playback snapshot を読み込めませんでした。";

export function useOfflinePlaybackSnapshot(input?: {
  requestedProjectId?: string | null;
}): UseOfflinePlaybackSnapshotResult {
  const requestIdRef = useRef(0);
  const requestedProjectId = normalizePlaybackProjectId(
    input?.requestedProjectId ?? null,
  );
  const [storedProjectId, setStoredProjectId] = useState<string | null>(() =>
    readStoredPlaybackProjectId(),
  );
  const selectedProjectId = resolvePlaybackProjectId({
    requestedProjectId,
    storedProjectId,
  });
  const [state, setState] = useState<UseOfflinePlaybackSnapshotState>({
    status: "loading",
    snapshot: null,
    errorMessage: null,
  });

  useEffect(() => {
    if (!requestedProjectId) {
      return;
    }
    writeStoredPlaybackProjectId(requestedProjectId);
  }, [requestedProjectId]);

  const reload = useCallback(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    setState({
      status: "loading",
      snapshot: null,
      errorMessage: null,
    });

    void loadOfflinePlaybackSnapshot(
      requestIdRef,
      requestId,
      selectedProjectId,
      setState,
    );
  }, [selectedProjectId]);

  const selectProject = useCallback((projectId: string) => {
    const normalizedProjectId = projectId.trim();

    if (normalizedProjectId.length === 0) {
      return;
    }

    writeStoredPlaybackProjectId(normalizedProjectId);
    setStoredProjectId(normalizedProjectId);
  }, [setStoredProjectId]);

  const clearSelectedProject = useCallback(() => {
    clearStoredPlaybackProjectId();
    setStoredProjectId(null);
  }, [setStoredProjectId]);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      void loadOfflinePlaybackSnapshot(
        requestIdRef,
        requestId,
        selectedProjectId,
        setState,
      );
    });

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [selectedProjectId]);

  return {
    ...state,
    selectedProjectId,
    selectProject,
    clearSelectedProject,
    reload,
  };
}

export async function loadOfflinePlaybackSnapshotForRequest(input: {
  requestId: number;
  getCurrentRequestId: () => number;
  projectId: string | null;
  readSnapshot?: ReadOfflinePlaybackSnapshotFn;
}): Promise<
  | { kind: "ignored" }
  | { kind: "ready"; snapshot: OfflinePlaybackSnapshot }
  | { kind: "error"; errorMessage: string }
> {
  try {
    const snapshot = await (input.readSnapshot ?? readOfflinePlaybackSnapshot)({
      projectId: input.projectId,
    });

    if (input.requestId !== input.getCurrentRequestId()) {
      return { kind: "ignored" };
    }

    return { kind: "ready", snapshot };
  } catch {
    if (input.requestId !== input.getCurrentRequestId()) {
      return { kind: "ignored" };
    }

    return {
      kind: "error",
      errorMessage: offlinePlaybackSnapshotErrorMessage,
    };
  }
}

async function loadOfflinePlaybackSnapshot(
  requestIdRef: MutableRefObject<number>,
  requestId: number,
  selectedProjectId: string | null,
  setState: Dispatch<SetStateAction<UseOfflinePlaybackSnapshotState>>,
) {
  const result = await loadOfflinePlaybackSnapshotForRequest({
    requestId,
    getCurrentRequestId: () => requestIdRef.current,
    projectId: selectedProjectId,
  });

  if (result.kind === "ignored") {
    return;
  }

  if (result.kind === "error") {
    setState({
      status: "error",
      snapshot: null,
      errorMessage: result.errorMessage,
    });
    return;
  }

  setState({
    status: "ready",
    snapshot: result.snapshot,
    errorMessage: null,
  });
}

export function resolvePlaybackProjectId(input: {
  requestedProjectId: string | null;
  storedProjectId: string | null;
}) {
  return (
    normalizePlaybackProjectId(input.requestedProjectId) ??
    normalizePlaybackProjectId(input.storedProjectId)
  );
}

export function resolveInitialPlaybackProjectId(input: {
  urlProjectId: string | null;
  storedProjectId: string | null;
}) {
  return resolvePlaybackProjectId({
    requestedProjectId: input.urlProjectId,
    storedProjectId: input.storedProjectId,
  });
}

function readStoredPlaybackProjectId() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(
      LAST_PLAYBACK_PROJECT_ID_STORAGE_KEY,
    );
    const trimmedValue = value?.trim() ?? "";

    return trimmedValue.length === 0 ? null : trimmedValue;
  } catch {
    return null;
  }
}

function writeStoredPlaybackProjectId(projectId: string) {
  try {
    window.localStorage.setItem(LAST_PLAYBACK_PROJECT_ID_STORAGE_KEY, projectId);
  } catch {
    // Persisting the last selected project is best-effort only.
  }
}

function clearStoredPlaybackProjectId() {
  try {
    window.localStorage.removeItem(LAST_PLAYBACK_PROJECT_ID_STORAGE_KEY);
  } catch {
    // Clearing the last selected project is best-effort only.
  }
}

function normalizePlaybackProjectId(projectId: string | null | undefined) {
  const normalizedProjectId = projectId?.trim() ?? "";
  return normalizedProjectId.length === 0 ? null : normalizedProjectId;
}
