"use client";

import Image from "next/image";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicPublicationManifest } from "@/lib/publication/public-publication-contract";

export function PublicSlideshowViewer({
  manifest,
}: {
  manifest: PublicPublicationManifest;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [mediaError, setMediaError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const slide = manifest.slides[currentIndex] ?? null;
  const move = useCallback(
    (direction: -1 | 1) => {
      setMediaError(false);
      setCurrentIndex((current) => {
        if (manifest.slides.length === 0) return 0;
        return (
          (current + direction + manifest.slides.length) %
          manifest.slides.length
        );
      });
    },
    [manifest.slides.length],
  );

  useEffect(() => {
    if (
      !isPlaying ||
      !slide ||
      slide.mediaKind !== "image" ||
      manifest.slides.length < 2
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => move(1),
      slide.durationSeconds * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [isPlaying, manifest.slides.length, move, slide]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || slide?.mediaKind !== "video") return;
    if (isPlaying) {
      void video.play().catch(() => {
        setMediaError(true);
      });
      return;
    }
    video.pause();
  }, [isPlaying, slide]);

  return (
    <main className="flex min-h-svh flex-col bg-slate-950 text-slate-50">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <h1 className="truncate text-lg font-semibold">{manifest.title}</h1>
        <p className="shrink-0 text-sm text-slate-300">
          {manifest.slides.length === 0 ? 0 : currentIndex + 1} /{" "}
          {manifest.slides.length}
        </p>
      </header>

      <section className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {!slide ? (
          <p className="p-6 text-center text-slate-300">
            公開中のスライドはありません。
          </p>
        ) : slide.mediaKind === "image" ? (
          <Image
            key={slide.assetUrl}
            src={slide.assetUrl}
            alt=""
            fill
            unoptimized
            sizes="100vw"
            className="object-contain"
            priority
            onError={() => setMediaError(true)}
          />
        ) : (
          <video
            ref={videoRef}
            key={slide.assetUrl}
            src={slide.assetUrl}
            controls
            playsInline
            autoPlay={isPlaying}
            className="max-h-full max-w-full"
            onError={() => setMediaError(true)}
            onEnded={() => move(1)}
          />
        )}

        {slide?.caption ? (
          <p
            className="pointer-events-none absolute inset-x-0 bottom-0 px-5 py-4 text-center text-lg font-medium text-white sm:text-2xl"
            style={{ backgroundColor: "rgba(2, 6, 23, 0.78)" }}
          >
            {slide.caption}
          </p>
        ) : null}
      </section>

      {mediaError ? (
        <p
          role="status"
          className="bg-amber-950 px-4 py-3 text-center text-sm text-amber-100"
        >
          このブラウザでは素材を再生できません。前後のスライドへ進むことはできます。
        </p>
      ) : null}

      <footer className="grid grid-cols-3 gap-3 border-t border-white/10 p-4 sm:mx-auto sm:w-full sm:max-w-xl">
        <button
          type="button"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 hover:bg-white/15 disabled:opacity-50"
          onClick={() => move(-1)}
          disabled={manifest.slides.length < 2}
        >
          <SkipBack className="size-5" aria-hidden="true" />
          前へ
        </button>
        <button
          type="button"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 font-semibold text-slate-950 hover:bg-sky-200 disabled:opacity-50"
          onClick={() => setIsPlaying((value) => !value)}
          disabled={manifest.slides.length < 2}
        >
          {isPlaying ? (
            <Pause className="size-5" aria-hidden="true" />
          ) : (
            <Play className="size-5" aria-hidden="true" />
          )}
          {isPlaying ? "一時停止" : "自動送り"}
        </button>
        <button
          type="button"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 hover:bg-white/15 disabled:opacity-50"
          onClick={() => move(1)}
          disabled={manifest.slides.length < 2}
        >
          次へ
          <SkipForward className="size-5" aria-hidden="true" />
        </button>
      </footer>
    </main>
  );
}
