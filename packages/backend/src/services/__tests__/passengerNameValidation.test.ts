import { z } from "zod";

// Mirror the validation helper from the route so we can test it independently
const iatanameRegex = /^[A-Za-z\s'\-]+$/;
const nameField = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .max(100, `${label} must be 100 characters or fewer`)
    .trim()
    .regex(iatanameRegex, `${label} may only contain letters, spaces, hyphens, and apostrophes`);

const passengerNameSchema = z.object({
  firstName: nameField("First name"),
  lastName: nameField("Last name"),
});

describe("passenger name IATA validation", () => {
  it("accepts standard names", () => {
    expect(passengerNameSchema.safeParse({ firstName: "John", lastName: "Doe" }).success).toBe(true);
  });

  it("accepts hyphenated names", () => {
    expect(passengerNameSchema.safeParse({ firstName: "Mary-Anne", lastName: "Smith-Jones" }).success).toBe(true);
  });

  it("accepts names with apostrophes", () => {
    expect(passengerNameSchema.safeParse({ firstName: "O'Brien", lastName: "D'Angelo" }).success).toBe(true);
  });

  it("accepts names with internal spaces (compound given name)", () => {
    expect(passengerNameSchema.safeParse({ firstName: "Jean Pierre", lastName: "De La Cruz" }).success).toBe(true);
  });

  it("trims leading and trailing whitespace before validation", () => {
    const result = passengerNameSchema.safeParse({ firstName: "  Alice  ", lastName: "  Walker  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Alice");
      expect(result.data.lastName).toBe("Walker");
    }
  });

  it("rejects names with digits", () => {
    expect(passengerNameSchema.safeParse({ firstName: "John2", lastName: "Doe" }).success).toBe(false);
  });

  it("rejects names with special characters not allowed by IATA", () => {
    expect(passengerNameSchema.safeParse({ firstName: "J@ne", lastName: "Doe" }).success).toBe(false);
  });

  it("rejects empty firstName", () => {
    expect(passengerNameSchema.safeParse({ firstName: "", lastName: "Doe" }).success).toBe(false);
  });

  it("rejects empty lastName", () => {
    expect(passengerNameSchema.safeParse({ firstName: "Jane", lastName: "" }).success).toBe(false);
  });

  it("rejects firstName longer than 100 characters", () => {
    const longName = "A".repeat(101);
    expect(passengerNameSchema.safeParse({ firstName: longName, lastName: "Doe" }).success).toBe(false);
  });

  it("accepts firstName of exactly 100 characters", () => {
    const maxName = "A".repeat(100);
    expect(passengerNameSchema.safeParse({ firstName: maxName, lastName: "Doe" }).success).toBe(true);
  });
});
