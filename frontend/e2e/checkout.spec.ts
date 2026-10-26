import { expect, test } from "@playwright/test";
import {
  ADMIN,
  CUSTOMERS,
  addCartItem,
  apiJson,
  cancelOrderIfPossible,
  clearCart,
  createAddress,
  createEphemeralCoupon,
  deleteAllAddresses,
  getProductWithStock,
  loginApi,
  retireCoupon,
  signInAs,
  uniqueTag,
  type AdminCoupon,
  type AuthSession,
  type Order,
} from "./helpers";

let session: AuthSession;
let adminSession: AuthSession;
let coupon: AdminCoupon | null = null;
let createdOrderId: string | null = null;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request, page }) => {
  coupon = null;
  createdOrderId = null;
  session = await loginApi(request, CUSTOMERS[2]);
  adminSession = await loginApi(request, ADMIN);
  await clearCart(request, session.accessToken);
  await deleteAllAddresses(request, session.accessToken);
  await signInAs(page, session);
});

test.afterEach(async ({ request }) => {
  if (createdOrderId) {
    await cancelOrderIfPossible(request, adminSession.accessToken, createdOrderId);
    createdOrderId = null;
  }
  if (coupon) {
    await retireCoupon(request, adminSession.accessToken, coupon);
    coupon = null;
  }
  await clearCart(request, session.accessToken);
  await deleteAllAddresses(request, session.accessToken);
});

test.describe("checkout", () => {
  test("customer can apply a coupon, pay in mock mode and see a confirmed order", async ({
    page,
    request,
  }) => {
    const address = await createAddress(request, session.accessToken);
    coupon = await createEphemeralCoupon(request, adminSession.accessToken, { percent: 10 });
    const { variant } = await getProductWithStock(request, { minStock: 2, minPrice: 100_000 });
    await addCartItem(request, session.accessToken, variant.id, 2);

    await page.goto("/checkout");
    await expect(page.getByRole("heading", { level: 1, name: "Almost yours" })).toBeVisible();
    await expect(page.getByText(address.line1).first()).toBeVisible();

    const placeOrder = page.getByRole("button", { name: "Place order & pay", exact: true });
    await expect(placeOrder).toBeEnabled();

    await page.locator("#checkout-coupon").fill(coupon.code);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByText(new RegExp(`${coupon.code} applied`, "i"))).toBeVisible();
    await expect(placeOrder).toBeEnabled();

    await page.locator("#notes").fill("E2E gift note");
    await placeOrder.click();

    await expect(page.getByText("Mock payment mode", { exact: true })).toBeVisible();
    await expect(page.getByText("Dev mode", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Pay (simulated)", exact: true }).click();

    await expect(page).toHaveURL(/\/checkout\/success\?/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: /You're all set/i }),
    ).toBeVisible();

    createdOrderId = new URL(page.url()).searchParams.get("id");
    expect(createdOrderId).toBeTruthy();

    const order = await apiJson<Order>(
      request,
      "GET",
      `/api/orders/${createdOrderId}`,
      { token: session.accessToken },
    );
    expect(order.status).toBe("PAID");
    expect(order.discount).toBeGreaterThan(0);
    expect(order.notes).toBe("E2E gift note");
    expect(order.total).toBe(order.subtotal + order.shipping_fee + order.tax - order.discount);
  });

  test("checkout can create an address and reject an invalid coupon", async ({ page, request }) => {
    const { variant } = await getProductWithStock(request);
    await addCartItem(request, session.accessToken, variant.id, 1);

    await page.goto("/checkout");
    await expect(page.getByText("Add a delivery address", { exact: true })).toBeVisible();

    const line1 = `E2E Checkout ${uniqueTag()} Lane`;
    await page.locator("#line1").fill(line1);
    await page.locator("#line2").fill("Unit 4");
    await page.locator("#city").fill("Bengaluru");
    await page.locator("#state").fill("Karnataka");
    await page.locator("#postal_code").fill("560001");
    await page.locator("#phone").fill("+91 98765 43210");
    await page.getByRole("button", { name: "Save & use this address", exact: true }).click();

    await expect(page.getByText("Address saved")).toBeVisible();
    await expect(page.getByText(line1).first()).toBeVisible();

    const placeOrder = page.getByRole("button", { name: "Place order & pay", exact: true });
    await expect(placeOrder).toBeEnabled();
    await page.locator("#checkout-coupon").fill(`NOPE${uniqueTag().slice(-6)}`);
    await page.getByRole("button", { name: "Apply", exact: true }).click();

    await expect(page.getByText("This coupon is not valid")).toBeVisible();
    await expect(placeOrder).toBeDisabled();

    await page.getByRole("button", { name: "Remove coupon" }).click();
    await expect(placeOrder).toBeEnabled();
  });
});
