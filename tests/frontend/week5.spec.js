// Synthetic/intercepted Week 5 contracts. These are not live-service acceptance tests.
import { test, expect } from "@playwright/test";
const subjects = [
  { id: 1, name: "Mathematics" },
  { id: 2, name: "English" },
];
const tutors = Array.from({ length: 7 }, (_, i) => ({
  id: i + 10,
  name: `Synthetic Tutor ${i + 1}`,
  bio: "Synthetic teaching profile",
  qualifications: "Synthetic qualification",
  subjects: [subjects[i % 2]],
  photo: false,
  rating: 4,
  reviews: [
    {
      id: i + 30,
      name: "Synthetic Student",
      rating: 4,
      body: "Synthetic review text",
    },
  ],
  availability: [
    {
      id: i + 50,
      starts_at: "2026-12-02T01:00:00Z",
      ends_at: "2026-12-02T02:00:00Z",
    },
  ],
}));
const json = (status, body) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});
async function fixture(page, role = "student", override) {
  const server = {
    role,
    calls: [],
    name: "Synthetic Member",
    status: "pending",
    list: tutors,
  };
  await page.route("http://127.0.0.1:4173/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api", "");
    server.calls.push({ path, method: req.method(), body: req.postData() });
    const custom = await override?.(req, path, server);
    if (custom) return route.fulfill(custom);
    if (path === "/auth/me")
      return route.fulfill(
        server.role
          ? json(200, {
              account: {
                id: 1,
                name: server.name,
                email: "member@example.test",
                role: server.role,
              },
            })
          : json(401, {}),
      );
    if (path === "/tutors") return route.fulfill(json(200, server.list));
    if (path === "/subjects") return route.fulfill(json(200, subjects));
    if (path === "/profile" && req.method() === "GET")
      return route.fulfill(
        json(200, {
          id: 1,
          name: server.name,
          role: server.role,
          verified: true,
          status: "active",
          subjects: [1],
          timezone: "Australia/Sydney",
          bio: "Synthetic bio",
          qualifications: "Synthetic qualification",
          address: "Synthetic address",
          photo: false,
        }),
      );
    if (path === "/admin/users")
      return route.fulfill(
        json(200, [
          {
            id: 2,
            name: "Synthetic Pending Tutor",
            email: "tutor@example.test",
            role: "tutor",
            verified: true,
            status: server.status,
            qualifications: "Synthetic qualification",
          },
        ]),
      );
    return route.fulfill(json(404, {}));
  });
  return server;
}
for (const width of [390, 768, 1440])
  test(`Week 5 public, profile and admin layouts at ${width}px`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const server = await fixture(page, "tutor");
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, heading, file] of [
      ["/tutors", "Find your learning partner.", "directory"],
      ["/tutors/10", "Synthetic Tutor 1", "public-profile"],
      ["/dashboard/profile", "Your space.Your story.", "tutor-edit"],
      ["/accept-invitation", "Your invitation to help.", "invitation"],
    ]) {
      await page.goto("/#" + path);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        heading,
      );
      await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`synthetic-${file}-${width}.png`),
        fullPage: true,
      });
    }
    server.role = "admin";
    await page.reload();
    for (const path of ["/dashboard/users", "/dashboard/operations"]) {
      await page.goto("/#" + path);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        path.endsWith("users") ? "Good people." : "A thoughtful",
      );
      await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(
          `synthetic-admin-${path.split("/").pop()}-${width}.png`,
        ),
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });

test("directory search, subject filter, pagination and deep links use returned data", async ({
  page,
}) => {
  await fixture(page, null);
  await page.goto("/#/tutors");
  await expect(page.getByRole("article")).toHaveCount(6);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("link", { name: "Get to know Synthetic" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic Tutor 7" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Synthetic review text")).toBeVisible();
  await page.getByRole("link", { name: "All tutors", exact: false }).click();
  await page
    .getByRole("combobox", { name: "Subject", exact: true })
    .selectOption("2");
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByLabel("Search tutors").fill("nothing matches");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("No tutors match");
  await page.goto("/#/tutors/missing");
  await expect(
    page.getByRole("heading", { name: "Tutor unavailable" }),
  ).toBeVisible();
});

test("directory errors, malformed replies and empty data remain distinct from loading", async ({
  page,
}) => {
  let result = json(503, {});
  await fixture(page, null, (_, path) => (path === "/tutors" ? result : null));
  await page.goto("/#/tutors");
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  result = json(200, { bad: true });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("unexpected list");
  result = json(200, []);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("No tutors match");
});

test("student profile validation and successful save preserve role boundaries", async ({
  page,
}) => {
  const server = await fixture(page, "student", (req, path, state) => {
    if (path === "/profile" && req.method() === "PATCH") {
      state.name = req.postDataJSON().name;
      return json(200, { message: "ok" });
    }
  });
  await page.goto("/#/dashboard/profile");
  await expect(page.getByLabel("Home address (private)")).toBeVisible();
  await expect(page.getByLabel("Qualifications", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Timezone (IANA name)").fill("invalid/zone");
  await page.getByRole("button", { name: "Update profile" }).click();
  await expect(page.getByRole("alert")).toContainText("valid IANA timezone");
  expect(server.calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  await page.getByLabel("Timezone (IANA name)").fill("Australia/Sydney");
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Updated Synthetic Member");
  await page.getByRole("button", { name: "Update profile" }).click();
  await expect(
    page.getByText("Profile changes accepted.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Updated Synthetic Member",
  );
  const body = JSON.parse(server.calls.find((c) => c.method === "PATCH").body);
  expect(body).not.toHaveProperty("role");
  expect(body).not.toHaveProperty("email");
  expect(body).not.toHaveProperty("dob");
  expect(body.subjects).toEqual([1]);
});

test("photo type/size failures prevent requests and server rejection stays visible", async ({
  page,
}) => {
  const server = await fixture(page, "tutor", (_, path) =>
    path === "/profile/photo" ? json(413, {}) : null,
  );
  await page.goto("/#/dashboard/profile");
  const input = page.getByLabel("JPEG, PNG or WebP photo (up to 3 MB)");
  await input.setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await page.getByRole("button", { name: "Upload photo", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("still JPEG");
  await input.setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(3 * 1024 * 1024 + 1),
  });
  await page.getByRole("button", { name: "Upload photo", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("no larger than 3 MB");
  expect(server.calls.filter((c) => c.path === "/profile/photo")).toHaveLength(
    0,
  );
  await input.setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Upload photo", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("file is too large");
  expect(server.calls.filter((c) => c.path === "/profile/photo")).toHaveLength(
    1,
  );
});

test("non-admin cannot request management APIs and backend permission errors remain errors", async ({
  page,
}) => {
  const server = await fixture(page, "student");
  await page.goto("/#/dashboard/users");
  await expect(
    page.getByRole("heading", { name: "Access unavailable" }),
  ).toBeVisible();
  expect(server.calls.filter((c) => c.path.startsWith("/admin/"))).toHaveLength(
    0,
  );
  server.role = "admin";
  await page.route("**/api/admin/users", (route) =>
    route.fulfill(json(403, {})),
  );
  await page.goto("/#/dashboard/users");
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("permission");
});

test("approval waits for server and reauthentication never automatically retries a mutation", async ({
  page,
}) => {
  let confirmed = false;
  const server = await fixture(page, "admin", (req, path, state) => {
    if (path === "/admin/users/2") {
      if (!confirmed) return json(428, { reauth: true });
      state.status = req.postDataJSON().status;
      return json(200, { message: "ok" });
    }
    if (path === "/auth/reauth") {
      confirmed = true;
      return json(200, { message: "ok" });
    }
  });
  await page.goto("/#/dashboard/users");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "One quick identity check.",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Current password").fill("SyntheticPassword123");
  await dialog
    .getByRole("button", { name: "Confirm identity", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(server.calls.filter((c) => c.path === "/admin/users/2")).toHaveLength(
    1,
  );
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("No pending tutor approvals.")).toBeVisible();
  expect(server.status).toBe("active");
  await page
    .getByLabel("Reason for suspend Synthetic Pending Tutor")
    .fill("Synthetic reason");
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reactivate", exact: true }),
  ).toBeVisible();
});

test("identity dialog supports Escape and restores focus", async ({ page }) => {
  await fixture(page, "admin");
  await page.goto("/#/dashboard/operations");
  const trigger = page.getByRole("button", {
    name: "Confirm identity for sensitive actions",
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("invitation rejects malformed acceptance and only reports verified-shaped creation", async ({
  page,
}) => {
  let accept = false;
  const server = await fixture(page, null, (_, path) =>
    path === "/auth/register"
      ? json(
          201,
          accept ? { account: { id: 20, role: "admin", verified: false } } : {},
        )
      : null,
  );
  await page.goto("/#/accept-invitation?invite=" + "d".repeat(64));
  for (const [label, value] of Object.entries({
    "Full name": "Synthetic Admin",
    Username: "synthetic_admin",
    "Invited email address": "admin@example.test",
    Password: "SyntheticPassword123",
    "Confirm password": "SyntheticPassword123",
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("unexpected response");
  accept = true;
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticPassword123");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("SyntheticPassword123");
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Invitation registration accepted",
  );
  await expect(page).not.toHaveURL(/invite=/);
  expect(
    JSON.parse(server.calls.find((c) => c.path === "/auth/register").body),
  ).not.toHaveProperty("confirm");
  await expect(
    page.getByRole("link", { name: "Log in", exact: true }),
  ).toBeVisible();
});

for (const role of ["student", "admin"])
  test(`OTP challenge requires code and independent session confirmation for ${role}`, async ({
    page,
  }) => {
    let signedIn = false,
      payload;
    await fixture(page, null, (req, path) => {
      if (path === "/auth/login")
        return json(200, { otpRequired: true, expiresIn: 300 });
      if (path === "/auth/otp") {
        payload = req.postDataJSON();
        signedIn = true;
        return json(200, {
          account: {
            id: 1,
            name: "Synthetic Member",
            email: "member@example.test",
            role,
          },
        });
      }
      if (path === "/auth/me" && signedIn)
        return json(200, {
          account: {
            id: 1,
            name: "Synthetic Member",
            email: "member@example.test",
            role,
          },
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
    await expect(page).toHaveURL(/#\/otp$/);
    await expect(page.getByLabel("Sign out")).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByLabel("Six-digit code").fill("123456");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(
      page.getByRole("heading", {
        name:
          role === "admin"
            ? "Your coordination workspace"
            : "Your learning workspace",
      }),
    ).toBeVisible();
    expect(payload).toEqual({ email: "member@example.test", code: "123456" });
  });

test("expired OTP and resend error/retry states never imply a session", async ({
  page,
}) => {
  let resend = false;
  await fixture(page, null, (_, path) =>
    path === "/auth/login"
      ? json(200, { otpRequired: true, expiresIn: 2 })
      : path === "/auth/resend-otp"
        ? json(
            resend ? 200 : 429,
            resend ? { message: "ok", expiresIn: 300 } : {},
          )
        : null,
  );
  await page.clock.install();
  await page.goto("/#/login");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("member@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticPassword123");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/#\/otp$/);
  await expect(
    page.getByRole("heading", { name: "One little security check." }),
  ).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("button", { name: "Verify and sign in" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Request another code", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Too many requests");
  resend = true;
  await page.clock.fastForward(61000);
  await page
    .getByRole("button", { name: "Request another code", exact: true })
    .click();
  await expect(
    page.getByText("Your code request was accepted;", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify and sign in" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Sign out")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Start from sign in." }),
  ).toBeVisible();
});

test("Turnstile expiry, retry, reset and unmount clear tokens with no real provider call", async ({
  page,
}) => {
  await fixture(page, null);
  await page.goto("/#/login");
  await page.evaluate(async () => {
    const reactModule = await import("/node_modules/.vite/deps/react.js");
    const React = reactModule.default || reactModule;
    const domModule =
      await import("/node_modules/.vite/deps/react-dom_client.js");
    const createRoot = domModule.createRoot || domModule.default.createRoot;
    const { default: Captcha } = await import("/src/components/Captcha.jsx");
    window.widgetTokens = [];
    window.widgetRemoved = 0;
    window.widgetOptions = null;
    window.turnstile = {
      render: (_, options) => {
        window.widgetOptions = options;
        return "synthetic-widget";
      },
      remove: () => window.widgetRemoved++,
    };
    const target = document.createElement("div");
    document.body.appendChild(target);
    window.widgetRoot = createRoot(target);
    window.drawWidget = (reset) =>
      window.widgetRoot.render(
        React.createElement(Captcha, {
          siteKey: "synthetic-public-key",
          action: "register",
          reset,
          onToken: (window.captureToken ||= (token) =>
            window.widgetTokens.push(token)),
        }),
      );
    window.drawWidget(0);
  });
  await expect
    .poll(() => page.evaluate(() => !!window.widgetOptions))
    .toBe(true);
  await page.evaluate(() => {
    window.widgetOptions.callback("synthetic-token");
    window.widgetOptions["expired-callback"]();
  });
  await expect(page.getByRole("alert")).toContainText("Security check expired");
  expect(await page.evaluate(() => window.widgetTokens.at(-1))).toBe("");
  await page.getByRole("button", { name: "Retry security check" }).click();
  await expect.poll(() => page.evaluate(() => window.widgetRemoved)).toBe(1);
  await page.evaluate(() => window.drawWidget(1));
  await expect.poll(() => page.evaluate(() => window.widgetRemoved)).toBe(2);
  await page.evaluate(() => window.widgetRoot.unmount());
  expect(await page.evaluate(() => window.widgetRemoved)).toBe(3);
});

test("administrator invitation and student enrolment submit only their intended fields", async ({
  page,
}) => {
  const server = await fixture(page, "admin", (_, path) =>
    ["/admin/invites", "/admin/students"].includes(path)
      ? json(201, { message: "ok" })
      : null,
  );
  await page.goto("/#/dashboard/operations");
  await page
    .getByLabel("New administrator email")
    .fill("NewAdmin@Example.test");
  await page
    .getByRole("button", { name: "Email invitation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "delivery is not confirmed",
  );
  expect(
    JSON.parse(server.calls.find((c) => c.path === "/admin/invites").body),
  ).toEqual({ email: "newadmin@example.test" });
  await page
    .getByRole("link", { name: "People & approvals", exact: true })
    .click();
  await page.getByText("Add a student account", { exact: true }).click();
  for (const [label, value] of Object.entries({
    "Student full name": "Synthetic Enrolment",
    "Student username": "synthetic_enrolment",
    "Student email": "Student@Example.test",
    "Student date of birth": "2000-01-01",
    "Student address": "Synthetic address",
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("combobox", { name: "Enrollment subject" })
    .selectOption("1");
  await page
    .getByRole("button", { name: "Create student account", exact: true })
    .click();
  const payload = JSON.parse(
    server.calls.find((c) => c.path === "/admin/students").body,
  );
  expect(payload.email).toBe("student@example.test");
  expect(payload.subjects).toEqual([1]);
  expect(payload).not.toHaveProperty("password");
  expect(payload).not.toHaveProperty("role");
});

test("wrong-account profile and unavailable profile API cannot expose an edit form", async ({
  page,
}) => {
  let result = json(200, {
    id: 99,
    name: "Wrong Account",
    role: "student",
    subjects: [1],
  });
  await fixture(page, "student", (_, path) =>
    path === "/profile" ? result : null,
  );
  await page.goto("/#/dashboard/profile");
  await expect(page.getByRole("alert")).toContainText("does not match");
  await expect(
    page.getByRole("button", { name: "Update profile" }),
  ).toHaveCount(0);
  result = json(404, {});
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("not connected");
});
