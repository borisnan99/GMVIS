const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const PAGES = [
  { name: "Home",        path: "/" },
  { name: "About",       path: "/about.html" },
  { name: "Activities",  path: "/activities.html" },
  { name: "News",        path: "/news.html" },
  { name: "Blog",        path: "/blog.html" },
  { name: "Gallery",     path: "/gallery.html" },
  { name: "Get Involved",path: "/get-involved.html" },
  { name: "Contact",     path: "/contact.html" },
  { name: "Complaints",  path: "/complaints.html" },
];

for (const { name, path } of PAGES) {
  test(`${name} — axe WCAG 2.1 AA`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    if (results.violations.length > 0) {
      const report = results.violations
        .map(v => `[${v.impact}] ${v.id}: ${v.description}\n  ${v.nodes.map(n => n.target.join(" > ")).join("\n  ")}`)
        .join("\n\n");
      expect.soft(results.violations, `Axe violations on ${name}:\n\n${report}`).toHaveLength(0);
    }
  });
}

test("All pages have a unique <title>", async ({ page }) => {
  const titles = new Set();
  for (const { path, name } of PAGES) {
    await page.goto(path);
    const title = await page.title();
    expect(title.length, `${name} has no <title>`).toBeGreaterThan(0);
    expect(titles.has(title), `Duplicate <title> "${title}" on ${name}`).toBe(false);
    titles.add(title);
  }
});

test("All pages have exactly one <h1>", async ({ page }) => {
  for (const { path, name } of PAGES) {
    await page.goto(path);
    const h1s = await page.locator("h1").count();
    expect(h1s, `${name} has ${h1s} <h1> elements`).toBe(1);
  }
});

test("All pages have lang attribute on <html>", async ({ page }) => {
  for (const { path, name } of PAGES) {
    await page.goto(path);
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang, `${name} missing lang`).toBeTruthy();
  }
});

test("Skip-to-main link exists and points to #main on every page", async ({ page }) => {
  for (const { path, name } of PAGES) {
    await page.goto(path);
    const skip = page.locator("a.skip").first();
    await expect(skip, `${name} missing skip link`).toBeAttached();
    const href = await skip.getAttribute("href");
    expect(href, `${name} skip link href`).toBe("#main");
    const main = page.locator("#main");
    await expect(main, `${name} missing #main`).toBeAttached();
  }
});

test("All images have alt attributes", async ({ page }) => {
  for (const { path, name } of PAGES) {
    await page.goto(path);
    const imgs = await page.locator("img").all();
    for (const img of imgs) {
      const alt = await img.getAttribute("alt");
      expect(alt, `${name}: img missing alt`).not.toBeNull();
    }
  }
});

test("No positive tabindex values (breaks natural tab order)", async ({ page }) => {
  for (const { path, name } of PAGES) {
    await page.goto(path);
    const count = await page.locator("[tabindex]").evaluateAll(els =>
      els.filter(el => parseInt(el.getAttribute("tabindex") || "0", 10) > 0).length
    );
    expect(count, `${name} has elements with tabindex > 0`).toBe(0);
  }
});
