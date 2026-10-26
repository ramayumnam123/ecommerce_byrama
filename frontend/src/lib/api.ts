"use client";

import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { getAccessToken, setAccessToken } from "./token";
import {
  clearSessionHint,
  getGuestToken,
  setGuestToken,
  setSessionHint,
} from "./session";
import { ApiError, toApiError } from "./errors";
import type { TokenPair } from "./types";

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"
)
  .replace(/\/$/, "")
  .replace(/\/api$/, "");

const AUTH_PATHS = [
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
  "/auth/resend-verification",
];

function isAuthPath(url: string) {
  return AUTH_PATHS.some((p) => url.includes(`${p}`));
}

function isGuardedPath() {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return (
    p.startsWith("/admin") ||
    p.startsWith("/account") ||
    p.startsWith("/checkout")
  );
}

let refreshPromise: Promise<boolean> | null = null;

async function fetchRefresh(): Promise<TokenPair> {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw await toApiError(res, await res.text());
  }
  return (await res.json()) as TokenPair;
}

/**
 * Single-flight refresh (docs/07 §5). All callers share one in-flight request,
 * so a burst of 401s produces exactly one refresh + cookie rotation.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const pair = await fetchRefresh();
        setAccessToken(pair.access_token);
        setSessionHint(pair.user);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("auth:refreshed", { detail: pair.user }),
          );
        }
        return true;
      } catch {
        setAccessToken(null);
        clearSessionHint();
        if (isGuardedPath() && !window.location.pathname.startsWith("/signin")) {
          const next = encodeURIComponent(
            window.location.pathname + window.location.search,
          );
          window.location.assign(`/signin?next=${next}`);
        }
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

function decorate(request: Request): Request {
  const next = request.clone();
  const headers = new Headers(next.headers);
  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    const guest = getGuestToken();
    if (guest) headers.set("X-Guest-Token", guest);
  }
  headers.set("Accept", "application/json");
  return new Request(next, { headers });
}

/**
 * Fetch wrapper for openapi-fetch:
 *  - injects the in-memory bearer / guest token
 *  - on 401, refreshes once and retries the original request
 *  - keeps the guest token cookie in sync when the API issues a new one
 */
async function authFetch(input: Request): Promise<Response> {
  const pristine = input.clone();
  let response = await fetch(decorate(pristine));

  if (response.status === 401 && !isAuthPath(input.url)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // pristine has not been consumed: clone it for the single retry
      response = await fetch(decorate(pristine.clone()));
    }
  }

  const issuedGuest = response.headers.get("x-guest-token");
  if (issuedGuest) setGuestToken(issuedGuest);

  return response;
}

export const api = createClient<paths>({
  baseUrl: API_BASE,
  credentials: "include",
  fetch: authFetch as typeof fetch,
});

export type ApiResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

/** Throw a typed ApiError when the envelope carries an error. */
export async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (result.error !== undefined || !result.response.ok) {
    throw await toApiError(result.response, result.error);
  }
  if (result.data === undefined) {
    // 204 No Content is a success with no payload (DELETE endpoints).
    if (result.response.status === 204) return undefined as T;
    throw new ApiError(result.response.status || 500, undefined);
  }
  return result.data;
}

export async function apiGet<T>(
  path: Parameters<typeof api.GET>[0],
  init?: Parameters<typeof api.GET>[1],
): Promise<T> {
  return unwrap((await api.GET(path, init as never)) as ApiResult<T>);
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/**
 * PUT raw image bytes to the presigned upload URL. The local mock backend
 * serves `/api/media/local/{key}` behind the admin JWT, so we attach the
 * in-memory access token when the URL is API-relative.
 */
export async function uploadImage(uploadUrl: string, file: File): Promise<void> {
  const absolute = /^https?:\/\//.test(uploadUrl)
    ? uploadUrl
    : `${API_BASE}${uploadUrl}`;
  const headers: Record<string, string> = { "Content-Type": file.type };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(absolute, {
    method: "PUT",
    headers,
    body: file,
    credentials: "include",
  });
  if (!res.ok) {
    throw await toApiError(res, await res.text());
  }
}

