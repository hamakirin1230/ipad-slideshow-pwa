import { describe, expect, it } from "vitest";
import { getGooglePhotosPickerPlatform } from "./google-photos-picker-availability";
import { createGooglePhotosPickerHref } from "./google-photos-picker-link";

const PICKER_URI =
  "https://photos.google.com/picker/session-fixture?hl=ja&source=app";

describe("createGooglePhotosPickerHref", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5],
  ])("uses the raw full Picker URI on mobile", (userAgent, maxTouchPoints) => {
    const platform = getGooglePhotosPickerPlatform({
      userAgent,
      maxTouchPoints,
    });

    const href = createGooglePhotosPickerHref({
      pickerUri: PICKER_URI,
      platform,
    });

    expect(href).toBe(PICKER_URI);
    expect(new URL(href).pathname).not.toContain("/autoclose");
  });

  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0],
  ])(
    "keeps autoclose on supported desktop",
    (userAgent, maxTouchPoints) => {
      const platform = getGooglePhotosPickerPlatform({
        userAgent,
        maxTouchPoints,
      });
      const href = createGooglePhotosPickerHref({
        pickerUri: PICKER_URI,
        platform,
      });

      expect(href).toBe(
        "https://photos.google.com/picker/session-fixture/autoclose?hl=ja&source=app",
      );
      expect(new URL(href).searchParams.get("hl")).toBe("ja");
      expect(new URL(href).searchParams.get("source")).toBe("app");
    },
  );

  it.each([
    "not-a-url",
    "http://photos.google.com/picker/session-fixture",
    "https://user:secret@photos.google.com/picker/session-fixture",
  ])("rejects an unsafe Picker link", (pickerUri) => {
    expect(() =>
      createGooglePhotosPickerHref({ pickerUri, platform: "ios" }),
    ).toThrow("Photos Picker link is invalid.");
  });

  it("fails closed for an unsupported platform", () => {
    expect(() =>
      createGooglePhotosPickerHref({
        pickerUri: PICKER_URI,
        platform: "unsupported",
      }),
    ).toThrow("Photos Picker link is invalid.");
  });
});
