import { chromium, devices } from 'playwright';

async function runChaos() {
  console.log('Starting Combinatorial Chaos Audit...');
  
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/usr/bin/google-chrome-beta'
  });
  
  const contexts = [
    { name: 'Ultra-Wide', viewport: { width: 3840, height: 2160 } },
    { name: 'Mobile Portrait', viewport: { width: 320, height: 568 } },
  ];
  
  for (const ctxInfo of contexts) {
    console.log(`\n=== Testing Viewport: ${ctxInfo.name} ===`);
    const context = await browser.newContext({
      viewport: ctxInfo.viewport,
      userAgent: 'Mozilla/5.0 (Chaos/1.0)',
    });
    
    const page = await context.newPage();
    
    // Inject unhandled rejection tracker
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', event => {
        console.error(`[UNHANDLED REJECTION] ${event.reason}`);
      });
    });
    
    // Listen for uncaught exceptions or console errors
    let errorsFound = 0;
    page.on('pageerror', err => {
      console.error(`[PAGE ERROR] ${err.name}: ${err.message}`);
      errorsFound++;
    });
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected Vite/React dev warnings, look for actual crashes
        if (!text.includes('favicon') && !text.includes('Failed to load resource')) {
          console.error(`[CONSOLE ERROR] ${text}`);
          errorsFound++;
        }
      }
    });

    console.log('Loading http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' }).catch(err => {
      console.log('Error loading page:', err);
    });

    // 1. Rapidly toggle Developer Mode & Navigate routes
    console.log('Thrashing Developer Mode & Navigation...');
    const navModules = ['master', 'coreexec', 'routeswitch', 'cerebro', 'basevault', 'portgrid', 'scopelogic', 'scoutdaemon'];
    
    let totalOverflows = 0;

    for (const route of navModules) {
      console.log(`\n  -> Navigating to /${route}...`);
      await page.goto(`http://localhost:5173/${route === 'master' ? '' : route}`, { waitUntil: 'networkidle' }).catch(() => {});
      
      // Attempt to click Developer Mode toggle rapidly
      for (let i = 0; i < 5; i++) {
        try {
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            if (buttons.length > 0) {
              const randomBtn = buttons[Math.floor(Math.random() * buttons.length)] as HTMLElement;
              if (randomBtn) randomBtn.click();
            }
          });
          await page.waitForTimeout(100);
        } catch (e) { }
      }
      
      // Cerebro Sliders
      await page.evaluate(() => {
        const ranges = document.querySelectorAll('input[type="range"]');
        ranges.forEach((r: any) => {
          r.value = Math.random() > 0.5 ? "100" : "0";
          r.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });

      // Network Throttling & Offline
      console.log('    Simulating Offline & Slow 3G...');
      const cdpSession = await context.newCDPSession(page);
      await cdpSession.send('Network.enable');
      
      // Offline
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: true,
        downloadThroughput: 0,
        uploadThroughput: 0,
        latency: 0,
      });
      
      console.log('    Attempting actions while offline...');
      try {
        await page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          buttons.forEach((b: any) => {
            if (b.innerText && (b.innerText.includes('Approve') || b.innerText.includes('Refresh') || b.innerText.includes('Reject') || b.innerText.includes('Promote') || b.innerText.includes('Kill') || b.innerText.includes('Stop'))) {
              b.click();
            }
          });
        });
        await page.waitForTimeout(1000); // Wait for potential crashes
      } catch (e) {}
      
      // Slow 3G
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: (500 * 1024) / 8,
        uploadThroughput: (500 * 1024) / 8,
        latency: 400 * 5,
      });

      console.log('    Attempting actions while Slow 3G...');
      try {
        await page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          buttons.forEach((b: any) => {
            if (b.innerText && b.innerText.includes('Save')) b.click();
          });
        });
        await page.waitForTimeout(1000);
      } catch(e) {}
      
      // Check Viewport overlap/overflow
      console.log('    Checking for layout/CSS Grid fractures...');
      const overflows = await page.evaluate(() => {
        const elements = document.querySelectorAll('*');
        let issues = 0;
        elements.forEach((el: any) => {
          const rect = el.getBoundingClientRect();
          if (rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
             issues++;
          }
        });
        return issues;
      });
      totalOverflows += overflows;
      console.log(`    Found ${overflows} elements overflowing on /${route}.`);
    }

    console.log(`Total errors caught for ${ctxInfo.name}: ${errorsFound}`);
    console.log(`Total layout overflows for ${ctxInfo.name}: ${totalOverflows}`);
    await context.close();
  }
  
  await browser.close();
  console.log('Audit complete.');
}

runChaos().catch(console.error);
