import {
  builderRow,
  CLIP,
  expect,
  flags,
  LECTURE,
  NOTES_PDF,
  openCourseBuilder,
  openLectureAsStudent,
  seconds,
  signInAs,
  test,
  videoReady,
  videoTime,
} from "./support";

/* The demo script (context/project-overview.md), one test per step, in
   order, on the seeded demo data. Run `npm run demo:reset` first. */

const PROBLEM_SET = "Problem set 1: span and independence";

test.describe.serial("Demo script", () => {
  test("1 · The instructor dashboard shows courses, learners, the grading queue and questions", async ({ page }) => {
    await signInAs(page, "Admin");
    await expect(page).toHaveURL(/\/instructor$/);
    for (const label of ["Active learners", "Avg. completion", "Waiting for grading", "Unanswered questions"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /MATH 201/ }).first()).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "MATH 201 average completion" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Aanya Sharma.*Problem set 1/ }),
      "Aanya's problem set should be waiting in Needs grading: run `npm run demo:reset` first",
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Why is the span of two parallel vectors only a line\?/ })).toBeVisible();
  });

  test("2 · Uploading a lecture shows live progress through the stages", async ({ page }) => {
    test.skip(!flags.upload, "Set E2E_UPLOAD=1 (needs the Trigger.dev worker; costs a fraction of a cent).");
    test.setTimeout(flags.fullPipeline ? 20 * 60_000 : 5 * 60_000);
    await signInAs(page, "Admin");
    await openCourseBuilder(page);
    await builderRow(page, "Diagonalisation").getByRole("link").click();
    await page.getByLabel("Choose a video file").setInputFiles(CLIP);
    await expect(page.getByText(/Uploading… \d+%/)).toBeVisible();
    await expect(page.getByText(/Checking the file|Preparing it for streaming|Transcribing/).first()).toBeVisible({ timeout: 3 * 60_000 });
    if (flags.fullPipeline) {
      await expect(page.getByRole("link", { name: "Review and publish" }).first()).toBeVisible({ timeout: 18 * 60_000 });
    }
  });

  test("3 · The draft has timed chapters and notes; a flashcard edit saves; publish", async ({ page }) => {
    await signInAs(page, "Admin");
    await openCourseBuilder(page);
    await builderRow(page, LECTURE).getByRole("link").click();
    await page.getByRole("link", { name: "Review and publish" }).first().click();

    await page.getByRole("tab", { name: /Chapters/ }).click();
    await expect(page.getByRole("tabpanel").getByText(/\b\d{2}:\d{2}\b/).first()).toBeVisible();

    await page.getByRole("tab", { name: /Notes/ }).click();
    // Each section heading keeps its video time (editable here; a ▶ chip in the player).
    const timed = () =>
      page
        .getByRole("tabpanel")
        .getByRole("textbox", { name: "Video time for this heading" })
        .evaluateAll((els) => els.filter((e) => /^\d{2}:\d{2}$/.test((e as HTMLInputElement).value)).length);
    await expect.poll(timed, { message: "chapter headings with a video time" }).toBeGreaterThan(3);

    await page.getByRole("tab", { name: /Flashcards/ }).click();
    const panel = page.getByRole("tabpanel");
    const back = panel.getByLabel("Back", { exact: true }).first();
    const save = panel.getByRole("button", { name: "Save", exact: true });
    const original = (await back.inputValue()).replace(/ \(checked\)$/, "");
    // Save waits for the page to refresh (Save disappears) before the next
    // edit: the refresh remounts the editor and would drop an edit made meanwhile.
    const saveAs = async (text: string) => {
      await back.fill(text);
      await save.first().click();
      await expect(save).toHaveCount(0);
      await expect(back).toHaveValue(text);
    };
    try {
      await saveAs(`${original} (checked)`);
    } finally {
      // Put it back, so every run starts from the same content.
      await saveAs(original);
    }

    const publish = page.getByRole("button", { name: /^(Publish lesson|Publish changes|Published)$/ });
    await expect(publish).toBeVisible();
    if (await publish.isEnabled()) {
      await publish.click();
      await expect(page.getByRole("button", { name: "Published" })).toBeVisible();
    }
  });

  test("4 · Student home shows Continue learning, Coming up and the courses", async ({ page }) => {
    await signInAs(page, "Student");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Continue learning")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Coming up" })).toBeVisible();
    await expect(page.getByRole("link", { name: PROBLEM_SET }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your courses" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Linear Algebra/ }).first()).toBeVisible();
  });

  test("5 · The lesson player: captions on, chapters and transcript seek, a timed note", async ({ page }) => {
    await signInAs(page, "Student");
    await openLectureAsStudent(page);
    await videoReady(page);
    await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.textTracks[0]?.mode)).toBe("showing");

    await page.getByRole("tab", { name: /Chapters/ }).click();
    const chapter = page.getByRole("tabpanel").getByRole("button").nth(2);
    const chapterAt = seconds((await chapter.textContent())?.match(/\d{1,2}:\d{2}(:\d{2})?/)?.[0] ?? "0:00");
    await chapter.click();
    await expect.poll(() => videoTime(page)).toBeGreaterThanOrEqual(chapterAt - 1);

    await page.getByRole("tab", { name: "Transcript" }).click();
    const line = page.getByRole("list", { name: "Transcript" }).getByRole("button").nth(40);
    const lineAt = seconds((await line.locator("span").first().textContent()) ?? "0:00");
    await line.click();
    await expect.poll(async () => Math.abs((await videoTime(page)) - lineAt)).toBeLessThan(2);

    await page.getByRole("tab", { name: /^(My notes|Notes)$/ }).click();
    const note = page.getByRole("textbox", { name: /Note at/ });
    await note.fill(`Worth re-watching (e2e ${Date.now()})`);
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByRole("list", { name: "Your notes" }).getByRole("button", { name: /Play from \d{2}:\d{2}/ }).first()).toBeVisible();
  });

  test("6 · The assistant explains with a timed citation, and refuses off-syllabus", async ({ page }) => {
    test.setTimeout(4 * 60_000);
    await signInAs(page, "Student");
    await openLectureAsStudent(page);
    await videoReady(page);
    await page.getByRole("tab", { name: "Ask" }).click();

    const box = page.getByRole("textbox", { name: "Your question" });
    await box.fill("Explain what a linear combination is");
    await box.press("Enter");
    const sources = page.getByRole("region", { name: "Course assistant" }).locator('[aria-label="Sources"]').last();
    await expect(sources, "an answer with at least one citation chip").toBeVisible({ timeout: 150_000 });
    const chip = sources.getByRole("button").first();
    const chipAt = seconds((await chip.textContent())?.match(/\d{1,2}:\d{2}(:\d{2})?/)?.[0] ?? "0:00");
    await chip.click();
    await expect.poll(async () => Math.abs((await videoTime(page)) - chipAt), { timeout: 10_000 }).toBeLessThan(3);

    await box.fill("What's the capital of France?");
    await box.press("Enter");
    await expect(page.getByText(/That topic isn.t part of/).last()).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Ask your instructor" }).last().click();
    const dialog = page.getByRole("dialog", { name: "Ask your instructor" });
    await expect(dialog.getByLabel("Question")).toHaveValue("What's the capital of France?");
    await dialog.getByRole("button", { name: "Post question" }).click();
    await expect(page.getByRole("dialog", { name: "Question posted" })).toBeVisible();
  });

  test("7 · Study: flip and rate a card, take a practice quiz, the podcast", async ({ page }) => {
    test.setTimeout(flags.podcast ? 6 * 60_000 : 2 * 60_000);
    await signInAs(page, "Student");
    await openLectureAsStudent(page);

    await page.getByRole("tab", { name: /Flashcards/ }).click();
    const deck = page.getByRole("region", { name: "Flashcards" });
    await deck.getByRole("button", { name: "Show answer" }).focus();
    await page.keyboard.press("Space");
    await expect(deck.getByRole("group", { name: "How well did you know it?" })).toBeVisible();
    await page.keyboard.press("3");
    await expect(deck.getByRole("button", { name: "Show answer" }).or(deck.getByText(/caught up|done for now|All done/i)).first()).toBeVisible();

    await page.getByRole("tab", { name: "Quiz" }).click();
    await page.getByRole("button", { name: "Start practice" }).click();
    const runner = page.getByRole("region", { name: /^(Basic|Intermediate|Exam) practice$/ });
    await expect(runner).toBeVisible();
    for (let i = 0; i < 12; i++) {
      const radios = runner.getByRole("radio");
      if (await radios.count()) await radios.first().click();
      else await runner.getByRole("textbox").fill("span");
      await runner.getByRole("button", { name: "Check" }).click();
      const finish = runner.getByRole("button", { name: "Finish" });
      if (await finish.isVisible()) {
        await finish.click();
        break;
      }
      await runner.getByRole("button", { name: "Next" }).click();
    }
    const results = page.getByRole("region", { name: /practice results$/ });
    await expect(results.getByText(/\d+ of \d+ correct/)).toBeVisible();
    await results.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("region", { name: "Mastery by topic" })).toBeVisible();

    await page.getByRole("tab", { name: "Podcast" }).click();
    const player = page.locator("audio").first();
    const generate = page.getByRole("button", { name: "Generate podcast (short)" });
    await expect(player.or(generate).first()).toBeVisible();
    if (flags.podcast && (await generate.isVisible())) {
      await generate.click();
      await expect(player).toBeVisible({ timeout: 5 * 60_000 });
    }
  });

  test("8 · A student's own PDF becomes a private note they can study and ask about", async ({ page }) => {
    test.skip(!flags.upload, "Set E2E_UPLOAD=1 (needs the Trigger.dev worker; costs a fraction of a cent).");
    test.setTimeout(flags.fullPipeline ? 15 * 60_000 : 3 * 60_000);
    await signInAs(page, "Student");
    await page.goto("/space");
    await page.getByRole("button", { name: "New note" }).click();
    await page.getByLabel("Choose a file").setInputFiles(NOTES_PDF);
    await page.waitForURL(/\/space\/[0-9a-f-]{36}$/, { timeout: 2 * 60_000 });
    await expect(page.getByText(/Reading the document|Writing notes|Writing flashcards|Ready/).first()).toBeVisible({ timeout: 2 * 60_000 });
    if (flags.fullPipeline) {
      await expect(page.getByRole("tab", { name: /Flashcards/ })).toBeVisible({ timeout: 12 * 60_000 });
      await page.getByRole("tab", { name: "Chat" }).click();
      const box = page.getByRole("textbox").last();
      await box.fill("How do I test whether vectors are linearly independent?");
      await box.press("Enter");
      await expect(page.getByText(/p\. 1/).first()).toBeVisible({ timeout: 150_000 });
    }
  });

  test("9 · The instructor grades the submission; the student sees score, feedback and a notification", async ({ browser }) => {
    const staff = await (await browser.newContext()).newPage();
    await signInAs(staff, "Admin");
    await staff.goto("/instructor/grading");
    await staff.getByRole("link", { name: /Aanya Sharma/ }).filter({ hasText: "Problem set 1" }).first().click();
    await staff.getByLabel("Score").fill("8.5");
    await staff.getByLabel("Feedback").fill("Clear working on all three. For problem 2, say why the two vectors are parallel.");
    await staff.getByRole("button", { name: "Save and next" }).click();
    await expect(staff.getByText(/returned|Nothing to grade|Needs grading/i).first()).toBeVisible();

    const student = await (await browser.newContext()).newPage();
    await signInAs(student, "Student");
    await expect(student.getByRole("button", { name: /Notifications, \d+ unread/ }).first()).toBeVisible();
    await student.goto("/grades");
    const row = student.getByRole("listitem").filter({ hasText: PROBLEM_SET });
    await expect(row.getByText("8.5")).toBeVisible();
    await row.getByRole("link", { name: PROBLEM_SET }).click();
    await expect(student.getByText("say why the two vectors are parallel")).toBeVisible();
  });
});
