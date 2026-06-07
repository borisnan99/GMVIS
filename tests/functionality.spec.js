const { test, expect } = require("@playwright/test");

/* ============================================================
   ACCESSIBILITY TOOLBAR
   ============================================================ */
test.describe("Accessibility toolbar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("FAB button opens the panel and sets aria-expanded=true", async ({ page }) => {
    const fab = page.locator(".a11y-fab");
    await expect(fab).toHaveAttribute("aria-expanded", "false");
    await fab.click();
    await expect(fab).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".a11y-panel")).toHaveAttribute("data-open", "true");
  });

  test("Panel has role=dialog and aria-label", async ({ page }) => {
    const panel = page.locator(".a11y-panel");
    await expect(panel).toHaveAttribute("role", "dialog");
    const label = await panel.getAttribute("aria-label");
    expect(label).toBeTruthy();
  });

  test("Close button inside panel closes it", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    await page.locator(".a11y-panel [data-close]").click();
    await expect(page.locator(".a11y-fab")).toHaveAttribute("aria-expanded", "false");
  });

  test("Escape key closes the panel", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".a11y-fab")).toHaveAttribute("aria-expanded", "false");
  });

  test("Clicking outside the panel closes it", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    await page.mouse.click(10, 10);
    await expect(page.locator(".a11y-fab")).toHaveAttribute("aria-expanded", "false");
  });

  test("Text size button sets aria-pressed=true and others to false", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    const btn = page.locator(".a11y-panel [data-size='1.3']");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".a11y-panel [data-size='1']")).toHaveAttribute("aria-pressed", "false");
  });

  test("Text size A++ sets --fs-scale to 1.3 on <html>", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    await page.locator(".a11y-panel [data-size='1.3']").click();
    const scale = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--fs-scale")
    );
    expect(scale).toBe("1.3");
  });

  test("High-contrast toggle sets data-contrast=high on <html>", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    await page.locator(".a11y-panel [data-toggle='contrast']").click();
    const contrast = await page.evaluate(() =>
      document.documentElement.getAttribute("data-contrast")
    );
    expect(contrast).toBe("high");
  });

  test("High-contrast toggle sets aria-pressed=true", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    const btn = page.locator(".a11y-panel [data-toggle='contrast']");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  test("Dyslexia font toggle sets data-dys=on on <html>", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    await page.locator(".a11y-panel [data-toggle='dys']").click();
    const dys = await page.evaluate(() =>
      document.documentElement.getAttribute("data-dys")
    );
    expect(dys).toBe("on");
  });

  test("Reduce motion toggle sets data-motion=reduce on <html>", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    await page.locator(".a11y-panel [data-toggle='motion']").click();
    const motion = await page.evaluate(() =>
      document.documentElement.getAttribute("data-motion")
    );
    expect(motion).toBe("reduce");
  });

  test("Reset button reverts all settings", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    await page.locator(".a11y-panel [data-size='1.5']").click();
    await page.locator(".a11y-panel [data-toggle='contrast']").click();
    await page.locator(".a11y-panel [data-reset]").click();

    const scale = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--fs-scale")
    );
    expect(scale).toBe("1");
    const contrast = await page.evaluate(() =>
      document.documentElement.getAttribute("data-contrast")
    );
    expect(contrast).toBe("normal");
  });

  test("Preferences persist across page navigation (localStorage)", async ({ page }) => {
    await page.locator(".a11y-fab").click();
    await page.locator(".a11y-panel [data-toggle='contrast']").click();

    await page.goto("/about.html");
    await page.waitForLoadState("networkidle");

    const contrast = await page.evaluate(() =>
      document.documentElement.getAttribute("data-contrast")
    );
    expect(contrast).toBe("high");
  });
});

/* ============================================================
   READ ALOUD BUTTON
   ============================================================ */
test.describe("Read aloud buttons", () => {
  const pagesWithReadAloud = [
    "/",
    "/about.html",
    "/activities.html",
    "/news.html",
    "/blog.html",
    "/get-involved.html",
    "/contact.html",
    "/complaints.html",
  ];

  for (const path of pagesWithReadAloud) {
    test(`${path} has read-aloud button with aria-label`, async ({ page }) => {
      await page.goto(path);
      const btn = page.locator("[data-readaloud]").first();
      await expect(btn, `${path}: missing read-aloud button`).toBeAttached();
      const label = await btn.getAttribute("aria-label");
      expect(label, `${path}: read-aloud aria-label`).toBeTruthy();
    });
  }
});

/* ============================================================
   BLOG FILTER PILLS
   ============================================================ */
test.describe("Blog filter pills", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/blog.html");
    await page.waitForLoadState("networkidle");
  });

  test("Filter pills are <button> elements (not <span>)", async ({ page }) => {
    const pills = page.locator(".pills button");
    const count = await pills.count();
    expect(count).toBeGreaterThan(1);
  });

  test("Filter pill group has role=group and aria-label", async ({ page }) => {
    const group = page.locator(".pills[role='group']");
    await expect(group).toBeAttached();
    const label = await group.getAttribute("aria-label");
    expect(label).toBeTruthy();
  });

  test("First pill starts with aria-pressed=true", async ({ page }) => {
    const first = page.locator(".pills button").first();
    await expect(first).toHaveAttribute("aria-pressed", "true");
  });

  test("Clicking a different pill sets aria-pressed=true on it", async ({ page }) => {
    const pills = page.locator(".pills button");
    const second = pills.nth(1);
    await second.click();
    await expect(second).toHaveAttribute("aria-pressed", "true");
  });

  test("Only one pill has aria-pressed=true at a time", async ({ page }) => {
    const pills = page.locator(".pills button");
    const second = pills.nth(1);
    await second.click();

    const pressedCount = await page.locator('.pills button[aria-pressed="true"]').count();
    expect(pressedCount).toBe(1);
  });

  test("Pills are keyboard focusable (Tab reaches them)", async ({ page }) => {
    await page.keyboard.press("Tab");
    let reachedPill = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.classList.contains("pill") || el?.closest(".pills") !== null;
      });
      if (focused) { reachedPill = true; break; }
    }
    expect(reachedPill).toBe(true);
  });
});

/* ============================================================
   NEWS — Semantic dates and event links
   ============================================================ */
test.describe("News — event dates and links", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/news.html"); });

  test("Event dates use <time> elements with datetime attributes", async ({ page }) => {
    const times = page.locator(".event-row time[datetime]");
    const count = await times.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("Each event <time> has a visually-hidden full date span", async ({ page }) => {
    const times = await page.locator(".event-row time[datetime]").all();
    for (const time of times) {
      const hidden = await time.locator(".visually-hidden").count();
      expect(hidden, "time element missing visually-hidden date text").toBeGreaterThan(0);
    }
  });

  test("'Ask about this' links have descriptive aria-label", async ({ page }) => {
    const links = await page.locator('.event-row a[aria-label^="Ask about"]').all();
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const link of links) {
      const label = await link.getAttribute("aria-label");
      expect(label?.length).toBeGreaterThan("Ask about ".length);
    }
  });
});

/* ============================================================
   INDEX — Stats strip and activity cards
   ============================================================ */
test.describe("Home page semantics", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/"); });

  test("Stats strip uses <dl> with <dt>/<dd> pairs", async ({ page }) => {
    const dl = page.locator("dl").first();
    await expect(dl).toBeAttached();
    const dt = dl.locator("dt");
    const dd = dl.locator("dd");
    await expect(dt).not.toHaveCount(0);
    await expect(dd).not.toHaveCount(0);
  });

  test("Decorative SVG icons are aria-hidden", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    const hiddenCount = await page.locator(".ic svg[aria-hidden='true']").count();
    expect(hiddenCount).toBeGreaterThan(0);
  });
});

/* ============================================================
   PLACEHOLDER IMAGES — all aria-hidden
   ============================================================ */
test.describe("Placeholder divs are aria-hidden", () => {
  const pagesWithPh = [
    "/",
    "/news.html",
    "/blog.html",
    "/activities.html",
  ];

  for (const path of pagesWithPh) {
    test(`${path}: .ph divs are aria-hidden`, async ({ page }) => {
      await page.goto(path);
      const phs = await page.locator(".ph").all();
      for (const ph of phs) {
        const hidden = await ph.getAttribute("aria-hidden");
        expect(hidden, `${path}: .ph div not aria-hidden`).toBe("true");
      }
    });
  }
});
