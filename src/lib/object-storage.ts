import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
const region = process.env.S3_REGION ?? "us-east-1";
const accessKeyId = process.env.S3_ACCESS_KEY ?? "workhub";
const secretAccessKey = process.env.S3_SECRET_KEY ?? "workhub-secret";
export const attachmentBucket = process.env.S3_BUCKET ?? "workhub";

const s3 = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

let bucketReady: Promise<void> | null = null;

async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: attachmentBucket }));
      } catch {
        await s3.send(new CreateBucketCommand({ Bucket: attachmentBucket }));
      }
    })();
  }
  return bucketReady;
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "attachment.bin";
}

export function attachmentStorageKey(workspaceId: string, ownerType: "issue" | "page", ownerId: string, filename: string) {
  return `${workspaceId}/${ownerType}/${ownerId}/${Date.now()}-${crypto.randomUUID()}-${safeName(filename)}`;
}

export async function putAttachmentObject(input: { key: string; file: File; contentType: string }) {
  await ensureBucket();
  const body = Buffer.from(await input.file.arrayBuffer());
  await s3.send(new PutObjectCommand({ Bucket: attachmentBucket, Key: input.key, Body: body, ContentType: input.contentType }));
}

export async function getAttachmentObject(key: string) {
  await ensureBucket();
  const result = await s3.send(new GetObjectCommand({ Bucket: attachmentBucket, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  return { bytes: bytes ? Buffer.from(bytes) : Buffer.alloc(0), contentType: result.ContentType ?? "application/octet-stream" };
}
