import { planGooglePhotosIncrementalSync } from "./sync-plan";
import { DEFAULT_PROJECT_SLIDE_CAPTION_STYLE as defaults } from "../project-slide-caption-style";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGooglePhotosSyncRenderIdentity,
  createGooglePhotosSyncSourceFingerprint,
  GOOGLE_PHOTOS_SYNC_FINGERPRINT_VERSION,
  GOOGLE_PHOTOS_SYNC_RENDERER_VERSION,
  type GooglePhotosSyncRenderInput,
} from "./render-key";

function renderInput(): GooglePhotosSyncRenderInput {
  return {
    slideId: "slide-1",
    assetFileId: "asset-1",
    sourceChecksum: "checksum-1",
    sourceModifiedTime: "2026-08-30T01:00:00.000Z",
    sourceSizeBytes: 1234,
    sourceMimeType: "image/jpeg",
    imageEdit: undefined,
    caption: "  朝の写真  ",
    outputMimeType: "image/jpeg",
  };
}

async function key(input: GooglePhotosSyncRenderInput, rendererVersion = GOOGLE_PHOTOS_SYNC_RENDERER_VERSION) {
  const result = await createGooglePhotosSyncRenderIdentity(input, {
    rendererVersion,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("fixture failed");
  return result.renderKey;
}

describe("Google Photos sync renderKey", () => {
  it("is deterministic, fixed-format, and has a known digest fixture", async () => {
    const first = await createGooglePhotosSyncRenderIdentity(renderInput());
    const second = await createGooglePhotosSyncRenderIdentity(renderInput());

    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, reuseEligible: true });
    if (!first.ok) return;
    expect(first.renderKey).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.renderKey).toBe(
      "sha256:3af565871309bcbef0108a4755b911aa92f99174ad0fe1402b54a333e68e5931",
    );
  });

  it.each([
    ["checksum", (value: GooglePhotosSyncRenderInput) => (value.sourceChecksum = "checksum-2")],
    ["asset", (value: GooglePhotosSyncRenderInput) => (value.assetFileId = "asset-2")],
    ["size", (value: GooglePhotosSyncRenderInput) => (value.sourceSizeBytes = 4321)],
    ["source MIME", (value: GooglePhotosSyncRenderInput) => (value.sourceMimeType = "image/png")],
    ["rotation", (value: GooglePhotosSyncRenderInput) => (value.imageEdit = { rotation: 90 })],
    [
      "crop",
      (value: GooglePhotosSyncRenderInput) =>
        (value.imageEdit = {
          rotation: 0,
          crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
        }),
    ],
    ["caption", (value: GooglePhotosSyncRenderInput) => (value.caption = "別の写真")],
    ["output MIME", (value: GooglePhotosSyncRenderInput) => (value.outputMimeType = "image/png")],
    ["slide", (value: GooglePhotosSyncRenderInput) => (value.slideId = "slide-2")],
  ])("changes when %s changes", async (_label, mutate) => {
    const original = renderInput();
    const changed = renderInput();
    mutate(changed);
    expect(await key(changed)).not.toBe(await key(original));
  });

  it("changes when the renderer contract version changes", async () => {
    expect(await key(renderInput(), 3)).not.toBe(await key(renderInput(), 2));
    expect(GOOGLE_PHOTOS_SYNC_RENDERER_VERSION).toBe(3);
  });

  it("uses trimmed caption authority", async () => {
    const trimmed = renderInput();
    trimmed.caption = "朝の写真";
    expect(await key(trimmed)).toBe(await key(renderInput()));
  });

  it("canonicalizes undefined, zero rotation, and full crop as the same no-op", async () => {
    const zero = renderInput();
    zero.imageEdit = { rotation: 0 };
    const fullCrop = renderInput();
    fullCrop.imageEdit = {
      rotation: 0,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    };
    expect(await key(zero)).toBe(await key(renderInput()));
    expect(await key(fullCrop)).toBe(await key(renderInput()));
  });

  it("marks checksum-backed sources reusable and missing checksums unsafe to reuse", async () => {
    const withChecksum = await createGooglePhotosSyncRenderIdentity(renderInput());
    const withoutChecksumInput = renderInput();
    withoutChecksumInput.sourceChecksum = null;
    const withoutChecksum = await createGooglePhotosSyncRenderIdentity(
      withoutChecksumInput,
    );
    expect(withChecksum).toMatchObject({ ok: true, reuseEligible: true });
    expect(withoutChecksum).toMatchObject({ ok: true, reuseEligible: false });
  });

  it("uses modifiedTime only as a checksum-missing fallback", async () => {
    const checksumBacked = renderInput();
    const checksumBackedChanged = renderInput();
    checksumBackedChanged.sourceModifiedTime = "2026-08-31T01:00:00.000Z";
    expect(await key(checksumBackedChanged)).toBe(await key(checksumBacked));

    const missingChecksum = renderInput();
    missingChecksum.sourceChecksum = null;
    const missingChecksumChanged = { ...missingChecksum };
    missingChecksumChanged.sourceModifiedTime = "2026-08-31T01:00:00.000Z";
    expect(await key(missingChecksumChanged)).not.toBe(await key(missingChecksum));
  });

  it("rejects blank checksums instead of treating them as missing", async () => {
    const input = renderInput();
    input.sourceChecksum = " ";
    await expect(createGooglePhotosSyncRenderIdentity(input)).resolves.toEqual({
      ok: false,
      reason: "invalidInput",
    });
  });

  it("keeps order, duration, transition, title, filename, and slideIndex out of the input contract", () => {
    expect(Object.keys(renderInput())).not.toEqual(
      expect.arrayContaining([
        "projectTitle",
        "slideOrder",
        "duration",
        "transition",
        "transitionStrength",
        "fileName",
        "slideIndex",
        "publicationRevision",
      ]),
    );
  });
});

describe("Google Photos sync source fingerprint", () => {
  const KEY_A = `sha256:${"a".repeat(64)}`;
  const KEY_B = `sha256:${"b".repeat(64)}`;

  function fingerprintInput() {
    return {
      targetAlbumTitle: "作品",
      slides: [
        { slideId: "slide-1", renderKey: KEY_A, reuseEligible: true },
        { slideId: "slide-2", renderKey: KEY_B, reuseEligible: true },
      ],
    };
  }

  async function fingerprint(input = fingerprintInput()) {
    const result = await createGooglePhotosSyncSourceFingerprint(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("fixture failed");
    return result.sourceFingerprint;
  }

  it("is deterministic and fixed-format", async () => {
    expect(await fingerprint()).toBe(await fingerprint());
    expect(await fingerprint()).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(GOOGLE_PHOTOS_SYNC_FINGERPRINT_VERSION).toBe(1);
  });

  it.each([
    ["rename", (value: ReturnType<typeof fingerprintInput>) => (value.targetAlbumTitle = "改名")],
    [
      "add",
      (value: ReturnType<typeof fingerprintInput>) =>
        value.slides.push({
          slideId: "slide-3",
          renderKey: `sha256:${"c".repeat(64)}`,
          reuseEligible: true,
        }),
    ],
    ["delete", (value: ReturnType<typeof fingerprintInput>) => value.slides.pop()],
    ["reorder", (value: ReturnType<typeof fingerprintInput>) => value.slides.reverse()],
    ["renderKey", (value: ReturnType<typeof fingerprintInput>) => (value.slides[0]!.renderKey = KEY_B)],
    ["reuse eligibility", (value: ReturnType<typeof fingerprintInput>) => (value.slides[0]!.reuseEligible = false)],
  ])("changes on %s", async (_label, mutate) => {
    const changed = fingerprintInput();
    mutate(changed);
    expect(await fingerprint(changed)).not.toBe(await fingerprint());
  });

  it("has no duration, transition, or publication state input", () => {
    expect(Object.keys(fingerprintInput())).toEqual([
      "targetAlbumTitle",
      "slides",
    ]);
    expect(Object.keys(fingerprintInput().slides[0]!)).toEqual([
      "slideId",
      "renderKey",
      "reuseEligible",
    ]);
  });
});

describe("Google Photos sync render identity security", () => {
  it("uses browser Web Crypto without runtime IO or public diagnostics", () => {
    const source = readFileSync(new URL("./render-key.ts", import.meta.url), "utf8");
    for (const forbidden of [
      "node:crypto",
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

 it("does not reuse the actual legacy renderer v1 digest", async () => {
  expect(await key(renderInput())).not.toBe("sha256:4a428d36c4fe2b4a72f96f9ef934fa2cebfe402d9d1d549990867a6b66e887c4");
 });
 it.each([
  { ...defaults, position: "top" as const },
  { ...defaults, shape: "band" as const },
  { ...defaults, size: "large" as const },
  { ...defaults, colorPreset: "yellowOnBlack" as const },
 ])("changes render identity for each album style dimension %#", async (captionStyle) => {
  expect(await key({ ...renderInput(), captionStyle })).not.toBe(await key(renderInput()));
 });
 it("treats absent and explicit default style as the same identity", async () => {
  expect(await key({ ...renderInput(), captionStyle: defaults })).toBe(await key(renderInput()));
 });
 it.each([null, {}, { ...defaults, position: "invalid" }, { ...defaults, extra: true }])("rejects invalid caption style %#", async (captionStyle) => {
  expect(await createGooglePhotosSyncRenderIdentity({ ...renderInput(), captionStyle: captionStyle as never })).toEqual({ ok: false, reason: "invalidInput" });
 });

it("recreates unchanged styles rendered by v2 and retains current-version reuse", async () => {
 const original = renderInput();
 const legacyKey = await key(original, 2);
 expect(legacyKey).toBe("sha256:38a0c938c1907a1c74cc5b1080eeeb4e1d04f71c738b46019e262e19f577feec");
 const currentKey = await key(original);
 expect(currentKey).not.toBe(legacyKey);
 const plan = async (storedKey: string) => {
  const result = await planGooglePhotosIncrementalSync({ targetAlbumTitle: "作品", currentGoogleAlbumTitle: "作品",
   desiredSlides: [{ slideId: original.slideId, renderKey: currentKey, reuseEligible: true }],
   stableManagedItems: [{ slideId: original.slideId, renderKey: storedKey, mediaItemId: "fixture-media", snapshot: null }],
   currentAlbumMediaItemIds: ["fixture-media"],
  });
  if (!result.ok) throw new Error("expected plan");
  return result.plan;
 };
 const changed = await plan(legacyKey);
 expect(changed.createItems).toHaveLength(1);
 expect(changed.targetItems[0]?.kind).toBe("create");
 const unchanged = await plan(currentKey);
 expect(unchanged.createItems).toHaveLength(0);
 expect(unchanged.targetItems[0]?.kind).toBe("reuse");
});
