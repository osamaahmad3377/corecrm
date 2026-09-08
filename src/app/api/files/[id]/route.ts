import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireAuth } from "@/server/auth/context";
import { canAccessFile } from "@/server/services/file-access";
import { readFileBytes } from "@/server/storage";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const ctx = await requireAuth();
    const { id } = await params;

    if (!(await canAccessFile(ctx, id))) {
      throw new AppError("FORBIDDEN", "You can't access this file");
    }

    const file = await readFileBytes(id);
    if (!file) throw new AppError("NOT_FOUND", "File not found");

    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(
          file.filename,
        )}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
