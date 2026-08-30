import {
  createDriveJsonFileWithAppProperties,
  escapeDriveReadOnlyQueryValue,
  listDriveFilesReadOnlyPage,
  readDriveTextFile,
  updateDriveJsonFileContent,
  type DriveFileCandidate,
} from "../google-drive";
import { DRIVE_PREFLIGHT_APP_ID } from "../drive-preflight-diagnostics";
import {
  buildEmptyGooglePhotosSyncBinding,
  GOOGLE_PHOTOS_SYNC_BINDING_FILE_NAME,
  GOOGLE_PHOTOS_SYNC_BINDING_ROLE,
  GOOGLE_PHOTOS_SYNC_BINDING_SCHEMA_VERSION_PROPERTY,
  parseGooglePhotosSyncBindingJson,
  stringifyGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
  type GooglePhotosSyncBindingValidationFailureReason,
} from "./sync-binding";

const JSON_MIME_TYPE = "application/json";
const BINDING_SEARCH_LIMIT = 2;
const BINDING_JSON_SIZE_LIMIT_BYTES = 64 * 1024;
const BINDING_FILE_FIELDS =
  "id,name,mimeType,trashed,parents,appProperties,size";

export type DrivePhotosSyncBindingAdapter = {
  listCandidates: (input: {
    accessToken: string;
    query: string;
    signal: AbortSignal;
  }) => Promise<{ files: DriveFileCandidate[]; hasMore: boolean }>;
  readText: (
    accessToken: string,
    fileId: string,
    signal: AbortSignal,
  ) => Promise<string>;
  createJson: (input: {
    accessToken: string;
    name: string;
    parentId: string;
    appProperties: Record<string, string>;
    canonicalJsonText: string;
    signal: AbortSignal;
  }) => Promise<void>;
  updateJson: (input: {
    accessToken: string;
    fileId: string;
    jsonText: string;
    signal: AbortSignal;
  }) => Promise<void>;
};

export type ReadDrivePhotosSyncBindingResult =
  | { status: "unbound" }
  | {
      status: "ready";
      fileId: string;
      binding: GooglePhotosSyncBinding;
    }
  | { status: "duplicate" }
  | {
      status: "invalid";
      reason: "metadata" | GooglePhotosSyncBindingValidationFailureReason;
    }
  | { status: "inaccessible" };

export type CreateDrivePhotosSyncBindingResult =
  | {
      status: "created";
      fileId: string;
      binding: GooglePhotosSyncBinding;
    }
  | { status: "alreadyExists" }
  | { status: "validationFailed" }
  | { status: "writeFailed" };

export type UpdateDrivePhotosSyncBindingResult =
  | {
      status: "updated";
      fileId: string;
      binding: GooglePhotosSyncBinding;
    }
  | { status: "staleGeneration" }
  | { status: "invalid" }
  | { status: "writeFailed" };

const defaultAdapter: DrivePhotosSyncBindingAdapter = {
  async listCandidates(input) {
    const page = await listDriveFilesReadOnlyPage({
      accessToken: input.accessToken,
      query: input.query,
      pageSize: BINDING_SEARCH_LIMIT,
      fields: BINDING_FILE_FIELDS,
      signal: input.signal,
    });
    return {
      files: page.files,
      hasMore: page.nextPageToken !== null,
    };
  },
  readText: readDriveTextFile,
  createJson: createDriveJsonFileWithAppProperties,
  updateJson: updateDriveJsonFileContent,
};

export function buildDrivePhotosSyncBindingAppProperties(input: {
  workspaceId: string;
  projectId: string;
}) {
  return {
    app: DRIVE_PREFLIGHT_APP_ID,
    role: GOOGLE_PHOTOS_SYNC_BINDING_ROLE,
    schemaVersion: GOOGLE_PHOTOS_SYNC_BINDING_SCHEMA_VERSION_PROPERTY,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  };
}

export function buildDrivePhotosSyncBindingQuery(input: {
  projectRootFolderId: string;
  workspaceId: string;
  projectId: string;
}) {
  return [
    `'${escapeDriveReadOnlyQueryValue(input.projectRootFolderId)}' in parents`,
    "trashed = false",
    `appProperties has { key='app' and value='${DRIVE_PREFLIGHT_APP_ID}' }`,
    `appProperties has { key='role' and value='${GOOGLE_PHOTOS_SYNC_BINDING_ROLE}' }`,
    `appProperties has { key='schemaVersion' and value='${GOOGLE_PHOTOS_SYNC_BINDING_SCHEMA_VERSION_PROPERTY}' }`,
    `appProperties has { key='workspaceId' and value='${escapeDriveReadOnlyQueryValue(input.workspaceId)}' }`,
    `appProperties has { key='projectId' and value='${escapeDriveReadOnlyQueryValue(input.projectId)}' }`,
  ].join(" and ");
}

export async function readDrivePhotosSyncBinding(
  input: {
    accessToken: string;
    projectRootFolderId: string;
    workspaceId: string;
    projectId: string;
    signal: AbortSignal;
  },
  adapter: DrivePhotosSyncBindingAdapter = defaultAdapter,
): Promise<ReadDrivePhotosSyncBindingResult> {
  if (!ownershipInputIsValid(input)) {
    return { status: "invalid", reason: "metadata" };
  }
  try {
    const result = await adapter.listCandidates({
      accessToken: input.accessToken,
      query: buildDrivePhotosSyncBindingQuery(input),
      signal: input.signal,
    });
    if (result.hasMore || result.files.length >= BINDING_SEARCH_LIMIT) {
      return { status: "duplicate" };
    }
    const file = result.files[0];
    if (!file) return { status: "unbound" };
    if (!metadataMatches(file, input)) {
      return { status: "invalid", reason: "metadata" };
    }
    const text = await adapter.readText(
      input.accessToken,
      file.id,
      input.signal,
    );
    const parsed = parseGooglePhotosSyncBindingJson(text, input);
    if (!parsed.ok) {
      return { status: "invalid", reason: parsed.reason };
    }
    return { status: "ready", fileId: file.id, binding: parsed.value };
  } catch {
    return { status: "inaccessible" };
  }
}

export async function createDrivePhotosSyncBinding(
  input: {
    accessToken: string;
    projectRootFolderId: string;
    workspaceId: string;
    projectId: string;
    binding: GooglePhotosSyncBinding;
    signal: AbortSignal;
  },
  adapter: DrivePhotosSyncBindingAdapter = defaultAdapter,
): Promise<CreateDrivePhotosSyncBindingResult> {
  const parsed = parseBindingForWrite(input.binding, input);
  if (!parsed) return { status: "validationFailed" };

  try {
    const initial = await readDrivePhotosSyncBinding(input, adapter);
    const initialBlock = classifyCreatePreflight(initial);
    if (initialBlock) return initialBlock;

    const immediate = await readDrivePhotosSyncBinding(input, adapter);
    const immediateBlock = classifyCreatePreflight(immediate);
    if (immediateBlock) return immediateBlock;

    await adapter.createJson({
      accessToken: input.accessToken,
      name: GOOGLE_PHOTOS_SYNC_BINDING_FILE_NAME,
      parentId: input.projectRootFolderId,
      appProperties: buildDrivePhotosSyncBindingAppProperties(input),
      canonicalJsonText: stringifyGooglePhotosSyncBinding(parsed),
      signal: input.signal,
    });

    const verified = await readDrivePhotosSyncBinding(input, adapter);
    if (
      verified.status !== "ready" ||
      !bindingsEqual(verified.binding, parsed)
    ) {
      return { status: "validationFailed" };
    }
    return {
      status: "created",
      fileId: verified.fileId,
      binding: verified.binding,
    };
  } catch {
    return { status: "writeFailed" };
  }
}

export async function updateDrivePhotosSyncBindingBestEffort(
  input: {
    accessToken: string;
    projectRootFolderId: string;
    workspaceId: string;
    projectId: string;
    expectedStableGeneration: number;
    binding: GooglePhotosSyncBinding;
    signal: AbortSignal;
  },
  adapter: DrivePhotosSyncBindingAdapter = defaultAdapter,
): Promise<UpdateDrivePhotosSyncBindingResult> {
  if (
    !Number.isSafeInteger(input.expectedStableGeneration) ||
    input.expectedStableGeneration < 0
  ) {
    return { status: "invalid" };
  }
  const parsed = parseBindingForWrite(input.binding, input);
  if (!parsed) return { status: "invalid" };

  try {
    const current = await readDrivePhotosSyncBinding(input, adapter);
    if (current.status === "inaccessible") return { status: "writeFailed" };
    if (current.status !== "ready") return { status: "invalid" };
    const currentGeneration = current.binding.stable?.generation ?? 0;
    if (currentGeneration !== input.expectedStableGeneration) {
      return { status: "staleGeneration" };
    }

    await adapter.updateJson({
      accessToken: input.accessToken,
      fileId: current.fileId,
      jsonText: stringifyGooglePhotosSyncBinding(parsed),
      signal: input.signal,
    });

    const verified = await readDrivePhotosSyncBinding(input, adapter);
    if (verified.status === "inaccessible") {
      return { status: "writeFailed" };
    }
    if (
      verified.status !== "ready" ||
      verified.fileId !== current.fileId ||
      !bindingsEqual(verified.binding, parsed)
    ) {
      return { status: "invalid" };
    }
    return {
      status: "updated",
      fileId: verified.fileId,
      binding: verified.binding,
    };
  } catch {
    return { status: "writeFailed" };
  }
}

function metadataMatches(
  file: DriveFileCandidate,
  expected: {
    projectRootFolderId: string;
    workspaceId: string;
    projectId: string;
  },
) {
  const properties = buildDrivePhotosSyncBindingAppProperties(expected);
  return (
    file.name === GOOGLE_PHOTOS_SYNC_BINDING_FILE_NAME &&
    file.mimeType === JSON_MIME_TYPE &&
    file.trashed !== true &&
    file.parents?.length === 1 &&
    file.parents[0] === expected.projectRootFolderId &&
    Object.entries(properties).every(
      ([key, value]) => file.appProperties[key] === value,
    ) &&
    typeof file.sizeBytes === "number" &&
    file.sizeBytes > 0 &&
    file.sizeBytes <= BINDING_JSON_SIZE_LIMIT_BYTES
  );
}

function parseBindingForWrite(
  binding: GooglePhotosSyncBinding,
  expected: { workspaceId: string; projectId: string },
) {
  const parsed = parseGooglePhotosSyncBindingJson(
    JSON.stringify(binding),
    expected,
  );
  if (!parsed.ok) return null;
  const text = stringifyGooglePhotosSyncBinding(parsed.value);
  return new TextEncoder().encode(text).byteLength <=
    BINDING_JSON_SIZE_LIMIT_BYTES
    ? parsed.value
    : null;
}

function ownershipInputIsValid(input: {
  projectRootFolderId: string;
  workspaceId: string;
  projectId: string;
}) {
  if (
    input.projectRootFolderId.length === 0 ||
    input.projectRootFolderId !== input.projectRootFolderId.trim()
  ) {
    return false;
  }
  try {
    buildEmptyGooglePhotosSyncBinding(input);
    return true;
  } catch {
    return false;
  }
}

function classifyCreatePreflight(
  result: ReadDrivePhotosSyncBindingResult,
):
  | Extract<
      CreateDrivePhotosSyncBindingResult,
      { status: "alreadyExists" | "validationFailed" | "writeFailed" }
    >
  | null {
  if (result.status === "unbound") return null;
  if (result.status === "ready" || result.status === "duplicate") {
    return { status: "alreadyExists" };
  }
  if (result.status === "invalid") return { status: "validationFailed" };
  return { status: "writeFailed" };
}

function bindingsEqual(
  left: GooglePhotosSyncBinding,
  right: GooglePhotosSyncBinding,
) {
  return (
    stringifyGooglePhotosSyncBinding(left) ===
    stringifyGooglePhotosSyncBinding(right)
  );
}
