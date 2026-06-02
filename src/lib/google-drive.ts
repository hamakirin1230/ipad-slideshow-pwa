const DRIVE_API_FILES_URL = "https://www.googleapis.com/drive/v3/files";

const WORKSPACE_ROOT_QUERY = [
  "mimeType = 'application/vnd.google-apps.folder'",
  "trashed = false",
  "appProperties has { key='app' and value='ipad-slideshow-pwa' }",
  "appProperties has { key='role' and value='workspaceRoot' }",
].join(" and ");

export type DriveWorkspaceRootCandidate = {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  appProperties: Record<string, string>;
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
    .filter((file): file is DriveWorkspaceRootCandidate => file !== null);
}

function normalizeDriveFile(value: unknown): DriveWorkspaceRootCandidate | null {
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
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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