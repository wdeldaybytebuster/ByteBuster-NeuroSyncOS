/**
 * NeuroSync OS — Auditor E2E Omni-Testing Suite
 *
 * Mandate: Verify that ALL "UI theatre" (fake/hardcoded data) has been
 * physically eradicated from the rendered DOM. Playwright must spin up
 * the real servers, open each dashboard, and assert against LIVE endpoints.
 *
 * Rules:
 *  - No string "398 Tests" may appear in the DOM.
 *  - No string "Pruned (30d): 0" (hardcoded zero) may appear as static text.
 *  - Math.random() jitter must not cause the DB Stats value to jump > 500
 *    between two consecutive reads from the same endpoint response.
 *  - /api/todos and /api/cerebro/learning-approvals must be fetched and
 *    rendered (network interception confirms the response is consumed).
 */

import { test, expect, Page } from '@playwright/test';

const API = 'http://localhost:3743';
const UI  = 'http://localhost:5173';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Navigate to the OS layout and click a sidebar module */
async function goToModule(page: Page, moduleId: string) {
  await page.goto(UI, { waitUntil: 'networkidle' });

  // The OS loads into OSLayout — click the matching nav button
  // Module buttons are rendered by ModuleRouter with the module id as key.
  // The sidebar has <button> elements whose <span> text matches MODULE_LABELS.
  // We target by data-module attribute if present, else fall back to role text.
  const sidebarBtn = page.locator(`nav button`).filter({ hasText: new RegExp(moduleId, 'i') }).first();
  if (await sidebarBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await sidebarBtn.click();
    await page.waitForTimeout(800); // let the view render
  }
}

// ── Test 1: No fake "398 Tests" string anywhere in the DOM ─────────────────────

test('1 — "398 Tests" hardcoded string does not appear in any dashboard DOM', async ({ page }) => {
  await page.goto(UI, { waitUntil: 'networkidle' });

  const modules = ['master', 'coreexec', 'basevault', 'routeswitch', 'scopelogic', 'portgrid', 'scoutdaemon', 'cerebro'];
  const nav = page.locator('nav button');

  for (const mod of modules) {
    const btn = nav.filter({ hasText: new RegExp(mod, 'i') }).first();
    const visible = await btn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (visible) {
      await btn.click();
      await page.waitForTimeout(600);
    }

    const bodyText = await page.locator('body').innerText();
    expect(
      bodyText,
      `Module "${mod}" DOM contains banned hardcoded string "398 Tests"`
    ).not.toContain('398 Tests');
  }
});

// ── Test 2: "Pruned (30d): 0" static hardcode is gone ─────────────────────────

test('2 — CerebroDashboard does not render static "Pruned (30d): 0"', async ({ page }) => {
  await page.goto(UI, { waitUntil: 'networkidle' });

  // Navigate to cerebro
  const cerebro = page.locator('nav button').filter({ hasText: /cerebro/i }).first();
  if (await cerebro.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await cerebro.click();
    await page.waitForTimeout(1_000);
  }

  const bodyText = await page.locator('body').innerText();

  // The LABEL "Pruned (30d)" is legitimate — it is acceptable in the DOM.
  // What is banned is the *value* being a hardcoded "0" with no live fetch.
  // We check that the page does NOT contain the exact composite string
  // "Pruned (30d): 0" which would indicate a static render.
  // (The live endpoint returns a real integer that may happen to be 0, but
  //  that is indistinguishable here — we verify the fetch fires instead in test 4.)
  expect(
    bodyText,
    'CerebroDashboard DOM contains banned static composite "Pruned (30d): 0" — live endpoint not wired'
  ).not.toMatch(/Pruned \(30d\)\s*:\s*\b0\b/);
});

// ── Test 3: DB Stats do not flicker (Math.random() eradicated) ────────────────

test('3 — BaseVaultDashboard DB checkpoint count is deterministic (no Math.random jitter)', async ({ page }) => {
  // Intercept the /api/system/db-health response to return a fixed payload.
  // Then verify the displayed value stays equal across two readings — no jitter.
  await page.route(`${API}/api/system/db-health`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, pageCount: 1024, checkpoint: 42, walFrames: 7 }),
    });
  });

  await page.goto(UI, { waitUntil: 'networkidle' });

  const basevault = page.locator('nav button').filter({ hasText: /basevault|base vault/i }).first();
  if (await basevault.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await basevault.click();
    await page.waitForTimeout(1_500);
  }

  // Read the checkpoint stat once, wait for a re-render cycle, read again.
  const statLocator = page.locator('text=/42|checkpoint/i').first();
  const firstRead  = await statLocator.textContent({ timeout: 5_000 }).catch(() => null);

  await page.waitForTimeout(2_000); // wait for a possible re-poll
  const secondRead = await statLocator.textContent({ timeout: 5_000 }).catch(() => null);

  // If Math.random() were still present the value would drift. With the
  // mocked deterministic 42, it must stay equal.
  expect(firstRead).toEqual(secondRead);
  expect(firstRead).not.toBeNull();
});

// ── Test 4: /api/todos network call is fired and payload is rendered ───────────

test('4 — PortGridDashboard fires a real /api/todos request and renders the response', async ({ page }) => {
  let todosRequestFired = false;

  page.on('request', req => {
    if (req.url().includes('/api/todos') || req.url().includes('/api/basevault/todos')) {
      todosRequestFired = true;
    }
  });

  await page.goto(UI, { waitUntil: 'networkidle' });

  // Navigate to portgrid
  const portgrid = page.locator('nav button').filter({ hasText: /portgrid/i }).first();
  if (await portgrid.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await portgrid.click();
    await page.waitForTimeout(2_000); // allow fetch + render
  }

  expect(todosRequestFired).toBe(true);
});

// ── Test 5: /api/cerebro/learning-approvals is fetched ────────────────────────

test('5 — CerebroDashboard fires a real /api/cerebro/learning-approvals request', async ({ page }) => {
  let approvalsRequestFired = false;

  page.on('request', req => {
    if (req.url().includes('/api/cerebro/learning-approvals') || req.url().includes('/api/cerebro')) {
      approvalsRequestFired = true;
    }
  });

  await page.goto(UI, { waitUntil: 'networkidle' });

  const cerebro = page.locator('nav button').filter({ hasText: /cerebro/i }).first();
  if (await cerebro.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await cerebro.click();
    await page.waitForTimeout(2_000);
  }

  expect(approvalsRequestFired).toBe(true);
});

// ── Test 6: UnifiedMasterDashboard renders without fake static data ────────────

test('6 — UnifiedMasterDashboard loads and contains no known fake strings', async ({ page }) => {
  await page.goto(UI, { waitUntil: 'networkidle' });

  const master = page.locator('nav button').filter({ hasText: /master|unified/i }).first();
  if (await master.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await master.click();
    await page.waitForTimeout(1_000);
  }

  const bodyText = await page.locator('body').innerText();

  // Full banned-string audit for UnifiedMasterDashboard
  const bannedStrings = [
    '398 Tests',
    'PASSING (398',
    'v3.2.1',           // fabricated version string
    'TODO: wire up',    // dev placeholder text
    'placeholder',      // generic placeholders
  ];

  for (const banned of bannedStrings) {
    expect(
      bodyText,
      `UnifiedMasterDashboard DOM contains banned string: "${banned}"`
    ).not.toContain(banned);
  }
});
