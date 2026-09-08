/**
 * Website Screenshots Generator v2.4 - Authoritative Layout-Driven Capture Engine
 * Chrome DevTools Protocol (CDP) Capture Engine for Client-Rendered & Builder Sites:
 * 1. Active Viewport Hydration (Media query adaptation, WP Rocket/lazyloader event wake-up).
 * 2. Stepwise Scroll (window.innerHeight * 0.75 / 150ms delay) with forced lazy attribute resolution.
 * 3. Guaranteed Image Completion & Top Scroll Restabilization (600ms pause for sticky headers).
 * 4. Detached Trailing Height Cleanup (document.documentElement/body.style.height = 'auto').
 * 5. Authoritative Layout Metrics via CDP (Page.getLayoutMetrics contentSize.height).
 * 6. Explicit Clip Capture matching authoritative dimensions with animation freezing.
 * 7. Clean Emulation.clearDeviceMetricsOverride reset after every single viewport capture.
 */

export const DEFAULT_VIEWPORTS = [
  { id: 'desktop', name: 'Large Desktop (1920x1080)', width: 1920, defaultHeight: 1080, typicalHeight: 1080, mobile: false, deviceScaleFactor: 1, folder: 'desktop-1920' },
  { id: 'laptop',  name: 'Laptop (1366x768)',         width: 1366, defaultHeight: 768,  typicalHeight: 768,  mobile: false, deviceScaleFactor: 1, folder: 'laptop-1366' },
  { id: 'medium',  name: 'Desktop/Laptop (1280x720)',  width: 1280, defaultHeight: 720,  typicalHeight: 720,  mobile: false, deviceScaleFactor: 1, folder: 'medium-1280' },
  { id: 'tablet',  name: 'Tablet (768x1024)',          width: 768,  defaultHeight: 1024, typicalHeight: 1024, mobile: true,  deviceScaleFactor: 1, folder: 'tablet-768' },
  { id: 'mobile',  name: 'Mobile (390x844)',           width: 390,  defaultHeight: 844,  typicalHeight: 844,  mobile: true,  deviceScaleFactor: 1, folder: 'mobile-390' }
];

// GPU hardware rendering limit ceiling to prevent CDP memory crashes
export const MAX_HARDWARE_HEIGHT = 16384;
// Minimum acceptable Base64 length (~5KB payload) to guard against blank captures
export const MIN_PAYLOAD_BASE64_LENGTH = 5000;

/**
 * Promisified wrapper for chrome.debugger.sendCommand with safe lastError consumption.
 */
export function sendCDPCommand(debuggee, method, params = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.debugger.sendCommand(debuggee, method, params, (result) => {
        const err = chrome.runtime.lastError;
        if (err) {
          return reject(new Error(`CDP ${method} failed: ${err.message}`));
        }
        resolve(result || {});
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Attaches the debugger to a tab, safely handling already attached states.
 */
export async function attachDebugger(tabId) {
  const debuggee = { tabId };
  return new Promise((resolve, reject) => {
    try {
      chrome.debugger.attach(debuggee, '1.3', () => {
        const err = chrome.runtime.lastError;
        if (err) {
          const msg = err.message || '';
          if (msg.includes('Already attached') || msg.includes('Another debugger is already attached')) {
            return resolve(debuggee);
          }
          return reject(new Error(`Failed to attach debugger to tab ${tabId}: ${msg}`));
        }
        resolve(debuggee);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Detaches the debugger from a tab safely, consuming any runtime.lastError.
 */
export async function detachDebugger(tabId) {
  const debuggee = { tabId };
  return new Promise((resolve) => {
    try {
      chrome.debugger.detach(debuggee, () => {
        if (chrome.runtime.lastError) {
          // Tab was already detached or closed - safely consumed
        }
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

/**
 * Helper to pause execution for a given number of milliseconds.
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Deterministic Page-Ready Detection:
 * Waits for document.readyState === 'complete', web font settling (document.fonts.ready),
 * and 400ms of DOM quiescence.
 */
export async function waitForPageQuiescence(debuggee, maxWaitMs = 4000) {
  const expr = `
    new Promise((resolve) => {
      const startTime = Date.now();

      const proceedToDOMQuiescence = () => {
        let lastMutation = Date.now();
        const observer = new MutationObserver(() => {
          lastMutation = Date.now();
        });

        try {
          const target = document.documentElement || document.body || document;
          observer.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
          });
        } catch (e) {}

        const interval = setInterval(() => {
          const now = Date.now();
          const idleTime = now - lastMutation;
          const totalElapsed = now - startTime;

          if (idleTime >= 400 || totalElapsed >= ${maxWaitMs}) {
            clearInterval(interval);
            observer.disconnect();
            resolve({ complete: true, idleTime, totalElapsed });
          }
        }, 100);
      };

      const checkState = () => {
        if (document.readyState === 'complete') {
          if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(proceedToDOMQuiescence).catch(proceedToDOMQuiescence);
          } else {
            proceedToDOMQuiescence();
          }
        } else {
          setTimeout(checkState, 100);
        }
      };

      checkState();
    })
  `;

  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true
    });
  } catch {
    await sleep(400);
  }
}

/**
 * Client-Side Gallery & Grid Viewport Hydration:
 * 1. Sets Emulation.setDeviceMetricsOverride to authentic viewport dimensions.
 * 2. Waits for document.readyState === 'complete'.
 * 3. Dispatches resize and simulated interaction events, waiting 400ms for masonry/grids to adapt.
 * 4. Scrolls in steps of window.innerHeight * 0.75, pausing 150ms per step to trigger lazy loaders.
 * 5. Forces all images to complete loading with a safety fallback.
 * 6. Scrolls back to (0, 0) and waits 600ms for sticky headers, fixed wrappers, and body margins to restabilize.
 */
export async function hydrateViewport(debuggee, viewport) {
  const defaultHeight = viewport.defaultHeight || viewport.typicalHeight || 800;
  const isMobile = Boolean(viewport.mobile);

  // 1. Set initial device metrics override for responsive layout adaptation
  await sendCDPCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: defaultHeight,
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    mobile: isMobile,
    screenWidth: viewport.width,
    screenHeight: defaultHeight,
    dontSetVisibleSize: false
  });

  if (isMobile) {
    try {
      await sendCDPCommand(debuggee, 'Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 5
      });
      await sendCDPCommand(debuggee, 'Emulation.setEmitTouchEventsForMouse', {
        enabled: true,
        configuration: 'mobile'
      });
    } catch {}
  }

  // 2. Wait for document.readyState === 'complete' & font settling
  await waitForPageQuiescence(debuggee, 2500);

  // 3. Dispatch simulated user interaction events & resize for WP Rocket / Masonry recomputation
  await sendCDPCommand(debuggee, 'Runtime.evaluate', {
    expression: `
      (function() {
        ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'resize'].forEach(type => {
          try {
            window.dispatchEvent(new Event(type, { bubbles: true }));
            document.dispatchEvent(new Event(type, { bubbles: true }));
          } catch(e) {}
        });
      })()
    `
  });

  // Wait 400ms for responsive masonry / galleries to recompute dimensions
  await sleep(400);

  // 4. Stepwise scroll (window.innerHeight * 0.75 / 150ms delay) with lazy image attribute resolution
  const stepwiseScrollScript = `
    new Promise(async (resolve) => {
      try {
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
        const step = Math.max(Math.floor((window.innerHeight || ${defaultHeight}) * 0.75), 200);
        const maxScrollCeiling = ${MAX_HARDWARE_HEIGHT};

        while (currentPos < Math.min(totalHeight, maxScrollCeiling)) {
          currentPos += step;
          window.scrollTo(0, currentPos);
          window.dispatchEvent(new Event('scroll', { bubbles: true }));
          await new Promise(r => setTimeout(r, 150));
          resolveLazyElements();
          totalHeight = getDocHeight();
        }

        // Scroll to the absolute bottom edge
        window.scrollTo(0, totalHeight);
        window.dispatchEvent(new Event('scroll', { bubbles: true }));
        window.dispatchEvent(new Event('resize', { bubbles: true }));
        resolveLazyElements();

        // 5. Force all images to complete loading
        const pendingImages = Array.from(document.images).filter(img => !img.complete);
        if (pendingImages.length > 0) {
          await Promise.all(
            pendingImages.map(img => new Promise(res => {
              img.onload = img.onerror = res;
              setTimeout(res, 1500); // safety fallback
            }))
          );
        }

        // 6. Scroll back to (0, 0)
        window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        window.dispatchEvent(new Event('resize', { bubbles: true }));

        resolve(true);
      } catch (e) {
        resolve(false);
      }
    })
  `;

  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', {
      expression: stepwiseScrollScript,
      awaitPromise: true,
      returnByValue: true
    });
  } catch {}

  // 6. Wait 600ms for sticky headers, fixed wrappers, and body margins to restabilize
  await sleep(600);
}

/**
 * Injects CSS to freeze CSS animations and transitions so elements aren't captured mid-fade/blank.
 */
export async function freezeAnimations(debuggee) {
  const freezeExpr = `
    (function() {
      const styleId = '__ws_screenshot_freeze_styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = '* { animation-play-state: paused !important; transition: none !important; }';
        (document.head || document.documentElement).appendChild(style);
      }
    })()
  `;
  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', { expression: freezeExpr });
  } catch {}
}

/**
 * Removes injected animation freezing stylesheet.
 */
export async function unfreezeAnimations(debuggee) {
  const unfreezeExpr = `
    (function() {
      const el = document.getElementById('__ws_screenshot_freeze_styles');
      if (el) el.remove();
    })()
  `;
  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', { expression: unfreezeExpr });
  } catch {}
}

/**
 * Initial Deep Hydration & 5-Second Settle Phase:
 * Progressively scrolls page to bottom and pauses for 5 full seconds before per-viewport captures.
 */
export async function warmUpAndHydratePage(debuggee, callbacks = {}) {
  const {
    onStatus = () => {},
    checkCancelled = () => false
  } = callbacks;

  onStatus('Warming up page assets and scrolling to bottom...');

  try {
    await sendCDPCommand(debuggee, 'Emulation.setFocusEmulationEnabled', { enabled: true });
  } catch {}

  // Initial desktop viewport for discovery
  try {
    await sendCDPCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1920,
      screenHeight: 1080,
      dontSetVisibleSize: false
    });
  } catch {}

  await waitForPageQuiescence(debuggee, 3000);
  if (checkCancelled()) return;

  // Scroll to bottom
  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', {
      expression: `
        new Promise(async (resolve) => {
          let pos = 0;
          const getH = () => Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.scrollHeight : 0);
          while (pos < Math.min(getH(), ${MAX_HARDWARE_HEIGHT})) {
            pos += 350;
            window.scrollTo(0, pos);
            await new Promise(r => setTimeout(r, 45));
          }
          window.scrollTo(0, getH());
          resolve(true);
        })
      `,
      awaitPromise: true
    });
  } catch {}

  if (checkCancelled()) return;

  // 5-Second Settle Phase at page bottom
  for (let s = 5; s >= 1; s--) {
    if (checkCancelled()) return;
    onStatus(`Reached bottom of page. Waiting ${s}s for all lazy sections & assets to finish loading...`);
    await sleep(1000);
  }

  // Scroll back to top
  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', {
      expression: 'window.scrollTo(0, 0); if (document.documentElement) document.documentElement.scrollTop = 0; if (document.body) document.body.scrollTop = 0;'
    });
  } catch {}

  await sleep(800);
  try {
    await sendCDPCommand(debuggee, 'Emulation.clearDeviceMetricsOverride');
  } catch {}

  onStatus('Page fully loaded & hydrated! Ready for viewport captures.');
}

/**
 * Authoritative Layout-Driven Screenshot Capture for a Single Viewport:
 * 1. Hydrates viewport (resizes, dispatches interactions, stepwise scrolls, loads all images).
 * 2. Injects detached trailing height cleanup (document.documentElement/body.style.height = 'auto').
 * 3. Authoritative Height Measurement via CDP (Page.getLayoutMetrics contentSize.height).
 * 4. Clamps height: Math.max(Math.min(contentSize.height, 16384), viewport.defaultHeight).
 * 5. Updates Emulation.setDeviceMetricsOverride with authoritative height.
 * 6. Adds 400ms layout restabilization pause.
 * 7. Freezes CSS animations and captures via Page.captureScreenshot with matching clip.
 * 8. Resets overrides with Emulation.clearDeviceMetricsOverride in finally.
 * 
 * @param {object} debuggee - { tabId }
 * @param {object} viewport - Viewport definition
 * @returns {Promise<string>} - Base64 PNG image string.
 */
export async function captureViewportScreenshot(debuggee, viewport) {
  const defaultHeight = viewport.defaultHeight || viewport.typicalHeight || 800;
  const isMobile = Boolean(viewport.mobile);
  const targetWidth = viewport.width;

  try {
    // 1. Fix Client-Side Gallery & Grid Hydration
    await hydrateViewport(debuggee, viewport);

    // 2. Eliminate Bottom Whitespace: clean up detached trailing heights
    try {
      await sendCDPCommand(debuggee, 'Runtime.evaluate', {
        expression: `
          document.documentElement.style.height = 'auto';
          document.body.style.height = 'auto';
        `
      });
    } catch {}

    // 3. Authoritative Height Measurement via CDP (No DOM Guesswork)
    const metrics = await sendCDPCommand(debuggee, 'Page.getLayoutMetrics');
    const rawContentHeight = metrics?.contentSize?.height || metrics?.cssContentSize?.height || defaultHeight;

    // Guardrail clamping
    const clampedHeight = Math.max(
      Math.min(Math.ceil(rawContentHeight), MAX_HARDWARE_HEIGHT),
      defaultHeight
    );

    // 4. Update Emulation.setDeviceMetricsOverride with authoritative content height
    await sendCDPCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      width: targetWidth,
      height: clampedHeight,
      deviceScaleFactor: viewport.deviceScaleFactor || 1,
      mobile: isMobile,
      screenWidth: targetWidth,
      screenHeight: clampedHeight,
      dontSetVisibleSize: false
    });

    // 5. Layout restabilization pause (400ms)
    await sleep(400);

    // 6. Freeze CSS animations & transitions before snapshot
    await freezeAnimations(debuggee);

    // Ensure scroll is at absolute top (0, 0)
    try {
      await sendCDPCommand(debuggee, 'Runtime.evaluate', {
        expression: 'window.scrollTo(0, 0); if (document.documentElement) document.documentElement.scrollTop = 0; if (document.body) document.body.scrollTop = 0;'
      });
    } catch {}
    await sleep(100);

    // 7. Capture screenshot using explicit clip boundaries matching metrics.contentSize
    let screenshot = await sendCDPCommand(debuggee, 'Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: 0,
        y: 0,
        width: targetWidth,
        height: clampedHeight,
        scale: 1
      },
      captureBeyondViewport: true,
      fromSurface: true
    });

    // 8. Blank Check Validation: retry once if payload < 5KB
    const isBlankOrCorrupt = !screenshot || !screenshot.data || screenshot.data.length < MIN_PAYLOAD_BASE64_LENGTH;
    if (isBlankOrCorrupt) {
      await sleep(800);
      screenshot = await sendCDPCommand(debuggee, 'Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: 0,
          y: 0,
          width: targetWidth,
          height: clampedHeight,
          scale: 1
        },
        captureBeyondViewport: true,
        fromSurface: true
      });
    }

    if (!screenshot || !screenshot.data) {
      throw new Error(`Screenshot capture failed for viewport "${viewport.name}" - empty response.`);
    }

    return screenshot.data;
  } finally {
    // 9. Clean state restoration - reset overrides with Emulation.clearDeviceMetricsOverride after every single viewport capture
    await unfreezeAnimations(debuggee);
    try {
      await sendCDPCommand(debuggee, 'Emulation.clearDeviceMetricsOverride');
    } catch {}
  }
}

/**
 * High-level orchestration for capturing all requested viewports on a tab:
 * 1. Attaches debugger once per page.
 * 2. Runs warmUpAndHydratePage (deep scroll + 5s bottom wait + font/image completion + return to top).
 * 3. Loops through each selected viewport and captures pixel-perfect full-height screenshots.
 * 4. Detaches debugger cleanly in finally block.
 * 
 * @param {number} tabId - Target tab ID.
 * @param {object[]} viewports - Array of viewports to capture.
 * @param {object} callbacks - { onStatus, onViewportStart, onViewportDone, checkCancelled }
 * @returns {Promise<Array<{ viewport: object, base64: string }>>}
 */
export async function captureAllViewportsForTab(tabId, viewports, callbacks = {}) {
  const {
    onStatus = () => {},
    onViewportStart = () => {},
    onViewportDone = () => {},
    checkCancelled = () => false
  } = callbacks;

  const debuggee = await attachDebugger(tabId);
  const results = [];

  try {
    // Enable core CDP domains
    await sendCDPCommand(debuggee, 'Page.enable');
    await sendCDPCommand(debuggee, 'DOM.enable');
    try {
      await sendCDPCommand(debuggee, 'Runtime.enable');
    } catch {}

    // Step 1: Initial Deep Hydration & 5-Second Settle Phase
    await warmUpAndHydratePage(debuggee, {
      onStatus,
      checkCancelled
    });

    if (checkCancelled()) {
      return results;
    }

    // Step 2: Authoritative layout-driven capture for each responsive device viewport
    for (let i = 0; i < viewports.length; i++) {
      if (checkCancelled()) {
        break;
      }

      const viewport = viewports[i];
      onViewportStart(viewport, i, viewports.length);

      const base64Data = await captureViewportScreenshot(debuggee, viewport);
      results.push({
        viewport,
        base64: base64Data
      });

      onViewportDone(viewport, i, viewports.length);
    }
  } finally {
    // Always cleanly clear device metrics & detach debugger
    try {
      await sendCDPCommand(debuggee, 'Emulation.clearDeviceMetricsOverride');
    } catch {}
    await detachDebugger(tabId);
  }

  return results;
}
