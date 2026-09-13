import { beforeEach, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const mocks=vi.hoisted(()=>({transaction:vi.fn(),funding:vi.fn()}));
vi.mock("@/infrastructure/db",()=>({db:{transaction:mocks.transaction}}));
vi.mock("@/infrastructure/auth/session",()=>({verifyStaffInTransaction:async()=>({userId:"owner",role:"owner"})}));
import { confirmOrder } from "@/application/use-cases/confirm-order";
let settled:number;
let held=false;
beforeEach(()=>{
 vi.clearAllMocks();settled=100;held=false;
 const tx={execute:async()=>[],select:()=>({from:(table:Parameters<typeof getTableName>[0])=>{
 const name=getTableName(table);const rows=name==="orders"?[{id:"order",lifecycleStatus:"unpaid",purchaseTotalCents:1000,guestEmail:"customer@example.test"}]:name==="payment_receipts"?[{id:"receipt",amountCents:1100}]:name==="payout_allocations"?[{id:"allocation",receiptId:"receipt",paymentReturnId:"return",authorizedAmountCents:100,settledAmountCents:settled}]:name==="payout_attempts" && held?[{id:"attempt",allocationId:"allocation",status:"reconciliation_required"}]:name==="outbox_events"?[{value:1}]:[];
 const chain:any={where:()=>chain,limit:async()=>rows,for:()=>chain,then:(resolve:(rows:unknown[])=>void)=>Promise.resolve(rows).then(resolve)};return chain;
 }}),update:()=>({set:()=>({where:()=>({returning:async()=>[{id:"order",lifecycleStatus:"confirmed"}]})})}),insert:(table:Parameters<typeof getTableName>[0])=>({values:(value:unknown)=>{if(getTableName(table)==="confirmation_funding")mocks.funding(value);return {returning:async()=>[{id:"event"}]};}})};
 mocks.transaction.mockImplementation(async work=>work(tx));
});
it("confirms exact net payment after a settled excess return",async()=>{await expect(confirmOrder({orderId:"order",staffUserId:"owner"})).resolves.toMatchObject({isConfirmed:true});expect(mocks.funding).toHaveBeenCalledWith({orderId:"order",receiptId:"receipt",fundedAmountCents:1000});});
it("keeps confirmation blocked while an excess return is unsettled",async()=>{settled=0;await expect(confirmOrder({orderId:"order",staffUserId:"owner"})).rejects.toThrow();expect(mocks.funding).not.toHaveBeenCalled();});

it("blocks exact funding while a payout discrepancy is unresolved, then confirms after resolution",async()=>{held=true;await expect(confirmOrder({orderId:"order",staffUserId:"owner"})).rejects.toThrow(/hold|payout/i);expect(mocks.funding).not.toHaveBeenCalled();held=false;await expect(confirmOrder({orderId:"order",staffUserId:"owner"})).resolves.toMatchObject({isConfirmed:true});});
