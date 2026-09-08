import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to https://imagecrane.com/gallery/...');
  await page.goto('https://imagecrane.com/gallery/', { waitUntil: 'load', timeout: 30000 });

  await page.evaluate(async () => {
    // 1. Trigger user interaction events for WP Rocket / script delayers
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(type => {
      try {
        window.dispatchEvent(new Event(type, { bubbles: true }));
        document.dispatchEvent(new Event(type, { bubbles: true }));
      } catch(e) {}
    });

    // 2. Force resolve all lazy-loaded image attributes
    const lazyImgs = document.querySelectorAll('img, picture source, [data-bg], [data-background]');
    lazyImgs.forEach(el => {
      const ds = el.dataset || {};
      const realSrc = ds.src || ds.lazySrc || ds.rocketLazySrc || ds.original || ds.lazyload;
      const realSrcset = ds.srcset || ds.lazySrcset || ds.rocketLazySrcset;
      
      if (realSrc && (!el.src || el.src.startsWith('data:image/svg') || el.src.includes('1x1') || el.src.startsWith('data:image/gif'))) {
        el.src = realSrc;
      }
      if (realSrcset && (!el.srcset || el.srcset.startsWith('data:image/svg'))) {
        el.srcset = realSrcset;
      }
      if (el.tagName === 'IMG') {
        el.loading = 'eager';
        el.decoding = 'sync';
      }
      el.classList.remove('lazyload', 'lazyloading');
      el.classList.add('lazyloaded');
    });

    // 3. Smooth scroll down through the entire document
    const getDocHeight = () => Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.offsetHeight : 0,
      document.documentElement ? document.documentElement.offsetHeight : 0,
      window.innerHeight || 0
    );

    let totalH = getDocHeight();
    let cur = 0;
    const step = 300;
    while (cur < totalH) {
      cur += step;
      window.scrollTo(0, cur);
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));
      totalH = getDocHeight();
    }

    window.scrollTo(0, totalH);
    window.dispatchEvent(new Event('scroll', { bubbles: true }));
    window.dispatchEvent(new Event('resize', { bubbles: true }));
  });

  console.log('Waiting 5s at bottom for gallery & assets to settle...');
  await page.waitForTimeout(5000);

  // Trigger resize & masonry layout update
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize', { bubbles: true }));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);

  // Take full screenshot
  const out = './test/gallery-enhanced-desktop.png';
  await page.screenshot({ path: out, fullPage: true });
  console.log('Saved enhanced gallery screenshot, size:', fs.statSync(out).size);

  await browser.close();
}

run().catch(console.error);
