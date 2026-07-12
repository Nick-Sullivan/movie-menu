import { test, expect, type Page } from '@playwright/test';

// Fixed "wall clock" for running-view tests: the app computes elapsed time
// from Date.now(), so freezing it makes countdowns and screenshots deterministic.
const FIXED = new Date('2026-07-06T20:00:00');
const FIXED_SECS = Math.floor(FIXED.getTime() / 1000);

const mockMenu = {
  id: 'ABC12',
  name: "Director's Cut",
  duration_secs: 7320,
  schedule: [
    {
      ready_at_secs: 3600,
      recipe: {
        name: 'Garlic bread',
        steps: [
          { duration_secs: 300, note: 'Preheat oven' },
          { duration_secs: 600, note: 'Bake bread' },
        ],
      },
    },
  ],
  started_at: null as number | null,
  viewer: { upcoming_count: 1, show_dish_names: true },
};

const manyRecipesMenu = {
  ...mockMenu,
  schedule: [
    { ready_at_secs: 1800, recipe: { name: 'Popcorn', steps: [{ duration_secs: 180, note: 'Microwave' }] } },
    { ready_at_secs: 3600, recipe: { name: 'Garlic bread', steps: [
      { duration_secs: 300, note: 'Preheat oven' },
      { duration_secs: 600, note: 'Bake bread' },
    ] } },
    { ready_at_secs: 5400, recipe: { name: 'Pasta', steps: [
      { duration_secs: 600, note: 'Boil water' },
      { duration_secs: 540, note: 'Cook pasta' },
      { duration_secs: 300, note: 'Toss with sauce' },
    ] } },
    { ready_at_secs: 6600, recipe: { name: 'Dessert', steps: [{ duration_secs: 120, note: 'Plate' }] } },
  ],
};

// startedAt: when given, POST /start responds with it regardless of the
// requested start_at — lets tests place the film start in the past. When
// omitted, the requested start_at is echoed back (like the real server).
async function mockApi(page: Page, overrides: Partial<typeof mockMenu> = {}, startedAt?: number) {
  const menu = { ...mockMenu, ...overrides };
  await page.route('http://localhost:3001/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'POST' && url.endsWith('/start')) {
      const body = route.request().postDataJSON() ?? {};
      return route.fulfill({ json: { ...menu, started_at: startedAt ?? body.start_at } });
    }
    if (method === 'POST' && url.endsWith('/stop'))
      return route.fulfill({ json: { ...menu, started_at: null } });
    if (method === 'POST' && url.endsWith('/menus'))
      return route.fulfill({ json: menu });
    if (method === 'GET')
      return route.fulfill({ json: menu });
    if (method === 'PUT')
      return route.fulfill({ json: menu });
    return route.continue();
  });
}

// Reaches the edit view for a saved menu by joining with its code as the chef
// (?chef=true) — non-chefs joining an unstarted menu get the waiting room.
// Freezes the clock at FIXED: the always-visible screening-time field defaults
// to "now", so edit-view screenshots are only deterministic with a fixed clock.
async function goToEditView(page: Page, menuOverride: Partial<typeof mockMenu> = {}, startedAt?: number) {
  await page.clock.setFixedTime(FIXED);
  await mockApi(page, menuOverride, startedAt);
  await page.goto('/tasting-shrek/?chef=true');
  await page.click('text=Join a screening');
  await page.fill('.code-input', 'ABC12'); // lookup fires automatically at 5 chars
  await page.waitForSelector('.edit-view');
}

// Starts with the default screening time ("now"); tests that need the film
// already underway override started_at via mockApi's startedAt.
async function startFilm(page: Page) {
  await page.click('text=Start film');
  await page.waitForSelector('.running-view');
}

test('home screen', async ({ page }) => {
  await page.goto('/tasting-shrek/');
  await expect(page).toHaveScreenshot('home.png');
});

test('create a menu goes straight to the edit view', async ({ page }) => {
  await page.clock.setFixedTime(FIXED);
  await page.goto('/tasting-shrek/');
  await page.click('text=Create a menu');
  await page.waitForSelector('.edit-view');
  // a fresh local menu: no code anywhere, and naming starts focused
  await expect(page.locator('input.menu-name-input')).toBeFocused();
  await expect(page).toHaveScreenshot('create-menu.png');
});

test('join form', async ({ page }) => {
  await page.goto('/tasting-shrek/');
  await page.click('text=Join a screening');
  await expect(page).toHaveScreenshot('join-form.png');
});

test('edit view', async ({ page }) => {
  await goToEditView(page);
  // dishes are collapsed by default — only the appear time shows, no steps
  await expect(page.locator('.step-list')).toHaveCount(0);
  // the screening code stays hidden until the screening starts
  await expect(page.locator('.edit-view')).not.toContainText('ABC12');
  await expect(page).toHaveScreenshot('edit-view.png');
});

test('edit view - editing name', async ({ page }) => {
  await goToEditView(page);
  await page.click('h2.menu-name');
  await expect(page).toHaveScreenshot('edit-view-editing-name.png');
});

test('edit view - expand a dish shows steps that add up to when it appears', async ({ page }) => {
  await goToEditView(page);
  await page.click('[aria-label="Expand dish"]');
  // Garlic bread appears at 1:00:00; steps preheat(5m) then bake(10m).
  // Preheat: 1:00:00 - 15m = 0:45:00; bake: 1:00:00 - 10m = 0:50:00; appears: 1:00:00.
  const fires = page.locator('.step-fire');
  await expect(fires.nth(0)).toHaveText('0:45:00');
  await expect(fires.nth(1)).toHaveText('0:50:00');
  await expect(page.locator('.step-fire--final')).toHaveText('1:00:00');
  await expect(page.locator('.step-appears-note')).toContainText('appears');
  await expect(page).toHaveScreenshot('edit-view-expanded.png');

  // collapsing hides the steps again
  await page.click('[aria-label="Collapse dish"]');
  await expect(page.locator('.step-list')).toHaveCount(0);
});

test('edit view - adding a recipe adds a card', async ({ page }) => {
  await goToEditView(page);
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  await page.click('text=+ Add recipe');
  await expect(page.locator('.recipe-card')).toHaveCount(2);
  await expect(page).toHaveScreenshot('edit-view-adding-recipe.png');
});

test('edit view - many recipes', async ({ page }) => {
  await goToEditView(page, { schedule: manyRecipesMenu.schedule });
  await expect(page.locator('.recipe-card')).toHaveCount(4);
  await expect(page).toHaveScreenshot('edit-view-many-recipes.png');
});

test('a recipe prep note shows before the steps, and in the chef timeline', async ({ page }) => {
  const schedule = [{
    ready_at_secs: 3600,
    recipe: {
      name: 'Garlic bread',
      prep: 'Slice the loaf, soften the butter',
      steps: [
        { duration_secs: 300, note: 'Preheat oven' },
        { duration_secs: 600, note: 'Bake bread' },
      ],
    },
  }];
  await goToEditView(page, { schedule }, FIXED_SECS - 300);

  // edit view: the prep field sits above the step list
  await page.click('[aria-label="Expand dish"]');
  const prepInput = page.locator('.prep-row input');
  await expect(prepInput).toHaveValue('Slice the loaf, soften the butter');
  await expect(page).toHaveScreenshot('edit-view-prep-note.png');

  // chef timeline: prep appears as the first row, at the first step's fire time
  await startFilm(page);
  const rows = page.locator('.chef-row');
  await expect(rows).toHaveCount(4); // prep + 2 steps + ready to serve
  await expect(rows.first()).toContainText('Prep: Slice the loaf, soften the butter');
  await expect(rows.first().locator('.chef-time')).toHaveText('0:45:00');
});

test('edit view - dishes can be reordered', async ({ page }) => {
  await goToEditView(page, { schedule: manyRecipesMenu.schedule });
  const names = page.locator('input.recipe-name-input');
  await expect(names.nth(0)).toHaveValue('Popcorn');
  await page.locator('[aria-label="Move dish down"]').first().click();
  await expect(names.nth(0)).toHaveValue('Garlic bread');
  await expect(names.nth(1)).toHaveValue('Popcorn');
  await page.locator('[aria-label="Move dish up"]').nth(1).click();
  await expect(names.nth(0)).toHaveValue('Popcorn');
  // the ends can't move further
  await expect(page.locator('[aria-label="Move dish up"]').first()).toBeDisabled();
  await expect(page.locator('[aria-label="Move dish down"]').last()).toBeDisabled();
});

test('edit view - has a save (download) button', async ({ page }) => {
  await goToEditView(page);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
});

test('edit view - viewer screen settings', async ({ page }) => {
  await goToEditView(page);
  const count = page.locator('input.viewer-count-input');
  await expect(count).toHaveValue('1');
  await count.fill('2');
  await expect(count).toHaveValue('2');
  // clearing leaves the field empty rather than snapping to 0…
  await count.fill('');
  await expect(count).toHaveValue('');
  // …and typing into it replaces the digit instead of appending ("02")
  await count.pressSequentially('0');
  await count.pressSequentially('2');
  await expect(count).toHaveValue('2');
  // an abandoned empty field falls back to the saved count on blur
  await count.fill('');
  await count.blur();
  await expect(count).toHaveValue('2');
  await page.check('.viewer-setting input[type="checkbox"]');
  await expect(page.locator('.viewer-setting input[type="checkbox"]')).toBeChecked();
});

test('edit view - screening time is always visible and defaults to now', async ({ page }) => {
  await goToEditView(page);
  // fixed clock at 20:00, already on a 5-minute boundary
  await expect(page.locator('input.screening-input')).toHaveValue('2026-07-06T20:00');
  await expect(page.getByRole('button', { name: 'Start film' })).toBeVisible();
});

test('edit view - warns when the screening time means prep is already missed', async ({ page }) => {
  // first fire = 600 - 1800 = −20:00, so with screening time = now (20:00),
  // prep should have begun at 19:40
  await goToEditView(page, {
    schedule: [
      { ready_at_secs: 600, recipe: { name: 'Roast', steps: [{ duration_secs: 1800, note: 'Roast veg' }] } },
    ],
  });
  await expect(page.locator('.prep-warning')).toBeVisible();
  await expect(page.locator('.prep-warning')).toContainText('behind');
  await expect(page).toHaveScreenshot('edit-view-prep-warning.png');

  // pushing the screening time out clears the warning
  await page.fill('input.screening-input', '2026-07-06T21:00');
  await expect(page.locator('.prep-warning')).toHaveCount(0);
});

test('running view - chef list of all steps', async ({ page }) => {
  // film started 5 minutes ago → next step (preheat at 0:45:00) in 40:00
  await goToEditView(page, {}, FIXED_SECS - 300);
  await startFilm(page);
  await expect(page.locator('.film-clock-value')).toHaveText('05:00');
  // the code first appears once the screening is running
  await expect(page.locator('.code-small')).toContainText('ABC12');
  // 2 steps + 1 "ready to serve" row
  await expect(page.locator('.chef-row')).toHaveCount(3);
  await expect(page.locator('.chef-chip')).toHaveText('in 40:00');
  await expect(page).toHaveScreenshot('running-view.png');
});

test('running view - no back button; stopping the film returns to the edit page', async ({ page }) => {
  await goToEditView(page, {}, FIXED_SECS - 300);
  await startFilm(page);
  // either screening or editing: the screening page offers no other way out
  await expect(page.locator('.btn-back')).toHaveCount(0);
  await page.click('text=Stop film');
  await page.waitForSelector('.edit-view');
  await expect(page.getByRole('button', { name: 'Start film' })).toBeVisible();
});

test('running view - future screening time counts down as negative', async ({ page }) => {
  await goToEditView(page);
  // pick a screening time 10 minutes from now
  await page.fill('input.screening-input', '2026-07-06T20:10');
  await page.click('button:has-text("Start film")');
  await page.waitForSelector('.running-view');

  // chef: film clock runs negative and shows the screening time
  await expect(page.locator('.film-clock-value')).toHaveText('−10:00');
  await expect(page.locator('.film-clock-screening')).toHaveText('starts 8:10 PM');
  await expect(page).toHaveScreenshot('running-view-preshow.png');

  // viewer: the ring shows the negative countdown, so no duplicate film clock
  await page.click('.role-toggle >> text=Viewer');
  await expect(page.locator('.countdown-label')).toHaveText('Film starts');
  await expect(page.locator('.countdown')).toHaveText('−10:00');
  await expect(page.locator('.countdown-sub')).toContainText('Screening at');
  await expect(page.locator('.film-clock')).toHaveCount(0);
  await expect(page).toHaveScreenshot('running-view-preshow-viewer.png');
});

test('running view - chef list highlights current step, viewer sees only allowed dishes', async ({ page }) => {
  // 28:20 in: popcorn's microwave step (fires 0:27:00) is current,
  // popcorn lands at 0:30:00
  await goToEditView(
    page,
    { schedule: manyRecipesMenu.schedule, viewer: { upcoming_count: 2, show_dish_names: false } },
    FIXED_SECS - 1700
  );
  await startFilm(page);

  // chef: every step + every "ready to serve" row (7 steps + 4 dishes)
  await expect(page.locator('.chef-row')).toHaveCount(11);
  await expect(page.locator('.chef-row--current')).toContainText('Microwave');
  await expect(page.locator('.chef-chip--now')).toHaveText('now');
  await expect(page.getByText('in 01:40')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop film' })).toBeVisible();
  await expect(page).toHaveScreenshot('running-view-chef.png');

  // viewer: only the next 2 dishes, names hidden, no stop button
  await page.click('.role-toggle >> text=Viewer');
  await expect(page.locator('.countdown')).toHaveText('01:40');
  await expect(page.locator('.countdown-sub')).toHaveText('Mystery dish');
  await expect(page.locator('.upcoming-row')).toHaveCount(2);
  await expect(page.locator('.upcoming-note').first()).toHaveText('Mystery dish');
  await expect(page.getByRole('button', { name: 'Stop film' })).toHaveCount(0);
  await expect(page).toHaveScreenshot('running-view-viewer.png');
});

test('long chef list scrolls with the page — the list has no scrollbar of its own', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 620 });
  await goToEditView(page, { schedule: manyRecipesMenu.schedule }, FIXED_SECS - 1700);
  await startFilm(page);
  await expect(page.locator('.chef-row')).toHaveCount(11);
  const listScrolls = await page
    .locator('.chef-list')
    .evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(listScrolls).toBe(false);
  const pageScrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
  expect(pageScrolls).toBe(true);
});

test('now serving shows the real dish name even when names are hidden', async ({ page }) => {
  // 31:40 in: popcorn (30:00) is on the table; garlic bread is next and masked
  await goToEditView(
    page,
    { schedule: manyRecipesMenu.schedule, viewer: { upcoming_count: 1, show_dish_names: false } },
    FIXED_SECS - 1900
  );
  await startFilm(page);
  await page.click('.role-toggle >> text=Viewer');
  await expect(page.locator('.milestone-note')).toHaveText('Popcorn');
  await expect(page.locator('.countdown-sub')).toHaveText('Mystery dish');
});

test('viewer view - no list when only the next dish is shown', async ({ page }) => {
  await goToEditView(
    page,
    { schedule: manyRecipesMenu.schedule, viewer: { upcoming_count: 1, show_dish_names: true } },
    FIXED_SECS - 60
  );
  await startFilm(page);
  await page.click('.role-toggle >> text=Viewer');
  // the ring already shows the next dish; a one-item list would be redundant
  await expect(page.locator('.countdown-sub')).toHaveText('Popcorn');
  await expect(page.locator('.upcoming')).toHaveCount(0);
});

test('joining a screening puts the code in the URL; back clears it', async ({ page }) => {
  await goToEditView(page);
  await expect(page).toHaveURL(/code=ABC12/);
  await page.click('text=← Back');
  await page.waitForSelector('.home-title');
  await expect(page).not.toHaveURL(/code=/);
});

test('refresh during a screening returns to it via the code in the URL', async ({ page }) => {
  await page.clock.setFixedTime(FIXED);
  await mockApi(page, { started_at: FIXED_SECS - 300 });
  // simulates a refresh: loading the app cold with a code in the URL
  await page.goto('/tasting-shrek/?code=ABC12');
  await page.waitForSelector('.running-view');
  await expect(page.locator('.code-small')).toContainText('ABC12');
  await expect(page.locator('.film-clock-value')).toHaveText('05:00');
});

test('a plain code link is viewer-only; ?chef=true unlocks the chef screen', async ({ page }) => {
  await page.clock.setFixedTime(FIXED);
  await mockApi(page, { started_at: FIXED_SECS - 300 });

  // without chef=true: viewer screen, no role toggle, no stop control
  await page.goto('/tasting-shrek/?code=ABC12');
  await page.waitForSelector('.running-view');
  await expect(page.locator('.countdown')).toBeVisible();
  await expect(page.locator('.role-toggle')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop film' })).toHaveCount(0);
  await expect(page.locator('.btn-back')).toHaveCount(0);

  // with chef=true: chef list and the toggle are available
  await page.goto('/tasting-shrek/?code=ABC12&chef=true');
  await page.waitForSelector('.running-view');
  await expect(page.locator('.chef-row').first()).toBeVisible();
  await expect(page.locator('.role-toggle')).toBeVisible();
});

test('starting the film marks you as the chef in the URL', async ({ page }) => {
  // create → start, with no pre-existing chef status: starting grants it
  await page.clock.setFixedTime(FIXED);
  await mockApi(page, {}, FIXED_SECS - 300);
  await page.goto('/tasting-shrek/');
  await page.click('text=Create a menu');
  await page.waitForSelector('.edit-view');
  await startFilm(page);
  await expect(page).toHaveURL(/chef=true/);
  await expect(page.locator('.chef-row').first()).toBeVisible();
  // going all the way home (stop → back) drops chef status along with the code
  await page.click('text=Stop film');
  await page.waitForSelector('.edit-view');
  await page.click('text=← Back');
  await page.waitForSelector('.home-title');
  await expect(page).not.toHaveURL(/chef=/);
});

test('a menu being edited survives a refresh without touching the server', async ({ page }) => {
  await page.clock.setFixedTime(FIXED);
  // fail any API call loudly: pre-screening editing must stay fully local
  await page.route('http://localhost:3001/**', route => route.fulfill({ status: 500, json: {} }));
  await page.goto('/tasting-shrek/');
  await page.click('text=Create a menu');
  await page.waitForSelector('.edit-view');
  await page.fill('input.menu-name-input', 'Local Night');
  await page.keyboard.press('Enter');
  await page.reload();
  await page.waitForSelector('.edit-view');
  await expect(page.locator('h2.menu-name')).toHaveText(/Local Night/);
});

test('a code whose screening is not running reads as not found', async ({ page }) => {
  await mockApi(page); // menu exists but has not started

  // joining by code: the form reports not found, nothing leaks
  await page.goto('/tasting-shrek/');
  await page.click('text=Join a screening');
  await page.fill('.code-input', 'ABC12');
  await expect(page.locator('.error')).toHaveText('No screening found with that code.');
  await expect(page.locator('.edit-view')).toHaveCount(0);
  await expect(page.getByText('Garlic bread')).toHaveCount(0);

  // opening the link directly: straight back to the main menu
  await page.goto('/tasting-shrek/?code=ABC12');
  await page.waitForSelector('.home-title');
  await expect(page).not.toHaveURL(/code=/);
});

test('a bad code in the URL falls back to the home screen', async ({ page }) => {
  await page.route('http://localhost:3001/**', route => route.fulfill({ status: 404, json: {} }));
  await page.goto('/tasting-shrek/?code=WRONG');
  await page.waitForSelector('.home-title');
  await expect(page).not.toHaveURL(/code=/);
});

test('upload a menu file loads it locally without a code', async ({ page }) => {
  await page.goto('/tasting-shrek/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'movie-night.movie.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      version: 1,
      kind: 'movie',
      name: 'Uploaded Night',
      duration_secs: 3600,
      schedule: [
        { ready_at_secs: 1800, recipe: { name: 'Nachos', steps: [{ duration_secs: 300, note: 'Melt cheese' }] } },
      ],
    })),
  });

  await page.waitForSelector('.edit-view');
  await expect(page.locator('h2.menu-name')).toHaveText(/Uploaded Night/);
  await expect(page.locator('input.recipe-name-input')).toHaveValue('Nachos');
});
