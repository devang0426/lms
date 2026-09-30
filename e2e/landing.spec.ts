import {
  expect,
  expectAccessible,
  expectNoHorizontalScroll,
  openLectureAsStudent,
  signInAs,
  test,
} from "./support";

/* The public landing page (feature 34), signed out:
   - "/" shows it; signed in, "/" and /welcome lead to the role's home.
   - A deep link goes to sign-in and comes back afterwards.
   - The course list shows catalog fields only; lessons stay private.
   - No database call per request (checked with DB_LOG=1 by hand; see the
     progress tracker), and LCP under 1.5 s.
   - robots.txt, the sitemap and the Open Graph tags.
   - axe and 390px.
   The suite runs with DEMO_MODE=true (it signs in through the picker),
   so "Try the demo" is expected here. */

const HEADLINE = /Lectures you can ask questions of/;

test("signed out, / shows the landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE })).toBeVisible();
  const hero = page.getByRole("region", { name: HEADLINE });
  await expect(hero.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  await expect(page.getByRole("heading", { level: 2, name: /Study tools that know your course/ })).toBeVisible();
  await expect(page.locator("#features > ul > li")).toHaveCount(5); // the illustrations hold lists of their own
  await expect(page.getByRole("heading", { level: 2, name: /Your institute enrolls you/ })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Privacy" })).toBeVisible();
  // Nothing below the catalog fields: no link into a course or lesson.
  await expect(page.locator('a[href^="/courses"]')).toHaveCount(0);
  await expectAccessible(page, "/welcome");
});

test("the course list shows published courses with catalog fields only", async ({ page }) => {
  await page.goto("/welcome");
  const courses = page.getByRole("region", { name: /Taught this term/ });
  await expect(courses).toBeVisible();
  const first = courses.getByRole("listitem").first();
  await expect(first.getByRole("heading", { level: 3 })).toBeVisible();
  await expect(first).toContainText(/\d+ lessons?/);
  await expect(courses.getByRole("link")).toHaveCount(0);
});

test("Try the demo opens the picker and signs in", async ({ page }) => {
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Try the demo" }).click();
  const dialog = page.getByRole("dialog", { name: "Try the demo" });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, "the Try the demo dialog");
  await dialog.getByRole("button", { name: "Continue as Student" }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Aanya/);
  // Signed in, the landing page sends the visitor home.
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/$/);
});

test("signed in as staff, /welcome leads to the teaching home", async ({ page }) => {
  await signInAs(page, "Admin");
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/instructor$/);
});

test("a signed-out deep link goes to sign-in and comes back", async ({ page, browser }) => {
  await signInAs(page, "Student");
  await openLectureAsStudent(page);
  const lessonUrl = page.url();
  const coursePath = new URL(lessonUrl).pathname.replace(/\/lessons\/.*/, "");

  // The lesson and assistant routes send a signed-out browser to sign-in.
  // (A browser, not a bare request: Clerk's development instance first
  // sends a cookieless request round its handshake.)
  const signedOut = await browser.newContext();
  const visitor = await signedOut.newPage();
  for (const path of [new URL(lessonUrl).pathname, `${coursePath}/assistant`]) {
    await visitor.goto(path);
    await expect(visitor, path).toHaveURL(/\/sign-in\?redirect_url=/);
  }
  await signedOut.close();

  await page.context().clearCookies();
  await page.goto(coursePath);
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=/);
  await page.getByRole("button", { name: "Continue as Student" }).click();
  await page.waitForURL((u) => u.pathname === coursePath, { timeout: 60_000 });
  await expect(page.getByRole("navigation", { name: "Course tools" })).toBeVisible();
});

test("robots.txt, the sitemap and the share tags", async ({ page, request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).toMatch(/Allow: \/welcome/);
  expect(robotsText).toMatch(/Disallow: \/$/m);
  expect(robotsText).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(urls.sort()).toEqual(["/privacy", "/terms", "/welcome"]);

  await page.goto("/welcome");
  const meta = (property: string) => page.locator(`meta[property="${property}"]`).getAttribute("content");
  expect(await meta("og:title")).toMatch(/Studyhall/);
  expect(await meta("og:description")).toBeTruthy();
  const image = await meta("og:image");
  expect(image).toMatch(/^https?:\/\/.+\/welcome\/opengraph-image/);
  const png = await request.get(new URL(image!).pathname + new URL(image!).search);
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/welcome$/);
});

test("privacy and terms pages", async ({ page }) => {
  for (const [path, heading] of [
    ["/privacy", /What we keep/],
    ["/terms", /Terms of use/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, path);
  }
});

test("LCP under 1.5 s", async ({ page }, testInfo) => {
  await page.goto("/welcome"); // warm the server's static cache
  await page.goto("about:blank");
  await page.goto("/welcome", { waitUntil: "load" });
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
  console.log(`Landing page LCP: ${Math.round(lcp)} ms (${testInfo.project.use.baseURL})`);
  expect(lcp).toBeGreaterThan(0);
  expect(lcp, "LCP under 1.5 s").toBeLessThan(1500);
});

test.describe("at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test("the landing, privacy and terms pages fit a phone", async ({ page }) => {
    for (const path of ["/welcome", "/privacy", "/terms"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
    await page.goto("/welcome");
    await expect(page.getByRole("region", { name: HEADLINE }).getByRole("link", { name: "Sign in" })).toBeInViewport();
    await expectAccessible(page, "/welcome at 390px");
  });
});
