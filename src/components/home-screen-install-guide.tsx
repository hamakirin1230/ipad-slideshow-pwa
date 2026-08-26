"use client";

import { ChevronDown, Share } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  detectPwaInstallGuideTarget,
  getPwaInstallGuideCopy,
  type PwaInstallGuideTarget,
} from "@/lib/pwa-install-browser";
import {
  isStandalonePwaDisplay,
  type PwaStandaloneSignals,
} from "@/lib/pwa-install";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function readBrowserStandaloneSignals(): PwaStandaloneSignals {
  const displayModeStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;

  const browserNavigator = navigator as NavigatorWithStandalone;
  const navigatorStandalone =
    "standalone" in browserNavigator
      ? browserNavigator.standalone === true
      : undefined;

  return { displayModeStandalone, navigatorStandalone };
}

function ShareHintIcon() {
  return <Share className="mt-0.5 size-4 shrink-0" aria-hidden="true" />;
}

export function HomeScreenInstallGuide() {
  const panelId = useId();
  const headingId = useId();
  const [displayResolved, setDisplayResolved] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [guideTarget, setGuideTarget] = useState<PwaInstallGuideTarget>({
    platform: "other",
    browser: "other",
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function applyStandaloneSignals() {
      setStandalone(isStandalonePwaDisplay(readBrowserStandaloneSignals()));
      setGuideTarget(detectPwaInstallGuideTarget(navigator.userAgent));
      setDisplayResolved(true);
    }

    applyStandaloneSignals();

    if (typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", applyStandaloneSignals);
    return () => {
      media.removeEventListener("change", applyStandaloneSignals);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!displayResolved || standalone) {
    return null;
  }

  const copy = getPwaInstallGuideCopy(guideTarget);

  return (
    <div className="mt-4 min-w-0 max-w-xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-12 w-full items-center gap-2 rounded-xl px-1 text-left text-sm font-medium text-sky-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:w-auto"
      >
        <Share className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">ホーム画面に追加</span>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      <section
        id={panelId}
        hidden={!open}
        aria-labelledby={headingId}
        className="mt-2 rounded-xl bg-white/[0.035] px-4 py-4 text-sm leading-6 text-slate-300"
      >
        <h2 id={headingId} className="text-base font-semibold text-slate-50">
          {copy.heading}
        </h2>
        {copy.openedInLabel ? (
          <p className="mt-1 text-slate-400">{copy.openedInLabel}</p>
        ) : null}
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          {copy.steps.map((step, index) => (
            <li key={step}>
              {index === 0 && copy.showShareIconOnFirstStep ? (
                <span className="inline-flex min-w-0 items-start gap-2">
                  <ShareHintIcon />
                  <span>{step}</span>
                </span>
              ) : (
                step
              )}
            </li>
          ))}
        </ol>
        {copy.footer ? (
          <p className="mt-3 text-slate-400">{copy.footer}</p>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-3 flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          閉じる
        </button>
      </section>
    </div>
  );
}
