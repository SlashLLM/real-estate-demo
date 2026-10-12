import { describe, expect, it, vi } from "vitest";

vi.mock("@totalweb/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const { validateSubmission, mapToContact, ctaId } = await import("./intake");

const fields = [
  { name: "first_name", label: "First", type: "text" as const, required: true },
  { name: "email", label: "Email", type: "email" as const, required: true },
  { name: "budget", label: "Budget", type: "select" as const, options: ["<1k", "1k-10k"] },
  { name: "consent", label: "Consent", type: "checkbox" as const, required: true },
];

describe("validateSubmission", () => {
  it("flags missing required fields and bad emails", () => {
    const { errors } = validateSubmission(fields, { first_name: " ", email: "nope" });
    expect(errors).toEqual({ first_name: "Required", email: "Invalid email", consent: "Required" });
  });

  it("rejects options outside the select list", () => {
    const { errors } = validateSubmission(fields, { first_name: "A", email: "a@b.co", budget: "lots", consent: "on" });
    expect(errors).toEqual({ budget: "Invalid option" });
  });

  it("trims values and drops unknown fields", () => {
    const { errors, clean } = validateSubmission(fields, {
      first_name: "  Ann ",
      email: "Ann@Example.com",
      consent: "on",
      injected: "x",
    });
    expect(errors).toEqual({});
    expect(clean).toEqual({ first_name: "Ann", email: "Ann@Example.com", consent: true });
  });
});

describe("mapToContact", () => {
  it("splits contact columns from custom fields and lowercases email", () => {
    expect(mapToContact({ first_name: "Ann", email: "Ann@Example.com", budget: "<1k", consent: true })).toEqual({
      contact: { first_name: "Ann", email: "ann@example.com" },
      custom: { budget: "<1k", consent: true },
    });
  });
});

describe("ctaId", () => {
  it("normalises CTA ids and rejects empty ones", () => {
    expect(ctaId("Hero Book Call!")).toBe("hero-book-call");
    expect(ctaId("pricing_inline")).toBe("pricing_inline");
    expect(ctaId("x".repeat(100))).toHaveLength(64);
    expect(ctaId("  ")).toBeNull();
    expect(ctaId(undefined)).toBeNull();
  });
});
