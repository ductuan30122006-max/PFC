import { NextResponse } from "next/server";
import { readLocalObject, storageMode } from "@/platform/uploads/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Development file server for uploads (production serves files directly from Vercel Blob). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (storageMode() !== "local") return new NextResponse(null, { status: 404 });
  const { key } = await params;
  const k = key.join("/");
  const data = await readLocalObject(k);
  if (!data) return new NextResponse(null, { status: 404 });
  const pdf = k.endsWith(".pdf");
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": pdf ? "application/pdf" : "image/webp",
      ...(pdf ? { "content-disposition": 'inline; filename="tai-lieu.pdf"' } : {}),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": pdf ? "default-src 'none'; sandbox" : "default-src 'none'; img-src 'self'; style-src 'none'; sandbox",
    },
  });
}
