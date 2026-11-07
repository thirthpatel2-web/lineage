import sharp from "sharp";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { embedImage } from "@/lib/ai/embed";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const PHOTO_FORMATS = new Set(["jpeg", "png", "webp", "heif", "gif", "avif"]);

/** An error whose message is safe and useful to show to the person who caused it. */
export class UserError extends Error {}

/** Read an uploaded file, refusing oversized ones before loading them into memory. */
export async function readUpload(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) throw new UserError("That photo is larger than 12 MB.");
  return Buffer.from(await file.arrayBuffer());
}

/** Normalise an upload (respect EXIF rotation, cap at 1024px, JPEG) and compute its embedding. */
export async function prepareImage(input: Buffer) {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new Error("Image is larger than 12 MB");
  const meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata().catch(() => null);
  if (!meta?.format || !PHOTO_FORMATS.has(meta.format)) throw new UserError("Please upload a JPEG, PNG, WebP, HEIC or GIF photo.");
  const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height, embedding: await embedImage(data) };
}

export async function storeImage(input: Buffer, kind: (typeof schema.images.$inferInsert)["kind"], patternId?: string) {
  const { bytes: data, width, height, embedding } = await prepareImage(input);
  const info = { width, height };
  const db = await getDb();
  const row = {
    id: `img_${nanoid(12)}`,
    patternId: patternId ?? null,
    kind,
    mime: "image/jpeg",
    bytes: data,
    width: info.width,
    height: info.height,
    embedding,
  };
  await db.insert(schema.images).values(row);
  return row;
}

export const imageUrl = (id: string | null | undefined) => (id ? `/api/images/${id}` : undefined);
