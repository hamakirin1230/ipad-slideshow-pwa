import { describe, expect, it } from "vitest";
import {
  classifyGooglePhotosPickerTokenError,
  createGooglePhotosPickerTokenFailure,
} from "./google-photos-picker-token-error";

describe("Google Photos Picker token error classification", () => {
  it.each([
    ["popup_failed_to_open", "popupBlocked", "error"],
    ["popup_closed", "popupClosed", "cancelled"],
    ["unknown", "unknown", "error"],
    [undefined, "unknown", "error"],
  ] as const)("classifies %s safely", (type, reason, status) => {
    const failure = classifyGooglePhotosPickerTokenError(
      type === undefined ? undefined : { type },
    );

    expect(failure.reason).toBe(reason);
    expect(failure.status).toBe(status);
    expect(`${failure.message}\n${failure.diagnostics.join("\n")}`).not.toMatch(
      /token|credential|https?:\/\/|error_description/i,
    );
  });

  it.each([
    ["denied", "cancelled"],
    ["timeout", "cancelled"],
  ] as const)("keeps %s distinct", (reason, status) => {
    const failure = createGooglePhotosPickerTokenFailure(reason);

    expect(failure.reason).toBe(reason);
    expect(failure.status).toBe(status);
  });
});
