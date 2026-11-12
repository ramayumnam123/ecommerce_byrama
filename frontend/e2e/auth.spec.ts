import { expect, test } from "@playwright/test";
import {
  CUSTOMERS,
  bypassAuthRateLimit,
  loginApi,
  signInAs,
  uniqueEmail,
  uniqueTag,
} from "./helpers";

test.describe("authentication and route guards", () => {
  test("a protected route redirects to sign in and returns after login", async ({ page }) => {
    await bypassAuthRateLimit(page);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/signin\?next=%2Faccount/);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();

    await page.locator("#email").fill(CUSTOMERS[0].email);
    await page.locator("#password").fill(CUSTOMERS[0].password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: /Hello, Demo/ })).toBeVisible();
  });

  test("invalid credentials keep the user on the sign-in page", async ({ page }) => {
    await bypassAuthRateLimit(page);
    await page.goto("/signin");
    await page.locator("#email").fill(CUSTOMERS[0].email);
    await page.locator("#password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/signin$/);
  });

  test("a new account can be created and lands on the account overview", async ({ page }) => {
    const tag = uniqueTag();
    const email = uniqueEmail("e2e.signup");
    await bypassAuthRateLimit(page);
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeVisible();

    await page.locator("#full_name").fill(`E2E ${tag}`);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("E2ePass123");
    await page.locator("#confirm").fill("E2ePass123");
    await page.getByRole("button", { name: "Create account", exact: true }).click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: /Hello, E2E/ })).toBeVisible();
  });

  test("a customer is redirected away from the admin console", async ({ page, request }) => {
    const session = await loginApi(request, CUSTOMERS[0]);
    await signInAs(page, session);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account\?denied=admin/);
    await expect(page.getByRole("heading", { level: 1, name: /Hello, Demo/ })).toBeVisible();
  });

  test("sign out clears the browser session", async ({ page, request }) => {
    const session = await loginApi(request, CUSTOMERS[1]);
    await signInAs(page, session);

    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1, name: /Hello, Demo/ })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  });
});
