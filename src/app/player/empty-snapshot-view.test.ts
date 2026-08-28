import { describe, expect, it } from "vitest";
import { getPlayerEmptySnapshotView } from "./empty-snapshot-view";

describe("getPlayerEmptySnapshotView", () => {
  it("sends a first-time disconnected user to settings, not admin", () => {
    const view = getPlayerEmptySnapshotView({
      googleStatus: "notConnected",
      isOnline: true,
    });

    expect(view.title).toBe("まだGoogleとつながっていません");
    expect(view.primaryHref).toBe("/settings");
    expect(view.primaryLabel).toBe("Googleアカウントでつなぐ");
    expect(view.guidanceItems.map((item) => item.title)).not.toContain(
      "削除後なら正常な状態です",
    );
    expect(JSON.stringify(view)).not.toContain("プロジェクト");
  });

  it("asks a connected user to save locally", () => {
    const view = getPlayerEmptySnapshotView({
      googleStatus: "connected",
      isOnline: true,
    });

    expect(view.title).toBe("ローカルにはまだ再生用コピーがありません");
    expect(view.primaryHref).toBe("/admin");
    expect(view.primaryHash).toBe("device");
    expect(view.primaryLabel).toBe("ローカルに保存する");
    expect(view.guidanceItems.map((item) => item.title)).not.toContain(
      "削除後なら正常な状態です",
    );
  });

  it("keeps offline recovery separate from first-run connect copy", () => {
    const view = getPlayerEmptySnapshotView({
      googleStatus: "notConnected",
      isOnline: false,
    });

    expect(view.title).toContain("オフライン再生");
    expect(view.primaryHref).toBe("/admin");
    expect(view.guidanceItems[1]?.title).toContain("Googleアカウントでつなぎます");
  });
});
