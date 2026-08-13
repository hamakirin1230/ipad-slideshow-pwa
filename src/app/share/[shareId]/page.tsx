import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolvePublicPublication } from "@/lib/publication/public-publication-blob-server";
import { isValidPublicShareId } from "@/lib/publication/public-publication-contract";
import { PublicSlideshowViewer } from "./public-slideshow-viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "公開スライドショー",
  description: "共有されたスライドショーを再生します。",
  robots: { index: false, follow: false },
};

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  if (!isValidPublicShareId(shareId)) notFound();

  let manifest = null;
  try {
    manifest = await resolvePublicPublication(shareId);
  } catch {
    notFound();
  }
  if (!manifest) notFound();
  return <PublicSlideshowViewer manifest={manifest} />;
}
