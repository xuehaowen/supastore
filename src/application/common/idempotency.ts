import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { operationRequests } from '@/infrastructure/db/schema';
import { ConflictError } from './errors';

export function computeInputFingerprint(input: unknown): string {
  const normalized = JSON.stringify(input, Object.keys(input as object).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export interface HandleIdempotencyOptions<TInput, TResult> {
  tx: PgTransaction<any, any, any>;
  requestKey?: string | undefined;
  actorScope: string;
  action: string;
  input: TInput;
  execute: () => Promise<TResult>;
}

export async function withIdempotency<TInput, TResult>(
  options: HandleIdempotencyOptions<TInput, TResult>
): Promise<TResult> {
  const { tx, requestKey, actorScope, action, input, execute } = options;

  if (!requestKey) {
    return await execute();
  }

  const fingerprint = computeInputFingerprint(input);

  // Check existing operation request
  const existing = await tx
    .select()
    .from(operationRequests)
    .where(
      and(
        eq(operationRequests.requestKey, requestKey),
        eq(operationRequests.actorScope, actorScope),
        eq(operationRequests.action, action)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const record = existing[0]!;
    if (record.inputFingerprint !== fingerprint) {
      throw new ConflictError(
        `Idempotency key '${requestKey}' was previously used with different input parameters.`
      );
    }
    if (record.status === 'completed' && record.resultPayload) {
      return record.resultPayload as TResult;
    }
    if (record.status === 'processing') {
      throw new ConflictError(
        `An operation with key '${requestKey}' is currently in progress. Please retry shortly.`
      );
    }
  }

  // Insert initial processing record
  const [newRecord] = await tx
    .insert(operationRequests)
    .values({
      requestKey,
      actorScope,
      action,
      inputFingerprint: fingerprint,
      status: 'processing',
    })
    .returning();

  try {
    const result = await execute();

    await tx
      .update(operationRequests)
      .set({
        status: 'completed',
        resultPayload: result as any,
        updatedAt: new Date(),
      })
      .where(eq(operationRequests.id, newRecord!.id));

    return result;
  } catch (error) {
    await tx
      .update(operationRequests)
      .set({
        status: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(operationRequests.id, newRecord!.id));

    throw error;
  }
}
