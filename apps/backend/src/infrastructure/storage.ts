import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const clientOptions = {
  region: process.env.S3_REGION ?? "us-east-1",
  ...(process.env.S3_ENDPOINT
    ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
    : {}),
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
};
export const storage = new S3Client(clientOptions);
// Browser signatures must use their final host; rewriting a signed URL breaks it.
const signingStorage = process.env.S3_PUBLIC_ENDPOINT
  ? new S3Client({
      ...clientOptions,
      endpoint: process.env.S3_PUBLIC_ENDPOINT,
      forcePathStyle: true,
    })
  : storage;
const bucket = () => {
  const name = process.env.S3_BUCKET_PRIVATE ?? process.env.S3_BUCKET;
  if (!name) throw new Error("S3_BUCKET_PRIVATE is required.");
  return name;
};
export async function presignUpload(key: string, mime: string, size: number) {
  return getSignedUrl(
    signingStorage,
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: mime,
      ContentLength: size,
    }),
    { expiresIn: 900 },
  );
}

export async function putUpload(key: string, mime: string, body: Uint8Array) {
  const bucketName = bucket();
  try {
    await storage.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: mime,
        ContentLength: body.byteLength,
        Body: body,
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name !== "NoSuchBucket") throw error;
    await storage.send(new CreateBucketCommand({ Bucket: bucketName }));
    await storage.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: mime,
        ContentLength: body.byteLength,
        Body: body,
      }),
    );
  }
}
export async function copyCandidate(stagingKey: string, candidateKey: string) {
  await storage.send(
    new CopyObjectCommand({
      Bucket: bucket(),
      Key: candidateKey,
      CopySource:
        bucket() +
        "/" +
        stagingKey.split("/").map(encodeURIComponent).join("/"),
    }),
  );
  const head = await storage.send(
    new HeadObjectCommand({ Bucket: bucket(), Key: candidateKey }),
  );
  const body = await storage.send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: candidateKey,
      Range: "bytes=0-2047",
    }),
  );
  return {
    size: head.ContentLength ?? 0,
    mime: head.ContentType ?? "",
    bytes: await body.Body!.transformToByteArray(),
  };
}
export async function presignDownload(key: string) {
  return getSignedUrl(
    signingStorage,
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: 60 },
  );
}

export async function deleteObject(key: string) {
  await storage.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function presignAsset(
  key: string,
  options: { internal?: boolean } = {},
) {
  const name = process.env.S3_BUCKET_PUBLIC;
  if (!name) throw new Error("S3_BUCKET_PUBLIC is required.");
  return getSignedUrl(
    options.internal ? storage : signingStorage,
    new GetObjectCommand({ Bucket: name, Key: key }),
    { expiresIn: 300 },
  );
}
export async function putCatalogAsset(
  key: string,
  mime: string,
  body: Uint8Array,
) {
  const name = process.env.S3_BUCKET_PUBLIC;
  if (!name) throw new Error("S3_BUCKET_PUBLIC is required.");
  await storage.send(
    new PutObjectCommand({
      Bucket: name,
      Key: key,
      ContentType: mime,
      ContentLength: body.byteLength,
      Body: body,
    }),
  );
}
export async function deleteCatalogAsset(key: string) {
  const name = process.env.S3_BUCKET_PUBLIC;
  if (
    !name ||
    !/^catalog\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(key)
  )
    throw new Error("Invalid managed catalog asset.");
  await storage.send(new DeleteObjectCommand({ Bucket: name, Key: key }));
}
