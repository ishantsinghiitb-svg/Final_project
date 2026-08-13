import { describe, expect, it } from "vitest";
import { isFabricatedSeedJob, isReservedHost } from "./fabricatedSeed";

describe("isReservedHost", () => {
  it("flags the RFC 2606 reserved domains", () => {
    expect(isReservedHost("example.com")).toBe(true);
    expect(isReservedHost("careers.example.com")).toBe(true);
    expect(isReservedHost("example.org")).toBe(true);
    expect(isReservedHost("example.net")).toBe(true);
  });

  it("flags reserved TLDs and localhost", () => {
    expect(isReservedHost("anything.invalid")).toBe(true);
    expect(isReservedHost("board.test")).toBe(true);
    expect(isReservedHost("localhost")).toBe(true);
  });

  it("does not flag a real employer host that merely contains the word", () => {
    expect(isReservedHost("example-company.com")).toBe(false);
    expect(isReservedHost("myexample.com")).toBe(false);
    expect(isReservedHost("highradius.com")).toBe(false);
  });

  it("does not flag an empty host", () => {
    expect(isReservedHost("")).toBe(false);
  });
});

describe("isFabricatedSeedJob", () => {
  it("flags each of the seven fabricated seed postings found in production", () => {
    for (const slug of [
      "amazon",
      "atlassian",
      "razorpay",
      "flipkart",
      "swiggy",
      "google",
      "microsoft",
    ]) {
      expect(isFabricatedSeedJob({ url: `https://careers.example.com/${slug}` })).toBe(true);
    }
  });

  it("flags a posting whose source_url is reserved even if url is not", () => {
    expect(
      isFabricatedSeedJob({
        url: "https://real-looking.com/jobs/1",
        sourceUrl: "https://careers.example.com/x",
      }),
    ).toBe(true);
  });

  it("does not flag genuine postings from any real platform", () => {
    const real = [
      "https://jobs.lever.co/paytm/7c317d05-b1ff-443f-975a-5b96e2728ac5/apply",
      "https://job-boards.greenhouse.io/postman/jobs/7722310003",
      "https://jobs.smartrecruiters.com/swiggy/6000000001300407",
      "https://www.highradius.com/about/careers-list/?gh_jid=7564206003",
      "https://weworkremotely.com/remote-jobs/coinbase-senior-software-engineer",
      "https://internshala.com/internship/detail/x",
    ];
    for (const url of real) expect(isFabricatedSeedJob({ url })).toBe(false);
  });

  it("does not flag a posting with no URL — missing data is not evidence of fabrication", () => {
    expect(isFabricatedSeedJob({ url: null })).toBe(false);
    expect(isFabricatedSeedJob({ url: "", sourceUrl: null })).toBe(false);
  });

  it("does not flag an unparseable URL", () => {
    expect(isFabricatedSeedJob({ url: "not a url" })).toBe(false);
  });
});
