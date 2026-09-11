import { randomUUID } from 'node:crypto';
import { db } from '@/infrastructure/db';
import { paymentUploadIntents } from '@/infrastructure/db/schema';
import { verifyOrderAccess } from '@/application/common/guest-access';
import { InvariantViolationError } from '@/application/common/errors';
import { presignUpload } from '@/infrastructure/storage';
import { MAX_EVIDENCE_SIZE_BYTES, ALLOWED_EVIDENCE_MIME_TYPES } from '@/domain/evidence';
export { MAX_EVIDENCE_SIZE_BYTES, ALLOWED_EVIDENCE_MIME_TYPES } from '@/domain/evidence';
export async function createUploadIntent(input: { orderId: string; sessionToken: string; declaredMimeType: string; declaredSizeBytes: number }) {
  if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(input.declaredMimeType) || !Number.isInteger(input.declaredSizeBytes) || input.declaredSizeBytes <= 0 || input.declaredSizeBytes >= MAX_EVIDENCE_SIZE_BYTES) throw new InvariantViolationError('Choose a JPEG, PNG, or WebP image smaller than 5 MB.');
  const intent = await db.transaction(async tx => {
    await verifyOrderAccess(tx,input.orderId,input.sessionToken);
    const [intent] = await tx.insert(paymentUploadIntents).values({orderId:input.orderId,s3Key:'staging/'+randomUUID(),declaredMimeType:input.declaredMimeType,declaredSizeBytes:input.declaredSizeBytes,expiresAt:new Date(Date.now()+900000)}).returning();
    return intent!;
  });
  return {intentId:intent.id,uploadUrl:await presignUpload(intent.s3Key,input.declaredMimeType,input.declaredSizeBytes)};
}

