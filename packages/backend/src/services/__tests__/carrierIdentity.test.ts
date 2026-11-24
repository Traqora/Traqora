import {
  carrierLabels,
  resolveSegmentCarriers,
} from "../carrierIdentity";

describe("carrier identity (#903)", () => {
  it("labels marketing and operating carriers separately on a codeshare", () => {
    const segment = resolveSegmentCarriers({
      marketingCarrier: "aa",
      operatingCarrier: "ba",
    });

    expect(segment).toEqual({
      marketingCarrier: "AA",
      operatingCarrier: "BA",
      isCodeshare: true,
    });
    expect(carrierLabels(segment as { marketingCarrier: string; operatingCarrier: string; isCodeshare: boolean })).toEqual({
      marketedBy: "Marketed by AA",
      operatedBy: "Operated by BA",
      isCodeshare: true,
    });
  });

  it("treats a same-carrier segment as not a codeshare", () => {
    const segment = resolveSegmentCarriers({
      carrierCode: "DL",
      operatingAirline: { carrierCode: "DL" },
    });

    expect(segment).toMatchObject({
      marketingCarrier: "DL",
      operatingCarrier: "DL",
      isCodeshare: false,
    });
  });

  it("fails when the marketing carrier is missing", () => {
    expect(resolveSegmentCarriers({ operatingCarrier: "BA" })).toEqual({
      error: "missing_marketing_carrier",
    });
    expect(resolveSegmentCarriers({ marketingCarrier: "  " })).toEqual({
      error: "missing_marketing_carrier",
    });
  });
});
