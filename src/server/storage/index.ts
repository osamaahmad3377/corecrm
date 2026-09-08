import "server-only";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { env, features } from "@/lib/env";
import {
  ALLOWED_UPLOAD_EXT,
  ALLOWED_UPLOAD_MIME,
  MAX_UPLOAD_BYTES,
} from "@/lib/constants";
import { validationError } from "@/lib/errors";
import { prisma } from "@/server/db/client";

/**
 * Object-storage abstraction. Uses Vercel Blob in production; on-disk fallback
 * for local development (never used on Vercel — the FS is read-only there).
 * Files are private: downloads go through an authorization-checked route.
 */

export interface StoredFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  provider: "LOCAL" | "VERCEL_BLOB";
  url: string | null;
}

interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<{ url: string | null }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  readonly kind: "LOCAL" | "VERCEL_BLOB";
}

const LOCAL_DIR = path.join(process.cwd(), ".uploads");

const localProvider: StorageProvider = {
  kind: "LOCAL",
  async put(key, data) {
    const full = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return { url: null };
  },
  async get(key) {
    return fs.readFile(path.join(LOCAL_DIR, key));
  },
  async delete(key) {
    await fs.rm(path.join(LOCAL_DIR, key), { force: true });
  },
};

function makeBlobProvider(): StorageProvider {
  return {
    kind: "VERCEL_BLOB",
    async put(key, data, contentType) {
      const { put } = await import("@vercel/blob");
      const res = await put(key, data, {
        access: "public",
        contentType,
        token: env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: false,
      });
      return { url: res.url };
    },
    async get(key) {
      // Stored URL is used for retrieval; fetch by key path from the store.
      const { head } = await import("@vercel/blob");
      const meta = await head(key, { token: env.BLOB_READ_WRITE_TOKEN });
      const res = await fetch(meta.url);
      return Buffer.from(await res.arrayBuffer());
    },
    async delete(key) {
      const { del } = await import("@vercel/blob");
      await del(key, { token: env.BLOB_READ_WRITE_TOKEN });
    },
  };
}

export function getStorage(): StorageProvider {
  return features.blobStorage ? makeBlobProvider() : localProvider;
}

function validate(filename: string, mimeType: string, size: number) {
  if (size <= 0) throw validationError("Empty file");
  if (size > MAX_UPLOAD_BYTES) {
    throw validationError(
      `File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`,
    );
  }
  const ext = path.extname(filename).toLowerCase();
  const mimeOk = (ALLOWED_UPLOAD_MIME as readonly string[]).includes(mimeType);
  const extOk = (ALLOWED_UPLOAD_EXT as readonly string[]).includes(ext);
  if (!mimeOk && !extOk) {
    throw validationError(`Unsupported file type: ${ext || mimeType}`);
  }
}

export async function uploadFile(opts: {
  filename: string;
  mimeType: string;
  data: Buffer;
  uploadedById: string | null;
}): Promise<StoredFile> {
  validate(opts.filename, opts.mimeType, opts.data.length);

  const storage = getStorage();
  const safeName = opts.filename.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const key = `uploads/${new Date().getUTCFullYear()}/${nanoid(16)}-${safeName}`;
  const checksum = createHash("sha256").update(opts.data).digest("hex");

  const { url } = await storage.put(key, opts.data, opts.mimeType);

  const file = await prisma.file.create({
    data: {
      filename: opts.filename.slice(0, 200),
      mimeType: opts.mimeType,
      size: opts.data.length,
      storageKey: key,
      provider: storage.kind,
      url,
      checksum,
      uploadedById: opts.uploadedById,
    },
  });

  return {
    id: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    size: file.size,
    storageKey: file.storageKey,
    provider: file.provider as "LOCAL" | "VERCEL_BLOB",
    url: file.url,
  };
}

export async function readFileBytes(fileId: string): Promise<{
  data: Buffer;
  filename: string;
  mimeType: string;
} | null> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) return null;
  const storage = getStorage();
  const data =
    file.provider === "VERCEL_BLOB" && file.url
      ? Buffer.from(await (await fetch(file.url)).arrayBuffer())
      : await storage.get(file.storageKey);
  return { data, filename: file.filename, mimeType: file.mimeType };
}
