import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  planGooglePhotosIncrementalSync,
  type GooglePhotosSyncDesiredItem,
} from "./sync-plan";
import type { GooglePhotosSyncManagedItem } from "./sync-binding";

const KEY_A = `sha256:${"a".repeat(64)}`;
const KEY_B = `sha256:${"b".repeat(64)}`;
const KEY_C = `sha256:${"c".repeat(64)}`;

function desired(
  slideId: string,
  renderKey: string,
  reuseEligible = true,
): GooglePhotosSyncDesiredItem {
  return { slideId, renderKey, reuseEligible };
}

function stable(
  slideId: string,
  renderKey: string,
  mediaItemId: string,
): GooglePhotosSyncManagedItem {
  return { slideId, renderKey, mediaItemId };
}

function baseInput() {
  return {
    targetAlbumTitle: "作品",
    currentGoogleAlbumTitle: "作品",
    desiredSlides: [desired("slide-1", KEY_A), desired("slide-2", KEY_B)],
    stableManagedItems: [
      stable("slide-1", KEY_A, "media-1"),
      stable("slide-2", KEY_B, "media-2"),
    ],
    currentAlbumMediaItemIds: ["media-1", "media-2"],
  };
}

async function plan(input = baseInput()) {
  const result = await planGooglePhotosIncrementalSync(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("fixture failed");
  return result.plan;
}

describe("Google Photos incremental sync planner", () => {
  it("rejects an empty desired list as no exportable photos", async () => {
    const input = baseInput();
    input.desiredSlides = [];
    await expect(planGooglePhotosIncrementalSync(input)).resolves.toEqual({
      ok: false,
      reason: "noExportablePhotos",
    });
  });

  it("distinguishes a malformed desired collection from an empty target", async () => {
    const input = baseInput();
    (input as unknown as Record<string, unknown>).desiredSlides = null;
    await expect(planGooglePhotosIncrementalSync(input)).resolves.toEqual({
      ok: false,
      reason: "invalidDesiredItems",
    });
  });

  it("produces a complete no-op when title, render keys, membership, and order match", async () => {
    const result = await plan();
    expect(result.targetItems).toEqual([
      { kind: "reuse", slideId: "slide-1", renderKey: KEY_A, mediaItemId: "media-1" },
      { kind: "reuse", slideId: "slide-2", renderKey: KEY_B, mediaItemId: "media-2" },
    ]);
    expect(result.createItems).toEqual([]);
    expect(result.removeManagedMediaItemIds).toEqual([]);
    expect(result.membershipNeedsRebuild).toBe(false);
    expect(result.titleNeedsUpdate).toBe(false);
    expect(result.sourceFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("plans rename-only without touching image membership", async () => {
    const input = baseInput();
    input.targetAlbumTitle = "改名後";
    const result = await plan(input);
    expect(result.createItems).toEqual([]);
    expect(result.membershipNeedsRebuild).toBe(false);
    expect(result.removeManagedMediaItemIds).toEqual([]);
    expect(result.titleNeedsUpdate).toBe(true);
  });

  it("appends a new slide in desired order", async () => {
    const input = baseInput();
    input.desiredSlides.push(desired("slide-3", KEY_C));
    const result = await plan(input);
    expect(result.targetItems.map((item) => item.slideId)).toEqual([
      "slide-1",
      "slide-2",
      "slide-3",
    ]);
    expect(result.createItems).toEqual([
      { kind: "create", slideId: "slide-3", renderKey: KEY_C },
    ]);
    expect(result.membershipNeedsRebuild).toBe(true);
  });

  it("inserts new slides while preserving exact create and target order", async () => {
    const input = baseInput();
    input.desiredSlides = [
      desired("slide-3", KEY_C),
      desired("slide-1", KEY_A),
      desired("slide-4", `sha256:${"d".repeat(64)}`),
      desired("slide-2", KEY_B),
    ];
    const result = await plan(input);
    expect(result.targetItems.map((item) => item.slideId)).toEqual([
      "slide-3",
      "slide-1",
      "slide-4",
      "slide-2",
    ]);
    expect(result.createItems.map((item) => item.slideId)).toEqual([
      "slide-3",
      "slide-4",
    ]);
  });

  it("deletes only managed membership and never removes unmanaged items", async () => {
    const input = baseInput();
    input.desiredSlides = [desired("slide-1", KEY_A)];
    input.currentAlbumMediaItemIds = ["unmanaged-a", "media-1", "unmanaged-b", "media-2"];
    const result = await plan(input);
    expect(result.createItems).toEqual([]);
    expect(result.membershipNeedsRebuild).toBe(true);
    expect(result.removeManagedMediaItemIds).toEqual(["media-1", "media-2"]);
    expect(result.removeManagedMediaItemIds).not.toEqual(
      expect.arrayContaining(["unmanaged-a", "unmanaged-b"]),
    );
  });

  it.each([
    ["image edit", KEY_C],
    ["caption", `sha256:${"d".repeat(64)}`],
  ])("creates a replacement when %s changes the renderKey", async (_label, changedKey) => {
    const input = baseInput();
    input.desiredSlides[0]!.renderKey = changedKey;
    const result = await plan(input);
    expect(result.targetItems[0]).toEqual({
      kind: "create",
      slideId: "slide-1",
      renderKey: changedKey,
    });
    expect(result.createItems).toHaveLength(1);
    expect(result.removeManagedMediaItemIds).toEqual(["media-1", "media-2"]);
  });

  it("reorders managed items without recreating images", async () => {
    const input = baseInput();
    input.desiredSlides.reverse();
    const result = await plan(input);
    expect(result.createItems).toEqual([]);
    expect(result.targetItems.map((item) => item.mediaItemId)).toEqual([
      "media-2",
      "media-1",
    ]);
    expect(result.membershipNeedsRebuild).toBe(true);
    expect(result.removeManagedMediaItemIds).toEqual(["media-1", "media-2"]);
  });

  it("does not reuse a matching key when the checksum was unavailable", async () => {
    const input = baseInput();
    input.desiredSlides[0]!.reuseEligible = false;
    const result = await plan(input);
    expect(result.targetItems[0]?.kind).toBe("create");
    expect(result.createItems.map((item) => item.slideId)).toEqual(["slide-1"]);
  });

  it("creates a replacement when a mapped item is externally missing", async () => {
    const input = baseInput();
    input.currentAlbumMediaItemIds = ["media-2"];
    const result = await plan(input);
    expect(result.targetItems[0]?.kind).toBe("create");
    expect(result.createItems.map((item) => item.slideId)).toEqual(["slide-1"]);
    expect(result.removeManagedMediaItemIds).toEqual(["media-2"]);
  });

  it("ignores unmanaged items while comparing managed relative order", async () => {
    const input = baseInput();
    input.currentAlbumMediaItemIds = [
      "unmanaged-a",
      "media-1",
      "unmanaged-b",
      "media-2",
    ];
    const result = await plan(input);
    expect(result.membershipNeedsRebuild).toBe(false);
    expect(result.removeManagedMediaItemIds).toEqual([]);
    expect(result.targetItems).toHaveLength(2);
  });

  it.each([
    [
      "duplicateDesiredSlideId",
      (input: ReturnType<typeof baseInput>) =>
        input.desiredSlides.push(desired("slide-1", KEY_C)),
    ],
    [
      "duplicateStableSlideId",
      (input: ReturnType<typeof baseInput>) =>
        input.stableManagedItems.push(stable("slide-1", KEY_C, "media-3")),
    ],
    [
      "duplicateStableMediaItemId",
      (input: ReturnType<typeof baseInput>) =>
        input.stableManagedItems.push(stable("slide-3", KEY_C, "media-1")),
    ],
    [
      "duplicateCurrentMediaItemId",
      (input: ReturnType<typeof baseInput>) =>
        input.currentAlbumMediaItemIds.push("media-1"),
    ],
  ])("fails closed with safe reason %s", async (reason, mutate) => {
    const input = baseInput();
    mutate(input);
    const result = await planGooglePhotosIncrementalSync(input);
    expect(result).toEqual({ ok: false, reason });
    expect(JSON.stringify(result)).not.toMatch(/slide-|media-|sha256:/);
  });

  it("rejects malformed desired reuse eligibility and target title safely", async () => {
    const malformed = baseInput();
    (malformed.desiredSlides[0] as unknown as Record<string, unknown>).reuseEligible = "yes";
    await expect(planGooglePhotosIncrementalSync(malformed)).resolves.toEqual({
      ok: false,
      reason: "invalidDesiredItems",
    });

    const title = baseInput();
    title.targetAlbumTitle = " title ";
    await expect(planGooglePhotosIncrementalSync(title)).resolves.toEqual({
      ok: false,
      reason: "invalidTargetTitle",
    });
  });

  it("changes sourceFingerprint across rename, add, delete, edit, and reorder", async () => {
    const original = await plan();
    const variants = [
      (() => {
        const value = baseInput();
        value.targetAlbumTitle = "改名";
        return value;
      })(),
      (() => {
        const value = baseInput();
        value.desiredSlides.push(desired("slide-3", KEY_C));
        return value;
      })(),
      (() => {
        const value = baseInput();
        value.desiredSlides.pop();
        return value;
      })(),
      (() => {
        const value = baseInput();
        value.desiredSlides[0]!.renderKey = KEY_C;
        return value;
      })(),
      (() => {
        const value = baseInput();
        value.desiredSlides.reverse();
        return value;
      })(),
    ];
    for (const variant of variants) {
      expect((await plan(variant)).sourceFingerprint).not.toBe(
        original.sourceFingerprint,
      );
    }
  });
});

describe("Google Photos incremental sync planner security", () => {
  it("is pure and does not accept tokens or perform runtime IO", () => {
    const source = readFileSync(new URL("./sync-plan.ts", import.meta.url), "utf8");
    for (const forbidden of [
      "fetch(",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "console.log",
      "console.error",
      "console.warn",
      "setTimeout",
      "accessToken",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
