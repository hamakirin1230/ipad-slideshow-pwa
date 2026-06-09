"use client";

import { useEffect, useRef, useState } from "react";
import type { OfflinePlaybackSlide } from "@/lib/offline-playback-snapshot";

export type OfflineCurrentSlideImageStatus = "idle" | "ready" | "error";

type UseOfflineCurrentSlideImageInput = {
  canRender: boolean;
  slide: OfflinePlaybackSlide | null;
};

type UseOfflineCurrentSlideImageResult = {
  status: OfflineCurrentSlideImageStatus;
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

const offlineSlideImageErrorMessage =
  "offline store のスライド画像を表示できません。";

export function useOfflineCurrentSlideImage({
  canRender,
  slide,
}: UseOfflineCurrentSlideImageInput): UseOfflineCurrentSlideImageResult {
  const [asyncImageState, setAsyncImageState] =
    useState<AsyncImageState>(null);

  const currentObjectUrlRef = useRef<string | null>(null);

  const requestKey =
    canRender && slide
      ? [
          slide.slideId,
          slide.assetId,
          slide.order,
          slide.blobMimeType,
          slide.blobSizeBytes,
        ].join(":")
      : null;

  useEffect(() => {
    if (!requestKey || !slide) {
      return;
    }

    let cancelled = false;
    let createdObjectUrl: string | null = null;

    try {
      createdObjectUrl = URL.createObjectURL(slide.blob);
    } catch {
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        revokeCurrentObjectUrl();
        setAsyncImageState({
          requestKey,
          status: "error",
          objectUrl: null,
          errorMessage: offlineSlideImageErrorMessage,
        });
      });

      return () => {
        cancelled = true;
      };
    }

    const objectUrl = createdObjectUrl;

    queueMicrotask(() => {
      if (cancelled) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      revokeCurrentObjectUrl();
      currentObjectUrlRef.current = objectUrl;
      createdObjectUrl = null;

      setAsyncImageState({
        requestKey,
        status: "ready",
        objectUrl,
        errorMessage: null,
      });
    });

    return () => {
      cancelled = true;

      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
        createdObjectUrl = null;
      }

      if (currentObjectUrlRef.current === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        currentObjectUrlRef.current = null;
      }
    };
  }, [requestKey, slide]);

  if (!requestKey) {
    return {
      status: "idle",
      objectUrl: null,
      errorMessage: null,
    };
  }

  if (!asyncImageState || asyncImageState.requestKey !== requestKey) {
    return {
      status: "idle",
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
