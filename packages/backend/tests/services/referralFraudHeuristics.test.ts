import { detectReferralFraud } from "../../src/services/referralFraudHeuristics";

describe("referral fraud heuristics", () => {
  it("flags self-referral without making a blocking decision", () => {
    expect(
      detectReferralFraud({ referrerId: "wallet-1", refereeId: "wallet-1" }),
    ).toEqual(["self_referral"]);
  });

  it("flags repeated one-time conversion attempts and clustered IP activity", () => {
    expect(
      detectReferralFraud({
        referrerId: "wallet-1",
        refereeId: "user-2",
        refereeIp: "203.0.113.10",
        recentIpEventCount: 3,
        priorConversionCount: 1,
      }),
    ).toEqual(["one_time_use_anomaly", "ip_cluster"]);
  });

  it("does not flag ordinary referral signals", () => {
    expect(
      detectReferralFraud({ referrerId: "wallet-1", refereeId: "user-2" }),
    ).toEqual([]);
  });
});
