import {describe, expect, it} from "vitest";
import {commercePolicy, rewardsActive, rewardMerchandiseEligible} from "@/domain/commerce-policy";
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
describe("reward policy dates and category eligibility", () => {
  it("keeps neutral defaults and excludes products regardless of category", () => {
    const policy = commercePolicy({});
    expect(rewardsActive(policy, new Date())).toBe(false);
    expect(rewardMerchandiseEligible(policy, true, [])).toBe(true);
    expect(rewardMerchandiseEligible(policy, false, [a])).toBe(false);
  });
  it("includes direct membership in any selected category and excludes uncategorized products", () => {
    const policy = commercePolicy({rewardEligibleCategoryIds: [a]});
    expect(rewardMerchandiseEligible(policy, true, [b, a])).toBe(true);
    expect(rewardMerchandiseEligible(policy, true, [b])).toBe(false);
    expect(rewardMerchandiseEligible(policy, true, [])).toBe(false);
    expect(rewardMerchandiseEligible(policy, false, [a])).toBe(false);
  });
  it("uses inclusive start and exclusive end UTC instants", () => {
    const policy = commercePolicy({rewardsEnabled: true, rewardsStartAt: "2026-10-01T00:00:00Z", rewardsEndAt: "2026-11-01T00:00:00Z"});
    expect(rewardsActive(policy, new Date("2026-09-30T23:59:59.999Z"))).toBe(false);
    expect(rewardsActive(policy, new Date("2026-10-01T00:00:00Z"))).toBe(true);
    expect(rewardsActive(policy, new Date("2026-10-31T23:59:59.999Z"))).toBe(true);
    expect(rewardsActive(policy, new Date("2026-11-01T00:00:00Z"))).toBe(false);
  });
  it.each([{rewardsStartAt: "2026-02-30T00:00:00Z"}, {rewardsStartAt: "2026-10-01"}, {rewardsStartAt: "2026-10-01T00:00:00+01:00"},
    {rewardsStartAt: "2026-11-01T00:00:00Z", rewardsEndAt: "2026-10-01T00:00:00Z"}, {rewardEligibleCategoryIds: [a, a]}, {rewardEligibleCategoryIds: ["unknown"]}])("rejects malformed policy %j", input => {
    expect(() => commercePolicy(input)).toThrow();
  });
});
