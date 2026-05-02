import type { Context, Next } from "hono";

/** Hono environment with authenticated user variables */
export type HonoEnv = {
  Variables: {
    userId: string;
  };
};

export type HonoContext = Context<HonoEnv>;
export type HonoNext = Next;
