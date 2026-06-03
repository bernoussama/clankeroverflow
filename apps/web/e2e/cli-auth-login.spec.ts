import { expect, test } from "@playwright/test";

test("preserves CLI auth callback through GitHub sign in", async ({ page }) => {
  const userCode = "ABCD-EFGH";
  const cliCallback = `/cli-auth?user_code=${encodeURIComponent(userCode)}`;
  let socialSignInBody: unknown;

  await page.route("**/auth/get-session**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(null),
    });
  });

  await page.route("**/auth/sign-in/social", async (route) => {
    socialSignInBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ url: "https://github.com/login/oauth/authorize?client_id=test" }),
    });
  });

  await page.goto(`/cli-auth?user_code=${encodeURIComponent(userCode)}`);

  await expect(page).toHaveURL(`/login?callbackURL=${encodeURIComponent(cliCallback)}`);
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();

  await page.getByRole("button", { name: "Continue with GitHub" }).click();

  await expect.poll(() => socialSignInBody).toBeTruthy();
  expect(socialSignInBody).toMatchObject({
    provider: "github",
    callbackURL: `http://localhost:3000${cliCallback}`,
    newUserCallbackURL: `http://localhost:3000${cliCallback}`,
    errorCallbackURL: `http://localhost:3000/login?callbackURL=${encodeURIComponent(cliCallback)}`,
  });
});

test("returns an authenticated user from login to the CLI authorization page", async ({ page }) => {
  const userCode = "WXYZ-1234";
  const cliCallback = `/cli-auth?user_code=${encodeURIComponent(userCode)}`;

  await page.route("**/auth/get-session**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "user_123",
          name: "Test User",
          email: "test@example.com",
          emailVerified: true,
          image: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        session: {
          id: "session_123",
          userId: "user_123",
          token: "session-token",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route("**/auth/device**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "pending" }),
    });
  });

  await page.goto(`/login?callbackURL=${encodeURIComponent(cliCallback)}`);

  await expect(page).toHaveURL(cliCallback);
  await expect(page.getByRole("heading", { name: "Authorize ClankerOverflow CLI" })).toBeVisible();
  await expect(page.getByText(userCode)).toBeVisible();
});
