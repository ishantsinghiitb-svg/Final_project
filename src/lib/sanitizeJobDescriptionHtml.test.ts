import { describe, expect, it } from "vitest";
import {
  MAX_JOB_DESCRIPTION_HTML_LENGTH,
  sanitizeJobDescriptionHtml as sanitize,
} from "./sanitizeJobDescriptionHtml";

// ── A1 stored-XSS regression suite ───────────────────────────────────────────
//
// `global_jobs.description_html` is rendered with `dangerouslySetInnerHTML`
// and is writable by any authenticated user through `upsert_global_job`
// (PostgREST) and by the crawler through `admin_upsert_global_job`. These
// tests are the executable proof that none of the classic payloads survive
// this shared sanitizer.
//
// The single invariant every payload test asserts: the output can contain
// NONE of `<script`, an ` on<handler>=` attribute, `javascript:`, or a live
// `<` that starts a non-allow-listed tag.

const ALLOWED_TAG_RE = /<\/?(?:p|br|ul|ol|li|strong|em|b|i|h[1-4])>/gi;

/** True when `html` cannot execute script in a browser: after removing the
 *  allow-listed structural tags, no `<` capable of opening a tag remains, and
 *  none of the known executable tokens are present. */
function isInert(html: string | null): boolean {
  if (html == null) return true;
  const stripped = html.replace(ALLOWED_TAG_RE, "");
  if (/<[a-z!/?]/i.test(stripped)) return false; // any residual tag-opening `<`
  if (/<\s*script/i.test(html)) return false;
  if (/\son\w+\s*=/i.test(html)) return false; // onerror= / onclick= / onload= ...
  if (/javascript:/i.test(html)) return false;
  if (/\ssrc\s*=/i.test(html) || /\shref\s*=/i.test(html)) return false;
  return true;
}

describe("sanitizeJobDescriptionHtml — nullish & bounds", () => {
  it("returns null for null / undefined / empty / whitespace-only", () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeNull();
    expect(sanitize("")).toBeNull();
    expect(sanitize("   \n\t  ")).toBeNull();
  });

  it("returns null when nothing renderable survives", () => {
    expect(sanitize("<script>alert(1)</script>")).toBeNull();
    expect(sanitize("<img src=x onerror=alert(1)>")).toBeNull();
    expect(sanitize("<div></div>")).toBeNull();
  });

  it("caps output length (input is truncated before parsing)", () => {
    const huge = "a".repeat(MAX_JOB_DESCRIPTION_HTML_LENGTH * 3);
    const out = sanitize(huge) ?? "";
    expect(out.length).toBeLessThanOrEqual(MAX_JOB_DESCRIPTION_HTML_LENGTH);
  });

  it("a truncated-mid-tag hostile payload cannot produce a live tag", () => {
    const payload = "<p>ok</p>".repeat(20_000) + "<script>alert(1)"; // script tail past the cap
    expect(isInert(sanitize(payload))).toBe(true);
  });

  it("strips C0 control characters, so they cannot forge a tag or hide a payload", () => {
    const SOH = String.fromCharCode(1);
    const STX = String.fromCharCode(2);
    const NUL = String.fromCharCode(0);
    const out = sanitize(`${SOH}p${STX}x${SOH}/p${STX}${NUL}<script>alert(1)</script>`);
    expect(isInert(out)).toBe(true);
    expect(out ?? "").not.toContain(SOH);
    expect(out ?? "").not.toContain(STX);
    expect(out ?? "").not.toContain(NUL);
  });
});

describe("sanitizeJobDescriptionHtml — the required XSS payloads cannot execute", () => {
  const payloads: Array<[string, string]> = [
    ["bare img/onerror", "<img src=x onerror=alert(1)>"],
    ["img/onerror in prose", "Great role. <img src=x onerror=alert(1)> Apply now."],
    ["script element", "<script>alert(1)</script>"],
    [
      "script with attrs / whitespace",
      "<script  type='text/javascript' >alert(document.cookie)</script>",
    ],
    ["uppercase SCRIPT", "<SCRIPT>alert(1)</SCRIPT>"],
    ["split / nested script", "<scr<script>ipt>alert(1)</scr</script>ipt>"],
    ["unterminated script", "<script>alert(1)"],
    ["svg onload", "<svg/onload=alert(1)>"],
    ["svg with child script", "<svg><script>alert(1)</script></svg>"],
    ["math mtext script", "<math><mtext><script>alert(1)</script></mtext></math>"],
    ["iframe javascript: src", '<iframe src="javascript:alert(1)"></iframe>'],
    ["iframe srcdoc", '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
    ["object data uri", '<object data="data:text/html,<script>alert(1)</script>"></object>'],
    ["embed data uri", '<embed src="data:image/svg+xml,<svg onload=alert(1)>">'],
    ["anchor javascript: href", '<a href="javascript:alert(1)">click</a>'],
    ["anchor JaVaScRiPt: href", '<a href="JaVaScRiPt:alert(1)">click</a>'],
    ["anchor entity-encoded scheme", '<a href="java&#115;cript:alert(1)">x</a>'],
    ["p with onclick", '<p onclick="alert(1)">hi</p>'],
    [
      "p with expression() style + handler",
      '<p style="x:expression(alert(1))" onmouseover=alert(1)>hi</p>',
    ],
    ["allow-listed tag carrying a handler", "<strong onerror=alert(1)>bold</strong>"],
    ["li with autofocus/onfocus", "<li tabindex=1 onfocus=alert(1) autofocus>x</li>"],
    ["body onload", "<body onload=alert(1)>x</body>"],
    [
      "style element with url(javascript:)",
      "<style>*{background:url(javascript:alert(1))}</style>",
    ],
    ["link stylesheet", '<link rel="stylesheet" href="//evil/x.css">'],
    ["base href hijack", '<base href="//evil/">'],
    ["form + formaction button", '<form action="javascript:alert(1)"><button>go</button></form>'],
    ["HTML comment hiding a script", "<!-- <script>alert(1)</script> -->"],
    ["IE conditional comment", "<!--[if IE]><script>alert(1)</script><![endif]-->"],
    ["CDATA wrapper", "<![CDATA[<script>alert(1)</script>]]>"],
    ["processing instruction", '<?xml-stylesheet href="javascript:alert(1)"?>'],
    ["mixed-case handler with newline", "<p\nOnClIcK=alert(1)>hi</p>"],
    ["backtick no-quote handler", "<p onclick=alert`1`>hi</p>"],
    ["img with newlines before onerror", "<img\nsrc=x\nonerror=alert(1)>"],
    ["textarea break-out", "</textarea><script>alert(1)</script>"],
    ["title break-out", "</title><script>alert(1)</script>"],
    ["noscript wrapper", "<noscript><p>x</p></noscript><script>alert(1)</script>"],
    ["template element", "<template><script>alert(1)</script></template>"],
    ["data-uri image", '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">'],
  ];

  it.each(payloads)("neutralises: %s", (_label, payload) => {
    const out = sanitize(payload);
    expect(isInert(out)).toBe(true);
    if (out !== null) {
      expect(out).not.toMatch(/<\s*script/i);
      expect(out).not.toMatch(/javascript:/i);
      expect(out).not.toMatch(/\son\w+\s*=/i);
      expect(out).not.toMatch(
        /<\s*(?:img|svg|iframe|object|embed|style|link|base|form|body|math|a|script)\b/i,
      );
    }
  });

  it("never emits an attribute on a retained tag", () => {
    const out = sanitize(
      '<p class="x" data-y="z" onclick="alert(1)" style="color:red">' +
        '<strong id="a" onmouseover="x()">bold</strong></p>',
    );
    expect(out).toBe("<p><strong>bold</strong></p>");
  });

  it("a payload that is only a comment + script yields null", () => {
    expect(sanitize("<!--x--><script>alert(1)</script>")).toBeNull();
  });

  it("does NOT decode HTML entities (so &lt;script&gt; stays inert text)", () => {
    const out = sanitize("Use &lt;script&gt; carefully &amp; well");
    expect(out).toBe("Use &lt;script&gt; carefully &amp; well");
    expect(isInert(out)).toBe(true);
  });
});

describe("sanitizeJobDescriptionHtml — legitimate job-description formatting is preserved", () => {
  it("keeps headings, paragraphs, lists and inline emphasis", () => {
    const input =
      "<h2>About the role</h2>" +
      "<p>We are hiring a <strong>Senior Backend Engineer</strong>.</p>" +
      "<h3>Responsibilities</h3>" +
      "<ul><li>Design APIs</li><li>Own <em>reliability</em></li></ul>" +
      "<h3>Requirements</h3>" +
      "<ol><li>5+ years</li><li>Go or Rust</li></ol>";
    expect(sanitize(input)).toBe(input);
  });

  it("keeps <br> line breaks (normalised to <br>)", () => {
    expect(sanitize("<p>Line one<br>Line two<br/>Line three</p>")).toBe(
      "<p>Line one<br>Line two<br>Line three</p>",
    );
  });

  it("retains the text of non-allow-listed block wrappers instead of flattening it away", () => {
    const out = sanitize("<div>First block</div><section>Second block</section>");
    expect(out).toContain("First block");
    expect(out).toContain("Second block");
    expect(isInert(out)).toBe(true);
  });

  it("normalises tag case", () => {
    expect(sanitize("<P>Hi <STRONG>there</STRONG></P>")).toBe("<p>Hi <strong>there</strong></p>");
  });

  it("preserves ordinary punctuation including bare < and >", () => {
    expect(sanitize("<p>Salary &gt; 20 LPA, team &lt; 10 people</p>")).toBe(
      "<p>Salary &gt; 20 LPA, team &lt; 10 people</p>",
    );
    expect(sanitize("Comfortable with C++ & algorithms; a<b<c ordering")).toBe(
      "Comfortable with C++ & algorithms; a&lt;b&lt;c ordering",
    );
  });

  it("is idempotent on its own output", () => {
    const input = "<h2>Team</h2><p>Join <strong>us</strong>.</p><ul><li>one</li><li>two</li></ul>";
    const once = sanitize(input);
    expect(sanitize(once)).toBe(once);
  });

  it("leaves already-clean extension-sanitised HTML unchanged", () => {
    const extensionOutput =
      "<p>Build delightful products.</p><ul><li>React</li><li>TypeScript</li></ul>";
    expect(sanitize(extensionOutput)).toBe(extensionOutput);
  });
});
