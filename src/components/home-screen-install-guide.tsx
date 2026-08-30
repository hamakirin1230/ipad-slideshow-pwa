"use client";

import { ChevronDown, Download, Share } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  detectPwaInstallGuideTarget,
  getPwaInstallGuideCopy,
  type PwaInstallGuideTarget,
} from "@/lib/pwa-install-browser";
import {
  isStandalonePwaDisplay,
  resolvePwaInstallActionMode,
  type BeforeInstallPromptEvent,
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
  const [directPromptAvailable, setDirectPromptAvailable] = useState(false);
  const [promptPending, setPromptPending] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const promptEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const promptInFlightRef = useRef(false);
  const acceptedInstallPendingRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    function applyStandaloneSignals() {
      const nextStandalone = isStandalonePwaDisplay(
        readBrowserStandaloneSignals(),
      );
      if (nextStandalone) {
        promptEventRef.current = null;
        promptInFlightRef.current = false;
        acceptedInstallPendingRef.current = false;
        setDirectPromptAvailable(false);
        setPromptPending(false);
        setInstallMessage(null);
        setOpen(false);
      }
      setStandalone(nextStandalone);
      setGuideTarget(detectPwaInstallGuideTarget(navigator.userAgent));
      setDisplayResolved(true);
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      if (
        promptInFlightRef.current ||
        acceptedInstallPendingRef.current ||
        isStandalonePwaDisplay(readBrowserStandaloneSignals())
      ) {
        return;
      }
      promptEventRef.current = event as BeforeInstallPromptEvent;
      setDirectPromptAvailable(true);
      setInstallMessage(null);
      setOpen(false);
    }

    function handleAppInstalled() {
      promptEventRef.current = null;
      promptInFlightRef.current = false;
      acceptedInstallPendingRef.current = false;
      setDirectPromptAvailable(false);
      setPromptPending(false);
      setInstallMessage(null);
      setOpen(false);
      setStandalone(true);
      setDisplayResolved(true);
    }

    applyStandaloneSignals();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    let media: MediaQueryList | null = null;
    if (typeof window.matchMedia === "function") {
      media = window.matchMedia("(display-mode: standalone)");
      media.addEventListener("change", applyStandaloneSignals);
    }

    return () => {
      mountedRef.current = false;
      media?.removeEventListener("change", applyStandaloneSignals);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      promptEventRef.current = null;
      promptInFlightRef.current = false;
      acceptedInstallPendingRef.current = false;
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

  const actionMode = resolvePwaInstallActionMode({
    displayResolved,
    standalone,
    directPromptAvailable,
    promptPending,
  });

  function applyManualFallback(
    message: string | null,
    acceptedInstallPending = false,
  ) {
    promptEventRef.current = null;
    promptInFlightRef.current = false;
    acceptedInstallPendingRef.current = acceptedInstallPending;
    if (!mountedRef.current) return;
    setDirectPromptAvailable(false);
    setPromptPending(false);
    setInstallMessage(message);
  }

  function handleInstallAction() {
    if (promptInFlightRef.current) return;

    const promptEvent = promptEventRef.current;
    if (!promptEvent) {
      setOpen((current) => !current);
      return;
    }

    promptEventRef.current = null;
    promptInFlightRef.current = true;

    let promptStarted: Promise<void>;
    try {
      promptStarted = promptEvent.prompt();
    } catch {
      applyManualFallback(null);
      return;
    }

    setDirectPromptAvailable(false);
    setPromptPending(true);
    setInstallMessage(null);
    setOpen(false);

    void promptStarted
      .then(() => promptEvent.userChoice)
      .then((choice) => {
        const accepted = choice.outcome === "accepted";
        applyManualFallback(
          accepted
            ? "ブラウザの案内に従ってインストールを完了してください。"
            : null,
          accepted,
        );
      })
      .catch(() => {
        applyManualFallback(null);
      });
  }

  if (actionMode === "hidden") {
    return null;
  }

  const copy = getPwaInstallGuideCopy(guideTarget);
  const manualMode = actionMode === "manual";
  const promptIsPending = actionMode === "promptPending";

  return (
    <div className="mt-4 min-w-0 max-w-xl">
      <button
        type="button"
        aria-expanded={manualMode ? open : undefined}
        aria-controls={manualMode ? panelId : undefined}
        disabled={promptIsPending}
        onClick={handleInstallAction}
        className="flex min-h-12 w-full items-center gap-2 rounded-xl px-1 text-left text-sm font-medium text-sky-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:w-auto"
      >
        {manualMode ? (
          <Share className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Download className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          {promptIsPending
            ? "インストールを確認しています"
            : manualMode
              ? "ホーム画面に追加"
              : "アプリをインストール"}
        </span>
        {manualMode ? (
          <ChevronDown
            className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        ) : null}
      </button>

      {installMessage ? (
        <p role="status" className="mt-2 text-sm leading-6 text-slate-300">
          {installMessage}
        </p>
      ) : null}

      <section
        id={panelId}
        hidden={!manualMode || !open}
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
