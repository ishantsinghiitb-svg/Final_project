import { describe, expect, it } from "vitest";
import {
  extractFeedItems,
  extractSitemapUrls,
  readFeedAttribute,
  readFeedDate,
  readFeedField,
  readFeedLine,
} from "./xmlFeed";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss">
  <channel>
    <title>Board feed</title>
    <item>
      <media:content url="https://cdn.test/logo.gif" type="image/png"/>
      <title>Acme Corp: Senior Engineer</title>
      <region>Anywhere in the World</region>
      <type>Full-Time</type>
      <description>&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;</description>
      <pubDate>Fri, 07 Aug 2026 21:06:02 +0000</pubDate>
      <link>https://board.test/remote-jobs/acme-senior-engineer</link>
    </item>
    <item>
      <title><![CDATA[Beta Ltd: Designer]]></title>
      <link>https://board.test/remote-jobs/beta-designer</link>
    </item>
  </channel>
</rss>`;

describe("extractFeedItems", () => {
  it("returns one entry per item", () => {
    expect(extractFeedItems(FEED)).toHaveLength(2);
  });

  it("returns an empty list for a feed with no items", () => {
    expect(extractFeedItems("<rss><channel></channel></rss>")).toEqual([]);
  });

  it("supports a custom item tag", () => {
    expect(extractFeedItems("<url><loc>a</loc></url><url><loc>b</loc></url>", "url")).toHaveLength(
      2,
    );
  });
});

describe("readFeedField / readFeedLine", () => {
  const [first, second] = extractFeedItems(FEED);

  it("reads a plain field", () => {
    expect(readFeedLine(first, "title")).toBe("Acme Corp: Senior Engineer");
  });

  it("unwraps CDATA", () => {
    expect(readFeedLine(second, "title")).toBe("Beta Ltd: Designer");
  });

  it("decodes entities, leaving the inner markup for the HTML layer", () => {
    expect(readFeedField(first, "description")).toBe("<p>Build &amp; ship</p>");
  });

  it("returns null for a missing field", () => {
    expect(readFeedLine(first, "salary")).toBeNull();
  });

  it("returns null for an empty field", () => {
    expect(readFeedLine("<item><state>   </state></item>", "state")).toBeNull();
  });

  it("does not confuse a namespaced sibling for the bare tag", () => {
    expect(
      readFeedLine("<item><media:title>ns</media:title><title>real</title></item>", "title"),
    ).toBe("real");
  });
});

describe("readFeedAttribute", () => {
  const [first] = extractFeedItems(FEED);

  it("reads an attribute off a self-closing namespaced tag", () => {
    expect(readFeedAttribute(first, "media:content", "url")).toBe("https://cdn.test/logo.gif");
  });

  it("returns null when the tag or attribute is missing", () => {
    expect(readFeedAttribute(first, "media:content", "height")).toBeNull();
    expect(readFeedAttribute(first, "media:thumbnail", "url")).toBeNull();
  });
});

describe("readFeedDate", () => {
  const [first] = extractFeedItems(FEED);

  it("parses RFC-822 into ISO", () => {
    expect(readFeedDate(first, "pubDate")).toBe("2026-08-07T21:06:02.000Z");
  });

  it("returns null for an unparseable date", () => {
    expect(readFeedDate("<item><pubDate>soon</pubDate></item>", "pubDate")).toBeNull();
  });

  it("returns null for a missing date", () => {
    expect(readFeedDate(first, "expires_at")).toBeNull();
  });
});

describe("extractSitemapUrls", () => {
  it("reads every loc", () => {
    const xml = `<urlset><url><loc>https://a.test/1</loc></url><url><loc>
      https://a.test/2
    </loc></url></urlset>`;
    expect(extractSitemapUrls(xml)).toEqual(["https://a.test/1", "https://a.test/2"]);
  });

  it("decodes entities in URLs", () => {
    expect(extractSitemapUrls("<loc>https://a.test/x?a=1&amp;b=2</loc>")).toEqual([
      "https://a.test/x?a=1&b=2",
    ]);
  });
});
