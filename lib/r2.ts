import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const endpoint = process.env.R2_ENDPOINT;
const bucket = process.env.R2_BUCKET_NAME;
const publicUrl = process.env.R2_PUBLIC_URL;

if (!accessKeyId || !secretAccessKey || !endpoint || !bucket || !publicUrl) {
  // Environment validation will happen at runtime for actions that need R2.
  // We avoid throwing on import to keep build working when env is missing.
}

export function getR2Client() {
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("R2 credentials are not configured.");
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function getPublicUrl(key: string) {
  if (!publicUrl) throw new Error("R2_PUBLIC_URL is not configured.");
  return `${publicUrl.replace(/\/$/, "")}/${key}`;
}

export async function uploadToR2(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  if (!bucket) throw new Error("R2_BUCKET_NAME is not configured.");
  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ACL: "public-read",
    })
  );
}





