import { chromium } from 'playwright';
import fs from 'fs';

async function testFullGallery() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  console.log('Navigating to https://imagecrane.com/gallery/...');
  await page.goto('https://imagecrane.com/gallery/', { waitUntil: 'load', timeout: 30000 });

  // Function to deeply hydrate and scroll the page for ANY viewport
  const hydrateForViewport = async (width, height, isMobile) => {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
      screenWidth: width,
      screenHeight: height,
      dontSetVisibleSize: false
    });

    if (isMobile) {
      try {
        await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await client.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
      } catch {}
    }

    // Let responsive CSS media queries apply
    await new Promise(r => setTimeout(r, 400));

    // Force swap all lazy images and trigger interaction events
    await page.evaluate(async () => {
      // Dispatch interaction events
      ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'resize'].forEach(t => {
        try {
          window.dispatchEvent(new Event(t, { bubbles: true }));
          document.dispatchEvent(new Event(t, { bubbles: true }));
        } catch(e) {}
      });

      // Force resolve all data-src / data-srcset / data-lazy-src
      const imgs = document.querySelectorAll('img, picture source, [data-bg], [data-background]');
      imgs.forEach(el => {
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

      // Smooth scroll through entire page
      const getH = () => Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0,
        window.innerHeight || 0
      );

      let cur = 0;
      let total = getH();
      while (cur < total) {
        cur += 350;
        window.scrollTo(0, cur);
        window.dispatchEvent(new Event('scroll', { bubbles: true }));
        await new Promise(r => setTimeout(r, 40));
        total = getH();
      }

      window.scrollTo(0, total);
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // Wait 2.5s at bottom for images & masonry to complete
    await new Promise(r => setTimeout(r, 2500));

    // Ensure all images are complete
    await page.evaluate(async () => {
      const imgs = Array.from(document.images || []);
      await Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(res => {
          img.onload = img.onerror = res;
          setTimeout(res, 2000);
        });
      }));

      // Trigger resize for masonry layouts
      window.dispatchEvent(new Event('resize', { bubbles: true }));
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    });

    await new Promise(r => setTimeout(r, 800));
  };

  // 1. Hydrate & Capture Desktop
  console.log('Hydrating & capturing Desktop (1920x1080)...');
  await hydrateForViewport(1920, 1080, false);
  const layoutDesktop = await client.send('Page.getLayoutMetrics');
  const hDesktop = Math.round(layoutDesktop.cssContentSize?.height || layoutDesktop.contentSize?.height || 2000);
  console.log('Desktop content height:', hDesktop);

  const shotDesktop = await client.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 1920, height: hDesktop, scale: 1 },
    captureBeyondViewport: true,
    fromSurface: true
  });
  fs.writeFileSync('./test/gallery-desktop-perfect.png', Buffer.from(shotDesktop.data, 'base64'));
  console.log('Saved ./test/gallery-desktop-perfect.png, size:', shotDesktop.data.length);

  // 2. Hydrate & Capture Mobile
  console.log('Hydrating & capturing Mobile (390x844)...');
  await hydrateForViewport(390, 844, true);
  const layoutMobile = await client.send('Page.getLayoutMetrics');
  const hMobile = Math.round(layoutMobile.cssContentSize?.height || layoutMobile.contentSize?.height || 2000);
  console.log('Mobile content height:', hMobile);

  const shotMobile = await client.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 390, height: hMobile, scale: 1 },
    captureBeyondViewport: true,
    fromSurface: true
  });
  fs.writeFileSync('./test/gallery-mobile-perfect.png', Buffer.from(shotMobile.data, 'base64'));
  console.log('Saved ./test/gallery-mobile-perfect.png, size:', shotMobile.data.length);

  await browser.close();
  console.log('Finished testing full gallery!');
}

testFullGallery().catch(console.error);
