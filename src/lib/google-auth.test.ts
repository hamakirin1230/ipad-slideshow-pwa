import { describe, expect, it } from "vitest";
import {
  classifyPhotosPickerOauthPopupFailure,
  getPhotosPickerOauthPopupFailureCopy,
} from "./google-auth";

const RAW_ERROR_LEAKS = [
  "popup_failed_to_open",
  "popup_closed",
  "access_token",
  "error_description",
  "error_uri",
];

describe("Photos Picker OAuth popup failure classification", () => {
  it("classifies popup_failed_to_open", () => {
    expect(
      classifyPhotosPickerOauthPopupFailure({ type: "popup_failed_to_open" }),
    ).toBe("popupFailedToOpen");
    expect(
      getPhotosPickerOauthPopupFailureCopy({ type: "popup_failed_to_open" }),
    ).toEqual({
      category: "popupFailedToOpen",
      message: "Google Photosの利用許可画面を開けませんでした。",
      diagnostic: "Google Photosの利用許可画面を開けませんでした。",
    });
  });

  it("classifies popup_closed", () => {
    expect(
      classifyPhotosPickerOauthPopupFailure({ type: "popup_closed" }),
    ).toBe("popupClosed");
    expect(getPhotosPickerOauthPopupFailureCopy({ type: "popup_closed" })).toEqual({
      category: "popupClosed",
      message: "Google Photosの利用許可画面が完了前に閉じられました。",
      diagnostic: "Google Photosの利用許可画面が完了前に閉じられました。",
    });
  });

  it("classifies unknown", () => {
    expect(classifyPhotosPickerOauthPopupFailure({ type: "unknown" })).toBe(
      "unknownPopupFailure",
    );
    expect(getPhotosPickerOauthPopupFailureCopy({ type: "unknown" })).toEqual({
      category: "unknownPopupFailure",
      message: "Google Photosの利用許可を完了できませんでした。",
      diagnostic: "Google Photosの利用許可を完了できませんでした。",
    });
  });

  it("classifies a missing error argument as unknownPopupFailure", () => {
    expect(classifyPhotosPickerOauthPopupFailure()).toBe("unknownPopupFailure");
    expect(classifyPhotosPickerOauthPopupFailure(null)).toBe(
      "unknownPopupFailure",
    );
    expect(classifyPhotosPickerOauthPopupFailure({})).toBe(
      "unknownPopupFailure",
    );
    expect(getPhotosPickerOauthPopupFailureCopy()).toMatchObject({
      category: "unknownPopupFailure",
      message: "Google Photosの利用許可を完了できませんでした。",
    });
  });

  it("does not put token or raw error type into user-facing copy", () => {
    const copies = [
      getPhotosPickerOauthPopupFailureCopy({ type: "popup_failed_to_open" }),
      getPhotosPickerOauthPopupFailureCopy({ type: "popup_closed" }),
      getPhotosPickerOauthPopupFailureCopy({ type: "unknown" }),
      getPhotosPickerOauthPopupFailureCopy(),
    ];

    for (const copy of copies) {
      const text = `${copy.message}\n${copy.diagnostic}`;
      for (const leak of RAW_ERROR_LEAKS) {
        expect(text).not.toContain(leak);
      }
    }
  });
});
