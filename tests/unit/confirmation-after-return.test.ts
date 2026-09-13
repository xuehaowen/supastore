import { beforeEach, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const mocks=vi.hoisted(()=>({transaction:vi.fn(),funding:vi.fn()}));
vi.mock("@/infrastructure/db",()=>({db:{transaction:mocks.transaction}}));
vi.mock("@/infrastructure/auth/session",()=>({verifyStaffInTransaction:async()=>({userId:"owner",role:"owner"})}));
import { confirmOrder } from "@/application/use-cases/confirm-order";
let settled:number;
beforeEach(()=>{
 vi.clearAllMocks();settled=100;
 const tx={execute:async()=>[],select:()=>({from:(table:Parameters<typeof getTableName>[0])=>{
 const name=getTableName(table);const rows=name==="orders"?[{id:"order",lifecycleStatus:"unpaid",purchaseTotalCents:1000,guestEmail:"customer@example.test"}]:name==="payment_receipts"?[{id:"receipt",amountCents:1100}]:name==="payout_allocations"?[{receiptId:"receipt",paymentReturnId:"return",authorizedAmountCents:100,settledAmountCents:settled}]:name==="outbox_events"?[{value:1}]:[];
 const chain:any={where:()=>chain,limit:async()=>rows,for:()=>chain,then:(resolve:(rows:unknown[])=>void)=>Promise.resolve(rows).then(resolve)};return chain;
 }}),update:()=>({set:()=>({where:()=>({returning:async()=>[{id:"order",lifecycleStatus:"confirmed"}]})})}),insert:(table:Parameters<typeof getTableName>[0])=>({values:(value:unknown)=>{if(getTableName(table)==="confirmation_funding")mocks.funding(value);return {returning:async()=>[{id:"event"}]};}})};
 mocks.transaction.mockImplementation(async work=>work(tx));
});
it("confirms exact net payment after a settled excess return",async()=>{await expect(confirmOrder({orderId:"order",staffUserId:"owner"})).resolves.toMatchObject({isConfirmed:true});expect(mocks.funding).toHaveBeenCalledWith({orderId:"order",receiptId:"receipt",fundedAmountCents:1000});});
it("keeps confirmation blocked while an excess return is unsettled",async()=>{settled=0;await expect(confirmOrder({orderId:"order",staffUserId:"owner"})).rejects.toThrow();expect(mocks.funding).not.toHaveBeenCalled();});
