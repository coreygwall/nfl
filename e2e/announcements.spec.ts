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

test('off Home, the announcement icon previews instead of pulling the reader away', async ({ page, browser }) => {
  await page.goto('/p/high-five/welcome?now=2026-09-09T12:00:00Z');
  await page.getByPlaceholder('Your name').fill(`Preview Host ${Date.now().toString(36)}`);
  await page.getByRole('button', { name: "Let's go" }).click();
  await page.waitForURL(/\/week\/1$/);
  await page.goto('/p/high-five/commissioner');
  await page.getByRole('button', { name: /I own this pool/ }).click();
  await page.getByLabel('Owner PIN').fill('1234');
  await page.getByRole('button', { name: 'Take the keys' }).click();
  const feed = page.getByRole('region', { name: 'Announcements' });
  await feed.getByRole('switch').click();
  await expect(feed.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

  // Four posts: enough to prove the preview caps at three. They go over the API rather than
  // through the compose form — the test above already drives that form, and this one only needs
  // the messages to exist. Typing them in instead meant racing a textarea and a button that
  // disable themselves while each save is in flight, which is what made this test hang. The API
  // also dates them by the real clock rather than the frozen `?now=`, so they no longer tie on
  // `created_at` and "the newest three" is a fact instead of a coin toss between message ids.
  const posts = [
    'Standings are locked — good luck this week!',
    'Reminder: lock in picks before Thursday kickoff.',
    'Scoring page updated with tiebreaker rules.',
    'Heads up — Thursday game moved to 8:20pm ET.',
  ];

  // Everything from here has to be undone even if an assertion throws: this suite shares one pool
  // with the smoke tests, and those count the roster exactly ("2 of 2 have picked"). A host left
  // behind by a failure here fails a test three files away, which is a miserable thing to debug.
  try {
    for (const body of posts) {
      const created = await page.request.post('/api/messages', { data: { body } });
      expect(created.ok(), `posting "${body}" should succeed`).toBe(true);
    }

    // A guest who has never opened the feed, so the unread badge starts fresh for it.
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    try {
      await guest.goto(new URL('/p/high-five/board', page.url()).href);
      const shortcut = guest.getByRole('button', { name: 'Announcements, 4 new' });
      await expect(shortcut).toBeVisible();

      await shortcut.click();
      const popover = guest.getByRole('dialog', { name: 'Announcements' });
      await expect(popover).toBeVisible();
      // Newest first, capped at three — so the three most recent show and the first one posted is
      // represented only by the overflow count.
      await expect(popover.getByRole('listitem')).toHaveCount(3);
      for (const body of posts.slice(1)) {
        await expect(popover.getByText(body)).toBeVisible();
      }
      await expect(popover.getByText(posts[0]!)).toHaveCount(0);
      await expect(popover.getByText('+1 more unread')).toBeVisible();
      const viewAll = popover.getByRole('link', { name: 'View all announcements' });
      await expect(viewAll).toBeVisible();
      await expect(viewAll).toHaveAttribute('href', '/p/high-five/announcements');
      // Board, not the announcements page — the point of a preview is not leaving.
      await expect(guest).toHaveURL(/\/board\/week\/\d+$/);

      await guest.keyboard.press('Escape');
      await expect(popover).toBeHidden();
      await expect(shortcut).toBeFocused();

      // Tapping a preview, rather than "View all", goes straight to that one message.
      await shortcut.click();
      await popover.getByRole('link', { name: new RegExp(posts[3]!.slice(0, 20)) }).click();
      await expect(guest).toHaveURL(/\/announcements#message-/);
      await expect(guest.getByText(posts[3]!, { exact: true })).toBeInViewport();

      // Reading it marked the whole feed seen — a reopened preview off Home says so rather than
      // repeating any of the four.
      await guest.goto(new URL('/p/high-five/board', page.url()).href);
      await guest.getByRole('button', { name: 'Announcements', exact: true }).click();
      await expect(guest.getByRole('dialog', { name: 'Announcements' }).getByText("You're all caught up")).toBeVisible();
    } finally {
      await guestContext.close();
    }
  } finally {
    // Best effort, and deliberately silent: a cleanup that throws would mask whatever real failure
    // sent us here.
    try {
      const listed = await page.request.get('/api/messages');
      if (listed.ok()) {
        for (const message of (await listed.json()).messages ?? []) {
          await page.request.delete(`/api/messages/${message.id}`);
        }
      }
      await page.request.patch('/api/messages/settings', { data: { enabled: false } });
      const boot = await page.request.get('/api/bootstrap');
      const accountId = (await boot.json()).account?.id;
      if (accountId) await page.request.delete(`/api/commissioner/players/${accountId}`);
    } catch {
      /* The next run gets a fresh database either way; a failed tidy-up is not this test's verdict. */
    }
  }
});
