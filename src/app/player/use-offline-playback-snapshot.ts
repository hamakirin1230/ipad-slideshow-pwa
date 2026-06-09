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
    reload: () => void;
  };

const offlinePlaybackSnapshotErrorMessage =
  "offline playback snapshot を読み込めませんでした。";

export function useOfflinePlaybackSnapshot(): UseOfflinePlaybackSnapshotResult {
  const requestIdRef = useRef(0);
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

    void loadOfflinePlaybackSnapshot(requestIdRef, requestId, setState);
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      void loadOfflinePlaybackSnapshot(requestIdRef, requestId, setState);
    });

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, []);

  return {
    ...state,
    reload,
  };
}

async function loadOfflinePlaybackSnapshot(
  requestIdRef: MutableRefObject<number>,
  requestId: number,
  setState: Dispatch<SetStateAction<UseOfflinePlaybackSnapshotState>>,
) {
  try {
    const snapshot = await readOfflinePlaybackSnapshot();

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
