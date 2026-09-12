import { describe, expect, it } from "vitest";
import { isIndiaJobLocation, splitLocationTokens, INDIA_PLACE_NAMES } from "./indiaLocation";

function accept(location: string): boolean {
  return isIndiaJobLocation({ location }).eligible;
}

describe("isIndiaJobLocation — valid India locations", () => {
  const valid = [
    "Mumbai",
    "Mumbai, Maharashtra, India",
    "Bengaluru",
    "Bangalore",
    "Bengaluru, Karnataka",
    "Delhi",
    "New Delhi",
    "New Delhi, Delhi, India",
    "Gurugram",
    "Gurgaon",
    "Gurugram, Haryana",
    "Noida",
    "Greater Noida",
    "Hyderabad",
    "Hyderabad, Telangana, India",
    "Pune",
    "Chennai",
    "Kolkata",
    "Ahmedabad",
    "Jaipur",
    "Kochi",
    "Chandigarh",
    "Indore",
    "Lucknow",
    "Surat",
    "Nagpur",
    "Bhubaneswar",
    "Thiruvananthapuram",
    "Visakhapatnam",
    "Coimbatore",
    "Mysore",
    "Mysuru",
    "Navi Mumbai",
    "India",
    "Karnataka",
    "Tamil Nadu",
    "Maharashtra, India",
    "Bengaluru-VTP, India",
    "Bengaluru, KA, India",
  ];

  for (const location of valid) {
    it(`accepts "${location}"`, () => {
      expect(accept(location)).toBe(true);
    });
  }
});

describe("isIndiaJobLocation — remote variants", () => {
  it("accepts 'Remote - India'", () => {
    expect(accept("Remote - India")).toBe(true);
  });

  it("accepts 'India - Remote'", () => {
    expect(accept("India - Remote")).toBe(true);
  });

  it("accepts 'Remote, India'", () => {
    expect(accept("Remote, India")).toBe(true);
  });

  it("accepts 'Remote (Bengaluru)'", () => {
    expect(accept("Remote (Bengaluru)")).toBe(true);
  });

  it("rejects bare 'Remote'", () => {
    expect(accept("Remote")).toBe(false);
  });

  it("rejects 'Remote - Worldwide'", () => {
    expect(accept("Remote - Worldwide")).toBe(false);
  });

  it("rejects 'Remote anywhere'", () => {
    expect(accept("Remote anywhere")).toBe(false);
  });

  it("rejects 'Remote - APAC'", () => {
    expect(accept("Remote - APAC")).toBe(false);
  });

  it("rejects 'Work from home'", () => {
    expect(accept("Work from home")).toBe(false);
  });
});

describe("isIndiaJobLocation — invalid non-India locations", () => {
  const invalid = [
    "United States",
    "USA",
    "New York",
    "New York, NY",
    "California",
    "San Francisco, CA",
    "London",
    "UK",
    "United Kingdom",
    "Canada",
    "Toronto",
    "Toronto, Ontario, Canada",
    "Singapore",
    "Dubai",
    "UAE",
    "Saudi Arabia",
    "Riyadh",
    "Riyadh, Riyadh Province, Saudi Arabia",
    "Australia",
    "Sydney",
    "Germany",
    "Berlin",
    "France",
    "Paris",
    "Tokyo, Japan",
    "Sao Paulo, Brazil",
  ];

  for (const location of invalid) {
    it(`rejects "${location}"`, () => {
      expect(accept(location)).toBe(false);
    });
  }
});

describe("isIndiaJobLocation — ambiguous cases are rejected", () => {
  const ambiguous = [
    "Worldwide",
    "Global",
    "APAC",
    "EMEA",
    "Americas",
    "Europe",
    "Multiple Locations",
    "Anywhere",
    "International",
  ];

  for (const location of ambiguous) {
    it(`rejects "${location}"`, () => {
      expect(accept(location)).toBe(false);
    });
  }

  it("rejects 'India / US' — India eligibility is not established", () => {
    expect(accept("India / US")).toBe(false);
  });

  it("rejects 'Mumbai / New York'", () => {
    expect(accept("Mumbai / New York")).toBe(false);
  });

  it("rejects 'Bengaluru, London, Singapore'", () => {
    expect(accept("Bengaluru, London, Singapore")).toBe(false);
  });

  it("explains that both India and non-India were named", () => {
    const decision = isIndiaJobLocation({ location: "Mumbai / New York" });
    expect(decision.eligible).toBe(false);
    if (!decision.eligible) {
      expect(decision.reason).toMatch(/both India/i);
    }
  });

  it("accepts 'Multiple Locations - India' (India named, nothing foreign)", () => {
    expect(accept("Multiple Locations - India")).toBe(true);
  });

  it("accepts a multi-city India posting", () => {
    expect(accept("Bengaluru, Hyderabad, Pune")).toBe(true);
  });
});

describe("isIndiaJobLocation — homonym safety", () => {
  it("rejects 'Hyderabad, Pakistan' despite Hyderabad being an Indian city", () => {
    expect(accept("Hyderabad, Pakistan")).toBe(false);
  });

  it("rejects 'Salem, Oregon' despite Salem being an Indian city", () => {
    expect(accept("Salem, Oregon")).toBe(false);
  });

  it("still accepts 'Salem, Tamil Nadu'", () => {
    expect(accept("Salem, Tamil Nadu")).toBe(true);
  });
});

describe("isIndiaJobLocation — structured fields", () => {
  it("accepts an ISO country code of IN", () => {
    expect(isIndiaJobLocation({ city: "Bengaluru", country: "IN" }).eligible).toBe(true);
  });

  it("accepts country 'India' with an unknown city", () => {
    expect(isIndiaJobLocation({ city: "Rampur Junction", country: "India" }).eligible).toBe(true);
  });

  it("rejects country 'US' even with an India-looking city", () => {
    expect(isIndiaJobLocation({ city: "Salem", country: "US" }).eligible).toBe(false);
  });

  it("rejects when every field is empty", () => {
    expect(isIndiaJobLocation({ location: null, city: null, country: null }).eligible).toBe(false);
  });

  it("rejects when only whitespace is supplied", () => {
    expect(isIndiaJobLocation({ location: "   " }).eligible).toBe(false);
  });

  it("considers extras (secondary locations) as evidence", () => {
    const decision = isIndiaJobLocation({ city: "Bengaluru", extras: ["London"] });
    expect(decision.eligible).toBe(false);
  });

  it("does not infer India from a company headquarters — only the given fields count", () => {
    // No India token anywhere: an employer being Indian is not an input here.
    expect(isIndiaJobLocation({ location: "Austin, Texas" }).eligible).toBe(false);
  });
});

describe("splitLocationTokens", () => {
  it("splits on commas, slashes and dashes", () => {
    const tokens = splitLocationTokens("Mumbai, Maharashtra / India - Remote");
    expect(tokens).toContain("mumbai");
    expect(tokens).toContain("maharashtra");
    expect(tokens).toContain("india");
    expect(tokens).toContain("remote");
  });

  it("keeps hyphenated place names and their parts", () => {
    const tokens = splitLocationTokens("Bengaluru-VTP");
    expect(tokens).toContain("bengaluru");
  });

  it("produces multi-word phrases for two-word place names", () => {
    expect(splitLocationTokens("New Delhi India")).toContain("new delhi");
    expect(splitLocationTokens("Tamil Nadu")).toContain("tamil nadu");
  });
});

describe("INDIA_PLACE_NAMES", () => {
  it("is a non-trivial, de-duplicated gazetteer the Jobs query can reuse", () => {
    expect(INDIA_PLACE_NAMES.length).toBeGreaterThan(150);
    expect(new Set(INDIA_PLACE_NAMES).size).toBe(INDIA_PLACE_NAMES.length);
    expect(INDIA_PLACE_NAMES).toContain("bengaluru");
    expect(INDIA_PLACE_NAMES).toContain("karnataka");
  });
});
