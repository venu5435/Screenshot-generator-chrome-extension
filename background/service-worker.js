/**
 * Website Screenshots Generator - Background Service Worker
 * Orchestrates URL crawling, tab navigation, DevTools Protocol viewport captures, and JSZip packaging.
 */

import '../lib/jszip.min.js';
import { crawlOrigin, createPageSlug, normalizeUrl } from '../utils/crawler.js';
import { DEFAULT_VIEWPORTS, captureAllViewportsForTab, detachDebugger, sleep } from '../utils/capture.js';

// In-memory active job tracker
let currentJob = {
  running: false,
  cancelRequested: false,
  dedicatedTabId: null
};

// Initial state template
const IDLE_STATE = {
  status: 'idle', // 'idle' | 'crawling' | 'capturing' | 'zipping' | 'completed' | 'cancelled' | 'error'
  targetUrl: '',
  domain: '',
  totalDiscoveredPages: 0,
  discoveredPages: [],
  currentPageIndex: 0,
  currentPageUrl: '',
  currentViewportName: '',
  currentViewportWidth: 0,
  completedCapturesCount: 0,
  totalCapturesCount: 0,
  progressPercent: 0,
  error: null,
  zipFilename: null,
  startedAt: null,
  finishedAt: null,
  logs: []
};

/**
 * Persists state updates to chrome.storage.local and broadcasts to popup.
 */
async function updateState(partialState, newLog = null) {
  const data = await chrome.storage.local.get('captureState');
  const existing = data.captureState || { ...IDLE_STATE };
  const updated = { ...existing, ...partialState };

  if (newLog) {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logItem = typeof newLog === 'string' ? { time: timeStr, text: newLog, level: 'info' } : { time: timeStr, ...newLog };
    updated.logs = [...(updated.logs || []).slice(-100), logItem]; // Keep last 100 log entries
  }

  await chrome.storage.local.set({ captureState: updated });

  // Broadcast to any open popup
  try {
    chrome.runtime.sendMessage({ type: 'STATE_UPDATED', state: updated }).catch(() => {
      // Ignored if popup is not open
    });
  } catch {
    // Ignore runtime messaging errors
  }

  return updated;
}

/**
 * Formats a clean domain string for folder and zip naming.
 */
function extractDomain(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
  } catch {
    return 'website';
  }
}

/**
 * Generates an ISO-like timestamp safe for filenames (e.g. 2026-09-08_15-30-00).
 */
function getFileTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * Waits for a Chrome tab to report 'complete' status with a fallback timeout.
 */
function waitForTabLoaded(tabId, timeoutMs = 25000) {
  return new Promise((resolve) => {
    let timeoutId;

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeoutId);
        resolve(true);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false); // Resolve on timeout to allow capturing even if background analytics hang
    }, timeoutMs);
  });
}

/**
 * Executes the entire crawl, capture, and zip workflow.
 */
async function executeCaptureJob(config) {
  const { targetUrl, maxPages = 5, maxDepth = 1, selectedViewportIds = [] } = config;

  currentJob.running = true;
  currentJob.cancelRequested = false;
  currentJob.dedicatedTabId = null;

  const domain = extractDomain(targetUrl);
  const timestamp = getFileTimestamp();
  const rootFolderName = `website-screenshots-v2.4-${domain}-${timestamp}`;

  // Filter chosen viewports
  const activeViewports = DEFAULT_VIEWPORTS.filter(vp => 
    selectedViewportIds.length === 0 || selectedViewportIds.includes(vp.id)
  );

  if (activeViewports.length === 0) {
    throw new Error('Please select at least one viewport to capture.');
  }

  await updateState({
    status: 'crawling',
    targetUrl,
    domain,
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    progressPercent: 5,
    logs: []
  }, { text: `Starting capture job for: ${targetUrl}`, level: 'info' });

  // 1. CRAWL INTERNAL PAGES
  let discoveredPages = [];
  try {
    discoveredPages = await crawlOrigin(targetUrl, {
      maxPages,
      maxDepth,
      onProgress: (info) => {
        updateState({
          totalDiscoveredPages: info.discoveredCount
        }, { text: info.message, level: 'info' });
      },
      checkCancelled: () => currentJob.cancelRequested
    });
  } catch (err) {
    throw new Error(`Crawling failed: ${err.message}`);
  }

  if (currentJob.cancelRequested) {
    await updateState({ status: 'cancelled' }, { text: 'Job cancelled by user during crawl phase.', level: 'warn' });
    currentJob.running = false;
    return;
  }

  if (!discoveredPages || discoveredPages.length === 0) {
    discoveredPages = [targetUrl];
  }

  const totalPages = discoveredPages.length;
  const totalCapturesCount = totalPages * activeViewports.length;

  await updateState({
    status: 'capturing',
    discoveredPages,
    totalDiscoveredPages: totalPages,
    totalCapturesCount,
    completedCapturesCount: 0,
    progressPercent: 15
  }, { text: `Discovered ${totalPages} page(s). Total screenshot tasks: ${totalCapturesCount}`, level: 'success' });

  // 2. CREATE DEDICATED CAPTURE TAB
  const dedicatedTab = await chrome.tabs.create({ url: 'about:blank', active: false });
  currentJob.dedicatedTabId = dedicatedTab.id;

  // Initialize JSZip instance (UMD attaches to self/globalThis)
  const JSZipConstructor = self.JSZip || globalThis.JSZip;
  if (!JSZipConstructor) {
    throw new Error('JSZip library failed to initialize in Service Worker context.');
  }
  const zip = new JSZipConstructor();
  const rootZipFolder = zip.folder(rootFolderName);

  let completedCaptures = 0;

  try {
    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      if (currentJob.cancelRequested) {
        break;
      }

      const pageUrl = discoveredPages[pIdx];
      const pageSlug = createPageSlug(pageUrl, pIdx + 1);

      await updateState({
        currentPageIndex: pIdx + 1,
        currentPageUrl: pageUrl
      }, { text: `[Page ${pIdx + 1}/${totalPages}] Navigating to: ${pageUrl}`, level: 'info' });

      // Navigate tab to target page
      await chrome.tabs.update(dedicatedTab.id, { url: pageUrl });
      await waitForTabLoaded(dedicatedTab.id, 20000);

      // Additional sleep for dynamic assets, client-side routing, and font renders
      await sleep(1000);

      if (currentJob.cancelRequested) {
        break;
      }

      // Capture all viewports for this page
      const viewportResults = await captureAllViewportsForTab(
        dedicatedTab.id,
        activeViewports,
        {
          onStatus: (statusMessage) => {
            updateState({
              currentViewportName: 'Warming Up'
            }, { text: `[${pageSlug}] ${statusMessage}`, level: 'info' });
          },
          onViewportStart: (vp, vIdx, vTotal) => {
            updateState({
              currentViewportName: vp.name,
              currentViewportWidth: vp.width
            }, { text: `Emulating [${vp.name}] & capturing screenshot for ${pageSlug}...`, level: 'info' });
          },
          onViewportDone: (vp) => {
            completedCaptures++;
            const progress = Math.min(
              15 + Math.round((completedCaptures / totalCapturesCount) * 70),
              85
            );
            updateState({
              completedCapturesCount: completedCaptures,
              progressPercent: progress
            }, { text: `Captured: ${vp.folder}/${pageSlug}.png`, level: 'success' });
          },
          checkCancelled: () => currentJob.cancelRequested
        }
      );

      // Store captures into zip folder hierarchy
      for (const item of viewportResults) {
        const folder = rootZipFolder.folder(item.viewport.folder);
        folder.file(`${pageSlug}.png`, item.base64, { base64: true });
      }
    }

    if (currentJob.cancelRequested) {
      await updateState({ status: 'cancelled' }, { text: 'Job cancelled by user.', level: 'warn' });
      return;
    }

    // 3. GENERATE ZIP ARCHIVE & DOWNLOAD
    await updateState({
      status: 'zipping',
      progressPercent: 90
    }, { text: 'All screenshots captured. Compressing files into ZIP archive...', level: 'info' });

    const zipBase64 = await zip.generateAsync({
      type: 'base64',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const zipFilename = `${rootFolderName}.zip`;
    const dataUrl = `data:application/zip;base64,${zipBase64}`;

    await updateState({
      progressPercent: 95
    }, { text: `Initiating download: ${zipFilename}...`, level: 'info' });

    await chrome.downloads.download({
      url: dataUrl,
      filename: zipFilename,
      saveAs: false
    });

    await updateState({
      status: 'completed',
      progressPercent: 100,
      zipFilename,
      finishedAt: Date.now()
    }, { text: `Done! Download started for ${zipFilename} (${completedCaptures} screenshots).`, level: 'success' });

  } finally {
    // Clean up dedicated tab and debugger
    if (currentJob.dedicatedTabId) {
      const tabId = currentJob.dedicatedTabId;
      currentJob.dedicatedTabId = null;
      try {
        await detachDebugger(tabId);
      } catch {}
      try {
        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) {
            // Ignored - tab may already be closed
          }
        });
      } catch {}
    }
    currentJob.running = false;
  }
}

/**
 * Runtime Message Listener for Popup and other components.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_JOB') {
    if (currentJob.running) {
      sendResponse({ success: false, error: 'A screenshot capture job is already in progress.' });
      return true;
    }

    // Run job asynchronously in background
    executeCaptureJob(message.config).catch(async (err) => {
      console.error('Capture job error:', err);
      await updateState({
        status: 'error',
        error: err.message,
        finishedAt: Date.now()
      }, { text: `Error: ${err.message}`, level: 'error' });
    });

    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'CANCEL_JOB') {
    if (currentJob.running) {
      currentJob.cancelRequested = true;
      if (currentJob.dedicatedTabId) {
        detachDebugger(currentJob.dedicatedTabId).catch(() => {});
      }
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_STATE') {
    chrome.storage.local.get('captureState').then((data) => {
      sendResponse({
        success: true,
        state: data.captureState || { ...IDLE_STATE },
        isRunning: currentJob.running
      });
    });
    return true;
  }

  if (message.type === 'RESET_STATE') {
    chrome.storage.local.set({ captureState: { ...IDLE_STATE } }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  return true;
});

// Listen for unexpected debugger detachments (e.g. user manually closes target tab or DevTools)
chrome.debugger.onDetach.addListener((source, reason) => {
  if (chrome.runtime.lastError) {
    // Intentionally consumed
  }
  if (currentJob.dedicatedTabId && source.tabId === currentJob.dedicatedTabId) {
    currentJob.dedicatedTabId = null;
  }
});

// Initialize clean state on extension installation / startup
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ captureState: { ...IDLE_STATE } });
});
