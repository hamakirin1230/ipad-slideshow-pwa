import {
  preflightGooglePhotosRecovery,
  type RecoveryPreflightInput,
  type RecoveryPreflightReport,
} from "./sync-recovery-preflight";

/**
 * Pure memory-only diagnostic. Ports are observed before calling this function;
 * it accepts no executable adapters and cannot initialize, save or mutate them.
 */
export function dryRunGooglePhotosRecovery(input: RecoveryPreflightInput): RecoveryPreflightReport {
  return preflightGooglePhotosRecovery(input);
}
