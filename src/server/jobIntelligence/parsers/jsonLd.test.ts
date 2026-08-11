import { describe, expect, it } from "vitest";
import {
  escapeRawControlCharsInJsonStrings,
  extractJsonLdBlocks,
  findJobPostingNode,
  findJobPostingNodes,
  flattenJsonLd,
  readBaseSalary,
  readDate,
  readDescription,
  readHiringOrganization,
  readJobLocation,
  readNumber,
  readString,
  readStringList,
} from "./jsonLd";

function script(payload: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;
}

/** Wraps already-serialized JSON text verbatim, for fixtures that need control over the raw bytes. */
function rawScript(json: string): string {
  return `<script type="application/ld+json">${json}</script>`;
}

describe("extractJsonLdBlocks", () => {
  it("parses every ld+json block", () => {
    const html = script({ a: 1 }) + "<p>x</p>" + script([{ b: 2 }]);
    expect(extractJsonLdBlocks(html)).toEqual([{ a: 1 }, [{ b: 2 }]]);
  });

  it("ignores non-ld+json scripts", () => {
    expect(extractJsonLdBlocks(`<script>var a = {"b":1};</script>`)).toEqual([]);
  });

  it("skips a malformed block instead of throwing", () => {
    const html = `<script type="application/ld+json">{ nope </script>` + script({ ok: true });
    expect(extractJsonLdBlocks(html)).toEqual([{ ok: true }]);
  });

  it("recovers a block whose JSON was HTML-escaped", () => {
    const html = `<script type="application/ld+json">{&quot;a&quot;:1}</script>`;
    expect(extractJsonLdBlocks(html)).toEqual([{ a: 1 }]);
  });

  it("tolerates attribute order and single quotes on the type", () => {
    const html = `<script data-x='1' type='application/ld+json'>{"a":2}</script>`;
    expect(extractJsonLdBlocks(html)).toEqual([{ a: 2 }]);
  });

  // ── Module 10B.2.5: recovering raw control characters inside a JSON string ──

  it("recovers a block whose string value contains a raw newline", () => {
    // The exact defect shape found in the wild: a JobPosting's description
    // pasted in with a literal newline instead of an escaped \n, which the
    // JSON spec forbids unescaped inside a string.
    const html = rawScript(
      '{"@type":"JobPosting","title":"Engineer","description":"<p>Line one</p>\n<p>Line two</p>"}',
    );
    const blocks = extractJsonLdBlocks(html);
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { description: string }).description).toBe(
      "<p>Line one</p>\n<p>Line two</p>",
    );
  });

  it("recovers raw carriage-return and tab control characters inside a string", () => {
    const html = rawScript('{"a":"line1\r\nline2\tindented"}');
    expect(extractJsonLdBlocks(html)).toEqual([{ a: "line1\r\nline2\tindented" }]);
  });

  it("recovers an otherwise-uncommon raw control character via \\u escaping", () => {
    const html = rawScript('{"a":"bell\x07here"}');
    expect(extractJsonLdBlocks(html)).toEqual([{ a: "bell\x07here" }]);
  });

  it("does not double-escape an already-valid \\n", () => {
    const html = rawScript('{"a":"line1\\nline2"}');
    expect(extractJsonLdBlocks(html)).toEqual([{ a: "line1\nline2" }]);
  });

  it("preserves quotes and backslashes inside a repaired block", () => {
    const html = rawScript('{"a":"He said \\"hi\\" then C:\\\\path\nnext line"}');
    expect(extractJsonLdBlocks(html)).toEqual([{ a: 'He said "hi" then C:\\path\nnext line' }]);
  });

  it("preserves Unicode text inside a repaired block", () => {
    const html = rawScript('{"a":"caf\u00e9 \ud83d\ude80\nnext line"}');
    expect(extractJsonLdBlocks(html)).toEqual([{ a: "café 🚀\nnext line" }]);
  });

  it("still rejects JSON that is malformed for a reason repair cannot fix", () => {
    const html = rawScript('{"a": "unterminated\n');
    expect(extractJsonLdBlocks(html)).toEqual([]);
  });

  it("recovers multiple blocks independently — one clean, one needing repair", () => {
    const html = script({ a: 1 }) + rawScript('{"b":"broken\nvalue"}');
    expect(extractJsonLdBlocks(html)).toEqual([{ a: 1 }, { b: "broken\nvalue" }]);
  });

  it("still finds a JobPosting once its description is repaired", () => {
    const html = rawScript(
      '{"@type":"JobPosting","title":"Backend Engineer","description":"para one\npara two"}',
    );
    const node = findJobPostingNode(html);
    expect(node?.title).toBe("Backend Engineer");
    expect(node?.description).toBe("para one\npara two");
  });

  it("recovers a real-world defect shape: HTML-escaped markup AND a raw newline together", () => {
    // The exact shape found live on a job board: the description is
    // HTML-entity-escaped (&lt;p&gt;...) as many sites do, AND the ATS
    // joined two paragraphs with a literal newline instead of \n. Escaping
    // the raw newline alone is enough to make the block parseable — the
    // string value legitimately keeps its literal "&lt;p&gt;" text at this
    // layer, exactly as a normal (non-broken) HTML-escaped description
    // would. `readDescription`'s `htmlToPlainText` is what decodes entities
    // and strips tags, downstream, for every JSON-LD page alike — that is
    // the layer this repair needs to hand a *parseable* block to, not a
    // fully HTML-decoded one.
    const html = rawScript(
      '{"@type":"JobPosting","title":"Assistant Manager Finance",' +
        '"description":"&lt;p&gt;About us&lt;/p&gt;\n&lt;p&gt;The role&lt;/p&gt;"}',
    );
    const node = findJobPostingNode(html);
    expect(node?.title).toBe("Assistant Manager Finance");
    expect(readDescription(node!)).toBe("About us\n\nThe role");
  });
});

describe("escapeRawControlCharsInJsonStrings", () => {
  it("leaves already-valid JSON completely unchanged", () => {
    const json = '{"a":1,"b":"two words","c":[1,2,3],"d":null,"e":true}';
    expect(escapeRawControlCharsInJsonStrings(json)).toBe(json);
  });

  it("leaves whitespace OUTSIDE strings untouched, including newlines", () => {
    const json = '{\n  "a": 1,\n  "b": 2\n}';
    expect(escapeRawControlCharsInJsonStrings(json)).toBe(json);
  });

  it("escapes a raw newline inside a string but not the identical byte outside one", () => {
    const input = '{\n"a":"line1\nline2"\n}';
    const result = escapeRawControlCharsInJsonStrings(input);
    // The structural newlines (outside the string) are byte-identical...
    expect(result.startsWith('{\n"a":"')).toBe(true);
    expect(result.endsWith('"\n}')).toBe(true);
    // ...only the one inside the string became a real JSON escape.
    expect(result).toContain("line1\\nline2");
    expect(JSON.parse(result)).toEqual({ a: "line1\nline2" });
  });

  it("does not touch an already-escaped \\n", () => {
    const input = '{"a":"line1\\nline2"}';
    expect(escapeRawControlCharsInJsonStrings(input)).toBe(input);
  });

  it("does not toggle string state on an escaped quote", () => {
    const input = '{"a":"quote: \\" still inside\nstring"}';
    const result = escapeRawControlCharsInJsonStrings(input);
    expect(JSON.parse(result)).toEqual({ a: 'quote: " still inside\nstring' });
  });

  it("preserves a literal backslash immediately before a repaired control character", () => {
    const input = '{"a":"C:\\\\path\nnext"}';
    const result = escapeRawControlCharsInJsonStrings(input);
    expect(JSON.parse(result)).toEqual({ a: "C:\\path\nnext" });
  });

  it("preserves Unicode characters, including surrogate pairs, unchanged", () => {
    const input = '{"a":"caf\u00e9 \ud83d\ude80"}';
    expect(escapeRawControlCharsInJsonStrings(input)).toBe(input);
  });

  it("handles every JSON-named control escape (\\b \\t \\n \\f \\r)", () => {
    const input = '{"a":"\b\t\n\f\r"}';
    const result = escapeRawControlCharsInJsonStrings(input);
    expect(result).toBe('{"a":"\\b\\t\\n\\f\\r"}');
    expect(JSON.parse(result)).toEqual({ a: "\b\t\n\f\r" });
  });

  it("escapes a control character with no short name as \\u00XX", () => {
    const input = '{"a":"\x01"}';
    const result = escapeRawControlCharsInJsonStrings(input);
    expect(result).toBe('{"a":"\\u0001"}');
  });
});

describe("flattenJsonLd", () => {
  it("unwraps @graph containers", () => {
    const flattened = flattenJsonLd({ "@graph": [{ "@type": "JobPosting" }, { "@type": "Org" }] });
    expect(flattened.map((node) => node["@type"])).toContain("JobPosting");
    expect(flattened.map((node) => node["@type"])).toContain("Org");
  });

  it("handles arrays at the root", () => {
    expect(flattenJsonLd([{ a: 1 }, { b: 2 }])).toHaveLength(2);
  });

  it("returns nothing for scalars", () => {
    expect(flattenJsonLd("x")).toEqual([]);
    expect(flattenJsonLd(null)).toEqual([]);
  });
});

describe("findJobPostingNode(s)", () => {
  it("finds a plain JobPosting", () => {
    const html = script({ "@type": "JobPosting", title: "Engineer" });
    expect(findJobPostingNode(html)?.title).toBe("Engineer");
  });

  it("finds one inside @graph", () => {
    const html = script({
      "@graph": [{ "@type": "WebPage" }, { "@type": "JobPosting", title: "X" }],
    });
    expect(findJobPostingNode(html)?.title).toBe("X");
  });

  it("matches an array-valued @type", () => {
    const html = script({ "@type": ["Thing", "JobPosting"], title: "Y" });
    expect(findJobPostingNode(html)?.title).toBe("Y");
  });

  it("is case-insensitive on the type name", () => {
    expect(findJobPostingNode(script({ "@type": "jobposting", title: "Z" }))?.title).toBe("Z");
  });

  it("returns null when the page has none", () => {
    expect(findJobPostingNode(script({ "@type": "Organization" }))).toBeNull();
  });

  it("returns every posting when a page embeds several", () => {
    const html = script([
      { "@type": "JobPosting", title: "A" },
      { "@type": "JobPosting", title: "B" },
    ]);
    expect(findJobPostingNodes(html)).toHaveLength(2);
  });
});

describe("field readers", () => {
  it("readString unwraps arrays and @value wrappers", () => {
    expect(readString("  a  b ")).toBe("a b");
    expect(readString(["", "second"])).toBe("second");
    expect(readString({ "@value": "wrapped" })).toBe("wrapped");
    expect(readString({ name: "named" })).toBe("named");
    expect(readString(null)).toBeNull();
    expect(readString(42)).toBe("42");
  });

  it("readNumber parses formatted numbers", () => {
    expect(readNumber("120,000")).toBe(120000);
    expect(readNumber(95.5)).toBe(95.5);
    expect(readNumber("not a number")).toBeNull();
  });

  it("readStringList normalizes scalar-or-array", () => {
    expect(readStringList("one")).toEqual(["one"]);
    expect(readStringList(["a", "", "b"])).toEqual(["a", "b"]);
    expect(readStringList(null)).toEqual([]);
  });

  it("readDate normalizes to ISO and rejects garbage", () => {
    expect(readDate("2026-08-01")).toBe("2026-08-01T00:00:00.000Z");
    expect(readDate("not-a-date")).toBeNull();
    expect(readDate(null)).toBeNull();
  });

  it("readDescription strips HTML from the description string", () => {
    const node = { description: "<p>Build <b>things</b></p><ul><li>One</li></ul>" };
    const text = readDescription(node);
    expect(text).toBe("Build things\n\n- One");
    expect(text).not.toMatch(/[<>]/);
  });
});

describe("readJobLocation", () => {
  it("reads a structured postal address", () => {
    const place = readJobLocation({
      jobLocation: {
        "@type": "Place",
        address: { addressLocality: "Bengaluru", addressRegion: "KA", addressCountry: "IN" },
      },
    });
    expect(place).toEqual({
      location: "Bengaluru, KA, IN",
      city: "Bengaluru",
      state: "KA",
      country: "IN",
    });
  });

  it("takes the first entry of an array", () => {
    const place = readJobLocation({
      jobLocation: [
        { address: { addressLocality: "London" } },
        { address: { addressLocality: "Paris" } },
      ],
    });
    expect(place.city).toBe("London");
  });

  it("handles a bare string address", () => {
    expect(readJobLocation({ jobLocation: { address: "Remote, Worldwide" } })).toEqual({
      location: "Remote, Worldwide",
      city: null,
      state: null,
      country: null,
    });
  });

  it("falls back to applicantLocationRequirements", () => {
    expect(readJobLocation({ applicantLocationRequirements: "USA" }).location).toBe("USA");
  });

  it("returns nulls when absent", () => {
    expect(readJobLocation({})).toEqual({ location: null, city: null, state: null, country: null });
  });
});

describe("readBaseSalary", () => {
  it("reads a min/max QuantitativeValue with a unit", () => {
    expect(
      readBaseSalary({
        baseSalary: {
          "@type": "MonetaryAmount",
          currency: "USD",
          value: {
            "@type": "QuantitativeValue",
            minValue: 120000,
            maxValue: 150000,
            unitText: "YEAR",
          },
        },
      }),
    ).toEqual({ min: 120000, max: 150000, currency: "USD", period: "Yearly" });
  });

  it("treats a single `value` as both bounds", () => {
    expect(
      readBaseSalary({
        baseSalary: { currency: "INR", value: { value: 50000, unitText: "MONTH" } },
      }),
    ).toEqual({ min: 50000, max: 50000, currency: "INR", period: "Monthly" });
  });

  it("handles a scalar value", () => {
    expect(readBaseSalary({ baseSalary: { currency: "EUR", value: 60000 } })).toEqual({
      min: 60000,
      max: 60000,
      currency: "EUR",
      period: null,
    });
  });

  it("returns nulls when absent", () => {
    expect(readBaseSalary({})).toEqual({ min: null, max: null, currency: null, period: null });
  });
});

describe("readHiringOrganization", () => {
  it("reads an object form", () => {
    expect(
      readHiringOrganization({
        hiringOrganization: {
          "@type": "Organization",
          name: "Acme",
          url: "https://acme.test",
          logo: { url: "https://acme.test/logo.png" },
        },
      }),
    ).toEqual({ name: "Acme", url: "https://acme.test", logo: "https://acme.test/logo.png" });
  });

  it("reads a bare string form", () => {
    expect(readHiringOrganization({ hiringOrganization: "Acme" })).toEqual({
      name: "Acme",
      url: null,
      logo: null,
    });
  });

  it("reads a string logo", () => {
    expect(
      readHiringOrganization({ hiringOrganization: { name: "A", logo: "https://a.test/l.png" } })
        .logo,
    ).toBe("https://a.test/l.png");
  });

  it("returns nulls when absent", () => {
    expect(readHiringOrganization({})).toEqual({ name: null, url: null, logo: null });
  });
});
