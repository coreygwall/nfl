import { expect, test } from '@playwright/test';

test('commissioner broadcasts appear on home, can be liked, edited, hidden and deleted', async ({ page, browser }) => {
  await page.goto('/p/high-five/welcome?now=2026-09-09T12:00:00Z');
  await page.getByPlaceholder('Your name').fill(`Feed Host ${Date.now().toString(36)}`);
  await page.getByRole('button', { name: "Let's go" }).click();
  await page.waitForURL(/\/week\/1$/);
  await page.goto('/p/high-five/commissioner');
  await page.getByRole('button', { name: /I own this pool/ }).click();
  await page.getByLabel('Owner PIN').fill('1234');
  await page.getByRole('button', { name: 'Take the keys' }).click();
  const feed = page.getByRole('region', { name: 'Announcements' });
  await expect(feed.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await feed.getByRole('switch').click();
  await feed.getByLabel('Message to the pool').fill('Welcome! Good luck this week.');
  await feed.getByRole('button', { name: 'Post announcement' }).click();
  await expect(feed.getByText('Welcome! Good luck this week.')).toBeVisible();
  await page.goto('/p/high-five/');
  const homeFeed = page.getByRole('region', { name: 'Announcements' });
  await expect(homeFeed.getByText('Welcome! Good luck this week.')).toBeVisible();
  const homeOrder = await page.locator('main').evaluate(() => {
    const season = document.getElementById('season-preview-heading');
    const announcements = document.getElementById('announcements');
    return Boolean(season && announcements && (season.compareDocumentPosition(announcements) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(homeOrder).toBe(true);
  await homeFeed.getByRole('link', { name: 'View all' }).click();
  await expect(page).toHaveURL(/\/announcements$/);
  await page.getByRole('button', { name: /^Like announcement/ }).click();
  await expect(page.getByRole('button', { name: /^Unlike announcement/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Edit announcement', { exact: true }).fill('Updated: Good luck everyone!');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Updated: Good luck everyone!', { exact: true })).toBeVisible();

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    await guest.goto(new URL('/p/high-five/', page.url()).href);
    const announcementShortcut = guest.getByRole('button', { name: 'Announcements, 1 new' });
    await expect(announcementShortcut).toBeVisible();
    await announcementShortcut.click();
    await expect(guest.getByRole('region', { name: 'Announcements' })).toBeInViewport();
    await expect(guest.getByRole('button', { name: 'Announcements', exact: true })).toBeVisible();
    await guest.getByRole('region', { name: 'Announcements' }).getByRole('link', { name: 'View all' }).click();
    await expect(guest.getByText('Updated: Good luck everyone!')).toBeVisible();
    await expect(guest.getByRole('button', { name: /^Like announcement/ })).toBeDisabled();
    await expect(guest.getByLabel('Message to the pool')).toHaveCount(0);
    await page.getByRole('switch').click();
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await guest.reload();
    await expect(guest.getByText('Announcements are off.')).toBeVisible();
    await expect(guest.getByText('Updated: Good luck everyone!')).toHaveCount(0);
  } finally {
    await guestContext.close();
  }
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByText('Updated: Good luck everyone!')).toHaveCount(0);
  // This suite shares the dev pool with the smoke tests: leave its roster as we found it.
  const boot = await page.request.get('/api/bootstrap');
  const accountId = (await boot.json()).account.id;
  expect((await page.request.delete(`/api/commissioner/players/${accountId}`)).ok()).toBe(true);
});
