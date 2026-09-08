import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireAuth } from "@/server/auth/context";
import { uploadFile } from "@/server/storage";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth();
    await enforceRateLimit(rateLimiters.upload(), `upload:${ctx.userId}`);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION", "No file provided");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError("VALIDATION", "File is too large");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await uploadFile({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      data: buffer,
      uploadedById: ctx.userId,
    });

    return ok({
      id: stored.id,
      filename: stored.filename,
      mimeType: stored.mimeType,
      size: stored.size,
    });
  });
}
