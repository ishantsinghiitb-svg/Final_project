import { describe, expect, it } from "vitest";
import {
  identityKey,
  isSameCompany,
  resolveCompanyIdentity,
  splitCuratedName,
} from "./companyIdentity";

describe("identityKey", () => {
  it("deletes apostrophes but treats a dot as a separator", () => {
    // "Byju's" and "Byjus" are one name; "Cult.fit" and "Cult Fit" are too —
    // which only works if the two marks are handled differently.
    expect(identityKey("Byju's")).toBe("byjus");
    expect(identityKey("Cult.fit")).toBe("cult fit");
    expect(identityKey("Larsen & Toubro (L&T)")).toBe("larsen & toubro l&t");
  });

  it("collapses whitespace", () => {
    expect(identityKey("  Tata   Motors  ")).toBe("tata motors");
  });

  it("is stable across casing and punctuation variants", () => {
    expect(identityKey("Locus.sh")).toBe(identityKey("LOCUS SH"));
  });

  it("handles empty input", () => {
    expect(identityKey("")).toBe("");
  });
});

describe("splitCuratedName", () => {
  it("splits the curated 'A / B' form", () => {
    expect(splitCuratedName("Zomato / Eternal")).toEqual(["Zomato", "Eternal"]);
  });

  it("returns a single name unchanged", () => {
    expect(splitCuratedName("Swiggy")).toEqual(["Swiggy"]);
  });

  it("drops empty segments", () => {
    expect(splitCuratedName("Ola / / Ola Electric")).toEqual(["Ola", "Ola Electric"]);
  });
});

describe("resolveCompanyIdentity — aliases collapse to one entity", () => {
  it.each([
    ["Groww / Groww Invest Tech", "Groww"],
    ["Groww Invest Tech", "Groww"],
    ["Zomato / Eternal", "Zomato"],
    ["Eternal", "Zomato"],
    ["Paytm / One97 Communications", "Paytm"],
    ["One97 Communications", "Paytm"],
    ["Mamaearth / Honasa Consumer", "Honasa Consumer"],
    ["Mamaearth", "Honasa Consumer"],
    ["boAt / Imagine Marketing", "boAt"],
    ["Dailyhunt / VerSe Innovation", "VerSe Innovation"],
    ["PolicyBazaar / PB Fintech", "PB Fintech"],
    ["Dream11 / Dream Sports", "Dream Sports"],
    ["Cult.fit / Curefit", "Cult.fit"],
    ["OneCard / FPL Technologies", "FPL Technologies"],
    ["Jupiter / Amica Financial Technologies", "Jupiter"],
    ["Fi Money / epiFi", "Fi Money"],
    ["Slintel / 6sense", "6sense"],
    ["Wingify / VWO", "Wingify"],
    ["Freshdesk / Freshworks", "Freshworks"],
  ])("%s → %s", (input, expected) => {
    expect(resolveCompanyIdentity(input).canonicalName).toBe(expected);
  });

  it("keeps the original names as searchable aliases", () => {
    const identity = resolveCompanyIdentity("Mamaearth / Honasa Consumer");
    expect(identity.aliases).toContain("Mamaearth");
  });

  it("never lists the canonical name as its own alias", () => {
    const identity = resolveCompanyIdentity("Zomato / Eternal");
    expect(identity.aliases).not.toContain("Zomato");
    expect(identity.aliases).toContain("Eternal");
  });
});

describe("resolveCompanyIdentity — subsidiaries stay separate", () => {
  it("keeps Blinkit distinct from Zomato but records the parent", () => {
    const blinkit = resolveCompanyIdentity("Blinkit");
    expect(blinkit.canonicalName).toBe("Blinkit");
    expect(blinkit.parentCompany).toBe("Zomato");
    // The critical assertion: this must NOT collapse into Zomato.
    expect(blinkit.canonicalName).not.toBe("Zomato");
  });

  it("keeps every Info Edge property as its own hiring entity", () => {
    for (const name of [
      "Naukri.com / Info Edge",
      "99acres / Info Edge",
      "Jeevansathi / Info Edge",
    ]) {
      const identity = resolveCompanyIdentity(name);
      expect(identity.canonicalName).not.toBe("Info Edge");
    }
    expect(resolveCompanyIdentity("Naukri.com").parentCompany).toBe("Info Edge");
    expect(resolveCompanyIdentity("99acres").parentCompany).toBe("Info Edge");
    expect(resolveCompanyIdentity("Jeevansathi").parentCompany).toBe("Info Edge");
  });

  it("records Reliance subsidiaries without merging them", () => {
    expect(resolveCompanyIdentity("Reliance Retail").parentCompany).toBe("Reliance Industries");
    expect(resolveCompanyIdentity("AJIO").parentCompany).toBe("Reliance Industries");
    expect(resolveCompanyIdentity("Reliance Retail").canonicalName).toBe("Reliance Retail");
  });

  it("records Tata subsidiaries", () => {
    expect(resolveCompanyIdentity("Tata Motors").parentCompany).toBe("Tata Sons");
    expect(resolveCompanyIdentity("Tata Elxsi").parentCompany).toBe("Tata Sons");
  });

  it("never makes a company its own parent", () => {
    for (const name of ["Zomato", "Reliance Industries", "Tata Sons", "Info Edge", "Ola"]) {
      const identity = resolveCompanyIdentity(name);
      expect(identity.parentCompany).not.toBe(identity.canonicalName);
    }
  });

  it("leaves an independent company with no parent", () => {
    expect(resolveCompanyIdentity("Swiggy").parentCompany).toBeNull();
    expect(resolveCompanyIdentity("Razorpay").parentCompany).toBeNull();
  });
});

describe("resolveCompanyIdentity — unknown companies", () => {
  it("returns the company as itself", () => {
    const identity = resolveCompanyIdentity("Some New Startup");
    expect(identity.canonicalName).toBe("Some New Startup");
    expect(identity.parentCompany).toBeNull();
    expect(identity.aliases).toEqual([]);
  });

  it("takes the first segment of an unknown 'A / B' pair", () => {
    expect(resolveCompanyIdentity("Alpha / Beta").canonicalName).toBe("Alpha");
  });

  it("never returns an empty canonical name for non-empty input", () => {
    expect(resolveCompanyIdentity("  X  ").canonicalName).toBe("X");
  });

  it("handles empty input without throwing", () => {
    expect(resolveCompanyIdentity("").canonicalName).toBe("");
  });
});

describe("isSameCompany — duplicate prevention", () => {
  it("treats aliases as the same company", () => {
    expect(isSameCompany("Groww", "Groww Invest Tech")).toBe(true);
    expect(isSameCompany("Zomato", "Eternal")).toBe(true);
    expect(isSameCompany("Mamaearth", "Honasa Consumer")).toBe(true);
  });

  it("does NOT treat a subsidiary as its parent", () => {
    expect(isSameCompany("Blinkit", "Zomato")).toBe(false);
    expect(isSameCompany("Naukri.com", "Info Edge")).toBe(false);
    expect(isSameCompany("Reliance Retail", "Reliance Industries")).toBe(false);
  });

  it("does not merge unrelated companies", () => {
    expect(isSameCompany("Swiggy", "Zomato")).toBe(false);
    expect(isSameCompany("Ola", "Uber")).toBe(false);
  });

  it("ignores casing and punctuation", () => {
    expect(isSameCompany("cult.fit", "CULT FIT")).toBe(true);
  });
});
