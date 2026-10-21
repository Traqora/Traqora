import {
  MISSING_PROVIDER_OFFER_ID,
  MissingProviderOfferIdError,
  attachProviderOfferId,
  confirmationWithOfferId,
  requireProviderOfferId,
} from "../providerOfferTracking";

describe("provider offer tracking (#914)", () => {
  it("carries the search offer id through checkout and confirmation", () => {
    const offerId = requireProviderOfferId(" AMA-OFFER-99 ");
    const booking = attachProviderOfferId(
      { id: "booking-1", status: "confirmed", providerOfferId: null },
      offerId,
    );

    expect(booking.providerOfferId).toBe("AMA-OFFER-99");
    expect(confirmationWithOfferId(booking)).toEqual({
      bookingId: "booking-1",
      providerOfferId: "AMA-OFFER-99",
      status: "confirmed",
    });
  });

  it("rejects missing, blank, and non-string offer identifiers", () => {
    for (const value of ["", "   ", null, undefined, 12]) {
      expect(() => requireProviderOfferId(value)).toThrow(MissingProviderOfferIdError);
    }
  });

  it("fails confirmation when the stored offer id was lost", () => {
    expect(() =>
      confirmationWithOfferId({ id: "booking-lost", providerOfferId: null }),
    ).toThrow(MissingProviderOfferIdError);
    try {
      confirmationWithOfferId({ id: "booking-lost", providerOfferId: null });
    } catch (err) {
      expect((err as MissingProviderOfferIdError).code).toBe(MISSING_PROVIDER_OFFER_ID);
    }
  });
});
