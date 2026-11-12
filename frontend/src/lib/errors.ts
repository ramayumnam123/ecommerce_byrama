"use client";

import { toast } from "sonner";

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
    request_id?: string;
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;
  requestId: string;
  retryAfter?: number;

  constructor(
    status: number,
    body: ApiErrorBody | string | undefined,
    retryAfter?: number,
  ) {
    const parsed = typeof body === "string" ? tryParse(body) : body;
    const info = parsed?.error;
    const fallback =
      status === 401
        ? "Please sign in to continue."
        : status === 404
          ? "We couldn't find that."
          : status === 429
            ? "Too many attempts. Please wait a moment."
            : status >= 500
              ? "Something went wrong on our side. Please try again."
              : "Request failed.";
    super(info?.message || fallback);
    this.name = "ApiError";
    this.code = info?.code || `HTTP_${status}`;
    this.status = status;
    this.details = info?.details || {};
    this.requestId = info?.request_id || "-";
    this.retryAfter = retryAfter;
  }
}

function tryParse(raw: string): ApiErrorBody | undefined {
  try {
    return JSON.parse(raw) as ApiErrorBody;
  } catch {
    return undefined;
  }
}

export async function toApiError(response: Response, body: unknown): Promise<ApiError> {
  const retryAfter = Number(response.headers.get("retry-after") || 0) || undefined;
  if (body instanceof Response) {
    const text = await body.text();
    return new ApiError(response.status, text, retryAfter);
  }
  return new ApiError(response.status, body as ApiErrorBody, retryAfter);
}

/** Map the canonical envelope to human copy (docs/11 F2). */
export function messageForError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "RATE_LIMITED":
        return error.retryAfter
          ? `Rate limited — retry in ${error.retryAfter}s.`
          : "Rate limited — please retry shortly.";
      case "OUT_OF_STOCK":
        return error.message || "One of your items just sold out.";
      case "EMAIL_NOT_VERIFIED":
        return "Verify your email address to check out.";
      case "COUPON_USED":
        return "You've already used this coupon.";
      case "COUPON_INVALID":
        return error.message || "That coupon isn't valid.";
      case "AUTH_REQUIRED":
        return "Your session expired. Please sign in again.";
      case "SCHEMA": {
        const fields = error.details?.fields;
        if (Array.isArray(fields) && fields.length) {
          const first = fields[0] as { msg?: string };
          return first?.msg || error.message;
        }
        return error.message;
      }
      default:
        return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function toastApiError(error: unknown, fallback?: string) {
  const message = messageForError(error) || fallback;
  toast.error(message, {
    description:
      error instanceof ApiError && error.requestId !== "-"
        ? `Request ${error.requestId}`
        : undefined,
  });
}
