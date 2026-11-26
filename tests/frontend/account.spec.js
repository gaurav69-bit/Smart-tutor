// Browser-level API interception verifies frontend behavior, not real persistence/mail delivery.
import { test, expect } from "@playwright/test";
const account = {
  id: 1,
  name: "Example Student",
  email: "student@example.test",
  role: "student",
};
async function api(page, handler = () => null) {
  await page.route("**/api/auth/**", async (route) => {
    const result = await handler(route.request());
    await route.fulfill({
      status: result?.status || 401,
      contentType: "application/json",
      body: JSON.stringify(
        result?.body || { error: { code: "UNAUTHENTICATED" } },
      ),
    });
  });
}
async function register(page, role = "student") {
  await page.goto("/#/register");
  if (role === "tutor")
    await page.getByRole("button", { name: "tutor", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Example Student");
  await page.getByLabel("Username", { exact: true }).fill("example_student");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("student@example.test");
  await page
    .getByLabel("Confirm email", { exact: true })
    .fill("student@example.test");
  await page.getByLabel("Password", { exact: true }).fill("TestPassword123");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("TestPassword123");
  await page.getByLabel("Subject", { exact: true }).fill("Mathematics");
  if (role === "student") {
    await page.getByLabel("Date of birth").fill("2000-01-01");
    await page
      .getByLabel("Home address (private)")
      .fill("Synthetic test address");
  } else {
    await page
      .getByLabel("Qualifications")
      .fill("Synthetic teaching qualification");
    await page
      .getByLabel("About your teaching")
      .fill("Synthetic teaching profile");
  }
  await page.getByRole("checkbox").check();
}
for (const width of [390, 768, 1440])
  test(`public/account navigation and layout at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await api(page);
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/",
      "/about",
      "/privacy",
      "/terms",
      "/login",
      "/register",
      "/verify",
    ]) {
      await page.goto("/#" + path);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("footer")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(
          `${path.replaceAll("/", "") || "home"}-${width}.png`,
        ),
        fullPage: true,
      });
      await page.reload();
      await expect(page.locator("main")).toBeVisible();
    }
    await page.goto("/");
    if (width === 390) {
      await page.getByLabel("Toggle navigation").click();
      await expect(page.getByRole("navigation")).toBeVisible();
      await page.getByRole("navigation").press("Escape");
      await expect(page.getByLabel("Toggle navigation")).toBeFocused();
    }
    await page.keyboard.press("Control+Home");
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    await page.keyboard.press("Tab");
    await page.getByText("Skip to content", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    expect(errors).toEqual([]);
  });
test("registration requires matching email/password; does not send confirmation fields", async ({
  page,
}) => {
  let payload,
    calls = 0;
  await api(page, (request) =>
    request.url().endsWith("/register")
      ? (calls++,
        (payload = request.postDataJSON()),
        { status: 201, body: { account: { ...account, verified: false } } })
      : null,
  );
  await register(page);
  await page.getByLabel("Confirm password").fill("DoesNotMatch123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toContainText("highlighted");
  expect(calls).toBe(0);
  await page.getByLabel("Confirm password").fill("TestPassword123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("not yet verified");
  expect(payload.role).toBe("student");
  expect(payload.terms).toBe(true);
  expect(payload.confirm).toBeUndefined();
  expect(payload.emailConfirm).toBeUndefined();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test("tutor fields and unavailable/duplicate/field-error responses remain failures", async ({
  page,
}) => {
  let status = 503,
    payload;
  await api(page, (req) =>
    req.url().endsWith("/register")
      ? ((payload = req.postDataJSON()),
        {
          status,
          body: {
            error: { details: { qualifications: "unsafe server detail" } },
          },
        })
      : null,
  );
  await register(page, "tutor");
  await expect(page.getByLabel("Date of birth")).toHaveCount(0);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  expect(payload.role).toBe("tutor");
  expect(payload.dob).toBeUndefined();
  for (const next of [409, 400]) {
    status = next;
    await page.getByLabel("Password", { exact: true }).fill("TestPassword123");
    await page.getByLabel("Confirm password").fill("TestPassword123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert")).toContainText(
      next === 409 ? "already registered" : "check",
    );
  }
  await expect(page.getByText("unsafe server detail")).toHaveCount(0);
});
test("verification requires click, validates token, and removes accepted token from URL", async ({
  page,
}) => {
  let calls = 0;
  await api(page, (req) =>
    req.url().endsWith("/verify-email")
      ? (calls++, { status: 200, body: { verified: true } })
      : null,
  );
  await page.goto("/#/verify?token=" + "a".repeat(64));
  await expect(page.getByLabel("Verification token")).toHaveValue(
    "a".repeat(64),
  );
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Verify my email" }).click();
  await expect(page.getByRole("status")).toContainText("Email verified");
  expect(calls).toBe(1);
  expect(page.url()).not.toContain("token=");
});
test("expired verification and generic resend/cooldown", async ({ page }) => {
  await api(page, (req) =>
    req.url().endsWith("/verify-email")
      ? { status: 400, body: { error: { code: "INVALID_OR_EXPIRED_TOKEN" } } }
      : req.url().endsWith("/resend-verification")
        ? { status: 202, body: { message: "accepted" } }
        : null,
  );
  await page.goto("/#/verify?token=" + "a".repeat(64));
  await page.getByRole("button", { name: "Verify my email" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "fresh verification link",
  );
  await page.getByLabel("Email for verification").fill("unknown@example.test");
  await page.getByRole("button", { name: "Request a new link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "does not confirm delivery",
  );
  await expect(
    page.getByRole("button", { name: /Try again in/ }),
  ).toBeDisabled();
});
test("login checks session, guarded role routes, logout failure and successful revocation", async ({
  page,
}) => {
  let signedIn = false,
    logoutFailure = true;
  await api(page, (req) => {
    if (req.url().endsWith("/login")) {
      signedIn = true;
      return { status: 200, body: { account } };
    }
    if (req.url().endsWith("/me") && signedIn)
      return { status: 200, body: { account } };
    if (req.url().endsWith("/logout")) {
      if (logoutFailure) return { status: 503, body: { error: {} } };
      signedIn = false;
      return { status: 204, body: {} };
    }
    return null;
  });
  await page.goto("/#/student");
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("TestPassword123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/student/);
  await expect(page.getByLabel("Sign out")).toBeVisible();
  await page.goto("/#/tutor");
  await expect(
    page.getByRole("heading", { name: "Access unavailable" }),
  ).toBeVisible();
  await page.getByLabel("Sign out").click();
  await expect(page.getByRole("alert")).toContainText("not been signed out");
  await expect(page.getByLabel("Sign out")).toBeVisible();
  logoutFailure = false;
  await page.getByLabel("Sign out").click();
  await expect(
    page.getByRole("link", { name: "Log in", exact: true }),
  ).toBeVisible();
  await page.goto("/#/dashboard");
  await expect(page).toHaveURL(/login/);
});
test("malformed success and network failures never authenticate", async ({
  page,
}) => {
  await api(page, (req) =>
    req.url().endsWith("/login")
      ? { status: 200, body: { account: { ...account, role: "admin" } } }
      : null,
  );
  await page.goto("/#/login");
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("TestPassword123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("unexpected");
  await expect(page.getByLabel("Sign out")).toHaveCount(0);
  await page.route("**/api/auth/login", (route) => route.abort());
  await page.getByLabel("Password", { exact: true }).fill("TestPassword123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to reach");
});
test("unavailable session remains blocked until retried successfully", async ({
  page,
}) => {
  let unavailable = true;
  await api(page, (req) =>
    req.url().endsWith("/me")
      ? unavailable
        ? { status: 503, body: { error: {} } }
        : { status: 200, body: { account } }
      : null,
  );
  await page.goto("/#/dashboard");
  await expect(
    page.getByRole("heading", { name: "Account services unavailable" }),
  ).toBeVisible();
  unavailable = false;
  await page.getByRole("button", { name: "Retry session check" }).click();
  await expect(page.getByText("Signed in as Example Student")).toBeVisible();
});

for (const role of ["student", "tutor"]) {
  test(`real browser API lifecycle with proposed persistence for ${role}`, async ({
    page, context, baseURL,
  }, testInfo) => {
    const { startBrowserAuthFixture } = await import("../../apps/api/test-support/browser-auth-fixture.js");
    const fixture = await startBrowserAuthFixture(baseURL);
    try {
      // No network interception. Vite proxies the actual browser requests to Express.
      await register(page, role);
      const submitted = page.waitForRequest(request =>
        request.url().endsWith("/api/auth/register") && request.method() === "POST",
      );
      await page.getByRole("button", { name: "Create account" }).click();
      const payload = (await submitted).postDataJSON();
      const sharedFields = ["name", "username", "email", "password", "role", "subject", "terms"];
      const roleFields = role === "student" ? ["dob", "address"] : ["qualifications", "bio"];
      expect(Object.keys(payload).sort()).toEqual([...sharedFields, ...roleFields].sort());
      expect(payload.role).toBe(role);
      expect(payload.terms).toBe(true);
      await expect(page.getByRole("status")).toContainText("not yet verified");
      await page.screenshot({ path: testInfo.outputPath("01-registration.png") });

      const rejected = await page.request.post("/api/auth/register", {
        data: { ...payload, [roleFields[0]]: "", terms: false },
      });
      expect(rejected.status()).toBe(400);
      const rejection = await rejected.json();
      expect(Object.keys(rejection.error.details).sort()).toEqual([roleFields[0], "terms"].sort());

      const initial = await fixture.dispatchVerificationMail();
      expect(initial.result.sent).toBe(1);
      expect(initial.messages).toHaveLength(1);
      expect(initial.messages[0].to).toBe(account.email);
      const initialLink = initial.messages[0].textContent.split("\n")[1];
      expect(new URL(initialLink).hash).toMatch(/^#\/verify\?token=[a-f0-9]{64}$/);

      const duplicate = await page.request.post("/api/auth/register", { data: payload });
      expect(duplicate.status()).toBe(409);
      expect((await fixture.dispatchVerificationMail()).messages).toHaveLength(0);

      // Verify the initial registration email for students, and the resend for tutors.
      // The tutor test advances only the database adapter's clock to avoid a real wait.
      let verificationLink = initialLink;
      if (role === "tutor") {
        fixture.advancePastResendCooldown();
        await page.goto("/#/verify");
        await page.getByLabel("Email for verification").fill(account.email);
        const resendResponse = page.waitForResponse(response =>
          response.url().endsWith("/api/auth/resend-verification") && response.request().method() === "POST",
        );
        await page.getByRole("button", { name: "Request a new link" }).click();
        const requested = await resendResponse;
        expect(requested.status()).toBe(202);
        await expect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
        await page.screenshot({ path: testInfo.outputPath("02-resend-cooldown.png") });

        const accepted = await requested.json();
        for (const email of [account.email, "unknown@example.test"]) {
          const response = await page.request.post("/api/auth/resend-verification", { data: { email } });
          expect(response.status()).toBe(202);
          expect(await response.json()).toEqual(accepted);
        }
        const { messages, result } = await fixture.dispatchVerificationMail();
        expect(result.sent).toBe(1);
        expect(messages).toHaveLength(1);
        expect(messages[0].to).toBe(account.email);
        verificationLink = messages[0].textContent.split("\n")[1];
        expect(verificationLink).not.toBe(initialLink);
      }

      await page.goto(verificationLink);
      await page.getByRole("button", { name: "Verify my email" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Email verified" })).toBeVisible();
      await expect(page).not.toHaveURL(/token=/);
      await page.screenshot({ path: testInfo.outputPath("03-verification.png") });

      const verifiedRequest = await page.request.post("/api/auth/resend-verification", {
        data: { email: account.email },
      });
      expect(verifiedRequest.status()).toBe(202);
      const verifiedResend = await fixture.dispatchVerificationMail();
      expect(verifiedResend.result.sent).toBe(0);
      expect(verifiedResend.messages).toHaveLength(0);
      expect(await fixture.approve(account.email)).toBe(true);
      await page.goto("/#/" + role);
      await expect(page).toHaveURL(/login/);
      await page.getByLabel("Email address", { exact: true }).fill(account.email);
      await page.getByLabel("Password", { exact: true }).fill("TestPassword123");
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page).toHaveURL(new RegExp("/" + role + "$"));
      const cookies = await context.cookies();
      const session = cookies.find(cookie => cookie.httpOnly);
      expect(session).toBeDefined();
      expect((await page.request.get("/api/auth/me")).ok()).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("04-signed-in.png") });

      await page.getByLabel("Sign out").click();
      await expect(page.getByLabel("Sign out")).toHaveCount(0);
      const revoked = await page.request.get("/api/auth/me", {
        headers: { Cookie: `${session.name}=${session.value}` },
      });
      expect(revoked.status()).toBe(401);
      await page.screenshot({ path: testInfo.outputPath("05-signed-out.png") });
    } finally {
      await fixture.close();
    }
  });
}
