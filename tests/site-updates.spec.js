const { test, expect } = require("@playwright/test");

const PUBLIC_PAGES = [
  "/", "/about.html", "/activities.html", "/news.html", "/news-article.html",
  "/blog.html", "/gallery.html",
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
    await expect(page.locator("#vol-h")).toHaveText("Powered by volunteers");
  });

  test("activities page links to YouTube", async ({ page }) => {
    await page.goto("/activities.html");
    await expect(page.locator('main a[aria-label*="YouTube"]')).toHaveCount(1);
  });
});

/* ============================================================
   Product-owner feedback V1 (July 2026 spreadsheet)
   ============================================================ */
test.describe("PO feedback V1 — home", () => {
  test("home H1 is the SEO title with the strapline below it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText(/blind & visually impaired sports/i);
    await expect(page.locator("body")).toContainText("Sport without limits. Community without barriers.");
  });

  test("the three promises use the light rows, not purple-on-purple", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".promise-row")).toHaveCount(3);
    await expect(page.locator(".promise-row").last()).toContainText(/community first/i);
  });

  test("accessibility button announces itself as screen settings", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".a11y-fab")).toHaveAttribute("aria-label", /screen settings/i);
  });

  test("about page tells Our Journey with the champions milestone", async ({ page }) => {
    await page.goto("/about.html");
    await expect(page.locator("body")).toContainText("Our Journey");
    await expect(page.locator("body")).toContainText(/champions in our first season/i);
    await expect(page.locator(".keyline-box")).toHaveCount(2);
  });
});

/* ============================================================
   Product-owner feedback V2 (July 2026 spreadsheets)
   ============================================================ */
test.describe("PO feedback V2 — shared chrome carried across every page", () => {
  // The V2 header (social icons + a dedicated menu bar) and footer ("Stay in
  // touch" social quadrant, 5 columns, contact under the logo) were signed off
  // on the home page and must be identical on all public pages — see M1.
  test("every public page uses the home header (menu bar + header social icons)", async ({ page }) => {
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await expect(page.locator(".menu-bar #menu"), `${path} menu bar`).toHaveCount(1);
      await expect(page.locator(".header-socials"), `${path} header socials`).toHaveCount(1);
    }
  });

  test("every public page uses the home footer (5-col grid + 'Stay in touch' socials)", async ({ page }) => {
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await expect(page.locator(".site-footer .footer-grid.cols-5"), `${path} footer grid`).toHaveCount(1);
      await expect(page.locator(".site-footer")).toContainText("Stay in touch");
      await expect(page.locator(".site-footer .socials a[aria-label='Facebook']")).toHaveCount(1);
    }
  });

  test("the old 'disc' Facebook icon is gone everywhere (now a plain 'f')", async ({ page }) => {
    // The client asked for the Facebook mark to be a white 'f' inside the circle,
    // not the old disc-with-cut-out glyph. Lock the old path out site-wide.
    for (const path of PUBLIC_PAGES) {
      const res = await page.request.get(path);
      const html = await res.text();
      expect(html, `${path} still ships the old Facebook disc path`).not.toContain("M22 12a10 10 0 1 0-11.6 9.9");
    }
  });
});

test.describe("PO feedback V2 — About & Activities content", () => {
  test("about 'Mission & vision' block gains a 'Why we exist' heading and 'Our purpose'", async ({ page }) => {
    await page.goto("/about.html");
    await expect(page.locator("body")).toContainText("Why we exist");
    await expect(page.locator(".keyline-box").first()).toContainText("Our purpose");
    await expect(page.locator("body")).not.toContainText("Our mission");
  });

  test("about 'meet the teams' uses the new heading and volunteer-led copy", async ({ page }) => {
    await page.goto("/about.html");
    await expect(page.locator("body")).toContainText("The people who power our sports");
    await expect(page.locator("body")).not.toContainText("The people behind each sport");
  });

  test("activities 'Watch us on YouTube' button uses the gold style", async ({ page }) => {
    await page.goto("/activities.html");
    await expect(page.locator('main a[aria-label*="YouTube"]')).toHaveClass(/\bgold\b/);
  });
});

/* ============================================================
   Product-owner feedback V1 for News / Blog / Get Involved
   (26.07.26 spreadsheet)
   ============================================================ */
test.describe("PO feedback — news, blog, get involved (July 2026)", () => {
  test("news hero uses the approved intro line", async ({ page }) => {
    await page.goto("/news.html");
    await expect(page.locator("body")).toContainText(
      "Match reports, club news and upcoming events — so you never miss a session, fixture or social."
    );
  });

  test("news articles carry colour-coded category chips and link to the detail page", async ({ page }) => {
    await page.goto("/news.html");
    const chips = page.locator(".cards .cat");
    await expect(chips).toHaveCount(6);
    await expect(page.locator(".cat-cricket")).toBeVisible();
    // every Read more goes to a real article page, not "#"
    const links = page.locator('a.card[href^="news-article.html?a="]');
    await expect(links).toHaveCount(6);
  });

  test("news detail page renders the requested article, and the latest without a slug", async ({ page }) => {
    await page.goto("/news-article.html?a=goalball-cup-2026");
    await expect(page.locator("h1")).toHaveText("Falcons place third at regional goalball cup");
    await expect(page.locator("#art-body p").first()).toBeVisible();
    await page.goto("/news-article.html");
    await expect(page.locator("h1")).toHaveText("Summer cricket season kicks off at Sale");
  });

  test("text boxes are white on cream, not yellow-on-yellow", async ({ page }) => {
    await page.goto("/news.html");
    const bg = await page.locator(".event-row").first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(255, 255, 255)");
  });

  test("get-involved uses solid purple buttons and strong tick bullets", async ({ page }) => {
    await page.goto("/get-involved.html");
    await expect(page.locator("main .btn.ghost")).toHaveCount(0);
    await expect(page.locator(".tick")).toHaveCount(11);
    const tickBg = await page.locator(".tick").first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tickBg).toBe("rgb(91, 44, 131)"); // --purple-600
  });

  test("blog cards use the news-card design with a category chip", async ({ page, request }) => {
    // Seed a published post through the API so the card renderer has data.
    const title = `Chip check ${Date.now()}`;
    const login = await request.post("/api/login", { data: { password: "test-admin-pass" } });
    expect(login.ok()).toBeTruthy();
    const created = await request.post("/api/posts", {
      data: { title, category: "Tips", excerpt: "Chip render check.", body: "Body.", published: true },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto("/blog.html");
    const card = page.locator(".card", { hasText: title });
    await expect(card.locator(".cat.cat-tips")).toBeVisible();
  });
});
