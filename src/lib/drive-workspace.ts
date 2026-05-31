export const DRIVE_WORKSPACE_APP_ID = "ipad-slideshow-pwa";
export const DRIVE_WORKSPACE_SCHEMA_VERSION = 1;
export const DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY = "1";

export const ROOT_WORKSPACE_SEARCH_LIMIT = 2;
export const CHILD_ROLE_SEARCH_LIMIT = 2;
export const JSON_FILE_SIZE_LIMIT_BYTES = 64 * 1024;

export const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
export const JSON_MIME_TYPE = "application/json";

export const WORKSPACE_JSON_NAME = "workspace.json";
export const INDEX_JSON_NAME = "index.json";
export const PROJECTS_ROOT_NAME = "projects";

export type WorkspaceChildRole = "workspace" | "index" | "projectsRoot";
export type WorkspaceItemRole = "workspaceRoot" | WorkspaceChildRole;

export type SafeDriveItem = {
  name: string;
  mimeType: string;
  appProperties: Record<string, string | undefined>;
  createdTime?: string;
  modifiedTime?: string;
  sizeBytes?: number;
};

export type DriveDiagnosticTarget =
  | "workspaceRoot"
  | "workspaceJson"
  | "indexJson"
  | "projectsRoot"
  | "workspaceJsonBody"
  | "indexJsonBody";

export type DriveDiagnosticCode =
  | "workspaceRootMissing"
  | "multipleWorkspaceRoots"
  | "workspaceRootInvalidMetadata"
  | "workspaceJsonMissing"
  | "workspaceJsonDuplicate"
  | "workspaceJsonInvalidName"
  | "workspaceJsonInvalidMimeType"
  | "workspaceJsonInvalidMetadata"
  | "workspaceJsonTooLarge"
  | "workspaceJsonInvalidJson"
  | "workspaceJsonInvalidSchema"
  | "workspaceJsonUnsupportedVersion"
  | "indexJsonMissing"
  | "indexJsonDuplicate"
  | "indexJsonInvalidName"
  | "indexJsonInvalidMimeType"
  | "indexJsonInvalidMetadata"
  | "indexJsonTooLarge"
  | "indexJsonInvalidJson"
  | "indexJsonInvalidSchema"
  | "indexJsonUnsupportedVersion"
  | "projectsRootMissing"
  | "projectsRootDuplicate"
  | "projectsRootInvalidName"
  | "projectsRootInvalidMimeType"
  | "projectsRootInvalidMetadata"
  | "workspaceIdMismatch";

export type DriveDiagnosticSeverity = "info" | "warning" | "error";

export type DriveDiagnostic = {
  code: DriveDiagnosticCode;
  severity: DriveDiagnosticSeverity;
  target?: DriveDiagnosticTarget;
};

export type SafeWorkspaceCandidatePreview = {
  name: string;
  createdTime?: string;
  modifiedTime?: string;
  workspaceIdSuffix?: string;
};

export type RootCandidateClassification =
  | {
      status: "notCreated";
      diagnostics: DriveDiagnostic[];
    }
  | {
      status: "singleCandidate";
      rootCandidate: SafeDriveItem;
    }
  | {
      status: "multipleCandidates";
      candidatePreviews: SafeWorkspaceCandidatePreview[];
      diagnostics: DriveDiagnostic[];
    };

export type ValidateWorkspaceStructureInput = {
  rootCandidate: SafeDriveItem;
  childCandidatesByRole: {
    workspace: SafeDriveItem[];
    index: SafeDriveItem[];
    projectsRoot: SafeDriveItem[];
  };
  workspaceJsonText: string;
  indexJsonText: string;
};

export type DriveWorkspaceStructureResult =
  | {
      status: "ready";
      checkedWorkspaceName?: string;
    }
  | {
      status: "invalidWorkspace";
      diagnostics: DriveDiagnostic[];
    }
  | {
      status: "unsupportedVersion";
      diagnostics: DriveDiagnostic[];
    };

export function classifyWorkspaceRootCandidates(
  rootCandidates: SafeDriveItem[],
): RootCandidateClassification {
  if (rootCandidates.length === 0) {
    return {
      status: "notCreated",
      diagnostics: [
        {
          code: "workspaceRootMissing",
          severity: "info",
          target: "workspaceRoot",
        },
      ],
    };
  }

  if (rootCandidates.length >= ROOT_WORKSPACE_SEARCH_LIMIT) {
    return {
      status: "multipleCandidates",
      candidatePreviews: rootCandidates
        .slice(0, ROOT_WORKSPACE_SEARCH_LIMIT)
        .map(toSafeWorkspaceCandidatePreview),
      diagnostics: [
        {
          code: "multipleWorkspaceRoots",
          severity: "error",
          target: "workspaceRoot",
        },
      ],
    };
  }

  return {
    status: "singleCandidate",
    rootCandidate: rootCandidates[0],
  };
}

export function validateWorkspaceStructure(
  input: ValidateWorkspaceStructureInput,
): DriveWorkspaceStructureResult {
  const metadataDiagnostics: DriveDiagnostic[] = [];
  const workspaceIds: string[] = [];

  collectWorkspaceId(
    validateItemMetadata({
      item: input.rootCandidate,
      expectedRole: "workspaceRoot",
      expectedMimeType: DRIVE_FOLDER_MIME_TYPE,
      target: "workspaceRoot",
      metadataDiagnosticCode: "workspaceRootInvalidMetadata",
      diagnostics: metadataDiagnostics,
    }),
    workspaceIds,
  );

  const workspaceJson = validateSingleChildCandidate({
    candidates: input.childCandidatesByRole.workspace,
    expectedName: WORKSPACE_JSON_NAME,
    expectedMimeType: JSON_MIME_TYPE,
    expectedRole: "workspace",
    target: "workspaceJson",
    missingCode: "workspaceJsonMissing",
    duplicateCode: "workspaceJsonDuplicate",
    invalidNameCode: "workspaceJsonInvalidName",
    invalidMimeTypeCode: "workspaceJsonInvalidMimeType",
    invalidMetadataCode: "workspaceJsonInvalidMetadata",
    diagnostics: metadataDiagnostics,
  });

  const indexJson = validateSingleChildCandidate({
    candidates: input.childCandidatesByRole.index,
    expectedName: INDEX_JSON_NAME,
    expectedMimeType: JSON_MIME_TYPE,
    expectedRole: "index",
    target: "indexJson",
    missingCode: "indexJsonMissing",
    duplicateCode: "indexJsonDuplicate",
    invalidNameCode: "indexJsonInvalidName",
    invalidMimeTypeCode: "indexJsonInvalidMimeType",
    invalidMetadataCode: "indexJsonInvalidMetadata",
    diagnostics: metadataDiagnostics,
  });

  const projectsRoot = validateSingleChildCandidate({
    candidates: input.childCandidatesByRole.projectsRoot,
    expectedName: PROJECTS_ROOT_NAME,
    expectedMimeType: DRIVE_FOLDER_MIME_TYPE,
    expectedRole: "projectsRoot",
    target: "projectsRoot",
    missingCode: "projectsRootMissing",
    duplicateCode: "projectsRootDuplicate",
    invalidNameCode: "projectsRootInvalidName",
    invalidMimeTypeCode: "projectsRootInvalidMimeType",
    invalidMetadataCode: "projectsRootInvalidMetadata",
    diagnostics: metadataDiagnostics,
  });

  collectWorkspaceId(workspaceJson.workspaceId, workspaceIds);
  collectWorkspaceId(indexJson.workspaceId, workspaceIds);
  collectWorkspaceId(projectsRoot.workspaceId, workspaceIds);

  if (metadataDiagnostics.length > 0) {
    return {
      status: "invalidWorkspace",
      diagnostics: metadataDiagnostics,
    };
  }

  if (hasWorkspaceIdMismatch(workspaceIds)) {
    return {
      status: "invalidWorkspace",
      diagnostics: [
        {
          code: "workspaceIdMismatch",
          severity: "error",
        },
      ],
    };
  }

  const sizeDiagnostics = validateJsonSizeLimits({
    workspaceJson,
    indexJson,
    workspaceJsonText: input.workspaceJsonText,
    indexJsonText: input.indexJsonText,
  });

  if (sizeDiagnostics.length > 0) {
    return {
      status: "invalidWorkspace",
      diagnostics: sizeDiagnostics,
    };
  }

  const workspaceBodyResult = parseWorkspaceJsonBody(input.workspaceJsonText);
  const indexBodyResult = parseIndexJsonBody(input.indexJsonText);

  if (workspaceBodyResult.status === "invalid" || indexBodyResult.status === "invalid") {
    return {
      status: "invalidWorkspace",
      diagnostics: [
        ...getJsonBodyDiagnostics(workspaceBodyResult),
        ...getJsonBodyDiagnostics(indexBodyResult),
      ],
    };
  }

  if (
    workspaceBodyResult.status === "unsupportedVersion" ||
    indexBodyResult.status === "unsupportedVersion"
  ) {
    return {
      status: "unsupportedVersion",
      diagnostics: [
        ...getJsonBodyDiagnostics(workspaceBodyResult),
        ...getJsonBodyDiagnostics(indexBodyResult),
      ],
    };
  }

  const bodyWorkspaceIds = [
    workspaceBodyResult.workspaceId,
    indexBodyResult.workspaceId,
  ];

  if (hasWorkspaceIdMismatch([...workspaceIds, ...bodyWorkspaceIds])) {
    return {
      status: "invalidWorkspace",
      diagnostics: [
        {
          code: "workspaceIdMismatch",
          severity: "error",
        },
      ],
    };
  }

  return {
    status: "ready",
    checkedWorkspaceName: input.rootCandidate.name,
  };
}

export function getUtf8ByteLength(text: string) {
  return new TextEncoder().encode(text).length;
}

type ValidateItemMetadataInput = {
  item: SafeDriveItem;
  expectedRole: WorkspaceItemRole;
  expectedMimeType: string;
  target: DriveDiagnosticTarget;
  metadataDiagnosticCode: DriveDiagnosticCode;
  diagnostics: DriveDiagnostic[];
};

type ValidateSingleChildCandidateInput = {
  candidates: SafeDriveItem[];
  expectedName: string;
  expectedMimeType: string;
  expectedRole: WorkspaceChildRole;
  target: DriveDiagnosticTarget;
  missingCode: DriveDiagnosticCode;
  duplicateCode: DriveDiagnosticCode;
  invalidNameCode: DriveDiagnosticCode;
  invalidMimeTypeCode: DriveDiagnosticCode;
  invalidMetadataCode: DriveDiagnosticCode;
  diagnostics: DriveDiagnostic[];
};

type ValidatedChildCandidate = {
  item?: SafeDriveItem;
  workspaceId?: string;
};

type JsonBodyValidationResult =
  | {
      status: "valid";
      workspaceId: string;
    }
  | {
      status: "invalid";
      diagnostics: DriveDiagnostic[];
    }
  | {
      status: "unsupportedVersion";
      diagnostics: DriveDiagnostic[];
    };

type WorkspaceJsonBody = {
  app: unknown;
  role: unknown;
  schemaVersion: unknown;
  workspaceId: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};

type IndexJsonBody = WorkspaceJsonBody & {
  projects: unknown;
};

function validateSingleChildCandidate(
  input: ValidateSingleChildCandidateInput,
): ValidatedChildCandidate {
  if (input.candidates.length === 0) {
    input.diagnostics.push({
      code: input.missingCode,
      severity: "error",
      target: input.target,
    });
    return {};
  }

  if (input.candidates.length >= CHILD_ROLE_SEARCH_LIMIT) {
    input.diagnostics.push({
      code: input.duplicateCode,
      severity: "error",
      target: input.target,
    });
    return {};
  }

  const item = input.candidates[0];

  if (item.name !== input.expectedName) {
    input.diagnostics.push({
      code: input.invalidNameCode,
      severity: "error",
      target: input.target,
    });
  }

  const workspaceId = validateItemMetadata({
    item,
    expectedRole: input.expectedRole,
    expectedMimeType: input.expectedMimeType,
    target: input.target,
    metadataDiagnosticCode: input.invalidMetadataCode,
    diagnostics: input.diagnostics,
  });

  if (item.mimeType !== input.expectedMimeType) {
    input.diagnostics.push({
      code: input.invalidMimeTypeCode,
      severity: "error",
      target: input.target,
    });
  }

  return {
    item,
    workspaceId,
  };
}

function validateItemMetadata(input: ValidateItemMetadataInput) {
  const { appProperties } = input.item;
  const workspaceId = appProperties.workspaceId;

  if (
    input.item.mimeType !== input.expectedMimeType ||
    appProperties.app !== DRIVE_WORKSPACE_APP_ID ||
    appProperties.role !== input.expectedRole ||
    appProperties.schemaVersion !== DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY ||
    !isNonEmptyString(workspaceId)
  ) {
    input.diagnostics.push({
      code: input.metadataDiagnosticCode,
      severity: "error",
      target: input.target,
    });
    return undefined;
  }

  return workspaceId;
}

function validateJsonSizeLimits(input: {
  workspaceJson: ValidatedChildCandidate;
  indexJson: ValidatedChildCandidate;
  workspaceJsonText: string;
  indexJsonText: string;
}) {
  const diagnostics: DriveDiagnostic[] = [];

  if (exceedsJsonSizeLimit(input.workspaceJson.item?.sizeBytes, input.workspaceJsonText)) {
    diagnostics.push({
      code: "workspaceJsonTooLarge",
      severity: "error",
      target: "workspaceJsonBody",
    });
  }

  if (exceedsJsonSizeLimit(input.indexJson.item?.sizeBytes, input.indexJsonText)) {
    diagnostics.push({
      code: "indexJsonTooLarge",
      severity: "error",
      target: "indexJsonBody",
    });
  }

  return diagnostics;
}

function exceedsJsonSizeLimit(sizeBytes: number | undefined, text: string) {
  return (
    (typeof sizeBytes === "number" && sizeBytes > JSON_FILE_SIZE_LIMIT_BYTES) ||
    getUtf8ByteLength(text) > JSON_FILE_SIZE_LIMIT_BYTES
  );
}

function parseWorkspaceJsonBody(text: string): JsonBodyValidationResult {
  const parsed = parseJsonObject(text, "workspaceJsonInvalidJson", "workspaceJsonBody");

  if (!parsed.ok) {
    return {
      status: "invalid",
      diagnostics: [parsed.diagnostic],
    };
  }

  return validateWorkspaceJsonBody(parsed.value);
}

function parseIndexJsonBody(text: string): JsonBodyValidationResult {
  const parsed = parseJsonObject(text, "indexJsonInvalidJson", "indexJsonBody");

  if (!parsed.ok) {
    return {
      status: "invalid",
      diagnostics: [parsed.diagnostic],
    };
  }

  return validateIndexJsonBody(parsed.value);
}

function parseJsonObject(
  text: string,
  invalidJsonCode: DriveDiagnosticCode,
  target: DriveDiagnosticTarget,
):
  | {
      ok: true;
      value: Record<string, unknown>;
    }
  | {
      ok: false;
      diagnostic: DriveDiagnostic;
    } {
  try {
    const parsed: unknown = JSON.parse(text);

    if (!isRecord(parsed)) {
      return {
        ok: false,
        diagnostic: {
          code: invalidJsonCode,
          severity: "error",
          target,
        },
      };
    }

    return {
      ok: true,
      value: parsed,
    };
  } catch {
    return {
      ok: false,
      diagnostic: {
        code: invalidJsonCode,
        severity: "error",
        target,
      },
    };
  }
}

function validateWorkspaceJsonBody(
  body: Record<string, unknown>,
): JsonBodyValidationResult {
  return validateJsonBody({
    body: body as WorkspaceJsonBody,
    expectedRole: "workspace",
    invalidSchemaCode: "workspaceJsonInvalidSchema",
    unsupportedVersionCode: "workspaceJsonUnsupportedVersion",
    target: "workspaceJsonBody",
  });
}

function validateIndexJsonBody(body: Record<string, unknown>): JsonBodyValidationResult {
  const result = validateJsonBody({
    body: body as IndexJsonBody,
    expectedRole: "index",
    invalidSchemaCode: "indexJsonInvalidSchema",
    unsupportedVersionCode: "indexJsonUnsupportedVersion",
    target: "indexJsonBody",
  });

  if (result.status !== "valid") {
    return result;
  }

  if (!Array.isArray(body.projects)) {
    return {
      status: "invalid",
      diagnostics: [
        {
          code: "indexJsonInvalidSchema",
          severity: "error",
          target: "indexJsonBody",
        },
      ],
    };
  }

  return result;
}

function validateJsonBody(input: {
  body: WorkspaceJsonBody;
  expectedRole: "workspace" | "index";
  invalidSchemaCode: DriveDiagnosticCode;
  unsupportedVersionCode: DriveDiagnosticCode;
  target: DriveDiagnosticTarget;
}): JsonBodyValidationResult {
  const diagnostics: DriveDiagnostic[] = [];
  const workspaceId = input.body.workspaceId;
  const hasValidWorkspaceId = isNonEmptyString(workspaceId);

  if (input.body.schemaVersion !== DRIVE_WORKSPACE_SCHEMA_VERSION) {
    if (typeof input.body.schemaVersion === "number") {
      return {
        status: "unsupportedVersion",
        diagnostics: [
          {
            code: input.unsupportedVersionCode,
            severity: "error",
            target: input.target,
          },
        ],
      };
    }

    diagnostics.push({
      code: input.invalidSchemaCode,
      severity: "error",
      target: input.target,
    });
  }

  if (
    input.body.app !== DRIVE_WORKSPACE_APP_ID ||
    input.body.role !== input.expectedRole ||
    !hasValidWorkspaceId ||
    typeof input.body.createdAt !== "string" ||
    typeof input.body.updatedAt !== "string"
  ) {
    diagnostics.push({
      code: input.invalidSchemaCode,
      severity: "error",
      target: input.target,
    });
  }

  if (diagnostics.length > 0) {
    return {
      status: "invalid",
      diagnostics,
    };
  }

  if (!hasValidWorkspaceId) {
    return {
      status: "invalid",
      diagnostics: [
        {
          code: input.invalidSchemaCode,
          severity: "error",
          target: input.target,
        },
      ],
    };
  }

  return {
    status: "valid",
    workspaceId,
  };
}

function getJsonBodyDiagnostics(result: JsonBodyValidationResult) {
  if (result.status === "valid") {
    return [];
  }

  return result.diagnostics;
}

function toSafeWorkspaceCandidatePreview(
  item: SafeDriveItem,
): SafeWorkspaceCandidatePreview {
  const workspaceId = item.appProperties.workspaceId;

  return {
    name: item.name,
    createdTime: item.createdTime,
    modifiedTime: item.modifiedTime,
    workspaceIdSuffix: isNonEmptyString(workspaceId)
      ? workspaceId.slice(-8)
      : undefined,
  };
}

function collectWorkspaceId(workspaceId: string | undefined, workspaceIds: string[]) {
  if (isNonEmptyString(workspaceId)) {
    workspaceIds.push(workspaceId);
  }
}

function hasWorkspaceIdMismatch(workspaceIds: string[]) {
  if (workspaceIds.length === 0) {
    return true;
  }

  return workspaceIds.some((workspaceId) => workspaceId !== workspaceIds[0]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}