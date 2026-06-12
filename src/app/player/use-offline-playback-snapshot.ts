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

const offlinePlaybackSnapshotErrorMessage =
  "offline playback snapshot を読み込めませんでした。";

export function useOfflinePlaybackSnapshot(): UseOfflinePlaybackSnapshotResult {
  const requestIdRef = useRef(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() =>
    readInitialPlaybackProjectId(),
  );
  const [state, setState] = useState<UseOfflinePlaybackSnapshotState>({
    status: "loading",
    snapshot: null,
    errorMessage: null,
  });

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
    setSelectedProjectId(normalizedProjectId);
  }, []);

  const clearSelectedProject = useCallback(() => {
    clearStoredPlaybackProjectId();
    setSelectedProjectId(null);
  }, []);

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

async function loadOfflinePlaybackSnapshot(
  requestIdRef: MutableRefObject<number>,
  requestId: number,
  selectedProjectId: string | null,
  setState: Dispatch<SetStateAction<UseOfflinePlaybackSnapshotState>>,
) {
  try {
    const snapshot = await readOfflinePlaybackSnapshot({
      projectId: selectedProjectId,
    });

    if (requestId !== requestIdRef.current) {
      return;
    }

    setState({
      status: "ready",
      snapshot,
      errorMessage: null,
    });
  } catch {
    if (requestId !== requestIdRef.current) {
      return;
    }

    setState({
      status: "error",
      snapshot: null,
      errorMessage: offlinePlaybackSnapshotErrorMessage,
    });
  }
}

function readInitialPlaybackProjectId() {
  const urlProjectId = readUrlPlaybackProjectId();

  if (urlProjectId) {
    writeStoredPlaybackProjectId(urlProjectId);
    return urlProjectId;
  }

  return readStoredPlaybackProjectId();
}

function readUrlPlaybackProjectId() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const projectId = new URLSearchParams(window.location.search).get("projectId");
    const trimmedProjectId = projectId?.trim() ?? "";

    return trimmedProjectId.length === 0 ? null : trimmedProjectId;
  } catch {
    return null;
  }
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
