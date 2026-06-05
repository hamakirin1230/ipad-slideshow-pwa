"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectSlideSummary } from "@/app/app-providers";

export type PlayerCurrentSlideImageStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

type FetchProjectSlidePreviewBlob = (
  assetFileId: string,
  expectedMimeType: ProjectSlideSummary["mimeType"],
  signal: AbortSignal,
) => Promise<Blob>;

type UsePlayerCurrentSlideImageInput = {
  canFetch: boolean;
  slide: ProjectSlideSummary | null;
  fetchProjectSlidePreviewBlob: FetchProjectSlidePreviewBlob;
};

type UsePlayerCurrentSlideImageResult = {
  status: PlayerCurrentSlideImageStatus;
  objectUrl: string | null;
  errorMessage: string | null;
};

type AsyncImageState =
  | {
      requestKey: string;
      status: "ready";
      objectUrl: string;
      errorMessage: null;
    }
  | {
      requestKey: string;
      status: "error";
      objectUrl: null;
      errorMessage: string;
    }
  | null;

const playerSlideImageErrorMessage = "スライド画像を表示できません。";

export function usePlayerCurrentSlideImage({
  canFetch,
  slide,
  fetchProjectSlidePreviewBlob,
}: UsePlayerCurrentSlideImageInput): UsePlayerCurrentSlideImageResult {
  const [asyncImageState, setAsyncImageState] =
    useState<AsyncImageState>(null);

  const currentObjectUrlRef = useRef<string | null>(null);
  const requestNonceRef = useRef(0);
  const fetchProjectSlidePreviewBlobRef = useRef(fetchProjectSlidePreviewBlob);

  const targetAssetFileId = canFetch && slide ? slide.assetFileId : null;
  const targetMimeType = canFetch && slide ? slide.mimeType : null;
  const requestKey =
    targetAssetFileId && targetMimeType
      ? `${targetAssetFileId}:${targetMimeType}`
      : null;

  useEffect(() => {
    fetchProjectSlidePreviewBlobRef.current = fetchProjectSlidePreviewBlob;
  }, [fetchProjectSlidePreviewBlob]);

  useEffect(() => {
    if (requestKey) {
      return;
    }

    requestNonceRef.current += 1;

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setAsyncImageState(null);
    });

    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  useEffect(() => {
    if (!requestKey || !targetAssetFileId || !targetMimeType) {
      return;
    }

    const key = requestKey;
    const assetFileId = targetAssetFileId;
    const mimeType = targetMimeType;
    const controller = new AbortController();
    let createdObjectUrl: string | null = null;

    requestNonceRef.current += 1;
    const requestNonce = requestNonceRef.current;

    revokeCurrentObjectUrl();

    async function loadCurrentSlideImage() {
      try {
        const blob = await fetchProjectSlidePreviewBlobRef.current(
          assetFileId,
          mimeType,
          controller.signal,
        );

        if (
          controller.signal.aborted ||
          requestNonce !== requestNonceRef.current
        ) {
          return;
        }

        const nextObjectUrl = URL.createObjectURL(blob);
        createdObjectUrl = nextObjectUrl;

        if (
          controller.signal.aborted ||
          requestNonce !== requestNonceRef.current
        ) {
          URL.revokeObjectURL(nextObjectUrl);
          createdObjectUrl = null;
          return;
        }

        currentObjectUrlRef.current = nextObjectUrl;
        createdObjectUrl = null;

        setAsyncImageState({
          requestKey: key,
          status: "ready",
          objectUrl: nextObjectUrl,
          errorMessage: null,
        });
      } catch (error) {
        if (
          controller.signal.aborted ||
          requestNonce !== requestNonceRef.current ||
          isAbortError(error)
        ) {
          return;
        }

        revokeCurrentObjectUrl();

        setAsyncImageState({
          requestKey: key,
          status: "error",
          objectUrl: null,
          errorMessage: playerSlideImageErrorMessage,
        });
      }
    }

    void loadCurrentSlideImage();

    return () => {
      controller.abort();

      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
        createdObjectUrl = null;
      }

      revokeCurrentObjectUrl();
    };
  }, [requestKey, targetAssetFileId, targetMimeType]);

  if (!requestKey) {
    return {
      status: "idle",
      objectUrl: null,
      errorMessage: null,
    };
  }

  if (!asyncImageState || asyncImageState.requestKey !== requestKey) {
    return {
      status: "loading",
      objectUrl: null,
      errorMessage: null,
    };
  }

  return {
    status: asyncImageState.status,
    objectUrl: asyncImageState.objectUrl,
    errorMessage: asyncImageState.errorMessage,
  };

  function revokeCurrentObjectUrl() {
    if (!currentObjectUrlRef.current) {
      return;
    }

    URL.revokeObjectURL(currentObjectUrlRef.current);
    currentObjectUrlRef.current = null;
  }
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
