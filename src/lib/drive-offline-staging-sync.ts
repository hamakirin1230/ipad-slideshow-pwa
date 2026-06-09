// src/lib/drive-offline-staging-sync.ts

import {
  DriveOfflineStagingPromotionOrchestrationPreconditionError,
  runDriveOfflineStagingPromotionOrchestration,
  type DriveOfflineStagingPromotionOrchestrationArgs,
} from "@/lib/drive-offline-staging-orchestration";
import {
  summarizeDriveOfflineStagingPromotionOrchestrationResult,
  type DriveOfflineStagingOrchestrationSummary,
} from "@/lib/drive-offline-staging-orchestration-summary";

const DEFAULT_THROWN_DIAGNOSTIC_LIMIT = 4;
const DEFAULT_THROWN_DIAGNOSTIC_MAX_LENGTH = 160;

export type RunDriveOfflineStagingSyncArgs =
  DriveOfflineStagingPromotionOrchestrationArgs;

export type DriveOfflineStagingSyncResult =
  | DriveOfflineStagingOrchestrationSummary
  | {
      ok: false;
      status: "orchestrationPreconditionFailed";
      diagnostics: string[];
      omittedDiagnosticCount: number;
    }
  | {
      ok: false;
      status: "orchestrationUnexpectedFailure";
      diagnostics: string[];
      omittedDiagnosticCount: number;
    };

/**
 * Drive -> staging write -> promotion を実行し、UI/Provider 側で扱いやすい
 * lightweight summary だけを返す facade。
 *
 * 重要:
 * - raw orchestration result の snapshot は返さない。
 * - Blob を含む可能性がある値を React state へ載せない。
 * - UI 表示文言はまだここでは作らない。
 * - retry policy はまだここでは持たない。
 */
export async function runDriveOfflineStagingSync(
  args: RunDriveOfflineStagingSyncArgs,
): Promise<DriveOfflineStagingSyncResult> {
  try {
    const result = await runDriveOfflineStagingPromotionOrchestration(args);

    return summarizeDriveOfflineStagingPromotionOrchestrationResult(result);
  } catch (error) {
    if (
      error instanceof DriveOfflineStagingPromotionOrchestrationPreconditionError
    ) {
      const diagnostics = sanitizeThrownDiagnostics([
        "Drive offline staging orchestration の前提条件検証に失敗しました。",
        error.message,
      ]);

      return {
        ok: false,
        status: "orchestrationPreconditionFailed",
        diagnostics: diagnostics.items,
        omittedDiagnosticCount: diagnostics.omittedCount,
      };
    }

    const diagnostics = sanitizeThrownDiagnostics([
      "Drive offline staging sync facade で予期しない例外を捕捉しました。",
      getSafeErrorNameDiagnostic(error),
      "raw orchestration result は返していません。",
    ]);

    return {
      ok: false,
      status: "orchestrationUnexpectedFailure",
      diagnostics: diagnostics.items,
      omittedDiagnosticCount: diagnostics.omittedCount,
    };
  }
}

function sanitizeThrownDiagnostics(
  diagnostics: string[],
  options?: {
    limit?: number;
    maxLength?: number;
  },
): {
  items: string[];
  omittedCount: number;
} {
  const limit = options?.limit ?? DEFAULT_THROWN_DIAGNOSTIC_LIMIT;
  const maxLength = options?.maxLength ?? DEFAULT_THROWN_DIAGNOSTIC_MAX_LENGTH;

  const items = diagnostics
    .slice(0, limit)
    .map((diagnostic) => truncateDiagnostic(diagnostic, maxLength));

  return {
    items,
    omittedCount: Math.max(0, diagnostics.length - items.length),
  };
}

function truncateDiagnostic(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getSafeErrorNameDiagnostic(error: unknown): string {
  if (error instanceof Error && error.name.trim().length > 0) {
    return `error.name: ${error.name}`;
  }

  return "error.name: unknown";
}
