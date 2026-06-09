// src/lib/drive-offline-staging-sync-runtime.ts

import {
  runDriveOfflineStagingSync,
  type DriveOfflineStagingSyncResult,
  type RunDriveOfflineStagingSyncArgs,
} from "@/lib/drive-offline-staging-sync";

export const DRIVE_OFFLINE_STAGING_SYNC_DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const RUNTIME_DIAGNOSTIC_MAX_LENGTH = 160;

export type DriveOfflineStagingSyncRuntimeRunArgs = Omit<
  RunDriveOfflineStagingSyncArgs,
  "signal"
> & {
  /**
   * undefined の場合は 5 分。
   * null の場合は runtime 側 timeout なし。
   */
  timeoutMs?: number | null;
};

export type DriveOfflineStagingSyncRuntimeResult =
  | DriveOfflineStagingSyncResult
  | {
      ok: false;
      status: "syncAlreadyInFlight";
      diagnostics: string[];
      omittedDiagnosticCount: number;
    }
  | {
      ok: false;
      status: "syncRuntimeCancelled";
      diagnostics: string[];
      omittedDiagnosticCount: number;
    };

export type DriveOfflineStagingSyncRuntime = {
  isInFlight: () => boolean;
  cancelCurrentRun: () => void;
  run: (
    args: DriveOfflineStagingSyncRuntimeRunArgs,
  ) => Promise<DriveOfflineStagingSyncRuntimeResult>;
};

/**
 * Drive offline sync 専用の軽量 runtime。
 *
 * 目的:
 * - 既存の短い Drive operation timeout と分離する。
 * - 同時実行を防ぐ。
 * - AbortController をこの runtime 内に閉じ込める。
 * - access_token を保持し続けない。
 *
 * 注意:
 * - UI state は持たない。
 * - user-facing copy は作らない。
 * - retry policy は持たない。
 */
export function createDriveOfflineStagingSyncRuntime(): DriveOfflineStagingSyncRuntime {
  let inFlight = false;
  let currentRunId = 0;
  let currentController: AbortController | null = null;
  let currentTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentCancelReason: "manual" | "timeout" | null = null;

  function clearRuntimeTimeout(): void {
    if (!currentTimeout) {
      return;
    }

    clearTimeout(currentTimeout);
    currentTimeout = null;
  }

  function clearCurrentController(runId: number): void {
    if (runId !== currentRunId) {
      return;
    }

    clearRuntimeTimeout();
    currentController = null;
    currentCancelReason = null;
    inFlight = false;
  }

  function cancelCurrentRun(): void {
    currentRunId += 1;
    currentCancelReason = "manual";
    clearRuntimeTimeout();

    if (currentController) {
      currentController.abort();
      currentController = null;
    }

    inFlight = false;
  }

  async function run(
    args: DriveOfflineStagingSyncRuntimeRunArgs,
  ): Promise<DriveOfflineStagingSyncRuntimeResult> {
    if (inFlight) {
      return {
        ok: false,
        status: "syncAlreadyInFlight",
        diagnostics: sanitizeRuntimeDiagnostics([
          "Drive offline staging sync is already in flight.",
        ]),
        omittedDiagnosticCount: 0,
      };
    }

    currentRunId += 1;
    const runId = currentRunId;
    const controller = new AbortController();

    inFlight = true;
    currentController = controller;
    currentCancelReason = null;

    const timeoutMs = args.timeoutMs ?? DRIVE_OFFLINE_STAGING_SYNC_DEFAULT_TIMEOUT_MS;

    if (timeoutMs !== null) {
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
        clearCurrentController(runId);

        return {
          ok: false,
          status: "syncRuntimeCancelled",
          diagnostics: sanitizeRuntimeDiagnostics([
            "Drive offline staging sync timeoutMs must be a positive safe integer, or null.",
          ]),
          omittedDiagnosticCount: 0,
        };
      }

      currentTimeout = setTimeout(() => {
        if (runId !== currentRunId || !currentController) {
          return;
        }

        currentCancelReason = "timeout";
        currentController.abort();
      }, timeoutMs);
    }

    try {
      const result = await runDriveOfflineStagingSync({
        ...args,
        signal: controller.signal,
      });

      if (runId !== currentRunId) {
        return {
          ok: false,
          status: "syncRuntimeCancelled",
          diagnostics: sanitizeRuntimeDiagnostics([
            "Drive offline staging sync result was ignored because a newer run superseded it.",
          ]),
          omittedDiagnosticCount: 0,
        };
      }

      if (
        !result.ok &&
        result.status === "driveFetchOrStagingWriteFailed" &&
        currentCancelReason
      ) {
        return {
          ok: false,
          status: "syncRuntimeCancelled",
          diagnostics: sanitizeRuntimeDiagnostics([
            currentCancelReason === "timeout"
              ? "Drive offline staging sync was aborted by runtime timeout."
              : "Drive offline staging sync was manually cancelled.",
            ...result.diagnostics,
          ]),
          omittedDiagnosticCount: result.omittedDiagnosticCount,
        };
      }

      return result;
    } finally {
      clearCurrentController(runId);
    }
  }

  return {
    isInFlight: () => inFlight,
    cancelCurrentRun,
    run,
  };
}

function sanitizeRuntimeDiagnostics(diagnostics: string[]): string[] {
  return diagnostics.map((diagnostic) =>
    truncateDiagnostic(diagnostic, RUNTIME_DIAGNOSTIC_MAX_LENGTH),
  );
}

function truncateDiagnostic(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
