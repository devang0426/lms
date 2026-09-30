import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { builderRow, CLIP, expect, expectAccessible, flags, LECTURE, openCourseBuilder, signInAs, test } from "./support";

/* The course-building flow (feature 27). Each test works in a module of
   its own, added to MATH 201 and deleted in a `finally`, so the demo data
   is left as it was. Without E2E_UPLOAD the upload test sends no bytes:
   the requests to Blob are held, so the upload stays at "Uploading… 0%". */

const toBlob = (url: URL) => url.hostname === "vercel.com" && url.pathname.startsWith("/api/blob");

async function addModule(page: Page, title: string): Promise<Locator> {
  await page.getByRole("textbox", { name: "New module title" }).fill(title);
  await page.getByRole("button", { name: "Add module" }).click();
  const region = page.getByRole("region", { name: title, exact: true });
  await expect(region).toBeVisible();
  return region;
}

async function deleteModule(page: Page, title: string) {
  await openCourseBuilder(page);
  const region = page.getByRole("region", { name: title, exact: true });
  if ((await region.count()) === 0) return;
  await region.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(region).toHaveCount(0);
}

test.describe.serial("Course building", () => {
  test("a lecture is uploading within 4 clicks of the course page, from a .mp4 with no browser type", async ({ page }) => {
    test.setTimeout(flags.upload ? 5 * 60_000 : 120_000);
    const MODULE = `E2E upload ${Date.now()}`;
    await signInAs(page, "Admin");
    await openCourseBuilder(page);
    const section = await addModule(page, MODULE);
    // Leaving mid-upload asks first (the upload would stop); the clean-up says yes.
    page.on("dialog", (d) => void d.accept());
    if (!flags.upload) await page.route(toBlob, () => {}); // never answered

    let clicks = 0;
    const click = async (target: Locator) => {
      clicks += 1;
      await target.click();
    };
    try {
      // The module is empty and its header has the upload button.
      await expect(section.getByText(/No lessons in this module yet/)).toBeVisible();
      await click(section.getByRole("button", { name: /^Upload lecture/ }));
      const dialog = page.getByRole("dialog", { name: "Upload a lecture" });
      await expect(dialog).toBeVisible();
      await expectAccessible(page, "the Upload lecture dialog");

      const chooser = page.waitForEvent("filechooser");
      await click(dialog.getByRole("button", { name: "Choose a video", exact: true }));
      // An empty type, as some browsers report for .mp4 (V6).
      const buffer = flags.upload ? readFileSync(CLIP) : Buffer.alloc(256 * 1024);
      await (await chooser).setFiles({ name: "Week_4 - Diagonalisation recap.mp4", mimeType: "", buffer });
      await expect(dialog.getByRole("textbox", { name: "Lesson title" })).toHaveValue("Week 4 - Diagonalisation recap");

      await click(dialog.getByRole("button", { name: "Upload", exact: true }));
      await expect(dialog.getByText(/Uploading… \d+%/)).toBeVisible();
      expect(clicks, "clicks from the course page to a running upload").toBeLessThanOrEqual(4);

      if (flags.upload) {
        // Once processing has started, the new lesson's editor opens with its progress.
        await page.waitForURL(/\/instructor\/courses\/[^/]+\/lessons\/[^/]+$/, { timeout: 3 * 60_000 });
        await expect(page.getByRole("heading", { level: 1, name: "Week 4 - Diagonalisation recap" })).toBeVisible();
        await expect(page.getByText("Processing the video").first()).toBeVisible();
      }
    } finally {
      await page.unroute(toBlob).catch(() => {});
      await deleteModule(page, MODULE);
    }
  });

  test("a new lesson opens its editor; Quiz isn't offered; only an empty lesson changes type", async ({ page }) => {
    const MODULE = `E2E lessons ${Date.now()}`;
    const LESSON = "E2E reading lesson";
    await signInAs(page, "Admin");
    await openCourseBuilder(page);
    await expectAccessible(page, "the course builder");
    const section = await addModule(page, MODULE);
    try {
      const type = section.getByRole("combobox", { name: "Type" });
      await expect(type.locator("option")).toHaveText(["Video", "Reading", "Assignment"]);
      await expect(section.getByText(/MP4 \(H\.264 video, AAC audio\), up to 2 GB and 60 minutes/)).toBeVisible();

      await section.getByRole("textbox", { name: "New lesson title" }).fill(LESSON);
      await type.selectOption("reading");
      await section.getByRole("button", { name: "Add lesson" }).click();
      await page.waitForURL(/\/instructor\/courses\/[^/]+\/lessons\/[^/]+$/);
      await expect(page.getByRole("heading", { level: 1, name: LESSON })).toBeVisible();
      await expect(page.getByText("For a lecture video, create a Video lesson.")).toBeVisible();

      // Change type works while the lesson is empty…
      await openCourseBuilder(page);
      const row = builderRow(page, LESSON);
      await row.getByRole("button", { name: `More actions for ${LESSON}` }).click();
      await page.getByRole("menuitem", { name: "Change type…" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: "New type" }).selectOption("assignment");
      await dialog.getByRole("button", { name: "Change type" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(row.getByText("Assignment", { exact: true })).toBeVisible();

      // …and is refused on one with content (the seeded lecture has a video).
      const lecture = builderRow(page, LECTURE);
      await lecture.getByRole("button", { name: `More actions for ${LECTURE}` }).click();
      await page.getByRole("menuitem", { name: "Change type…" }).click();
      await expect(page.getByRole("dialog").getByText(/Only an empty lesson can change type/)).toBeVisible();
      await expect(page.getByRole("dialog").getByRole("button", { name: "Change type" })).toHaveCount(0);
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).first().click();

      // A video lesson without a video can't be published (V4).
      const empty = builderRow(page, "Diagonalisation");
      await expect(empty.getByRole("link", { name: "Upload video" })).toBeVisible();
      await empty.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(page.getByRole("dialog").getByText("Upload and process the video first.")).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).first().click();
    } finally {
      await deleteModule(page, MODULE);
    }
  });

  test("the review screen has a breadcrumb back to the course", async ({ page }) => {
    await signInAs(page, "Admin");
    await openCourseBuilder(page);
    await builderRow(page, LECTURE).getByRole("link", { name: "Open" }).click();
    await page.getByRole("link", { name: "Review and publish" }).click();
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByRole("listitem")).toHaveText(["MATH 201", "Vectors and spaces", LECTURE, "Review"]);
    await expectAccessible(page, "the review screen");
    await crumbs.getByRole("link", { name: "MATH 201" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Linear Algebra" })).toBeVisible();
  });
});
