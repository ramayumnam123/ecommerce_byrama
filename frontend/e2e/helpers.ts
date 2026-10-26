import { randomBytes, randomInt } from "node:crypto";
import type {
  APIRequestContext,
  APIResponse,
  BrowserContext,
  Page as PlaywrightPage,
} from "@playwright/test";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://localhost:8000";

export const ADMIN = { email: "admin@local.dev", password: "Admin1234" } as const;

export const CUSTOMERS = [
  { email: "demo.customer1@example.com", password: "Demo1234" },
  { email: "demo.customer2@example.com", password: "Demo1234" },
  { email: "demo.customer3@example.com", password: "Demo1234" },
  { email: "demo.customer4@example.com", password: "Demo1234" },
] as const;

export type Credentials = { email: string; password: string };

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  role: "CUSTOMER" | "ADMIN" | string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  min_price: number;
  total_stock: number;
  image_url: string | null;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  attributes: Record<string, unknown>;
  is_active: boolean;
}

export interface ProductDetail extends ProductListItem {
  description: string;
  category_slug: string | null;
  variants: ProductVariant[];
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  pages: number;
}

export interface CartLine {
  product_variant_id: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  stock: number;
  unit_price: number;
  line_total: number;
}

export interface Cart {
  items: CartLine[];
  totals: { subtotal: number; total_items: number };
}

export interface Address {
  id: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
  is_default: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  status: string;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  tax: number;
  total: number;
  refund_amount: number;
  notes: string | null;
  carrier: string | null;
  tracking_number: string | null;
  created_at: string;
  items: Array<{
    product_variant_id: string;
    product_name: string;
    variant_name: string;
    quantity: number;
  }>;
}

export interface CheckoutStart {
  order: Order;
  razorpay: {
    order_id: string;
    amount: number;
    currency: string;
    key_id: string;
    mock: boolean;
  };
}

export interface AdminCoupon {
  id: string;
  code: string;
  discount_type: "PERCENT" | "FIXED";
  value: number;
  max_uses: number | null;
  used_count: number;
  per_user_limit: number;
  is_active: boolean;
}

export interface InStockProduct {
  product: ProductDetail;
  variant: ProductVariant;
}

let ipCounter = 0;

/** Unique synthetic client IP so the backend's per-IP auth limiter never crosses tests. */
export function uniqueIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter % 240) + 10}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
}

export function uniqueTag(): string {
  return `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`.toUpperCase();
}

export function uniqueEmail(prefix = "e2e.shopper"): string {
  return `${prefix}.${uniqueTag().toLowerCase()}@example.com`;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";

interface RequestOptions {
  token?: string;
  data?: unknown;
  headers?: Record<string, string>;
}

/** FastAPI keeps /api in every route; callers pass the full `/api/...` path here. */
export async function apiRequest(
  request: APIRequestContext,
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<APIResponse> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-forwarded-for": uniqueIp(),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...options.headers,
  };
  return request.fetch(`${API_ORIGIN}${path}`, {
    method,
    headers,
    data: options.data,
    failOnStatusCode: false,
  });
}

export async function apiJson<T>(
  request: APIRequestContext,
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await apiRequest(request, method, path, options);
  const text = await response.text();
  if (!response.ok()) {
    throw new Error(`${method} ${path} failed (${response.status()}): ${text}`);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** Log in through the real auth endpoint and capture the rotating refresh cookie. */
export async function loginApi(
  request: APIRequestContext,
  credentials: Credentials,
): Promise<AuthSession> {
  const response = await request.post(`${API_ORIGIN}/api/auth/login`, {
    data: credentials,
    headers: {
      Accept: "application/json",
      "x-forwarded-for": uniqueIp(),
    },
    failOnStatusCode: false,
  });
  const text = await response.text();
  if (!response.ok()) {
    throw new Error(`API login for ${credentials.email} failed (${response.status()}): ${text}`);
  }

  const body = JSON.parse(text) as {
    access_token: string;
    user: SessionUser;
  };
  const cookieHeaders = (await response.headersArray())
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value)
    .join("; ");
  const refreshMatch = cookieHeaders.match(/refresh_token=([^;]+)/);
  if (!refreshMatch) {
    throw new Error(`API login for ${credentials.email} did not return a refresh_token cookie`);
  }

  return {
    accessToken: body.access_token,
    refreshToken: decodeURIComponent(refreshMatch[1]),
    user: body.user,
  };
}

function encodeHint(user: SessionUser): string {
  const hint = {
    sub: user.id,
    role: user.role,
    name: user.full_name,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };
  return Buffer.from(JSON.stringify(hint), "utf8").toString("base64url");
}

/**
 * Seed the browser with the API refresh cookie and UI session hint. The app
 * then exchanges the refresh cookie for an in-memory access token.
 */
export async function signInAs(page: PlaywrightPage, session: AuthSession): Promise<void> {
  const hostname = new URL(BASE_URL).hostname;
  const secure = BASE_URL.startsWith("https://");
  const expires = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  await page.context().addCookies([
    {
      name: "refresh_token",
      value: session.refreshToken,
      domain: hostname,
      path: "/api/auth",
      httpOnly: true,
      secure,
      sameSite: "Lax",
      expires,
    },
    {
      name: "session_hint",
      value: encodeHint(session.user),
      domain: hostname,
      path: "/",
      httpOnly: false,
      secure,
      sameSite: "Lax",
      expires,
    },
  ]);
}

/** Keep UI login/signup tests off the backend's 5/min per-IP auth bucket. */
export async function bypassAuthRateLimit(page: PlaywrightPage): Promise<void> {
  await page.route(
    /\/api\/auth\/(login|signup|resend-verification|forgot-password|reset-password)(\?.*)?$/,
    async (route) => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          "x-forwarded-for": uniqueIp(),
        },
      });
    },
  );
}

export async function getProductWithStock(
  request: APIRequestContext,
  options: { minStock?: number; minPrice?: number } = {},
): Promise<InStockProduct> {
  const minStock = options.minStock ?? 1;
  const minPrice = options.minPrice ?? 0;
  const products = await apiJson<Page<ProductListItem>>(
    request,
    "GET",
    "/api/products?in_stock=true&sort=price_desc&page=1&page_size=50",
  );

  for (const item of products.items) {
    const product = await apiJson<ProductDetail>(
      request,
      "GET",
      `/api/products/${encodeURIComponent(item.slug)}`,
    );
    const variant = product.variants.find(
      (candidate) => candidate.stock >= minStock && candidate.price >= minPrice,
    );
    if (variant) return { product, variant };
  }

  throw new Error(`No product found with stock >= ${minStock} and price >= ${minPrice} paise`);
}

export async function getCart(request: APIRequestContext, token: string): Promise<Cart> {
  return apiJson<Cart>(request, "GET", "/api/cart", { token });
}

export async function clearCart(request: APIRequestContext, token: string): Promise<void> {
  const response = await apiRequest(request, "DELETE", "/api/cart", { token });
  if (!response.ok() && response.status() !== 404) {
    throw new Error(`Could not clear cart (${response.status()}): ${await response.text()}`);
  }
}

export async function addCartItem(
  request: APIRequestContext,
  token: string,
  variantId: string,
  quantity = 1,
): Promise<Cart> {
  return apiJson<Cart>(request, "POST", "/api/cart/items", {
    token,
    data: { product_variant_id: variantId, quantity },
  });
}

export async function deleteAllAddresses(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  const addresses = await apiJson<Address[]>(request, "GET", "/api/users/addresses", { token });
  for (const address of addresses) {
    const response = await apiRequest(
      request,
      "DELETE",
      `/api/users/addresses/${address.id}`,
      { token },
    );
    if (!response.ok() && response.status() !== 404) {
      throw new Error(`Could not delete address ${address.id}: ${await response.text()}`);
    }
  }
}

export async function createAddress(
  request: APIRequestContext,
  token: string,
  label = uniqueTag(),
): Promise<Address> {
  return apiJson<Address>(request, "POST", "/api/users/addresses", {
    token,
    data: {
      line1: `E2E ${label} Lane`,
      line2: "Near the test gardens",
      city: "Bengaluru",
      state: "Karnataka",
      postal_code: "560001",
      country: "IN",
      phone: "+91 98765 43210",
      is_default: true,
    },
  });
}

export async function createEphemeralCoupon(
  request: APIRequestContext,
  adminToken: string,
  options: { percent?: number; minOrderValue?: number } = {},
): Promise<AdminCoupon> {
  const code = `E2E${uniqueTag().replace(/[^A-Z0-9]/g, "").slice(-10)}`;
  return apiJson<AdminCoupon>(request, "POST", "/api/admin/coupons", {
    token: adminToken,
    data: {
      code,
      discount_type: "PERCENT",
      value: options.percent ?? 10,
      min_order_value: options.minOrderValue,
      max_uses: 100,
      per_user_limit: 0,
      is_active: true,
    },
  });
}

export async function findCouponByCode(
  request: APIRequestContext,
  adminToken: string,
  code: string,
): Promise<AdminCoupon | null> {
  const page = await apiJson<Page<AdminCoupon>>(
    request,
    "GET",
    "/api/admin/coupons?page=1&page_size=100",
    { token: adminToken },
  );
  return page.items.find((coupon) => coupon.code === code) ?? null;
}

/** Deletes an unused coupon, or deactivates a used coupon (the API forbids deletion). */
export async function retireCoupon(
  request: APIRequestContext,
  adminToken: string,
  coupon: Pick<AdminCoupon, "id" | "code">,
): Promise<void> {
  const response = await apiRequest(
    request,
    "DELETE",
    `/api/admin/coupons/${coupon.id}`,
    { token: adminToken },
  );
  if (response.ok() || response.status() === 404) return;

  const patch = await apiRequest(request, "PATCH", `/api/admin/coupons/${coupon.id}`, {
    token: adminToken,
    data: { is_active: false },
  });
  if (!patch.ok()) {
    throw new Error(
      `Could not retire coupon ${coupon.code} (${patch.status()}): ${await patch.text()}`,
    );
  }
}

export async function createPaidOrder(
  request: APIRequestContext,
  token: string,
  input: { addressId: string; variantId: string; quantity?: number; couponCode?: string; notes?: string },
): Promise<Order> {
  const start = await apiJson<CheckoutStart>(request, "POST", "/api/checkout/start", {
    token,
    headers: { "Idempotency-Key": `e2e-${uniqueTag()}` },
    data: {
      address_id: input.addressId,
      coupon_code: input.couponCode,
      notes: input.notes,
      guest_token: undefined,
    },
  });

  return apiJson<Order>(
    request,
    "POST",
    `/api/checkout/mock-pay?razorpay_order_id=${encodeURIComponent(start.razorpay.order_id)}`,
    { token },
  );
}

export async function getAdminOrder(
  request: APIRequestContext,
  adminToken: string,
  orderId: string,
): Promise<Order> {
  return apiJson<Order>(request, "GET", `/api/admin/orders/${orderId}`, { token: adminToken });
}

/** Cancel a PENDING/PAID order and release stock; terminal orders are left alone. */
export async function cancelOrderIfPossible(
  request: APIRequestContext,
  adminToken: string,
  orderId: string,
): Promise<void> {
  try {
    const order = await getAdminOrder(request, adminToken, orderId);
    if (!["PENDING", "PAID"].includes(order.status)) return;
    const response = await apiRequest(
      request,
      "PATCH",
      `/api/admin/orders/${orderId}/status`,
      { token: adminToken, data: { status: "CANCELLED" } },
    );
    if (!response.ok() && response.status() !== 404) {
      // Best-effort cleanup: never mask a test failure with cleanup noise.
      console.warn(`Could not cancel order ${orderId}: ${await response.text()}`);
    }
  } catch (error) {
    console.warn(`Could not clean up order ${orderId}:`, error);
  }
}

export async function archiveProduct(
  request: APIRequestContext,
  adminToken: string,
  productId: string,
): Promise<void> {
  const response = await apiRequest(
    request,
    "DELETE",
    `/api/admin/products/${productId}`,
    { token: adminToken },
  );
  if (!response.ok() && response.status() !== 404) {
    console.warn(`Could not archive product ${productId}: ${await response.text()}`);
  }
}

/** Remove a Playwright hint cookie without touching the API refresh token. */
export async function clearHintCookie(context: BrowserContext): Promise<void> {
  const hostname = new URL(BASE_URL).hostname;
  await context.clearCookies({ name: "session_hint", domain: hostname });
}
