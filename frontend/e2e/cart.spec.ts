import { expect, test } from "@playwright/test";
import {
  CUSTOMERS,
  addCartItem,
  clearCart,
  getCart,
  getProductWithStock,
  loginApi,
  signInAs,
  type AuthSession,
} from "./helpers";

let session: AuthSession;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request, page }) => {
  session = await loginApi(request, CUSTOMERS[0]);
  await clearCart(request, session.accessToken);
  await signInAs(page, session);
});

test.afterEach(async ({ request }) => {
  await clearCart(request, session.accessToken);
});

test.describe("cart", () => {
  test("quantity changes persist across a reload", async ({ page, request }) => {
    const { product, variant } = await getProductWithStock(request, { minStock: 3 });
    await addCartItem(request, session.accessToken, variant.id, 1);

    await page.goto("/cart");
    await expect(page.getByRole("heading", { level: 1, name: "Your bag" })).toBeVisible();
    await expect(page.getByRole("link", { name: product.name }).first()).toBeVisible();

    await page.getByRole("button", { name: "Increase quantity" }).click();
    await expect(page.locator('[aria-live="polite"]').first()).toHaveText("2");
    await expect
      .poll(async () => {
        const cart = await getCart(request, session.accessToken);
        return cart.items[0]?.quantity;
      })
      .toBe(2);

    await page.reload();
    await expect(page.locator('[aria-live="polite"]').first()).toHaveText("2");
  });

  test("an item can be removed and leaves the empty bag state", async ({ page, request }) => {
    const { product, variant } = await getProductWithStock(request);
    await addCartItem(request, session.accessToken, variant.id, 1);

    await page.goto("/cart");
    await expect(page.getByRole("link", { name: product.name }).first()).toBeVisible();
    await page.getByRole("button", { name: `Remove ${product.name}` }).click();

    await expect(page.getByText("Your bag is empty")).toBeVisible();
    await expect
      .poll(async () => {
        const cart = await getCart(request, session.accessToken);
        return cart.items.length;
      })
      .toBe(0);
  });

  test("a coupon can be saved for checkout and removed", async ({ page, request }) => {
    const { variant } = await getProductWithStock(request);
    await addCartItem(request, session.accessToken, variant.id, 1);

    await page.goto("/cart");
    await page.locator("#coupon").fill("WELCOME10");
    await page.getByRole("button", { name: "Apply", exact: true }).click();

    await expect(page.getByText(/WELCOME10 .* Code saved/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove coupon" })).toBeVisible();
    await page.getByRole("button", { name: "Remove coupon" }).click();
    await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
  });
});
