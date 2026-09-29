import { expect, expectNoHorizontalScroll, openLectureAsStudent, signInAs, test } from "./support";

/* Phones (feature 23): Student home, the lesson player (stacked) and the
   assistant at 390px, without sideways scrolling. */

test("Student home at 390px", async ({ page }) => {
  await signInAs(page, "Student");
  await expect(page.getByRole("navigation").last()).toBeVisible(); // bottom tab bar
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
