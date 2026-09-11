export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs' && process.env.ENABLE_OUTBOX_WORKER==='true'){
  const {processOutboxBatch}=await import('./infrastructure/worker/outbox');
  const {smtpAdapter}=await import('./infrastructure/notifications/smtp');
  const {cleanupUploads}=await import('./application/use-cases/uploads/cleanup-uploads');
  let busy=false;let batches=0;
  const timer=setInterval(async()=>{if(busy)return;busy=true;try{await processOutboxBatch({adapter:smtpAdapter});if(++batches%12===0)await cleanupUploads();}catch{console.error('Outbox batch failed; retrying on next tick.');}finally{busy=false;}},5000);
  timer.unref();
 }
}

