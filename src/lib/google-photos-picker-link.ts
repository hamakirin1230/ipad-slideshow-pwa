export function createGooglePhotosPickerAutocloseHref(
  pickerUri: string,
): string {
  let pickerUrl: URL;

  try {
    pickerUrl = new URL(pickerUri);
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

  pickerUrl.pathname = `${pickerUrl.pathname.replace(/\/+$/, "")}/autoclose`;
  pickerUrl.hash = "";
  return pickerUrl.toString();
}
