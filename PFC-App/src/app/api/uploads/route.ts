import { NextResponse, type NextRequest } from "next/server";
import { currentMember, toActor } from "@/platform/auth/session";
import { ActionError } from "@/platform/errors";
import { MAX_UPLOAD_BYTES } from "@/platform/uploads/image";
import { UPLOAD_PURPOSES, saveImage, type UploadPurpose } from "@/platform/uploads/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/** POST multipart/form-data { file, purpose } → { id, url, width, height }. Signed-in members only. */
export async function POST(req: NextRequest) {
  const me = await currentMember();
  if (!me) return json({ error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." }, 401);
  // Same-origin only (the session cookie is SameSite=Lax; this blocks cross-site form posts outright).
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return json({ error: "Nguồn yêu cầu không hợp lệ." }, 403);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: "Ảnh tối đa 8 MB." }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Dữ liệu tải lên không hợp lệ." }, 400);
  }
  const purpose = String(form.get("purpose") ?? "");
  const file = form.get("file");
  if (!(UPLOAD_PURPOSES as readonly string[]).includes(purpose)) return json({ error: "Mục đích tải lên không hợp lệ." }, 400);
  if (!(file instanceof File)) return json({ error: "Chưa chọn ảnh." }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: "Ảnh tối đa 8 MB." }, 413);

  try {
    const up = await saveImage(toActor(me), purpose as UploadPurpose, Buffer.from(await file.arrayBuffer()));
    return json(up, 201);
  } catch (err) {
    if (err instanceof ActionError) return json({ error: err.message, code: err.code }, err.code === "rate_limited" ? 429 : 400);
    console.error("[upload]", err);
    return json({ error: "Không tải được ảnh. Vui lòng thử lại." }, 500);
  }
}
