import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import path from "node:path";

/* Shared helpers for the end-to-end tests (feature 23). */

export const FIXTURES = path.join(process.cwd(), "e2e", ".cache");
export const CLIP = path.join(FIXTURES, "clip.mp4");
export const NOTES_PDF = path.join(FIXTURES, "revision-notes.pdf");

export const flags = {
  /* Steps that upload (2 and 8): need the Trigger.dev worker, and spend a
     little on Whisper and the models. */
  upload: process.env.E2E_UPLOAD === "1",
  /* Also wait for the whole pipeline to finish after an upload. */
  fullPipeline: process.env.E2E_FULL_PIPELINE === "1",
  /* Press "Generate podcast" when no episode exists yet (costs ~1¢). */
  podcast: process.env.E2E_PODCAST === "1",
  /* Fail when the lesson page's LCP is over 2.5 s (meant for the deployment). */
  assertLcp: process.env.E2E_ASSERT_LCP === "1",
};

/* Every test fails on a CSP violation, an uncaught page error or a
   hydration mismatch: those are bugs even when the page looks right. */
export const test = base.extend<{ watchConsole: void }>({
  watchConsole: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (m) => {
        const text = m.text();
        if (m.type() === "error" && /Content Security Policy|Refused to (load|connect|execute|frame|apply)|Hydration failed|hydration mismatch/i.test(text)) {
          problems.push(text);
        }
      });
      page.on("pageerror", (e) => problems.push(`Uncaught: ${e.message}`));
      await use();
      expect(problems, "CSP violations, uncaught errors or hydration mismatches").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/* One click on the sign-in page's demo picker (a Clerk sign-in ticket). */
export async function signInAs(page: Page, who: "Admin" | "Student") {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: `Continue as ${who}` }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000 });
}

/* The lesson player's <video>: its current time, in seconds. */
export async function videoTime(page: Page): Promise<number> {
  return page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);
}

/* Wait until the video has loaded enough to seek. */
export async function videoReady(page: Page) {
  await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
}

/* "12:48" or "1:02:03" → seconds. */
export function seconds(label: string): number {
  const parts = label.trim().split(":").map(Number);
  return parts.reduce((total, p) => total * 60 + p, 0);
}

/* No sideways scrolling at this width. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
}

/* axe (WCAG 2.2 A and AA): no serious or critical violations. */
export async function expectAccessible(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, `axe on ${context}`).toEqual([]);
}

/* The MATH 201 course builder, from the instructor dashboard. */
export async function openCourseBuilder(page: Page) {
  await page.goto("/instructor/courses");
  await page.getByRole("link", { name: /MATH 201/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/* A lesson's row in the builder, by its title. */
export function builderRow(page: Page, title: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Rename ${title}`, exact: true }) });
}

/* The seeded lecture, in the student's player. */
export const LECTURE = "Linear combinations and span";

export async function openLectureAsStudent(page: Page) {
  await page.goto("/courses");
  await page.getByRole("link", { name: /Linear Algebra/ }).first().click();
  // Modules are collapsed <details>; open them so every lesson link shows.
  await page.locator("details").evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
  await page.getByRole("link", { name: LECTURE, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: LECTURE })).toBeVisible();
}
