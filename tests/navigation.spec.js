const { test, expect } = require("@playwright/test");

const PAGES = [
  { name: "Home",         path: "/",                 current: "Home" },
  { name: "About",        path: "/about.html",        current: "About" },
  { name: "Activities",   path: "/activities.html",   current: "Activities" },
  { name: "News",         path: "/news.html",         current: "News" },
  { name: "Blog",         path: "/blog.html",         current: "Blog" },
  { name: "Get Involved", path: "/get-involved.html", current: "Get Involved" },
  { name: "Contact",      path: "/contact.html",      current: "Contact" },
  { name: "Complaints",   path: "/complaints.html",   current: null },
];

/* ---- Active page indicator ---- */
test("Current page nav link has aria-current=page", async ({ page }) => {
  for (const { path, name, current } of PAGES) {
    if (!current) continue;
    await page.goto(path);
    const link = page.locator(`.menu [aria-current="page"]`);
    await expect(link, `${name}: no aria-current=page`).toBeAttached();
    const text = await link.innerText();
    expect(text.trim(), `${name}: wrong aria-current link`).toBe(current);
  }
});

/* ---- Brand / logo link ---- */
test("Brand logo links back to index from every page", async ({ page }) => {
  for (const { path, name } of PAGES) {
    await page.goto(path);
    const brand = page.locator(".site-header .brand").first();
    const href = await brand.getAttribute("href");
    expect(href, `${name}: brand href`).toMatch(/index\.html$|^\//);
    const label = await brand.getAttribute("aria-label");
    expect(label, `${name}: brand aria-label`).toContain("Greater Manchester Vis");
  }
});

/* ---- Mobile hamburger ---- */
test("Hamburger starts with aria-expanded=false and menu aria-hidden=true", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const burger = page.locator(".hamburger");
  const menu  = page.locator(".menu");

  await expect(burger).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAttribute("aria-hidden", "true");
});

test("Clicking hamburger opens menu and sets aria-expanded=true", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const burger = page.locator(".hamburger");
  const menu  = page.locator(".menu");

  await burger.click();
  await expect(burger).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveAttribute("aria-hidden", "false");
  await expect(menu).toHaveAttribute("data-open", "true");
});

test("Clicking hamburger again closes the menu", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const burger = page.locator(".hamburger");
  await burger.click();
  await burger.click();
  await expect(burger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".menu")).toHaveAttribute("aria-hidden", "true");
});

test("Hamburger label changes between Open/Close menu", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const burger = page.locator(".hamburger");
  await expect(burger).toHaveAttribute("aria-label", "Open menu");
  await burger.click();
  await expect(burger).toHaveAttribute("aria-label", "Close menu");
});

test("Hamburger has aria-controls pointing to menu id", async ({ page }) => {
  await page.goto("/");
  const burger = page.locator(".hamburger");
  const controls = await burger.getAttribute("aria-controls");
  expect(controls).toBeTruthy();
  const target = page.locator(`#${controls}`);
  await expect(target).toBeAttached();
});

test("Menu has no aria-hidden on desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const menu = page.locator(".menu");
  const ariaHidden = await menu.getAttribute("aria-hidden");
  expect(ariaHidden).toBeNull();
});

/* ---- Skip to main ---- */
test("Skip link is first focusable element and moves focus to main", async ({ page }) => {
  await page.goto("/");
  // Tab once from document start
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.className);
  expect(focused).toContain("skip");
});

/* ---- Footer links ---- */
test("Footer navigation links resolve to valid in-site pages", async ({ page }) => {
  await page.goto("/");
  const footerLinks = await page.locator(".footer-links a").all();
  for (const link of footerLinks) {
    const href = await link.getAttribute("href");
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("http")) continue;
    const res = await page.request.get(href);
    expect(res.status(), `Footer link ${href} is broken`).toBe(200);
  }
});

/* ---- Join in CTA ---- */
test("'Join in' CTA in nav links to get-involved.html", async ({ page }) => {
  await page.goto("/");
  const cta = page.locator(".nav-cta");
  const href = await cta.getAttribute("href");
  expect(href).toContain("get-involved");
});
