/**
 * In-memory access-token holder (docs/07 §4/§5).
 * The access token never touches localStorage or a readable cookie.
 * Refresh lives in the API's httpOnly cookie (Path=/api/auth).
 */
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  listeners.forEach((l) => l(token));
}

export function subscribeToken(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
