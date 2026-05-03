import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { withQueryBudget } from "../queryBudget";

describe("withQueryBudget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the operation result", async () => {
    const promise = withQueryBudget("op", async () => "ok");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
  });

  it("logs WARN when over warnAfterMs but under hardAfterMs", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const promise = withQueryBudget(
      "slow-op",
      async () => {
        await vi.advanceTimersByTimeAsync(300);
        return 123;
      },
      { warnAfterMs: 250, hardAfterMs: 1000, meta: { a: 1 } },
    );

    await expect(promise).resolves.toBe(123);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("[query-budget] WARN slow-op");
  });

  it("logs HARD when over hardAfterMs", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const promise = withQueryBudget(
      "very-slow",
      async () => {
        await vi.advanceTimersByTimeAsync(1100);
        return "done";
      },
      { warnAfterMs: 250, hardAfterMs: 1000, meta: { b: 2 } },
    );

    await expect(promise).resolves.toBe("done");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("[query-budget] HARD very-slow");
  });
});

