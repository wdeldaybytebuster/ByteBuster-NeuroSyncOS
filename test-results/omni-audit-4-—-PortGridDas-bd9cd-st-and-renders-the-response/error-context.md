# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: omni-audit.spec.ts >> 4 — PortGridDashboard fires a real /api/todos request and renders the response
- Location: e2e/omni-audit.spec.ts:125:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]: FreeLLMAPI
  - generic [ref=e8]:
    - heading "Sign in" [level=1] [ref=e9]
    - paragraph [ref=e10]: Sign in to manage your keys, routing, and analytics.
    - generic [ref=e11]:
      - generic [ref=e12]:
        - generic [ref=e13]: Email
        - textbox "Email" [ref=e14]:
          - /placeholder: you@example.com
      - generic [ref=e15]:
        - generic [ref=e16]: Password
        - textbox "Password" [ref=e17]:
          - /placeholder: your password
      - button "Sign in" [disabled]
```

# Test source

```ts
  43  | 
  44  |   const modules = ['master', 'coreexec', 'basevault', 'routeswitch', 'scopelogic', 'portgrid', 'scoutdaemon', 'cerebro'];
  45  |   const nav = page.locator('nav button');
  46  | 
  47  |   for (const mod of modules) {
  48  |     const btn = nav.filter({ hasText: new RegExp(mod, 'i') }).first();
  49  |     const visible = await btn.isVisible({ timeout: 3_000 }).catch(() => false);
  50  |     if (visible) {
  51  |       await btn.click();
  52  |       await page.waitForTimeout(600);
  53  |     }
  54  | 
  55  |     const bodyText = await page.locator('body').innerText();
  56  |     expect(
  57  |       bodyText,
  58  |       `Module "${mod}" DOM contains banned hardcoded string "398 Tests"`
  59  |     ).not.toContain('398 Tests');
  60  |   }
  61  | });
  62  | 
  63  | // ── Test 2: "Pruned (30d): 0" static hardcode is gone ─────────────────────────
  64  | 
  65  | test('2 — CerebroDashboard does not render static "Pruned (30d): 0"', async ({ page }) => {
  66  |   await page.goto(UI, { waitUntil: 'networkidle' });
  67  | 
  68  |   // Navigate to cerebro
  69  |   const cerebro = page.locator('nav button').filter({ hasText: /cerebro/i }).first();
  70  |   if (await cerebro.isVisible({ timeout: 5_000 }).catch(() => false)) {
  71  |     await cerebro.click();
  72  |     await page.waitForTimeout(1_000);
  73  |   }
  74  | 
  75  |   const bodyText = await page.locator('body').innerText();
  76  | 
  77  |   // The LABEL "Pruned (30d)" is legitimate — it is acceptable in the DOM.
  78  |   // What is banned is the *value* being a hardcoded "0" with no live fetch.
  79  |   // We check that the page does NOT contain the exact composite string
  80  |   // "Pruned (30d): 0" which would indicate a static render.
  81  |   // (The live endpoint returns a real integer that may happen to be 0, but
  82  |   //  that is indistinguishable here — we verify the fetch fires instead in test 4.)
  83  |   expect(
  84  |     bodyText,
  85  |     'CerebroDashboard DOM contains banned static composite "Pruned (30d): 0" — live endpoint not wired'
  86  |   ).not.toMatch(/Pruned \(30d\)\s*:\s*\b0\b/);
  87  | });
  88  | 
  89  | // ── Test 3: DB Stats do not flicker (Math.random() eradicated) ────────────────
  90  | 
  91  | test('3 — BaseVaultDashboard DB checkpoint count is deterministic (no Math.random jitter)', async ({ page }) => {
  92  |   // Intercept the /api/system/db-health response to return a fixed payload.
  93  |   // Then verify the displayed value stays equal across two readings — no jitter.
  94  |   await page.route(`${API}/api/system/db-health`, async route => {
  95  |     await route.fulfill({
  96  |       status: 200,
  97  |       contentType: 'application/json',
  98  |       body: JSON.stringify({ success: true, pageCount: 1024, checkpoint: 42, walFrames: 7 }),
  99  |     });
  100 |   });
  101 | 
  102 |   await page.goto(UI, { waitUntil: 'networkidle' });
  103 | 
  104 |   const basevault = page.locator('nav button').filter({ hasText: /basevault|base vault/i }).first();
  105 |   if (await basevault.isVisible({ timeout: 5_000 }).catch(() => false)) {
  106 |     await basevault.click();
  107 |     await page.waitForTimeout(1_500);
  108 |   }
  109 | 
  110 |   // Read the checkpoint stat once, wait for a re-render cycle, read again.
  111 |   const statLocator = page.locator('text=/42|checkpoint/i').first();
  112 |   const firstRead  = await statLocator.textContent({ timeout: 5_000 }).catch(() => null);
  113 | 
  114 |   await page.waitForTimeout(2_000); // wait for a possible re-poll
  115 |   const secondRead = await statLocator.textContent({ timeout: 5_000 }).catch(() => null);
  116 | 
  117 |   // If Math.random() were still present the value would drift. With the
  118 |   // mocked deterministic 42, it must stay equal.
  119 |   expect(firstRead).toEqual(secondRead);
  120 |   expect(firstRead).not.toBeNull();
  121 | });
  122 | 
  123 | // ── Test 4: /api/todos network call is fired and payload is rendered ───────────
  124 | 
  125 | test('4 — PortGridDashboard fires a real /api/todos request and renders the response', async ({ page }) => {
  126 |   let todosRequestFired = false;
  127 | 
  128 |   page.on('request', req => {
  129 |     if (req.url().includes('/api/todos') || req.url().includes('/api/basevault/todos')) {
  130 |       todosRequestFired = true;
  131 |     }
  132 |   });
  133 | 
  134 |   await page.goto(UI, { waitUntil: 'networkidle' });
  135 | 
  136 |   // Navigate to portgrid
  137 |   const portgrid = page.locator('nav button').filter({ hasText: /portgrid/i }).first();
  138 |   if (await portgrid.isVisible({ timeout: 5_000 }).catch(() => false)) {
  139 |     await portgrid.click();
  140 |     await page.waitForTimeout(2_000); // allow fetch + render
  141 |   }
  142 | 
> 143 |   expect(todosRequestFired).toBe(true);
      |                             ^ Error: expect(received).toBe(expected) // Object.is equality
  144 | });
  145 | 
  146 | // ── Test 5: /api/cerebro/learning-approvals is fetched ────────────────────────
  147 | 
  148 | test('5 — CerebroDashboard fires a real /api/cerebro/learning-approvals request', async ({ page }) => {
  149 |   let approvalsRequestFired = false;
  150 | 
  151 |   page.on('request', req => {
  152 |     if (req.url().includes('/api/cerebro/learning-approvals') || req.url().includes('/api/cerebro')) {
  153 |       approvalsRequestFired = true;
  154 |     }
  155 |   });
  156 | 
  157 |   await page.goto(UI, { waitUntil: 'networkidle' });
  158 | 
  159 |   const cerebro = page.locator('nav button').filter({ hasText: /cerebro/i }).first();
  160 |   if (await cerebro.isVisible({ timeout: 5_000 }).catch(() => false)) {
  161 |     await cerebro.click();
  162 |     await page.waitForTimeout(2_000);
  163 |   }
  164 | 
  165 |   expect(approvalsRequestFired).toBe(true);
  166 | });
  167 | 
  168 | // ── Test 6: UnifiedMasterDashboard renders without fake static data ────────────
  169 | 
  170 | test('6 — UnifiedMasterDashboard loads and contains no known fake strings', async ({ page }) => {
  171 |   await page.goto(UI, { waitUntil: 'networkidle' });
  172 | 
  173 |   const master = page.locator('nav button').filter({ hasText: /master|unified/i }).first();
  174 |   if (await master.isVisible({ timeout: 5_000 }).catch(() => false)) {
  175 |     await master.click();
  176 |     await page.waitForTimeout(1_000);
  177 |   }
  178 | 
  179 |   const bodyText = await page.locator('body').innerText();
  180 | 
  181 |   // Full banned-string audit for UnifiedMasterDashboard
  182 |   const bannedStrings = [
  183 |     '398 Tests',
  184 |     'PASSING (398',
  185 |     'v3.2.1',           // fabricated version string
  186 |     'TODO: wire up',    // dev placeholder text
  187 |     'placeholder',      // generic placeholders
  188 |   ];
  189 | 
  190 |   for (const banned of bannedStrings) {
  191 |     expect(
  192 |       bodyText,
  193 |       `UnifiedMasterDashboard DOM contains banned string: "${banned}"`
  194 |     ).not.toContain(banned);
  195 |   }
  196 | });
  197 | 
```