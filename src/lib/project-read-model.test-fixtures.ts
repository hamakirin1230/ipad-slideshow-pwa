import type { DriveProjectSummary, ProjectManifest } from "./google-drive";

export const workspaceId = "11111111-1111-4111-8111-111111111111";
export const projectId = "22222222-2222-4222-8222-222222222222";
export const createdAt = "2026-08-22T00:00:00.000Z";
export const updatedAt = "2026-08-22T01:00:00.000Z";

export function projectReadFixture() {
  const project: DriveProjectSummary = {
    projectId, title: "一覧の作品", projectFolderId: "fixture-project",
    manifestFileId: "fixture-manifest", assetsFolderId: "fixture-assets",
    manifestPath: `projects/${projectId}/manifest.json`, createdAt, updatedAt,
  };
  const manifest: ProjectManifest = {
    app: "ipad-slideshow-pwa", role: "projectManifest", schemaVersion: 1,
    workspaceId, projectId, title: project.title, createdAt, updatedAt,
    slides: [{
      slideId: "55555555-5555-4555-8555-555555555555",
      assetId: "33333333-3333-4333-8333-333333333333",
      assetFileId: "fixture-photo", assetName: "photo.jpg", type: "image",
      mimeType: "image/jpeg", source: "localFile", sourceMimeType: "image/jpeg",
      sourceMediaItemId: "fixture-source", fileSize: 1200, durationSeconds: 10,
      caption: "内容を確認", createdAt, updatedAt,
    }],
  };
  const index = {
    app: "ipad-slideshow-pwa", role: "index", schemaVersion: 1,
    workspaceId, createdAt, updatedAt, projects: [project],
  };
  const metadata = [
    { id: project.projectFolderId, name: projectId, role: "projectRoot", parent: "fixture-projects", folder: true },
    { id: project.manifestFileId, name: "manifest.json", role: "projectManifest", parent: project.projectFolderId, folder: false },
    { id: project.assetsFolderId, name: "assets", role: "assetsRoot", parent: project.projectFolderId, folder: true },
  ].map(({ id, name, role, parent, folder }) => ({
    id, name, mimeType: folder ? "application/vnd.google-apps.folder" : "application/json",
    parents: [parent], trashed: false,
    appProperties: { app: "ipad-slideshow-pwa", role, schemaVersion: "1", workspaceId, projectId },
  }));
  async function fetchFixture(url: string | URL | Request, init?: RequestInit) {
    if ((init?.method ?? "GET") !== "GET") throw new Error("Fixture forbids writes");
    const parsed = new URL(String(url));
    const id = parsed.pathname.split("/").at(-1);
    if (parsed.searchParams.get("alt") === "media") {
      if (id === "fixture-index") return new Response(JSON.stringify(index));
      if (id === project.manifestFileId) return new Response(JSON.stringify(manifest));
    }
    const file = metadata.find((item) => item.id === id);
    if (!file) throw new Error("Unexpected fixture read");
    return Response.json(file);
  }
  return { project, manifest, index, metadata, fetchFixture };
}
