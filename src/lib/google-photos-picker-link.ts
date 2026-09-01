import type { GooglePhotosPickerPlatform } from "@/lib/google-photos-picker-availability";

export function createGooglePhotosPickerHref(input: {
  pickerUri: string;
  platform: GooglePhotosPickerPlatform;
}): string {
  const normalizedPickerUri = input.pickerUri.trim();
  let pickerUrl: URL;

  try {
    pickerUrl = new URL(normalizedPickerUri);
  } catch {
    throw new Error("Photos Picker link is invalid.");
  }

  if (
    pickerUrl.protocol !== "https:" ||
    pickerUrl.username !== "" ||
    pickerUrl.password !== ""
  ) {
    throw new Error("Photos Picker link is invalid.");
  }

  if (input.platform === "ios" || input.platform === "android") {
    return normalizedPickerUri;
  }

  if (input.platform !== "macos" && input.platform !== "windows") {
    throw new Error("Photos Picker link is invalid.");
  }

  pickerUrl.pathname = `${pickerUrl.pathname.replace(/\/+$/, "")}/autoclose`;
  pickerUrl.hash = "";
  return pickerUrl.toString();
}
