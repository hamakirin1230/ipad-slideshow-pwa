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

const CHILD_ROLE_SEARCH_LIMIT = 2;
const JSON_FILE_SIZE_LIMIT_BYTES = 64 * 1024;

const CREATE_FOLDER_FIELDS =
  "id,name,mimeType,createdTime,modifiedTime,appProperties";
const CREATE_JSON_FIELDS =
  "id,name,mimeType,createdTime,modifiedTime,appProperties,size";

const WORKSPACE_ID_PATTERN =
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

export type DriveWorkspaceCandidate = {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  appProperties: Record<string, string>;
  sizeBytes?: number;
};

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

export type DriveMetadataValidationResult =
  | {
      status: "metadataVerified";
      diagnostics: string[];
      workspaceId: string;
      workspaceJsonFileId: string;
      indexJsonFileId: string;
    }
  | {
      status: "invalidWorkspace";
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

  validateRequiredFolderChild({
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

  if (diagnostics.length > 0) {
    return {
      status: "invalidWorkspace",
      diagnostics,
    };
  }

  if (!rootWorkspaceId || !workspaceJson?.id || !indexJson?.id) {
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
    workspaceJsonFileId: workspaceJson.id,
    indexJsonFileId: indexJson.id,
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
    requireEmptyProjects: false,
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
    requireEmptyProjects: true,
  });
}

function validateBaseJsonBody(input: {
  body: Record<string, unknown>;
  fileLabel: string;
  expectedRole: "workspace" | "index";
  requireEmptyProjects: boolean;
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

  if (input.requireEmptyProjects) {
    validateEmptyProjectsArray({
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

function validateEmptyProjectsArray(input: {
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
    return;
  }

  if (projects.length !== 0) {
    input.diagnostics.push(
      `${input.fileLabel} の projects は空配列である必要があります。`,
    );
  }
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
  return typeof value === "string" && value.length > 0;
}

function isUuidV4(value: string) {
  return WORKSPACE_ID_PATTERN.test(value);
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}