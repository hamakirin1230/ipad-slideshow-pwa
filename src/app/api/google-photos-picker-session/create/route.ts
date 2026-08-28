import { handleGooglePhotosPickerSessionCreate } from "@/lib/google-photos-picker-session/server-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleGooglePhotosPickerSessionCreate(request);
}
