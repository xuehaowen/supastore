import { InvariantViolationError } from '@/application/common/errors';
export const MAX_EVIDENCE_SIZE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_EVIDENCE_MIME_TYPES = ['image/jpeg','image/png','image/webp'];
export function validateEvidence(bytes: Uint8Array, size: number, declaredSize: number, mime: string, declaredMime: string) {
  const signature = Buffer.from(bytes);
  const actual = signature.subarray(0,3).equals(Buffer.from([255,216,255])) ? 'image/jpeg'
    : signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : signature.toString('ascii',0,4)==='RIFF' && signature.toString('ascii',8,12)==='WEBP' ? 'image/webp' : '';
  if (size <= 0 || size >= MAX_EVIDENCE_SIZE_BYTES || size !== declaredSize || actual !== declaredMime || mime !== declaredMime) throw new InvariantViolationError('Invalid image. Upload a JPEG, PNG, or WebP smaller than 5 MB.');
  return actual;
}

