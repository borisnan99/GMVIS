const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const path = require("path");

const PASSWORD = "test-admin-pass";
const IMG = path.join(__dirname, "..", "assets", "team-photo.jpg");

async function login(page) {
  await page.goto("/admin.html");
  await expect(page.locator("#login-view")).toBeVisible();
  await page.fill("#admin-pw", PASSWORD);
  await page.click("#login-submit");
  await expect(page.locator("#dash-view")).toBeVisible();
}

test.describe("Admin — auth", () => {
  test("shows login form when not authenticated", async ({ page }) => {
    await page.goto("/admin.html");
    await expect(page.locator("#login-view")).toBeVisible();
    await expect(page.locator("#dash-view")).toBeHidden();
  });

  test("rejects an incorrect password", async ({ page }) => {
    await page.goto("/admin.html");
    await expect(page.locator("#login-view")).toBeVisible();
    await page.fill("#admin-pw", "wrongpass");
    await page.click("#login-submit");
    await expect(page.locator("#login-error")).toContainText(/incorrect/i);
    await expect(page.locator("#dash-view")).toBeHidden();
  });

  test("logs in and shows the dashboard", async ({ page }) => {
    await login(page);
    await expect(page.locator("#tab-posts")).toBeVisible();
    await expect(page.locator("#tab-media")).toBeVisible();
    await expect(page.locator("#logout-btn")).toBeVisible();
  });

  test("logout returns to the login form", async ({ page }) => {
    await login(page);
    await page.click("#logout-btn");
    await expect(page.locator("#login-view")).toBeVisible();
    await expect(page.locator("#dash-view")).toBeHidden();
  });

  test("login page has no axe violations", async ({ page }) => {
    await page.goto("/admin.html");
    await expect(page.locator("#login-view")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("Admin — tabs", () => {
  test("switching tabs shows the right panel", async ({ page }) => {
    await login(page);
    await expect(page.locator("#panel-posts")).toBeVisible();
    await expect(page.locator("#panel-media")).toBeHidden();
    await page.click("#tab-media");
    await expect(page.locator("#panel-media")).toBeVisible();
    await expect(page.locator("#panel-posts")).toBeHidden();
    await expect(page.locator("#tab-media")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Admin — blog posts", () => {
  test("create a post, see it in the list and on the public blog", async ({ page }) => {
    const title = "Admin created post " + Date.now();
    await login(page);
    await page.click("#new-post-btn");
    await expect(page.locator("#post-form")).toBeVisible();
    await page.fill("#post-title", title);
    await page.selectOption("#post-category", "Guides");
    await page.fill("#post-author", "Test Author");
    await page.fill("#post-excerpt", "A short excerpt.");
    await page.fill("#post-body", "First paragraph.\n\nSecond paragraph.");
    await page.click("#post-save");

    await expect(page.locator("#posts-list")).toContainText(title);

    // Public blog shows it
    await page.goto("/blog.html");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#blog-posts")).toContainText(title);
  });

  test("empty title is rejected by the editor", async ({ page }) => {
    await login(page);
    await page.click("#new-post-btn");
    await page.fill("#post-title", "");
    await page.click("#post-save");
    await expect(page.locator("#post-title")).toHaveAttribute("aria-invalid", "true");
  });

  test("edit a post's title", async ({ page }) => {
    const title = "Editable post " + Date.now();
    const edited = title + " (edited)";
    await login(page);
    await page.click("#new-post-btn");
    await page.fill("#post-title", title);
    await page.click("#post-save");
    await expect(page.locator("#posts-list")).toContainText(title);

    await page.locator(".admin-row", { hasText: title }).getByRole("button", { name: /edit post/i }).click();
    await expect(page.locator("#post-form")).toBeVisible();
    await page.fill("#post-title", edited);
    await page.click("#post-save");
    await expect(page.locator("#posts-list")).toContainText(edited);
  });

  test("delete a post", async ({ page }) => {
    const title = "Deletable post " + Date.now();
    await login(page);
    await page.click("#new-post-btn");
    await page.fill("#post-title", title);
    await page.click("#post-save");
    await expect(page.locator("#posts-list")).toContainText(title);

    page.on("dialog", function (d) { d.accept(); });
    await page.locator(".admin-row", { hasText: title }).getByRole("button", { name: /delete post/i }).click();
    await expect(page.locator("#posts-list")).not.toContainText(title);
  });
});

test.describe("Admin — media", () => {
  test("upload an image, see it in the grid and on the gallery", async ({ page }) => {
    const caption = "Uploaded caption " + Date.now();
    await login(page);
    await page.click("#tab-media");
    await page.setInputFiles("#upload-file", IMG);
    await page.fill("#upload-title", "Uploaded title");
    await page.fill("#upload-caption", caption);
    await page.click("#upload-submit");

    // A media card is rendered in the admin grid
    await expect(page.locator("#assets-grid .media-card").first()).toBeVisible({ timeout: 10_000 });

    // Appears on the public gallery, with our caption in the figcaption
    await page.goto("/gallery.html");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#gallery-grid .gallery-item img").first()).toBeVisible();
    await expect(page.locator("#gallery-grid")).toContainText(caption);
  });

  test("upload requires a file", async ({ page }) => {
    await login(page);
    await page.click("#tab-media");
    await page.click("#upload-submit");
    await expect(page.locator("#upload-file")).toHaveAttribute("aria-invalid", "true");
  });
});
