import { readDriveFileMetadata, readDriveTextFile } from "../google-drive";
import {
  buildGooglePhotosExportReview,
  createSanitizedGooglePhotosExportError,
  type GooglePhotosExportReview,
  type SanitizedGooglePhotosExportError,
} from "./contract";
import {
  prepareGooglePhotosExportSourceWithAdapter,
  type GooglePhotosExportSourceAdapter,
  type GooglePhotosExportSourceResult,
} from "./drive-source";

const defaultAdapter: GooglePhotosExportSourceAdapter = {
  readMetadata: readDriveFileMetadata,
  readText: readDriveTextFile,
};

export type PrepareGooglePhotosExportReviewResult =
  | { ok: true; review: GooglePhotosExportReview }
  | { ok: false; error: SanitizedGooglePhotosExportError };

export type InternalGooglePhotosExportPreparationResult =
  | Extract<GooglePhotosExportSourceResult, { ok: true }>
  | Extract<PrepareGooglePhotosExportReviewResult, { ok: false }>;

export async function prepareGooglePhotosExportReviewInDrive(input: {
  accessToken: string;
  selectedProjectId: string;
  workspaceId: string;
  projectsRootFolderId: string;
  project: Parameters<
    typeof prepareGooglePhotosExportSourceWithAdapter
  >[0]["project"];
  now?: Date;
  signal: AbortSignal;
}): Promise<InternalGooglePhotosExportPreparationResult> {
  return prepareGooglePhotosExportReviewWithAdapter(input, defaultAdapter);
}

export async function prepareGooglePhotosExportReviewWithAdapter(
  input: {
    accessToken: string;
    selectedProjectId: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: Parameters<
      typeof prepareGooglePhotosExportSourceWithAdapter
    >[0]["project"];
    now?: Date;
    signal: AbortSignal;
  },
  adapter: GooglePhotosExportSourceAdapter,
): Promise<InternalGooglePhotosExportPreparationResult> {
  const result = await prepareGooglePhotosExportSourceWithAdapter(
    input,
    adapter,
  );
  if (!result.ok) {
    return result;
  }
  return result;
}

export function toGooglePhotosExportReviewResult(
  result: InternalGooglePhotosExportPreparationResult,
): PrepareGooglePhotosExportReviewResult {
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    review: buildGooglePhotosExportReview(result.plan),
  };
}

export function createGooglePhotosExportAuthorizationError(
  kind: "authorizationRequired" | "authorizationDenied" | "aborted",
): PrepareGooglePhotosExportReviewResult {
  return {
    ok: false,
    error: createSanitizedGooglePhotosExportError(kind),
  };
}
