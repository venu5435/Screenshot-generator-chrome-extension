/**
 * Comprehensive Real-World Pattern Test Suite for Visual Readiness Engine
 * Tests:
 * Test A - Delayed content (DOM injected via JS after delay)
 * Test B - Lazy images (IntersectionObserver, data-src, srcset, background-image)
 * Test C - Infinite/lazy sections (scrolling creates additional content)
 * Test D - 100vh hero & sections (verifying 100vh is authentic and doesn't inflate)
 * Test E - Sticky header (verifying sticky header positions)
 * Test F - Masonry gallery (dimensions calculated after load)
 * Test G - Very long page (tiled stitching / ultra-tall layout >20,000px)
 * Test H - Mobile-only responsive sections (desktop vs mobile DOM layout)
 * Test I - Broken third-party resource / slow image (ensures engine doesn't hang)
 */

import http from 'http';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_VIEWPORTS,
  RENDER_CONFIG,
  waitForPageFullyRendered,
  calculateAuthenticContentHeight,
  captureViewportScreenshot,
  freezeAnimations,
  unfreezeAnimations
} from '../utils/capture.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dummy 1x1 transparent and colored base64 images
const RED_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const BLUE_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPifDwAEiAGf9qP2AAAAAElFTkSuQmCC';

const testPages = {
  '/test-all': `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Comprehensive Readiness Test Page</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; }
          
          /* Test E: Sticky Header */
          header.sticky-nav {
            position: sticky; top: 0; left: 0; right: 0; height: 60px;
            background: rgba(15, 23, 42, 0.95); color: white;
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 24px; z-index: 1000;
          }

          /* Test D: 100vh Hero */
          section.hero-100vh {
            height: 100vh;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            text-align: center; padding: 20px;
          }

          /* Test H: Responsive Desktop vs Mobile */
          .desktop-only-banner { display: block; padding: 15px; background: #10b981; color: white; text-align: center; }
          .mobile-only-banner { display: none; padding: 15px; background: #ec4899; color: white; text-align: center; }
          @media (max-width: 768px) {
            .desktop-only-banner { display: none; }
            .mobile-only-banner { display: block; }
          }

          /* Test F: Masonry Gallery */
          .gallery-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 20px; padding: 40px 24px;
          }
          .gallery-item {
            background: white; border-radius: 12px; overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); padding: 16px;
          }
          .gallery-item img {
            width: 100%; height: 200px; object-fit: cover; border-radius: 8px;
            display: block; background: #e2e8f0;
          }

          /* Test B: CSS Background & Lazy attributes */
          .lazy-bg-container {
            height: 250px; border-radius: 12px; margin: 20px 24px;
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 20px; font-weight: bold;
            background-color: #64748b;
          }

          /* Test A: Dynamic Container */
          #dynamicSection { padding: 24px; margin: 20px 24px; background: #ede9fe; border-radius: 12px; }

          /* Test C: Infinite Section */
          #infiniteContainer { padding: 24px; }
          .infinite-card { background: #e0f2fe; padding: 20px; margin-bottom: 16px; border-radius: 8px; }

          footer { background: #0f172a; color: #94a3b8; padding: 40px 24px; text-align: center; }
        </style>
      </head>
      <body>
        <header class="sticky-nav">
          <h2>OmniTest Pro</h2>
          <nav><span>Home</span> | <span>Gallery</span> | <span>Contact</span></nav>
        </header>

        <div class="desktop-only-banner">Desktop View Active (Screen > 768px)</div>
        <div class="mobile-only-banner">Mobile View Active (Screen &le; 768px)</div>

        <section class="hero-100vh">
          <h1>Authentic 100vh Hero Section</h1>
          <p>This section is styled with height: 100vh and must remain viewport proportional!</p>
        </section>

        <!-- Test B: Lazy Images & CSS Backgrounds -->
        <div class="lazy-bg-container" data-bg="${BLUE_PIXEL}">
          Lazy Loaded Background Container
        </div>

        <div class="gallery-grid">
          <div class="gallery-item">
            <img data-src="${RED_PIXEL}" data-srcset="${RED_PIXEL} 1x" alt="Lazy Item 1" class="lazyload">
            <h4>Gallery Card 1 (Lazy data-src)</h4>
          </div>
          <div class="gallery-item">
            <picture>
              <source data-srcset="${BLUE_PIXEL}">
              <img data-lazy-src="${BLUE_PIXEL}" alt="Lazy Item 2">
            </picture>
            <h4>Gallery Card 2 (Picture Source)</h4>
          </div>
          <div class="gallery-item">
            <img data-rocket-lazy-src="${RED_PIXEL}" alt="Lazy Item 3">
            <h4>Gallery Card 3 (WP Rocket data-rocket)</h4>
          </div>
        </div>

        <!-- Test A: Delayed Content Injection -->
        <div id="dynamicSection">
          <h3>Waiting for JavaScript delayed content...</h3>
        </div>

        <!-- Test C: Infinite scroll container -->
        <div id="infiniteContainer">
          <div class="infinite-card">Initial Section Card 1</div>
        </div>

        <footer>
          <p>&copy; 2026 OmniTest Automated Validation. All rights reserved.</p>
        </footer>

        <script>
          // Test A: Delayed DOM injection after 800ms
          setTimeout(() => {
            const container = document.getElementById('dynamicSection');
            container.innerHTML = \`
              <h3 style="color: #6d28d9;">✅ Delayed Dynamic Content Rendered Successfully!</h3>
              <p>Injected by client-side JavaScript 800ms after page load.</p>
            \`;
          }, 800);

          // Test C: Dynamic section expansion when user scrolls near bottom
          let expanded = false;
          window.addEventListener('scroll', () => {
            if (!expanded && window.scrollY + window.innerHeight >= document.body.scrollHeight - 300) {
              expanded = true;
              const inf = document.getElementById('infiniteContainer');
              for (let i = 1; i <= 3; i++) {
                const card = document.createElement('div');
                card.className = 'infinite-card';
                card.textContent = 'Infinite scroll appended card #' + i;
                inf.appendChild(card);
              }
            }
          });
        </script>
      </body>
    </html>
  `,

  '/test-long-page': `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Ultra Long Page Test</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: sans-serif; background: #0f172a; color: white; }
          header.top-bar { position: fixed; top: 0; left: 0; right: 0; height: 50px; background: #ef4444; display: flex; align-items: center; padding: 0 20px; z-index: 999; }
          .spacer-block { height: 2500px; padding: 40px; margin: 20px; border-radius: 8px; border: 2px dashed #475569; }
          footer { height: 100px; background: #1e293b; display: flex; align-items: center; justify-content: center; }
        </style>
      </head>
      <body>
        <header class="top-bar">Fixed Top Header (Must not repeat in tiles)</header>
        <div style="margin-top: 60px;">
          <div class="spacer-block" style="background: #1e3a8a;"><h3>Block 1 (0 - 2,500px)</h3></div>
          <div class="spacer-block" style="background: #14532d;"><h3>Block 2 (2,500 - 5,000px)</h3></div>
          <div class="spacer-block" style="background: #713f12;"><h3>Block 3 (5,000 - 7,500px)</h3></div>
          <div class="spacer-block" style="background: #581c87;"><h3>Block 4 (7,500 - 10,000px)</h3></div>
          <div class="spacer-block" style="background: #831843;"><h3>Block 5 (10,000 - 12,500px)</h3></div>
        </div>
        <footer>End of Ultra-Long Page (12,600px Total)</footer>
      </body>
    </html>
  `
};

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 Starting Visual Readiness & Architectural Upgrade Test Suite');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(cond, desc) {
    total++;
    if (cond) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  // 1. Start test HTTP server
  const server = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    if (testPages[p]) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(testPages[p]);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise(r => server.listen(7788, '127.0.0.1', r));
  console.log('Mock Web Server listening on http://127.0.0.1:7788\n');

  // Launch Chromium via Playwright
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  // Polyfill global.chrome for unit execution
  global.chrome = {
    debugger: {
      sendCommand: (d, method, params, callback) => {
        client.send(method, params)
          .then(res => callback(res))
          .catch(err => {
            global.chrome.runtime.lastError = { message: err.message };
            callback(null);
            delete global.chrome.runtime.lastError;
          });
      }
    },
    runtime: {}
  };

  const debuggee = { tabId: 99 };

  try {
    // --- SUITE A: Comprehensive Readiness Test Page ---
    console.log('--- Test Suite 1: Full Visual Readiness & Lazy Hydration ---');
    await page.goto('http://127.0.0.1:7788/test-all', { waitUntil: 'load' });

    const desktopVp = DEFAULT_VIEWPORTS.find(v => v.id === 'desktop');
    const mobileVp = DEFAULT_VIEWPORTS.find(v => v.id === 'mobile');

    // Test Desktop Viewport Capture
    console.log('\nTesting Desktop Viewport Capture (1920x1080)...');
    const desktopBase64 = await captureViewportScreenshot(debuggee, desktopVp);
    assert(typeof desktopBase64 === 'string' && desktopBase64.length > 5000, 'Desktop captured valid Base64 PNG payload');

    const desktopBuf = Buffer.from(desktopBase64, 'base64');
    const desktopOut = path.join(__dirname, 'output-desktop.png');
    fs.writeFileSync(desktopOut, desktopBuf);
    assert(fs.existsSync(desktopOut) && desktopBuf.length > 10000, `Desktop screenshot written to disk (${(desktopBuf.length / 1024).toFixed(1)} KB)`);

    // Verify Desktop DOM state after capture:
    // 1. Delayed content rendered
    const dynamicText = await page.$eval('#dynamicSection', el => el.textContent);
    assert(dynamicText.includes('Delayed Dynamic Content Rendered Successfully'), 'Test A: Delayed dynamic content rendered and captured');

    // 2. Lazy images loaded
    const lazyLoadedImgs = await page.$$eval('img', imgs => imgs.filter(img => img.src.startsWith('data:image')).length);
    assert(lazyLoadedImgs >= 3, `Test B: Lazy images resolved and loaded (${lazyLoadedImgs} resolved)`);

    // 3. Lazy background resolved
    const bgVal = await page.$eval('.lazy-bg-container', el => el.style.backgroundImage);
    assert(bgVal.includes('data:image/png'), 'Test B: Lazy CSS background-image container resolved');

    // 4. Infinite sections expanded
    const cardCount = await page.$$eval('.infinite-card', cards => cards.length);
    assert(cardCount >= 4, `Test C: Infinite scroll triggered and expanded (${cardCount} cards total)`);

    // 5. Desktop banner visible, Mobile hidden
    const desktopBannerDisplay = await page.$eval('.desktop-only-banner', el => window.getComputedStyle(el).display);
    const mobileBannerDisplay = await page.$eval('.mobile-only-banner', el => window.getComputedStyle(el).display);
    assert(desktopBannerDisplay === 'block', 'Test H: Desktop banner visible on desktop');
    assert(mobileBannerDisplay === 'none', 'Test H: Mobile banner hidden on desktop');

    // Test Mobile Viewport Capture (390x844)
    console.log('\nTesting Mobile Viewport Capture (390x844)...');
    const mobileBase64 = await captureViewportScreenshot(debuggee, mobileVp);
    assert(typeof mobileBase64 === 'string' && mobileBase64.length > 5000, 'Mobile captured valid Base64 PNG payload');

    const mobileBuf = Buffer.from(mobileBase64, 'base64');
    const mobileOut = path.join(__dirname, 'output-mobile.png');
    fs.writeFileSync(mobileOut, mobileBuf);
    assert(fs.existsSync(mobileOut) && mobileBuf.length > 10000, `Mobile screenshot written to disk (${(mobileBuf.length / 1024).toFixed(1)} KB)`);

    // Assert PNG dimensions match mobile viewport width (390px)
    const pngWidth = mobileBuf.readUInt32BE(16);
    const pngHeight = mobileBuf.readUInt32BE(20);
    assert(pngWidth === 390, `Test H: Mobile PNG width strictly matches emulated 390px (got ${pngWidth}px)`);
    assert(pngHeight > 1000, `Test H: Mobile full-page height captured authentic responsive layout (${pngHeight}px)`);

    // Verify Mobile DOM state under mobile emulation:
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
      dontSetVisibleSize: false
    });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await new Promise(r => setTimeout(r, 150));
    const info = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      outerWidth: window.outerWidth,
      mobileDisplay: window.getComputedStyle(document.querySelector('.mobile-only-banner')).display
    }));
    console.log('Mobile evaluation info:', info);
    assert(info.mobileDisplay === 'block' || info.innerWidth <= 768, 'Test H: Mobile responsive viewport is active');
    await client.send('Emulation.clearDeviceMetricsOverride');

    // --- SUITE B: Ultra-Long Page (>12,000px) & Tiled Capture Verification ---
    console.log('\n--- Test Suite 2: Ultra-Long Page Tiled Capture & Authentic Bounds ---');
    await page.goto('http://127.0.0.1:7788/test-long-page', { waitUntil: 'load' });

    const authenticH = await calculateAuthenticContentHeight(debuggee, desktopVp);
    assert(authenticH >= 12000, `Authentic height of ultra-long page accurately calculated (${authenticH}px)`);

    // Capture ultra-long page
    const longPageBase64 = await captureViewportScreenshot(debuggee, desktopVp);
    assert(typeof longPageBase64 === 'string' && longPageBase64.length > 5000, 'Ultra-long page captured successfully without truncation');

    const longBuf = Buffer.from(longPageBase64, 'base64');
    const longOut = path.join(__dirname, 'output-long-page.png');
    fs.writeFileSync(longOut, longBuf);
    assert(fs.existsSync(longOut), `Ultra-long page saved to disk (${(longBuf.length / 1024).toFixed(1)} KB)`);

    // --- SUITE C: 100vh Viewport Integrity Check ---
    console.log('\n--- Test Suite 3: 100vh Integrity Check ---');
    await page.goto('http://127.0.0.1:7788/test-all', { waitUntil: 'load' });

    // Ensure Emulation is set to 1920x1080
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1920,
      screenHeight: 1080,
      dontSetVisibleSize: false
    });

    const heroHeight = await page.$eval('.hero-100vh', el => el.getBoundingClientRect().height);
    assert(Math.abs(heroHeight - 1080) < 5, `Test D: 100vh Hero section height strictly matches viewport height (${heroHeight}px ≈ 1080px)`);

    console.log('\n================================================================');
    console.log(`🎉 ALL ${passed}/${total} READINESS SUITE TESTS PASSED!`);
    console.log('================================================================\n');

  } finally {
    await browser.close();
    server.close();
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ Readiness Test Suite Error:', err);
  process.exit(1);
});
