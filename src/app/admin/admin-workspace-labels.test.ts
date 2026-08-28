import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const workspace = read("./admin-workspace.tsx");
const projects = read("./project-status-panel.tsx");
const device = read("./offline-sync-panel.tsx");
const uniqueness = read("../../lib/project-title-uniqueness.ts");

describe("admin album and local labels", () => {
  it("shows main tabs as アルバム / スライド / ローカル / 公開 without changing tab ids", () => {
    const tabBlock = workspace.slice(
      workspace.indexOf("const workspaceTabs = ["),
      workspace.indexOf("] as const;"),
    );
    const labels = [...tabBlock.matchAll(/label: "([^"]+)"/g)].map(
      (match) => match[1],
    );
    const ids = [...tabBlock.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);

    expect(labels).toEqual(["アルバム", "スライド", "ローカル", "公開"]);
    expect(ids).toEqual(["project", "edit", "device", "publish"]);
    expect(tabBlock).not.toContain('label: "作品"');
    expect(tabBlock).not.toContain('label: "この端末"');
  });

  it("does not keep the old visible tab order 作品 / スライド / 公開 / この端末", () => {
    const tabBlock = workspace.slice(
      workspace.indexOf("const workspaceTabs = ["),
      workspace.indexOf("] as const;"),
    );
    expect(tabBlock).not.toMatch(
      /label: "作品"[\s\S]*label: "スライド"[\s\S]*label: "公開"[\s\S]*label: "この端末"/,
    );
    expect(workspace.indexOf('id="project"')).toBeLessThan(
      workspace.indexOf('id="edit"'),
    );
    expect(workspace.indexOf('id="edit"')).toBeLessThan(
      workspace.indexOf('id="device"'),
    );
    expect(workspace.indexOf('id="device"')).toBeLessThan(
      workspace.indexOf('id="publish"'),
    );
  });

  it("updates create / rename visible labels and the duplicate title message", () => {
    expect(projects).toContain("アルバム名");
    expect(projects).toContain("新しいアルバムを作成");
    expect(projects).toContain("選択中のアルバム名を変更");
    expect(projects).not.toContain("作品名");
    expect(projects).not.toContain("新しい作品を作成");
    expect(uniqueness).toContain(
      '"同じ名前のアルバムがすでにあります。別の名前を入力してください。"',
    );
    expect(uniqueness).not.toContain("同じ名前の作品がすでにあります");
  });

  it("updates local panel visible and accessible labels", () => {
    expect(device).toContain("ローカルに保存");
    expect(device).toContain("このアルバムを再生");
    expect(device).toContain('aria-label="ローカルへの保存進捗"');
    expect(device).not.toContain("この端末に保存");
    expect(device).not.toContain("この作品を再生");
    expect(workspace).toContain("ローカルに保存");
    expect(workspace).toContain("ローカルで再生できるようにする");
  });

  it("keeps the internal project model, routes, and tab state keys", () => {
    expect(workspace).toContain('{ id: "project", label: "アルバム" }');
    expect(workspace).toContain('{ id: "device", label: "ローカル" }');
    expect(workspace).toContain('selectTab("device")');
    expect(workspace).toContain("<ProjectStatusPanel />");
    expect(uniqueness).toContain("hasConflictingProjectTitle");
    expect(projects).toContain("selectedProjectId");
    expect(projects).toContain("createProject(");
  });
});
