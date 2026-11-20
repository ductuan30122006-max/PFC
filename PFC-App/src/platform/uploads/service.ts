import "server-only";
import { randomUUID } from "node:crypto";
import { all, run } from "@/platform/db/client";
import { audit } from "@/platform/audit";
import { ActionError } from "@/platform/errors";
import { allowAttempt } from "@/platform/rate-limit";
import type { Actor } from "@/platform/roles";
import { ImageRejected, processImage } from "./image";
import { putObject } from "./storage";

export const UPLOAD_PURPOSES = ["listing", "avatar", "post", "project", "event"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];
export type Upload = { id: string; url: string; width: number; height: number };

/** Validates, cleans and stores one image for the signed-in member. 60 uploads / hour / member. */
export async function saveImage(actor: Actor, purpose: UploadPurpose, input: Buffer): Promise<Upload> {
  if (!(await allowAttempt(`upload:${actor.id}`, 60, 60 * 60_000))) throw new ActionError("Bạn tải ảnh quá nhiều. Vui lòng thử lại sau.", "rate_limited");
  let img;
  try {
    img = await processImage(input, { square: purpose === "avatar" });
  } catch (err) {
    if (err instanceof ImageRejected) throw new ActionError(err.message, "invalid_image");
    throw err;
  }
  const id = randomUUID();
  const key = `${purpose}/${id}.webp`;
  const url = await putObject(key, img.data, img.mime);
  await run("INSERT INTO uploads (id, owner_id, purpose, mime, bytes, width, height, storage_key, url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
    id,
    actor.id,
    purpose,
    img.mime,
    img.data.length,
    img.width,
    img.height,
    key,
    url,
    new Date().toISOString(),
  ]);
  await audit(actor.id, "upload.create", `upload:${id}`, "success");
  return { id, url, width: img.width, height: img.height };
}

/**
 * Turns upload ids sent by a form into URLs, accepting only the actor's own uploads for that purpose.
 * A form can therefore never attach someone else's file or an arbitrary external URL.
 */
export async function ownUploadUrls(actor: Actor, purpose: UploadPurpose, ids: unknown, max: number): Promise<string[]> {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  if (ids.length > max) throw new ActionError(`Tối đa ${max} ảnh.`);
  const clean = ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x));
  if (clean.length !== ids.length) throw new ActionError("Ảnh không hợp lệ.");
  const rows = await all<{ id: string; url: string }>(
    `SELECT id, url FROM uploads WHERE owner_id = ? AND purpose = ? AND id IN (${clean.map(() => "?").join(",")})`,
    [actor.id, purpose, ...clean],
  );
  const byId = new Map(rows.map((r) => [r.id, r.url]));
  if (byId.size !== new Set(clean).size) throw new ActionError("Ảnh không hợp lệ hoặc không phải của bạn.");
  return [...new Set(clean)].map((id) => byId.get(id)!);
}

/**
 * Same check as ownUploadUrls, for forms that send back the image URLs they show
 * (e.g. an edit form keeping some old photos and adding new ones). Order is preserved.
 */
export async function verifyOwnUploadUrls(actor: Actor, purpose: UploadPurpose, urls: unknown, max: number): Promise<string[]> {
  if (urls === undefined || urls === null) return [];
  if (!Array.isArray(urls) || urls.some((u) => typeof u !== "string" || u.length > 500)) throw new ActionError("Ảnh không hợp lệ.");
  const clean = [...new Set(urls as string[])];
  if (clean.length > max) throw new ActionError(`Tối đa ${max} ảnh.`);
  if (clean.length === 0) return [];
  const rows = await all<{ url: string }>(
    `SELECT url FROM uploads WHERE owner_id = ? AND purpose = ? AND url IN (${clean.map(() => "?").join(",")})`,
    [actor.id, purpose, ...clean],
  );
  if (rows.length !== clean.length) throw new ActionError("Ảnh không hợp lệ hoặc không phải của bạn.");
  return clean;
}
