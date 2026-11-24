import { evaluateProviderReprice, REPRICE_REASONS } from "./itineraryRepricing";

describe("itinerary repricing (#917)", () => {
  it("allows capture when the provider price matches the accepted offer", () => {
    expect(evaluateProviderReprice(19900, 19900)).toEqual({
      action: "capture",
      reason: REPRICE_REASONS.MATCHES_ACCEPTED,
    });
  });

  it("stops before capture when the provider total changed", () => {
    const decision = evaluateProviderReprice(19900, 22100);
    expect(decision.action).toBe("require_traveler_confirmation");
    if (decision.action === "require_traveler_confirmation") {
      expect(decision.deltaCents).toBe(2200);
      expect(decision.reason).toBe(REPRICE_REASONS.REQUIRES_CONFIRMATION);
    }
  });
});
