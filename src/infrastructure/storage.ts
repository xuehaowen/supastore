import { S3Client, DeleteObjectCommand, PutObjectCommand, CopyObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
export const storage = new S3Client({
  region:process.env.S3_REGION ?? 'us-east-1',
  ...(process.env.S3_ENDPOINT ? {endpoint:process.env.S3_ENDPOINT,forcePathStyle:true}:{}),
  credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID ?? '',secretAccessKey:process.env.S3_SECRET_ACCESS_KEY ?? ''},
});
const bucket = () => { if (!process.env.S3_BUCKET) throw new Error('S3_BUCKET is required.'); return process.env.S3_BUCKET; };
export async function presignUpload(key: string, mime: string, size: number) {
  return getSignedUrl(storage,new PutObjectCommand({Bucket:bucket(),Key:key,ContentType:mime,ContentLength:size}),{expiresIn:900});
}
export async function copyCandidate(stagingKey: string, candidateKey: string) {
  await storage.send(new CopyObjectCommand({Bucket:bucket(),Key:candidateKey,CopySource:bucket()+'/'+stagingKey.split('/').map(encodeURIComponent).join('/')}));
  const head = await storage.send(new HeadObjectCommand({Bucket:bucket(),Key:candidateKey}));
  const body = await storage.send(new GetObjectCommand({Bucket:bucket(),Key:candidateKey,Range:'bytes=0-2047'}));
  return { size:head.ContentLength ?? 0,mime:head.ContentType ?? '',bytes:await body.Body!.transformToByteArray() };
}
export async function presignDownload(key: string) {
  return getSignedUrl(storage,new GetObjectCommand({Bucket:bucket(),Key:key,ResponseContentDisposition:'attachment'}),{expiresIn:60});
}


export async function deleteObject(key:string){await storage.send(new DeleteObjectCommand({Bucket:bucket(),Key:key}));}
