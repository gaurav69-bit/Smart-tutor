import { test, expect } from "@playwright/test";

test("required design fonts load locally without a Google Fonts connection", async ({ page }) => {
  const external = [];
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => {
    external.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await page.goto("/#/login");
  const fonts = await page.evaluate(async () => {
    const loaded = await Promise.all([
      document.fonts.load('400 16px "DM Sans"'),
      document.fonts.load('700 16px "Manrope"'),
    ]);
    return loaded.flat().map(font => ({ family: font.family.replaceAll('"', ''), status: font.status }));
  });
  expect(fonts).toEqual(expect.arrayContaining([
    { family: "DM Sans", status: "loaded" },
    { family: "Manrope", status: "loaded" },
  ]));
  expect(external).toEqual([]);
  await expect(page.locator("h1")).toHaveCSS("color", "rgb(35, 62, 56)");
});
