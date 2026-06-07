const { test, expect } = require("@playwright/test");

/* ---- Helpers ---- */
function mockW3F(page, success = true, status = 200) {
  return page.route("https://api.web3forms.com/submit", route =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(success ? { success: true, message: "Email sent." } : { success: false, message: "Invalid access key." }),
    })
  );
}

/* ============================================================
   CONTACT FORM
   ============================================================ */
test.describe("Contact form", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/contact.html"); });

  test("has Web3Forms access_key hidden input", async ({ page }) => {
    const key = page.locator('form[data-validate] input[name="access_key"]');
    await expect(key).toHaveAttribute("value", "57ac6623-42b5-4f37-b615-9556f9e036e2");
  });

  test("has subject hidden input", async ({ page }) => {
    const subj = page.locator('form[data-validate] input[name="subject"]');
    await expect(subj).toHaveAttribute("value", "New enquiry — Greater Manchester Vis");
  });

  test("has honeypot botcheck input that is hidden and not tabbable", async ({ page }) => {
    const bot = page.locator('input[name="botcheck"]');
    await expect(bot).toBeAttached();
    const tabindex = await bot.getAttribute("tabindex");
    expect(tabindex).toBe("-1");
    const ariaHidden = await bot.getAttribute("aria-hidden");
    expect(ariaHidden).toBe("true");
  });

  test("submitting empty form focuses first invalid field", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe("c-name");
  });

  test("required fields show aria-invalid=true on failed submit", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    for (const id of ["c-name", "c-email", "c-topic", "c-message"]) {
      await expect(page.locator(`#${id}`)).toHaveAttribute("aria-invalid", "true");
    }
  });

  test("invalid email shows aria-invalid and error span", async ({ page }) => {
    await page.locator("#c-name").fill("Test User");
    await page.locator("#c-email").fill("not-an-email");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("#c-email")).toHaveAttribute("aria-invalid", "true");
  });

  test("aria-invalid clears on input after error", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    await page.locator("#c-name").fill("Test");
    await expect(page.locator("#c-name")).toHaveAttribute("aria-invalid", "false");
  });

  test("consent checkbox is required", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("#c-consent")).toHaveAttribute("aria-invalid", "true");
  });

  test("form-error div has role=alert", async ({ page }) => {
    const errDiv = page.locator("form .form-error");
    await expect(errDiv).toHaveAttribute("role", "alert");
  });

  test("shows success state and focuses it on valid submit", async ({ page }) => {
    await mockW3F(page);
    await page.locator("#c-name").fill("Test User");
    await page.locator("#c-email").fill("test@example.com");
    await page.locator("#c-topic").selectOption("Membership");
    await page.locator("#c-message").fill("Hello, I would like to join.");
    await page.locator("#c-consent").check();
    await page.locator('button[type="submit"]').click();

    const success = page.locator(".form-success");
    await expect(success).toHaveAttribute("data-show", "true");
    const focused = await page.evaluate(() => document.activeElement?.className);
    expect(focused).toContain("form-success");
  });

  test("shows form-error and re-enables button on API failure", async ({ page }) => {
    await mockW3F(page, false);
    await page.locator("#c-name").fill("Test User");
    await page.locator("#c-email").fill("test@example.com");
    await page.locator("#c-topic").selectOption("Membership");
    await page.locator("#c-message").fill("Hello, I would like to join.");
    await page.locator("#c-consent").check();
    await page.locator('button[type="submit"]').click();

    const errDiv = page.locator(".form-error");
    await expect(errDiv).toHaveAttribute("data-show", "true");

    const btn = page.locator('button[type="submit"]');
    await expect(btn).toBeEnabled();
    await expect(btn).not.toHaveAttribute("aria-busy");
  });

  test("shows form-error on network failure", async ({ page }) => {
    await page.route("https://api.web3forms.com/submit", route => route.abort("failed"));
    await page.locator("#c-name").fill("Test User");
    await page.locator("#c-email").fill("test@example.com");
    await page.locator("#c-topic").selectOption("Membership");
    await page.locator("#c-message").fill("Hello.");
    await page.locator("#c-consent").check();
    await page.locator('button[type="submit"]').click();

    await expect(page.locator(".form-error")).toHaveAttribute("data-show", "true");
  });

  test("submit button becomes aria-busy while sending", async ({ page }) => {
    let resolveSubmit;
    await page.route("https://api.web3forms.com/submit", async route => {
      await new Promise(r => { resolveSubmit = r; setTimeout(r, 3000); });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });

    await page.locator("#c-name").fill("Test User");
    await page.locator("#c-email").fill("test@example.com");
    await page.locator("#c-topic").selectOption("Membership");
    await page.locator("#c-message").fill("Hello.");
    await page.locator("#c-consent").check();

    const [btn] = [page.locator('button[type="submit"]')];
    await btn.click();
    await expect(btn).toHaveAttribute("aria-busy", "true");
    await expect(btn).toBeDisabled();
    resolveSubmit?.();
  });
});

/* ============================================================
   COMPLAINTS FORM
   ============================================================ */
test.describe("Complaints form", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/complaints.html"); });

  test("has Web3Forms access_key hidden input", async ({ page }) => {
    const key = page.locator('form[data-validate] input[name="access_key"]');
    await expect(key).toHaveAttribute("value", "57ac6623-42b5-4f37-b615-9556f9e036e2");
  });

  test("has subject hidden input for complaints", async ({ page }) => {
    const subj = page.locator('form[data-validate] input[name="subject"]');
    await expect(subj).toHaveAttribute("value", "New complaint — Greater Manchester Vis");
  });

  test("has honeypot botcheck input", async ({ page }) => {
    const bot = page.locator('input[name="botcheck"]');
    await expect(bot).toBeAttached();
    await expect(bot).toHaveAttribute("aria-hidden", "true");
  });

  test("submitting empty form focuses x-name", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe("x-name");
  });

  test("required fields get aria-invalid on empty submit", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    for (const id of ["x-name", "x-email", "x-what"]) {
      await expect(page.locator(`#${id}`)).toHaveAttribute("aria-invalid", "true");
    }
  });

  test("optional fields (phone, date, where, outcome) do not get aria-invalid", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    for (const id of ["x-phone", "x-date", "x-where", "x-outcome"]) {
      const el = page.locator(`#${id}`);
      const val = await el.getAttribute("aria-invalid");
      expect(val, `${id} should not be invalid`).not.toBe("true");
    }
  });

  test("shows success state on valid submit", async ({ page }) => {
    await mockW3F(page);
    await page.locator("#x-name").fill("Jane Smith");
    await page.locator("#x-email").fill("jane@example.com");
    await page.locator("#x-what").fill("Something went wrong at the session.");
    await page.locator("#x-consent").check();
    await page.locator('button[type="submit"]').click();

    await expect(page.locator(".form-success")).toHaveAttribute("data-show", "true");
  });

  test("shows form-error and re-enables button on API failure", async ({ page }) => {
    await mockW3F(page, false);
    await page.locator("#x-name").fill("Jane Smith");
    await page.locator("#x-email").fill("jane@example.com");
    await page.locator("#x-what").fill("Something went wrong.");
    await page.locator("#x-consent").check();
    await page.locator('button[type="submit"]').click();

    await expect(page.locator(".form-error")).toHaveAttribute("data-show", "true");
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });
});

/* ============================================================
   NEWSLETTER FORM (news.html)
   ============================================================ */
test.describe("Newsletter form", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/news.html"); });

  test("has Web3Forms access_key hidden input", async ({ page }) => {
    const key = page.locator('form[data-validate] input[name="access_key"]');
    await expect(key).toHaveAttribute("value", "57ac6623-42b5-4f37-b615-9556f9e036e2");
  });

  test("has newsletter subject hidden input", async ({ page }) => {
    const subj = page.locator('form[data-validate] input[name="subject"]');
    await expect(subj).toHaveAttribute("value", "Newsletter subscription — Greater Manchester Vis");
  });

  test("has honeypot botcheck input", async ({ page }) => {
    await expect(page.locator('input[name="botcheck"]')).toBeAttached();
  });

  test("email field is required", async ({ page }) => {
    await page.locator('form[data-validate] button[type="submit"]').click();
    await expect(page.locator("#nl-email")).toHaveAttribute("aria-invalid", "true");
  });

  test("invalid email fails validation", async ({ page }) => {
    await page.locator("#nl-email").fill("notanemail");
    await page.locator('form[data-validate] button[type="submit"]').click();
    await expect(page.locator("#nl-email")).toHaveAttribute("aria-invalid", "true");
  });

  test("shows success on valid submit", async ({ page }) => {
    await mockW3F(page);
    await page.locator("#nl-email").fill("subscriber@example.com");
    await page.locator('form[data-validate] button[type="submit"]').click();
    await expect(page.locator(".form-success")).toHaveAttribute("data-show", "true");
  });

  test("shows error on API failure", async ({ page }) => {
    await mockW3F(page, false);
    await page.locator("#nl-email").fill("subscriber@example.com");
    await page.locator('form[data-validate] button[type="submit"]').click();
    await expect(page.locator(".form-error")).toHaveAttribute("data-show", "true");
  });

  test("form-success has role=status", async ({ page }) => {
    await expect(page.locator(".form-success")).toHaveAttribute("role", "status");
  });

  test("form-error has role=alert", async ({ page }) => {
    await expect(page.locator(".form-error")).toHaveAttribute("role", "alert");
  });
});
