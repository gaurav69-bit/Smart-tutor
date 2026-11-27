import { test, expect } from "@playwright/test";

const account = {
  id: 1,
  name: "Review Student",
  email: "review@example.test",
  role: "student",
};
const json = (status, body) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test("server subject and teaching-profile errors identify their form controls", async ({
  page,
}) => {
  await page.route("**/api/auth/**", (route) =>
    route.fulfill(
      route.request().url().endsWith("/register")
        ? json(400, {
            error: {
              details: { subject: "Invalid subject", bio: "Invalid profile" },
            },
          })
        : json(401, { error: { code: "UNAUTHENTICATED" } }),
    ),
  );
  await page.goto("/#/register");
  await page.getByRole("button", { name: "tutor", exact: true }).click();
  for (const [label, value] of Object.entries({
    "Full name": "Review Tutor",
    Username: "review_tutor",
    "Email address": "review@example.test",
    "Confirm email": "review@example.test",
    Password: "ReviewPassword123",
    "Confirm password": "ReviewPassword123",
    Subject: "Mathematics",
    Qualifications: "Synthetic qualification",
    "About your teaching": "Synthetic profile",
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toContainText("Please check");
  const subject = page.getByRole("textbox", { name: /^Subject/ });
  await expect(subject).toHaveAttribute("aria-invalid", "true");
  await expect(subject).toHaveAccessibleDescription("Please check this field.");
  await expect(
    page.getByRole("textbox", { name: /^About your teaching/ }),
  ).toHaveAccessibleDescription("Please check this field.");
});

test("a delayed pre-logout session response cannot restore signed-in UI", async ({
  page,
}) => {
  let holdMe = false;
  let releaseMe, releaseLogout, meStarted, logoutStarted;
  const meGate = new Promise((resolve) => {
    releaseMe = resolve;
  });
  const logoutGate = new Promise((resolve) => {
    releaseLogout = resolve;
  });
  const mePending = new Promise((resolve) => {
    meStarted = resolve;
  });
  const logoutPending = new Promise((resolve) => {
    logoutStarted = resolve;
  });
  await page.route("**/api/auth/**", async (route) => {
    if (route.request().url().endsWith("/logout")) {
      logoutStarted();
      await logoutGate;
      return route.fulfill({ status: 204 });
    }
    if (holdMe) {
      meStarted();
      await meGate;
    }
    return route.fulfill(json(200, { account }));
  });
  await page.goto("/#/dashboard");
  await expect(page.getByLabel("Sign out")).toBeVisible();
  await page.getByLabel("Sign out").click();
  await logoutPending;
  holdMe = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await mePending;
  releaseLogout();
  await expect(
    page.getByRole("link", { name: "Log in", exact: true }),
  ).toBeVisible();
  const staleResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/me"),
  );
  releaseMe();
  await (await staleResponse).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(page.getByLabel("Sign out")).toHaveCount(0);
});
