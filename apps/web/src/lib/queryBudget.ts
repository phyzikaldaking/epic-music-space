type QueryBudgetOptions = {
  warnAfterMs?: number;
  hardAfterMs?: number;
  meta?: Record<string, unknown>;
};

export async function withQueryBudget<T>(
  label: string,
  operation: () => Promise<T>,
  options: QueryBudgetOptions = {},
): Promise<T> {
  const warnAfterMs = options.warnAfterMs ?? 250;
  const hardAfterMs = options.hardAfterMs ?? 1000;
  const startedAt = Date.now();

  const result = await operation();

  const elapsedMs = Date.now() - startedAt;

  if (elapsedMs > hardAfterMs) {
    console.error(`[query-budget] HARD ${label} took ${elapsedMs}ms`, options.meta ?? {});
  } else if (elapsedMs > warnAfterMs) {
    console.warn(`[query-budget] WARN ${label} took ${elapsedMs}ms`, options.meta ?? {});
  }

  return result;
}
