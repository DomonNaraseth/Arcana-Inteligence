import { describe, expect, it } from "vitest";
import { renewalNotice } from "@/lib/billing/renewal";
import type { MySubscription } from "@/lib/billing/service";
import { attributeVisit, buildTrackedUrl, cleanTag, deviceClass, isBot, trackedPath } from "@/lib/tracking";

const OWN = "arcana-intelligence.vercel.app";

describe("which pages are measured", () => {
  it("keeps public and app pages as they are", () => {
    for (const p of ["/", "/home", "/daily", "/cards", "/pricing", "/terms", "/account"]) {
      expect(trackedPath(p)).toBe(p);
    }
    expect(trackedPath("/pricing/")).toBe("/pricing");
    expect(trackedPath("/cards/the-fool")).toBe("/cards/the-fool");
  });

  it("replaces personal ids with a placeholder", () => {
    expect(trackedPath("/reading/18c962eb-f2ac-43ff-b543-4c7d74b97ffa")).toBe("/reading/[id]");
    expect(trackedPath("/pay/18c962eb-f2ac-43ff-b543-4c7d74b97ffa")).toBe("/pay/[id]");
    expect(trackedPath("/reading/not-an-id")).toBeNull();
  });

  it("does not measure admin, API, auth or unknown pages", () => {
    for (const p of ["/admin", "/admin/payments", "/api/track", "/auth/callback", "/cards/../admin", "/x", "", null]) {
      expect(trackedPath(p)).toBeNull();
    }
  });
});

describe("where a visit came from", () => {
  it("prefers campaign tags and normalises them", () => {
    expect(
      attributeVisit({
        search: "?utm_source=Facebook&utm_medium=Paid Social&utm_campaign=Launch Nov&q=x",
        referrer: "https://l.facebook.com/",
        ownHost: OWN,
      }),
    ).toEqual({
      source: "facebook",
      medium: "paid-social",
      campaign: "launch-nov",
      content: null,
      term: null,
      referrer_host: "l.facebook.com",
    });
  });

  it("recognises search engines and social apps from the referrer", () => {
    expect(attributeVisit({ search: "", referrer: "https://www.google.co.th/", ownHost: OWN })).toMatchObject({
      source: "google",
      medium: "organic",
    });
    expect(attributeVisit({ search: "", referrer: "https://line.me/R/", ownHost: OWN })).toMatchObject({ source: "line" });
    expect(
      attributeVisit({ search: "", referrer: "android-app://jp.naver.line.android/", ownHost: OWN }),
    ).toMatchObject({ source: "line" });
    expect(attributeVisit({ search: "", referrer: "https://t.co/abc", ownHost: OWN })).toMatchObject({ source: "x" });
    expect(attributeVisit({ search: "", referrer: "https://pantip.com/topic/1", ownHost: OWN })).toMatchObject({
      source: "pantip",
      medium: "referral",
    });
    expect(attributeVisit({ search: "", referrer: "https://someblog.example/post", ownHost: OWN })).toMatchObject({
      source: "someblog.example",
      medium: "referral",
    });
  });

  it("knows the ad network from a click id alone", () => {
    expect(attributeVisit({ search: "?gclid=abc", referrer: "", ownHost: OWN })).toMatchObject({
      source: "google",
      medium: "cpc",
    });
    expect(attributeVisit({ search: "?fbclid=abc", referrer: "", ownHost: OWN })).toMatchObject({ source: "facebook" });
  });

  it("treats links inside the site and typed visits as no new source", () => {
    expect(attributeVisit({ search: "", referrer: `https://${OWN}/daily`, ownHost: OWN })).toBeNull();
    expect(attributeVisit({ search: "", referrer: "", ownHost: OWN })).toBeNull();
    expect(attributeVisit({ search: "?q=ความรัก", referrer: null, ownHost: OWN })).toBeNull();
    expect(attributeVisit({ search: "", referrer: "not a url", ownHost: OWN })).toBeNull();
  });

  it("never keeps the full referring address", () => {
    const touch = attributeVisit({
      search: "",
      referrer: "https://someblog.example/private/path?email=a@b.c",
      ownHost: OWN,
    });
    expect(JSON.stringify(touch)).not.toContain("email");
    expect(JSON.stringify(touch)).not.toContain("private");
  });
});

describe("device and bots", () => {
  it("classifies devices coarsely", () => {
    expect(deviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148")).toBe("mobile");
    expect(deviceClass("Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36")).toBe("mobile");
    expect(deviceClass("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe("tablet");
    expect(deviceClass("Mozilla/5.0 (Linux; Android 15; SM-X910) Safari/537.36")).toBe("tablet");
    expect(deviceClass("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140")).toBe("desktop");
  });

  it("ignores crawlers and link previews", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/140")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140")).toBe(false);
  });
});

describe("campaign links", () => {
  it("builds a tagged link that follows the naming rule", () => {
    const url = buildTrackedUrl(`https://${OWN}/daily`, { source: "LINE", medium: "Social", campaign: "Launch Nov" });
    expect(url).toBe(`https://${OWN}/daily?utm_source=line&utm_medium=social&utm_campaign=launch-nov`);
  });

  it("needs source, medium and campaign", () => {
    expect(buildTrackedUrl(`https://${OWN}/`, { source: "line", medium: "", campaign: "x" })).toBeNull();
    expect(buildTrackedUrl("not a url", { source: "line", medium: "social", campaign: "x" })).toBeNull();
    expect(cleanTag("  Hello   World!! ")).toBe("hello-world");
    expect(cleanTag("")).toBeNull();
  });
});

describe("renewal reminder", () => {
  const now = Date.parse("2026-11-18T12:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;
  const sub = (over: Partial<MySubscription>): MySubscription => ({
    tier: "basic",
    status: "active",
    plan_id: "basic",
    source: "prepaid",
    current_period_end: new Date(now + 10 * day).toISOString(),
    cancel_at_period_end: false,
    manageable: false,
    active: true,
    ...over,
  });

  it("stays quiet while plenty of time is left", () => {
    expect(renewalNotice(sub({}), now)).toBeNull();
  });

  it("reminds in the last days and on the last day", () => {
    expect(renewalNotice(sub({ current_period_end: new Date(now + 3.5 * day).toISOString() }), now)).toEqual({
      kind: "ending",
      days: 3,
      tier: "basic",
    });
    expect(renewalNotice(sub({ current_period_end: new Date(now + 2 * 3600_000).toISOString() }), now)?.days).toBe(0);
  });

  it("keeps reminding for a week after it ends, then stops", () => {
    const ended = sub({ active: false, current_period_end: new Date(now - 2 * day).toISOString() });
    expect(renewalNotice(ended, now)).toEqual({ kind: "ended", days: 2, tier: "basic" });
    expect(renewalNotice(sub({ active: false, current_period_end: new Date(now - 8 * day).toISOString() }), now)).toBeNull();
  });

  it("never reminds about memberships that renew by themselves or were set by an admin", () => {
    const soon = new Date(now + day).toISOString();
    expect(renewalNotice(sub({ source: "stripe", current_period_end: soon }), now)).toBeNull();
    expect(renewalNotice(sub({ source: "admin", current_period_end: soon }), now)).toBeNull();
    expect(renewalNotice(null, now)).toBeNull();
  });
});
