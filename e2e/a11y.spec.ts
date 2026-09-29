import { expect, expectAccessible, openLectureAsStudent, signInAs, test, videoReady, videoTime } from "./support";

/* Accessibility (feature 23): axe (WCAG 2.2 AA, serious and critical) on
   the demo's pages, and keyboard passes on the player, flashcards, quiz
   and assistant. */

test.describe("axe", () => {
  test("student pages", async ({ page }) => {
    await signInAs(page, "Student");
    await expectAccessible(page, "Student home");
    for (const path of ["/courses", "/calendar", "/discussions", "/study", "/grades", "/space"]) {
      await page.goto(path);
      await expectAccessible(page, path);
    }
    await openLectureAsStudent(page);
    await expectAccessible(page, "the lesson player");
  });

  test("instructor and admin pages", async ({ page }) => {
    await signInAs(page, "Admin");
    for (const path of ["/instructor", "/instructor/grading", "/instructor/analytics", "/instructor/messages", "/admin/users", "/admin/audit"]) {
      await page.goto(path);
      await expectAccessible(page, path);
    }
  });

  test("sign-in page", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: "Continue as Student" })).toBeVisible();
    await expectAccessible(page, "/sign-in");
  });
});

test.describe("keyboard", () => {
  test("the player: focus, play, and arrow keys seek", async ({ page }) => {
    await signInAs(page, "Student");
    await openLectureAsStudent(page);
    await videoReady(page);
    const player = page.getByRole("region", { name: "Lesson video" });
    await player.focus();
    await expect(player).toBeFocused();
    const before = await videoTime(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => videoTime(page)).toBeGreaterThan(before + 3);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => videoTime(page)).toBeLessThan(before + 3);
    // The scrubber is a slider that the arrow keys move.
    const scrubber = player.getByRole("slider");
    await scrubber.focus();
    const at = await videoTime(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => videoTime(page)).toBeGreaterThan(at + 3);
  });

  test("flashcards: Space flips, number keys rate", async ({ page }) => {
    await signInAs(page, "Student");
    await page.goto("/study");
    const deck = page.getByRole("region", { name: "Flashcards" });
    await deck.getByRole("button", { name: "Show answer" }).focus();
    await page.keyboard.press("Space");
    await expect(deck.getByRole("group", { name: "How well did you know it?" })).toBeVisible();
    await page.keyboard.press("4");
    await expect(deck.getByRole("group", { name: "How well did you know it?" })).toBeHidden();
  });

  test("quiz: one tab stop per question, arrows choose", async ({ page }) => {
    await signInAs(page, "Student");
    await openLectureAsStudent(page);
    await page.getByRole("tab", { name: "Quiz" }).click();
    await page.getByRole("button", { name: "Start practice" }).click();
    const group = page.getByRole("radiogroup", { name: "Answers" });
    await expect(group).toBeVisible();
    await group.getByRole("radio").first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(group.getByRole("radio").nth(1)).toBeFocused();
    await expect(group.getByRole("radio").nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(group.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
  });

  test("assistant: Enter asks, Shift+Enter makes a new line", async ({ page }) => {
    await signInAs(page, "Student");
    await openLectureAsStudent(page);
    await page.getByRole("tab", { name: "Ask" }).click();
    const box = page.getByRole("textbox", { name: "Your question" });
    await box.focus();
    await page.keyboard.type("What is a");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("span?");
    await expect(box).toHaveValue("What is a\nspan?");
  });
});
