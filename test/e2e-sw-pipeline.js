/**
 * Service Worker Runtime & Capture Pipeline E2E Test
 * Connects directly to the Extension Service Worker via CDP, dispatches a test capture job against mock website,
 * and asserts that the crawl, page navigation, CDP emulation, and state updates execute successfully.
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXTENSION_PATH = 'd:\\Chrome Extension';
const DEBUG_PORT = 9555;
const USER_DATA_DIR = path.join(process.env.TEMP || 'C:\\Temp', 'chrome_sw_test_' + Date.now());

const mockPages = {
  '/': `
    <!DOCTYPE html>
    <html>
      <head><title>Home Page</title><style>body { height: 1200px; background: #4f46e5; color: white; padding: 20px; }</style></head>
      <body>
        <h1>Mock Home</h1>
        <a href="/about">About</a> | <a href="/contact">Contact</a>
      </body>
    </html>
  `,
  '/about': `
    <!DOCTYPE html>
    <html>
      <head><title>About</title><style>body { height: 1000px; background: #06b6d4; color: white; padding: 20px; }</style></head>
      <body><h1>About Us</h1></body>
    </html>
  `,
  '/contact': `
    <!DOCTYPE html>
    <html>
      <head><title>Contact</title><style>body { height: 900px; background: #10b981; color: white; padding: 20px; }</style></head>
      <body><h1>Contact Page</h1></body>
    </html>
  `
};

async function testServiceWorkerPipeline() {
  console.log('========================================================');
  console.log('🧪 Testing Service Worker Capture & ZIP Pipeline');
  console.log('========================================================\n');

  // 1. Start mock server
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    if (mockPages[urlPath]) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(mockPages[urlPath]);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  await new Promise(r => server.listen(8999, '127.0.0.1', r));
  console.log('✅ Mock Web Server running on http://127.0.0.1:8999');

  // 2. Launch Chrome
  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  const chromeArgs = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    'about:blank'
  ];

  const chromeProcess = spawn(CHROME_PATH, chromeArgs, { stdio: 'pipe' });

  const cleanup = () => {
    try { chromeProcess.kill('SIGTERM'); } catch {}
    try { server.close(); } catch {}
    try {
      if (fs.existsSync(USER_DATA_DIR)) {
        fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
      }
    } catch {}
  };

  process.on('exit', cleanup);

  try {
    // 3. Find Service Worker target
    let swTarget = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        if (res.ok) {
          const targets = await res.json();
          swTarget = targets.find(t => t.type === 'service_worker');
          if (swTarget) break;
        }
      } catch {}
    }

    if (!swTarget) {
      throw new Error('Service Worker target not found in Chrome.');
    }
    console.log(`✅ Found Service Worker target: ${swTarget.url}`);

    // 4. Connect to Service Worker WebSocket
    const ws = new globalThis.WebSocket(swTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    function sendCdp(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const onMsg = (e) => {
          const data = JSON.parse(e.data);
          if (data.id === id) {
            ws.removeEventListener('message', onMsg);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCdp('Runtime.enable');

    // 5. Test evaluating crawl and JSZip in Service Worker context
    const evalJsZip = await sendCdp('Runtime.evaluate', {
      expression: 'typeof self.JSZip === "function"'
    });
    console.log(`✅ JSZip loaded in Service Worker: ${evalJsZip.result.value}`);

    // 6. Test triggering START_JOB via internal message handler
    console.log('Dispatching test START_JOB message in Service Worker...');
    const jobPromise = sendCdp('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          const config = {
            targetUrl: 'http://127.0.0.1:8999',
            maxPages: 2,
            maxDepth: 1,
            selectedViewportIds: ['mobile', 'desktop']
          };
          chrome.runtime.sendMessage({ type: 'START_JOB', config }, (res) => {
            resolve(res);
          });
        })
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const startRes = await jobPromise;
    console.log('✅ START_JOB triggered:', startRes?.result?.value);

    // 7. Poll chrome.storage.local for completion
    let completed = false;
    for (let poll = 0; poll < 40; poll++) {
      await new Promise(r => setTimeout(r, 1000));
      const stateEval = await sendCdp('Runtime.evaluate', {
        expression: `
          new Promise((resolve) => {
            chrome.storage.local.get('captureState', (data) => {
              resolve(data.captureState);
            });
          })
        `,
        awaitPromise: true,
        returnByValue: true
      });

      const state = stateEval?.result?.value;
      if (state) {
        console.log(`  [Poll ${poll + 1}] Status: "${state.status}" | Progress: ${state.progressPercent}% | Pages: ${state.currentPageIndex}/${state.totalDiscoveredPages} | Screenshots: ${state.completedCapturesCount}/${state.totalCapturesCount}`);
        
        if (state.status === 'completed') {
          console.log(`\n🎉 Job Completed! Output file: ${state.zipFilename}`);
          completed = true;
          break;
        }

        if (state.status === 'error') {
          throw new Error(`Job ended in error state: ${state.error}`);
        }
      }
    }

    ws.close();

    if (!completed) {
      throw new Error('Capture job timed out before completion.');
    }

    console.log('\n========================================================');
    console.log('🎉 ALL SERVICE WORKER & CAPTURE PIPELINE TESTS PASSED!');
    console.log('========================================================\n');
  } finally {
    cleanup();
  }
}

testServiceWorkerPipeline().catch(err => {
  console.error('Service Worker Test Error:', err);
  process.exit(1);
});
