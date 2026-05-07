import { describe, expect, it } from "vitest";
import { resolvePrismaDatasourceUrl } from "@/lib/prismaDatasourceUrl";

describe("resolvePrismaDatasourceUrl", () => {
  it("keeps minimum connection_limit=1 on Vercel production", () => {
    const result = resolvePrismaDatasourceUrl(
      "postgresql://u:p@host:6543/postgres?pgbouncer=true&connection_limit=1",
      { nodeEnv: "production", vercel: "1", minConnectionLimit: "8" },
    );
    const url = new URL(result.normalizedUrl);
    expect(url.searchParams.get("connection_limit")).toBe("1");
    expect(result.warning).toBeUndefined();
  });

  it("bumps non-serverless connection_limit floor to default 5", () => {
    const result = resolvePrismaDatasourceUrl(
      "postgresql://u:p@host:6543/postgres?pgbouncer=true&connection_limit=1",
      { nodeEnv: "development" },
    );
    const url = new URL(result.normalizedUrl);
    expect(url.searchParams.get("connection_limit")).toBe("5");
  });

  it("applies non-serverless floor override from env", () => {
    const result = resolvePrismaDatasourceUrl(
      "postgresql://u:p@host:6543/postgres?pgbouncer=true&connection_limit=2",
      { nodeEnv: "development", minConnectionLimit: "9" },
    );
    const url = new URL(result.normalizedUrl);
    expect(url.searchParams.get("connection_limit")).toBe("9");
  });

  it("adds missing connection_limit parameter", () => {
    const result = resolvePrismaDatasourceUrl(
      "postgresql://u:p@host:6543/postgres?pgbouncer=true",
      { nodeEnv: "development" },
    );
    const url = new URL(result.normalizedUrl);
    expect(url.searchParams.get("connection_limit")).toBe("5");
  });

  it("returns warning in serverless when URL does not look pooled", () => {
    const result = resolvePrismaDatasourceUrl(
      "postgresql://u:p@host:5432/postgres?sslmode=require",
      { nodeEnv: "production", vercel: "1" },
    );
    expect(result.warning).toContain("transaction pooler");
  });

  it("passes through malformed URL unchanged", () => {
    const malformed = "not-a-valid-db-url";
    const result = resolvePrismaDatasourceUrl(malformed, {
      nodeEnv: "development",
    });
    expect(result.normalizedUrl).toBe(malformed);
  });
});