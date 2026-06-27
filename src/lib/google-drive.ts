const DRIVE_API_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_API_UPLOAD_FILES_URL =
  "https://www.googleapis.com/upload/drive/v3/files";

const DRIVE_WORKSPACE_APP_ID = "ipad-slideshow-pwa";
const DRIVE_WORKSPACE_SCHEMA_VERSION = 1;
const DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY = "1";

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const JSON_MIME_TYPE = "application/json";

const WORKSPACE_ROOT_NAME = "iPad Slideshow PWA Workspace";
const WORKSPACE_JSON_NAME = "workspace.json";
const INDEX_JSON_NAME = "index.json";
const PROJECTS_ROOT_NAME = "projects";
const PROJECT_MANIFEST_NAME = "manifest.json";
const PROJECT_ASSETS_ROOT_NAME = "assets";

const CHILD_ROLE_SEARCH_LIMIT = 2;
const JSON_FILE_SIZE_LIMIT_BYTES = 64 * 1024;
export const DRIVE_PROJECT_TITLE_MAX_LENGTH = 40;
const DRIVE_PROJECT_MAX_SLIDE_COUNT = 50;
export const DRIVE_PROJECT_SLIDE_CAPTION_MAX_LENGTH = 80;
const DRIVE_PROJECT_ASSET_PREVIEW_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
const DRIVE_PROJECT_DEFAULT_SLIDE_DURATION_SECONDS = 10;
const DRIVE_PROJECT_UNUSED_ASSET_SCAN_LIMIT = 500;
const DRIVE_PROJECT_UNUSED_ASSET_DELETE_PREFLIGHT_LIMIT = 50;

const CREATE_FOLDER_FIELDS =
  "id,name,mimeType,createdTime,modifiedTime,appProperties";
const CREATE_JSON_FIELDS =
  "id,name,mimeType,createdTime,modifiedTime,appProperties,size";
const DRIVE_ASSET_FILE_FIELDS =
  "id,name,mimeType,createdTime,modifiedTime,appProperties,size,parents";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_8601_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const WORKSPACE_ROOT_QUERY = [
  `mimeType = '${DRIVE_FOLDER_MIME_TYPE}'`,
  "trashed = false",
  `appProperties has { key='app' and value='${DRIVE_WORKSPACE_APP_ID}' }`,
  "appProperties has { key='role' and value='workspaceRoot' }",
].join(" and ");

export type DriveWorkspaceChildRole = "workspace" | "index" | "projectsRoot";

export type DriveCreatedWorkspaceItemRole =
  | "workspaceRoot"
  | "workspace"
  | "index"
  | "projectsRoot";

export type DriveWorkspaceCreateFailureStatus =
  | "authRequired"
  | "operationFailed";

export type DriveFileCandidate = {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  appProperties: Record<string, string>;
  sizeBytes?: number;
  parents?: string[];
  trashed?: boolean;
};

export type DriveWorkspaceCandidate = DriveFileCandidate;

export type DriveWorkspaceRootCandidate = DriveWorkspaceCandidate;

export type DriveChildCandidatesByRole = Record<
  DriveWorkspaceChildRole,
  DriveWorkspaceCandidate[]
>;

export type DriveWorkspaceCreateResult = {
  workspaceId: string;
};

export type DriveWorkspaceCreateInput = {
  accessToken: string;
  runStep: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
};

export type DriveWorkspaceReadyContext = {
  workspaceId: string;
  workspaceRootFolderId: string;
  workspaceJsonFileId: string;
  indexJsonFileId: string;
  projectsRootFolderId: string;
  indexJsonText: string;
};

export type DriveProjectSummary = {
  projectId: string;
  title: string;
  projectFolderId: string;
  manifestFileId: string;
  assetsFolderId: string;
  manifestPath: string;
  createdAt: string;
  updatedAt: string;
};

export type DriveAssetType = "image" | "video";

export type DriveAssetUnsupportedReason =
  | "videoPlaybackNotImplemented"
  | "unsupportedVideoMimeType"
  | "unsupportedMimeType";

export type DriveAssetMimeType = "image/jpeg" | "image/png" | "image/webp";

export type DriveSlideSummary = {
  slideId: string;
  assetId: string;
  assetFileId: string;
  assetName: string;
  type?: DriveAssetType;
  mimeType: string;
  source: "googlePhotosPicker";
  sourceMimeType: string;
  sourceMediaItemId: string;
  sourceCreateTime?: string;
  fileSize?: number;
  durationMs?: number;
  unsupportedReason?: DriveAssetUnsupportedReason;
  durationSeconds: number;
  caption: string;
  createdAt: string;
  updatedAt: string;
};

export type DriveProjectReadyDetails = {
  project: DriveProjectSummary;
  slides: DriveSlideSummary[];
  slideCount: number;
  assetCount: number;
};

export type DriveProjectChangedItemRole =
  | "projectRoot"
  | "projectManifest"
  | "assetsRoot"
  | "index";

export type DriveProjectChangedItem = {
  role: DriveProjectChangedItemRole;
  id: string;
  name: string;
};

export type DriveProjectCreateFailureStatus =
  | "authRequired"
  | "notCreatable"
  | "invalidWorkspace"
  | "operationFailed";

export type DriveProjectCreateInput = {
  accessToken: string;
  readyContext: DriveWorkspaceReadyContext;
  title: string;
  runStep: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
};

export type DriveProjectCreateResult = {
  project: DriveProjectSummary;
  details: DriveProjectReadyDetails;
  indexJsonText: string;
  diagnostics: string[];
};

export type DriveProjectAssetSaveFailureStatus =
  | "authRequired"
  | "invalidProject"
  | "uploadFailed"
  | "verificationFailed";

export type DriveProjectAssetSaveInput = {
  accessToken: string;
  workspaceId: string;
  project: DriveProjectSummary;
  blob: Blob;
  mimeType: DriveAssetMimeType;
  sizeBytes: number;
  signal: AbortSignal;
};

export type DriveProjectSavedAsset = {
  assetId: string;
  assetIdPart: string;
  assetFileId: string;
  assetFileIdPart: string;
  driveFilename: string;
  driveMimeType: DriveAssetMimeType;
  driveSizeBytes: number;
  diagnostics: string[];
};

export type DriveProjectManifestAppendFailureStatus =
  | "authRequired"
  | "invalidProject"
  | "manifestUpdateFailed"
  | "indexUpdateFailed"
  | "verificationFailed";

export type DriveProjectManifestAppendInput = {
  accessToken: string;
  workspaceId: string;
  indexJsonFileId: string;
  project: DriveProjectSummary;
  savedAsset: DriveProjectSavedAsset;
  source: {
    filename: string | null;
    sourceMimeType: string;
    sourceMediaItemId: string;
    sourceCreateTime: string | null;
  };
  signal: AbortSignal;
};

export type DriveProjectManifestAppendResult = {
  project: DriveProjectSummary;
  details: DriveProjectReadyDetails;
  manifestJsonText: string;
  indexJsonText: string;
  diagnostics: string[];
};

export type DriveProjectManifestBatchAppendInput = {
  accessToken: string;
  workspaceId: string;
  indexJsonFileId: string;
  project: DriveProjectSummary;
  savedAssets: Array<{
    savedAsset: DriveProjectSavedAsset;
    source: DriveProjectManifestAppendInput["source"];
  }>;
  signal: AbortSignal;
};

export type DriveProjectManifestBatchAppendResult =
  DriveProjectManifestAppendResult & {
    addedSlides: DriveSlideSummary[];
  };

export type DriveProjectTitleUpdateFailureStatus =
  | "authRequired"
  | "invalidProject"
  | "manifestUpdateFailed"
  | "indexUpdateFailed"
  | "verificationFailed";

export type DriveProjectSlideCaptionUpdateFailureStatus =
  | "authRequired"
  | "invalidProject"
  | "manifestUpdateFailed"
  | "indexUpdateFailed"
  | "verificationFailed";

export type DriveProjectSlideReorderFailureStatus =
  | "authRequired"
  | "invalidProject"
  | "manifestUpdateFailed"
  | "indexUpdateFailed"
  | "verificationFailed";

export type DriveProjectSlideDeleteFailureStatus =
  | "authRequired"
  | "invalidProject"
  | "manifestUpdateFailed"
  | "indexUpdateFailed"
  | "verificationFailed";

export type DriveProjectSlideDuplicateFailureStatus =
  | "authRequired"
  | "invalidProject"
  | "manifestUpdateFailed"
  | "indexUpdateFailed"
  | "verificationFailed";

export type DriveProjectUnusedAssetPreviewFailureStatus =
  | "authRequired"
  | "invalidProject"
  | "operationFailed"
  | "scanLimitExceeded";

export type DriveProjectSlideCaptionUpdateInput = {
  accessToken: string;
  workspaceId: string;
  indexJsonFileId: string;
  project: DriveProjectSummary;
  slideId: string;
  caption: string;
  runStep: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
};

export type DriveProjectSlideCaptionUpdateResult = {
  project: DriveProjectSummary;
  details: DriveProjectReadyDetails;
  manifestJsonText: string;
  indexJsonText: string;
  caption: string;
  diagnostics: string[];
};

export type DriveProjectSlideReorderInput = {
  accessToken: string;
  workspaceId: string;
  indexJsonFileId: string;
  project: DriveProjectSummary;
  orderedSlideIds: string[];
  runStep: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
};

export type DriveProjectSlideReorderResult = {
  project: DriveProjectSummary;
  details: DriveProjectReadyDetails;
  manifestJsonText: string;
  indexJsonText: string;
  orderedSlideIds: string[];
  diagnostics: string[];
};

export type DriveProjectSlideDeleteInput = {
  accessToken: string;
  workspaceId: string;
  indexJsonFileId: string;
  project: DriveProjectSummary;
  slideIds: string[];
  runStep: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
};

export type DriveProjectSlideDeleteResult = {
  project: DriveProjectSummary;
  details: DriveProjectReadyDetails;
  manifestJsonText: string;
  indexJsonText: string;
  deletedSlideIds: string[];
  diagnostics: string[];
};

export type DriveProjectSlideDuplicateInput = {
  accessToken: string;
  workspaceId: string;
  indexJsonFileId: string;
  project: DriveProjectSummary;
  slideId: string;
  runStep: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
};

export type DriveProjectSlideDuplicateResult = {
  project: DriveProjectSummary;
  details: DriveProjectReadyDetails;
  manifestJsonText: string;
  indexJsonText: string;
  sourceSlideId: string;
  duplicatedSlide: DriveSlideSummary;
  diagnostics: string[];
};

export type DriveProjectTitleUpdateInput = {
  accessToken: string;
  workspaceId: string;
  indexJsonFileId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  title: string;
  runStep: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
};

export type DriveProjectTitleUpdateResult = {
  project: DriveProjectSummary;
  details: DriveProjectReadyDetails;
  manifestJsonText: string;
  indexJsonText: string;
  diagnostics: string[];
};

export type DriveProjectUnusedAssetSummary = {
  assetFileId: string;
  assetFileIdPart: string;
  assetId: string | null;
  assetIdPart: string;
  assetName: string;
  mimeType: string;
  sizeBytes: number | null;
  createdTime: string | null;
  modifiedTime: string | null;
  referenceSlideCount: number;
};

export type DriveProjectUnusedAssetPreviewResult = {
  project: DriveProjectSummary;
  scannedAssetCount: number;
  referencedAssetFileCount: number;
  unusedAssetCount: number;
  unusedAssets: DriveProjectUnusedAssetSummary[];
  ignoredFileCount: number;
  diagnostics: string[];
};

export type DriveProjectUnusedAssetDeletePreflightStatus =
  | "eligible"
  | "blocked";

export type DriveProjectUnusedAssetDeletePreflightBlockedReason =
  | "notFound"
  | "metadataMismatch"
  | "notAppManagedAsset"
  | "wrongProject"
  | "wrongParent"
  | "unsupportedMimeType"
  | "stillReferenced"
  | "trashed"
  | "missingRequiredMetadata";

export type DriveProjectUnusedAssetDeletePreflightAsset = {
  assetFileId: string;
  assetFileIdPart: string;
  assetId: string | null;
  assetIdPart: string;
  assetName: string;
  mimeType: DriveAssetMimeType | string | null;
  sizeBytes: number | null;
  createdTime: string | null;
  modifiedTime: string | null;
  referenceSlideCount: number;
  status: DriveProjectUnusedAssetDeletePreflightStatus;
  blockedReasons: DriveProjectUnusedAssetDeletePreflightBlockedReason[];
};

export type DriveProjectUnusedAssetDeletePreflightResult = {
  checkedAssetCount: number;
  eligibleAssetCount: number;
  blockedAssetCount: number;
  selectedAssetFileIds: string[];
  eligibleAssets: DriveProjectUnusedAssetDeletePreflightAsset[];
  blockedAssets: DriveProjectUnusedAssetDeletePreflightAsset[];
  allAssets: DriveProjectUnusedAssetDeletePreflightAsset[];
  freshManifestSlideCount: number;
  eligibleTotalSizeBytes: number;
  diagnostics: string[];
};

type DriveProjectManifestBody = {
  app: typeof DRIVE_WORKSPACE_APP_ID;
  role: "projectManifest";
  schemaVersion: typeof DRIVE_WORKSPACE_SCHEMA_VERSION;
  workspaceId: string;
  projectId: string;
  title: string;
  slides: DriveSlideSummary[];
  createdAt: string;
  updatedAt: string;
};

type DriveProjectManifestParseResult =
  | {
      status: "valid";
      manifest: DriveProjectManifestBody;
      details: DriveProjectReadyDetails;
      diagnostics: string[];
    }
  | {
      status: "invalid";
      diagnostics: string[];
    };

type DriveIndexJsonProjectUpdateResult =
  | {
      status: "valid";
      indexJsonText: string;
      diagnostics: string[];
    }
  | {
      status: "invalid";
      diagnostics: string[];
    };

type ProjectCreatableIndexJsonParseResult =
  | {
      status: "creatable";
      index: {
        createdAt: string;
        projects: DriveProjectSummary[];
      };
      diagnostics: string[];
    }
  | {
      status: "notCreatable" | "invalidWorkspace";
      diagnostics: string[];
    };

type DriveCreatedProjectRegistrationValidationResult =
  | {
      status: "valid";
      project: DriveProjectSummary;
      diagnostics: string[];
    }
  | {
      status: "invalid";
      diagnostics: string[];
    };

type DriveProjectItemValidationResult =
  | {
      status: "ready";
      project: DriveProjectSummary;
      diagnostics: string[];
    }
  | {
      status: "invalid";
      diagnostics: string[];
    };

export type DriveProjectIndexValidationResult =
  | {
      status: "notCreated";
      diagnostics: string[];
    }
  | {
      status: "ready";
      projects: DriveProjectSummary[];
      diagnostics: string[];
    }
  | {
      status: "invalid";
      diagnostics: string[];
    };

export type DriveMetadataValidationResult =
  | {
      status: "metadataVerified";
      diagnostics: string[];
      workspaceId: string;
      workspaceRootFolderId: string;
      workspaceJsonFileId: string;
      indexJsonFileId: string;
      projectsRootFolderId: string;
    }
  | {
      status: "invalidWorkspace";
      diagnostics: string[];
    };

export type DriveProjectDetailsValidationResult =
  | {
      status: "ready";
      details: DriveProjectReadyDetails;
      diagnostics: string[];
    }
  | {
      status: "invalid";
      diagnostics: string[];
    };

export type DriveJsonBodyValidationResult =
  | {
      status: "ready";
      diagnostics: string[];
    }
  | {
      status: "invalidWorkspace";
      diagnostics: string[];
    }
  | {
      status: "unsupportedVersion";
      diagnostics: string[];
    };

type DriveFilesListResponse = {
  files?: unknown[];
  nextPageToken?: unknown;
};

type DriveCreateMetadata = {
  name: string;
  mimeType: string;
  parents?: string[];
  appProperties: Record<string, string>;
};

type JsonBodyValidationResult =
  | {
      status: "valid";
      workspaceId: string;
      diagnostics: string[];
    }
  | {
      status: "invalid";
      diagnostics: string[];
    }
  | {
      status: "unsupportedVersion";
      diagnostics: string[];
    };

type ParseJsonObjectResult =
  | {
      status: "valid";
      value: Record<string, unknown>;
    }
  | {
      status: "invalid";
      diagnostics: string[];
    };

export class DriveApiError extends Error {
  status: number;

  constructor(status: number) {
    super("Drive API request failed.");
    this.name = "DriveApiError";
    this.status = status;
  }
}

export class DriveWorkspaceCreateError extends Error {
  status: DriveWorkspaceCreateFailureStatus;
  possibleCreatedRoles: DriveCreatedWorkspaceItemRole[];

  constructor(input: {
    status: DriveWorkspaceCreateFailureStatus;
    possibleCreatedRoles: DriveCreatedWorkspaceItemRole[];
  }) {
    super("Drive workspace creation failed.");
    this.name = "DriveWorkspaceCreateError";
    this.status = input.status;
    this.possibleCreatedRoles = [...input.possibleCreatedRoles];
  }
}

export class DriveProjectCreateError extends Error {
  status: DriveProjectCreateFailureStatus;
  projectId: string | null;
  possibleChangedItems: DriveProjectChangedItem[];
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    status: DriveProjectCreateFailureStatus;
    projectId: string | null;
    possibleChangedItems: DriveProjectChangedItem[];
    diagnostics: string[];
    cause?: unknown;
  }) {
    super("Drive project creation failed.");
    this.name = "DriveProjectCreateError";
    this.status = input.status;
    this.projectId = input.projectId;
    this.possibleChangedItems = [...input.possibleChangedItems];
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

export class DriveProjectAssetSaveError extends Error {
  status: DriveProjectAssetSaveFailureStatus;
  possibleCreatedAsset: DriveProjectSavedAsset | null;
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    status: DriveProjectAssetSaveFailureStatus;
    possibleCreatedAsset: DriveProjectSavedAsset | null;
    diagnostics: string[];
    cause?: unknown;
  }) {
    super("Drive project asset save failed.");
    this.name = "DriveProjectAssetSaveError";
    this.status = input.status;
    this.possibleCreatedAsset = input.possibleCreatedAsset;
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

export class DriveProjectManifestAppendError extends Error {
  status: DriveProjectManifestAppendFailureStatus;
  savedAsset: DriveProjectSavedAsset;
  possibleChangedItems: DriveProjectChangedItem[];
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    status: DriveProjectManifestAppendFailureStatus;
    savedAsset: DriveProjectSavedAsset;
    possibleChangedItems: DriveProjectChangedItem[];
    diagnostics: string[];
    cause?: unknown;
  }) {
    super("Drive project manifest append failed.");
    this.name = "DriveProjectManifestAppendError";
    this.status = input.status;
    this.savedAsset = input.savedAsset;
    this.possibleChangedItems = [...input.possibleChangedItems];
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

export class DriveProjectManifestBatchAppendError extends Error {
  status: DriveProjectManifestAppendFailureStatus;
  savedAssets: DriveProjectSavedAsset[];
  possibleChangedItems: DriveProjectChangedItem[];
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    status: DriveProjectManifestAppendFailureStatus;
    savedAssets: DriveProjectSavedAsset[];
    possibleChangedItems: DriveProjectChangedItem[];
    diagnostics: string[];
    cause?: unknown;
  }) {
    super("Drive project manifest batch append failed.");
    this.name = "DriveProjectManifestBatchAppendError";
    this.status = input.status;
    this.savedAssets = [...input.savedAssets];
    this.possibleChangedItems = [...input.possibleChangedItems];
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

export class DriveProjectTitleUpdateError extends Error {
  status: DriveProjectTitleUpdateFailureStatus;
  possibleChangedItems: DriveProjectChangedItem[];
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    status: DriveProjectTitleUpdateFailureStatus;
    possibleChangedItems: DriveProjectChangedItem[];
    diagnostics: string[];
    cause?: unknown;
  }) {
    super("Drive project title update failed.");
    this.name = "DriveProjectTitleUpdateError";
    this.status = input.status;
    this.possibleChangedItems = [...input.possibleChangedItems];
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

export class DriveProjectSlideCaptionUpdateError extends Error {
  status: DriveProjectSlideCaptionUpdateFailureStatus;
  possibleChangedItems: DriveProjectChangedItem[];
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    status: DriveProjectSlideCaptionUpdateFailureStatus;
    possibleChangedItems: DriveProjectChangedItem[];
    diagnostics: string[];
    cause?: unknown;
  }) {
    super("Drive project slide caption update failed.");
    this.name = "DriveProjectSlideCaptionUpdateError";
    this.status = input.status;
    this.possibleChangedItems = [...input.possibleChangedItems];
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

export class DriveProjectSlideReorderError extends Error {
  status: DriveProjectSlideReorderFailureStatus;
  possibleChangedItems: DriveProjectChangedItem[];
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    status: DriveProjectSlideReorderFailureStatus;
    possibleChangedItems: DriveProjectChangedItem[];
    diagnostics: string[];
    cause?: unknown;
  }) {
    super("Drive project slide reorder failed.");
    this.name = "DriveProjectSlideReorderError";
    this.status = input.status;
    this.possibleChangedItems = [...input.possibleChangedItems];
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

export class DriveProjectSlideDeleteError extends Error {
  status: DriveProjectSlideDeleteFailureStatus;
  possibleChangedItems: DriveProjectChangedItem[];
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    status: DriveProjectSlideDeleteFailureStatus;
    possibleChangedItems: DriveProjectChangedItem[];
    diagnostics: string[];
    cause?: unknown;
  }) {
    super("Drive project slide delete failed.");
    this.name = "DriveProjectSlideDeleteError";
    this.status = input.status;
    this.possibleChangedItems = [...input.possibleChangedItems];
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

export class DriveProjectSlideDuplicateError extends Error {
  status: DriveProjectSlideDuplicateFailureStatus;
  possibleChangedItems: DriveProjectChangedItem[];
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    status: DriveProjectSlideDuplicateFailureStatus;
    possibleChangedItems: DriveProjectChangedItem[];
    diagnostics: string[];
    cause?: unknown;
  }) {
    super("Drive project slide duplicate failed.");
    this.name = "DriveProjectSlideDuplicateError";
    this.status = input.status;
    this.possibleChangedItems = [...input.possibleChangedItems];
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

export class DriveProjectUnusedAssetPreviewError extends Error {
  status: DriveProjectUnusedAssetPreviewFailureStatus;
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    status: DriveProjectUnusedAssetPreviewFailureStatus;
    diagnostics: string[];
    cause?: unknown;
  }) {
    super("Drive project unused asset preview failed.");
    this.name = "DriveProjectUnusedAssetPreviewError";
    this.status = input.status;
    this.diagnostics = [...input.diagnostics];
    this.cause = input.cause;
  }
}

export class DriveProjectUnusedAssetDeletePreflightError extends Error {
  code:
    | "invalidInput"
    | "manifestUnavailable"
    | "metadataUnavailable"
    | "tooManyCandidates"
    | "operationFailed";
  diagnostics: string[];
  cause?: unknown;

  constructor(input: {
    code: DriveProjectUnusedAssetDeletePreflightError["code"];
    message: string;
    diagnostics?: string[];
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "DriveProjectUnusedAssetDeletePreflightError";
    this.code = input.code;
    this.diagnostics = [...(input.diagnostics ?? [input.message])];
    this.cause = input.cause;
  }
}

export async function findWorkspaceRootCandidates(
  accessToken: string,
  signal: AbortSignal,
): Promise<DriveWorkspaceRootCandidate[]> {
  const params = new URLSearchParams({
    corpora: "user",
    spaces: "drive",
    pageSize: "2",
    fields: "files(id,name,mimeType,createdTime,modifiedTime,appProperties)",
    q: WORKSPACE_ROOT_QUERY,
  });

  return listDriveFiles(accessToken, params, signal);
}

export async function findWorkspaceChildCandidatesByRole(
  accessToken: string,
  rootFolderId: string,
  role: DriveWorkspaceChildRole,
  signal: AbortSignal,
): Promise<DriveWorkspaceCandidate[]> {
  const params = new URLSearchParams({
    corpora: "user",
    spaces: "drive",
    pageSize: String(CHILD_ROLE_SEARCH_LIMIT),
    fields: "files(id,name,mimeType,createdTime,modifiedTime,appProperties,size)",
    q: buildWorkspaceChildQuery(rootFolderId, role),
  });

  return listDriveFiles(accessToken, params, signal);
}

export async function readDriveTextFile(
  accessToken: string,
  fileId: string,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({
    alt: "media",
  });

  const response = await fetch(
    `${DRIVE_API_FILES_URL}/${encodeURIComponent(fileId)}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    },
  );

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  return response.text();
}

export async function previewDriveProjectUnusedAssets(input: {
  accessToken: string;
  workspaceId: string;
  project: DriveProjectSummary;
  runStep: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
}): Promise<DriveProjectUnusedAssetPreviewResult> {
  const inputDiagnostics = validateDriveProjectUnusedAssetPreviewInput(input);

  if (inputDiagnostics.length > 0) {
    throw new DriveProjectUnusedAssetPreviewError({
      status: input.accessToken ? "invalidProject" : "authRequired",
      diagnostics: inputDiagnostics,
    });
  }

  try {
    const manifestResult = await input.runStep(async (signal) => {
      const manifestJsonText = await readDriveTextFile(
        input.accessToken,
        input.project.manifestFileId,
        signal,
      );

      return parseDriveProjectManifestJson({
        manifestJsonText,
        expectedWorkspaceId: input.workspaceId,
        project: input.project,
      });
    });

    if (manifestResult.status === "invalid") {
      throw new DriveProjectUnusedAssetPreviewError({
        status: "invalidProject",
        diagnostics: manifestResult.diagnostics,
      });
    }

    const assetFiles = await input.runStep((signal) =>
      listDriveProjectAssetFolderChildren({
        accessToken: input.accessToken,
        assetsFolderId: input.project.assetsFolderId,
        scanLimit: DRIVE_PROJECT_UNUSED_ASSET_SCAN_LIMIT,
        signal,
      }),
    );
    const referencedAssetFileCounts = new Map<string, number>();

    for (const slide of manifestResult.manifest.slides) {
      referencedAssetFileCounts.set(
        slide.assetFileId,
        (referencedAssetFileCounts.get(slide.assetFileId) ?? 0) + 1,
      );
    }

    const appManagedAssetFiles = assetFiles.filter((file) =>
      isPreviewableAppManagedAssetFile({
        file,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
      }),
    );
    const ignoredFileCount = assetFiles.length - appManagedAssetFiles.length;
    const unusedAssets = appManagedAssetFiles
      .filter((file) => !referencedAssetFileCounts.has(file.id))
      .map(toDriveProjectUnusedAssetSummary)
      .sort(compareDriveProjectUnusedAssetSummaries);
    const diagnostics = [
      ...manifestResult.diagnostics,
      `Drive assets/ のmetadataを ${assetFiles.length} 件確認しました。`,
      `アプリ管理asset fileを ${appManagedAssetFiles.length} 件確認しました。`,
    ];

    if (ignoredFileCount > 0) {
      diagnostics.push(
        "アプリ管理assetと確認できないfileはcleanup preview対象外です。",
      );
    }

    diagnostics.push("Drive file は削除していません。");

    return {
      project: input.project,
      scannedAssetCount: appManagedAssetFiles.length,
      referencedAssetFileCount: referencedAssetFileCounts.size,
      unusedAssetCount: unusedAssets.length,
      unusedAssets,
      ignoredFileCount,
      diagnostics,
    };
  } catch (error) {
    if (error instanceof DriveProjectUnusedAssetPreviewError) {
      throw error;
    }

    throw new DriveProjectUnusedAssetPreviewError({
      status:
        error instanceof DriveApiError && [401, 403].includes(error.status)
          ? "authRequired"
          : "operationFailed",
      diagnostics: buildDriveProjectUnusedAssetPreviewFailureDiagnostics(error),
      cause: error,
    });
  }
}

export async function preflightDriveProjectUnusedAssetDeletion(input: {
  accessToken: string;
  workspaceId: string;
  project: DriveProjectSummary;
  assetFileIds: string[];
  runStep?: <T>(
    label: string,
    operation: (signal: AbortSignal) => Promise<T>,
  ) => Promise<T>;
}): Promise<DriveProjectUnusedAssetDeletePreflightResult> {
  const inputDiagnostics = validateDriveProjectUnusedAssetDeletePreflightInput(
    input,
  );

  if (inputDiagnostics.length > 0) {
    throw new DriveProjectUnusedAssetDeletePreflightError({
      code: input.assetFileIds.length > DRIVE_PROJECT_UNUSED_ASSET_DELETE_PREFLIGHT_LIMIT
        ? "tooManyCandidates"
        : "invalidInput",
      message: "未使用asset削除前preflightの入力が不正です。",
      diagnostics: inputDiagnostics,
    });
  }

  const runStep =
    input.runStep ??
    (<T,>(
      _label: string,
      operation: (signal: AbortSignal) => Promise<T>,
    ) => operation(new AbortController().signal));
  const dedupedAssetFileIds = Array.from(new Set(input.assetFileIds));
  const dedupedCount = input.assetFileIds.length - dedupedAssetFileIds.length;

  try {
    const manifestResult = await runStep("fresh manifest", async (signal) => {
      const manifestJsonText = await readDriveTextFile(
        input.accessToken,
        input.project.manifestFileId,
        signal,
      );

      return parseDriveProjectManifestJson({
        manifestJsonText,
        expectedWorkspaceId: input.workspaceId,
        project: input.project,
      });
    });

    if (manifestResult.status === "invalid") {
      throw new DriveProjectUnusedAssetDeletePreflightError({
        code: "manifestUnavailable",
        message: "fresh manifest の検証に失敗しました。",
        diagnostics: manifestResult.diagnostics,
      });
    }

    const referenceCounts = new Map<string, number>();

    for (const slide of manifestResult.manifest.slides) {
      referenceCounts.set(
        slide.assetFileId,
        (referenceCounts.get(slide.assetFileId) ?? 0) + 1,
      );
    }

    const metadataResults = await runStep("fresh metadata", (signal) =>
      Promise.all(
        dedupedAssetFileIds.map(async (assetFileId) => {
          try {
            return {
              assetFileId,
              file: await fetchDriveFileMetadataForDeletePreflight(
                input.accessToken,
                assetFileId,
                signal,
              ),
              error: null,
            };
          } catch (error) {
            return {
              assetFileId,
              file: null,
              error,
            };
          }
        }),
      ),
    );

    const allAssets = metadataResults.map((result) =>
      toDriveProjectUnusedAssetDeletePreflightAsset({
        assetFileId: result.assetFileId,
        file: result.file,
        error: result.error,
        workspaceId: input.workspaceId,
        project: input.project,
        referenceSlideCount: referenceCounts.get(result.assetFileId) ?? 0,
      }),
    );
    const eligibleAssets = allAssets.filter((asset) => asset.status === "eligible");
    const blockedAssets = allAssets.filter((asset) => asset.status === "blocked");
    const eligibleTotalSizeBytes = eligibleAssets.reduce(
      (total, asset) => total + (asset.sizeBytes ?? 0),
      0,
    );
    const diagnostics = [
      `削除前preflight: ${allAssets.length}件を確認しました。`,
      `fresh manifest: ${manifestResult.manifest.slides.length} slide refs を確認しました。`,
      `eligible: ${eligibleAssets.length}件 / blocked: ${blockedAssets.length}件`,
      "Drive file は削除していません。",
    ];

    if (dedupedCount > 0) {
      diagnostics.splice(
        1,
        0,
        `重複した選択 ${dedupedCount}件をpreflight対象から除外しました。`,
      );
    }

    return {
      checkedAssetCount: allAssets.length,
      eligibleAssetCount: eligibleAssets.length,
      blockedAssetCount: blockedAssets.length,
      selectedAssetFileIds: dedupedAssetFileIds,
      eligibleAssets,
      blockedAssets,
      allAssets,
      freshManifestSlideCount: manifestResult.manifest.slides.length,
      eligibleTotalSizeBytes,
      diagnostics,
    };
  } catch (error) {
    if (error instanceof DriveProjectUnusedAssetDeletePreflightError) {
      throw error;
    }

    throw new DriveProjectUnusedAssetDeletePreflightError({
      code: "operationFailed",
      message: "未使用asset削除前preflightに失敗しました。",
      diagnostics: buildDriveProjectUnusedAssetDeletePreflightFailureDiagnostics(
        error,
      ),
      cause: error,
    });
  }
}

export async function fetchDriveProjectAssetBlob(input: {
  accessToken: string;
  assetFileId: string;
  expectedMimeType: DriveAssetMimeType;
  signal: AbortSignal;
}): Promise<Blob> {
  const inputDiagnostics = validateDriveProjectAssetBlobFetchInput(input);

  if (inputDiagnostics.length > 0) {
    throw new Error(inputDiagnostics.join(" "));
  }

  const params = new URLSearchParams({
    alt: "media",
  });

  const response = await fetch(
    `${DRIVE_API_FILES_URL}/${encodeURIComponent(input.assetFileId)}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
      cache: "no-store",
      credentials: "omit",
      signal: input.signal,
    },
  );

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  const responseContentType = normalizeDriveAssetContentType(
    response.headers.get("Content-Type"),
  );

  if (responseContentType !== input.expectedMimeType) {
    throw new Error(
      "Drive asset preview response Content-Type did not match the expected MIME type.",
    );
  }

  const blob = await response.blob();

  if (blob.size <= 0) {
    throw new Error("Drive asset preview Blob was empty.");
  }

  if (blob.size > DRIVE_PROJECT_ASSET_PREVIEW_SIZE_LIMIT_BYTES) {
    throw new Error("Drive asset preview Blob exceeded the size limit.");
  }

  if (blob.type) {
    const blobContentType = normalizeDriveAssetContentType(blob.type);

    if (blobContentType !== input.expectedMimeType) {
      throw new Error("Drive asset preview Blob type did not match the expected MIME type.");
    }
  }

  return blob;
}

export async function saveDriveProjectAsset(
  input: DriveProjectAssetSaveInput,
): Promise<DriveProjectSavedAsset> {
  const assetId = crypto.randomUUID();
  const driveFilename = `${assetId}.${getDriveAssetExtension(input.mimeType)}`;
  const appProperties = buildDriveAssetAppProperties({
    workspaceId: input.workspaceId,
    projectId: input.project.projectId,
    assetId,
  });
  let possibleCreatedAsset: DriveProjectSavedAsset | null = null;

  const inputDiagnostics = validateDriveProjectAssetSaveInput({
    input,
    assetId,
  });

  if (inputDiagnostics.length > 0) {
    throw new DriveProjectAssetSaveError({
      status: "invalidProject",
      possibleCreatedAsset: null,
      diagnostics: inputDiagnostics,
    });
  }

  try {
    const uploadedFile = await createDriveProjectAssetFile({
      accessToken: input.accessToken,
      metadata: {
        name: driveFilename,
        mimeType: input.mimeType,
        parents: [input.project.assetsFolderId],
        appProperties,
      },
      blob: input.blob,
      fields: DRIVE_ASSET_FILE_FIELDS,
      signal: input.signal,
    });

    possibleCreatedAsset = toDriveProjectSavedAsset({
      file: uploadedFile,
      assetId,
      driveFilename,
      driveMimeType: input.mimeType,
      diagnostics: [
        "Drive assets/ へのupload応答を受け取りました。",
        "manifest反映: 未実行",
      ],
    });

    const verifiedFile = await fetchDriveFileMetadata(
      input.accessToken,
      uploadedFile.id,
      input.signal,
    );

    const verificationDiagnostics = validateDriveProjectAssetMetadata({
      item: verifiedFile,
      expectedAssetId: assetId,
      expectedName: driveFilename,
      expectedMimeType: input.mimeType,
      expectedParentId: input.project.assetsFolderId,
      expectedWorkspaceId: input.workspaceId,
      expectedProjectId: input.project.projectId,
      expectedSizeBytes: input.sizeBytes,
    });

    if (verificationDiagnostics.length > 0) {
      throw new DriveProjectAssetSaveError({
        status: "verificationFailed",
        possibleCreatedAsset,
        diagnostics: [
          ...verificationDiagnostics,
          "Drive asset file が作成済みの可能性があります。",
          "manifest反映は未実行です。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const savedAsset = toDriveProjectSavedAsset({
      file: verifiedFile,
      assetId,
      driveFilename,
      driveMimeType: input.mimeType,
      diagnostics: [
        "Drive assets/ へのuploadが完了しました。",
        "Drive asset metadataの再取得と検証が完了しました。",
        "manifest反映: 未実行",
      ],
    });

    if (!savedAsset) {
      throw new DriveProjectAssetSaveError({
        status: "verificationFailed",
        possibleCreatedAsset,
        diagnostics: [
          "Drive asset metadata検証後に保存結果を組み立てられませんでした。",
          "Drive asset file が作成済みの可能性があります。",
          "manifest反映は未実行です。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    return savedAsset;
  } catch (error) {
    if (error instanceof DriveProjectAssetSaveError) {
      throw error;
    }

    throw new DriveProjectAssetSaveError({
      status: toDriveProjectAssetSaveFailureStatus(error, possibleCreatedAsset),
      possibleCreatedAsset,
      diagnostics: buildDriveProjectAssetSaveFailureDiagnostics({
        error,
        possibleCreatedAsset,
      }),
      cause: error,
    });
  }
}

export async function appendDriveProjectAssetToManifest(
  input: DriveProjectManifestAppendInput,
): Promise<DriveProjectManifestAppendResult> {
  const changedItems: DriveProjectChangedItem[] = [];
  const now = new Date().toISOString();

  try {
    const inputDiagnostics = validateDriveProjectManifestAppendInput(input);

    if (inputDiagnostics.length > 0) {
      throw new DriveProjectManifestAppendError({
        status: "invalidProject",
        savedAsset: input.savedAsset,
        possibleChangedItems: changedItems,
        diagnostics: inputDiagnostics,
      });
    }

    const manifestJsonText = await readDriveTextFile(
      input.accessToken,
      input.project.manifestFileId,
      input.signal,
    );

    const manifestResult = parseDriveProjectManifestJson({
      manifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: input.project,
    });

    if (manifestResult.status === "invalid") {
      throw new DriveProjectManifestAppendError({
        status: "invalidProject",
        savedAsset: input.savedAsset,
        possibleChangedItems: changedItems,
        diagnostics: [
          ...manifestResult.diagnostics,
          "manifest.json 更新前検証に失敗したため、manifest反映は開始していません。",
          "Drive asset file は作成済みです。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    if (manifestResult.manifest.slides.length >= DRIVE_PROJECT_MAX_SLIDE_COUNT) {
      throw new DriveProjectManifestAppendError({
        status: "invalidProject",
        savedAsset: input.savedAsset,
        possibleChangedItems: changedItems,
        diagnostics: [
          `manifest.json.slides が上限の ${DRIVE_PROJECT_MAX_SLIDE_COUNT} 件に達しています。`,
          "manifest反映は開始していません。",
          "Drive asset file は作成済みです。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const nextProject: DriveProjectSummary = {
      ...input.project,
      updatedAt: now,
    };
    const slide = buildDriveProjectManifestSlide({
      savedAsset: input.savedAsset,
      source: input.source,
      now,
    });
    const nextManifestJsonText = buildProjectManifestJsonWithAppendedSlide({
      manifest: manifestResult.manifest,
      slide,
      updatedAt: now,
    });

    await updateDriveMultipartJsonFileContent({
      accessToken: input.accessToken,
      fileId: input.project.manifestFileId,
      metadata: {
        name: PROJECT_MANIFEST_NAME,
        mimeType: JSON_MIME_TYPE,
        appProperties: buildProjectAppProperties({
          role: "projectManifest",
          workspaceId: input.workspaceId,
          projectId: input.project.projectId,
        }),
      },
      expectedAppProperties: buildProjectAppProperties({
        role: "projectManifest",
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
      }),
      jsonText: nextManifestJsonText,
      fields: CREATE_JSON_FIELDS,
      signal: input.signal,
    });

    changedItems.push({
      role: "projectManifest",
      id: input.project.manifestFileId,
      name: PROJECT_MANIFEST_NAME,
    });

    const indexJsonText = await readDriveTextFile(
      input.accessToken,
      input.indexJsonFileId,
      input.signal,
    );

    const nextIndexResult = buildIndexJsonWithUpdatedProject({
      indexJsonText,
      expectedWorkspaceId: input.workspaceId,
      currentProject: input.project,
      nextProject,
      indexUpdatedAt: now,
    });

    if (nextIndexResult.status === "invalid") {
      throw new DriveProjectManifestAppendError({
        status: "indexUpdateFailed",
        savedAsset: input.savedAsset,
        possibleChangedItems: changedItems,
        diagnostics: [
          ...nextIndexResult.diagnostics,
          "manifest.json は更新済みの可能性があります。",
          "index.json updatedAt は未更新です。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    await updateDriveMultipartJsonFileContent({
      accessToken: input.accessToken,
      fileId: input.indexJsonFileId,
      metadata: {
        name: INDEX_JSON_NAME,
        mimeType: JSON_MIME_TYPE,
        appProperties: buildWorkspaceAppProperties({
          role: "index",
          workspaceId: input.workspaceId,
        }),
      },
      expectedAppProperties: buildWorkspaceAppProperties({
        role: "index",
        workspaceId: input.workspaceId,
      }),
      jsonText: nextIndexResult.indexJsonText,
      fields: CREATE_JSON_FIELDS,
      signal: input.signal,
    });

    changedItems.push({
      role: "index",
      id: input.indexJsonFileId,
      name: INDEX_JSON_NAME,
    });

    const [verifiedManifestJsonText, verifiedIndexJsonText] = await Promise.all([
      readDriveTextFile(
        input.accessToken,
        input.project.manifestFileId,
        input.signal,
      ),
      readDriveTextFile(input.accessToken, input.indexJsonFileId, input.signal),
    ]);

    const registrationResult = validateCreatedProjectRegistration({
      indexJsonText: verifiedIndexJsonText,
      expectedProject: nextProject,
    });

    if (registrationResult.status === "invalid") {
      throw new DriveProjectManifestAppendError({
        status: "verificationFailed",
        savedAsset: input.savedAsset,
        possibleChangedItems: changedItems,
        diagnostics: [
          ...registrationResult.diagnostics,
          "index.json 更新後の再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedManifestResult = parseDriveProjectManifestJson({
      manifestJsonText: verifiedManifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: registrationResult.project,
    });

    if (verifiedManifestResult.status === "invalid") {
      throw new DriveProjectManifestAppendError({
        status: "verificationFailed",
        savedAsset: input.savedAsset,
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedManifestResult.diagnostics,
          "manifest.json 更新後の再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const addedSlide = verifiedManifestResult.details.slides.find(
      (candidate) => candidate.slideId === slide.slideId,
    );

    if (
      !addedSlide ||
      addedSlide.assetId !== input.savedAsset.assetId ||
      addedSlide.assetFileId !== input.savedAsset.assetFileId ||
      addedSlide.source !== "googlePhotosPicker" ||
      addedSlide.mimeType !== input.savedAsset.driveMimeType
    ) {
      throw new DriveProjectManifestAppendError({
        status: "verificationFailed",
        savedAsset: input.savedAsset,
        possibleChangedItems: changedItems,
        diagnostics: [
          "manifest.json 更新後に今回追加したslideを確認できませんでした。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    return {
      project: registrationResult.project,
      details: verifiedManifestResult.details,
      manifestJsonText: verifiedManifestJsonText,
      indexJsonText: verifiedIndexJsonText,
      diagnostics: [
        ...manifestResult.diagnostics,
        "manifest.json にslideを1件appendしました。",
        ...nextIndexResult.diagnostics,
        "index.json の対象project.updatedAtを更新しました。",
        ...registrationResult.diagnostics,
        ...verifiedManifestResult.diagnostics,
        "manifest.json / index.json の更新後再検証が完了しました。",
      ],
    };
  } catch (error) {
    if (error instanceof DriveProjectManifestAppendError) {
      throw error;
    }

    throw new DriveProjectManifestAppendError({
      status: toDriveProjectManifestAppendFailureStatus(error, changedItems),
      savedAsset: input.savedAsset,
      possibleChangedItems: changedItems,
      diagnostics: buildDriveProjectManifestAppendFailureDiagnostics({
        error,
        changedItems,
        savedAsset: input.savedAsset,
      }),
      cause: error,
    });
  }
}

export async function appendDriveProjectAssetsToManifest(
  input: DriveProjectManifestBatchAppendInput,
): Promise<DriveProjectManifestBatchAppendResult> {
  const changedItems: DriveProjectChangedItem[] = [];
  const savedAssets = input.savedAssets.map((item) => item.savedAsset);
  const now = new Date().toISOString();

  try {
    const inputDiagnostics = validateDriveProjectManifestBatchAppendInput(input);

    if (inputDiagnostics.length > 0) {
      throw new DriveProjectManifestBatchAppendError({
        status: "invalidProject",
        savedAssets,
        possibleChangedItems: changedItems,
        diagnostics: inputDiagnostics,
      });
    }

    const manifestJsonText = await readDriveTextFile(
      input.accessToken,
      input.project.manifestFileId,
      input.signal,
    );

    const manifestResult = parseDriveProjectManifestJson({
      manifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: input.project,
    });

    if (manifestResult.status === "invalid") {
      throw new DriveProjectManifestBatchAppendError({
        status: "invalidProject",
        savedAssets,
        possibleChangedItems: changedItems,
        diagnostics: [
          ...manifestResult.diagnostics,
          "manifest.json 更新前検証に失敗したため、batch manifest反映は開始していません。",
          "Drive asset file は作成済みです。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    if (
      manifestResult.manifest.slides.length + input.savedAssets.length >
      DRIVE_PROJECT_MAX_SLIDE_COUNT
    ) {
      throw new DriveProjectManifestBatchAppendError({
        status: "invalidProject",
        savedAssets,
        possibleChangedItems: changedItems,
        diagnostics: [
          `manifest.json.slides が上限の ${DRIVE_PROJECT_MAX_SLIDE_COUNT} 件を超えます。`,
          "batch manifest反映は開始していません。",
          "Drive asset file は作成済みです。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const nextProject: DriveProjectSummary = {
      ...input.project,
      updatedAt: now,
    };
    const slides = input.savedAssets.map((item) =>
      buildDriveProjectManifestSlide({
        savedAsset: item.savedAsset,
        source: item.source,
        now,
      }),
    );
    const nextManifestJsonText = buildProjectManifestJsonWithAppendedSlides({
      manifest: manifestResult.manifest,
      slides,
      updatedAt: now,
    });

    await updateDriveMultipartJsonFileContent({
      accessToken: input.accessToken,
      fileId: input.project.manifestFileId,
      metadata: {
        name: PROJECT_MANIFEST_NAME,
        mimeType: JSON_MIME_TYPE,
        appProperties: buildProjectAppProperties({
          role: "projectManifest",
          workspaceId: input.workspaceId,
          projectId: input.project.projectId,
        }),
      },
      expectedAppProperties: buildProjectAppProperties({
        role: "projectManifest",
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
      }),
      jsonText: nextManifestJsonText,
      fields: CREATE_JSON_FIELDS,
      signal: input.signal,
    });

    changedItems.push({
      role: "projectManifest",
      id: input.project.manifestFileId,
      name: PROJECT_MANIFEST_NAME,
    });

    const indexJsonText = await readDriveTextFile(
      input.accessToken,
      input.indexJsonFileId,
      input.signal,
    );

    const nextIndexResult = buildIndexJsonWithUpdatedProject({
      indexJsonText,
      expectedWorkspaceId: input.workspaceId,
      currentProject: input.project,
      nextProject,
      indexUpdatedAt: now,
    });

    if (nextIndexResult.status === "invalid") {
      throw new DriveProjectManifestBatchAppendError({
        status: "indexUpdateFailed",
        savedAssets,
        possibleChangedItems: changedItems,
        diagnostics: [
          ...nextIndexResult.diagnostics,
          "manifest.json は更新済みの可能性があります。",
          "index.json updatedAt は未更新です。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    await updateDriveMultipartJsonFileContent({
      accessToken: input.accessToken,
      fileId: input.indexJsonFileId,
      metadata: {
        name: INDEX_JSON_NAME,
        mimeType: JSON_MIME_TYPE,
        appProperties: buildWorkspaceAppProperties({
          role: "index",
          workspaceId: input.workspaceId,
        }),
      },
      expectedAppProperties: buildWorkspaceAppProperties({
        role: "index",
        workspaceId: input.workspaceId,
      }),
      jsonText: nextIndexResult.indexJsonText,
      fields: CREATE_JSON_FIELDS,
      signal: input.signal,
    });

    changedItems.push({
      role: "index",
      id: input.indexJsonFileId,
      name: INDEX_JSON_NAME,
    });

    const [verifiedManifestJsonText, verifiedIndexJsonText] = await Promise.all([
      readDriveTextFile(
        input.accessToken,
        input.project.manifestFileId,
        input.signal,
      ),
      readDriveTextFile(input.accessToken, input.indexJsonFileId, input.signal),
    ]);

    const registrationResult = validateCreatedProjectRegistration({
      indexJsonText: verifiedIndexJsonText,
      expectedProject: nextProject,
    });

    if (registrationResult.status === "invalid") {
      throw new DriveProjectManifestBatchAppendError({
        status: "verificationFailed",
        savedAssets,
        possibleChangedItems: changedItems,
        diagnostics: [
          ...registrationResult.diagnostics,
          "index.json 更新後の再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedManifestResult = parseDriveProjectManifestJson({
      manifestJsonText: verifiedManifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: registrationResult.project,
    });

    if (verifiedManifestResult.status === "invalid") {
      throw new DriveProjectManifestBatchAppendError({
        status: "verificationFailed",
        savedAssets,
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedManifestResult.diagnostics,
          "manifest.json 更新後の再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedSlidesById = new Map(
      verifiedManifestResult.details.slides.map((slide) => [slide.slideId, slide]),
    );
    const addedSlides = slides.map((slide) => verifiedSlidesById.get(slide.slideId));

    if (addedSlides.some((slide) => !slide)) {
      throw new DriveProjectManifestBatchAppendError({
        status: "verificationFailed",
        savedAssets,
        possibleChangedItems: changedItems,
        diagnostics: [
          "manifest.json 更新後に今回追加したslideの一部を確認できませんでした。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const appendedSlideIds = slides.map((slide) => slide.slideId);
    const verifiedTailSlideIds = verifiedManifestResult.details.slides
      .slice(-appendedSlideIds.length)
      .map((slide) => slide.slideId);

    if (!areStringArraysEqual(verifiedTailSlideIds, appendedSlideIds)) {
      throw new DriveProjectManifestBatchAppendError({
        status: "verificationFailed",
        savedAssets,
        possibleChangedItems: changedItems,
        diagnostics: [
          "manifest.json 更新後に今回追加したslidesが末尾へ追加されたことを確認できませんでした。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    return {
      project: registrationResult.project,
      details: verifiedManifestResult.details,
      addedSlides: addedSlides.filter((slide): slide is DriveSlideSummary =>
        Boolean(slide),
      ),
      manifestJsonText: verifiedManifestJsonText,
      indexJsonText: verifiedIndexJsonText,
      diagnostics: [
        ...manifestResult.diagnostics,
        `manifest.json にslideを${slides.length}件appendしました。`,
        ...nextIndexResult.diagnostics,
        "index.json の対象project.updatedAtを更新しました。",
        ...registrationResult.diagnostics,
        ...verifiedManifestResult.diagnostics,
        "manifest.json / index.json のbatch更新後再検証が完了しました。",
      ],
    };
  } catch (error) {
    if (error instanceof DriveProjectManifestBatchAppendError) {
      throw error;
    }

    throw new DriveProjectManifestBatchAppendError({
      status: toDriveProjectManifestAppendFailureStatus(error, changedItems),
      savedAssets,
      possibleChangedItems: changedItems,
      diagnostics: buildDriveProjectManifestBatchAppendFailureDiagnostics({
        error,
        changedItems,
        savedAssets,
      }),
      cause: error,
    });
  }
}

export async function updateDriveProjectTitle(
  input: DriveProjectTitleUpdateInput,
): Promise<DriveProjectTitleUpdateResult> {
  const changedItems: DriveProjectChangedItem[] = [];
  const titleDiagnostics = validateDriveProjectTitle(input.title);
  const now = new Date().toISOString();

  if (titleDiagnostics.length > 0) {
    throw new DriveProjectTitleUpdateError({
      status: "invalidProject",
      possibleChangedItems: changedItems,
      diagnostics: titleDiagnostics,
    });
  }

  try {
    const [indexJsonText, manifestJsonText] = await input.runStep((signal) =>
      Promise.all([
        readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
        readDriveTextFile(input.accessToken, input.project.manifestFileId, signal),
      ]),
    );

    const registrationResult = validateCreatedProjectRegistration({
      indexJsonText,
      expectedProject: input.project,
    });

    if (registrationResult.status === "invalid") {
      throw new DriveProjectTitleUpdateError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...registrationResult.diagnostics,
          "title変更前の index.json 対象project検証に失敗したため、更新は開始していません。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const manifestResult = parseDriveProjectManifestJson({
      manifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: registrationResult.project,
    });

    if (manifestResult.status === "invalid") {
      throw new DriveProjectTitleUpdateError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...manifestResult.diagnostics,
          "title変更前の manifest.json 検証に失敗したため、更新は開始していません。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const nextProject: DriveProjectSummary = {
      ...registrationResult.project,
      title: input.title,
      updatedAt: now,
    };
    const nextManifestJsonText = buildProjectManifestJsonWithUpdatedTitle({
      manifest: manifestResult.manifest,
      title: input.title,
      updatedAt: now,
    });

    await input.runStep((signal) =>
      updateDriveMultipartJsonFileContent({
        accessToken: input.accessToken,
        fileId: input.project.manifestFileId,
        metadata: {
          name: PROJECT_MANIFEST_NAME,
          mimeType: JSON_MIME_TYPE,
          appProperties: buildProjectAppProperties({
            role: "projectManifest",
            workspaceId: input.workspaceId,
            projectId: input.project.projectId,
          }),
        },
        expectedAppProperties: buildProjectAppProperties({
          role: "projectManifest",
          workspaceId: input.workspaceId,
          projectId: input.project.projectId,
        }),
        jsonText: nextManifestJsonText,
        fields: CREATE_JSON_FIELDS,
        signal,
      }),
    );

    changedItems.push({
      role: "projectManifest",
      id: input.project.manifestFileId,
      name: PROJECT_MANIFEST_NAME,
    });

    const preIndexUpdateJsonText = await input.runStep((signal) =>
      readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
    );

    const nextIndexResult = buildIndexJsonWithUpdatedProject({
      indexJsonText: preIndexUpdateJsonText,
      expectedWorkspaceId: input.workspaceId,
      currentProject: registrationResult.project,
      nextProject,
      indexUpdatedAt: now,
    });

    if (nextIndexResult.status === "invalid") {
      throw new DriveProjectTitleUpdateError({
        status: "indexUpdateFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...nextIndexResult.diagnostics,
          "manifest.json は更新済みの可能性があります。",
          "index.json は未更新です。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    await input.runStep((signal) =>
      updateDriveMultipartJsonFileContent({
        accessToken: input.accessToken,
        fileId: input.indexJsonFileId,
        metadata: {
          name: INDEX_JSON_NAME,
          mimeType: JSON_MIME_TYPE,
          appProperties: buildWorkspaceAppProperties({
            role: "index",
            workspaceId: input.workspaceId,
          }),
        },
        expectedAppProperties: buildWorkspaceAppProperties({
          role: "index",
          workspaceId: input.workspaceId,
        }),
        jsonText: nextIndexResult.indexJsonText,
        fields: CREATE_JSON_FIELDS,
        signal,
      }),
    );

    changedItems.push({
      role: "index",
      id: input.indexJsonFileId,
      name: INDEX_JSON_NAME,
    });

    const [verifiedManifestJsonText, verifiedIndexJsonText] = await input.runStep(
      (signal) =>
        Promise.all([
          readDriveTextFile(input.accessToken, input.project.manifestFileId, signal),
          readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
        ]),
    );

    const verifiedRegistrationResult = validateCreatedProjectRegistration({
      indexJsonText: verifiedIndexJsonText,
      expectedProject: nextProject,
    });

    if (verifiedRegistrationResult.status === "invalid") {
      throw new DriveProjectTitleUpdateError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedRegistrationResult.diagnostics,
          "index.json 更新後の title 再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedManifestResult = parseDriveProjectManifestJson({
      manifestJsonText: verifiedManifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: verifiedRegistrationResult.project,
    });

    if (verifiedManifestResult.status === "invalid") {
      throw new DriveProjectTitleUpdateError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedManifestResult.diagnostics,
          "manifest.json 更新後の title 再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    return {
      project: verifiedRegistrationResult.project,
      details: verifiedManifestResult.details,
      manifestJsonText: verifiedManifestJsonText,
      indexJsonText: verifiedIndexJsonText,
      diagnostics: [
        ...registrationResult.diagnostics,
        ...manifestResult.diagnostics,
        "manifest.json.title を更新しました。",
        ...nextIndexResult.diagnostics,
        "index.json.projects の対象project.titleを更新しました。",
        ...verifiedRegistrationResult.diagnostics,
        ...verifiedManifestResult.diagnostics,
        "title変更後の manifest.json / index.json 再検証が完了しました。",
      ],
    };
  } catch (error) {
    if (error instanceof DriveProjectTitleUpdateError) {
      throw error;
    }

    throw new DriveProjectTitleUpdateError({
      status: toDriveProjectTitleUpdateFailureStatus(error, changedItems),
      possibleChangedItems: changedItems,
      diagnostics: buildDriveProjectTitleUpdateFailureDiagnostics({
        error,
        changedItems,
      }),
      cause: error,
    });
  }
}

export async function updateDriveProjectSlideCaption(
  input: DriveProjectSlideCaptionUpdateInput,
): Promise<DriveProjectSlideCaptionUpdateResult> {
  const changedItems: DriveProjectChangedItem[] = [];
  const caption = normalizeDriveProjectSlideCaption(input.caption);
  const captionDiagnostics = validateDriveProjectSlideCaption(caption);
  const now = new Date().toISOString();

  if (captionDiagnostics.length > 0) {
    throw new DriveProjectSlideCaptionUpdateError({
      status: "invalidProject",
      possibleChangedItems: changedItems,
      diagnostics: captionDiagnostics,
    });
  }

  try {
    const [indexJsonText, manifestJsonText] = await input.runStep((signal) =>
      Promise.all([
        readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
        readDriveTextFile(input.accessToken, input.project.manifestFileId, signal),
      ]),
    );

    const registrationResult = validateCreatedProjectRegistration({
      indexJsonText,
      expectedProject: input.project,
    });

    if (registrationResult.status === "invalid") {
      throw new DriveProjectSlideCaptionUpdateError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...registrationResult.diagnostics,
          "caption変更前の index.json 対象project検証に失敗したため、更新は開始していません。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const manifestResult = parseDriveProjectManifestJson({
      manifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: registrationResult.project,
    });

    if (manifestResult.status === "invalid") {
      throw new DriveProjectSlideCaptionUpdateError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...manifestResult.diagnostics,
          "caption変更前の manifest.json 検証に失敗したため、更新は開始していません。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    if (
      !manifestResult.manifest.slides.some(
        (slide) => slide.slideId === input.slideId,
      )
    ) {
      throw new DriveProjectSlideCaptionUpdateError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          "caption変更対象のslideIdがmanifest.json.slidesに見つかりません。",
          "更新は開始していません。",
        ],
      });
    }

    const nextProject: DriveProjectSummary = {
      ...registrationResult.project,
      updatedAt: now,
    };
    const nextManifestJsonText = buildProjectManifestJsonWithUpdatedSlideCaption({
      manifest: manifestResult.manifest,
      slideId: input.slideId,
      caption,
      updatedAt: now,
    });

    await input.runStep((signal) =>
      updateDriveMultipartJsonFileContent({
        accessToken: input.accessToken,
        fileId: input.project.manifestFileId,
        metadata: {
          name: PROJECT_MANIFEST_NAME,
          mimeType: JSON_MIME_TYPE,
          appProperties: buildProjectAppProperties({
            role: "projectManifest",
            workspaceId: input.workspaceId,
            projectId: input.project.projectId,
          }),
        },
        expectedAppProperties: buildProjectAppProperties({
          role: "projectManifest",
          workspaceId: input.workspaceId,
          projectId: input.project.projectId,
        }),
        jsonText: nextManifestJsonText,
        fields: CREATE_JSON_FIELDS,
        signal,
      }),
    );

    changedItems.push({
      role: "projectManifest",
      id: input.project.manifestFileId,
      name: PROJECT_MANIFEST_NAME,
    });

    const preIndexUpdateJsonText = await input.runStep((signal) =>
      readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
    );

    const nextIndexResult = buildIndexJsonWithUpdatedProject({
      indexJsonText: preIndexUpdateJsonText,
      expectedWorkspaceId: input.workspaceId,
      currentProject: registrationResult.project,
      nextProject,
      indexUpdatedAt: now,
    });

    if (nextIndexResult.status === "invalid") {
      throw new DriveProjectSlideCaptionUpdateError({
        status: "indexUpdateFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...nextIndexResult.diagnostics,
          "manifest.json は更新済みの可能性があります。",
          "index.json は未更新です。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    await input.runStep((signal) =>
      updateDriveMultipartJsonFileContent({
        accessToken: input.accessToken,
        fileId: input.indexJsonFileId,
        metadata: {
          name: INDEX_JSON_NAME,
          mimeType: JSON_MIME_TYPE,
          appProperties: buildWorkspaceAppProperties({
            role: "index",
            workspaceId: input.workspaceId,
          }),
        },
        expectedAppProperties: buildWorkspaceAppProperties({
          role: "index",
          workspaceId: input.workspaceId,
        }),
        jsonText: nextIndexResult.indexJsonText,
        fields: CREATE_JSON_FIELDS,
        signal,
      }),
    );

    changedItems.push({
      role: "index",
      id: input.indexJsonFileId,
      name: INDEX_JSON_NAME,
    });

    const [verifiedManifestJsonText, verifiedIndexJsonText] = await input.runStep(
      (signal) =>
        Promise.all([
          readDriveTextFile(input.accessToken, input.project.manifestFileId, signal),
          readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
        ]),
    );

    const verifiedRegistrationResult = validateCreatedProjectRegistration({
      indexJsonText: verifiedIndexJsonText,
      expectedProject: nextProject,
    });

    if (verifiedRegistrationResult.status === "invalid") {
      throw new DriveProjectSlideCaptionUpdateError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedRegistrationResult.diagnostics,
          "index.json 更新後の caption 再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedManifestResult = parseDriveProjectManifestJson({
      manifestJsonText: verifiedManifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: verifiedRegistrationResult.project,
    });

    if (verifiedManifestResult.status === "invalid") {
      throw new DriveProjectSlideCaptionUpdateError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedManifestResult.diagnostics,
          "manifest.json 更新後の caption 再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedSlide = verifiedManifestResult.details.slides.find(
      (slide) => slide.slideId === input.slideId,
    );

    if (!verifiedSlide || verifiedSlide.caption !== caption) {
      throw new DriveProjectSlideCaptionUpdateError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          "manifest.json 更新後に対象slideのcaption反映を確認できませんでした。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    return {
      project: verifiedRegistrationResult.project,
      details: verifiedManifestResult.details,
      manifestJsonText: verifiedManifestJsonText,
      indexJsonText: verifiedIndexJsonText,
      caption,
      diagnostics: [
        ...registrationResult.diagnostics,
        ...manifestResult.diagnostics,
        "manifest.json.slides の対象captionを更新しました。",
        ...nextIndexResult.diagnostics,
        "index.json.projects の対象project.updatedAtを更新しました。",
        ...verifiedRegistrationResult.diagnostics,
        ...verifiedManifestResult.diagnostics,
        "caption変更後の manifest.json / index.json 再検証が完了しました。",
      ],
    };
  } catch (error) {
    if (error instanceof DriveProjectSlideCaptionUpdateError) {
      throw error;
    }

    throw new DriveProjectSlideCaptionUpdateError({
      status: toDriveProjectSlideCaptionUpdateFailureStatus(error, changedItems),
      possibleChangedItems: changedItems,
      diagnostics: buildDriveProjectSlideCaptionUpdateFailureDiagnostics({
        error,
        changedItems,
      }),
      cause: error,
    });
  }
}

export async function reorderDriveProjectSlides(
  input: DriveProjectSlideReorderInput,
): Promise<DriveProjectSlideReorderResult> {
  const changedItems: DriveProjectChangedItem[] = [];
  const inputDiagnostics = validateDriveProjectSlideReorderInput(input);
  const now = new Date().toISOString();

  if (inputDiagnostics.length > 0) {
    throw new DriveProjectSlideReorderError({
      status: "invalidProject",
      possibleChangedItems: changedItems,
      diagnostics: inputDiagnostics,
    });
  }

  try {
    const [indexJsonText, manifestJsonText] = await input.runStep((signal) =>
      Promise.all([
        readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
        readDriveTextFile(input.accessToken, input.project.manifestFileId, signal),
      ]),
    );

    const registrationResult = validateCreatedProjectRegistration({
      indexJsonText,
      expectedProject: input.project,
    });

    if (registrationResult.status === "invalid") {
      throw new DriveProjectSlideReorderError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...registrationResult.diagnostics,
          "slide順変更前の index.json 対象project検証に失敗したため、更新は開始していません。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const manifestResult = parseDriveProjectManifestJson({
      manifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: registrationResult.project,
    });

    if (manifestResult.status === "invalid") {
      throw new DriveProjectSlideReorderError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...manifestResult.diagnostics,
          "slide順変更前の manifest.json 検証に失敗したため、更新は開始していません。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const orderDiagnostics = validateDriveProjectSlideOrder({
      slides: manifestResult.manifest.slides,
      orderedSlideIds: input.orderedSlideIds,
    });

    if (orderDiagnostics.length > 0) {
      throw new DriveProjectSlideReorderError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...orderDiagnostics,
          "manifest.json.slides の並び替えは開始していません。",
        ],
      });
    }

    const nextProject: DriveProjectSummary = {
      ...registrationResult.project,
      updatedAt: now,
    };
    const nextManifestJsonText = buildProjectManifestJsonWithReorderedSlides({
      manifest: manifestResult.manifest,
      orderedSlideIds: input.orderedSlideIds,
      updatedAt: now,
    });

    await input.runStep((signal) =>
      updateDriveMultipartJsonFileContent({
        accessToken: input.accessToken,
        fileId: input.project.manifestFileId,
        metadata: {
          name: PROJECT_MANIFEST_NAME,
          mimeType: JSON_MIME_TYPE,
          appProperties: buildProjectAppProperties({
            role: "projectManifest",
            workspaceId: input.workspaceId,
            projectId: input.project.projectId,
          }),
        },
        expectedAppProperties: buildProjectAppProperties({
          role: "projectManifest",
          workspaceId: input.workspaceId,
          projectId: input.project.projectId,
        }),
        jsonText: nextManifestJsonText,
        fields: CREATE_JSON_FIELDS,
        signal,
      }),
    );

    changedItems.push({
      role: "projectManifest",
      id: input.project.manifestFileId,
      name: PROJECT_MANIFEST_NAME,
    });

    const preIndexUpdateJsonText = await input.runStep((signal) =>
      readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
    );

    const nextIndexResult = buildIndexJsonWithUpdatedProject({
      indexJsonText: preIndexUpdateJsonText,
      expectedWorkspaceId: input.workspaceId,
      currentProject: registrationResult.project,
      nextProject,
      indexUpdatedAt: now,
    });

    if (nextIndexResult.status === "invalid") {
      throw new DriveProjectSlideReorderError({
        status: "indexUpdateFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...nextIndexResult.diagnostics,
          "manifest.json は更新済みの可能性があります。",
          "index.json は未更新です。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    await input.runStep((signal) =>
      updateDriveMultipartJsonFileContent({
        accessToken: input.accessToken,
        fileId: input.indexJsonFileId,
        metadata: {
          name: INDEX_JSON_NAME,
          mimeType: JSON_MIME_TYPE,
          appProperties: buildWorkspaceAppProperties({
            role: "index",
            workspaceId: input.workspaceId,
          }),
        },
        expectedAppProperties: buildWorkspaceAppProperties({
          role: "index",
          workspaceId: input.workspaceId,
        }),
        jsonText: nextIndexResult.indexJsonText,
        fields: CREATE_JSON_FIELDS,
        signal,
      }),
    );

    changedItems.push({
      role: "index",
      id: input.indexJsonFileId,
      name: INDEX_JSON_NAME,
    });

    const [verifiedManifestJsonText, verifiedIndexJsonText] = await input.runStep(
      (signal) =>
        Promise.all([
          readDriveTextFile(input.accessToken, input.project.manifestFileId, signal),
          readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
        ]),
    );

    const verifiedRegistrationResult = validateCreatedProjectRegistration({
      indexJsonText: verifiedIndexJsonText,
      expectedProject: nextProject,
    });

    if (verifiedRegistrationResult.status === "invalid") {
      throw new DriveProjectSlideReorderError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedRegistrationResult.diagnostics,
          "index.json 更新後の slide順変更再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedManifestResult = parseDriveProjectManifestJson({
      manifestJsonText: verifiedManifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: verifiedRegistrationResult.project,
    });

    if (verifiedManifestResult.status === "invalid") {
      throw new DriveProjectSlideReorderError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedManifestResult.diagnostics,
          "manifest.json 更新後の slide順変更再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedSlideIds = verifiedManifestResult.details.slides.map(
      (slide) => slide.slideId,
    );

    if (!areStringArraysEqual(verifiedSlideIds, input.orderedSlideIds)) {
      throw new DriveProjectSlideReorderError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          "manifest.json 更新後に保存済みのslides順が指定順と一致していません。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    return {
      project: verifiedRegistrationResult.project,
      details: verifiedManifestResult.details,
      manifestJsonText: verifiedManifestJsonText,
      indexJsonText: verifiedIndexJsonText,
      orderedSlideIds: [...input.orderedSlideIds],
      diagnostics: [
        ...registrationResult.diagnostics,
        ...manifestResult.diagnostics,
        "manifest.json.slides の配列順を更新しました。",
        "slide本文、assetId、assetFileId、caption、durationSeconds は変更していません。",
        ...nextIndexResult.diagnostics,
        "index.json.projects の対象project.updatedAtを更新しました。",
        ...verifiedRegistrationResult.diagnostics,
        ...verifiedManifestResult.diagnostics,
        "slide順変更後の manifest.json / index.json 再検証が完了しました。",
      ],
    };
  } catch (error) {
    if (error instanceof DriveProjectSlideReorderError) {
      throw error;
    }

    throw new DriveProjectSlideReorderError({
      status: toDriveProjectSlideReorderFailureStatus(error, changedItems),
      possibleChangedItems: changedItems,
      diagnostics: buildDriveProjectSlideReorderFailureDiagnostics({
        error,
        changedItems,
      }),
      cause: error,
    });
  }
}

export async function deleteDriveProjectSlides(
  input: DriveProjectSlideDeleteInput,
): Promise<DriveProjectSlideDeleteResult> {
  const changedItems: DriveProjectChangedItem[] = [];
  const inputDiagnostics = validateDriveProjectSlideDeleteInput(input);
  const now = new Date().toISOString();

  if (inputDiagnostics.length > 0) {
    throw new DriveProjectSlideDeleteError({
      status: "invalidProject",
      possibleChangedItems: changedItems,
      diagnostics: inputDiagnostics,
    });
  }

  try {
    const [indexJsonText, manifestJsonText] = await input.runStep((signal) =>
      Promise.all([
        readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
        readDriveTextFile(input.accessToken, input.project.manifestFileId, signal),
      ]),
    );

    const registrationResult = validateCreatedProjectRegistration({
      indexJsonText,
      expectedProject: input.project,
    });

    if (registrationResult.status === "invalid") {
      throw new DriveProjectSlideDeleteError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...registrationResult.diagnostics,
          "slide削除前の index.json 対象project検証に失敗したため、更新は開始していません。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const manifestResult = parseDriveProjectManifestJson({
      manifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: registrationResult.project,
    });

    if (manifestResult.status === "invalid") {
      throw new DriveProjectSlideDeleteError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...manifestResult.diagnostics,
          "slide削除前の manifest.json 検証に失敗したため、更新は開始していません。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const existenceDiagnostics = validateDriveProjectSlideIdsExist({
      slides: manifestResult.manifest.slides,
      slideIds: input.slideIds,
    });

    if (existenceDiagnostics.length > 0) {
      throw new DriveProjectSlideDeleteError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...existenceDiagnostics,
          "manifest.json.slides の削除は開始していません。",
        ],
      });
    }

    const nextProject: DriveProjectSummary = {
      ...registrationResult.project,
      updatedAt: now,
    };
    const nextManifestJsonText = buildProjectManifestJsonWithDeletedSlides({
      manifest: manifestResult.manifest,
      slideIds: input.slideIds,
      updatedAt: now,
    });

    await input.runStep((signal) =>
      updateDriveMultipartJsonFileContent({
        accessToken: input.accessToken,
        fileId: input.project.manifestFileId,
        metadata: {
          name: PROJECT_MANIFEST_NAME,
          mimeType: JSON_MIME_TYPE,
          appProperties: buildProjectAppProperties({
            role: "projectManifest",
            workspaceId: input.workspaceId,
            projectId: input.project.projectId,
          }),
        },
        expectedAppProperties: buildProjectAppProperties({
          role: "projectManifest",
          workspaceId: input.workspaceId,
          projectId: input.project.projectId,
        }),
        jsonText: nextManifestJsonText,
        fields: CREATE_JSON_FIELDS,
        signal,
      }),
    );

    changedItems.push({
      role: "projectManifest",
      id: input.project.manifestFileId,
      name: PROJECT_MANIFEST_NAME,
    });

    const preIndexUpdateJsonText = await input.runStep((signal) =>
      readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
    );

    const nextIndexResult = buildIndexJsonWithUpdatedProject({
      indexJsonText: preIndexUpdateJsonText,
      expectedWorkspaceId: input.workspaceId,
      currentProject: registrationResult.project,
      nextProject,
      indexUpdatedAt: now,
    });

    if (nextIndexResult.status === "invalid") {
      throw new DriveProjectSlideDeleteError({
        status: "indexUpdateFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...nextIndexResult.diagnostics,
          "manifest.json は更新済みの可能性があります。",
          "index.json は未更新です。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    await input.runStep((signal) =>
      updateDriveMultipartJsonFileContent({
        accessToken: input.accessToken,
        fileId: input.indexJsonFileId,
        metadata: {
          name: INDEX_JSON_NAME,
          mimeType: JSON_MIME_TYPE,
          appProperties: buildWorkspaceAppProperties({
            role: "index",
            workspaceId: input.workspaceId,
          }),
        },
        expectedAppProperties: buildWorkspaceAppProperties({
          role: "index",
          workspaceId: input.workspaceId,
        }),
        jsonText: nextIndexResult.indexJsonText,
        fields: CREATE_JSON_FIELDS,
        signal,
      }),
    );

    changedItems.push({
      role: "index",
      id: input.indexJsonFileId,
      name: INDEX_JSON_NAME,
    });

    const [verifiedManifestJsonText, verifiedIndexJsonText] = await input.runStep(
      (signal) =>
        Promise.all([
          readDriveTextFile(input.accessToken, input.project.manifestFileId, signal),
          readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
        ]),
    );

    const verifiedRegistrationResult = validateCreatedProjectRegistration({
      indexJsonText: verifiedIndexJsonText,
      expectedProject: nextProject,
    });

    if (verifiedRegistrationResult.status === "invalid") {
      throw new DriveProjectSlideDeleteError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedRegistrationResult.diagnostics,
          "index.json 更新後の slide削除再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedManifestResult = parseDriveProjectManifestJson({
      manifestJsonText: verifiedManifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: verifiedRegistrationResult.project,
    });

    if (verifiedManifestResult.status === "invalid") {
      throw new DriveProjectSlideDeleteError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedManifestResult.diagnostics,
          "manifest.json 更新後の slide削除再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const remainingSlideIds = new Set(
      verifiedManifestResult.details.slides.map((slide) => slide.slideId),
    );
    const stillExistingSlideIds = input.slideIds.filter((slideId) =>
      remainingSlideIds.has(slideId),
    );

    if (stillExistingSlideIds.length > 0) {
      throw new DriveProjectSlideDeleteError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          `manifest.json 更新後も削除対象slideIdが残っています: ${stillExistingSlideIds.map(formatDriveIdPart).join(", ")}`,
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    return {
      project: verifiedRegistrationResult.project,
      details: verifiedManifestResult.details,
      manifestJsonText: verifiedManifestJsonText,
      indexJsonText: verifiedIndexJsonText,
      deletedSlideIds: [...input.slideIds],
      diagnostics: [
        ...registrationResult.diagnostics,
        ...manifestResult.diagnostics,
        `manifest.json.slides からslide entryを${input.slideIds.length}件削除しました。`,
        "Drive assets/ の画像fileは削除していません。",
        ...nextIndexResult.diagnostics,
        "index.json.projects の対象project.updatedAtを更新しました。",
        ...verifiedRegistrationResult.diagnostics,
        ...verifiedManifestResult.diagnostics,
        "slide削除後の manifest.json / index.json 再検証が完了しました。",
      ],
    };
  } catch (error) {
    if (error instanceof DriveProjectSlideDeleteError) {
      throw error;
    }

    throw new DriveProjectSlideDeleteError({
      status: toDriveProjectSlideDeleteFailureStatus(error, changedItems),
      possibleChangedItems: changedItems,
      diagnostics: buildDriveProjectSlideDeleteFailureDiagnostics({
        error,
        changedItems,
      }),
      cause: error,
    });
  }
}

export async function duplicateDriveProjectSlide(
  input: DriveProjectSlideDuplicateInput,
): Promise<DriveProjectSlideDuplicateResult> {
  const changedItems: DriveProjectChangedItem[] = [];
  const inputDiagnostics = validateDriveProjectSlideDuplicateInput(input);
  const now = new Date().toISOString();

  if (inputDiagnostics.length > 0) {
    throw new DriveProjectSlideDuplicateError({
      status: "invalidProject",
      possibleChangedItems: changedItems,
      diagnostics: inputDiagnostics,
    });
  }

  try {
    const [indexJsonText, manifestJsonText] = await input.runStep((signal) =>
      Promise.all([
        readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
        readDriveTextFile(input.accessToken, input.project.manifestFileId, signal),
      ]),
    );

    const registrationResult = validateCreatedProjectRegistration({
      indexJsonText,
      expectedProject: input.project,
    });

    if (registrationResult.status === "invalid") {
      throw new DriveProjectSlideDuplicateError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...registrationResult.diagnostics,
          "slide複製前の index.json 対象project検証に失敗したため、更新は開始していません。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const manifestResult = parseDriveProjectManifestJson({
      manifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: registrationResult.project,
    });

    if (manifestResult.status === "invalid") {
      throw new DriveProjectSlideDuplicateError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...manifestResult.diagnostics,
          "slide複製前の manifest.json 検証に失敗したため、更新は開始していません。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const sourceSlide = manifestResult.manifest.slides.find(
      (slide) => slide.slideId === input.slideId,
    );

    if (!sourceSlide) {
      throw new DriveProjectSlideDuplicateError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          "複製対象のslideIdがmanifest.json.slidesに見つかりません。",
          "manifest.json.slides の複製は開始していません。",
        ],
      });
    }

    if (manifestResult.manifest.slides.length >= DRIVE_PROJECT_MAX_SLIDE_COUNT) {
      throw new DriveProjectSlideDuplicateError({
        status: "invalidProject",
        possibleChangedItems: changedItems,
        diagnostics: [
          `manifest.json.slides が上限の ${DRIVE_PROJECT_MAX_SLIDE_COUNT} 件に達しています。`,
          "slide複製は開始していません。",
        ],
      });
    }

    const duplicatedSlide: DriveSlideSummary = {
      ...sourceSlide,
      slideId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    const nextProject: DriveProjectSummary = {
      ...registrationResult.project,
      updatedAt: now,
    };
    const nextManifestJsonText = buildProjectManifestJsonWithDuplicatedSlide({
      manifest: manifestResult.manifest,
      sourceSlideId: input.slideId,
      duplicatedSlide,
      updatedAt: now,
    });

    await input.runStep((signal) =>
      updateDriveMultipartJsonFileContent({
        accessToken: input.accessToken,
        fileId: input.project.manifestFileId,
        metadata: {
          name: PROJECT_MANIFEST_NAME,
          mimeType: JSON_MIME_TYPE,
          appProperties: buildProjectAppProperties({
            role: "projectManifest",
            workspaceId: input.workspaceId,
            projectId: input.project.projectId,
          }),
        },
        expectedAppProperties: buildProjectAppProperties({
          role: "projectManifest",
          workspaceId: input.workspaceId,
          projectId: input.project.projectId,
        }),
        jsonText: nextManifestJsonText,
        fields: CREATE_JSON_FIELDS,
        signal,
      }),
    );

    changedItems.push({
      role: "projectManifest",
      id: input.project.manifestFileId,
      name: PROJECT_MANIFEST_NAME,
    });

    const preIndexUpdateJsonText = await input.runStep((signal) =>
      readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
    );

    const nextIndexResult = buildIndexJsonWithUpdatedProject({
      indexJsonText: preIndexUpdateJsonText,
      expectedWorkspaceId: input.workspaceId,
      currentProject: registrationResult.project,
      nextProject,
      indexUpdatedAt: now,
    });

    if (nextIndexResult.status === "invalid") {
      throw new DriveProjectSlideDuplicateError({
        status: "indexUpdateFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...nextIndexResult.diagnostics,
          "manifest.json は更新済みの可能性があります。",
          "index.json は未更新です。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    await input.runStep((signal) =>
      updateDriveMultipartJsonFileContent({
        accessToken: input.accessToken,
        fileId: input.indexJsonFileId,
        metadata: {
          name: INDEX_JSON_NAME,
          mimeType: JSON_MIME_TYPE,
          appProperties: buildWorkspaceAppProperties({
            role: "index",
            workspaceId: input.workspaceId,
          }),
        },
        expectedAppProperties: buildWorkspaceAppProperties({
          role: "index",
          workspaceId: input.workspaceId,
        }),
        jsonText: nextIndexResult.indexJsonText,
        fields: CREATE_JSON_FIELDS,
        signal,
      }),
    );

    changedItems.push({
      role: "index",
      id: input.indexJsonFileId,
      name: INDEX_JSON_NAME,
    });

    const [verifiedManifestJsonText, verifiedIndexJsonText] = await input.runStep(
      (signal) =>
        Promise.all([
          readDriveTextFile(input.accessToken, input.project.manifestFileId, signal),
          readDriveTextFile(input.accessToken, input.indexJsonFileId, signal),
        ]),
    );

    const verifiedRegistrationResult = validateCreatedProjectRegistration({
      indexJsonText: verifiedIndexJsonText,
      expectedProject: nextProject,
    });

    if (verifiedRegistrationResult.status === "invalid") {
      throw new DriveProjectSlideDuplicateError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedRegistrationResult.diagnostics,
          "index.json 更新後の slide複製再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedManifestResult = parseDriveProjectManifestJson({
      manifestJsonText: verifiedManifestJsonText,
      expectedWorkspaceId: input.workspaceId,
      project: verifiedRegistrationResult.project,
    });

    if (verifiedManifestResult.status === "invalid") {
      throw new DriveProjectSlideDuplicateError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          ...verifiedManifestResult.diagnostics,
          "manifest.json 更新後の slide複製再検証に失敗しました。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    const verifiedDuplicatedSlide = verifiedManifestResult.details.slides.find(
      (slide) => slide.slideId === duplicatedSlide.slideId,
    );

    if (
      !verifiedDuplicatedSlide ||
      verifiedDuplicatedSlide.assetId !== sourceSlide.assetId ||
      verifiedDuplicatedSlide.assetFileId !== sourceSlide.assetFileId ||
      verifiedDuplicatedSlide.caption !== sourceSlide.caption ||
      verifiedDuplicatedSlide.durationSeconds !== sourceSlide.durationSeconds
    ) {
      throw new DriveProjectSlideDuplicateError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          "manifest.json 更新後に複製slideのasset参照またはcaptionを確認できませんでした。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    if (
      !isDuplicatedSlideInsertedAfterSource({
        slides: verifiedManifestResult.details.slides,
        sourceSlideId: sourceSlide.slideId,
        duplicatedSlideId: duplicatedSlide.slideId,
      })
    ) {
      throw new DriveProjectSlideDuplicateError({
        status: "verificationFailed",
        possibleChangedItems: changedItems,
        diagnostics: [
          "manifest.json 更新後に複製slideが元slideの直後にあることを確認できませんでした。",
          "manifest.json / index.json は更新済みの可能性があります。",
          "自動削除・自動修復は行いません。",
        ],
      });
    }

    return {
      project: verifiedRegistrationResult.project,
      details: verifiedManifestResult.details,
      manifestJsonText: verifiedManifestJsonText,
      indexJsonText: verifiedIndexJsonText,
      sourceSlideId: input.slideId,
      duplicatedSlide: verifiedDuplicatedSlide,
      diagnostics: [
        ...registrationResult.diagnostics,
        ...manifestResult.diagnostics,
        "manifest.json.slides に同じassetを参照する複製slideを追加しました。",
        "Drive asset file はコピーしていません。",
        ...nextIndexResult.diagnostics,
        "index.json.projects の対象project.updatedAtを更新しました。",
        ...verifiedRegistrationResult.diagnostics,
        ...verifiedManifestResult.diagnostics,
        "slide複製後の manifest.json / index.json 再検証が完了しました。",
      ],
    };
  } catch (error) {
    if (error instanceof DriveProjectSlideDuplicateError) {
      throw error;
    }

    throw new DriveProjectSlideDuplicateError({
      status: toDriveProjectSlideDuplicateFailureStatus(error, changedItems),
      possibleChangedItems: changedItems,
      diagnostics: buildDriveProjectSlideDuplicateFailureDiagnostics({
        error,
        changedItems,
      }),
      cause: error,
    });
  }
}

async function fetchDriveFileMetadata(
  accessToken: string,
  fileId: string,
  signal: AbortSignal,
): Promise<DriveFileCandidate> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,createdTime,modifiedTime,appProperties,size,parents",
  });

  const response = await fetch(
    `${DRIVE_API_FILES_URL}/${encodeURIComponent(fileId)}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    },
  );

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  const file = normalizeDriveFile((await response.json()) as unknown);

  if (!file) {
    throw new Error("Drive file metadata response did not include required fields.");
  }

  return file;
}


export async function createDriveWorkspace(
  input: DriveWorkspaceCreateInput,
): Promise<DriveWorkspaceCreateResult> {
  const workspaceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const possibleCreatedRoles: DriveCreatedWorkspaceItemRole[] = [];

  const workspaceRoot = await runWorkspaceCreateStep({
    role: "workspaceRoot",
    possibleCreatedRoles,
    create: () =>
      input.runStep((signal) =>
        createWorkspaceRootFolder(input.accessToken, workspaceId, signal),
      ),
  });

  await runWorkspaceCreateStep({
    role: "workspace",
    possibleCreatedRoles,
    create: () =>
      input.runStep((signal) =>
        createWorkspaceJsonFile({
          accessToken: input.accessToken,
          workspaceRootFolderId: workspaceRoot.id,
          workspaceId,
          now,
          signal,
        }),
      ),
  });

  await runWorkspaceCreateStep({
    role: "index",
    possibleCreatedRoles,
    create: () =>
      input.runStep((signal) =>
        createIndexJsonFile({
          accessToken: input.accessToken,
          workspaceRootFolderId: workspaceRoot.id,
          workspaceId,
          now,
          signal,
        }),
      ),
  });

  await runWorkspaceCreateStep({
    role: "projectsRoot",
    possibleCreatedRoles,
    create: () =>
      input.runStep((signal) =>
        createProjectsFolder({
          accessToken: input.accessToken,
          workspaceRootFolderId: workspaceRoot.id,
          workspaceId,
          signal,
        }),
      ),
  });

  return {
    workspaceId,
  };
}

export async function createWorkspaceRootFolder(
  accessToken: string,
  workspaceId: string,
  signal: AbortSignal,
): Promise<DriveWorkspaceCandidate> {
  return createDriveMetadataOnlyFile({
    accessToken,
    metadata: {
      name: WORKSPACE_ROOT_NAME,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      appProperties: buildWorkspaceAppProperties({
        role: "workspaceRoot",
        workspaceId,
      }),
    },
    fields: CREATE_FOLDER_FIELDS,
    signal,
  });
}

export async function createWorkspaceJsonFile(input: {
  accessToken: string;
  workspaceRootFolderId: string;
  workspaceId: string;
  now: string;
  signal: AbortSignal;
}): Promise<DriveWorkspaceCandidate> {
  const body = {
    app: DRIVE_WORKSPACE_APP_ID,
    role: "workspace",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    createdAt: input.now,
    updatedAt: input.now,
  };

  return createDriveMultipartJsonFile({
    accessToken: input.accessToken,
    metadata: {
      name: WORKSPACE_JSON_NAME,
      mimeType: JSON_MIME_TYPE,
      parents: [input.workspaceRootFolderId],
      appProperties: buildWorkspaceAppProperties({
        role: "workspace",
        workspaceId: input.workspaceId,
      }),
    },
    jsonText: stringifyWorkspaceJson(body),
    fields: CREATE_JSON_FIELDS,
    signal: input.signal,
  });
}

export async function createIndexJsonFile(input: {
  accessToken: string;
  workspaceRootFolderId: string;
  workspaceId: string;
  now: string;
  signal: AbortSignal;
}): Promise<DriveWorkspaceCandidate> {
  const body = {
    app: DRIVE_WORKSPACE_APP_ID,
    role: "index",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    projects: [],
    createdAt: input.now,
    updatedAt: input.now,
  };

  return createDriveMultipartJsonFile({
    accessToken: input.accessToken,
    metadata: {
      name: INDEX_JSON_NAME,
      mimeType: JSON_MIME_TYPE,
      parents: [input.workspaceRootFolderId],
      appProperties: buildWorkspaceAppProperties({
        role: "index",
        workspaceId: input.workspaceId,
      }),
    },
    jsonText: stringifyWorkspaceJson(body),
    fields: CREATE_JSON_FIELDS,
    signal: input.signal,
  });
}

export async function createProjectsFolder(input: {
  accessToken: string;
  workspaceRootFolderId: string;
  workspaceId: string;
  signal: AbortSignal;
}): Promise<DriveWorkspaceCandidate> {
  return createDriveMetadataOnlyFile({
    accessToken: input.accessToken,
    metadata: {
      name: PROJECTS_ROOT_NAME,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [input.workspaceRootFolderId],
      appProperties: buildWorkspaceAppProperties({
        role: "projectsRoot",
        workspaceId: input.workspaceId,
      }),
    },
    fields: CREATE_FOLDER_FIELDS,
    signal: input.signal,
  });
}

export function validateWorkspaceMetadata(
  rootCandidate: DriveWorkspaceRootCandidate,
  childCandidatesByRole: DriveChildCandidatesByRole,
): DriveMetadataValidationResult {
  const diagnostics: string[] = [];
  const workspaceIds: string[] = [];

  const rootWorkspaceId = validateCommonMetadata({
    item: rootCandidate,
    label: "workspace root folder",
    expectedRole: "workspaceRoot",
    expectedMimeType: DRIVE_FOLDER_MIME_TYPE,
    diagnostics,
    workspaceIds,
  });

  const workspaceJson = validateRequiredJsonChild({
    candidates: childCandidatesByRole.workspace,
    label: "workspace.json",
    expectedName: WORKSPACE_JSON_NAME,
    expectedRole: "workspace",
    diagnostics,
    workspaceIds,
  });

  const indexJson = validateRequiredJsonChild({
    candidates: childCandidatesByRole.index,
    label: "index.json",
    expectedName: INDEX_JSON_NAME,
    expectedRole: "index",
    diagnostics,
    workspaceIds,
  });

  const projectsRoot = validateRequiredFolderChild({
    candidates: childCandidatesByRole.projectsRoot,
    label: "projects/",
    expectedName: PROJECTS_ROOT_NAME,
    expectedRole: "projectsRoot",
    diagnostics,
    workspaceIds,
  });

  const uniqueWorkspaceIds = Array.from(new Set(workspaceIds));

  if (uniqueWorkspaceIds.length > 1) {
    diagnostics.push(
      "workspace root folder / workspace.json / index.json / projects/ の workspaceId が一致していません。",
    );
  }

  if (!rootWorkspaceId) {
    diagnostics.push("workspace root folder のworkspaceIdを確認できませんでした。");
  }

  if (!workspaceJson?.id) {
    diagnostics.push("workspace.json のDrive fileIdを確認できませんでした。");
  }

  if (!indexJson?.id) {
    diagnostics.push("index.json のDrive fileIdを確認できませんでした。");
  }

  if (!projectsRoot?.id) {
    diagnostics.push("projects/ のDrive folderIdを確認できませんでした。");
  }

  if (diagnostics.length > 0) {
    return {
      status: "invalidWorkspace",
      diagnostics,
    };
  }

  if (!rootWorkspaceId || !workspaceJson?.id || !indexJson?.id || !projectsRoot?.id) {
    return {
      status: "invalidWorkspace",
      diagnostics: [
        "Driveワークスペースmetadataの必須IDを確認できませんでした。",
      ],
    };
  }

  return {
    status: "metadataVerified",
    diagnostics: [
      "workspace root folder / workspace.json / index.json / projects/ のmetadata確認が完了しました。",
    ],
    workspaceId: rootWorkspaceId,
    workspaceRootFolderId: rootCandidate.id,
    workspaceJsonFileId: workspaceJson.id,
    indexJsonFileId: indexJson.id,
    projectsRootFolderId: projectsRoot.id,
  };
}

export function validateWorkspaceJsonBodies(input: {
  expectedWorkspaceId: string;
  workspaceJsonText: string;
  indexJsonText: string;
}): DriveJsonBodyValidationResult {
  const sizeDiagnostics = validateFetchedTextSizes(input);

  if (sizeDiagnostics.length > 0) {
    return {
      status: "invalidWorkspace",
      diagnostics: sizeDiagnostics,
    };
  }

  const workspaceJsonResult = validateWorkspaceJsonBody(input.workspaceJsonText);
  const indexJsonResult = validateIndexJsonBody(input.indexJsonText);

  if (
    workspaceJsonResult.status === "invalid" ||
    indexJsonResult.status === "invalid"
  ) {
    return {
      status: "invalidWorkspace",
      diagnostics: [
        ...getJsonDiagnostics(workspaceJsonResult),
        ...getJsonDiagnostics(indexJsonResult),
      ],
    };
  }

  if (
    workspaceJsonResult.status === "unsupportedVersion" ||
    indexJsonResult.status === "unsupportedVersion"
  ) {
    return {
      status: "unsupportedVersion",
      diagnostics: [
        ...getJsonDiagnostics(workspaceJsonResult),
        ...getJsonDiagnostics(indexJsonResult),
      ],
    };
  }

  if (
    workspaceJsonResult.status !== "valid" ||
    indexJsonResult.status !== "valid"
  ) {
    return {
      status: "invalidWorkspace",
      diagnostics: ["JSON本文検証の結果を判定できませんでした。"],
    };
  }

  const workspaceIds = [
    input.expectedWorkspaceId,
    workspaceJsonResult.workspaceId,
    indexJsonResult.workspaceId,
  ];

  if (hasWorkspaceIdMismatch(workspaceIds)) {
    return {
      status: "invalidWorkspace",
      diagnostics: [
        "metadata / workspace.json / index.json の workspaceId が一致していません。",
      ],
    };
  }

  return {
    status: "ready",
    diagnostics: [
      ...workspaceJsonResult.diagnostics,
      ...indexJsonResult.diagnostics,
      "DriveワークスペースのmetadataとJSON本文の整合確認が完了しました。",
    ],
  };
}

export function validateIndexJsonProjects(
  indexJsonText: string,
): DriveProjectIndexValidationResult {
  if (getUtf8ByteLength(indexJsonText) > JSON_FILE_SIZE_LIMIT_BYTES) {
    return {
      status: "invalid",
      diagnostics: [
        `index.json の本文が上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
      ],
    };
  }

  const parsed = parseJsonObject(indexJsonText, "index.json");

  if (parsed.status === "invalid") {
    return {
      status: "invalid",
      diagnostics: parsed.diagnostics,
    };
  }

  if (!hasOwnKey(parsed.value, "projects")) {
    return {
      status: "invalid",
      diagnostics: ["index.json の projects がありません。"],
    };
  }

  const projects = parsed.value.projects;

  if (!Array.isArray(projects)) {
    return {
      status: "invalid",
      diagnostics: ["index.json の projects は配列である必要があります。"],
    };
  }

  if (projects.length === 0) {
    return {
      status: "notCreated",
      diagnostics: ["index.json.projects は空です。"],
    };
  }

  const projectSummaries: DriveProjectSummary[] = [];
  const seenProjectIds = new Set<string>();
  const diagnostics: string[] = [];

  projects.forEach((project, index) => {
    const projectResult = validateIndexProjectItem(project, index);

    if (projectResult.status === "invalid") {
      diagnostics.push(...projectResult.diagnostics);
      return;
    }

    if (seenProjectIds.has(projectResult.project.projectId)) {
      diagnostics.push(
        `index.json.projects[${index}] の projectId が重複しています。`,
      );
      return;
    }

    seenProjectIds.add(projectResult.project.projectId);
    projectSummaries.push(projectResult.project);
  });

  if (diagnostics.length > 0) {
    return {
      status: "invalid",
      diagnostics,
    };
  }

  return {
    status: "ready",
    projects: projectSummaries,
    diagnostics: [
      `index.json.projects は${projectSummaries.length}件です。`,
      "index.json上のプロジェクト登録一覧を確認しました。",
      "manifest.json と assets/ の詳細検証は別ステップで実行します。",
    ],
  };
}

export async function validateDriveProjectDetails(input: {
  accessToken: string;
  expectedWorkspaceId: string;
  expectedProjectsRootFolderId: string;
  project: DriveProjectSummary;
  signal: AbortSignal;
}): Promise<DriveProjectDetailsValidationResult> {
  const [projectRoot, manifest, assetsRoot, manifestJsonText] =
    await Promise.all([
      fetchDriveFileMetadata(
        input.accessToken,
        input.project.projectFolderId,
        input.signal,
      ),
      fetchDriveFileMetadata(
        input.accessToken,
        input.project.manifestFileId,
        input.signal,
      ),
      fetchDriveFileMetadata(
        input.accessToken,
        input.project.assetsFolderId,
        input.signal,
      ),
      readDriveTextFile(
        input.accessToken,
        input.project.manifestFileId,
        input.signal,
      ),
    ]);

  const diagnostics: string[] = [];

  validateProjectDriveFileMetadata({
    item: projectRoot,
    label: "project folder",
    expectedId: input.project.projectFolderId,
    expectedName: input.project.projectId,
    expectedMimeType: DRIVE_FOLDER_MIME_TYPE,
    expectedRole: "projectRoot",
    expectedWorkspaceId: input.expectedWorkspaceId,
    expectedProjectId: input.project.projectId,
    expectedParentId: input.expectedProjectsRootFolderId,
    diagnostics,
  });

  validateProjectDriveFileMetadata({
    item: manifest,
    label: "manifest.json",
    expectedId: input.project.manifestFileId,
    expectedName: PROJECT_MANIFEST_NAME,
    expectedMimeType: JSON_MIME_TYPE,
    expectedRole: "projectManifest",
    expectedWorkspaceId: input.expectedWorkspaceId,
    expectedProjectId: input.project.projectId,
    expectedParentId: input.project.projectFolderId,
    diagnostics,
  });

  validateProjectDriveFileMetadata({
    item: assetsRoot,
    label: "assets/ folder",
    expectedId: input.project.assetsFolderId,
    expectedName: PROJECT_ASSETS_ROOT_NAME,
    expectedMimeType: DRIVE_FOLDER_MIME_TYPE,
    expectedRole: "assetsRoot",
    expectedWorkspaceId: input.expectedWorkspaceId,
    expectedProjectId: input.project.projectId,
    expectedParentId: input.project.projectFolderId,
    diagnostics,
  });

  const manifestResult = parseDriveProjectManifestJson({
    manifestJsonText,
    expectedWorkspaceId: input.expectedWorkspaceId,
    project: input.project,
  });

  if (manifestResult.status === "invalid") {
    return {
      status: "invalid",
      diagnostics: [...diagnostics, ...manifestResult.diagnostics],
    };
  }

  if (diagnostics.length > 0) {
    return {
      status: "invalid",
      diagnostics,
    };
  }

  return {
    status: "ready",
    details: manifestResult.details,
    diagnostics: [
      "project folder / manifest.json / assets/ のmetadata確認が完了しました。",
      "manifest.json のJSON本文を確認しました。",
      ...manifestResult.diagnostics,
      "index.json の対象project登録とDrive上のproject詳細の整合確認が完了しました。",
    ],
  };
}

export async function createDriveProject(
  input: DriveProjectCreateInput,
): Promise<DriveProjectCreateResult> {
  const changedItems: DriveProjectChangedItem[] = [];
  const { readyContext } = input;
  const titleDiagnostics = validateDriveProjectTitle(input.title);

  if (titleDiagnostics.length > 0) {
    throw new DriveProjectCreateError({
      status: "notCreatable",
      projectId: null,
      possibleChangedItems: changedItems,
      diagnostics: titleDiagnostics,
    });
  }

  const initialIndexJsonText = await runProjectCreateStep({
    projectId: null,
    possibleChangedItems: changedItems,
    operation: () =>
      input.runStep((signal) =>
        readDriveTextFile(input.accessToken, readyContext.indexJsonFileId, signal),
      ),
    buildFailureDiagnostics: () => [
      "index.json の初回再読込に失敗しました。",
      "プロジェクト作成は開始していません。",
    ],
  });

  const initialIndexResult = parseProjectCreatableIndexJson({
    indexJsonText: initialIndexJsonText,
    expectedWorkspaceId: readyContext.workspaceId,
  });

  if (initialIndexResult.status !== "creatable") {
    throw new DriveProjectCreateError({
      status: initialIndexResult.status,
      projectId: null,
      possibleChangedItems: changedItems,
      diagnostics: initialIndexResult.diagnostics,
    });
  }

  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();

  const projectRoot = await runProjectCreateStep({
    projectId,
    possibleChangedItems: changedItems,
    operation: () =>
      input.runStep((signal) =>
        createProjectRootFolder({
          accessToken: input.accessToken,
          projectsRootFolderId: readyContext.projectsRootFolderId,
          workspaceId: readyContext.workspaceId,
          projectId,
          signal,
        }),
      ),
    buildFailureDiagnostics: (error) =>
      buildProjectCreateStepFailureDiagnostics({
        stepLabel: "project folder 作成",
        error,
      }),
  });

  changedItems.push({
    role: "projectRoot",
    id: projectRoot.id,
    name: projectRoot.name,
  });

  const manifest = await runProjectCreateStep({
    projectId,
    possibleChangedItems: changedItems,
    operation: () =>
      input.runStep((signal) =>
        createProjectManifestJsonFile({
          accessToken: input.accessToken,
          projectRootFolderId: projectRoot.id,
          workspaceId: readyContext.workspaceId,
          projectId,
          title: input.title,
          now,
          signal,
        }),
      ),
    buildFailureDiagnostics: (error) =>
      buildProjectCreateStepFailureDiagnostics({
        stepLabel: "manifest.json 作成",
        error,
      }),
  });

  changedItems.push({
    role: "projectManifest",
    id: manifest.id,
    name: manifest.name,
  });

  const assetsRoot = await runProjectCreateStep({
    projectId,
    possibleChangedItems: changedItems,
    operation: () =>
      input.runStep((signal) =>
        createProjectAssetsFolder({
          accessToken: input.accessToken,
          projectRootFolderId: projectRoot.id,
          workspaceId: readyContext.workspaceId,
          projectId,
          signal,
        }),
      ),
    buildFailureDiagnostics: (error) =>
      buildProjectCreateStepFailureDiagnostics({
        stepLabel: "assets folder 作成",
        error,
      }),
  });

  changedItems.push({
    role: "assetsRoot",
    id: assetsRoot.id,
    name: assetsRoot.name,
  });

  const preUpdateIndexJsonText = await runProjectCreateStep({
    projectId,
    possibleChangedItems: changedItems,
    operation: () =>
      input.runStep((signal) =>
        readDriveTextFile(input.accessToken, readyContext.indexJsonFileId, signal),
      ),
    buildFailureDiagnostics: () => [
      "index.json 更新直前の再読込に失敗しました。",
      "project folder / manifest.json / assets/ がDrive上に残っている可能性があります。",
      "自動削除・自動修復は行いません。",
    ],
  });

  const preUpdateIndexResult = parseProjectCreatableIndexJson({
    indexJsonText: preUpdateIndexJsonText,
    expectedWorkspaceId: readyContext.workspaceId,
  });

  if (preUpdateIndexResult.status !== "creatable") {
    throw new DriveProjectCreateError({
      status: preUpdateIndexResult.status,
      projectId,
      possibleChangedItems: changedItems,
      diagnostics: [
        ...preUpdateIndexResult.diagnostics,
        "index.json 更新直前に作成可能状態ではないことを確認したため、index.json への登録は行いませんでした。",
        "project folder / manifest.json / assets/ がDrive上に残っている可能性があります。",
        "自動削除・自動修復は行いません。",
      ],
    });
  }

  const expectedProject: DriveProjectSummary = {
    projectId,
    title: input.title,
    projectFolderId: projectRoot.id,
    manifestFileId: manifest.id,
    assetsFolderId: assetsRoot.id,
    manifestPath: `projects/${projectId}/manifest.json`,
    createdAt: now,
    updatedAt: now,
  };

  const nextIndexJsonText = await runProjectCreateStep({
    projectId,
    possibleChangedItems: changedItems,
    operation: () =>
      Promise.resolve(
        buildIndexJsonWithCreatedProject({
          workspaceId: readyContext.workspaceId,
          indexCreatedAt: preUpdateIndexResult.index.createdAt,
          indexUpdatedAt: now,
          existingProjects: preUpdateIndexResult.index.projects,
          project: expectedProject,
        }),
      ),
    buildFailureDiagnostics: () => [
      "index.json の更新本文生成に失敗しました。",
      "project folder / manifest.json / assets/ がDrive上に残っている可能性があります。",
      "index.json は更新していません。",
      "自動削除・自動修復は行いません。",
    ],
  });

  await runProjectCreateStep({
    projectId,
    possibleChangedItems: changedItems,
    operation: () =>
      input.runStep((signal) =>
        updateDriveTextFileContent({
          accessToken: input.accessToken,
          fileId: readyContext.indexJsonFileId,
          text: nextIndexJsonText,
          mimeType: JSON_MIME_TYPE,
          signal,
        }),
      ),
    buildFailureDiagnostics: (error) =>
      buildProjectCreateStepFailureDiagnostics({
        stepLabel: "index.json 本文更新",
        error,
      }),
  });

  changedItems.push({
    role: "index",
    id: readyContext.indexJsonFileId,
    name: INDEX_JSON_NAME,
  });

  const updatedIndexJsonText = await runProjectCreateStep({
    projectId,
    possibleChangedItems: changedItems,
    operation: () =>
      input.runStep((signal) =>
        readDriveTextFile(input.accessToken, readyContext.indexJsonFileId, signal),
      ),
    buildFailureDiagnostics: () => [
      "index.json 更新後の再読込に失敗しました。",
      "index.json は変更済みの可能性があります。",
      "自動削除・自動修復は行いません。",
    ],
  });

  const registrationResult = validateCreatedProjectRegistration({
    indexJsonText: updatedIndexJsonText,
    expectedProject,
  });

  if (registrationResult.status === "invalid") {
    throw new DriveProjectCreateError({
      status: "invalidWorkspace",
      projectId,
      possibleChangedItems: changedItems,
      diagnostics: [
        ...registrationResult.diagnostics,
        "index.json は変更済みの可能性があります。",
        "自動削除・自動修復は行いません。",
      ],
    });
  }

  const detailResult = await runProjectCreateStep({
    projectId,
    possibleChangedItems: changedItems,
    operation: () =>
      input.runStep((signal) =>
        validateDriveProjectDetails({
          accessToken: input.accessToken,
          expectedWorkspaceId: readyContext.workspaceId,
          expectedProjectsRootFolderId: readyContext.projectsRootFolderId,
          project: registrationResult.project,
          signal,
        }),
      ),
    buildFailureDiagnostics: (error) =>
      buildProjectCreateStepFailureDiagnostics({
        stepLabel: "作成したproject詳細の検証",
        error,
      }),
  });

  if (detailResult.status === "invalid") {
    throw new DriveProjectCreateError({
      status: "invalidWorkspace",
      projectId,
      possibleChangedItems: changedItems,
      diagnostics: [
        ...detailResult.diagnostics,
        "作成後のproject詳細検証で問題を検出しました。",
        "自動削除・自動修復は行いません。",
      ],
    });
  }

  return {
    project: registrationResult.project,
    details: detailResult.details,
    indexJsonText: updatedIndexJsonText,
    diagnostics: [
      ...initialIndexResult.diagnostics,
      "project folder / manifest.json / assets/ を作成しました。",
      ...preUpdateIndexResult.diagnostics,
      "index.json を更新しました。",
      ...registrationResult.diagnostics,
      ...detailResult.diagnostics,
    ],
  };
}

async function runProjectCreateStep<T>(input: {
  projectId: string | null;
  possibleChangedItems: DriveProjectChangedItem[];
  operation: () => Promise<T>;
  buildFailureDiagnostics: (error: unknown) => string[];
}): Promise<T> {
  try {
    return await input.operation();
  } catch (error) {
    throw new DriveProjectCreateError({
      status: toProjectCreateFailureStatus(error),
      projectId: input.projectId,
      possibleChangedItems: input.possibleChangedItems,
      diagnostics: input.buildFailureDiagnostics(error),
      cause: error,
    });
  }
}

function toProjectCreateFailureStatus(
  error: unknown,
): DriveProjectCreateFailureStatus {
  if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
    return "authRequired";
  }

  return "operationFailed";
}

function buildProjectCreateStepFailureDiagnostics(input: {
  stepLabel: string;
  error: unknown;
}) {
  const diagnostics = [`${input.stepLabel}に失敗しました。`];

  if (input.error instanceof DriveApiError && [401, 403].includes(input.error.status)) {
    diagnostics.push("Google Drive APIの認証に失敗しました。Googleへ再接続してください。");
    return diagnostics;
  }

  diagnostics.push("Drive側で処理が完了している可能性があります。");
  diagnostics.push("自動削除・自動修復は行いません。");
  return diagnostics;
}

async function createProjectRootFolder(input: {
  accessToken: string;
  projectsRootFolderId: string;
  workspaceId: string;
  projectId: string;
  signal: AbortSignal;
}): Promise<DriveFileCandidate> {
  const appProperties = buildProjectAppProperties({
    role: "projectRoot",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });

  return createProjectMetadataOnlyFile({
    accessToken: input.accessToken,
    metadata: {
      name: input.projectId,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [input.projectsRootFolderId],
      appProperties,
    },
    expectedAppProperties: appProperties,
    fields: CREATE_FOLDER_FIELDS,
    signal: input.signal,
  });
}

async function createProjectManifestJsonFile(input: {
  accessToken: string;
  projectRootFolderId: string;
  workspaceId: string;
  projectId: string;
  title: string;
  now: string;
  signal: AbortSignal;
}): Promise<DriveFileCandidate> {
  const appProperties = buildProjectAppProperties({
    role: "projectManifest",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });

  return createProjectMultipartJsonFile({
    accessToken: input.accessToken,
    metadata: {
      name: PROJECT_MANIFEST_NAME,
      mimeType: JSON_MIME_TYPE,
      parents: [input.projectRootFolderId],
      appProperties,
    },
    expectedAppProperties: appProperties,
    jsonText: buildProjectManifestJsonText({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      title: input.title,
      now: input.now,
    }),
    fields: CREATE_JSON_FIELDS,
    signal: input.signal,
  });
}

async function createProjectAssetsFolder(input: {
  accessToken: string;
  projectRootFolderId: string;
  workspaceId: string;
  projectId: string;
  signal: AbortSignal;
}): Promise<DriveFileCandidate> {
  const appProperties = buildProjectAppProperties({
    role: "assetsRoot",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });

  return createProjectMetadataOnlyFile({
    accessToken: input.accessToken,
    metadata: {
      name: PROJECT_ASSETS_ROOT_NAME,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [input.projectRootFolderId],
      appProperties,
    },
    expectedAppProperties: appProperties,
    fields: CREATE_FOLDER_FIELDS,
    signal: input.signal,
  });
}

async function createProjectMetadataOnlyFile(input: {
  accessToken: string;
  metadata: DriveCreateMetadata;
  expectedAppProperties: Record<string, string>;
  fields: string;
  signal: AbortSignal;
}): Promise<DriveFileCandidate> {
  const params = new URLSearchParams({
    fields: input.fields,
  });

  const response = await fetch(`${DRIVE_API_FILES_URL}?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(input.metadata),
    signal: input.signal,
  });

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  return validateCreatedProjectDriveFileResponse({
    responseBody: (await response.json()) as unknown,
    expectedName: input.metadata.name,
    expectedMimeType: input.metadata.mimeType,
    expectedAppProperties: input.expectedAppProperties,
  });
}

async function createProjectMultipartJsonFile(input: {
  accessToken: string;
  metadata: DriveCreateMetadata;
  expectedAppProperties: Record<string, string>;
  jsonText: string;
  fields: string;
  signal: AbortSignal;
}): Promise<DriveFileCandidate> {
  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: input.fields,
  });
  const boundary = `-------ipad-slideshow-pwa-${crypto.randomUUID()}`;

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(input.metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    input.jsonText,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const response = await fetch(
    `${DRIVE_API_UPLOAD_FILES_URL}?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: input.signal,
    },
  );

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  return validateCreatedProjectDriveFileResponse({
    responseBody: (await response.json()) as unknown,
    expectedName: input.metadata.name,
    expectedMimeType: input.metadata.mimeType,
    expectedAppProperties: input.expectedAppProperties,
  });
}

async function updateDriveMultipartJsonFileContent(input: {
  accessToken: string;
  fileId: string;
  metadata: DriveCreateMetadata;
  expectedAppProperties: Record<string, string>;
  jsonText: string;
  fields: string;
  signal: AbortSignal;
}): Promise<DriveFileCandidate> {
  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: input.fields,
  });
  const boundary = `-------ipad-slideshow-pwa-${crypto.randomUUID()}`;

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(input.metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    input.jsonText,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const response = await fetch(
    `${DRIVE_API_UPLOAD_FILES_URL}/${encodeURIComponent(input.fileId)}?${params.toString()}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: input.signal,
    },
  );

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  return validateCreatedProjectDriveFileResponse({
    responseBody: (await response.json()) as unknown,
    expectedName: input.metadata.name,
    expectedMimeType: input.metadata.mimeType,
    expectedAppProperties: input.expectedAppProperties,
  });
}

async function updateDriveTextFileContent(input: {
  accessToken: string;
  fileId: string;
  text: string;
  mimeType: string;
  signal: AbortSignal;
}) {
  const params = new URLSearchParams({
    uploadType: "media",
  });

  const response = await fetch(
    `${DRIVE_API_UPLOAD_FILES_URL}/${encodeURIComponent(input.fileId)}?${params.toString()}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": `${input.mimeType}; charset=UTF-8`,
      },
      body: input.text,
      signal: input.signal,
    },
  );

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }
}

function validateCreatedProjectDriveFileResponse(input: {
  responseBody: unknown;
  expectedName: string;
  expectedMimeType: string;
  expectedAppProperties: Record<string, string>;
}): DriveFileCandidate {
  const file = normalizeDriveFile(input.responseBody);

  if (!file) {
    throw new Error("Drive project create response did not include required fields.");
  }

  const diagnostics: string[] = [];

  if (file.name !== input.expectedName) {
    diagnostics.push("Drive project create response name did not match requested metadata.");
  }

  if (file.mimeType !== input.expectedMimeType) {
    diagnostics.push("Drive project create response mimeType did not match requested metadata.");
  }

  for (const [key, expectedValue] of Object.entries(input.expectedAppProperties)) {
    if (file.appProperties[key] !== expectedValue) {
      diagnostics.push(`Drive project create response appProperties.${key} did not match requested metadata.`);
    }
  }

  if (diagnostics.length > 0) {
    throw new Error(diagnostics.join(" "));
  }

  return file;
}

function parseProjectCreatableIndexJson(input: {
  indexJsonText: string;
  expectedWorkspaceId: string;
}): ProjectCreatableIndexJsonParseResult {
  if (getUtf8ByteLength(input.indexJsonText) > JSON_FILE_SIZE_LIMIT_BYTES) {
    return {
      status: "invalidWorkspace",
      diagnostics: [
        `index.json の本文が上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
      ],
    };
  }

  const parsed = parseJsonObject(input.indexJsonText, "index.json");

  if (parsed.status === "invalid") {
    return {
      status: "invalidWorkspace",
      diagnostics: parsed.diagnostics,
    };
  }

  const indexJsonResult = validateIndexJsonBody(input.indexJsonText);

  if (indexJsonResult.status !== "valid") {
    return {
      status: "invalidWorkspace",
      diagnostics: getJsonDiagnostics(indexJsonResult),
    };
  }

  if (indexJsonResult.workspaceId !== input.expectedWorkspaceId) {
    return {
      status: "invalidWorkspace",
      diagnostics: ["index.json の workspaceId が readyContext と一致していません。"],
    };
  }

  const diagnostics: string[] = [];
  const createdAt = readRequiredIsoDateString({
    body: parsed.value,
    fileLabel: "index.json",
    key: "createdAt",
    diagnostics,
  });

  if (!createdAt || diagnostics.length > 0) {
    return {
      status: "invalidWorkspace",
      diagnostics,
    };
  }

  const projects = parsed.value.projects;

  if (!Array.isArray(projects)) {
    return {
      status: "invalidWorkspace",
      diagnostics: ["index.json の projects は配列である必要があります。"],
    };
  }

  if (projects.length === 0) {
    return {
      status: "creatable",
      index: {
        createdAt,
        projects: [],
      },
      diagnostics: [
        "index.json を再読込し、プロジェクト未作成であることを確認しました。",
      ],
    };
  }

  const projectValidation = validateIndexJsonProjects(input.indexJsonText);

  if (projectValidation.status === "ready") {
    return {
      status: "creatable",
      index: {
        createdAt,
        projects: projectValidation.projects,
      },
      diagnostics: [
        `index.json を再読込し、既存project ${projectValidation.projects.length}件を保持して追加作成できることを確認しました。`,
      ],
    };
  }

  return {
    status: "invalidWorkspace",
    diagnostics: projectValidation.diagnostics,
  };
}

function validateCreatedProjectRegistration(input: {
  indexJsonText: string;
  expectedProject: DriveProjectSummary;
}): DriveCreatedProjectRegistrationValidationResult {
  const result = validateIndexJsonProjects(input.indexJsonText);

  if (result.status !== "ready") {
    return {
      status: "invalid",
      diagnostics:
        result.status === "invalid"
          ? result.diagnostics
          : ["index.json 更新後にプロジェクト登録を確認できませんでした。"],
    };
  }

  const diagnostics: string[] = [];
  const project = result.projects.find(
    (candidate) => candidate.projectId === input.expectedProject.projectId,
  );

  if (!project) {
    return {
      status: "invalid",
      diagnostics: [
        `index.json 更新後に projectId ${input.expectedProject.projectId} の登録を確認できませんでした。`,
      ],
    };
  }

  validateExpectedProjectValue({
    diagnostics,
    label: "projectId",
    actual: project.projectId,
    expected: input.expectedProject.projectId,
  });
  validateExpectedProjectValue({
    diagnostics,
    label: "title",
    actual: project.title,
    expected: input.expectedProject.title,
  });
  validateExpectedProjectValue({
    diagnostics,
    label: "projectFolderId",
    actual: project.projectFolderId,
    expected: input.expectedProject.projectFolderId,
  });
  validateExpectedProjectValue({
    diagnostics,
    label: "manifestFileId",
    actual: project.manifestFileId,
    expected: input.expectedProject.manifestFileId,
  });
  validateExpectedProjectValue({
    diagnostics,
    label: "assetsFolderId",
    actual: project.assetsFolderId,
    expected: input.expectedProject.assetsFolderId,
  });
  validateExpectedProjectValue({
    diagnostics,
    label: "manifestPath",
    actual: project.manifestPath,
    expected: input.expectedProject.manifestPath,
  });
  validateExpectedProjectValue({
    diagnostics,
    label: "createdAt",
    actual: project.createdAt,
    expected: input.expectedProject.createdAt,
  });
  validateExpectedProjectValue({
    diagnostics,
    label: "updatedAt",
    actual: project.updatedAt,
    expected: input.expectedProject.updatedAt,
  });

  if (diagnostics.length > 0) {
    return {
      status: "invalid",
      diagnostics,
    };
  }

  return {
    status: "valid",
    project,
    diagnostics: [
      "index.json 更新後に再読込し、作成したプロジェクト登録を確認しました。",
    ],
  };
}

function validateExpectedProjectValue(input: {
  diagnostics: string[];
  label: string;
  actual: string;
  expected: string;
}) {
  if (input.actual !== input.expected) {
    input.diagnostics.push(
      `index.json.projects の ${input.label} が対象projectの想定値と一致していません。`,
    );
  }
}

function validateProjectDriveFileMetadata(input: {
  item: DriveFileCandidate;
  label: string;
  expectedId: string;
  expectedName: string;
  expectedMimeType: string;
  expectedRole: Exclude<DriveProjectChangedItemRole, "index">;
  expectedWorkspaceId: string;
  expectedProjectId: string;
  expectedParentId: string;
  diagnostics: string[];
}) {
  if (input.item.id !== input.expectedId) {
    input.diagnostics.push(`${input.label} のDrive fileIdが想定と一致していません。`);
  }

  if (input.item.name !== input.expectedName) {
    input.diagnostics.push(`${input.label} の名前が想定と一致していません。`);
  }

  if (input.item.mimeType !== input.expectedMimeType) {
    input.diagnostics.push(`${input.label} のMIME typeが想定と一致していません。`);
  }

  validateProjectParentId({
    item: input.item,
    label: input.label,
    expectedParentId: input.expectedParentId,
    diagnostics: input.diagnostics,
  });

  const { appProperties } = input.item;

  if (appProperties.app !== DRIVE_WORKSPACE_APP_ID) {
    input.diagnostics.push(`${input.label} のappProperties.appが不正です。`);
  }

  if (appProperties.role !== input.expectedRole) {
    input.diagnostics.push(`${input.label} のappProperties.roleが不正です。`);
  }

  if (appProperties.schemaVersion !== DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY) {
    input.diagnostics.push(
      `${input.label} のappProperties.schemaVersionが不正です。`,
    );
  }

  validateProjectMetadataUuidValue({
    label: input.label,
    key: "workspaceId",
    actual: appProperties.workspaceId,
    expected: input.expectedWorkspaceId,
    diagnostics: input.diagnostics,
  });

  validateProjectMetadataUuidValue({
    label: input.label,
    key: "projectId",
    actual: appProperties.projectId,
    expected: input.expectedProjectId,
    diagnostics: input.diagnostics,
  });

  if (
    input.expectedMimeType === JSON_MIME_TYPE &&
    typeof input.item.sizeBytes === "number" &&
    input.item.sizeBytes > JSON_FILE_SIZE_LIMIT_BYTES
  ) {
    input.diagnostics.push(
      `${input.label} のsizeが上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
    );
  }
}

function validateProjectParentId(input: {
  item: DriveFileCandidate;
  label: string;
  expectedParentId: string;
  diagnostics: string[];
}) {
  if (!input.item.parents) {
    input.diagnostics.push(`${input.label} の親folderを取得できませんでした。`);
    return;
  }

  if (!input.item.parents.includes(input.expectedParentId)) {
    input.diagnostics.push(`${input.label} の親folderが想定と一致していません。`);
  }
}

function validateProjectMetadataUuidValue(input: {
  label: string;
  key: "workspaceId" | "projectId";
  actual: string | undefined;
  expected: string;
  diagnostics: string[];
}) {
  if (!isNonEmptyString(input.actual)) {
    input.diagnostics.push(`${input.label} のappProperties.${input.key}が未設定です。`);
    return;
  }

  if (!isUuidV4(input.actual)) {
    input.diagnostics.push(
      `${input.label} のappProperties.${input.key}がUUID形式ではありません。`,
    );
    return;
  }

  if (input.actual !== input.expected) {
    input.diagnostics.push(
      `${input.label} のappProperties.${input.key}が想定と一致していません。`,
    );
  }
}

function validateProjectManifestSlidesArray(
  body: Record<string, unknown>,
  diagnostics: string[],
) {
  if (!hasOwnKey(body, "slides")) {
    diagnostics.push("manifest.json の slides がありません。");
    return;
  }

  if (!Array.isArray(body.slides)) {
    diagnostics.push("manifest.json の slides は配列である必要があります。");
    return;
  }

  if (body.slides.length > DRIVE_PROJECT_MAX_SLIDE_COUNT) {
    diagnostics.push(
      `manifest.json の slides が上限 ${DRIVE_PROJECT_MAX_SLIDE_COUNT} 件を超えています。`,
    );
  }
}

function validateExpectedProjectManifestValue(input: {
  diagnostics: string[];
  label: string;
  actual: string | undefined;
  expected: string;
}) {
  if (input.actual && input.actual !== input.expected) {
    input.diagnostics.push(
      `manifest.json の ${input.label} が index.json の対象project登録と一致していません。`,
    );
  }
}


function validateDriveProjectManifestAppendInput(
  input: DriveProjectManifestAppendInput,
) {
  const diagnostics: string[] = [];

  if (!input.accessToken) {
    diagnostics.push("manifest反映用のaccessTokenがありません。");
  }

  if (!isUuidV4(input.workspaceId)) {
    diagnostics.push("manifest反映対象のworkspaceIdがUUID形式ではありません。");
  }

  if (!isNonEmptyString(input.indexJsonFileId)) {
    diagnostics.push("manifest反映対象のindexJsonFileIdが空です。");
  }

  if (!isUuidV4(input.project.projectId)) {
    diagnostics.push("manifest反映対象のprojectIdがUUID形式ではありません。");
  }

  if (!isUuidV4(input.savedAsset.assetId)) {
    diagnostics.push("manifest反映対象のassetIdがUUID形式ではありません。");
  }

  if (!isNonEmptyString(input.savedAsset.assetFileId)) {
    diagnostics.push("manifest反映対象のassetFileIdが空です。");
  }

  if (!isNonEmptyString(input.source.sourceMimeType)) {
    diagnostics.push("manifest反映対象のsourceMimeTypeが空です。");
  }

  if (!isNonEmptyString(input.source.sourceMediaItemId)) {
    diagnostics.push("manifest反映対象のsourceMediaItemIdが空です。");
  }

  if (
    input.source.sourceCreateTime !== null &&
    !isRfc3339UtcTimestamp(input.source.sourceCreateTime)
  ) {
    diagnostics.push("manifest反映対象のsourceCreateTimeがRFC3339 UTC形式ではありません。");
  }

  return diagnostics;
}

function validateDriveProjectManifestBatchAppendInput(
  input: DriveProjectManifestBatchAppendInput,
) {
  const diagnostics: string[] = [];

  if (input.savedAssets.length === 0) {
    diagnostics.push("batch manifest反映対象のsavedAssetsが空です。");
  }

  for (const [index, item] of input.savedAssets.entries()) {
    diagnostics.push(
      ...validateDriveProjectManifestAppendInput({
        accessToken: input.accessToken,
        workspaceId: input.workspaceId,
        indexJsonFileId: input.indexJsonFileId,
        project: input.project,
        savedAsset: item.savedAsset,
        source: item.source,
        signal: input.signal,
      }).map((diagnostic) => `savedAssets[${index}]: ${diagnostic}`),
    );
  }

  const assetIds = input.savedAssets.map((item) => item.savedAsset.assetId);
  if (new Set(assetIds).size !== assetIds.length) {
    diagnostics.push("batch manifest反映対象のassetIdが重複しています。");
  }

  return diagnostics;
}

function validateDriveProjectSlideReorderInput(
  input: DriveProjectSlideReorderInput,
) {
  const diagnostics: string[] = [];

  if (!input.accessToken) {
    diagnostics.push("slide順変更用のaccessTokenがありません。");
  }

  if (!isUuidV4(input.workspaceId)) {
    diagnostics.push("slide順変更対象のworkspaceIdがUUID形式ではありません。");
  }

  if (!isNonEmptyString(input.indexJsonFileId)) {
    diagnostics.push("slide順変更対象のindexJsonFileIdが空です。");
  }

  if (!isUuidV4(input.project.projectId)) {
    diagnostics.push("slide順変更対象のprojectIdがUUID形式ではありません。");
  }

  if (!isNonEmptyString(input.project.manifestFileId)) {
    diagnostics.push("slide順変更対象のmanifestFileIdが空です。");
  }

  if (!Array.isArray(input.orderedSlideIds)) {
    diagnostics.push("slide順変更対象のorderedSlideIdsは配列である必要があります。");
    return diagnostics;
  }

  for (const [index, slideId] of input.orderedSlideIds.entries()) {
    if (!isUuidV4(slideId)) {
      diagnostics.push(
        `slide順変更対象のorderedSlideIds[${index}]がUUID形式ではありません。`,
      );
    }
  }

  const uniqueSlideIds = new Set(input.orderedSlideIds);
  if (uniqueSlideIds.size !== input.orderedSlideIds.length) {
    diagnostics.push("slide順変更対象のorderedSlideIdsに重複があります。");
  }

  return diagnostics;
}

function validateDriveProjectSlideDeleteInput(input: DriveProjectSlideDeleteInput) {
  const diagnostics = validateDriveProjectSlideEditBaseInput({
    accessToken: input.accessToken,
    workspaceId: input.workspaceId,
    indexJsonFileId: input.indexJsonFileId,
    project: input.project,
    operationLabel: "slide削除",
  });

  if (!Array.isArray(input.slideIds) || input.slideIds.length === 0) {
    diagnostics.push("slide削除対象のslideIdsが空です。");
    return diagnostics;
  }

  for (const [index, slideId] of input.slideIds.entries()) {
    if (!isUuidV4(slideId)) {
      diagnostics.push(`slide削除対象のslideIds[${index}]がUUID形式ではありません。`);
    }
  }

  if (new Set(input.slideIds).size !== input.slideIds.length) {
    diagnostics.push("slide削除対象のslideIdsに重複があります。");
  }

  return diagnostics;
}

function validateDriveProjectSlideDuplicateInput(
  input: DriveProjectSlideDuplicateInput,
) {
  const diagnostics = validateDriveProjectSlideEditBaseInput({
    accessToken: input.accessToken,
    workspaceId: input.workspaceId,
    indexJsonFileId: input.indexJsonFileId,
    project: input.project,
    operationLabel: "slide複製",
  });

  if (!isUuidV4(input.slideId)) {
    diagnostics.push("slide複製対象のslideIdがUUID形式ではありません。");
  }

  return diagnostics;
}

function validateDriveProjectSlideEditBaseInput(input: {
  accessToken: string;
  workspaceId: string;
  indexJsonFileId: string;
  project: DriveProjectSummary;
  operationLabel: string;
}) {
  const diagnostics: string[] = [];

  if (!input.accessToken) {
    diagnostics.push(`${input.operationLabel}用のaccessTokenがありません。`);
  }

  if (!isUuidV4(input.workspaceId)) {
    diagnostics.push(`${input.operationLabel}対象のworkspaceIdがUUID形式ではありません。`);
  }

  if (!isNonEmptyString(input.indexJsonFileId)) {
    diagnostics.push(`${input.operationLabel}対象のindexJsonFileIdが空です。`);
  }

  if (!isUuidV4(input.project.projectId)) {
    diagnostics.push(`${input.operationLabel}対象のprojectIdがUUID形式ではありません。`);
  }

  if (!isNonEmptyString(input.project.manifestFileId)) {
    diagnostics.push(`${input.operationLabel}対象のmanifestFileIdが空です。`);
  }

  return diagnostics;
}

function validateDriveProjectSlideOrder(input: {
  slides: DriveSlideSummary[];
  orderedSlideIds: string[];
}) {
  const diagnostics: string[] = [];
  const currentSlideIds = input.slides.map((slide) => slide.slideId);
  const currentSlideIdSet = new Set(currentSlideIds);
  const orderedSlideIdSet = new Set(input.orderedSlideIds);

  if (currentSlideIds.length !== input.orderedSlideIds.length) {
    diagnostics.push("orderedSlideIdsの件数がmanifest.json.slidesの件数と一致していません。");
  }

  if (currentSlideIdSet.size !== currentSlideIds.length) {
    diagnostics.push("manifest.json.slides内のslideIdが重複しています。");
  }

  if (orderedSlideIdSet.size !== input.orderedSlideIds.length) {
    diagnostics.push("orderedSlideIds内のslideIdが重複しています。");
  }

  const missingSlideIds = currentSlideIds.filter(
    (slideId) => !orderedSlideIdSet.has(slideId),
  );
  const unknownSlideIds = input.orderedSlideIds.filter(
    (slideId) => !currentSlideIdSet.has(slideId),
  );

  if (missingSlideIds.length > 0) {
    diagnostics.push(
      `orderedSlideIdsに含まれない既存slideIdがあります: ${missingSlideIds.map(formatDriveIdPart).join(", ")}`,
    );
  }

  if (unknownSlideIds.length > 0) {
    diagnostics.push(
      `manifest.json.slidesに存在しないslideIdがorderedSlideIdsに含まれています: ${unknownSlideIds.map(formatDriveIdPart).join(", ")}`,
    );
  }

  return diagnostics;
}

function validateDriveProjectSlideIdsExist(input: {
  slides: DriveSlideSummary[];
  slideIds: string[];
}) {
  const currentSlideIdSet = new Set(input.slides.map((slide) => slide.slideId));
  const missingSlideIds = input.slideIds.filter(
    (slideId) => !currentSlideIdSet.has(slideId),
  );

  if (missingSlideIds.length === 0) {
    return [];
  }

  return [
    `manifest.json.slidesに存在しないslideIdが含まれています: ${missingSlideIds.map(formatDriveIdPart).join(", ")}`,
  ];
}

function buildDriveProjectManifestSlide(input: {
  savedAsset: DriveProjectSavedAsset;
  source: DriveProjectManifestAppendInput["source"];
  now: string;
}): DriveSlideSummary {
  const slide: DriveSlideSummary = {
    slideId: crypto.randomUUID(),
    assetId: input.savedAsset.assetId,
    assetFileId: input.savedAsset.assetFileId,
    assetName: input.source.filename ?? input.savedAsset.driveFilename,
    mimeType: input.savedAsset.driveMimeType,
    source: "googlePhotosPicker",
    sourceMimeType: input.source.sourceMimeType,
    sourceMediaItemId: input.source.sourceMediaItemId,
    durationSeconds: DRIVE_PROJECT_DEFAULT_SLIDE_DURATION_SECONDS,
    caption: "",
    createdAt: input.now,
    updatedAt: input.now,
  };

  if (input.source.sourceCreateTime) {
    slide.sourceCreateTime = input.source.sourceCreateTime;
  }

  return slide;
}

function parseDriveProjectManifestJson(input: {
  manifestJsonText: string;
  expectedWorkspaceId: string;
  project: DriveProjectSummary;
}): DriveProjectManifestParseResult {
  const diagnostics: string[] = [];

  if (getUtf8ByteLength(input.manifestJsonText) > JSON_FILE_SIZE_LIMIT_BYTES) {
    return {
      status: "invalid",
      diagnostics: [
        `manifest.json の本文が上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
      ],
    };
  }

  const parsed = parseJsonObject(input.manifestJsonText, "manifest.json");

  if (parsed.status === "invalid") {
    return parsed;
  }

  validateRequiredLiteral({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "app",
    expectedValue: DRIVE_WORKSPACE_APP_ID,
    diagnostics,
  });

  validateRequiredLiteral({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "role",
    expectedValue: "projectManifest",
    diagnostics,
  });

  const schemaInvalidDiagnostics: string[] = [];
  const schemaUnsupportedDiagnostics: string[] = [];

  validateSchemaVersion({
    body: parsed.value,
    fileLabel: "manifest.json",
    invalidDiagnostics: schemaInvalidDiagnostics,
    unsupportedVersionDiagnostics: schemaUnsupportedDiagnostics,
  });

  diagnostics.push(...schemaInvalidDiagnostics, ...schemaUnsupportedDiagnostics);

  const workspaceId = readRequiredUuidString({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "workspaceId",
    diagnostics,
  });
  const projectId = readRequiredUuidString({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "projectId",
    diagnostics,
  });
  const title = readRequiredNonEmptyString({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "title",
    diagnostics,
  });
  const createdAt = readRequiredIsoDateString({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "createdAt",
    diagnostics,
  });
  const updatedAt = readRequiredIsoDateString({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "updatedAt",
    diagnostics,
  });

  validateProjectManifestSlidesArray(parsed.value, diagnostics);

  const rawSlides = parsed.value.slides;
  const slides = Array.isArray(rawSlides)
    ? rawSlides
        .map((slide, index) =>
          normalizeDriveProjectManifestSlide(slide, index, diagnostics),
        )
        .filter((slide): slide is DriveSlideSummary => slide !== null)
    : [];

  validateExpectedProjectManifestValue({
    diagnostics,
    label: "workspaceId",
    actual: workspaceId,
    expected: input.expectedWorkspaceId,
  });
  validateExpectedProjectManifestValue({
    diagnostics,
    label: "projectId",
    actual: projectId,
    expected: input.project.projectId,
  });
  validateExpectedProjectManifestValue({
    diagnostics,
    label: "title",
    actual: title,
    expected: input.project.title,
  });
  validateExpectedProjectManifestValue({
    diagnostics,
    label: "createdAt",
    actual: createdAt,
    expected: input.project.createdAt,
  });
  validateExpectedProjectManifestValue({
    diagnostics,
    label: "updatedAt",
    actual: updatedAt,
    expected: input.project.updatedAt,
  });

  if (
    diagnostics.length > 0 ||
    !workspaceId ||
    !projectId ||
    !title ||
    !createdAt ||
    !updatedAt
  ) {
    return {
      status: "invalid",
      diagnostics,
    };
  }

  const manifest: DriveProjectManifestBody = {
    app: DRIVE_WORKSPACE_APP_ID,
    role: "projectManifest",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId,
    projectId,
    title,
    slides,
    createdAt,
    updatedAt,
  };

  return {
    status: "valid",
    manifest,
    details: {
      project: input.project,
      slides,
      slideCount: slides.length,
      assetCount: slides.length,
    },
    diagnostics: ["manifest.json のJSON本文を確認しました。"],
  };
}

function normalizeDriveProjectManifestSlide(
  value: unknown,
  index: number,
  diagnostics: string[],
): DriveSlideSummary | null {
  const fileLabel = `manifest.json.slides[${index}]`;
  const localDiagnostics: string[] = [];

  if (!isRecord(value)) {
    diagnostics.push(`${fileLabel} はJSON objectである必要があります。`);
    return null;
  }

  const slideId = readRequiredUuidString({
    body: value,
    fileLabel,
    key: "slideId",
    diagnostics: localDiagnostics,
  });
  const assetId = readRequiredUuidString({
    body: value,
    fileLabel,
    key: "assetId",
    diagnostics: localDiagnostics,
  });
  const assetFileId = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "assetFileId",
    diagnostics: localDiagnostics,
  });
  const assetName = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "assetName",
    diagnostics: localDiagnostics,
  });
  const rawMimeType = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "mimeType",
    diagnostics: localDiagnostics,
  });
  const assetType = readOptionalDriveAssetType({
    body: value,
    fileLabel,
    key: "type",
    diagnostics: localDiagnostics,
  });
  const normalizedAssetType = assetType ?? "image";
  const fileSize = readOptionalNonNegativeNumber({
    body: value,
    fileLabel,
    key: "fileSize",
    diagnostics: localDiagnostics,
  });
  const durationMs = readOptionalPositiveNumber({
    body: value,
    fileLabel,
    key: "durationMs",
    diagnostics: localDiagnostics,
  });
  const explicitUnsupportedReason = readOptionalDriveAssetUnsupportedReason({
    body: value,
    fileLabel,
    key: "unsupportedReason",
    diagnostics: localDiagnostics,
  });
  const mimeTypeUnsupportedReason = rawMimeType
    ? validateDriveManifestAssetMimeType({
        assetType: normalizedAssetType,
        mimeType: rawMimeType,
        fileLabel,
        diagnostics: localDiagnostics,
      })
    : undefined;
  const unsupportedReason = mimeTypeUnsupportedReason ?? explicitUnsupportedReason;
  const source = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "source",
    diagnostics: localDiagnostics,
  });
  const sourceMimeType = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "sourceMimeType",
    diagnostics: localDiagnostics,
  });
  const sourceMediaItemId = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "sourceMediaItemId",
    diagnostics: localDiagnostics,
  });
  const createdAt = readRequiredIsoDateString({
    body: value,
    fileLabel,
    key: "createdAt",
    diagnostics: localDiagnostics,
  });
  const updatedAt = readRequiredIsoDateString({
    body: value,
    fileLabel,
    key: "updatedAt",
    diagnostics: localDiagnostics,
  });

  if (source !== "googlePhotosPicker") {
    localDiagnostics.push(`${fileLabel} の source が想定と一致していません。`);
  }

  const durationSeconds = value.durationSeconds;

  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    localDiagnostics.push(`${fileLabel} の durationSeconds が不正です。`);
  }

  const caption = value.caption;

  if (typeof caption !== "string") {
    localDiagnostics.push(`${fileLabel} の caption はstringである必要があります。`);
  }

  const sourceCreateTime = readOptionalRfc3339UtcTimestamp({
    body: value,
    fileLabel,
    key: "sourceCreateTime",
    diagnostics: localDiagnostics,
  });

  diagnostics.push(...localDiagnostics);

  if (
    localDiagnostics.length > 0 ||
    !slideId ||
    !assetId ||
    !assetFileId ||
    !assetName ||
    !rawMimeType ||
    source !== "googlePhotosPicker" ||
    !sourceMimeType ||
    !sourceMediaItemId ||
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    typeof caption !== "string" ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    slideId,
    assetId,
    assetFileId,
    assetName,
    ...(assetType ? { type: assetType } : {}),
    mimeType: rawMimeType,
    source: "googlePhotosPicker",
    sourceMimeType,
    sourceMediaItemId,
    ...(sourceCreateTime ? { sourceCreateTime } : {}),
    ...(typeof fileSize === "number" ? { fileSize } : {}),
    ...(typeof durationMs === "number" ? { durationMs } : {}),
    ...(unsupportedReason ? { unsupportedReason } : {}),
    durationSeconds,
    caption,
    createdAt,
    updatedAt,
  };
}

function readOptionalRfc3339UtcTimestamp(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}) {
  if (!hasOwnKey(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (typeof value !== "string") {
    input.diagnostics.push(`${input.fileLabel} の ${input.key} はstringである必要があります。`);
    return undefined;
  }

  if (!isRfc3339UtcTimestamp(value)) {
    input.diagnostics.push(
      `${input.fileLabel} の ${input.key} はRFC3339 UTC形式である必要があります。`,
    );
    return undefined;
  }

  return value;
}

function buildProjectManifestJsonWithAppendedSlide(input: {
  manifest: DriveProjectManifestBody;
  slide: DriveSlideSummary;
  updatedAt: string;
}) {
  return buildProjectManifestJsonWithAppendedSlides({
    manifest: input.manifest,
    slides: [input.slide],
    updatedAt: input.updatedAt,
  });
}

function buildProjectManifestJsonWithAppendedSlides(input: {
  manifest: DriveProjectManifestBody;
  slides: DriveSlideSummary[];
  updatedAt: string;
}) {
  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "projectManifest",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.manifest.workspaceId,
    projectId: input.manifest.projectId,
    title: input.manifest.title,
    slides: [...input.manifest.slides, ...input.slides],
    createdAt: input.manifest.createdAt,
    updatedAt: input.updatedAt,
  });

  assertJsonTextSizeWithinLimit(text, "manifest.json");
  return text;
}

function buildProjectManifestJsonWithUpdatedSlideCaption(input: {
  manifest: DriveProjectManifestBody;
  slideId: string;
  caption: string;
  updatedAt: string;
}) {
  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "projectManifest",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.manifest.workspaceId,
    projectId: input.manifest.projectId,
    title: input.manifest.title,
    slides: input.manifest.slides.map((slide) =>
      slide.slideId === input.slideId
        ? {
            ...slide,
            caption: input.caption,
            updatedAt: input.updatedAt,
          }
        : slide,
    ),
    createdAt: input.manifest.createdAt,
    updatedAt: input.updatedAt,
  });

  assertJsonTextSizeWithinLimit(text, "manifest.json");
  return text;
}

function buildProjectManifestJsonWithReorderedSlides(input: {
  manifest: DriveProjectManifestBody;
  orderedSlideIds: string[];
  updatedAt: string;
}) {
  const slidesById = new Map(
    input.manifest.slides.map((slide) => [slide.slideId, slide]),
  );
  const reorderedSlides = input.orderedSlideIds.map((slideId) => {
    const slide = slidesById.get(slideId);

    if (!slide) {
      throw new Error("orderedSlideIds contained an unknown slideId.");
    }

    return slide;
  });
  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "projectManifest",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.manifest.workspaceId,
    projectId: input.manifest.projectId,
    title: input.manifest.title,
    slides: reorderedSlides,
    createdAt: input.manifest.createdAt,
    updatedAt: input.updatedAt,
  });

  assertJsonTextSizeWithinLimit(text, "manifest.json");
  return text;
}

function buildProjectManifestJsonWithDeletedSlides(input: {
  manifest: DriveProjectManifestBody;
  slideIds: string[];
  updatedAt: string;
}) {
  const slideIdSet = new Set(input.slideIds);
  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "projectManifest",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.manifest.workspaceId,
    projectId: input.manifest.projectId,
    title: input.manifest.title,
    slides: input.manifest.slides.filter((slide) => !slideIdSet.has(slide.slideId)),
    createdAt: input.manifest.createdAt,
    updatedAt: input.updatedAt,
  });

  assertJsonTextSizeWithinLimit(text, "manifest.json");
  return text;
}

function buildProjectManifestJsonWithDuplicatedSlide(input: {
  manifest: DriveProjectManifestBody;
  sourceSlideId: string;
  duplicatedSlide: DriveSlideSummary;
  updatedAt: string;
}) {
  const sourceIndex = input.manifest.slides.findIndex(
    (slide) => slide.slideId === input.sourceSlideId,
  );

  if (sourceIndex === -1) {
    throw new Error("sourceSlideId was not found in manifest slides.");
  }

  const slides = [...input.manifest.slides];
  slides.splice(sourceIndex + 1, 0, input.duplicatedSlide);

  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "projectManifest",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.manifest.workspaceId,
    projectId: input.manifest.projectId,
    title: input.manifest.title,
    slides,
    createdAt: input.manifest.createdAt,
    updatedAt: input.updatedAt,
  });

  assertJsonTextSizeWithinLimit(text, "manifest.json");
  return text;
}

function isDuplicatedSlideInsertedAfterSource(input: {
  slides: DriveSlideSummary[];
  sourceSlideId: string;
  duplicatedSlideId: string;
}) {
  const sourceIndex = input.slides.findIndex(
    (slide) => slide.slideId === input.sourceSlideId,
  );

  if (sourceIndex === -1 || sourceIndex >= input.slides.length - 1) {
    return false;
  }

  return input.slides[sourceIndex + 1]?.slideId === input.duplicatedSlideId;
}

function buildProjectManifestJsonWithUpdatedTitle(input: {
  manifest: DriveProjectManifestBody;
  title: string;
  updatedAt: string;
}) {
  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "projectManifest",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.manifest.workspaceId,
    projectId: input.manifest.projectId,
    title: input.title,
    slides: input.manifest.slides,
    createdAt: input.manifest.createdAt,
    updatedAt: input.updatedAt,
  });

  assertJsonTextSizeWithinLimit(text, "manifest.json");
  return text;
}

function buildIndexJsonWithUpdatedProject(input: {
  indexJsonText: string;
  expectedWorkspaceId: string;
  currentProject: DriveProjectSummary;
  nextProject: DriveProjectSummary;
  indexUpdatedAt: string;
}): DriveIndexJsonProjectUpdateResult {
  if (getUtf8ByteLength(input.indexJsonText) > JSON_FILE_SIZE_LIMIT_BYTES) {
    return {
      status: "invalid",
      diagnostics: [
        `index.json の本文が上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
      ],
    };
  }

  const parsed = parseJsonObject(input.indexJsonText, "index.json");

  if (parsed.status === "invalid") {
    return parsed;
  }

  const indexJsonResult = validateIndexJsonBody(input.indexJsonText);

  if (indexJsonResult.status !== "valid") {
    return {
      status: "invalid",
      diagnostics: getJsonDiagnostics(indexJsonResult),
    };
  }

  if (indexJsonResult.workspaceId !== input.expectedWorkspaceId) {
    return {
      status: "invalid",
      diagnostics: ["index.json の workspaceId が readyContext と一致していません。"],
    };
  }

  const projectValidation = validateCreatedProjectRegistration({
    indexJsonText: input.indexJsonText,
    expectedProject: input.currentProject,
  });

  if (projectValidation.status === "invalid") {
    return {
      status: "invalid",
      diagnostics: projectValidation.diagnostics,
    };
  }

  const diagnostics: string[] = [];
  const createdAt = readRequiredIsoDateString({
    body: parsed.value,
    fileLabel: "index.json",
    key: "createdAt",
    diagnostics,
  });

  if (!createdAt || diagnostics.length > 0) {
    return {
      status: "invalid",
      diagnostics,
    };
  }

  const projects = validateIndexJsonProjects(input.indexJsonText);

  if (projects.status !== "ready") {
    return {
      status: "invalid",
      diagnostics:
        projects.status === "invalid"
          ? projects.diagnostics
          : ["index.json の対象project一覧を確認できませんでした。"],
    };
  }

  const targetIndex = projects.projects.findIndex(
    (project) => project.projectId === input.currentProject.projectId,
  );

  if (targetIndex === -1) {
    return {
      status: "invalid",
      diagnostics: ["index.json の対象project登録を確認できませんでした。"],
    };
  }

  const updatedProjects = projects.projects.map((project, index) =>
    index === targetIndex ? input.nextProject : project,
  );

  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "index",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.expectedWorkspaceId,
    projects: updatedProjects,
    createdAt,
    updatedAt: input.indexUpdatedAt,
  });

  assertJsonTextSizeWithinLimit(text, "index.json");
  return {
    status: "valid",
    indexJsonText: text,
    diagnostics: ["index.json の対象project更新本文を作成しました。"],
  };
}

function toDriveProjectManifestAppendFailureStatus(
  error: unknown,
  changedItems: DriveProjectChangedItem[],
): DriveProjectManifestAppendFailureStatus {
  if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
    return "authRequired";
  }

  if (changedItems.some((item) => item.role === "index")) {
    return "verificationFailed";
  }

  if (changedItems.some((item) => item.role === "projectManifest")) {
    return "indexUpdateFailed";
  }

  return "manifestUpdateFailed";
}

function buildDriveProjectManifestAppendFailureDiagnostics(input: {
  error: unknown;
  changedItems: DriveProjectChangedItem[];
  savedAsset: DriveProjectSavedAsset;
}) {
  const diagnostics = [
    "manifest反映中にエラーが発生しました。",
    "Drive asset file は作成済みです。",
    `assetId: ${input.savedAsset.assetIdPart}`,
    `assetFileId: ${input.savedAsset.assetFileIdPart}`,
  ];

  if (input.error instanceof DriveApiError) {
    diagnostics.push(`Drive API status: ${input.error.status}`);
  }

  if (input.changedItems.length > 0) {
    diagnostics.push(
      "manifest.json または index.json が更新済みの可能性があります。",
    );
  } else {
    diagnostics.push("manifest.json の更新完了は確認できていません。");
  }

  diagnostics.push(
    "manifest反映は完了していません、または完了確認できていません。",
    "index.json updatedAt が未更新または不整合の可能性があります。",
    "自動削除・自動修復は行いません。",
  );

  return diagnostics;
}

function buildDriveProjectManifestBatchAppendFailureDiagnostics(input: {
  error: unknown;
  changedItems: DriveProjectChangedItem[];
  savedAssets: DriveProjectSavedAsset[];
}) {
  const diagnostics = [
    "batch manifest反映中にエラーが発生しました。",
    `Drive asset file は ${input.savedAssets.length} 件作成済みの可能性があります。`,
  ];

  if (input.error instanceof DriveApiError) {
    diagnostics.push(`Drive API status: ${input.error.status}`);
  }

  if (input.changedItems.length > 0) {
    diagnostics.push(
      "manifest.json または index.json が更新済みの可能性があります。",
    );
  } else {
    diagnostics.push("manifest.json の更新完了は確認できていません。");
  }

  diagnostics.push(
    "成功したDrive保存分とmanifest反映状態をDrive状態再確認で確認してください。",
    "自動削除・自動修復は行いません。",
  );

  return diagnostics;
}

function toDriveProjectTitleUpdateFailureStatus(
  error: unknown,
  changedItems: DriveProjectChangedItem[],
): DriveProjectTitleUpdateFailureStatus {
  if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
    return "authRequired";
  }

  if (changedItems.some((item) => item.role === "index")) {
    return "verificationFailed";
  }

  if (changedItems.some((item) => item.role === "projectManifest")) {
    return "indexUpdateFailed";
  }

  return "manifestUpdateFailed";
}

function toDriveProjectSlideCaptionUpdateFailureStatus(
  error: unknown,
  changedItems: DriveProjectChangedItem[],
): DriveProjectSlideCaptionUpdateFailureStatus {
  if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
    return "authRequired";
  }

  if (changedItems.some((item) => item.role === "index")) {
    return "verificationFailed";
  }

  if (changedItems.some((item) => item.role === "projectManifest")) {
    return "indexUpdateFailed";
  }

  return "manifestUpdateFailed";
}

function toDriveProjectSlideReorderFailureStatus(
  error: unknown,
  changedItems: DriveProjectChangedItem[],
): DriveProjectSlideReorderFailureStatus {
  if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
    return "authRequired";
  }

  if (changedItems.some((item) => item.role === "index")) {
    return "verificationFailed";
  }

  if (changedItems.some((item) => item.role === "projectManifest")) {
    return "indexUpdateFailed";
  }

  return "manifestUpdateFailed";
}

function toDriveProjectSlideDeleteFailureStatus(
  error: unknown,
  changedItems: DriveProjectChangedItem[],
): DriveProjectSlideDeleteFailureStatus {
  if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
    return "authRequired";
  }

  if (changedItems.some((item) => item.role === "index")) {
    return "verificationFailed";
  }

  if (changedItems.some((item) => item.role === "projectManifest")) {
    return "indexUpdateFailed";
  }

  return "manifestUpdateFailed";
}

function toDriveProjectSlideDuplicateFailureStatus(
  error: unknown,
  changedItems: DriveProjectChangedItem[],
): DriveProjectSlideDuplicateFailureStatus {
  if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
    return "authRequired";
  }

  if (changedItems.some((item) => item.role === "index")) {
    return "verificationFailed";
  }

  if (changedItems.some((item) => item.role === "projectManifest")) {
    return "indexUpdateFailed";
  }

  return "manifestUpdateFailed";
}

function buildDriveProjectTitleUpdateFailureDiagnostics(input: {
  error: unknown;
  changedItems: DriveProjectChangedItem[];
}) {
  const diagnostics = ["project title変更中にエラーが発生しました。"];

  if (input.error instanceof DriveApiError) {
    diagnostics.push(`Drive API status: ${input.error.status}`);
  }

  if (input.changedItems.some((item) => item.role === "index")) {
    diagnostics.push(
      "manifest.json / index.json は更新済みの可能性があります。",
      "更新後再検証は完了していません。",
    );
  } else if (input.changedItems.some((item) => item.role === "projectManifest")) {
    diagnostics.push(
      "manifest.json は更新済みの可能性があります。",
      "index.json は未更新、または更新完了を確認できていません。",
    );
  } else {
    diagnostics.push(
      "manifest.json / index.json の更新完了は確認できていません。",
    );
  }

  diagnostics.push("自動削除・自動修復は行いません。");
  return diagnostics;
}

function buildDriveProjectSlideCaptionUpdateFailureDiagnostics(input: {
  error: unknown;
  changedItems: DriveProjectChangedItem[];
}) {
  const diagnostics = ["slide caption変更中にエラーが発生しました。"];

  if (input.error instanceof DriveApiError) {
    diagnostics.push(`Drive API status: ${input.error.status}`);
  }

  if (input.changedItems.some((item) => item.role === "index")) {
    diagnostics.push(
      "manifest.json / index.json は更新済みの可能性があります。",
      "更新後再検証は完了していません。",
    );
  } else if (input.changedItems.some((item) => item.role === "projectManifest")) {
    diagnostics.push(
      "manifest.json は更新済みの可能性があります。",
      "index.json は未更新、または更新完了を確認できていません。",
    );
  } else {
    diagnostics.push(
      "manifest.json / index.json の更新完了は確認できていません。",
    );
  }

  diagnostics.push("自動削除・自動修復は行いません。");
  return diagnostics;
}

function buildDriveProjectSlideReorderFailureDiagnostics(input: {
  error: unknown;
  changedItems: DriveProjectChangedItem[];
}) {
  const diagnostics = ["slide順変更中にエラーが発生しました。"];

  if (input.error instanceof DriveApiError) {
    diagnostics.push(`Drive API status: ${input.error.status}`);
  }

  if (input.changedItems.some((item) => item.role === "index")) {
    diagnostics.push(
      "manifest.json / index.json は更新済みの可能性があります。",
      "更新後再検証は完了していません。",
    );
  } else if (input.changedItems.some((item) => item.role === "projectManifest")) {
    diagnostics.push(
      "manifest.json は更新済みの可能性があります。",
      "index.json は未更新、または更新完了を確認できていません。",
    );
  } else {
    diagnostics.push(
      "manifest.json / index.json の更新完了は確認できていません。",
    );
  }

  diagnostics.push(
    "asset fileの削除・移動は行っていません。",
    "自動削除・自動修復は行いません。",
  );
  return diagnostics;
}

function buildDriveProjectSlideDeleteFailureDiagnostics(input: {
  error: unknown;
  changedItems: DriveProjectChangedItem[];
}) {
  const diagnostics = ["slide削除中にエラーが発生しました。"];

  if (input.error instanceof DriveApiError) {
    diagnostics.push(`Drive API status: ${input.error.status}`);
  }

  appendSlideManifestMutationFailureDiagnostics(diagnostics, input.changedItems);
  diagnostics.push(
    "Drive assets/ の画像fileは削除していません。",
    "自動削除・自動修復は行いません。",
  );
  return diagnostics;
}

function buildDriveProjectSlideDuplicateFailureDiagnostics(input: {
  error: unknown;
  changedItems: DriveProjectChangedItem[];
}) {
  const diagnostics = ["slide複製中にエラーが発生しました。"];

  if (input.error instanceof DriveApiError) {
    diagnostics.push(`Drive API status: ${input.error.status}`);
  }

  appendSlideManifestMutationFailureDiagnostics(diagnostics, input.changedItems);
  diagnostics.push(
    "Drive asset fileはコピーしていません。",
    "自動削除・自動修復は行いません。",
  );
  return diagnostics;
}

function appendSlideManifestMutationFailureDiagnostics(
  diagnostics: string[],
  changedItems: DriveProjectChangedItem[],
) {
  if (changedItems.some((item) => item.role === "index")) {
    diagnostics.push(
      "manifest.json / index.json は更新済みの可能性があります。",
      "更新後再検証は完了していません。",
    );
  } else if (changedItems.some((item) => item.role === "projectManifest")) {
    diagnostics.push(
      "manifest.json は更新済みの可能性があります。",
      "index.json は未更新、または更新完了を確認できていません。",
    );
  } else {
    diagnostics.push(
      "manifest.json / index.json の更新完了は確認できていません。",
    );
  }
}

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function normalizeDriveProjectSlideCaption(value: string) {
  return value.trim();
}

export function validateDriveProjectSlideCaption(caption: string) {
  const diagnostics: string[] = [];

  if ([...caption].length > DRIVE_PROJECT_SLIDE_CAPTION_MAX_LENGTH) {
    diagnostics.push(
      `テロップは ${DRIVE_PROJECT_SLIDE_CAPTION_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }

  return diagnostics;
}

function validateDriveProjectUnusedAssetPreviewInput(input: {
  accessToken: string;
  workspaceId: string;
  project: DriveProjectSummary;
}) {
  const diagnostics: string[] = [];

  if (!input.accessToken) {
    diagnostics.push("未使用asset preview用のaccessTokenがありません。");
  }

  if (!isUuidV4(input.workspaceId)) {
    diagnostics.push("未使用asset preview対象のworkspaceIdがUUID形式ではありません。");
  }

  if (!isUuidV4(input.project.projectId)) {
    diagnostics.push("未使用asset preview対象のprojectIdがUUID形式ではありません。");
  }

  if (!isNonEmptyString(input.project.manifestFileId)) {
    diagnostics.push("未使用asset preview対象のmanifestFileIdが空です。");
  }

  if (!isNonEmptyString(input.project.assetsFolderId)) {
    diagnostics.push("未使用asset preview対象のassetsFolderIdが空です。");
  }

  return diagnostics;
}

function validateDriveProjectUnusedAssetDeletePreflightInput(input: {
  accessToken: string;
  workspaceId: string;
  project: DriveProjectSummary;
  assetFileIds: string[];
}) {
  const diagnostics: string[] = [];

  if (!input.accessToken) {
    diagnostics.push("未使用asset削除前preflight用のaccessTokenがありません。");
  }

  if (!isUuidV4(input.workspaceId)) {
    diagnostics.push("未使用asset削除前preflight対象のworkspaceIdがUUID形式ではありません。");
  }

  if (!isUuidV4(input.project.projectId)) {
    diagnostics.push("未使用asset削除前preflight対象のprojectIdがUUID形式ではありません。");
  }

  if (!isNonEmptyString(input.project.manifestFileId)) {
    diagnostics.push("未使用asset削除前preflight対象のmanifestFileIdが空です。");
  }

  if (!isNonEmptyString(input.project.assetsFolderId)) {
    diagnostics.push("未使用asset削除前preflight対象のassetsFolderIdが空です。");
  }

  if (input.assetFileIds.length === 0) {
    diagnostics.push("削除前preflight対象のassetFileIdが選択されていません。");
  }

  if (input.assetFileIds.length > DRIVE_PROJECT_UNUSED_ASSET_DELETE_PREFLIGHT_LIMIT) {
    diagnostics.push(
      `削除前preflight対象は${DRIVE_PROJECT_UNUSED_ASSET_DELETE_PREFLIGHT_LIMIT}件以内にしてください。`,
    );
  }

  if (
    input.assetFileIds.some((assetFileId) => !isNonEmptyString(assetFileId))
  ) {
    diagnostics.push("削除前preflight対象のassetFileIdに空の値が含まれています。");
  }

  return diagnostics;
}

async function fetchDriveFileMetadataForDeletePreflight(
  accessToken: string,
  fileId: string,
  signal: AbortSignal,
): Promise<DriveFileCandidate> {
  const params = new URLSearchParams({
    fields:
      "id,name,mimeType,createdTime,modifiedTime,appProperties,size,parents,trashed",
  });

  const response = await fetch(
    `${DRIVE_API_FILES_URL}/${encodeURIComponent(fileId)}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    },
  );

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  const file = normalizeDriveFile((await response.json()) as unknown);

  if (!file) {
    throw new Error("Drive file metadata response did not include required fields.");
  }

  return file;
}

function toDriveProjectUnusedAssetDeletePreflightAsset(input: {
  assetFileId: string;
  file: DriveFileCandidate | null;
  error: unknown;
  workspaceId: string;
  project: DriveProjectSummary;
  referenceSlideCount: number;
}): DriveProjectUnusedAssetDeletePreflightAsset {
  if (!input.file) {
    return {
      assetFileId: input.assetFileId,
      assetFileIdPart: formatDriveIdPart(input.assetFileId),
      assetId: null,
      assetIdPart: "未設定",
      assetName: "metadata取得なし",
      mimeType: null,
      sizeBytes: null,
      createdTime: null,
      modifiedTime: null,
      referenceSlideCount: input.referenceSlideCount,
      status: "blocked",
      blockedReasons:
        input.error instanceof DriveApiError && input.error.status === 404
          ? ["notFound"]
          : ["metadataMismatch"],
    };
  }

  const file = input.file;
  const appProperties = file.appProperties;
  const blockedReasons: DriveProjectUnusedAssetDeletePreflightBlockedReason[] = [];
  const assetId = isUuidV4(appProperties.assetId) ? appProperties.assetId : null;

  if (file.id !== input.assetFileId) {
    blockedReasons.push("metadataMismatch");
  }

  if (file.trashed === true) {
    blockedReasons.push("trashed");
  }

  if (!assetId) {
    blockedReasons.push("missingRequiredMetadata");
  }

  if (
    appProperties.app !== DRIVE_WORKSPACE_APP_ID ||
    appProperties.role !== "asset"
  ) {
    blockedReasons.push("notAppManagedAsset");
  }

  if (
    appProperties.workspaceId !== input.workspaceId ||
    appProperties.projectId !== input.project.projectId
  ) {
    blockedReasons.push("wrongProject");
  }

  if (!file.parents?.includes(input.project.assetsFolderId)) {
    blockedReasons.push("wrongParent");
  }

  if (!isDriveAssetMimeType(file.mimeType)) {
    blockedReasons.push("unsupportedMimeType");
  }

  if (input.referenceSlideCount > 0) {
    blockedReasons.push("stillReferenced");
  }

  return {
    assetFileId: file.id,
    assetFileIdPart: formatDriveIdPart(file.id),
    assetId,
    assetIdPart: assetId ? formatDriveIdPart(assetId) : "未設定",
    assetName: file.name,
    mimeType: file.mimeType,
    sizeBytes: typeof file.sizeBytes === "number" ? file.sizeBytes : null,
    createdTime: file.createdTime ?? null,
    modifiedTime: file.modifiedTime ?? null,
    referenceSlideCount: input.referenceSlideCount,
    status: blockedReasons.length > 0 ? "blocked" : "eligible",
    blockedReasons,
  };
}

function buildDriveProjectUnusedAssetDeletePreflightFailureDiagnostics(
  error: unknown,
) {
  const diagnostics = ["未使用asset削除前preflight中にエラーが発生しました。"];

  if (error instanceof DriveApiError) {
    diagnostics.push(`Drive API status: ${error.status}`);
  }

  diagnostics.push(
    "Drive file は削除していません。",
    "manifest.json / index.json は更新していません。",
  );

  return diagnostics;
}

async function listDriveProjectAssetFolderChildren(input: {
  accessToken: string;
  assetsFolderId: string;
  scanLimit: number;
  signal: AbortSignal;
}): Promise<DriveFileCandidate[]> {
  const files: DriveFileCandidate[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      corpora: "user",
      spaces: "drive",
      pageSize: "100",
      fields:
        "nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,appProperties,size,parents)",
      q: [
        `'${escapeDriveQueryValue(input.assetsFolderId)}' in parents`,
        "trashed = false",
      ].join(" and "),
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `${DRIVE_API_FILES_URL}?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
        },
        signal: input.signal,
      },
    );

    if (!response.ok) {
      throw new DriveApiError(response.status);
    }

    const body = (await response.json()) as DriveFilesListResponse;
    const pageFiles = Array.isArray(body.files)
      ? body.files
          .map(normalizeDriveFile)
          .filter((file): file is DriveFileCandidate => file !== null)
      : [];

    files.push(...pageFiles);

    if (files.length > input.scanLimit) {
      throw new DriveProjectUnusedAssetPreviewError({
        status: "scanLimitExceeded",
        diagnostics: [
          "asset file 数がscan上限を超えたためpreviewを中断しました。",
          `scan上限: ${input.scanLimit}件`,
          "中途半端なcleanup候補は表示していません。",
          "Drive file は削除していません。",
        ],
      });
    }

    pageToken =
      typeof body.nextPageToken === "string" && body.nextPageToken.length > 0
        ? body.nextPageToken
        : null;
  } while (pageToken);

  return files;
}

function isPreviewableAppManagedAssetFile(input: {
  file: DriveFileCandidate;
  workspaceId: string;
  projectId: string;
}) {
  const { appProperties } = input.file;

  return (
    appProperties.app === DRIVE_WORKSPACE_APP_ID &&
    appProperties.role === "asset" &&
    appProperties.workspaceId === input.workspaceId &&
    appProperties.projectId === input.projectId &&
    isDriveAssetMimeType(input.file.mimeType)
  );
}

function toDriveProjectUnusedAssetSummary(
  file: DriveFileCandidate,
): DriveProjectUnusedAssetSummary {
  const assetId = isUuidV4(file.appProperties.assetId)
    ? file.appProperties.assetId
    : null;

  return {
    assetFileId: file.id,
    assetFileIdPart: formatDriveIdPart(file.id),
    assetId,
    assetIdPart: assetId ? formatDriveIdPart(assetId) : "未設定",
    assetName: file.name,
    mimeType: file.mimeType,
    sizeBytes: typeof file.sizeBytes === "number" ? file.sizeBytes : null,
    createdTime: file.createdTime ?? null,
    modifiedTime: file.modifiedTime ?? null,
    referenceSlideCount: 0,
  };
}

function compareDriveProjectUnusedAssetSummaries(
  left: DriveProjectUnusedAssetSummary,
  right: DriveProjectUnusedAssetSummary,
) {
  const createdTimeComparison = (left.createdTime ?? "").localeCompare(
    right.createdTime ?? "",
  );

  if (createdTimeComparison !== 0) {
    return createdTimeComparison;
  }

  return left.assetName.localeCompare(right.assetName);
}

function buildDriveProjectUnusedAssetPreviewFailureDiagnostics(error: unknown) {
  const diagnostics = ["未使用asset preview中にエラーが発生しました。"];

  if (error instanceof DriveApiError) {
    diagnostics.push(`Drive API status: ${error.status}`);
  }

  diagnostics.push(
    "manifest.json / index.json は更新していません。",
    "Drive assets/ のfileは更新・削除していません。",
  );

  return diagnostics;
}

function isDriveAssetMimeType(value: string): value is DriveAssetMimeType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function isVideoMimeType(value: string) {
  return value.toLowerCase().startsWith("video/");
}

function validateDriveManifestAssetMimeType(input: {
  assetType: DriveAssetType;
  mimeType: string;
  fileLabel: string;
  diagnostics: string[];
}): DriveAssetUnsupportedReason | undefined {
  if (input.assetType === "image") {
    if (!isDriveAssetMimeType(input.mimeType)) {
      input.diagnostics.push(`${input.fileLabel} の mimeType が対応外です。`);
      return "unsupportedMimeType";
    }

    return undefined;
  }

  if (input.mimeType === "video/mp4") {
    return "videoPlaybackNotImplemented";
  }

  if (isVideoMimeType(input.mimeType)) {
    return "unsupportedVideoMimeType";
  }

  input.diagnostics.push(`${input.fileLabel} の video mimeType が対応外です。`);
  return "unsupportedMimeType";
}

function readOptionalDriveAssetType(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): DriveAssetType | undefined {
  if (!hasOwnKey(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (value === "image" || value === "video") {
    return value;
  }

  input.diagnostics.push(
    `${input.fileLabel} の ${input.key} は image または video である必要があります。`,
  );
  return undefined;
}

function readOptionalDriveAssetUnsupportedReason(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}): DriveAssetUnsupportedReason | undefined {
  if (!hasOwnKey(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (
    value === "videoPlaybackNotImplemented" ||
    value === "unsupportedVideoMimeType" ||
    value === "unsupportedMimeType"
  ) {
    return value;
  }

  input.diagnostics.push(`${input.fileLabel} の ${input.key} が対応外です。`);
  return undefined;
}

function readOptionalPositiveNumber(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}) {
  if (!hasOwnKey(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    input.diagnostics.push(`${input.fileLabel} の ${input.key} が不正です。`);
    return undefined;
  }

  return value;
}

function readOptionalNonNegativeNumber(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}) {
  if (!hasOwnKey(input.body, input.key)) {
    return undefined;
  }

  const value = input.body[input.key];

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    input.diagnostics.push(`${input.fileLabel} の ${input.key} が不正です。`);
    return undefined;
  }

  return value;
}

function validateDriveProjectAssetBlobFetchInput(input: {
  accessToken: string;
  assetFileId: string;
  expectedMimeType: DriveAssetMimeType;
}) {
  const diagnostics: string[] = [];

  if (!input.accessToken) {
    diagnostics.push("Drive asset preview用のaccessTokenがありません。");
  }

  if (!isNonEmptyString(input.assetFileId)) {
    diagnostics.push("Drive asset preview対象のassetFileIdが空です。");
  }

  if (!isDriveAssetMimeType(input.expectedMimeType)) {
    diagnostics.push("Drive asset preview対象のexpectedMimeTypeが対応外です。");
  }

  return diagnostics;
}

function normalizeDriveAssetContentType(value: string | null) {
  if (!value) {
    return "";
  }

  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isRfc3339UtcTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value);
}

function buildDriveAssetAppProperties(input: {
  workspaceId: string;
  projectId: string;
  assetId: string;
}) {
  return {
    app: DRIVE_WORKSPACE_APP_ID,
    role: "asset",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    assetId: input.assetId,
    source: "googlePhotosPicker",
  };
}

function getDriveAssetExtension(mimeType: DriveAssetMimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return assertNeverDriveAssetMimeType(mimeType);
  }
}

function assertNeverDriveAssetMimeType(value: never): never {
  throw new Error(`Unsupported Drive asset MIME type: ${value}`);
}

function validateDriveProjectAssetSaveInput(input: {
  input: DriveProjectAssetSaveInput;
  assetId: string;
}) {
  const diagnostics: string[] = [];

  if (!input.input.accessToken) {
    diagnostics.push("Drive asset保存用のaccessTokenがありません。");
  }

  if (!isUuidV4(input.input.workspaceId)) {
    diagnostics.push("Drive asset保存対象のworkspaceIdがUUID形式ではありません。");
  }

  if (!isUuidV4(input.input.project.projectId)) {
    diagnostics.push("Drive asset保存対象のprojectIdがUUID形式ではありません。");
  }

  if (!isNonEmptyString(input.input.project.assetsFolderId)) {
    diagnostics.push("Drive asset保存対象のassetsFolderIdが空です。");
  }

  if (!isUuidV4(input.assetId)) {
    diagnostics.push("Drive asset保存用のassetIdがUUID形式ではありません。");
  }

  if (!Number.isSafeInteger(input.input.sizeBytes) || input.input.sizeBytes < 0) {
    diagnostics.push("Drive asset保存対象のsizeBytesが不正です。");
  }

  if (input.input.blob.size !== input.input.sizeBytes) {
    diagnostics.push("Drive asset保存対象のBlob sizeが検証済みsizeBytesと一致していません。");
  }

  if (input.input.blob.type && input.input.blob.type !== input.input.mimeType) {
    diagnostics.push("Drive asset保存対象のBlob typeが検証済みMIME typeと一致していません。");
  }

  return diagnostics;
}

async function createDriveProjectAssetFile(input: {
  accessToken: string;
  metadata: DriveCreateMetadata;
  blob: Blob;
  fields: string;
  signal: AbortSignal;
}): Promise<DriveFileCandidate> {
  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: input.fields,
  });
  const boundary = `-------ipad-slideshow-pwa-${crypto.randomUUID()}`;

  const body = new Blob(
    [
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify(input.metadata),
      "\r\n",
      `--${boundary}\r\n`,
      `Content-Type: ${input.metadata.mimeType}\r\n\r\n`,
      input.blob,
      "\r\n",
      `--${boundary}--\r\n`,
    ],
    {
      type: `multipart/related; boundary=${boundary}`,
    },
  );

  const response = await fetch(
    `${DRIVE_API_UPLOAD_FILES_URL}?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: input.signal,
    },
  );

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  const file = normalizeDriveFile((await response.json()) as unknown);

  if (!file) {
    throw new Error("Drive asset upload response did not include required fields.");
  }

  return file;
}

function validateDriveProjectAssetMetadata(input: {
  item: DriveFileCandidate;
  expectedAssetId: string;
  expectedName: string;
  expectedMimeType: DriveAssetMimeType;
  expectedParentId: string;
  expectedWorkspaceId: string;
  expectedProjectId: string;
  expectedSizeBytes: number;
}) {
  const diagnostics: string[] = [];

  if (input.item.name !== input.expectedName) {
    diagnostics.push("Drive asset file の名前が想定と一致していません。");
  }

  if (input.item.mimeType !== input.expectedMimeType) {
    diagnostics.push("Drive asset file のMIME typeが想定と一致していません。");
  }

  validateProjectParentId({
    item: input.item,
    label: "Drive asset file",
    expectedParentId: input.expectedParentId,
    diagnostics,
  });

  const { appProperties } = input.item;

  if (appProperties.app !== DRIVE_WORKSPACE_APP_ID) {
    diagnostics.push("Drive asset file のappProperties.appが不正です。");
  }

  if (appProperties.role !== "asset") {
    diagnostics.push("Drive asset file のappProperties.roleが不正です。");
  }

  if (appProperties.schemaVersion !== DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY) {
    diagnostics.push("Drive asset file のappProperties.schemaVersionが不正です。");
  }

  validateProjectMetadataUuidValue({
    label: "Drive asset file",
    key: "workspaceId",
    actual: appProperties.workspaceId,
    expected: input.expectedWorkspaceId,
    diagnostics,
  });

  validateProjectMetadataUuidValue({
    label: "Drive asset file",
    key: "projectId",
    actual: appProperties.projectId,
    expected: input.expectedProjectId,
    diagnostics,
  });

  validateDriveAssetMetadataAssetId({
    actual: appProperties.assetId,
    expected: input.expectedAssetId,
    diagnostics,
  });

  if (appProperties.source !== "googlePhotosPicker") {
    diagnostics.push("Drive asset file のappProperties.sourceが不正です。");
  }

  if (typeof input.item.sizeBytes !== "number") {
    diagnostics.push("Drive asset file のsizeを取得できませんでした。");
  } else if (input.item.sizeBytes !== input.expectedSizeBytes) {
    diagnostics.push("Drive asset file のsizeが検証済み画像サイズと一致していません。");
  }

  return diagnostics;
}

function validateDriveAssetMetadataAssetId(input: {
  actual: string | undefined;
  expected: string;
  diagnostics: string[];
}) {
  if (!isNonEmptyString(input.actual)) {
    input.diagnostics.push("Drive asset file のappProperties.assetIdが未設定です。");
    return;
  }

  if (!isUuidV4(input.actual)) {
    input.diagnostics.push(
      "Drive asset file のappProperties.assetIdがUUID形式ではありません。",
    );
    return;
  }

  if (input.actual !== input.expected) {
    input.diagnostics.push("Drive asset file のappProperties.assetIdが想定と一致していません。");
  }
}

function toDriveProjectSavedAsset(input: {
  file: DriveFileCandidate;
  assetId: string;
  driveFilename: string;
  driveMimeType: DriveAssetMimeType;
  diagnostics: string[];
}): DriveProjectSavedAsset | null {
  if (typeof input.file.sizeBytes !== "number") {
    return null;
  }

  return {
    assetId: input.assetId,
    assetIdPart: formatDriveIdPart(input.assetId),
    assetFileId: input.file.id,
    assetFileIdPart: formatDriveIdPart(input.file.id),
    driveFilename: input.driveFilename,
    driveMimeType: input.driveMimeType,
    driveSizeBytes: input.file.sizeBytes,
    diagnostics: [...input.diagnostics],
  };
}

function toDriveProjectAssetSaveFailureStatus(
  error: unknown,
  possibleCreatedAsset: DriveProjectSavedAsset | null,
): DriveProjectAssetSaveFailureStatus {
  if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
    return "authRequired";
  }

  if (possibleCreatedAsset) {
    return "verificationFailed";
  }

  return "uploadFailed";
}

function buildDriveProjectAssetSaveFailureDiagnostics(input: {
  error: unknown;
  possibleCreatedAsset: DriveProjectSavedAsset | null;
}) {
  const diagnostics = ["Drive asset保存中にエラーが発生しました。"];

  if (input.error instanceof DriveApiError) {
    diagnostics.push(`Drive API status: ${input.error.status}`);
  }

  if (input.possibleCreatedAsset) {
    diagnostics.push(
      "Drive asset file が作成済みの可能性があります。",
      `assetId: ${input.possibleCreatedAsset.assetIdPart}`,
      `assetFileId: ${input.possibleCreatedAsset.assetFileIdPart}`,
    );
  } else {
    diagnostics.push("Drive asset file の作成完了は確認できていません。");
  }

  diagnostics.push(
    "manifest反映は未実行です。",
    "自動削除・自動修復は行いません。",
  );

  return diagnostics;
}

function formatDriveIdPart(id: string) {
  return `${id.slice(0, 8)}...`;
}

function buildProjectAppProperties(input: {
  role: Exclude<DriveProjectChangedItemRole, "index">;
  workspaceId: string;
  projectId: string;
}) {
  return {
    app: DRIVE_WORKSPACE_APP_ID,
    role: input.role,
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  };
}

function buildProjectManifestJsonText(input: {
  workspaceId: string;
  projectId: string;
  title: string;
  now: string;
}) {
  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "projectManifest",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    title: input.title,
    slides: [],
    createdAt: input.now,
    updatedAt: input.now,
  });

  assertJsonTextSizeWithinLimit(text, "manifest.json");
  return text;
}

function buildIndexJsonWithCreatedProject(input: {
  workspaceId: string;
  indexCreatedAt: string;
  indexUpdatedAt: string;
  existingProjects: DriveProjectSummary[];
  project: DriveProjectSummary;
}) {
  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "index",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    projects: [...input.existingProjects, input.project],
    createdAt: input.indexCreatedAt,
    updatedAt: input.indexUpdatedAt,
  });

  assertJsonTextSizeWithinLimit(text, "index.json");
  return text;
}

function stringifyJsonFile(value: Record<string, unknown>) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertJsonTextSizeWithinLimit(text: string, fileLabel: string) {
  if (getUtf8ByteLength(text) > JSON_FILE_SIZE_LIMIT_BYTES) {
    throw new Error(
      `${fileLabel} の本文が上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
    );
  }
}

async function runWorkspaceCreateStep<T>(input: {
  role: DriveCreatedWorkspaceItemRole;
  possibleCreatedRoles: DriveCreatedWorkspaceItemRole[];
  create: () => Promise<T>;
}) {
  try {
    const result = await input.create();
    input.possibleCreatedRoles.push(input.role);
    return result;
  } catch (error) {
    const status = toWorkspaceCreateFailureStatus(error);
    const possibleCreatedRoles =
      error instanceof DriveApiError
        ? input.possibleCreatedRoles
        : appendCreatedRole(input.possibleCreatedRoles, input.role);

    throw new DriveWorkspaceCreateError({
      status,
      possibleCreatedRoles,
    });
  }
}

function toWorkspaceCreateFailureStatus(
  error: unknown,
): DriveWorkspaceCreateFailureStatus {
  if (error instanceof DriveApiError && [401, 403].includes(error.status)) {
    return "authRequired";
  }

  return "operationFailed";
}

function appendCreatedRole(
  roles: DriveCreatedWorkspaceItemRole[],
  role: DriveCreatedWorkspaceItemRole,
) {
  if (roles.includes(role)) {
    return [...roles];
  }

  return [...roles, role];
}

async function createDriveMetadataOnlyFile(input: {
  accessToken: string;
  metadata: DriveCreateMetadata;
  fields: string;
  signal: AbortSignal;
}): Promise<DriveWorkspaceCandidate> {
  const params = new URLSearchParams({
    fields: input.fields,
  });

  const response = await fetch(`${DRIVE_API_FILES_URL}?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(input.metadata),
    signal: input.signal,
  });

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  return validateCreatedDriveFileResponse({
    responseBody: (await response.json()) as unknown,
    expectedName: input.metadata.name,
    expectedMimeType: input.metadata.mimeType,
  });
}

async function createDriveMultipartJsonFile(input: {
  accessToken: string;
  metadata: DriveCreateMetadata;
  jsonText: string;
  fields: string;
  signal: AbortSignal;
}): Promise<DriveWorkspaceCandidate> {
  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: input.fields,
  });
  const boundary = `-------ipad-slideshow-pwa-${crypto.randomUUID()}`;

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(input.metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    input.jsonText,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const response = await fetch(
    `${DRIVE_API_UPLOAD_FILES_URL}?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: input.signal,
    },
  );

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  return validateCreatedDriveFileResponse({
    responseBody: (await response.json()) as unknown,
    expectedName: input.metadata.name,
    expectedMimeType: input.metadata.mimeType,
  });
}

function validateCreatedDriveFileResponse(input: {
  responseBody: unknown;
  expectedName: string;
  expectedMimeType: string;
}) {
  const file = normalizeDriveFile(input.responseBody);

  if (!file) {
    throw new Error("Drive create response did not include required fields.");
  }

  if (
    file.name !== input.expectedName ||
    file.mimeType !== input.expectedMimeType
  ) {
    throw new Error("Drive create response did not match requested metadata.");
  }

  return file;
}

function buildWorkspaceAppProperties(input: {
  role: "workspaceRoot" | DriveWorkspaceChildRole;
  workspaceId: string;
}) {
  return {
    app: DRIVE_WORKSPACE_APP_ID,
    role: input.role,
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY,
    workspaceId: input.workspaceId,
  };
}

function stringifyWorkspaceJson(value: Record<string, unknown>) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function listDriveFiles(
  accessToken: string,
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<DriveWorkspaceCandidate[]> {
  const response = await fetch(`${DRIVE_API_FILES_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new DriveApiError(response.status);
  }

  const body = (await response.json()) as DriveFilesListResponse;

  if (!Array.isArray(body.files)) {
    return [];
  }

  return body.files
    .map(normalizeDriveFile)
    .filter((file): file is DriveWorkspaceCandidate => file !== null);
}

function buildWorkspaceChildQuery(
  rootFolderId: string,
  role: DriveWorkspaceChildRole,
) {
  return [
    `'${escapeDriveQueryValue(rootFolderId)}' in parents`,
    "trashed = false",
    `appProperties has { key='app' and value='${DRIVE_WORKSPACE_APP_ID}' }`,
    `appProperties has { key='role' and value='${role}' }`,
  ].join(" and ");
}

function normalizeDriveFile(value: unknown): DriveWorkspaceCandidate | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value.id;
  const name = value.name;
  const mimeType = value.mimeType;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof mimeType !== "string"
  ) {
    return null;
  }

  return {
    id,
    name,
    mimeType,
    createdTime:
      typeof value.createdTime === "string" ? value.createdTime : undefined,
    modifiedTime:
      typeof value.modifiedTime === "string" ? value.modifiedTime : undefined,
    appProperties: toStringRecord(value.appProperties),
    sizeBytes: parseDriveSize(value.size),
    parents: Array.isArray(value.parents)
      ? value.parents.filter((parent): parent is string => typeof parent === "string")
      : undefined,
    trashed: typeof value.trashed === "boolean" ? value.trashed : undefined,
  };
}

function validateRequiredJsonChild(input: {
  candidates: DriveWorkspaceCandidate[];
  label: string;
  expectedName: string;
  expectedRole: string;
  diagnostics: string[];
  workspaceIds: string[];
}) {
  const item = validateSingleChildCount(input);

  if (!item) {
    return null;
  }

  if (item.name !== input.expectedName) {
    input.diagnostics.push(
      `${input.label} のファイル名が想定と一致していません。`,
    );
  }

  validateCommonMetadata({
    item,
    label: input.label,
    expectedRole: input.expectedRole,
    expectedMimeType: JSON_MIME_TYPE,
    diagnostics: input.diagnostics,
    workspaceIds: input.workspaceIds,
  });

  if (typeof item.sizeBytes !== "number") {
    input.diagnostics.push(`${input.label} のsizeを取得できませんでした。`);
    return item;
  }

  if (item.sizeBytes > JSON_FILE_SIZE_LIMIT_BYTES) {
    input.diagnostics.push(
      `${input.label} のsizeが上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
    );
  }

  return item;
}

function validateRequiredFolderChild(input: {
  candidates: DriveWorkspaceCandidate[];
  label: string;
  expectedName: string;
  expectedRole: string;
  diagnostics: string[];
  workspaceIds: string[];
}) {
  const item = validateSingleChildCount(input);

  if (!item) {
    return null;
  }

  if (item.name !== input.expectedName) {
    input.diagnostics.push(
      `${input.label} のフォルダ名が想定と一致していません。`,
    );
  }

  validateCommonMetadata({
    item,
    label: input.label,
    expectedRole: input.expectedRole,
    expectedMimeType: DRIVE_FOLDER_MIME_TYPE,
    diagnostics: input.diagnostics,
    workspaceIds: input.workspaceIds,
  });

  return item;
}

function validateSingleChildCount(input: {
  candidates: DriveWorkspaceCandidate[];
  label: string;
  diagnostics: string[];
}) {
  if (input.candidates.length === 0) {
    input.diagnostics.push(`${input.label} が見つかりません。`);
    return null;
  }

  if (input.candidates.length >= CHILD_ROLE_SEARCH_LIMIT) {
    input.diagnostics.push(`${input.label} が複数見つかりました。`);
    return null;
  }

  return input.candidates[0];
}

function validateCommonMetadata(input: {
  item: DriveWorkspaceCandidate;
  label: string;
  expectedRole: string;
  expectedMimeType: string;
  diagnostics: string[];
  workspaceIds: string[];
}) {
  const { appProperties } = input.item;
  const workspaceId = appProperties.workspaceId;

  if (input.item.mimeType !== input.expectedMimeType) {
    input.diagnostics.push(`${input.label} のMIME typeが想定と一致していません。`);
  }

  if (appProperties.app !== DRIVE_WORKSPACE_APP_ID) {
    input.diagnostics.push(`${input.label} のappProperties.appが不正です。`);
  }

  if (appProperties.role !== input.expectedRole) {
    input.diagnostics.push(`${input.label} のappProperties.roleが不正です。`);
  }

  if (appProperties.schemaVersion !== DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY) {
    input.diagnostics.push(
      `${input.label} のappProperties.schemaVersionが不正です。`,
    );
  }

  if (!isNonEmptyString(workspaceId)) {
    input.diagnostics.push(`${input.label} のworkspaceIdが未設定です。`);
    return undefined;
  }

  if (!isUuidV4(workspaceId)) {
    input.diagnostics.push(`${input.label} のworkspaceIdがUUID形式ではありません。`);
    return undefined;
  }

  input.workspaceIds.push(workspaceId);
  return workspaceId;
}

function validateWorkspaceJsonBody(text: string): JsonBodyValidationResult {
  const parsed = parseJsonObject(text, "workspace.json");

  if (parsed.status === "invalid") {
    return parsed;
  }

  return validateBaseJsonBody({
    body: parsed.value,
    fileLabel: "workspace.json",
    expectedRole: "workspace",
    validateProjectsArray: false,
  });
}

function validateIndexJsonBody(text: string): JsonBodyValidationResult {
  const parsed = parseJsonObject(text, "index.json");

  if (parsed.status === "invalid") {
    return parsed;
  }

  return validateBaseJsonBody({
    body: parsed.value,
    fileLabel: "index.json",
    expectedRole: "index",
    validateProjectsArray: true,
  });
}

function validateBaseJsonBody(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  expectedRole: "workspace" | "index";
  validateProjectsArray: boolean;
}): JsonBodyValidationResult {
  const invalidDiagnostics: string[] = [];
  const unsupportedVersionDiagnostics: string[] = [];

  validateRequiredLiteral({
    body: input.body,
    fileLabel: input.fileLabel,
    key: "app",
    expectedValue: DRIVE_WORKSPACE_APP_ID,
    diagnostics: invalidDiagnostics,
  });

  validateRequiredLiteral({
    body: input.body,
    fileLabel: input.fileLabel,
    key: "role",
    expectedValue: input.expectedRole,
    diagnostics: invalidDiagnostics,
  });

  validateSchemaVersion({
    body: input.body,
    fileLabel: input.fileLabel,
    invalidDiagnostics,
    unsupportedVersionDiagnostics,
  });

  const workspaceId = validateRequiredWorkspaceId({
    body: input.body,
    fileLabel: input.fileLabel,
    diagnostics: invalidDiagnostics,
  });

  validateRequiredIsoDateString({
    body: input.body,
    fileLabel: input.fileLabel,
    key: "createdAt",
    diagnostics: invalidDiagnostics,
  });

  validateRequiredIsoDateString({
    body: input.body,
    fileLabel: input.fileLabel,
    key: "updatedAt",
    diagnostics: invalidDiagnostics,
  });

  if (input.validateProjectsArray) {
    validateProjectsArray({
      body: input.body,
      fileLabel: input.fileLabel,
      diagnostics: invalidDiagnostics,
    });
  }

  if (invalidDiagnostics.length > 0) {
    return {
      status: "invalid",
      diagnostics: invalidDiagnostics,
    };
  }

  if (unsupportedVersionDiagnostics.length > 0) {
    return {
      status: "unsupportedVersion",
      diagnostics: unsupportedVersionDiagnostics,
    };
  }

  if (!workspaceId) {
    return {
      status: "invalid",
      diagnostics: [`${input.fileLabel} のworkspaceIdを確認できませんでした。`],
    };
  }

  return {
    status: "valid",
    workspaceId,
    diagnostics: [`${input.fileLabel} のJSON本文を確認しました。`],
  };
}

function validateIndexProjectItem(
  value: unknown,
  index: number,
): DriveProjectItemValidationResult {
  const fileLabel = `index.json.projects[${index}]`;

  if (!isRecord(value)) {
    return {
      status: "invalid",
      diagnostics: [`${fileLabel} はJSON objectである必要があります。`],
    };
  }

  const diagnostics: string[] = [];

  const projectId = readRequiredUuidString({
    body: value,
    fileLabel,
    key: "projectId",
    diagnostics,
  });

  const title = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "title",
    diagnostics,
  });

  const projectFolderId = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "projectFolderId",
    diagnostics,
  });

  const manifestFileId = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "manifestFileId",
    diagnostics,
  });

  const assetsFolderId = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "assetsFolderId",
    diagnostics,
  });

  const manifestPath = readRequiredNonEmptyString({
    body: value,
    fileLabel,
    key: "manifestPath",
    diagnostics,
  });

  const createdAt = readRequiredIsoDateString({
    body: value,
    fileLabel,
    key: "createdAt",
    diagnostics,
  });

  const updatedAt = readRequiredIsoDateString({
    body: value,
    fileLabel,
    key: "updatedAt",
    diagnostics,
  });

  if (projectId && manifestPath !== `projects/${projectId}/manifest.json`) {
    diagnostics.push(`${fileLabel} の manifestPath が projectId と一致していません。`);
  }

  if (
    diagnostics.length > 0 ||
    !projectId ||
    !title ||
    !projectFolderId ||
    !manifestFileId ||
    !assetsFolderId ||
    !manifestPath ||
    !createdAt ||
    !updatedAt
  ) {
    return {
      status: "invalid",
      diagnostics,
    };
  }

  return {
    status: "ready",
    project: {
      projectId,
      title,
      projectFolderId,
      manifestFileId,
      assetsFolderId,
      manifestPath,
      createdAt,
      updatedAt,
    },
    diagnostics: [],
  };
}

function parseJsonObject(text: string, fileLabel: string): ParseJsonObjectResult {
  try {
    const parsed = JSON.parse(text) as unknown;

    if (!isJsonObject(parsed)) {
      return {
        status: "invalid",
        diagnostics: [`${fileLabel} はJSON objectである必要があります。`],
      };
    }

    return {
      status: "valid",
      value: parsed,
    };
  } catch {
    return {
      status: "invalid",
      diagnostics: [`${fileLabel} はJSONとして読み取れませんでした。`],
    };
  }
}

function validateRequiredLiteral(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  key: string;
  expectedValue: string;
  diagnostics: string[];
}) {
  if (!hasOwnKey(input.body, input.key)) {
    input.diagnostics.push(`${input.fileLabel} の ${input.key} がありません。`);
    return;
  }

  if (input.body[input.key] !== input.expectedValue) {
    input.diagnostics.push(
      `${input.fileLabel} の ${input.key} が想定と一致していません。`,
    );
  }
}

function validateSchemaVersion(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  invalidDiagnostics: string[];
  unsupportedVersionDiagnostics: string[];
}) {
  if (!hasOwnKey(input.body, "schemaVersion")) {
    input.invalidDiagnostics.push(
      `${input.fileLabel} の schemaVersion がありません。`,
    );
    return;
  }

  const schemaVersion = input.body.schemaVersion;

  if (typeof schemaVersion !== "number") {
    input.invalidDiagnostics.push(
      `${input.fileLabel} の schemaVersion はnumberである必要があります。`,
    );
    return;
  }

  if (schemaVersion !== DRIVE_WORKSPACE_SCHEMA_VERSION) {
    input.unsupportedVersionDiagnostics.push(
      `${input.fileLabel} の schemaVersion はこのPWAでは対応していません。`,
    );
  }
}

function validateRequiredWorkspaceId(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  diagnostics: string[];
}) {
  if (!hasOwnKey(input.body, "workspaceId")) {
    input.diagnostics.push(`${input.fileLabel} の workspaceId がありません。`);
    return undefined;
  }

  const workspaceId = input.body.workspaceId;

  if (typeof workspaceId !== "string") {
    input.diagnostics.push(
      `${input.fileLabel} の workspaceId はstringである必要があります。`,
    );
    return undefined;
  }

  if (!isUuidV4(workspaceId)) {
    input.diagnostics.push(
      `${input.fileLabel} の workspaceId がUUID形式ではありません。`,
    );
    return undefined;
  }

  return workspaceId;
}

function validateRequiredIsoDateString(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  key: "createdAt" | "updatedAt";
  diagnostics: string[];
}) {
  if (!hasOwnKey(input.body, input.key)) {
    input.diagnostics.push(`${input.fileLabel} の ${input.key} がありません。`);
    return;
  }

  const value = input.body[input.key];

  if (typeof value !== "string") {
    input.diagnostics.push(
      `${input.fileLabel} の ${input.key} はstringである必要があります。`,
    );
    return;
  }

  if (!ISO_8601_UTC_PATTERN.test(value)) {
    input.diagnostics.push(
      `${input.fileLabel} の ${input.key} はISO 8601形式の日時文字列である必要があります。`,
    );
  }
}

function validateProjectsArray(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  diagnostics: string[];
}) {
  if (!hasOwnKey(input.body, "projects")) {
    input.diagnostics.push(`${input.fileLabel} の projects がありません。`);
    return;
  }

  const projects = input.body.projects;

  if (!Array.isArray(projects)) {
    input.diagnostics.push(
      `${input.fileLabel} の projects は配列である必要があります。`,
    );
  }
}

function readRequiredUuidString(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}) {
  const value = readRequiredNonEmptyString(input);

  if (!value) {
    return undefined;
  }

  if (!isUuidV4(value)) {
    input.diagnostics.push(
      `${input.fileLabel} の ${input.key} はUUID形式である必要があります。`,
    );
    return undefined;
  }

  return value;
}

function readRequiredNonEmptyString(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  key: string;
  diagnostics: string[];
}) {
  if (!hasOwnKey(input.body, input.key)) {
    input.diagnostics.push(`${input.fileLabel} の ${input.key} がありません。`);
    return undefined;
  }

  const value = input.body[input.key];

  if (typeof value !== "string") {
    input.diagnostics.push(
      `${input.fileLabel} の ${input.key} はstringである必要があります。`,
    );
    return undefined;
  }

  if (!isNonEmptyString(value)) {
    input.diagnostics.push(`${input.fileLabel} の ${input.key} が空です。`);
    return undefined;
  }

  return value;
}

function readRequiredIsoDateString(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  key: "createdAt" | "updatedAt";
  diagnostics: string[];
}) {
  const value = readRequiredNonEmptyString(input);

  if (!value) {
    return undefined;
  }

  if (!ISO_8601_UTC_PATTERN.test(value)) {
    input.diagnostics.push(
      `${input.fileLabel} の ${input.key} はISO 8601形式の日時文字列である必要があります。`,
    );
    return undefined;
  }

  return value;
}

function validateFetchedTextSizes(input: {
  workspaceJsonText: string;
  indexJsonText: string;
}) {
  const diagnostics: string[] = [];

  if (getUtf8ByteLength(input.workspaceJsonText) > JSON_FILE_SIZE_LIMIT_BYTES) {
    diagnostics.push(
      `workspace.json の本文が上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
    );
  }

  if (getUtf8ByteLength(input.indexJsonText) > JSON_FILE_SIZE_LIMIT_BYTES) {
    diagnostics.push(
      `index.json の本文が上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
    );
  }

  return diagnostics;
}

function getJsonDiagnostics(result: JsonBodyValidationResult) {
  return result.diagnostics;
}

function validateDriveProjectTitle(title: string) {
  const diagnostics: string[] = [];

  if (!isNonEmptyString(title)) {
    diagnostics.push("project title が空です。");
    return diagnostics;
  }

  if (title !== title.trim()) {
    diagnostics.push("project title の前後空白は取り除いてから保存してください。");
  }

  if ([...title].length > DRIVE_PROJECT_TITLE_MAX_LENGTH) {
    diagnostics.push(
      `project title は ${DRIVE_PROJECT_TITLE_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }

  return diagnostics;
}

function hasWorkspaceIdMismatch(workspaceIds: string[]) {
  return new Set(workspaceIds).size > 1;
}

function getUtf8ByteLength(text: string) {
  return new TextEncoder().encode(text).length;
}

function parseDriveSize(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const size = Number(value);

  if (!Number.isSafeInteger(size) || size < 0) {
    return undefined;
  }

  return size;
}

function escapeDriveQueryValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function hasOwnKey(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUuidV4(value: string) {
  return UUID_V4_PATTERN.test(value);
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );

  return Object.fromEntries(entries);
}
