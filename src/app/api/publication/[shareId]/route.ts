import { NextResponse } from "next/server";
import { resolvePublicPublication } from "@/lib/publication/public-publication-blob-server";
import { isValidPublicShareId } from "@/lib/publication/public-publication-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await context.params;
  if (!isValidPublicShareId(shareId)) {
    return NextResponse.json(
      { error: "公開URLが正しくありません。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const manifest = await resolvePublicPublication(shareId);
    if (!manifest) {
      return NextResponse.json(
        { error: "公開中の作品が見つかりません。" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(manifest, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "公開中の作品を読み込めませんでした。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
