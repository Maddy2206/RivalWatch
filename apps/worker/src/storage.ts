import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { hasR2Config, loadEnv, requireEnv } from "@rivalwatch/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

/** Raw-HTML archive. Keys look like `raw/<pageId>/<timestamp>.html`. */
export interface Storage {
  put(key: string, content: string): Promise<void>;
  get(key: string): Promise<string>;
}

function safeRelativeKey(key: string): string {
  const normalized = normalize(key);
  if (normalized.startsWith("..") || normalized.startsWith("/")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return normalized;
}

export class LocalFsStorage implements Storage {
  constructor(private readonly baseDir: string) {}

  async put(key: string, content: string): Promise<void> {
    const path = join(this.baseDir, safeRelativeKey(key));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }

  async get(key: string): Promise<string> {
    return readFile(join(this.baseDir, safeRelativeKey(key)), "utf8");
  }
}

export class R2Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const accountId = requireEnv("R2_ACCOUNT_ID");
    this.bucket = requireEnv("R2_BUCKET");
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  async put(key: string, content: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: "text/html; charset=utf-8",
      }),
    );
  }

  async get(key: string): Promise<string> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error(`Empty storage object: ${key}`);
    return result.Body.transformToString();
  }
}

/** R2 when fully configured, local filesystem otherwise (local-first dev). */
export function makeStorage(): Storage {
  if (hasR2Config()) return new R2Storage();
  return new LocalFsStorage(loadEnv().STORAGE_DIR);
}
