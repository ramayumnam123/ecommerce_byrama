import { expect, test } from "@playwright/test";
import {
  ADMIN,
  CUSTOMERS,
  addCartItem,
  cancelOrderIfPossible,
  clearCart,
  createAddress,
  createPaidOrder,
  deleteAllAddresses,
  getProductWithStock,
  loginApi,
  signInAs,
  uniqueTag,
  type AuthSession,
} from "./helpers";

let session: AuthSession;
let adminSession: AuthSession;
const createdOrderIds: string[] = [];

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request, page }) => {
  createdOrderIds.length = 0;
  session = await loginApi(request, CUSTOMERS[0]);
  adminSession = await loginApi(request, ADMIN);
  await clearCart(request, session.accessToken);
  await deleteAllAddresses(request, session.accessToken);
  await signInAs(page, session);
});

test.afterEach(async ({ request }) => {
  for (const orderId of createdOrderIds) {
    await cancelOrderIfPossible(request, adminSession.accessToken, orderId);
  }
  createdOrderIds.length = 0;
  await clearCart(request, session.accessToken);
  await deleteAllAddresses(request, session.accessToken);
});

test.describe("account", () => {
  test("account navigation reaches orders and reviews", async ({ page }) => {
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { level: 1, name: /Hello, Demo/ }),
    ).toBeVisible();
    await expect(page.getByText("Orders placed", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent orders" })).toBeVisible();

    const accountNav = page.getByRole("navigation", { name: "Account" });
    await accountNav.getByRole("link", { name: "Orders", exact: true }).click();
    await expect(page).toHaveURL(/\/account\/orders$/, { timeout: 60_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Orders", exact: true }),
    ).toBeVisible();

    await accountNav.getByRole("link", { name: "Reviews", exact: true }).click();
    await expect(page).toHaveURL(/\/account\/reviews$/, { timeout: 60_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "My reviews", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No reviews yet", { exact: true })).toBeVisible();

    await accountNav.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page).toHaveURL(/\/account$/, { timeout: 60_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: /Hello, Demo/ }),
    ).toBeVisible();
  });

  test("a customer can open their newest order", async ({ page, request }) => {
    const address = await createAddress(request, session.accessToken);
    const { variant } = await getProductWithStock(request);
    await addCartItem(request, session.accessToken, variant.id, 1);
    const order = await createPaidOrder(request, session.accessToken, {
      addressId: address.id,
      variantId: variant.id,
    });
    createdOrderIds.push(order.id);

    await page.goto("/account/orders");
    await expect(
      page.getByRole("heading", { level: 1, name: "Orders", exact: true }),
    ).toBeVisible();

    const orderLink = page
      .getByRole("link")
      .filter({ hasText: order.order_number })
      .first();
    await expect(orderLink).toBeVisible();
    await orderLink.click();

    await expect(page).toHaveURL(new RegExp(`/account/orders/${order.id}$`), {
      timeout: 60_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: order.order_number }),
    ).toBeVisible();
    await expect(page.getByText("Payment received", { exact: true })).toBeVisible();
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(address.line1).first()).toBeVisible();
  });

  test("an address can be added, edited, made default and deleted", async ({ page }) => {
    const line1 = `E2E Account ${uniqueTag()} Lane`;
    const edited = `${line1} edited`;

    await page.goto("/account/addresses");
    await expect(
      page.getByRole("heading", { level: 1, name: "Addresses", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No saved addresses", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add address", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Add address" })).toBeVisible();
    await page.locator("#line1").fill(line1);
    await page.locator("#line2").fill("Unit 7");
    await page.locator("#city").fill("Bengaluru");
    await page.locator("#state").fill("Karnataka");
    await page.locator("#postal_code").fill("560001");
    await page.locator("#phone").fill("+91 98765 43210");
    await page.getByRole("button", { name: "Save address", exact: true }).click();

    await expect(page.getByText("Address saved", { exact: true })).toBeVisible();
    await expect(page.getByText(line1, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Make default", exact: true }).click();
    await expect(page.getByText("Default address updated", { exact: true })).toBeVisible();
    await expect(page.getByText("Default", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit address" })).toBeVisible();
    await page.locator("#line1").fill(edited);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();

    await expect(page.getByText("Address updated", { exact: true })).toBeVisible();
    await expect(page.getByText(edited, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Delete this address?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete address", exact: true }).click();

    await expect(page.getByText("Address removed", { exact: true })).toBeVisible();
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
    await expect(page.getByText("No saved addresses", { exact: true })).toBeVisible();
  });
});
