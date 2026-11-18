import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "@/lib/canonical-host";

const prod = { vercelEnv: "production", productionHost: "arcana-intelligence.vercel.app", method: "GET" };

describe("canonical production host", () => {
  it("sends a branch alias to the production domain, keeping path and query", () => {
    expect(
      canonicalRedirect({
        ...prod,
        host: "arcana-intelligence-git-main-domon-naraseth.vercel.app",
        pathAndQuery: "/pricing?payment=cancelled",
      }),
    ).toBe("https://arcana-intelligence.vercel.app/pricing?payment=cancelled");
  });

  it("leaves the production domain alone, whatever its case or port", () => {
    expect(canonicalRedirect({ ...prod, host: "arcana-intelligence.vercel.app", pathAndQuery: "/" })).toBeNull();
    expect(canonicalRedirect({ ...prod, host: "ARCANA-Intelligence.vercel.app:443", pathAndQuery: "/" })).toBeNull();
  });

  it("does nothing outside production or without a known production host", () => {
    const alias = { host: "preview-abc.vercel.app", pathAndQuery: "/", method: "GET" };
    expect(canonicalRedirect({ ...alias, vercelEnv: "preview", productionHost: prod.productionHost })).toBeNull();
    expect(canonicalRedirect({ ...alias, vercelEnv: undefined, productionHost: undefined })).toBeNull();
    expect(canonicalRedirect({ ...alias, vercelEnv: "production", productionHost: "" })).toBeNull();
    expect(canonicalRedirect({ host: "localhost:3000", pathAndQuery: "/", method: "GET" })).toBeNull();
  });

  it("never redirects a request that carries a body", () => {
    expect(
      canonicalRedirect({ ...prod, method: "POST", host: "alias.vercel.app", pathAndQuery: "/api/daily" }),
    ).toBeNull();
  });
});
