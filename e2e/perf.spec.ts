import { expect, flags, openLectureAsStudent, signInAs, test } from "./support";

/* Performance (feature 23): the lesson page's Largest Contentful Paint.
   The target (under 2.5 s) is for the deployed demo, where the app and
   Neon are in the same region; from a laptop far from the database it's
   recorded but only enforced with E2E_ASSERT_LCP=1. */
test("Lesson page LCP", async ({ page }, testInfo) => {
  await signInAs(page, "Student");
  await openLectureAsStudent(page);
  const url = page.url();
  await page.goto("about:blank");
  await page.goto(url, { waitUntil: "load" });
  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let last = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) last = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve(last), 3000);
      }),
  );
  testInfo.annotations.push({ type: "LCP (ms)", description: String(Math.round(lcp)) });
  console.log(`Lesson page LCP: ${Math.round(lcp)} ms (${testInfo.project.use.baseURL})`);
  expect(lcp).toBeGreaterThan(0);
  if (flags.assertLcp) expect(lcp, "LCP under 2.5 s").toBeLessThan(2500);
});
