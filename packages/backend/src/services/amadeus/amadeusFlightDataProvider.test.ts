import { mapAmadeusOfferToFlight } from "./amadeusFlightDataProvider";
import type { AmadeusFlightData } from "../../types/flightSync";

function offer(overrides: Partial<AmadeusFlightData> = {}): AmadeusFlightData {
  return {
    id: "OFFER-123",
    type: "flight",
    source: { name: "amadeus" },
    instantTicketingRequired: false,
    nonHomogeneous: false,
    oneWay: true,
    lastTicketingDate: "2026-11-01",
    numberOfBookableSeats: 4,
    itineraries: [
      {
        duration: "PT8H",
        segments: [
          {
            departure: { iataCode: "JFK", at: "2026-11-15T10:00:00" },
            arrival: { iataCode: "LHR", at: "2026-11-15T22:00:00" },
            carrierCode: "AA",
            operatingAirline: { carrierCode: "BA" },
            aircraft: { code: "777" },
            operating: "777",
            number: "100",
            blacklistedInEU: false,
          },
        ],
      },
    ],
    price: { total: "400", base: "350", fee: "0", grandTotal: "400", currency: "USD" },
    pricingOptions: { fareType: ["published"], includedCheckedBagsOnly: true },
    validatingAirlineCodes: ["AA"],
    travelerPricings: [],
    ...overrides,
  };
}

describe("mapAmadeusOfferToFlight (#903 #914)", () => {
  it("preserves the provider offer id and both carriers", () => {
    const flight = mapAmadeusOfferToFlight(offer());
    expect(flight?.providerOfferId).toBe("OFFER-123");
    expect(flight?.marketingCarrier).toBe("AA");
    expect(flight?.operatingCarrier).toBe("BA");
    expect(flight?.segments?.[0]).toMatchObject({
      marketingCarrier: "AA",
      operatingCarrier: "BA",
    });
  });

  it("falls back to a synthesized id when the offer id is missing", () => {
    const flight = mapAmadeusOfferToFlight(offer({ id: "" }));
    expect(flight?.providerOfferId).toBe(flight?.id);
    expect(flight?.id).toContain("amadeus-AA100-");
  });
});
