import { describe, expect, it } from "vitest";
import {
  decideEmployerDomain,
  hostnameOf,
  isNonEmployerHost,
  labelCorroboratesName,
  significantLabel,
  type DomainCandidate,
} from "./domainEvidence";

const noCandidates: DomainCandidate[] = [];

describe("isNonEmployerHost", () => {
  it("rejects the job boards Module 11A already knew about", () => {
    expect(isNonEmployerHost("indeed.com")).toBe(true);
    expect(isNonEmployerHost("in.indeed.com")).toBe(true);
    expect(isNonEmployerHost("boards.greenhouse.io")).toBe(true);
    expect(isNonEmployerHost("jobs.lever.co")).toBe(true);
  });

  it("rejects the ATS and aggregator hosts the 11C investigation found in stored URLs", () => {
    expect(isNonEmployerHost("cliqonnect.darwinbox.in")).toBe(true);
    expect(isNonEmployerHost("motorolasolutions.wd5.myworkdayjobs.com")).toBe(true);
    expect(isNonEmployerHost("careers.kula.ai")).toBe(true);
    expect(isNonEmployerHost("ambilio.zohorecruit.in")).toBe(true);
    expect(isNonEmployerHost("fusionpact.keka.com")).toBe(true);
    expect(isNonEmployerHost("ats.rippling.com")).toBe(true);
    expect(isNonEmployerHost("semarchy.careers.hibob.com")).toBe(true);
  });

  it("rejects social hosts — a company's Instagram favicon is Instagram's", () => {
    expect(isNonEmployerHost("instagram.com")).toBe(true);
    expect(isNonEmployerHost("docs.google.com")).toBe(true);
  });

  it("rejects the fabricated seed host", () => {
    expect(isNonEmployerHost("careers.example.com")).toBe(true);
  });

  it("accepts a genuine employer host", () => {
    expect(isNonEmployerHost("highradius.com")).toBe(false);
    expect(isNonEmployerHost("netradyne.com")).toBe(false);
    expect(isNonEmployerHost("slice.careers")).toBe(false);
  });

  it("does not match a host that merely contains a banned word", () => {
    expect(isNonEmployerHost("mygooglejobs.io")).toBe(false);
  });

  it("treats empty input as unusable", () => {
    expect(isNonEmployerHost("")).toBe(true);
  });
});

describe("hostnameOf", () => {
  it("extracts and normalizes a hostname", () => {
    expect(hostnameOf("https://www.HighRadius.com/about/careers-list/?gh_jid=1")).toBe(
      "highradius.com",
    );
  });

  it("accepts a scheme-less host", () => {
    expect(hostnameOf("acme.com/careers")).toBe("acme.com");
  });

  it("returns null for junk, single labels and empty input", () => {
    expect(hostnameOf(null)).toBeNull();
    expect(hostnameOf("")).toBeNull();
    expect(hostnameOf("search")).toBeNull();
    expect(hostnameOf("not a url at all")).toBeNull();
  });
});

describe("significantLabel", () => {
  it("takes the name-bearing label", () => {
    expect(significantLabel("careers.acme.com")).toBe("acme");
    expect(significantLabel("acme.com")).toBe("acme");
  });

  it("handles multi-label public suffixes", () => {
    expect(significantLabel("kkkhanna.co.in")).toBe("kkkhanna");
    expect(significantLabel("careers.sbilife.co.in")).toBe("sbilife");
  });
});

describe("labelCorroboratesName", () => {
  it("accepts an exact match", () => {
    expect(labelCorroboratesName("HighRadius", "highradius.com")).toBe(true);
    expect(labelCorroboratesName("Zell Education", "zelleducation.com")).toBe(true);
  });

  it("accepts a prefix match in either direction when the shorter side is long enough", () => {
    expect(labelCorroboratesName("Observeai", "observe.ai")).toBe(true);
    expect(labelCorroboratesName("Netradyne Technologies", "netradyne.com")).toBe(true);
  });

  it("rejects the unrelated company_url values found in production", () => {
    // Both are real captured values for businesses that are not these companies.
    expect(labelCorroboratesName("Pixalsoft", "truegether.com")).toBe(false);
    expect(labelCorroboratesName("Finfluence", "acmegroup.co.in")).toBe(false);
    expect(labelCorroboratesName("Worldotech", "globaledtechservices.com")).toBe(false);
  });

  it("rejects a short coincidental prefix", () => {
    expect(labelCorroboratesName("Fi", "fitbit.com")).toBe(false);
  });

  it("rejects empty input rather than matching everything", () => {
    expect(labelCorroboratesName("", "acme.com")).toBe(false);
    expect(labelCorroboratesName("Acme", "")).toBe(false);
  });
});

describe("decideEmployerDomain — Tier A, self-evidenced", () => {
  it("accepts a host the employer serves its own postings from", () => {
    const decision = decideEmployerDomain({
      companyName: "Highradius",
      normalizedKey: "highradius",
      candidates: [
        { url: "https://www.highradius.com/about/careers-list/?gh_jid=7564206003", field: "url" },
      ],
    });
    expect(decision).toMatchObject({ ok: true, domain: "highradius.com", tier: "self_evidenced" });
  });

  it("prefers self-evidence over a curated domain", () => {
    const decision = decideEmployerDomain({
      companyName: "Netradyne",
      normalizedKey: "netradyne",
      curatedDomain: "something-else.com",
      candidates: [{ url: "https://www.netradyne.com/company/careers?gh_jid=1", field: "url" }],
    });
    expect(decision).toMatchObject({ ok: true, domain: "netradyne.com" });
  });

  it("skips a board host and keeps looking at later candidates", () => {
    const decision = decideEmployerDomain({
      companyName: "Druva",
      normalizedKey: "druva",
      candidates: [
        { url: "https://boards.greenhouse.io/druva", field: "company_career_url" },
        { url: "https://www.druva.com/careers/jobs/8564138002/", field: "url" },
      ],
    });
    expect(decision).toMatchObject({ ok: true, domain: "druva.com" });
  });

  it("refuses a non-board host whose label does not corroborate the name", () => {
    const decision = decideEmployerDomain({
      companyName: "Pixalsoft",
      normalizedKey: "pixalsoft",
      candidates: [{ url: "https://truegether.com", field: "company_url" }],
    });
    expect(decision.ok).toBe(false);
  });
});

describe("decideEmployerDomain — Tier B, curated + Module 11B guard", () => {
  const postingWithDomain =
    "About Freshworks. Freshworks makes it fast and easy for businesses to delight. " +
    "Learn more at our site and apply now. Contact careers at freshworks.com for details.";

  it("accepts a curated domain the company's own postings corroborate", () => {
    const decision = decideEmployerDomain({
      companyName: "Freshworks",
      normalizedKey: "freshworks",
      curatedDomain: "freshworks.com",
      candidates: [
        { url: "https://jobs.smartrecruiters.com/freshworks/744000141811259", field: "url" },
      ],
      postingText: postingWithDomain,
    });
    expect(decision).toMatchObject({
      ok: true,
      domain: "freshworks.com",
      tier: "curated_guard_confirmed",
    });
  });

  it("refuses a curated domain the postings never mention — the Porter failure mode", () => {
    // Real shape of the problem: the curated entry asserts porter.in, but the
    // board actually serves a US healthcare company's clinical roles.
    const decision = decideEmployerDomain({
      companyName: "Porter",
      normalizedKey: "porter-unsplit",
      curatedDomain: "porter.in",
      candidates: [{ url: "https://jobs.lever.co/porter/abc/apply", field: "url" }],
      postingText:
        "Porter is hiring a Nurse Practitioner in Sandusky, OH. Travel required across New Jersey.",
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain("board-identity guard");
  });

  it("refuses when the postings carry no text for the guard to read", () => {
    // Every SmartRecruiters posting in production has a null description.
    const decision = decideEmployerDomain({
      companyName: "Swiggy",
      normalizedKey: "swiggy",
      curatedDomain: "careers.swiggy.com",
      candidates: [
        { url: "https://jobs.smartrecruiters.com/swiggy/6000000001300407", field: "url" },
      ],
      postingText: null,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain("no text");
  });

  it("refuses a curated domain that is itself a board host", () => {
    const decision = decideEmployerDomain({
      companyName: "Acme",
      normalizedKey: "acme",
      curatedDomain: "boards.greenhouse.io",
      candidates: noCandidates,
      postingText: "Acme is hiring. See boards.greenhouse.io for details.",
    });
    expect(decision.ok).toBe(false);
  });

  it("refuses when there is neither self-evidence nor a curated domain", () => {
    const decision = decideEmployerDomain({
      companyName: "Inamigos Foundation",
      normalizedKey: "inamigos foundation",
      candidates: [{ url: "https://internshala.com/internship/detail/x", field: "url" }],
    });
    expect(decision.ok).toBe(false);
  });
});

describe("decideEmployerDomain — homonym safety", () => {
  it("refuses a plain key that is a known, still-unsplit homonym", () => {
    const decision = decideEmployerDomain({
      companyName: "Porter",
      normalizedKey: "porter",
      curatedDomain: "porter.in",
      candidates: [{ url: "https://jobs.lever.co/porter/abc/apply", field: "url" }],
      postingText: "Porter. porter.in. Porter Porter Porter.",
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain("homonym");
  });

  it("gives a split homonym its own evidence-established domain", () => {
    const decision = decideEmployerDomain({
      companyName: "Slice",
      normalizedKey: "slice#slice.careers",
      candidates: noCandidates,
    });
    expect(decision).toMatchObject({
      ok: true,
      domain: "slice.careers",
      tier: "homonym_curated",
    });
  });

  it("gives the other side of the same collision its own, different domain", () => {
    const decision = decideEmployerDomain({
      companyName: "slice",
      normalizedKey: "slice#sliceit.com",
      candidates: noCandidates,
    });
    expect(decision).toMatchObject({ ok: true, domain: "sliceit.com" });
  });

  it("refuses a domain for a split entity that has none established", () => {
    const decision = decideEmployerDomain({
      companyName: "Porter",
      normalizedKey: "porter#lever-porter",
      curatedDomain: "porter.in",
      candidates: [{ url: "https://porter.in", field: "company_url" }],
      postingText: "Porter porter.in Porter",
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain("no employer domain is established");
  });

  it("refuses an unknown disambiguated key", () => {
    const decision = decideEmployerDomain({
      companyName: "Acme",
      normalizedKey: "acme#acme.com",
      candidates: noCandidates,
    });
    expect(decision.ok).toBe(false);
  });
});
