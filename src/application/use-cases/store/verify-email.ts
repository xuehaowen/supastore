import { randomBytes,randomUUID } from 'node:crypto';
import { and,eq,gt } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import { verification,storeSettings } from '@/infrastructure/db/schema';
import { verifyStaffInTransaction } from '@/infrastructure/auth/session';
import { hashToken } from '@/application/common/guest-access';
import { smtpAdapter } from '@/infrastructure/notifications/smtp';
import { InvariantViolationError } from '@/application/common/errors';
export async function requestEmailVerification(staffUserId:string){
 const token=randomBytes(32).toString('hex');
 const recipient=await db.transaction(async tx=>{
  const staff=await verifyStaffInTransaction(tx,staffUserId,'owner');
  await tx.insert(verification).values({id:randomUUID(),identifier:'store-email:'+staffUserId,value:hashToken(token),expiresAt:new Date(Date.now()+86400000)});
  return staff.email;
 });
 await smtpAdapter.sendEmail({recipient,subject:'Verify store email delivery',template:'store.email_verification',data:{verificationUrl:(process.env.BETTER_AUTH_URL??'http://localhost:3000')+'/admin/setup/verify-email?token='+token}});
}
export async function verifyEmailDelivery(staffUserId:string,token:string){
 return db.transaction(async tx=>{
  await verifyStaffInTransaction(tx,staffUserId,'owner');
  const [proof]=await tx.delete(verification).where(and(eq(verification.identifier,'store-email:'+staffUserId),eq(verification.value,hashToken(token)),gt(verification.expiresAt,new Date()))).returning();
  if(!proof)throw new InvariantViolationError('Verification link expired or already used.');
  await tx.update(storeSettings).set({emailVerifiedAt:new Date()});
 });
}

