import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { requireViewer } from "@/lib/auth";
import { badRequest, json, route } from "@/lib/api";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;

/** Extension is derived from the sniffed type, never from the uploaded name. */
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Stores an avatar on the local filesystem under /public/uploads.
 *
 * Fine for self-hosting and development. A deployment on ephemeral or
 * multi-instance infrastructure should swap this for object storage — the
 * route's contract (multipart in, `{ url }` out) is what the client depends on.
 */
export const POST = route(async (request: Request) => {
  await requireViewer();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("No file was uploaded.");
  if (file.size === 0) throw badRequest("That file is empty.");
  if (file.size > MAX_BYTES) throw badRequest("Images must be 4 MB or smaller.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = sniffImageType(bytes);
  if (!detected) throw badRequest("Only PNG, JPEG, WebP and GIF images are supported.");

  const extension = ALLOWED[detected];
  const name = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${extension}`;
  const dir = path.join(process.cwd(), "public", "uploads");

  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);

  return json({ url: `/uploads/${name}` }, { status: 201 });
});

/** Magic-number check so a renamed executable can't be stored as an image. */
function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
