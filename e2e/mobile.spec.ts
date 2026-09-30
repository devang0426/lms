import { expect, expectAccessible, expectNoHorizontalScroll, openLectureAsStudent, signInAs, test } from "./support";

/* Phones (feature 23): Student home, the lesson player (stacked) and the
   assistant at 390px, without sideways scrolling. Feature 28: every student
   page is two taps or fewer from anywhere (the tab bar, or More and then
   the page), and the lesson player's header has the bell and the account
   menu. */

test("Student home at 390px", async ({ page }) => {
  await signInAs(page, "Student");
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeVisible(); // bottom tab bar
  await expect(page.getByRole("link", { name: /Resume|Start/ }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("The lesson player stacks at 390px", async ({ page }) => {
  await signInAs(page, "Student");
  await openLectureAsStudent(page);
  const video = await page.locator("video").boundingBox();
  const contents = await page.getByRole("heading", { name: /Course contents|Contents/ }).first().boundingBox().catch(() => null);
  expect(video?.width ?? 0).toBeGreaterThan(300);
  if (contents && video) expect(contents.y, "course contents below the video").toBeGreaterThan(video.y);
  await expectNoHorizontalScroll(page);
});

test("The assistant at 390px", async ({ page }) => {
  await signInAs(page, "Student");
  await openLectureAsStudent(page);
  await page.getByRole("tab", { name: "Ask" }).click();
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto(page.url().replace(/\/lessons\/.*/, "/assistant"));
  await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("Every student page is two taps or fewer at 390px", async ({ page }) => {
  await signInAs(page, "Student");
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  // One tap: the tabs.
  for (const [name, path] of [
    ["My courses", "/courses"],
    ["Flashcards", "/study"],
    ["Home", "/"],
  ] as const) {
    await tabs.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : `${path}$`}`));
  }
  // Two taps: More, then the page.
  for (const [name, path, heading] of [
    ["Explore", "/catalog", /Find your next/],
    ["Calendar", "/calendar", /\d{4}/],
    ["Discussions", "/discussions", /Questions and answers/],
    ["Grades", "/grades", /Your grades/],
    ["My space", "/space", /My space/],
    ["Profile", "/profile", /Aanya/],
  ] as const) {
    await tabs.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(heading);
    await expectNoHorizontalScroll(page);
  }
  // More is marked while one of its pages is open.
  await expect(tabs.getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("button", { name: "More" }).click();
  await expectAccessible(page, "the More sheet");
});

test("The lesson player's header has the bell and the account menu at 390px", async ({ page }) => {
  await signInAs(page, "Student");
  await openLectureAsStudent(page);
  const header = page.getByRole("banner").first();
  await expect(header.getByRole("button", { name: /Notifications/ })).toBeVisible();
  await header.getByRole("button", { name: /Account menu for/ }).click();
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
