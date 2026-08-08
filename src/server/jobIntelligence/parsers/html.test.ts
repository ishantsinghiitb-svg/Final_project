import { describe, expect, it } from "vitest";
import {
  collapseWhitespace,
  decodeHtmlEntities,
  findElements,
  findElementsByClass,
  hasClass,
  htmlToInlineText,
  htmlToPlainText,
  readAttribute,
  readMetaContent,
  resolveUrl,
  stripNonContent,
  textOfFirstByClass,
  textsByClass,
} from "./html";

describe("decodeHtmlEntities", () => {
  it("decodes named entities", () => {
    expect(decodeHtmlEntities("a &amp; b &lt;c&gt; &quot;d&quot;")).toBe('a & b <c> "d"');
  });

  it("decodes decimal and hex numeric entities", () => {
    expect(decodeHtmlEntities("&#8377;500")).toBe("₹500");
    expect(decodeHtmlEntities("&#x20B9;500")).toBe("₹500");
  });

  it("leaves unknown entities verbatim rather than corrupting them", () => {
    expect(decodeHtmlEntities("&notarealentity; x")).toBe("&notarealentity; x");
  });

  it("ignores out-of-range code points instead of throwing", () => {
    expect(decodeHtmlEntities("&#99999999;")).toBe("&#99999999;");
  });

  it("decodes nbsp to a plain space", () => {
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
  });
});

describe("stripNonContent", () => {
  it("removes script and style bodies plus comments", () => {
    const html = `<div>keep<script>var a = "<b>no</b>";</script><style>.x{}</style><!-- gone --></div>`;
    const stripped = stripNonContent(html);
    expect(stripped).toContain("keep");
    expect(stripped).not.toContain("var a");
    expect(stripped).not.toContain(".x{}");
    expect(stripped).not.toContain("gone");
  });
});

describe("htmlToPlainText", () => {
  it("turns block boundaries into newlines and list items into bullets", () => {
    const html = "<p>Intro</p><ul><li>One</li><li>Two</li></ul><p>Outro</p>";
    expect(htmlToPlainText(html)).toBe("Intro\n\n- One\n- Two\n\nOutro");
  });

  it("converts <br> to a newline", () => {
    expect(htmlToPlainText("a<br />b<br>c")).toBe("a\nb\nc");
  });

  it("decodes entities in the output", () => {
    expect(htmlToPlainText("<p>Stipend: &#8377; 12,000 &amp; up</p>")).toBe(
      "Stipend: ₹ 12,000 & up",
    );
  });

  it("never leaves markup behind", () => {
    const text = htmlToPlainText('<div class="a"><span>hi</span><img src="x"/></div>');
    expect(text).not.toMatch(/[<>]/);
    expect(text).toBe("hi");
  });

  it("collapses runs of blank lines", () => {
    expect(htmlToPlainText("<p>a</p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
  });

  it("returns an empty string for null/undefined", () => {
    expect(htmlToPlainText(null)).toBe("");
    expect(htmlToPlainText(undefined)).toBe("");
  });
});

describe("htmlToInlineText", () => {
  it("flattens to a single line", () => {
    expect(htmlToInlineText("<p>a</p><p>b</p>")).toBe("a b");
  });
});

describe("readAttribute", () => {
  it("reads double- and single-quoted values", () => {
    expect(readAttribute('<div class="a b">', "class")).toBe("a b");
    expect(readAttribute("<div data-href='/x/y'>", "data-href")).toBe("/x/y");
  });

  it("reads unquoted values", () => {
    expect(readAttribute("<div internshipId=3232915>", "internshipId")).toBe("3232915");
  });

  it("is case-insensitive on the attribute name", () => {
    expect(readAttribute('<div INTERNSHIPID="12">', "internshipid")).toBe("12");
  });

  it("decodes entities inside attribute values", () => {
    expect(readAttribute('<a href="/a?x=1&amp;y=2">', "href")).toBe("/a?x=1&y=2");
  });

  it("returns null when absent", () => {
    expect(readAttribute("<div>", "class")).toBeNull();
  });

  it("does not match a longer attribute that merely ends with the name", () => {
    expect(readAttribute('<div data-class="x">', "class")).toBeNull();
  });
});

describe("hasClass", () => {
  it("matches whole tokens only", () => {
    expect(
      hasClass(
        '<div class="individual_internship visibilityTrackerItem">',
        "individual_internship",
      ),
    ).toBe(true);
    // `individual_internship_details` must NOT match the token `internship_details`.
    expect(hasClass('<div class="individual_internship_details">', "internship_details")).toBe(
      false,
    );
  });
});

describe("findElements", () => {
  it("returns the whole element when it nests same-tag children", () => {
    const html = `<div class="card"><div class="inner">x</div>tail</div>`;
    const [card] = findElementsByClass(html, "div", "card");
    expect(card.innerHtml).toBe(`<div class="inner">x</div>tail`);
  });

  it("does not emit a nested match as a sibling of its container", () => {
    const html = `<div class="card">a<div class="card">b</div></div><div class="card">c</div>`;
    const cards = findElementsByClass(html, "div", "card");
    expect(cards).toHaveLength(2);
    expect(htmlToInlineText(cards[0].innerHtml)).toBe("a b");
    expect(htmlToInlineText(cards[1].innerHtml)).toBe("c");
  });

  it("still finds a nested match when the outer element does not qualify", () => {
    const html = `<div class="wrap"><div class="card">inner</div></div>`;
    const cards = findElementsByClass(html, "div", "card");
    expect(cards).toHaveLength(1);
    expect(cards[0].innerHtml).toBe("inner");
  });

  it("treats void tags as having no inner content", () => {
    const images = findElements('<img src="a.png"><img src="b.png">', "img");
    expect(images).toHaveLength(2);
    expect(images[0].innerHtml).toBe("");
    expect(readAttribute(images[0].openTag, "src")).toBe("a.png");
  });

  it("honours the limit", () => {
    const html = `<li>1</li><li>2</li><li>3</li>`;
    expect(findElements(html, "li", () => true, 2)).toHaveLength(2);
  });

  it("runs an unclosed element to the end rather than truncating at the wrong place", () => {
    const [card] = findElementsByClass(`<div class="card">a<span>b</span>`, "div", "card");
    expect(card.innerHtml).toContain("a");
    expect(card.innerHtml).toContain("b");
  });

  it("ignores matches inside script bodies", () => {
    const html = `<script>var s = '<div class="card">fake</div>';</script><div class="card">real</div>`;
    const cards = findElementsByClass(html, "div", "card");
    expect(cards).toHaveLength(1);
    expect(cards[0].innerHtml).toBe("real");
  });
});

describe("textOfFirstByClass / textsByClass", () => {
  const html = `<span class="round_tabs">Java</span><span class="round_tabs">SQL</span><span class="other">x</span>`;

  it("reads the first matching element's text", () => {
    expect(textOfFirstByClass(html, "span", "round_tabs")).toBe("Java");
  });

  it("reads every matching element's text", () => {
    expect(textsByClass(html, "span", "round_tabs")).toEqual(["Java", "SQL"]);
  });

  it("returns null when nothing matches", () => {
    expect(textOfFirstByClass(html, "span", "nope")).toBeNull();
  });
});

describe("readMetaContent", () => {
  it("reads by name and by property", () => {
    const html = `<meta name="description" content="A job"><meta property="og:title" content="Role at Co">`;
    expect(readMetaContent(html, "description")).toBe("A job");
    expect(readMetaContent(html, "og:title")).toBe("Role at Co");
  });

  it("returns null when the meta is missing", () => {
    expect(readMetaContent("<meta name='x' content='y'>", "description")).toBeNull();
  });
});

describe("resolveUrl", () => {
  it("resolves relative paths against the base", () => {
    expect(resolveUrl("/internship/detail/x", "https://internshala.com/internships/")).toBe(
      "https://internshala.com/internship/detail/x",
    );
  });

  it("returns absolute URLs unchanged", () => {
    expect(resolveUrl("https://a.com/x", "https://b.com")).toBe("https://a.com/x");
  });

  it("rejects fragments, javascript: and empties", () => {
    expect(resolveUrl("#top", "https://a.com")).toBeNull();
    expect(resolveUrl("javascript:void(0)", "https://a.com")).toBeNull();
    expect(resolveUrl("  ", "https://a.com")).toBeNull();
    expect(resolveUrl(null, "https://a.com")).toBeNull();
  });
});

describe("collapseWhitespace", () => {
  it("collapses and trims", () => {
    expect(collapseWhitespace("  a \n\t b  ")).toBe("a b");
  });
});
