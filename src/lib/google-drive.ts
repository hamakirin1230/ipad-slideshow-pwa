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
const PROJECT_TITLE = "新しいスライドショー";
const PROJECT_MANIFEST_NAME = "manifest.json";
const PROJECT_ASSETS_ROOT_NAME = "assets";

const CHILD_ROLE_SEARCH_LIMIT = 2;
const JSON_FILE_SIZE_LIMIT_BYTES = 64 * 1024;

const CREATE_FOLDER_FIELDS =
  "id,name,mimeType,createdTime,modifiedTime,appProperties";
const CREATE_JSON_FIELDS =
  "id,name,mimeType,createdTime,modifiedTime,appProperties,size";

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
  runStep: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
};

export type DriveProjectCreateResult = {
  project: DriveProjectSummary;
  indexJsonText: string;
  diagnostics: string[];
};

type ProjectCreatableIndexJsonParseResult =
  | {
      status: "creatable";
      index: {
        createdAt: string;
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

export type DriveProjectIndexValidationResult =
  | {
      status: "notCreated";
      diagnostics: string[];
    }
  | {
      status: "ready";
      project: DriveProjectSummary;
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

  if (projects.length >= 2) {
    return {
      status: "invalid",
      diagnostics: [
        "index.json.projects が2件以上あります。",
        "第4-2初期版では複数プロジェクトに対応していません。",
      ],
    };
  }

  const projectResult = validateIndexProjectItem(projects[0]);

  if (projectResult.status === "invalid") {
    return projectResult;
  }

  return {
    status: "ready",
    project: projectResult.project,
    diagnostics: [
      "index.json.projects は1件です。",
      "index.json上のプロジェクト登録を確認しました。",
      "manifest.json と assets/ の詳細検証は後続コミットで追加します。",
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

  validateProjectManifestJsonBody({
    manifestJsonText,
    expectedWorkspaceId: input.expectedWorkspaceId,
    project: input.project,
    diagnostics,
  });

  if (diagnostics.length > 0) {
    return {
      status: "invalid",
      diagnostics,
    };
  }

  return {
    status: "ready",
    diagnostics: [
      "project folder / manifest.json / assets/ のmetadata確認が完了しました。",
      "manifest.json のJSON本文を確認しました。",
      "index.json.projects[0] とDrive上のproject詳細の整合確認が完了しました。",
    ],
  };
}


export async function createDriveProject(
  input: DriveProjectCreateInput,
): Promise<DriveProjectCreateResult> {
  const changedItems: DriveProjectChangedItem[] = [];
  const { readyContext } = input;

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
    title: PROJECT_TITLE,
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
      },
      diagnostics: [
        "index.json を再読込し、プロジェクト未作成であることを確認しました。",
      ],
    };
  }

  const projectValidation = validateIndexJsonProjects(input.indexJsonText);

  if (projectValidation.status === "ready") {
    return {
      status: "notCreatable",
      diagnostics: [
        "すでにプロジェクトが登録されているため、新規作成を開始しませんでした。",
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
  const { project } = result;

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
      `index.json.projects[0] の ${input.label} が今回作成した値と一致していません。`,
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

function validateProjectManifestJsonBody(input: {
  manifestJsonText: string;
  expectedWorkspaceId: string;
  project: DriveProjectSummary;
  diagnostics: string[];
}) {
  if (getUtf8ByteLength(input.manifestJsonText) > JSON_FILE_SIZE_LIMIT_BYTES) {
    input.diagnostics.push(
      `manifest.json の本文が上限 ${JSON_FILE_SIZE_LIMIT_BYTES} bytes を超えています。`,
    );
    return;
  }

  const parsed = parseJsonObject(input.manifestJsonText, "manifest.json");

  if (parsed.status === "invalid") {
    input.diagnostics.push(...parsed.diagnostics);
    return;
  }

  validateRequiredLiteral({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "app",
    expectedValue: DRIVE_WORKSPACE_APP_ID,
    diagnostics: input.diagnostics,
  });

  validateRequiredLiteral({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "role",
    expectedValue: "projectManifest",
    diagnostics: input.diagnostics,
  });

  const schemaInvalidDiagnostics: string[] = [];
  const schemaUnsupportedDiagnostics: string[] = [];

  validateSchemaVersion({
    body: parsed.value,
    fileLabel: "manifest.json",
    invalidDiagnostics: schemaInvalidDiagnostics,
    unsupportedVersionDiagnostics: schemaUnsupportedDiagnostics,
  });

  input.diagnostics.push(
    ...schemaInvalidDiagnostics,
    ...schemaUnsupportedDiagnostics,
  );

  const workspaceId = readRequiredUuidString({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "workspaceId",
    diagnostics: input.diagnostics,
  });
  const projectId = readRequiredUuidString({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "projectId",
    diagnostics: input.diagnostics,
  });
  const title = readRequiredNonEmptyString({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "title",
    diagnostics: input.diagnostics,
  });
  const createdAt = readRequiredIsoDateString({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "createdAt",
    diagnostics: input.diagnostics,
  });
  const updatedAt = readRequiredIsoDateString({
    body: parsed.value,
    fileLabel: "manifest.json",
    key: "updatedAt",
    diagnostics: input.diagnostics,
  });

  validateProjectManifestSlidesArray(parsed.value, input.diagnostics);

  validateExpectedProjectManifestValue({
    diagnostics: input.diagnostics,
    label: "workspaceId",
    actual: workspaceId,
    expected: input.expectedWorkspaceId,
  });
  validateExpectedProjectManifestValue({
    diagnostics: input.diagnostics,
    label: "projectId",
    actual: projectId,
    expected: input.project.projectId,
  });
  validateExpectedProjectManifestValue({
    diagnostics: input.diagnostics,
    label: "title",
    actual: title,
    expected: input.project.title,
  });
  validateExpectedProjectManifestValue({
    diagnostics: input.diagnostics,
    label: "createdAt",
    actual: createdAt,
    expected: input.project.createdAt,
  });
  validateExpectedProjectManifestValue({
    diagnostics: input.diagnostics,
    label: "updatedAt",
    actual: updatedAt,
    expected: input.project.updatedAt,
  });
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
      `manifest.json の ${input.label} が index.json.projects[0] と一致していません。`,
    );
  }
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
  now: string;
}) {
  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "projectManifest",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    title: PROJECT_TITLE,
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
  project: DriveProjectSummary;
}) {
  const text = stringifyJsonFile({
    app: DRIVE_WORKSPACE_APP_ID,
    role: "index",
    schemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    projects: [input.project],
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
): Extract<DriveProjectIndexValidationResult, { status: "ready" | "invalid" }> {
  if (!isRecord(value)) {
    return {
      status: "invalid",
      diagnostics: ["index.json.projects[0] はJSON objectである必要があります。"],
    };
  }

  const diagnostics: string[] = [];

  const projectId = readRequiredUuidString({
    body: value,
    fileLabel: "index.json.projects[0]",
    key: "projectId",
    diagnostics,
  });

  const title = readRequiredNonEmptyString({
    body: value,
    fileLabel: "index.json.projects[0]",
    key: "title",
    diagnostics,
  });

  const projectFolderId = readRequiredNonEmptyString({
    body: value,
    fileLabel: "index.json.projects[0]",
    key: "projectFolderId",
    diagnostics,
  });

  const manifestFileId = readRequiredNonEmptyString({
    body: value,
    fileLabel: "index.json.projects[0]",
    key: "manifestFileId",
    diagnostics,
  });

  const assetsFolderId = readRequiredNonEmptyString({
    body: value,
    fileLabel: "index.json.projects[0]",
    key: "assetsFolderId",
    diagnostics,
  });

  const manifestPath = readRequiredNonEmptyString({
    body: value,
    fileLabel: "index.json.projects[0]",
    key: "manifestPath",
    diagnostics,
  });

  const createdAt = readRequiredIsoDateString({
    body: value,
    fileLabel: "index.json.projects[0]",
    key: "createdAt",
    diagnostics,
  });

  const updatedAt = readRequiredIsoDateString({
    body: value,
    fileLabel: "index.json.projects[0]",
    key: "updatedAt",
    diagnostics,
  });

  if (projectId && manifestPath !== `projects/${projectId}/manifest.json`) {
    diagnostics.push(
      "index.json.projects[0] の manifestPath が projectId と一致していません。",
    );
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
