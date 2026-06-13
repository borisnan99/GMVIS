const { test, expect } = require("@playwright/test");

const PUBLIC_PAGES = [
  "/", "/about.html", "/activities.html", "/news.html", "/blog.html", "/gallery.html",
  "/get-involved.html", "/contact.html", "/complaints.html",
  "/safeguarding.html", "/constitution.html", "/404.html",
];

/* ============================================================
   No pricing anywhere
   ============================================================ */
test.describe("No pricing content", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has no price/cost wording`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const text = await page.locator("body").innerText();
      expect(text).not.toContain("£");
      expect(text).not.toMatch(/free taster/i);
      expect(text).not.toMatch(/session is free/i);
      expect(text).not.toMatch(/affordable/i);
      expect(text).not.toMatch(/kit to buy/i);
    });
  }
});

/* ============================================================
   Global "Listen to this page" TTS control
   ============================================================ */
test.describe("Page-wide TTS", () => {
  const sample = ["/", "/about.html", "/safeguarding.html", "/constitution.html", "/gallery.html", "/404.html"];
  for (const path of sample) {
    test(`${path} has the 'Listen to this page' control`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const btn = page.locator(".page-reader");
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute("aria-label", /listen to this page/i);
    });
  }

  test("hero 'Listen' button still present on content pages", async ({ page }) => {
    await page.goto("/about.html");
    await expect(page.locator("[data-readaloud]").first()).toBeAttached();
  });
});

/* ============================================================
   YouTube in socials + home social card
   ============================================================ */
test.describe("Social links", () => {
  test("footer has a YouTube link on content pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('.site-footer a[aria-label="YouTube"]')).toHaveCount(1);
  });

  test("home page has a social card featuring YouTube", async ({ page }) => {
    await page.goto("/");
    const card = page.locator(".social-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".social-link")).toHaveCount(4);
    await expect(card.locator('.social-link[aria-label*="YouTube"]')).toBeVisible();
    await expect(card.locator('.social-link[aria-label*="Facebook"]')).toBeVisible();
  });

  test("contact page keeps YouTube in both footer and aside socials", async ({ page }) => {
    await page.goto("/contact.html");
    await expect(page.locator('a[aria-label="YouTube"]')).toHaveCount(2);
  });
});

/* ============================================================
   Safeguarding + Constitution pages
   ============================================================ */
test.describe("Policy pages", () => {
  test("safeguarding page loads with key safeguarding content", async ({ page }) => {
    await page.goto("/safeguarding.html");
    await expect(page.locator("h1")).toHaveText(/safeguarding policy/i);
    await expect(page.locator("body")).toContainText("999");
    await expect(page.locator("body")).toContainText(/report a concern/i);
  });

  test("constitution page loads with key governance clauses", async ({ page }) => {
    await page.goto("/constitution.html");
    await expect(page.locator("h1")).toHaveText(/constitution/i);
    await expect(page.locator("body")).toContainText(/membership/i);
    await expect(page.locator("body")).toContainText(/dissolution/i);
  });

  test("footer policy links exist and resolve", async ({ page }) => {
    await page.goto("/");
    const links = page.locator(".footer-policies a");
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      const href = await link.getAttribute("href");
      const res = await page.request.get(href);
      expect(res.status(), `${href} should resolve`).toBe(200);
    }
  });
});

/* ============================================================
   Product-owner revisions
   ============================================================ */
test.describe("Product-owner revisions", () => {
  test("footer lists affiliated organisations as clickable links", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".footer-partners a")).toHaveCount(4);
    await expect(page.locator('.footer-partners a[href*="goalballuk"]')).toHaveCount(1);
    await expect(page.locator('.footer-partners a[href*="ecb.co.uk"]')).toHaveCount(1);
    await expect(page.locator('.footer-partners a[href*="bcew"]')).toHaveCount(1);
    await expect(page.locator('.footer-partners a[href*="britishblindsport"]')).toHaveCount(1);
  });

  test("complaint call-to-action is softened to 'Share a concern'", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".site-footer")).toContainText("Share a concern");
    await expect(page.locator("body")).not.toContainText("Make a complaint");
    await page.goto("/complaints.html");
    await expect(page.locator("h1")).not.toHaveText(/make a complaint/i);
  });

  test("get-involved has a sponsors section with benefits and logo slots", async ({ page }) => {
    await page.goto("/get-involved.html");
    await expect(page.locator("#spon-h")).toBeVisible();
    await expect(page.locator(".sponsor-slot")).toHaveCount(4);
    await expect(page.locator("body")).toContainText(/become a sponsor/i);
  });

  test("contact form lets you pick individual sports and answer light questions", async ({ page }) => {
    await page.goto("/contact.html");
    await expect(page.locator('input[name="c-sports"]').first()).toBeAttached();
    await expect(page.locator('input[name="c-experience"]').first()).toBeAttached();
    await expect(page.locator('input[name="c-occupation"]').first()).toBeAttached();
  });

  test("football is presented as coming soon and cricket is at Astley Bridge", async ({ page }) => {
    await page.goto("/activities.html");
    await expect(page.locator("#football")).toContainText(/coming soon/i);
    await expect(page.locator("body")).toContainText("Astley Bridge");
    await expect(page.locator("body")).not.toContainText(/sight categories/i);
  });

  test("home reflects 2024 founding and thanks volunteers", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText("Est. 2024");
    await expect(page.locator("body")).not.toContainText("Est. 2019");
    await expect(page.locator("#vol-h")).toBeVisible();
  });

  test("activities page links to YouTube", async ({ page }) => {
    await page.goto("/activities.html");
    await expect(page.locator('main a[aria-label*="YouTube"]')).toHaveCount(1);
  });
});
