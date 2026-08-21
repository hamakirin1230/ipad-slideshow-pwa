import { handleGoogleSessionCreate } from "@/lib/google-session/server-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleGoogleSessionCreate(request);
}
