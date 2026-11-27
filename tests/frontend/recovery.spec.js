// Intercepted responses test the frontend contract, not actual reset/mail persistence.
import { test, expect } from "@playwright/test";
const token = "b".repeat(64);
const json = (status, body) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
async function api(page, handler = () => json(404, {})) {
  await page.route("**/api/auth/**", route => route.fulfill(
    route.request().url().endsWith("/me") ? json(401, {}) : handler(route.request())
  ));
}
for (const width of [390, 768, 1440]) test(`password recovery navigation and layout at ${width}px`, async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await api(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/#/login");
  const link = page.getByRole("link", { name: "Forgot password?" });
  await expect(link).toBeVisible();
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("form", { name: "Request password reset" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Let’s get you back in." })).toBeVisible();
  for (const path of ["forgot-password", `reset-password?token=${token}`]) {
    await page.goto(`/#/${path}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${path.split("?")[0]}-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("request normalizes email, uses generic feedback and prevents repeat submissions", async ({ page }) => {
  let count = 0, payload;
  await api(page, req => { count++; payload = req.postDataJSON(); return json(200, { message: "Service text should not be displayed" }); });
  await page.goto("/#/forgot-password");
  await page.getByLabel("Email address").fill("Student@Example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If this address is eligible");
  await expect(page.getByRole("status")).toContainText("does not confirm delivery");
  await expect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
  expect(payload).toEqual({ email: "student@example.test" });
  expect(count).toBe(1);
});

test("unconnected, rate-limited, malformed and offline recovery never claim success", async ({ page }) => {
  let response = json(404, {});
  await api(page, () => response);
  await page.goto("/#/forgot-password");
  const submit = async () => {
    await page.getByLabel("Email address").fill("student@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
  };
  for (const status of [404, 503, 200]) {
    response = json(status, {});
    await submit();
    await expect(page.getByRole("alert")).toContainText(status === 200 ? "unexpected" : "not available");
    await expect(page.getByRole("status")).toHaveCount(0);
  }
  response = json(429, {});
  await submit();
  await expect(page.getByRole("alert")).toContainText("Too many requests");
  await expect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
  await page.reload();
  await page.route("**/api/auth/forgot", route => route.abort());
  await submit();
  await expect(page.getByRole("alert")).toContainText("Unable to reach");
});

test("reset rejects missing tokens and mismatches without making a request", async ({ page }) => {
  let count = 0;
  await api(page, () => { count++; return json(200, { message: "ok" }); });
  await page.goto("/#/reset-password");
  await expect(page.getByRole("alert")).toContainText("missing or invalid");
  await expect(page.getByRole("button", { name: "Update password" })).toHaveCount(0);
  await page.goto(`/#/reset-password?token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill("SyntheticPassword123");
  await page.getByLabel("Confirm new password").fill("AnotherPassword123");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByLabel("Confirm new password")).toHaveAccessibleDescription("Passwords do not match.");
  expect(count).toBe(0);
});

for (const url of [`/#/reset-password?token=${token}`, `/?token=${token}#/reset-password`]) test(`reset only completes after explicit API success: ${url.startsWith('/?') ? 'query' : 'hash'} link`, async ({ page }) => {
  let count = 0, payload;
  await api(page, req => { count++; payload = req.postDataJSON(); return json(200, { message: "ok" }); });
  await page.goto(url);
  expect(count).toBe(0);
  await page.getByLabel("New password", { exact: true }).fill("SyntheticPassword123");
  await page.getByLabel("Confirm new password").fill("SyntheticPassword123");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  expect(payload).toEqual({ token, password: "SyntheticPassword123" });
  await expect(page).not.toHaveURL(/token=/);
  await expect(page.getByRole("button", { name: "Update password" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
});

test("expired reset clears password inputs and provides a fresh-link route", async ({ page }) => {
  await api(page, () => json(400, { error: { details: { password: "raw message" } } }));
  await page.goto(`/#/reset-password?token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill("SyntheticPassword123");
  await page.getByLabel("Confirm new password").fill("SyntheticPassword123");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid, expired or already used");
  await expect(page.locator('input[name="password"]')).toHaveValue("");
  await page.getByRole("link", { name: "Request a new reset link" }).click();
  await expect(page).toHaveURL(/#\/forgot-password$/);
});

test("a late reset response cannot complete a different reset link", async ({ page }) => {
  let heldRoute, ready;
  const started = new Promise(resolve => { ready = resolve; });
  await page.route("**/api/auth/**", route => {
    if (route.request().url().endsWith("/reset")) {
      heldRoute = route;
      ready();
      return;
    }
    return route.fulfill(json(401, {}));
  });
  await page.goto(`/#/reset-password?token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill("SyntheticPassword123");
  await page.getByLabel("Confirm new password").fill("SyntheticPassword123");
  await page.getByRole("button", { name: "Update password" }).click();
  await started;
  await page.evaluate(next => { window.location.hash = `/reset-password?token=${next}`; }, "c".repeat(64));
  await expect(page.getByRole("button", { name: "Update password" })).toBeEnabled();
  await heldRoute.fulfill(json(200, { message: "ok" })).catch(() => {});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp("token=" + "c".repeat(64)));
});
