export interface SessionHint {
  sub: string;
  role: string;
  name: string;
  exp: number;
}

/** Edge/client-safe: no DOM access. */
export function encodeHint(hint: SessionHint): string {
  const json = JSON.stringify(hint);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeHint(raw: string | null | undefined): SessionHint | null {
  if (!raw) return null;
  try {
    const value = decodeURIComponent(raw);
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const hint = JSON.parse(new TextDecoder().decode(bytes)) as SessionHint;
    if (!hint?.sub || !hint?.exp || hint.exp < Date.now() / 1000) return null;
    return hint;
  } catch {
    return null;
  }
}
