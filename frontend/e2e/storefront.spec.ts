import { expect, test } from "@playwright/test";
import { getProductWithStock } from "./helpers";

test.describe("storefront", () => {
  test("home, catalogue and category navigation render server data", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /Objects for a slower, better everyday/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Shop all", exact: true })).toBeVisible();
    await expect(page.getByText("Shop by category")).toBeVisible();

    await page.getByRole("link", { name: "Shop all", exact: true }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByRole("heading", { level: 1, name: "The collection" })).toBeVisible();
    await expect(page.getByText(/\d+ pieces?/)).toBeVisible();

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Electronics", exact: true })
      .click();
    await expect(page).toHaveURL(/\/categories\/electronics$/);
    await expect(page.getByRole("heading", { level: 1, name: "Electronics" })).toBeVisible();
  });

  test("catalogue search narrows the collection", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("heading", { level: 1, name: "The collection" })).toBeVisible();

    await page.locator("#filter-search").fill("merino");
    await page.getByRole("button", { name: "Go", exact: true }).click();

    await expect(page).toHaveURL(/\/products\?[^#]*q=merino/);
    await expect(page.getByRole("heading", { level: 1, name: /Results for/ })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Merino Crew T-Shirt/i }).first(),
    ).toBeVisible();
  });

  test("a product can be added to the bag from its detail page", async ({ page, request }) => {
    const { product } = await getProductWithStock(request, { minStock: 2 });

    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
    await expect(page.getByText("In stock", { exact: true }).first()).toBeVisible();

    const addButton = page.getByRole("button", { name: "Add to bag", exact: true });
    await expect(addButton).toBeEnabled();
    await page.getByRole("button", { name: "Increase quantity" }).click();
    await addButton.click();

    await expect(page.getByText("Added to your bag")).toBeVisible();
    await expect(page.getByText("Your bag", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View bag", exact: true }).click();

    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your bag" })).toBeVisible();
    await expect(page.getByRole("link", { name: product.name }).first()).toBeVisible();
  });
});
