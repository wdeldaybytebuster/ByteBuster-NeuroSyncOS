# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: omni-audit.spec.ts >> 1 — "398 Tests" hardcoded string does not appear in any dashboard DOM
- Location: e2e/omni-audit.spec.ts:47:5

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3742/
Call log:
  - navigating to "http://localhost:3742/", waiting until "networkidle"

```

# Test source

```ts
  1   | /**
  2   |  * NeuroSync OS — Auditor E2E Omni-Testing Suite
  3   |  *
  4   |  * Mandate: Verify that ALL "UI theatre" (fake/hardcoded data) has been
  5   |  * physically eradicated from the rendered DOM. Playwright must spin up
  6   |  * the real servers, open each dashboard, and assert against LIVE endpoints.
  7   |  *
  8   |  * Rules:
  9   |  *  - No string "398 Tests" may appear in the DOM.
  10  |  *  - No string "Pruned (30d): 0" (hardcoded zero) may appear as static text.
  11  |  *  - Math.random() jitter must not cause the DB Stats value to jump > 500
  12  |  *    between two consecutive reads from the same endpoint response.
  13  |  *  - /api/todos and /api/cerebro/learning-approvals must be fetched and
  14  |  *    rendered (network interception confirms the response is consumed).
  15  |  */
  16  | 
  17  | import { test, expect, Page } from '@playwright/test';
  18  | 
  19  | const API = 'http://localhost:3743';
  20  | const UI  = 'http://localhost:3742';
  21  | 
  22  | // ── Helpers ────────────────────────────────────────────────────────────────────
  23  | 
  24  | /** Navigate to the OS layout and click a sidebar module */
  25  | async function goToModule(page: Page, moduleId: string) {
  26  |   await page.goto(UI, { waitUntil: 'networkidle' });
  27  | 
  28  |   // The OS loads into OSLayout — click the matching nav button
  29  |   // Module buttons are rendered by ModuleRouter with the module id as key.
  30  |   // The sidebar has <button> elements whose <span> text matches MODULE_LABELS.
  31  |   // We target by data-module attribute if present, else fall back to role text.
  32  |   // Open the left sidebar (hamburger) first — it starts collapsed on desktop
  33  |   const hamburger = page.locator('header button[aria-label="Toggle module navigation"]').first();
  34  |   if (await hamburger.isVisible({ timeout: 5_000 }).catch(() => false)) {
  35  |     await hamburger.click();
  36  |     await page.waitForTimeout(400);
  37  |   }
  38  |   const sidebarBtn = page.locator(`aside button`).filter({ hasText: new RegExp(moduleId, 'i') }).first();
  39  |   if (await sidebarBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
  40  |     await sidebarBtn.click();
  41  |     await page.waitForTimeout(800);
  42  |   }
  43  | }
  44  | 
  45  | // ── Test 1: No fake "398 Tests" string anywhere in the DOM ─────────────────────
  46  | 
  47  | test('1 — "398 Tests" hardcoded string does not appear in any dashboard DOM', async ({ page }) => {
> 48  |   await page.goto(UI, { waitUntil: 'networkidle' });
      |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3742/
  49  | 
  50  |   // Open sidebar
  51  |   const hamburger = page.locator('header button[aria-label="Toggle module navigation"]').first();
  52  |   if (await hamburger.isVisible({ timeout: 5_000 }).catch(() => false)) {
  53  |     await hamburger.click();
  54  |     await page.waitForTimeout(400);
  55  |   }
  56  | 
  57  |   const modules = ['master', 'coreexec', 'basevault', 'routeswitch', 'scopelogic', 'portgrid', 'scoutdaemon', 'cerebro'];
  58  |   const nav = page.locator('aside button');
  59  | 
  60  |   for (const mod of modules) {
  61  |     const btn = nav.filter({ hasText: new RegExp(mod, 'i') }).first();
  62  |     const visible = await btn.isVisible({ timeout: 3_000 }).catch(() => false);
  63  |     if (visible) {
  64  |       await btn.click();
  65  |       await page.waitForTimeout(600);
  66  |     }
  67  | 
  68  |     const bodyText = await page.locator('body').innerText();
  69  |     expect(
  70  |       bodyText,
  71  |       `Module "${mod}" DOM contains banned hardcoded string "398 Tests"`
  72  |     ).not.toContain('398 Tests');
  73  |   }
  74  | });
  75  | 
  76  | /**
  77  |  * Open the left sidebar (hamburger) and click a module by text match.
  78  |  * The sidebar starts collapsed on desktop; this expands it first.
  79  |  */
  80  | async function clickModule(page: Page, moduleText: string) {
  81  |   const hamburger = page.locator('header button[aria-label="Toggle module navigation"]').first();
  82  |   if (await hamburger.isVisible({ timeout: 5_000 }).catch(() => false)) {
  83  |     await hamburger.click();
  84  |     await page.waitForTimeout(400);
  85  |   }
  86  |   const btn = page.locator('aside button').filter({ hasText: new RegExp(moduleText, 'i') }).first();
  87  |   if (await btn.isVisible({ timeout: 5_000 }).catch(() => false)) {
  88  |     await btn.click();
  89  |     await page.waitForTimeout(1000);
  90  |   }
  91  | }
  92  | 
  93  | // ── Test 2: "Pruned (30d): 0" static hardcode is gone ─────────────────────────
  94  | 
  95  | test('2 — CerebroDashboard does not render static "Pruned (30d): 0"', async ({ page }) => {
  96  |   await clickModule(page, 'cerebro');
  97  | 
  98  |   const bodyText = await page.locator('body').innerText();
  99  | 
  100 |   // The LABEL "Pruned (30d)" is legitimate — it is acceptable in the DOM.
  101 |   // What is banned is the *value* being a hardcoded "0" with no live fetch.
  102 |   // We check that the page does NOT contain the exact composite string
  103 |   // "Pruned (30d): 0" which would indicate a static render.
  104 |   // (The live endpoint returns a real integer that may happen to be 0, but
  105 |   //  that is indistinguishable here — we verify the fetch fires instead in test 4.)
  106 |   expect(
  107 |     bodyText,
  108 |     'CerebroDashboard DOM contains banned static composite "Pruned (30d): 0" — live endpoint not wired'
  109 |   ).not.toMatch(/Pruned \(30d\)\s*:\s*\b0\b/);
  110 | });
  111 | 
  112 | // ── Test 3: DB Stats do not flicker (Math.random() eradicated) ────────────────
  113 | 
  114 | test('3 — BaseVaultDashboard DB checkpoint count is deterministic (no Math.random jitter)', async ({ page }) => {
  115 |   // Intercept the /api/system/db-health response to return a fixed payload.
  116 |   // Then verify the displayed value stays equal across two readings — no jitter.
  117 |   await page.route(`${API}/api/system/db-health`, async route => {
  118 |     await route.fulfill({
  119 |       status: 200,
  120 |       contentType: 'application/json',
  121 |       body: JSON.stringify({ success: true, latencyMs: 0.05, walCheckpoints: 42 }),
  122 |     });
  123 |   });
  124 | 
  125 |   await page.goto(UI, { waitUntil: 'networkidle' });
  126 | 
  127 |   await clickModule(page, 'basevault');
  128 | 
  129 |   // Read the WAL checkpoint stat once, wait for a re-render cycle, read again.
  130 |   // The widget renders it as "{walCheckpoints}/min" (e.g. "42/min").
  131 |   const statLocator = page.locator('text=/42\/min/i').first();
  132 |   const firstRead  = await statLocator.textContent({ timeout: 5_000 }).catch(() => null);
  133 | 
  134 |   await page.waitForTimeout(3_500); // wait for a possible re-poll (3s interval)
  135 |   const secondRead = await statLocator.textContent({ timeout: 5_000 }).catch(() => null);
  136 | 
  137 |   // If Math.random() were still present the value would drift. With the
  138 |   // mocked deterministic 42, it must stay equal across both reads.
  139 |   expect(firstRead).toEqual(secondRead);
  140 |   expect(firstRead).not.toBeNull();
  141 | });
  142 | 
  143 | // ── Test 4: /api/todos network call is fired and payload is rendered ───────────
  144 | 
  145 | test('4 — PortGridDashboard fires a real /api/todos request and renders the response', async ({ page }) => {
  146 |   let todosRequestFired = false;
  147 | 
  148 |   page.on('request', req => {
```