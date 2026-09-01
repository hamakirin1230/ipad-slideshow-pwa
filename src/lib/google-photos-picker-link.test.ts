import { describe, expect, it } from "vitest";
import { createGooglePhotosPickerAutocloseHref } from "./google-photos-picker-link";

describe("createGooglePhotosPickerAutocloseHref", () => {
  it("creates the official web autoclose link without exposing it as text", () => {
    expect(
      createGooglePhotosPickerAutocloseHref(
        "https://photos.google.com/picker/session-fixture",
      ),
    ).toBe("https://photos.google.com/picker/session-fixture/autoclose");
  });

  it("preserves query parameters while appending autoclose to the path", () => {
    expect(
      createGooglePhotosPickerAutocloseHref(
        "https://photos.google.com/picker/session-fixture?hl=ja",
      ),
    ).toBe("https://photos.google.com/picker/session-fixture/autoclose?hl=ja");
  });

  it.each([
    "not-a-url",
    "http://photos.google.com/picker/session-fixture",
    "https://user:secret@photos.google.com/picker/session-fixture",
  ])("rejects an unsafe Picker link", (pickerUri) => {
    expect(() => createGooglePhotosPickerAutocloseHref(pickerUri)).toThrow(
      "Photos Picker link is invalid.",
    );
  });
});
