const DRIVE_API_FILES_URL = "https://www.googleapis.com/drive/v3/files";

const DRIVE_WORKSPACE_APP_ID = "ipad-slideshow-pwa";
const DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY = "1";

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const JSON_MIME_TYPE = "application/json";

const WORKSPACE_JSON_NAME = "workspace.json";
const INDEX_JSON_NAME = "index.json";
const PROJECTS_ROOT_NAME = "projects";

const CHILD_ROLE_SEARCH_LIMIT = 2;
const JSON_FILE_SIZE_LIMIT_BYTES = 64 * 1024;

const WORKSPACE_ROOT_QUERY = [
  `mimeType = '${DRIVE_FOLDER_MIME_TYPE}'`,
  "trashed = false",
  `appProperties has { key='app' and value='${DRIVE_WORKSPACE_APP_ID}' }`,
  "appProperties has { key='role' and value='workspaceRoot' }",
].join(" and ");

export type DriveWorkspaceChildRole = "workspace" | "index" | "projectsRoot";

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

export type DriveMetadataValidationResult =
  | {
      status: "metadataVerified";
      diagnostics: string[];
    }
  | {
      status: "invalidWorkspace";
      diagnostics: string[];
    };

type DriveFilesListResponse = {
  files?: unknown[];
};

export class DriveApiError extends Error {
  status: number;

  constructor(status: number) {
    super("Drive API request failed.");
    this.name = "DriveApiError";
    this.status = status;
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

export function validateWorkspaceMetadata(
  rootCandidate: DriveWorkspaceRootCandidate,
  childCandidatesByRole: DriveChildCandidatesByRole,
): DriveMetadataValidationResult {
  const diagnostics: string[] = [];
  const workspaceIds: string[] = [];

  validateCommonMetadata({
    item: rootCandidate,
    label: "workspace root folder",
    expectedRole: "workspaceRoot",
    expectedMimeType: DRIVE_FOLDER_MIME_TYPE,
    diagnostics,
    workspaceIds,
  });

  validateRequiredJsonChild({
    candidates: childCandidatesByRole.workspace,
    label: "workspace.json",
    expectedName: WORKSPACE_JSON_NAME,
    expectedRole: "workspace",
    diagnostics,
    workspaceIds,
  });

  validateRequiredJsonChild({
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

  if (diagnostics.length > 0) {
    return {
      status: "invalidWorkspace",
      diagnostics,
    };
  }

  return {
    status: "metadataVerified",
    diagnostics: [
      "workspace root folder / workspace.json / index.json / projects/ のmetadata確認が完了しました。",
    ],
  };
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
    return;
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
    return;
  }

  if (item.sizeBytes > JSON_FILE_SIZE_LIMIT_BYTES) {
    input.diagnostics.push(
      `${input.label} のsizeが上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
    );
  }
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
    return;
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
    return;
  }

  input.workspaceIds.push(workspaceId);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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