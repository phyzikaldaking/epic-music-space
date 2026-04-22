/**
 * Vitest stub for @ems/db
 *
 * This file satisfies the module resolver during testing so that vitest/vite
 * can build the module graph.  In individual test files this module is fully
 * replaced with a vi.mock() factory that supplies tightly-controlled spies.
 */
export const prisma = {
  song: {},
  licenseToken: {},
  transaction: {},
  user: {},
  versusMatch: {},
  versusVote: {},
};
