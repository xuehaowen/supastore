import { beforeEach, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const mocks=vi.hoisted(()=>({transaction:vi.fn(),insert:vi.fn()}));
vi.mock("@/infrastructure/db",()=>({db:{transaction:mocks.transaction}}));
vi.mock("@/infrastructure/auth/session",()=>({verifyStaffInTransaction:async()=>({userId:"owner",role:"owner"})}));
import { authorizeSurplusReturn } from "@/application/use-cases/orders/surplus-return";
let lifecycle:string,receiptOrder:string,correction:number;
beforeEach(()=>{
 vi.clearAllMocks();lifecycle="unpaid";receiptOrder="order";correction=0;
 const tx={execute:async()=>[],select:()=>({from:(table:Parameters<typeof getTableName>[0])=>{
 const name=getTableName(table);const rows=name==="orders"?[{id:"order",lifecycleStatus:lifecycle,purchaseTotalCents:1000}]:name==="payment_receipts"?[{id:"receipt",orderId:receiptOrder,amountCents:1100}]:name==="payment_receipt_corrections"?[{receiptId:"receipt",deltaAmountCents:correction}]:name==="confirmation_funding" && lifecycle==="confirmed"?[{receiptId:"receipt",fundedAmountCents:1000}]:[];
 const chain:any={where:()=>chain,limit:async()=>rows,then:(resolve:(rows:unknown[])=>void)=>Promise.resolve(rows).then(resolve)};return chain;
 }}),insert:(table:Parameters<typeof getTableName>[0])=>({values:(value:unknown)=>{mocks.insert(getTableName(table),value);return {returning:async()=>[{id:"return",reason:"Surplus"}]};}})};
 mocks.transaction.mockImplementation(async work=>work(tx));
});
const request=(amountCents=100)=>authorizeSurplusReturn({orderId:"order",receiptId:"receipt",amountCents,ownerUserId:"owner",reason:"Surplus"});
it("allows only the actual unpaid surplus",async()=>{await expect(request()).resolves.toMatchObject({amountCents:100});});
it.each(["unpaid","confirmed"])("rejects spending purchase funds as surplus on %s orders",async status=>{lifecycle=status;await expect(request(101)).rejects.toThrow(/surplus|excess|capacity/i);expect(mocks.insert).not.toHaveBeenCalled();});
it("rejects a receipt belonging to another order",async()=>{receiptOrder="other";await expect(request()).rejects.toThrow(/receipt|order/i);expect(mocks.insert).not.toHaveBeenCalled();});
it("uses corrected receipt value when checking surplus",async()=>{correction=-100;await expect(request()).rejects.toThrow(/surplus|excess|capacity/i);expect(mocks.insert).not.toHaveBeenCalled();});
it("allows remaining funds to be returned after cancellation",async()=>{lifecycle="cancelled";await expect(request(1100)).resolves.toMatchObject({kind:"late_return",amountCents:1100});});
