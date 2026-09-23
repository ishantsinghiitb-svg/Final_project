import { describe, expect, it } from "vitest";
import { classifyJobQuality, DEFAULT_QUALITY_THRESHOLD, qualityThresholdFor } from "./jobQuality";

function job(
  role: string,
  source: string,
  extra: Partial<Parameters<typeof classifyJobQuality>[0]> = {},
) {
  return classifyJobQuality({ role, source, ...extra });
}

describe("one quality policy for every source", () => {
  it("every source, configured or not, uses the same (most permissive) threshold", () => {
    for (const source of [
      "greenhouse",
      "lever",
      "ashby",
      "smartrecruiters",
      "workable",
      "internshala",
      "glassdoor",
      "some-new-platform",
      "",
    ]) {
      expect(qualityThresholdFor(source)).toBe(DEFAULT_QUALITY_THRESHOLD);
    }
    expect(DEFAULT_QUALITY_THRESHOLD).toBe(-2);
  });

  it("the same title gets the same decision on every source", () => {
    const sources = ["greenhouse", "smartrecruiters", "internshala", "glassdoor"];
    for (const title of ["Product Intern", "Data Analyst", "Translator", "Telecaller"]) {
      const decisions = sources.map((s) => job(title, s).retain);
      expect(new Set(decisions).size).toBe(1);
    }
  });
});

describe("filter for bad jobs, not an allowlist: legitimate roles are kept", () => {
  const keep = [
    "Backend Trainee",
    "Data Analyst",
    "Business Analyst",
    "Product Analyst",
    "Data Engineer",
    "Software Engineer",
    "Backend Developer",
    "Product Intern",
    "Finance Analyst",
    "Quant Analyst",
    "Research Analyst",
    "Operations Analyst",
    "Management Trainee",
    "Technical Support Engineer",
    "Technical Writer",
    "UX Writer",
  ];
  it.each(keep)('"%s" is retained (on Glassdoor and Internshala alike)', (title) => {
    expect(job(title, "glassdoor").retain).toBe(true);
    expect(job(title, "internshala").retain).toBe(true);
  });

  it("an unknown/ambiguous professional title scoring 0 is KEPT, not rejected for lacking a positive signal", () => {
    const d = job("Bilingual Marketing Specialist (Telugu/English) - AI Trainer", "glassdoor");
    expect(d.score).toBe(0);
    expect(d.retain).toBe(true);
    expect(d.reason).toMatch(/retained/i);
  });

  it("a score of exactly 0 is retained on its own", () => {
    for (const source of ["glassdoor", "internshala", "smartrecruiters"]) {
      const d = job("Associate Specialist", source);
      expect(d.score).toBe(0);
      expect(d.retain).toBe(true);
    }
  });
});

describe("clearly generic / low-signal roles are still rejected", () => {
  const reject = [
    "Translator",
    "Teacher",
    "Tutor",
    "Telecaller",
    "Data Entry",
    "Content Writer",
    "Writer",
    "Field Sales",
    "Basic Customer Support",
    "Video Editor",
  ];
  it.each(reject)('"%s" is rejected (on Glassdoor and Internshala alike)', (title) => {
    for (const source of ["glassdoor", "internshala"]) {
      const d = job(title, source);
      expect(d.retain).toBe(false);
      expect(d.primaryFamily).toBe("low_signal");
    }
  });

  it("an explicit low-signal keyword rejects even with a title that has other neutral words", () => {
    expect(job("Part Time Tutor for Class 10", "glassdoor").retain).toBe(false);
    expect(job("Hindi to English Translator", "glassdoor").retain).toBe(false);
  });

  it("a real technical word outweighs an incidental low-signal one", () => {
    expect(job("Customer Support Engineer", "glassdoor").retain).toBe(true);
  });
});

describe("high-quality core roles are retained on every platform", () => {
  const platforms = ["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "internshala"];

  it.each(platforms)("Product Manager is retained on %s", (source) => {
    expect(job("Product Manager", source).retain).toBe(true);
  });

  it.each(platforms)("Software Engineer is retained on %s", (source) => {
    expect(job("Software Engineer", source).retain).toBe(true);
  });

  it.each(platforms)("Backend Developer is retained on %s", (source) => {
    // "Backend" (core) + "Developer" (technical suffix) — comfortably positive everywhere.
    expect(job("Backend Developer", source).retain).toBe(true);
  });

  it.each(platforms)("ML Engineer is retained on %s", (source) => {
    expect(job("ML Engineer", source).retain).toBe(true);
  });

  it.each(platforms)("Data Scientist is retained on %s", (source) => {
    expect(job("Data Scientist", source).retain).toBe(true);
  });

  it.each(platforms)("Quantitative Research Analyst is retained on %s", (source) => {
    expect(job("Quantitative Research Analyst", source).retain).toBe(true);
  });
});

describe("category coverage — PM", () => {
  it("Associate Product Manager", () => {
    const d = job("Associate Product Manager", "smartrecruiters");
    expect(d.retain).toBe(true);
    expect(d.primaryFamily).toBe("product");
  });

  it("Technical Product Manager", () => {
    expect(job("Technical Product Manager", "internshala").retain).toBe(true);
  });

  it("Product Analyst", () => {
    expect(job("Product Analyst", "workable").retain).toBe(true);
  });
});

describe("category coverage — SWE", () => {
  it("SDE II", () => {
    const d = job("SDE II", "greenhouse");
    expect(d.retain).toBe(true);
    expect(d.primaryFamily).toBe("software_engineering");
  });

  it("Senior Full Stack Developer", () => {
    expect(job("Senior Full Stack Developer", "lever").retain).toBe(true);
  });

  it("DevOps Engineer", () => {
    expect(job("DevOps Engineer", "internshala").retain).toBe(true);
  });

  it("Site Reliability Engineer (SRE)", () => {
    expect(job("Site Reliability Engineer", "smartrecruiters").retain).toBe(true);
  });
});

describe("category coverage — AI/ML", () => {
  it("AI Engineer", () => {
    expect(job("AI Engineer", "ashby").retain).toBe(true);
  });

  it("NLP Research Engineer", () => {
    const d = job("NLP Research Engineer", "internshala");
    expect(d.retain).toBe(true);
  });

  it("Computer Vision Engineer", () => {
    expect(job("Computer Vision Engineer", "workable").retain).toBe(true);
  });
});

describe("category coverage — Data", () => {
  it("Data Engineer", () => {
    expect(job("Data Engineer", "smartrecruiters").retain).toBe(true);
  });

  it("Analytics Engineer", () => {
    expect(job("Analytics Engineer", "internshala").retain).toBe(true);
  });

  it("Data Analyst (compound technical-suffix phrase, not bare Analyst)", () => {
    const d = job("Data Analyst", "internshala");
    expect(d.retain).toBe(true);
    expect(d.primaryFamily).toBe("technical_suffix");
  });
});

describe("category coverage — Quant", () => {
  it("Quantitative Developer", () => {
    expect(job("Quantitative Developer", "greenhouse").retain).toBe(true);
  });

  it("Algorithmic Trading Engineer", () => {
    expect(job("Algorithmic Trading Engineer", "internshala").retain).toBe(true);
  });

  it("Risk Quant Analyst", () => {
    expect(job("Risk Quant Analyst", "workable").retain).toBe(true);
  });
});

describe("other substantive technical/professional roles are not automatically rejected", () => {
  it("Solutions Architect", () => {
    expect(job("Solutions Architect", "smartrecruiters").retain).toBe(true);
  });

  it("Revenue Operations Manager", () => {
    const d = job("Revenue Operations Manager", "workable");
    expect(d.retain).toBe(true);
    expect(d.primaryFamily).toBe("professional_domain");
  });

  it("Technical Account Manager", () => {
    expect(job("Technical Account Manager", "smartrecruiters").retain).toBe(true);
  });
});

describe("obvious low-signal listings are rejected", () => {
  const lowSignalTitles = [
    "Data Entry Operator",
    "Telecaller",
    "Telecalling Executive",
    "Content Writer",
    "Copywriter",
    "Video Editor",
    "Field Sales Executive",
    "Translator",
    "Teacher",
    "Tutor",
    "Back Office Executive",
    "Customer Support Executive",
    "Recruitment Executive",
    "HR Executive",
    "Social Media Executive",
    "Digital Marketing Executive",
    "Business Development Executive",
    "Relationship Manager",
  ];

  it.each(lowSignalTitles)('"%s" is rejected on Internshala', (title) => {
    const d = job(title, "internshala");
    expect(d.retain).toBe(false);
    expect(d.primaryFamily).toBe("low_signal");
  });

  it.each(lowSignalTitles)(
    '"%s" is rejected even on the most permissive platform (Greenhouse)',
    (title) => {
      expect(job(title, "greenhouse").retain).toBe(false);
    },
  );

  it("seniority does not rescue an explicit low-signal phrase", () => {
    const d = job("Senior Relationship Manager", "greenhouse");
    expect(d.retain).toBe(false);
  });
});

describe("false-positive risk: a technical role must not be rejected for an incidental low-signal word", () => {
  it('"Technical Sales Engineer" is retained on every platform', () => {
    for (const source of [
      "greenhouse",
      "lever",
      "ashby",
      "smartrecruiters",
      "workable",
      "internshala",
    ]) {
      const d = job("Technical Sales Engineer", source);
      expect(d.retain).toBe(true);
    }
  });

  it('"Customer Success Engineer" is not penalized by the generic "Customer Support" phrase (different phrase entirely)', () => {
    expect(job("Customer Success Engineer", "smartrecruiters").retain).toBe(true);
  });
});

describe("production sanity-check finding: CA Articleship must not be rejected as a generic internship", () => {
  it('"CA Articleship - Internship" is retained on every platform, including Internshala', () => {
    for (const source of [
      "greenhouse",
      "lever",
      "ashby",
      "smartrecruiters",
      "workable",
      "internshala",
    ]) {
      const d = job("CA Articleship - Internship", source, {
        description:
          "Work closely with the Partners and act as an EA to Partners on key assignments. " +
          "Assist with accounting, financial analysis, reporting, compliance and client work.",
      });
      expect(d.retain).toBe(true);
    }
  });
});

describe("false-negative risk: an operations/growth-adjacent role must not be blanket-rejected", () => {
  it('"Product Operations Manager" is retained on every platform', () => {
    for (const source of [
      "greenhouse",
      "lever",
      "ashby",
      "smartrecruiters",
      "workable",
      "internshala",
    ]) {
      const d = job("Product Operations Manager", source);
      expect(d.retain).toBe(true);
    }
  });

  it('"Business Development Manager" (Manager-level) is retained, unlike the Executive-level low-signal phrase', () => {
    const manager = job("Business Development Manager", "smartrecruiters");
    const executive = job("Business Development Executive", "smartrecruiters");
    expect(manager.retain).toBe(true);
    expect(executive.retain).toBe(false);
  });
});

describe("legitimate non-tech professional jobs", () => {
  it("Finance Manager is retained (professional_domain + seniority)", () => {
    expect(job("Finance Manager", "smartrecruiters").retain).toBe(true);
  });

  it("Strategy Consultant is retained", () => {
    expect(job("Strategy Consultant", "workable").retain).toBe(true);
  });
});

describe("description scanning ignores generic single-word signals prone to incidental matches", () => {
  it('a corporate-boilerplate mention of "platform"/"security"/"cloud" does not rescue a neutral, non-technical title', () => {
    const d = job("Legal Counsel", "smartrecruiters", {
      description:
        "Join our platform team's mission. We take security and cloud reliability seriously across our systems, and our mobile app serves millions.",
    });
    // Boilerplate must not LIFT the title (score stays 0); a neutral title is kept regardless.
    expect(d.score).toBe(0);
    expect(d.retain).toBe(true);
  });

  it("a genuinely technical description phrase (multi-word / rare acronym) still rescues a neutral title", () => {
    const d = job("Coordinator", "smartrecruiters", {
      description: "You will pair with our Software Engineer team building the core API.",
    });
    expect(d.retain).toBe(true);
  });
});

describe("ambiguous/neutral roles are kept, and reported as such", () => {
  it("a title with no signal either way is retained on every source", () => {
    for (const source of ["greenhouse", "smartrecruiters", "internshala", "glassdoor"]) {
      const d = job("Office Coordinator", source);
      expect(d.retain).toBe(true);
      expect(d.primaryFamily).toBeNull();
    }
  });

  it("a title one point above the reject line is flagged borderline for review, yet retained", () => {
    const d = job("Customer Support Engineer", "glassdoor");
    expect(d.score).toBe(-1);
    expect(d.retain).toBe(true);
    expect(d.borderline).toBe(true);
  });

  it("description signals can rescue a neutral title, but only when the title itself has no signal", () => {
    const withSignal = job("Coordinator", "internshala", {
      description: "You will work as part of our backend engineering team building APIs.",
    });
    const withoutSignal = job("Coordinator", "internshala", {
      description: "You will coordinate schedules and manage the office calendar.",
    });
    // A description signal lifts a neutral title, but its absence never rejects it.
    expect(withSignal.score).toBeGreaterThan(withoutSignal.score);
    expect(withSignal.retain).toBe(true);
    expect(withoutSignal.retain).toBe(true);
  });

  it("description signals never ADD to a title that already scored (positive or negative)", () => {
    const plain = job("Software Engineer", "internshala");
    const withUnrelatedDescription = job("Software Engineer", "internshala", {
      description: "Product Manager Data Scientist Quant AI Engineer".repeat(10),
    });
    expect(withUnrelatedDescription.score).toBe(plain.score);

    const plainLow = job("Telecaller", "greenhouse");
    const lowWithGoodDescription = job("Telecaller", "greenhouse", {
      description: "Software Engineer Data Scientist Product Manager".repeat(10),
    });
    expect(lowWithGoodDescription.score).toBe(plainLow.score);
    expect(lowWithGoodDescription.retain).toBe(false);
  });
});

describe("explainability", () => {
  it("every decision carries a human-readable reason and its contributing signals", () => {
    const retained = job("Product Manager", "greenhouse");
    expect(retained.reason).toContain("Retained");
    expect(retained.signals.length).toBeGreaterThan(0);

    const rejected = job("Telecaller", "internshala");
    expect(rejected.reason).toContain("Rejected");
    expect(rejected.signals.length).toBeGreaterThan(0);
  });
});
