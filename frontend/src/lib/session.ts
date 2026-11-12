"use client";

import type { User } from "./types";
import { decodeHint, encodeHint, type SessionHint } from "./session-hint";

export type { SessionHint };
export { decodeHint, encodeHint };

/**
 * Cookie helpers + a lightweight UI session hint.
 *
 * The real security boundary is the API (every request is re-authorized there).
 * `session_hint` lets `middleware.ts` redirect signed-out users before the
 * guarded shells render. It carries no token — only id/role/name/expiry.
 * The access token stays in memory; refresh stays in the API httpOnly cookie.
 */
const HINT_COOKIE = "session_hint";
const GUEST_COOKIE = "guest_token";
const HINT_MAX_AGE = 7 * 24 * 60 * 60;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function setSessionHint(user: User) {
  writeCookie(
    HINT_COOKIE,
    encodeHint({
      sub: user.id,
      role: user.role,
      name: user.full_name,
      exp: Math.floor(Date.now() / 1000) + HINT_MAX_AGE,
    }),
    HINT_MAX_AGE,
  );
}

export function getSessionHint(): SessionHint | null {
  return decodeHint(readCookie(HINT_COOKIE));
}

export function clearSessionHint() {
  deleteCookie(HINT_COOKIE);
}

export function getGuestToken(): string | null {
  return readCookie(GUEST_COOKIE);
}

export function ensureGuestToken(): string {
  const existing = getGuestToken();
  if (existing) return existing;
  const token = crypto.randomUUID();
  writeCookie(GUEST_COOKIE, token, 30 * 24 * 60 * 60);
  return token;
}

export function setGuestToken(token: string) {
  writeCookie(GUEST_COOKIE, token, 30 * 24 * 60 * 60);
}

export function clearGuestToken() {
  deleteCookie(GUEST_COOKIE);
}
