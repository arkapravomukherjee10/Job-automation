import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const email = "arkapravo.mukherjee10@gmail.com";
const fixture = {
  preferences: {
    roles: ["Product Manager"],
    locations: ["Bengaluru"],
    skills: ["SQL"],
    blocked_companies: [],
    threshold: 90,
    resume_consent: false,
  },
  resumes: [],
  activity: [],
  jobs: [
    {
      id: "job-1",
      title: "Product Manager",
      company: "Example Company",
      location: "Bengaluru",
      description: "Build product strategy and SQL analytics.",
      url: "https://example.com/job",
      salary: "₹20–30 LPA",
      score: 100,
      stage: "Ready to Apply",
      reason: "Your role, location, and skills match.",
      filtered: false,
    },
    {
      id: "job-2",
      title: "Senior Product Manager",
      company: "Other Example",
      location: "Bengaluru",
      description: "Work on product analytics and SQL.",
      url: "https://example.com/job-2",
      salary: "",
      score: 90,
      stage: "Interview",
      reason: "Interview invitation recorded.",
      filtered: false,
      applied_at: "2026-10-20T10:00:00Z",
    },
  ],
};
async function setup(
  page: Page,
  options: {
    signedIn?: boolean;
    allowed?: boolean;
    admin?: boolean;
    failed?: boolean;
    empty?: boolean;
  } = {},
) {
  const {
    signedIn = true,
    allowed = true,
    admin = true,
    failed = false,
    empty = false,
  } = options;
  const state = structuredClone(fixture);
  if (empty) state.jobs = [];
  if (signedIn)
    await page.addInitScript(
      ({ email }) => {
        if (sessionStorage.getItem("ux-seeded")) return;
        sessionStorage.setItem("ux-seeded", "true");
        const encode = (value: unknown) =>
          btoa(JSON.stringify(value))
            .replace(/=/g, "")
            .replace(/\+/g, "-")
            .replace(/\//g, "_");
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const access_token =
          encode({ alg: "RS256", typ: "JWT" }) +
          "." +
          encode({ sub: "test-user", email, exp, aud: "authenticated" }) +
          ".dGVzdA";
        localStorage.setItem(
          "sb-ux-tests-auth-token",
          JSON.stringify({
            access_token,
            refresh_token: "fake-refresh",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: exp,
            user: {
              id: "test-user",
              email,
              aud: "authenticated",
              role: "authenticated",
              app_metadata: { provider: "email" },
              user_metadata: {},
              created_at: new Date().toISOString(),
            },
          }),
        );
      },
      { email },
    );
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({
      status: route.request().url().includes("/logout") ? 204 : 200,
      json: route.request().url().includes("/logout") ? undefined : {},
    }),
  );
  await page.route("https://api.ux-tests.invalid/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (failed) return route.abort("failed");
    const headers = { "access-control-allow-origin": "*" };
    if (path === "/api/access")
      return route.fulfill({
        headers,
        json: { email, allowed, is_admin: admin },
      });
    if (path === "/api/state") return route.fulfill({ headers, json: state });
    if (path === "/api/preferences") {
      Object.assign(state.preferences, route.request().postDataJSON());
      return route.fulfill({ headers, json: state.preferences });
    }
    if (path === "/api/admin/users")
      return route.fulfill({
        headers,
        json: {
          invitations: [
            {
              email: "tester@example.com",
              active: true,
              signed_up: false,
              invited_at: "2026-10-30T10:00:00Z",
            },
          ],
          members: [
            {
              email,
              allowed: true,
              is_admin: true,
              signed_up_at: "2026-10-30T10:00:00Z",
              last_seen_at: "2026-10-31T10:00:00Z",
            },
          ],
        },
      });
    if (path.startsWith("/api/jobs/") && route.request().method() === "PATCH") {
      const job = state.jobs.find((j) => j.id === path.split("/").at(-1))!;
      Object.assign(job, route.request().postDataJSON());
      if (job.stage === "Applied (Manual)")
        job.applied_at = new Date().toISOString();
      return route.fulfill({ headers, json: job });
    }
    if (path === "/api/data" && route.request().method() === "DELETE") {
      state.jobs = [];
      return route.fulfill({ status: 204, headers });
    }
    return route.fulfill({ headers, json: {} });
  });
  await page.goto("/");
  if (signedIn && allowed && !failed)
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .waitFor();
  return state;
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
      "best-practice",
    ])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
}

for (const width of [360, 768, 1440]) {
  test(`core screens and dialogs meet automated accessibility checks at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page);
    for (const name of ["Home", "To do", "Jobs", "Settings", "Admin"]) {
      await page
        .getByRole("navigation")
        .getByRole("button", {
          name: name === "To do" ? /^To do/ : name,
          exact: name !== "To do",
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
      ).toBeInViewport();
      await accessible(page);
      if (name === "Home")
        await page.screenshot({
          path: `/tmp/job-radar-ux-${width}.png`,
          fullPage: true,
        });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
    }
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Jobs", exact: true })
      .click();
    const add = page
      .getByRole("button", { name: "Add a job", exact: true })
      .first();
    await add.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("Job title", { exact: true })).toBeFocused();
    await accessible(page);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(
        await page
          .getByRole("dialog")
          .evaluate((el) => el.contains(document.activeElement)),
      ).toBeTruthy();
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(add).toBeFocused();
    await page
      .getByRole("button")
      .filter({ hasText: "Example Company" })
      .click();
    await accessible(page);
    await page.keyboard.press("Escape");
  });
}

test("sign out removes session and private UI, including on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await setup(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("sb-ux-tests-auth-token")),
  ).toBeNull();
  await page.reload();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("network failure retains a usable sign out and clear error", async ({
  page,
}) => {
  await setup(page, { failed: true });
  await expect(page.getByRole("alert")).toContainText("We couldn’t connect");
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await accessible(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link" }),
  ).toBeVisible();
});

test("login and waiting-for-invitation screens are accessible", async ({
  page,
}) => {
  await setup(page, { signedIn: false });
  await accessible(page);
  const waiting = await page.context().newPage();
  await setup(waiting, { allowed: false, admin: false });
  await expect(
    waiting.getByRole("heading", { name: "Your email is verified." }),
  ).toBeVisible();
  await accessible(waiting);
  await expect(
    waiting.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
});

test("stage/search filters recover, application confirmation cannot repeat", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Jobs", exact: true })
    .click();
  await page.getByLabel("Filter application stage").selectOption("Interview");
  await expect(page.getByText("Other Example", { exact: false })).toBeVisible();
  await expect(page.getByText("Example Company", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Search jobs").fill("nothing matches");
  await expect(
    page.getByRole("heading", { name: "No jobs match these filters." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button").filter({ hasText: "Example Company" }).click();
  await page
    .getByRole("button", { name: "Mark as applied", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Already applied", exact: true }),
  ).toBeDisabled();
  await accessible(page);
});

test("destructive actions require a cancellable keyboard-accessible confirmation", async ({
  page,
}) => {
  let deletes = 0;
  page.on("request", (r) => {
    if (r.method() === "DELETE") deletes++;
  });
  await setup(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete workspace data", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await accessible(page);
  await page.keyboard.press("Escape");
  expect(deletes).toBe(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Admin", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove access", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await accessible(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("resume review controls, empty views, and signup email feedback are accessible", async ({
  page,
}) => {
  await setup(page, { empty: true });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page.locator("input[type=file]")).toBeDisabled();
  await page
    .getByRole("button", { name: "Review and edit resume", exact: true })
    .click();
  await page.getByLabel("Employer", { exact: true }).fill("Example Labs");
  await page
    .getByLabel("Experience bullet 1", { exact: true })
    .fill("Supported 5 launches.");
  await accessible(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Jobs", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No opportunities here yet." }),
  ).toBeVisible();
  await accessible(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const login = page;
  await login
    .getByLabel("Email address", { exact: true })
    .fill("owner@example.com");
  await login
    .getByRole("button", { name: "Email me a sign-in link", exact: true })
    .click();
  await expect(login.getByRole("status")).toContainText("Check your email");
  await expect(login.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  await accessible(login);
});
