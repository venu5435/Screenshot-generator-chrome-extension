import { chromium } from 'playwright';
import fs from 'fs';

async function testAuthoritativePipeline() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  console.log('Navigating to https://imagecrane.com/gallery/...');
  await page.goto('https://imagecrane.com/gallery/', { waitUntil: 'load', timeout: 30000 });

  const viewports = [
    { id: 'desktop', name: 'Large Desktop (1920x1080)', width: 1920, defaultHeight: 1080, mobile: false },
    { id: 'mobile',  name: 'Mobile (390x844)',           width: 390,  defaultHeight: 844,  mobile: true }
  ];

  for (const vp of viewports) {
    console.log(`\n--- Testing Viewport: ${vp.name} ---`);
    
    // 1. Set initial device metrics
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.defaultHeight,
      deviceScaleFactor: 1,
      mobile: vp.mobile,
      screenWidth: vp.width,
      screenHeight: vp.defaultHeight,
      dontSetVisibleSize: false
    });

    if (vp.mobile) {
      try {
        await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await client.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
      } catch {}
    }

    // 2. Wait for readyState complete & trigger resize
    await page.evaluate(() => {
      ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'resize'].forEach(t => {
        try {
          window.dispatchEvent(new Event(t, { bubbles: true }));
          document.dispatchEvent(new Event(t, { bubbles: true }));
        } catch(e) {}
      });
    });
    await new Promise(r => setTimeout(r, 400));

    // 3. Scroll slowly in steps equal to window.innerHeight * 0.75, waiting 150ms per step
    const hydrationLog = await page.evaluate(async (defH) => {
      const resolveLazyElements = () => {
        const lazyImgs = document.querySelectorAll('img, picture source, [data-bg], [data-background], [data-lazy-src]');
        lazyImgs.forEach(el => {
          const ds = el.dataset || {};
          const realSrc = ds.src || ds.lazySrc || ds.rocketLazySrc || ds.original || ds.lazyload || ds.srcRetina || ds.image;
          const realSrcset = ds.srcset || ds.lazySrcset || ds.rocketLazySrcset;
          
          if (realSrc && (!el.src || el.src.startsWith('data:image/svg') || el.src.includes('1x1') || el.src.startsWith('data:image/gif') || el.src === '')) {
            el.src = realSrc;
          }
          if (realSrcset && (!el.srcset || el.srcset.startsWith('data:image/svg') || el.srcset === '')) {
            el.srcset = realSrcset;
          }
          if (el.tagName === 'IMG') {
            el.loading = 'eager';
            el.decoding = 'sync';
          }
          el.classList.remove('lazyload', 'lazyloading');
          el.classList.add('lazyloaded');
        });
      };

      resolveLazyElements();

      const getDocHeight = () => Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0,
        window.innerHeight || 0
      );

      let currentPos = 0;
      let totalHeight = getDocHeight();
      const step = Math.max(Math.floor((window.innerHeight || defH) * 0.75), 200);

      while (currentPos < Math.min(totalHeight, 16384)) {
        currentPos += step;
        window.scrollTo(0, currentPos);
        window.dispatchEvent(new Event('scroll', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        resolveLazyElements();
        totalHeight = getDocHeight();
      }

      window.scrollTo(0, totalHeight);
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
      window.dispatchEvent(new Event('resize', { bubbles: true }));
      resolveLazyElements();

      // Force all images to complete loading
      const pending = Array.from(document.images).filter(img => !img.complete);
      if (pending.length > 0) {
        await Promise.all(
          pending.map(img => new Promise(resolve => {
            img.onload = img.onerror = resolve;
            setTimeout(resolve, 1500);
          }))
        );
      }

      // Scroll back to (0, 0)
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      window.dispatchEvent(new Event('resize', { bubbles: true }));

      return { totalHeight, pendingCount: pending.length };
    }, vp.defaultHeight);

    console.log('Hydration completed:', hydrationLog);

    // Wait 600ms for sticky headers & body margins
    await new Promise(r => setTimeout(r, 600));

    // Eliminate bottom whitespace
    await page.evaluate(() => {
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
    });

    // Authoritative layout metrics from CDP
    const metrics = await client.send('Page.getLayoutMetrics');
    const measuredHeight = Math.ceil(metrics.contentSize.height);
    const clampedHeight = Math.max(Math.min(measuredHeight, 16384), vp.defaultHeight);
    console.log(`Measured content height from CDP: ${measuredHeight}px (Clamped: ${clampedHeight}px)`);

    // Update Emulation.setDeviceMetricsOverride with authoritative height
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: clampedHeight,
      deviceScaleFactor: 1,
      mobile: vp.mobile,
      screenWidth: vp.width,
      screenHeight: clampedHeight,
      dontSetVisibleSize: false
    });

    // 400ms restabilization pause
    await new Promise(r => setTimeout(r, 400));

    // Ensure top scroll
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    });

    // Capture screenshot
    const shot = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: 0,
        y: 0,
        width: vp.width,
        height: clampedHeight,
        scale: 1
      },
      captureBeyondViewport: true,
      fromSurface: true
    });

    const outPath = `./test/authoritative-${vp.id}.png`;
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    console.log(`Saved ${outPath} (${shot.data.length} bytes)`);

    // Reset overrides
    await client.send('Emulation.clearDeviceMetricsOverride');
  }

  await browser.close();
  console.log('\n✅ Authoritative layout-driven capture test completed successfully!');
}

testAuthoritativePipeline().catch(console.error);
