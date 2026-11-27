import { test, expect } from "@playwright/test";
test("configured CAPTCHA blocks missing/expired tokens and clears a consumed token after login errors", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_TURNSTILE_SITE_KEY,
    "Run the separate configured-CAPTCHA command; no real provider is called.",
  );
  let count = 0,
    payload;
  await page.addInitScript(() => {
    window.turnstile = {
      render: (target, options) => {
        window.securityOptions = options;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Complete synthetic security check";
        button.onclick = () => options.callback("synthetic-proof");
        target.appendChild(button);
        return target;
      },
      remove: (target) => target.replaceChildren(),
    };
  });
  await page.route("**/api/auth/**", (route) => {
    if (route.request().url().endsWith("/login")) {
      count++;
      payload = route.request().postDataJSON();
    }
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.goto("/#/login");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("member@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticPassword123");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Complete the security check",
  );
  expect(count).toBe(0);
  await page
    .getByRole("button", { name: "Complete synthetic security check" })
    .click();
  await page.evaluate(() => window.securityOptions["expired-callback"]());
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect(count).toBe(0);
  await page.getByRole("button", { name: "Retry security check" }).click();
  await page
    .getByRole("button", { name: "Complete synthetic security check" })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Sign-in was not accepted",
  );
  expect(payload.captcha).toBe("synthetic-proof");
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticPassword123");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Complete the security check",
  );
  expect(count).toBe(1);
});
