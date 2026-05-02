import { describe, expect, it, beforeEach, vi } from "vitest";

describe("@ems/db Prisma client singleton", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as unknown as { prisma?: unknown }).prisma;
    delete process.env.NODE_ENV;
  });

  it("reuses the same Prisma client instance across module reloads in non-production", async () => {
    process.env.NODE_ENV = "test";
    const mod1 = await import("../index");
    const prisma1 = mod1.prisma;

    vi.resetModules();
    const mod2 = await import("../index");
    const prisma2 = mod2.prisma;

    expect(prisma2).toBe(prisma1);
  });

  it("does not write the Prisma client to global in production", async () => {
    process.env.NODE_ENV = "production";
    await import("../index");

    expect((globalThis as unknown as { prisma?: unknown }).prisma).toBeUndefined();
  });

  it("enables query logging in development", async () => {
    process.env.NODE_ENV = "development";
    const { prisma } = await import("../index");

    // Prisma stores computed log config on the private _engineConfig
    const engineConfig = (prisma as unknown as { _engineConfig?: { log?: unknown } })._engineConfig;
    expect(engineConfig?.log).toEqual(["query", "error", "warn"]);
  });
});
