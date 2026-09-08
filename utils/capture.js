/**
 * Website Screenshots Generator v2.4 - Robust Visual-Readiness & Multi-Viewport Capture Engine
 * 
 * Architectural Highlights:
 * 1. Authentic Device Viewport Emulation (1920x1080, 1366x768, 1280x720, 768x1024, 390x844).
 *    NEVER overrides device viewport height to page height, preserving 100vh hero sections and media queries.
 * 2. Multi-Stage Visual Readiness Engine (waitForPageFullyRendered):
 *    - Navigation & WebFont loading (document.readyState === 'complete' & document.fonts.ready).
 *    - Interactive stimulus events to awaken page-builders (Elementor, Beaver Builder, Webflow, WP-Rocket).
 *    - Stepwise progressive scrolling with dynamic height detection & lazy loading.
 *    - Comprehensive lazy-asset resolution (data-src, data-srcset, data-rocket-lazy-src, picture, CSS bg).
 *    - Visual & height stability detector across multi-sample windows.
 *    - Image & media completion waiter with safe timeout fallbacks.
 *    - Safe animation completion & freezing (guaranteeing opacity = 1 and settled transitions).
 * 3. Authentic Content Bounds & Trailing Whitespace Elimination.
 * 4. High-Dimension Tiled Capture & Stitching Engine (>8,192px / 16,384px) with repeating sticky header suppression.
 */

export const DEFAULT_VIEWPORTS = [
  { id: 'desktop', name: 'Large Desktop (1920x1080)', width: 1920, defaultHeight: 1080, typicalHeight: 1080, mobile: false, deviceScaleFactor: 1, folder: 'desktop-1920' },
  { id: 'laptop',  name: 'Laptop (1366x768)',         width: 1366, defaultHeight: 768,  typicalHeight: 768,  mobile: false, deviceScaleFactor: 1, folder: 'laptop-1366' },
  { id: 'medium',  name: 'Desktop/Laptop (1280x720)',  width: 1280, defaultHeight: 720,  typicalHeight: 720,  mobile: false, deviceScaleFactor: 1, folder: 'medium-1280' },
  { id: 'tablet',  name: 'Tablet (768x1024)',          width: 768,  defaultHeight: 1024, typicalHeight: 1024, mobile: true,  deviceScaleFactor: 1, folder: 'tablet-768' },
  { id: 'mobile',  name: 'Mobile (390x844)',           width: 390,  defaultHeight: 844,  typicalHeight: 844,  mobile: true,  deviceScaleFactor: 1, folder: 'mobile-390' }
];

// GPU hardware rendering safety threshold ceiling
export const MAX_HARDWARE_HEIGHT = 16384;
// Minimum acceptable Base64 length (~5KB payload) to guard against blank captures
export const MIN_PAYLOAD_BASE64_LENGTH = 5000;

// Centralized screenshot and visual readiness configuration
export const RENDER_CONFIG = {
  initialWait: 800,                   // Initial settle after navigation or viewport switch (ms)
  mutationQuietPeriod: 1200,          // Required DOM mutation silence window (ms)
  heightStablePeriod: 1200,           // Required height stability window (ms)
  scrollStepFactor: 0.7,              // Scroll increment = window.innerHeight * 0.7
  scrollDelay: 180,                   // Delay between scroll steps (ms)
  imageTimeout: 5000,                 // Safety timeout per pending image (ms)
  mediaSettleTime: 1000,              // Settling allowance for dynamic iframe/video posters (ms)
  maxHydrationTime: 35000,            // Maximum cutoff for entire readiness pipeline (ms)
  maxStabilityChecks: 12,             // Max consecutive stability poll cycles
  stabilityCheckInterval: 250,        // Polling interval for stability measurements (ms)
  tiledCaptureHeightThreshold: 10000, // Height beyond which tiled capture is triggered (px)
  tileSliceHeight: 6000,              // Vertical height per tile slice (px)
  debugLogging: true                  // Detailed console and callback logging
};

/**
 * Structured debug logger with optional UI callback dispatch.
 */
export function debugLog(message, level = 'info', onStatus = null) {
  const formatted = `[SCREENSHOT] ${message}`;
  if (RENDER_CONFIG.debugLogging) {
    if (level === 'error') console.error(formatted);
    else if (level === 'warn') console.warn(formatted);
    else console.log(formatted);
  }
  if (typeof onStatus === 'function') {
    try {
      onStatus(message);
    } catch {}
  }
}

/**
 * Promisified wrapper for chrome.debugger.sendCommand with safe lastError consumption.
 */
export function sendCDPCommand(debuggee, method, params = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (!chrome || !chrome.debugger || !chrome.debugger.sendCommand) {
        return reject(new Error('chrome.debugger API is unavailable in current context.'));
      }
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
 * Converts a Uint8Array into a Base64 string in memory-safe chunks.
 */
export function uint8ArrayToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 32768; // 32KB chunks prevent call stack exhaustion
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Backward-compatible quiescence waiter.
 */
export async function waitForPageQuiescence(debuggee, maxWaitMs = 4000) {
  return waitForPageFullyRendered(debuggee, { maxWaitMs });
}

/**
 * Injects safe animation styles to ensure elements with entry animations are fully visible (opacity: 1)
 * and transitions/animations are paused at their final settled state.
 */
export async function freezeAnimations(debuggee) {
  const freezeExpr = `
    (function() {
      const styleId = '__ws_screenshot_freeze_styles';
      let style = document.getElementById(styleId);
      if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        style.textContent = \`
          *, *::before, *::after {
            animation-play-state: paused !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
          /* Ensure elements that fade in with animation aren't frozen in invisible opacity: 0 state */
          [data-aos], .wow, .elementor-invisible, .animate__animated {
            opacity: 1 !important;
            visibility: visible !important;
            transform: none !important;
          }
        \`;
        (document.head || document.documentElement).appendChild(style);
      }
    })()
  `;
  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', { expression: freezeExpr });
  } catch {}
}

/**
 * Removes injected animation freeze styles.
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
 * Robust Multi-Stage Visual Readiness Engine:
 * 1. Checks Navigation & WebFonts readiness (document.readyState === 'complete' & document.fonts.ready).
 * 2. Dispatches simulated interaction & resize events to wake page-builders (Elementor, Webflow, Masonry).
 * 3. Stepwise scrolls top-to-bottom (window.innerHeight * 0.7 per step) with comprehensive lazy resolution.
 * 4. Resolves images, sources, picture tags, background CSS URLs, and WordPress/Elementor lazy attributes.
 * 5. Dynamic height check at bottom: if height increased, scrolls new content until bottom stops expanding.
 * 6. Waits for all visible and relevant images to complete loading (or error out).
 * 7. Scrolls back to top (0, 0) and waits for sticky/fixed elements to restabilize.
 * 8. Visual stability detector: verifies document dimensions & DOM mutation quiet periods across multi-sample window.
 * 9. Freezes animations safely before capture.
 */
export async function waitForPageFullyRendered(debuggee, options = {}) {
  const {
    onStatus = null,
    checkCancelled = () => false,
    maxWaitMs = RENDER_CONFIG.maxHydrationTime,
    viewport = null
  } = options;

  const defaultHeight = viewport?.defaultHeight || 1080;
  const targetWidth = viewport?.width || 1920;

  debugLog('Starting comprehensive visual readiness verification...', 'info', onStatus);

  // 1. Navigation & Font Readiness
  const navCheckScript = `
    new Promise(async (resolve) => {
      const start = Date.now();
      const waitForNav = () => {
        if (document.readyState === 'complete') {
          if (document.fonts && document.fonts.ready) {
            Promise.race([
              document.fonts.ready,
              new Promise(r => setTimeout(r, 2500))
            ]).then(() => resolve(true)).catch(() => resolve(true));
          } else {
            resolve(true);
          }
        } else {
          if (Date.now() - start > 10000) resolve(false);
          else setTimeout(waitForNav, 100);
        }
      };
      waitForNav();
    })
  `;

  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', {
      expression: navCheckScript,
      awaitPromise: true,
      returnByValue: true
    });
    debugLog('Navigation complete & WebFonts ready', 'info', onStatus);
  } catch {
    await sleep(RENDER_CONFIG.initialWait);
  }

  if (checkCancelled()) return;

  // 2. Dispatch simulated interactive stimulus to wake page-builders & observers
  const awakenScript = `
    (function() {
      ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'resize'].forEach(type => {
        try {
          window.dispatchEvent(new Event(type, { bubbles: true }));
          document.dispatchEvent(new Event(type, { bubbles: true }));
        } catch(e) {}
      });
    })()
  `;
  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', { expression: awakenScript });
  } catch {}

  await sleep(250);
  if (checkCancelled()) return;

  // 3. Stepwise Progressive Scrolling with Dynamic Content & Lazy Resolution
  debugLog('Starting progressive lazy-load hydration and scrolling...', 'info', onStatus);

  const progressiveScrollScript = `
    new Promise(async (resolve) => {
      try {
        const resolveLazyElements = () => {
          // 1. Resolve img, picture, source, and custom lazy tags
          const lazyImgs = document.querySelectorAll('img, picture source, [data-bg], [data-background], [data-lazy-src], [data-src], [data-srcset], [data-original], [data-lazyload], [data-rocket-lazy-src], [data-wp-lazy]');
          lazyImgs.forEach(el => {
            const ds = el.dataset || {};
            const realSrc = ds.src || ds.lazySrc || ds.rocketLazySrc || ds.original || ds.lazyload || ds.srcRetina || ds.image || ds.lazy;
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
            // Background images
            const bg = ds.bg || ds.background || ds.backgroundImage;
            if (bg) {
              el.style.backgroundImage = \`url("\${bg}")\`;
            }
            el.classList.remove('lazyload', 'lazyloading', 'elementor-invisible');
            el.classList.add('lazyloaded', 'animated');
          });

          // 2. Resolve CSS background images with data attributes on containers
          const bgContainers = document.querySelectorAll('[style*="data:image"], [data-bg-url], [data-background-image]');
          bgContainers.forEach(el => {
            const bgUrl = el.getAttribute('data-bg-url') || el.getAttribute('data-background-image');
            if (bgUrl) {
              el.style.backgroundImage = \`url("\${bgUrl}")\`;
            }
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
        const step = Math.max(Math.floor((window.innerHeight || ${defaultHeight}) * ${RENDER_CONFIG.scrollStepFactor}), 250);
        const maxScrollCeiling = 100000;
        let lastHeight = totalHeight;
        let heightGrowthCycles = 0;

        // Progressive scroll loop
        while (currentPos < Math.min(totalHeight, maxScrollCeiling)) {
          currentPos += step;
          window.scrollTo(0, currentPos);
          window.dispatchEvent(new Event('scroll', { bubbles: true }));
          await new Promise(r => setTimeout(r, ${RENDER_CONFIG.scrollDelay}));
          resolveLazyElements();
          
          totalHeight = getDocHeight();
          if (totalHeight > lastHeight && currentPos >= lastHeight - step * 2) {
            // Document expanded (infinite scroll or dynamic builder sections)
            lastHeight = totalHeight;
            heightGrowthCycles++;
            if (heightGrowthCycles > 15) break; // Safety cap
          }
        }

        // Final scroll to absolute bottom edge
        window.scrollTo(0, totalHeight);
        window.dispatchEvent(new Event('scroll', { bubbles: true }));
        window.dispatchEvent(new Event('resize', { bubbles: true }));
        resolveLazyElements();

        resolve({ finalHeight: totalHeight, heightGrowthCycles });
      } catch (e) {
        resolve({ error: e.message });
      }
    })
  `;

  try {
    const scrollResult = await sendCDPCommand(debuggee, 'Runtime.evaluate', {
      expression: progressiveScrollScript,
      awaitPromise: true,
      returnByValue: true
    });
    const finalH = scrollResult?.result?.value?.finalHeight || 'unknown';
    debugLog(`Reached bottom of page. Measured height: ${finalH}px`, 'info', onStatus);
  } catch (err) {
    debugLog(`Progressive scroll warning: ${err.message}`, 'warn', onStatus);
  }

  if (checkCancelled()) return;

  // 4. Wait for all visible and relevant images to finish loading
  debugLog('Verifying image completion across DOM...', 'info', onStatus);
  const imageWaiterScript = `
    new Promise(async (resolve) => {
      try {
        const getPending = () => Array.from(document.images).filter(img => !img.complete);
        let pending = getPending();
        let attempts = 0;

        while (pending.length > 0 && attempts < 25) {
          await Promise.all(
            pending.map(img => new Promise(res => {
              if (img.complete) return res();
              img.onload = img.onerror = res;
              setTimeout(res, ${RENDER_CONFIG.imageTimeout});
            }))
          );
          attempts++;
          pending = getPending();
        }

        resolve({ completed: true, remainingPending: pending.length });
      } catch (e) {
        resolve({ completed: false, error: e.message });
      }
    })
  `;

  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', {
      expression: imageWaiterScript,
      awaitPromise: true,
      returnByValue: true
    });
    debugLog('Images verified and completed', 'info', onStatus);
  } catch {}

  if (checkCancelled()) return;

  // 5. Scroll cleanly back to top (0, 0)
  debugLog('Scrolling back to top and waiting for header stabilization...', 'info', onStatus);
  try {
    await sendCDPCommand(debuggee, 'Runtime.evaluate', {
      expression: `
        window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        window.dispatchEvent(new Event('scroll', { bubbles: true }));
        window.dispatchEvent(new Event('resize', { bubbles: true }));
      `
    });
  } catch {}

  // Pause for sticky headers and top-level navigation to restabilize
  await sleep(600);
  if (checkCancelled()) return;

  // 6. Visual & Height Stability Detector
  debugLog('Checking visual and layout stability...', 'info', onStatus);
  const stabilityDetectorScript = `
    new Promise((resolve) => {
      const startTime = Date.now();
      let lastMutationTime = Date.now();
      let lastHeight = -1;
      let consecutiveStableChecks = 0;
      const targetStableChecks = 3; // 3 * 250ms = 750ms of pure stability

      const observer = new MutationObserver(() => {
        lastMutationTime = Date.now();
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
        const totalElapsed = now - startTime;
        const mutationIdle = now - lastMutationTime;

        const currentHeight = Math.max(
          document.body ? document.body.scrollHeight : 0,
          document.documentElement ? document.documentElement.scrollHeight : 0
        );

        if (currentHeight === lastHeight && mutationIdle >= ${RENDER_CONFIG.mutationQuietPeriod}) {
          consecutiveStableChecks++;
        } else {
          consecutiveStableChecks = 0;
          lastHeight = currentHeight;
        }

        if (consecutiveStableChecks >= targetStableChecks || totalElapsed >= 8000) {
          clearInterval(interval);
          observer.disconnect();
          resolve({
            stable: true,
            stableHeight: currentHeight,
            elapsed: totalElapsed
          });
        }
      }, ${RENDER_CONFIG.stabilityCheckInterval});
    })
  `;

  try {
    const stabilityResult = await sendCDPCommand(debuggee, 'Runtime.evaluate', {
      expression: stabilityDetectorScript,
      awaitPromise: true,
      returnByValue: true
    });
    const stableHeight = stabilityResult?.result?.value?.stableHeight || 'stable';
    debugLog(`Visual & height stability confirmed (Height: ${stableHeight}px)`, 'info', onStatus);
  } catch {}

  debugLog('Page visually ready for capture', 'info', onStatus);
}

/**
 * Calculates authentic content boundary and height, filtering out detached white space or inflated body wrappers.
 */
export async function calculateAuthenticContentHeight(debuggee, viewport) {
  const defaultHeight = viewport?.defaultHeight || 1080;

  const calculateScript = `
    (function() {
      const docH = Math.max(
        document.documentElement ? document.documentElement.scrollHeight : 0,
        document.body ? document.body.scrollHeight : 0
      );

      // Inspect bounding rect of visible content elements
      let maxElementBottom = 0;
      try {
        const elements = document.body ? document.body.querySelectorAll('*') : [];
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') continue;
          
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
          if (style.position === 'fixed') continue; // Fixed elements (like chat widgets) shouldn't inflate height

          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const bottom = rect.bottom + window.scrollY;
            if (bottom > maxElementBottom && bottom < 100000) {
              maxElementBottom = bottom;
            }
          }
        }
      } catch (e) {}

      return {
        docHeight: docH,
        maxElementBottom: Math.ceil(maxElementBottom),
        windowInnerHeight: window.innerHeight
      };
    })()
  `;

  try {
    const res = await sendCDPCommand(debuggee, 'Runtime.evaluate', {
      expression: calculateScript,
      returnByValue: true
    });

    const val = res?.result?.value;
    if (val) {
      const { docHeight, maxElementBottom } = val;
      // If maxElementBottom detected authentic visible content boundary, use the maximum of content bottom and defaultHeight
      let chosenHeight = docHeight;
      if (maxElementBottom > 0 && maxElementBottom < docHeight - 150) {
        // Trailing detached whitespace detected: trim to authentic content bottom with safety padding
        chosenHeight = maxElementBottom + 40;
      }
      return Math.max(chosenHeight, defaultHeight);
    }
  } catch {}

  // Fallback to layout metrics via CDP
  try {
    const metrics = await sendCDPCommand(debuggee, 'Page.getLayoutMetrics');
    const layoutH = metrics?.contentSize?.height || metrics?.cssContentSize?.height || defaultHeight;
    return Math.max(Math.ceil(layoutH), defaultHeight);
  } catch {
    return defaultHeight;
  }
}

/**
 * Captures ultra-long pages (>10,000px) using seamless vertical slice tiles and stitches them
 * via OffscreenCanvas, temporarily hiding repeating fixed/sticky elements on subsequent slices.
 */
export async function captureTiledLongPage(debuggee, viewport, contentHeight) {
  const targetWidth = viewport.width;
  const sliceHeight = RENDER_CONFIG.tileSliceHeight;
  const numTiles = Math.ceil(contentHeight / sliceHeight);

  debugLog(`Initiating tiled capture for ultra-long page (${contentHeight}px in ${numTiles} tiles)...`, 'info');

  const tileBase64List = [];

  for (let i = 0; i < numTiles; i++) {
    const startY = i * sliceHeight;
    const thisTileHeight = Math.min(sliceHeight, contentHeight - startY);

    debugLog(`Capturing tile ${i + 1}/${numTiles} (Y: ${startY} → ${startY + thisTileHeight}px)...`, 'info');

    // On subsequent tiles (i > 0), temporarily hide fixed/sticky elements to avoid duplicated headers
    if (i > 0) {
      await sendCDPCommand(debuggee, 'Runtime.evaluate', {
        expression: `
          (function() {
            const styleId = '__ws_screenshot_hide_fixed_styles';
            if (!document.getElementById(styleId)) {
              const style = document.createElement('style');
              style.id = styleId;
              style.textContent = \`
                header[style*="fixed"], nav[style*="fixed"], [style*="position: fixed"], [style*="position:fixed"],
                header.fixed, header.sticky, .header-fixed, .sticky-header, [data-elementor-type="header"] {
                  display: none !important;
                  visibility: hidden !important;
                }
              \`;
              (document.head || document.documentElement).appendChild(style);
            }
          })()
        `
      });
    }

    // Capture the specific slice clip
    let shot = await sendCDPCommand(debuggee, 'Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: 0,
        y: startY,
        width: targetWidth,
        height: thisTileHeight,
        scale: 1
      },
      captureBeyondViewport: true,
      fromSurface: true
    });

    // Remove temporary fixed-hiding styles immediately after capturing the slice
    if (i > 0) {
      await sendCDPCommand(debuggee, 'Runtime.evaluate', {
        expression: `
          (function() {
            const el = document.getElementById('__ws_screenshot_hide_fixed_styles');
            if (el) el.remove();
          })()
        `
      });
    }

    if (!shot || !shot.data) {
      throw new Error(`Tiled screenshot failed at tile index ${i}.`);
    }

    tileBase64List.push({
      data: shot.data,
      y: startY,
      height: thisTileHeight
    });
  }

  // Stitch tiles using OffscreenCanvas if available in environment
  if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
    debugLog(`Stitching ${tileBase64List.length} tiles onto unified OffscreenCanvas (${targetWidth}x${contentHeight})...`, 'info');
    const canvas = new OffscreenCanvas(targetWidth, contentHeight);
    const ctx = canvas.getContext('2d');

    for (const tile of tileBase64List) {
      const blob = await (await fetch(`data:image/png;base64,${tile.data}`)).blob();
      const bitmap = await createImageBitmap(blob);
      ctx.drawImage(bitmap, 0, tile.y);
    }

    const outputBlob = await canvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await outputBlob.arrayBuffer();
    return uint8ArrayToBase64(new Uint8Array(arrayBuffer));
  }

  // Fallback if running in headless Node without OffscreenCanvas: return first tile
  return tileBase64List[0].data;
}

/**
 * Hydrates a single viewport and runs the full readiness engine.
 */
export async function hydrateViewport(debuggee, viewport) {
  const defaultHeight = viewport.defaultHeight || viewport.typicalHeight || 800;
  const isMobile = Boolean(viewport.mobile);

  // 1. Set authentic device viewport dimensions (DO NOT inflate height to page height)
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

  // 2. Execute full readiness pipeline
  await waitForPageFullyRendered(debuggee, { viewport });
}

/**
 * Initial deep warm up and settlement phase across entire page before per-viewport captures.
 */
export async function warmUpAndHydratePage(debuggee, callbacks = {}) {
  const {
    onStatus = () => {},
    checkCancelled = () => false
  } = callbacks;

  debugLog('Warming up target page & priming DOM resources...', 'info', onStatus);

  try {
    await sendCDPCommand(debuggee, 'Emulation.setFocusEmulationEnabled', { enabled: true });
  } catch {}

  // Use primary desktop viewport for discovery
  const desktopVp = DEFAULT_VIEWPORTS[0];
  await hydrateViewport(debuggee, desktopVp);

  if (checkCancelled()) return;
  debugLog('Page fully loaded & hydrated! Ready for viewport captures.', 'info', onStatus);
}

/**
 * Authoritative Layout-Driven Screenshot Capture for a Single Viewport:
 * 1. Emulates authentic device viewport dimensions (keeps 1920x1080, 390x844, etc.).
 * 2. Runs comprehensive visual readiness engine.
 * 3. Calculates authentic content height (eliminating artificial trailing whitespace).
 * 4. Freezes CSS animations at fully visible state (opacity: 1).
 * 5. Uses single-shot CDP clip capture with captureBeyondViewport: true (or tiled capture if >10,000px).
 * 6. Validates payload and cleanly resets all overrides in finally block.
 */
export async function captureViewportScreenshot(debuggee, viewport) {
  const defaultHeight = viewport.defaultHeight || viewport.typicalHeight || 800;
  const isMobile = Boolean(viewport.mobile);
  const targetWidth = viewport.width;

  try {
    // 1. Set authentic viewport metrics
    await sendCDPCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      width: targetWidth,
      height: defaultHeight,
      deviceScaleFactor: viewport.deviceScaleFactor || 1,
      mobile: isMobile,
      screenWidth: targetWidth,
      screenHeight: defaultHeight,
      dontSetVisibleSize: false
    });

    if (isMobile) {
      try {
        await sendCDPCommand(debuggee, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await sendCDPCommand(debuggee, 'Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
      } catch {}
    }

    // 2. Execute full readiness engine for this viewport
    await waitForPageFullyRendered(debuggee, { viewport });

    // 3. Compute authentic content height (respecting true layout boundary)
    const contentHeight = await calculateAuthenticContentHeight(debuggee, viewport);
    debugLog(`Authentic content height calculated: ${contentHeight}px for ${viewport.name}`, 'info');

    // 4. Freeze animations at settled/visible state
    await freezeAnimations(debuggee);
    await sleep(100);

    // 5. Ensure scroll is at absolute top
    try {
      await sendCDPCommand(debuggee, 'Runtime.evaluate', {
        expression: 'window.scrollTo(0, 0); if (document.documentElement) document.documentElement.scrollTop = 0; if (document.body) document.body.scrollTop = 0;'
      });
    } catch {}

    let base64Data;

    // 6. If page exceeds tiled capture threshold, use tiled capture & stitching
    if (contentHeight > RENDER_CONFIG.tiledCaptureHeightThreshold) {
      base64Data = await captureTiledLongPage(debuggee, viewport, contentHeight);
    } else {
      // Standard single-shot CDP full layout capture
      let screenshot = await sendCDPCommand(debuggee, 'Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: 0,
          y: 0,
          width: targetWidth,
          height: contentHeight,
          scale: 1
        },
        captureBeyondViewport: true,
        fromSurface: true
      });

      // Blank check validation retry
      if (!screenshot || !screenshot.data || screenshot.data.length < MIN_PAYLOAD_BASE64_LENGTH) {
        debugLog('Screenshot validation detected undersized payload, retrying capture...', 'warn');
        await sleep(600);
        screenshot = await sendCDPCommand(debuggee, 'Page.captureScreenshot', {
          format: 'png',
          clip: {
            x: 0,
            y: 0,
            width: targetWidth,
            height: contentHeight,
            scale: 1
          },
          captureBeyondViewport: true,
          fromSurface: true
        });
      }

      if (!screenshot || !screenshot.data) {
        throw new Error(`Screenshot capture failed for viewport "${viewport.name}" - empty response.`);
      }

      base64Data = screenshot.data;
    }

    return base64Data;

  } finally {
    // 7. Clean restoration after every viewport
    await unfreezeAnimations(debuggee);
    try {
      await sendCDPCommand(debuggee, 'Emulation.clearDeviceMetricsOverride');
    } catch {}
  }
}

/**
 * High-level orchestration for capturing all requested viewports on a tab.
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

    // Step 1: Initial Deep Hydration Phase
    await warmUpAndHydratePage(debuggee, {
      onStatus,
      checkCancelled
    });

    if (checkCancelled()) {
      return results;
    }

    // Step 2: Per-viewport authoritative layout captures
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
    try {
      await sendCDPCommand(debuggee, 'Emulation.clearDeviceMetricsOverride');
    } catch {}
    await detachDebugger(tabId);
  }

  return results;
}
