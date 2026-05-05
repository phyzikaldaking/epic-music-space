import { Context, Next } from 'hono';
import { nanoid } from 'nanoid';
import { getCookie, setCookie } from 'hono/cookie';

const CSRF_COOKIE = process.env.CSRF_COOKIE_NAME ?? 'ems_csrf';

export async function csrfMiddleware(ctx: Context, next: Next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  const cookie = getCookie(ctx, CSRF_COOKIE);

  if (safe.includes(ctx.req.method)) {
    let token = cookie;
    if (!token) token = nanoid(32);
    setCookie(ctx, CSRF_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    });
    return next();
  }

  const headerToken = ctx.req.header('x-csrf-token');
  if (!cookie || !headerToken || headerToken !== cookie) {
    return ctx.json({ error: 'Invalid or missing CSRF token' }, 403);
  }

  return next();
}
