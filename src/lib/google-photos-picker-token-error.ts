import type { GoogleTokenError } from "./google-auth";

export type GooglePhotosPickerTokenFailureReason =
  | "popupBlocked"
  | "popupClosed"
  | "unknown"
  | "denied"
  | "timeout";

export type GooglePhotosPickerTokenFailure = {
  status: "cancelled" | "error";
  reason: GooglePhotosPickerTokenFailureReason;
  message: string;
  diagnostics: string[];
};

export function classifyGooglePhotosPickerTokenError(
  error?: GoogleTokenError,
): GooglePhotosPickerTokenFailure {
  switch (error?.type) {
    case "popup_failed_to_open":
      return createGooglePhotosPickerTokenFailure("popupBlocked");
    case "popup_closed":
      return createGooglePhotosPickerTokenFailure("popupClosed");
    default:
      return createGooglePhotosPickerTokenFailure("unknown");
  }
}

export function createGooglePhotosPickerTokenFailure(
  reason: GooglePhotosPickerTokenFailureReason,
): GooglePhotosPickerTokenFailure {
  switch (reason) {
    case "popupBlocked":
      return {
        status: "error",
        reason,
        message:
          "Googleの認証画面を開けませんでした。ブラウザの設定を確認して再度お試しください。",
        diagnostics: ["Google Photosの認証画面を開けませんでした。"],
      };
    case "popupClosed":
      return {
        status: "cancelled",
        reason,
        message: "Googleの認証画面が閉じられたため、接続できませんでした。",
        diagnostics: ["Google Photosの認証画面が完了前に閉じられました。"],
      };
    case "denied":
      return {
        status: "cancelled",
        reason,
        message: "Googleフォトの利用は許可されませんでした。",
        diagnostics: ["Google Photosの利用が許可されませんでした。"],
      };
    case "timeout":
      return {
        status: "cancelled",
        reason,
        message:
          "Googleフォトの認証待ちが時間切れになりました。もう一度お試しください。",
        diagnostics: ["Google Photosの認証待ちが時間切れになりました。"],
      };
    case "unknown":
      return {
        status: "error",
        reason,
        message:
          "Googleフォトへの接続を完了できませんでした。もう一度お試しください。",
        diagnostics: ["Google Photosの認証開始で不明なエラーが発生しました。"],
      };
  }
}
