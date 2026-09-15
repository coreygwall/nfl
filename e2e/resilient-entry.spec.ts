import { expect, test } from "@playwright/test";

const WEEK_TWO = "2026-09-15T12:00:00Z";

test("last week's shared link remains a useful pool doorway when bootstrap fails", async ({ page }) => {
  await page.route("**/api/bootstrap*", (route) => route.abort("failed"));

  await page.goto(`/p/high-five/?now=${WEEK_TWO}`);

  await expect(page.getByRole("heading", { name: "High Five" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Make Week 2 picks" })).toHaveAttribute("href", "/p/high-five/week/2");
  await expect(page.getByRole("link", { name: "Week 1 winner & results" })).toHaveAttribute("href", "/p/high-five/board/week/1");
  await expect(page.getByRole("link", { name: "Season standings" })).toHaveAttribute("href", "/p/high-five/board/season");

  await page.getByRole("link", { name: "Week 1 winner & results" }).click();
  await expect(page).toHaveURL(/\/p\/high-five\/board\/week\/1$/);
  await expect(page.getByText(/Most points wins Week 1/)).toBeVisible();
});

test("a returning device can reach its picks while bootstrap is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nflpool.players.v1", JSON.stringify({
      activeId: "returning-player",
      people: [{ id: "returning-player", name: "Returning player" }],
    }));
  });
  await page.route("**/api/bootstrap*", (route) => route.abort("failed"));

  await page.goto(`/p/high-five/?now=${WEEK_TWO}`);
  await page.getByRole("link", { name: "Make Week 2 picks" }).click();

  await expect(page).toHaveURL(/\/p\/high-five\/week\/2$/);
  await expect(page.getByRole("heading", { name: "Pick 5 winners" })).toBeVisible();
});
