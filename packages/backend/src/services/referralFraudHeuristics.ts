export type ReferralFraudSignal =
  | "self_referral"
  | "one_time_use_anomaly"
  | "ip_cluster";

export interface ReferralFraudInput {
  referrerId: string;
  refereeId?: string;
  refereeIp?: string;
  selfReferralByIp?: boolean;
  /** Recent referral events associated with this IP, supplied by the caller's analytics window. */
  recentIpEventCount?: number;
  /** Number of prior conversion attempts for this referee. */
  priorConversionCount?: number;
}

/** Non-blocking referral risk signals. These flags never decide eligibility. */
export function detectReferralFraud(
  input: ReferralFraudInput,
): ReferralFraudSignal[] {
  const signals: ReferralFraudSignal[] = [];
  if (
    (input.refereeId && input.refereeId === input.referrerId) ||
    input.selfReferralByIp
  )
    signals.push("self_referral");
  if ((input.priorConversionCount ?? 0) > 0)
    signals.push("one_time_use_anomaly");
  if (input.refereeIp && (input.recentIpEventCount ?? 0) >= 3)
    signals.push("ip_cluster");
  return signals;
}
