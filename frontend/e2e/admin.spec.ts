import { expect, test } from "@playwright/test";
import {
  ADMIN,
  CUSTOMERS,
  addCartItem,
  apiJson,
  archiveProduct,
  cancelOrderIfPossible,
  clearCart,
  createAddress,
  createPaidOrder,
  deleteAllAddresses,
  findCouponByCode,
  getProductWithStock,
  loginApi,
  retireCoupon,
  signInAs,
  uniqueTag,
  type AuthSession,
} from "./helpers";

interface Category {
  id: string;
  name: string;
}

let adminSession: AuthSession;
let customerSession: AuthSession | null = null;

let createdProductId: string | null = null;
let createdCouponCode: string | null = null;
let createdOrderId: string | null = null;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request, page }) => {
  createdProductId = null;
  createdCouponCode = null;
  createdOrderId = null;
  customerSession = null;
  adminSession = await loginApi(request, ADMIN);
  await signInAs(page, adminSession);
});

test.afterEach(async ({ request }) => {
  if (createdOrderId) {
    await cancelOrderIfPossible(request, adminSession.accessToken, createdOrderId);
    createdOrderId = null;
  }
  if (createdCouponCode) {
    const coupon = await findCouponByCode(
      request,
      adminSession.accessToken,
      createdCouponCode,
    );
    if (coupon) {
      await retireCoupon(request, adminSession.accessToken, coupon);
    }
    createdCouponCode = null;
  }
  if (createdProductId) {
    await archiveProduct(request, adminSession.accessToken, createdProductId);
    createdProductId = null;
  }
  if (customerSession) {
    await clearCart(request, customerSession.accessToken);
    await deleteAllAddresses(request, customerSession.accessToken);
    customerSession = null;
  }
});

test.describe("admin", () => {
  test("dashboard and analytics render live figures and charts", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { level: 1, name: "Store pulse", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Revenue", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Revenue trend" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent orders" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Low stock" })).toBeVisible();

    await page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name: "Analytics", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/analytics$/, { timeout: 60_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Commercial insight", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Revenue trend" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Product leaderboard" }),
    ).toBeVisible();
  });

  test("customers can be searched and settings render read-only", async ({ page }) => {
    await page.goto("/admin/customers");
    await expect(
      page.getByRole("heading", { level: 1, name: "Customers", exact: true }),
    ).toBeVisible();
    await page.locator("#customer-search").fill(CUSTOMERS[0].email);
    await expect(page.getByText(CUSTOMERS[0].email, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage", exact: true }).first()).toBeVisible();

    await page.goto("/admin/settings");
    await expect(
      page.getByRole("heading", { level: 1, name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Read-only configuration", { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Shipping & tax" })).toBeVisible();
  });

  test("a product can be created with an image and variant, then archived", async ({
    page,
    request,
  }) => {
    const tag = uniqueTag();
    const productName = `E2E Product ${tag}`;
    const categories = await apiJson<Category[]>(
      request,
      "GET",
      "/api/admin/categories",
      { token: adminSession.accessToken },
    );
    expect(categories.length).toBeGreaterThan(0);

    await page.goto("/admin/products/new");
    await expect(
      page.getByRole("heading", { level: 1, name: "Add a product", exact: true }),
    ).toBeVisible();
    await page.locator("#product-name").fill(productName);
    await page
      .locator("#product-description")
      .fill("Created by the Playwright admin smoke test.");
    await page.locator("#product-category").selectOption(categories[0].id);

    await page.getByRole("tab", { name: /^Images/ }).click();
    await page
      .locator("#manual-image-url")
      .fill(`https://picsum.photos/seed/${tag}/600/600`);
    await page.getByRole("button", { name: "Add URL", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Images (1)" })).toBeVisible();
    await expect(page.getByLabel("Alt text for image 1")).toBeVisible();

    await page.getByRole("tab", { name: /^Variants/ }).click();
    await page.locator("#draft-0-name").fill("Default");
    await page.locator("#draft-0-price").fill("1499.00");
    await page.locator("#draft-0-stock").fill("5");

    await page.getByRole("button", { name: "Create product", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[^/]+\/edit$/, {
      timeout: 60_000,
    });
    createdProductId = page.url().match(/\/admin\/products\/([^/]+)\/edit/)?.[1] ?? null;
    expect(createdProductId).toBeTruthy();
    await expect(
      page.getByRole("heading", { level: 1, name: productName }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Variants (1)" })).toBeVisible();

    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Archive this product?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Archive product", exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/products$/, { timeout: 60_000 });
    createdProductId = null;
  });

  test("a coupon can be created and deleted", async ({ page }) => {
    const code = `E2E${uniqueTag().slice(-10)}`;

    await page.goto("/admin/coupons");
    await expect(
      page.getByRole("heading", { level: 1, name: "Coupons", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New coupon", exact: true }).click();
    await expect(page.getByRole("heading", { name: "New coupon" })).toBeVisible();
    await page.locator("#coupon-code").fill(code);
    await page.locator("#coupon-value").fill("15");
    await page.locator("#coupon-max-uses").fill("20");
    await page.locator("#coupon-per-user").fill("0");
    await page.getByRole("button", { name: "Create coupon", exact: true }).click();

    await expect(page.getByText("Coupon created", { exact: true })).toBeVisible();
    await expect(page.getByText(code, { exact: true })).toBeVisible();
    createdCouponCode = code;

    await page.getByRole("button", { name: `Delete ${code}` }).click();
    await expect(page.getByRole("heading", { name: "Delete coupon?" })).toBeVisible();
    await page.getByRole("button", { name: "Delete coupon", exact: true }).click();

    await expect(page.getByText("Coupon deleted", { exact: true })).toBeVisible();
    await expect(page.getByText(code, { exact: true })).toHaveCount(0);
    createdCouponCode = null;
  });

  test("a paid order can be shipped and delivered from the admin console", async ({
    page,
    request,
  }) => {
    customerSession = await loginApi(request, CUSTOMERS[1]);
    await clearCart(request, customerSession.accessToken);
    await deleteAllAddresses(request, customerSession.accessToken);
    const address = await createAddress(request, customerSession.accessToken);
    const { variant } = await getProductWithStock(request);
    await addCartItem(request, customerSession.accessToken, variant.id, 1);
    const order = await createPaidOrder(request, customerSession.accessToken, {
      addressId: address.id,
      variantId: variant.id,
    });
    createdOrderId = order.id;
    const tracking = `E2E${uniqueTag().replace(/[^A-Z0-9]/g, "").slice(-8)}`;

    await page.goto(`/admin/orders/${order.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: order.order_number }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Ship order", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Ship order", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ship order" })).toBeVisible();
    await page.locator("#carrier").fill("Blue Dart");
    await page.locator("#tracking").fill(tracking);
    await page.getByRole("button", { name: "Mark shipped", exact: true }).click();

    await expect(page.getByText("Order marked shipped", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Mark delivered", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Blue Dart", { exact: true })).toBeVisible();
    await expect(page.getByText(tracking, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Mark delivered", exact: true }).click();
    await expect(page.getByText("Order marked delivered", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Mark delivered", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Delivered", { exact: true }).first()).toBeVisible();
  });
});
