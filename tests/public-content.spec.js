const { test, expect } = require("@playwright/test");

const PASSWORD = "test-admin-pass";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function loginRequest(request) {
  const r = await request.post("/api/login", { data: { password: PASSWORD } });
  expect(r.ok()).toBeTruthy();
}

test.describe("Public blog (dynamic)", () => {
  test("published posts render; the body is behind a disclosure", async ({ page, request }) => {
    await loginRequest(request);
    const title = "Public visible post " + Date.now();
    await request.post("/api/posts", {
      data: { title, category: "Tips", author: "Pat", excerpt: "ex", body: "Hidden body text.", published: true },
    });

    await page.goto("/blog.html");
    await page.waitForLoadState("networkidle");
    const card = page.locator("#blog-posts .card", { hasText: title });
    await expect(card).toBeVisible();
    // Body is in a <details> (collapsed by default)
    const details = card.locator("details");
    await expect(details).toHaveCount(1);
    await expect(card.getByText("Hidden body text.")).toBeHidden();
    await card.getByText("Read the full story").click();
    await expect(card.getByText("Hidden body text.")).toBeVisible();
  });

  test("draft posts do NOT appear on the public blog", async ({ page, request }) => {
    await loginRequest(request);
    const title = "Secret draft " + Date.now();
    await request.post("/api/posts", { data: { title, published: false } });

    await page.goto("/blog.html");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#blog-posts")).not.toContainText(title);
  });

  test("category filter narrows the list", async ({ page, request }) => {
    await loginRequest(request);
    const stamp = Date.now();
    const guideTitle = "Guide filter " + stamp;
    const tipTitle = "Tip filter " + stamp;
    await request.post("/api/posts", { data: { title: guideTitle, category: "Guides", published: true } });
    await request.post("/api/posts", { data: { title: tipTitle, category: "Tips", published: true } });

    await page.goto("/blog.html");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#blog-posts")).toContainText(guideTitle);
    await expect(page.locator("#blog-posts")).toContainText(tipTitle);

    // Filter to Guides only
    await page.getByRole("button", { name: "Guides", exact: true }).click();
    await expect(page.locator("#blog-posts")).toContainText(guideTitle);
    await expect(page.locator("#blog-posts")).not.toContainText(tipTitle);
  });
});

test.describe("Public gallery (dynamic)", () => {
  test("uploaded image appears in the gallery with alt text", async ({ page, request }) => {
    await loginRequest(request);
    const caption = "Gallery alt " + Date.now();
    await request.post("/api/assets", {
      multipart: { file: { name: "g.png", mimeType: "image/png", buffer: PNG }, title: "G", caption },
    });

    await page.goto("/gallery.html");
    await page.waitForLoadState("networkidle");
    const img = page.locator('#gallery-grid img[alt="' + caption + '"]');
    await expect(img).toBeVisible();
  });

  test("filter pills toggle aria-pressed and filter by kind", async ({ page, request }) => {
    await loginRequest(request);
    await request.post("/api/assets", {
      multipart: { file: { name: "f.png", mimeType: "image/png", buffer: PNG }, title: "filter-img" },
    });

    await page.goto("/gallery.html");
    await page.waitForLoadState("networkidle");

    const all = page.getByRole("button", { name: "All", exact: true });
    const photos = page.getByRole("button", { name: "Photos", exact: true });
    const videos = page.getByRole("button", { name: "Videos", exact: true });

    await expect(all).toHaveAttribute("aria-pressed", "true");
    await photos.click();
    await expect(photos).toHaveAttribute("aria-pressed", "true");
    await expect(all).toHaveAttribute("aria-pressed", "false");
    // There are images, so Photos shows at least one item
    await expect(page.locator("#gallery-grid .gallery-item").first()).toBeVisible();

    // No videos uploaded -> Videos shows the empty state
    await videos.click();
    await expect(page.locator("#gallery-grid")).toContainText(/nothing here yet/i);
  });
});
