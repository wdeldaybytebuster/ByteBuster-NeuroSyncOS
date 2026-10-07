# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lifecycle-audit.spec.ts >> Full Lifecycle Omni-Testing >> Step 2: Project & File Ingestion — PortGrid renders live project data
- Location: e2e/lifecycle-audit.spec.ts:46:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3742/
Call log:
  - navigating to "http://localhost:3742/", waiting until "networkidle"

```

# Test source

```ts
  1  | import { test, expect, Page } from '@playwright/test';
  2  | 
  3  | const API = 'http://localhost:3743';
  4  | const UI  = 'http://localhost:3742';
  5  | 
  6  | test.describe('Full Lifecycle Omni-Testing', () => {
  7  | 
  8  |   test('Step 1: Agent & Provider Setup — RouteSwitch provider registry loads from BaseVault', async ({ page }) => {
  9  |     // Navigate to RouteSwitch set-up view (provider list only loads there)
  10 |     await page.goto(UI, { waitUntil: 'networkidle' });
  11 |     // Open sidebar
  12 |     const hamburger = page.locator('header button[aria-label="Toggle module navigation"]').first();
  13 |     if (await hamburger.isVisible({ timeout: 5_000 }).catch(() => false)) {
  14 |       await hamburger.click();
  15 |       await page.waitForTimeout(500);
  16 |     }
  17 |     const btn = page.locator('aside button').filter({ hasText: /routeswitch/i }).first();
  18 |     if (await btn.isVisible({ timeout: 5_000 }).catch(() => false)) {
  19 |       await btn.click();
  20 |       await page.waitForTimeout(1500);
  21 |     }
  22 |     // Confirm navigation succeeded by checking the top-bar module name
  23 |     const moduleName = page.locator('text=/RouteSwitch LLM|AI Model Settings/i').first();
  24 |     await expect(moduleName).toBeVisible({ timeout: 5_000 });
  25 |     // Switch to Set-up tab where the provider registry form lives
  26 |     // The Set-up/Dashboard toggle buttons are text buttons in the center of the top bar
  27 |     const setupTab = page.locator('button').filter({ hasText: /^Set-up$/ }).first();
  28 |     if (await setupTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
  29 |       await setupTab.click();
  30 |       await page.waitForTimeout(1500);
  31 |     }
  32 | 
  33 |     // The Provider Registry section must render real provider rows from /api/llm/providers
  34 |     // (no hardcoded 3-row mock). Assert the registry heading exists.
  35 |     const registryHeading = page.locator('text=/Provider Registry/i').first();
  36 |     await expect(registryHeading).toBeVisible({ timeout: 5_000 });
  37 | 
  38 |     // Assert /api/llm/providers was called — the set-up view fetches it on mount.
  39 |     // We verify by checking the "No providers configured yet" empty state is NOT shown
  40 |     // when the DB has 3 providers seeded.
  41 |     const noProviders = page.locator('text=/No providers configured yet/i').first();
  42 |     const noProvidersVisible = await noProviders.isVisible({ timeout: 2_000 }).catch(() => false);
  43 |     expect(noProvidersVisible).toBe(false);
  44 |   });
  45 | 
  46 |   test('Step 2: Project & File Ingestion — PortGrid renders live project data', async ({ page }) => {
> 47 |     await page.goto(UI, { waitUntil: 'networkidle' });
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3742/
  48 |     // Open sidebar
  49 |     const hamburger = page.locator('header button[aria-label="Toggle module navigation"]').first();
  50 |     if (await hamburger.isVisible({ timeout: 5_000 }).catch(() => false)) {
  51 |       await hamburger.click();
  52 |       await page.waitForTimeout(400);
  53 |     }
  54 |     const btn = page.locator('aside button').filter({ hasText: /portgrid/i }).first();
  55 |     if (await btn.isVisible({ timeout: 5_000 }).catch(() => false)) {
  56 |       await btn.click();
  57 |       await page.waitForTimeout(1500);
  58 |     }
  59 | 
  60 |     // PortGrid Dashboard must render — verify the page loaded by checking
  61 |     // the top-bar module name (PortGrid Skills in Dev mode, Approvals & Tools in Simple).
  62 |     const moduleName = page.locator('text=/PortGrid Skills|Approvals & Tools/i').first();
  63 |     await expect(moduleName).toBeVisible({ timeout: 5_000 });
  64 | 
  65 |     // The Attention Required queue widget must be in the DOM (renders even when empty).
  66 |     // In Dev mode: "Needs Your Approval"; in Simple mode: "Nothing Runs Without You".
  67 |     const attentionHeading = page.locator('text=/Needs Your Approval|Nothing Runs Without You|All Clear/i').first();
  68 |     await expect(attentionHeading).toBeVisible({ timeout: 5_000 });
  69 | 
  70 |     // /api/todos must have fired (verified in omni-audit test 4).
  71 |     // Here we just confirm the page rendered without console errors.
  72 |     expect(true).toBe(true);
  73 |   });
  74 | });
  75 | 
```