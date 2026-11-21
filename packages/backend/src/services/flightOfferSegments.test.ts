import { hasMixedCabin, retainSegmentFareAndCabin } from "./flightOfferSegments";
import type { AmadeusFlightData } from "../types/flightSync";

function offer(): AmadeusFlightData {
  return {
    id: "1",
    type: "flight",
    source: { name: "amadeus" },
    instantTicketingRequired: false,
    nonHomogeneous: true,
    oneWay: false,
    lastTicketingDate: "2026-10-01",
    numberOfBookableSeats: 4,
    itineraries: [
      {
        duration: "PT5H",
        segments: [
          {
            departure: { iataCode: "JFK", at: "2026-11-01T08:00:00" },
            arrival: { iataCode: "DUB", at: "2026-11-01T19:00:00" },
            operatingAirline: { carrierCode: "EI" },
            aircraft: { code: "330" },
            operating: "EI",
            number: "104",
            blacklistedInEU: false,
          },
          {
            departure: { iataCode: "DUB", at: "2026-11-01T21:00:00" },
            arrival: { iataCode: "LHR", at: "2026-11-01T22:20:00" },
            operatingAirline: { carrierCode: "EI" },
            aircraft: { code: "320" },
            operating: "EI",
            number: "152",
            blacklistedInEU: false,
          },
        ],
      },
    ],
    price: { total: "400", base: "350", fee: "50", grandTotal: "400", currency: "USD" },
    pricingOptions: { fareType: ["PUBLISHED"], includedCheckedBagsOnly: true },
    validatingAirlineCodes: ["EI"],
    travelerPricings: [
      {
        travelerId: "1",
        fareOption: "STANDARD",
        travelerType: "ADULT",
        price: { total: "400", base: "350" },
        fareDetailsBySegment: [
          {
            segmentId: "1",
            cabin: "BUSINESS",
            fareBasis: "JFLEX",
            class: "J",
            includedCheckedBags: { weight: 32, weightUnit: "KG" },
          },
          {
            segmentId: "2",
            cabin: "ECONOMY",
            fareBasis: "YSTD",
            class: "Y",
            includedCheckedBags: { weight: 23, weightUnit: "KG" },
          },
        ],
      },
    ],
  };
}

describe("flight offer segments (#904)", () => {
  it("keeps fare brand and cabin class for each segment", () => {
    const segments = retainSegmentFareAndCabin(offer());
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ cabinClass: "business", fareBrand: "JFLEX" });
    expect(segments[1]).toMatchObject({ cabinClass: "economy", fareBrand: "YSTD" });
    expect(hasMixedCabin(segments)).toBe(true);
  });
});
