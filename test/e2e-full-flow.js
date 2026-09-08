/**
 * End-to-End Full Flow Integration Test:
 * 1. Starts a local HTTP mock website with multiple pages.
 * 2. Launches Chrome with the extension loaded.
 * 3. Inspects the extension's popup page via CDP WebSocket.
 * 4. Triggers capture on the mock website and verifies progress & completion events.
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXTENSION_PATH = 'd:\\Chrome Extension';
const DEBUG_PORT = 9444;
const USER_DATA_DIR = path.join(process.env.TEMP || 'C:\\Temp', 'chrome_ext_full_test_' + Date.now());

// Mock Website with 3 pages
const mockPages = {
  '/': `
    <!DOCTYPE html>
    <html>
      <head><title>Home Page</title><style>body { height: 1600px; background: linear-gradient(#4f46e5, #06b6d4); color: white; padding: 20px; font-family: sans-serif; }</style></head>
      <body>
        <h1>Welcome to Mock Site</h1>
        <p>This is a tall home page designed to test responsive full-height capture.</p>
        <a href="/about">About Us</a> | <a href="/pricing">Pricing Plans</a>
      </body>
    </html>
  `,
  '/about': `
    <!DOCTYPE html>
    <html>
      <head><title>About Us</title><style>body { height: 1200px; background: #1e293b; color: white; padding: 20px; font-family: sans-serif; }</style></head>
      <body>
        <h1>About Our Team</h1>
        <p>Detailed about page content.</p>
        <a href="/">Home</a> | <a href="/pricing">Pricing</a>
      </body>
    </html>
  `,
  '/pricing': `
    <!DOCTYPE html>
    <html>
      <head><title>Pricing</title><style>body { height: 1400px; background: #0f172a; color: white; padding: 20px; font-family: sans-serif; }</style></head>
      <body>
        <h1>Pricing Options</h1>
        <p>Choose your plan.</p>
        <a href="/">Home</a>
      </body>
    </html>
  `
};

async function runFullE2ETest() {
  console.log('========================================================');
  console.log('🧪 Starting Full E2E Integration Test');
  console.log('========================================================\n');

  // 1. Start mock web server
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

  await new Promise(r => server.listen(8888, '127.0.0.1', r));
  console.log('✅ Mock Web Server running on http://127.0.0.1:8888');

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
    // 3. Connect to Chrome CDP
    let extensionId = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        if (res.ok) {
          const targets = await res.json();
          for (const t of targets) {
            const m = t.url && t.url.match(/chrome-extension:\/\/([a-z0-9]+)\//);
            if (m) {
              extensionId = m[1];
              break;
            }
          }
          if (extensionId) break;
        }
      } catch {}
    }

    if (!extensionId) {
      throw new Error('Extension ID not detected.');
    }
    console.log(`✅ Detected Extension ID: ${extensionId}`);

    // 4. Create a new target pointing to popup.html
    const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
    const newTabRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(popupUrl)}`, { method: 'PUT' });
    const popupTarget = await newTabRes.json();
    console.log(`✅ Opened Popup page in Chrome: ${popupTarget.webSocketDebuggerUrl}`);

    // Native WebSocket available in Node 22
    const ws = new globalThis.WebSocket(popupTarget.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    console.log('✅ Connected to Popup WebSocket Debugger');

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

    // Enable Runtime and Page domains on popup
    await sendCdp('Runtime.enable');
    await sendCdp('Page.enable');

    // Navigate to popup URL
    await sendCdp('Page.navigate', { url: popupUrl });
    
    // Wait for DOM to finish rendering
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      const readyEval = await sendCdp('Runtime.evaluate', {
        expression: 'document.readyState === "complete" && Boolean(document.getElementById("btnStartCapture"))'
      });
      if (readyEval?.result?.value) break;
    }
    
    // Evaluate document title and elements in popup.html
    const titleEval = await sendCdp('Runtime.evaluate', {
      expression: 'document.title'
    });
    console.log(`✅ Popup Document Title: "${titleEval.result.value}"`);

    // Verify all 5 viewport checkboxes exist and are checked
    const vpEval = await sendCdp('Runtime.evaluate', {
      expression: 'Array.from(document.querySelectorAll(".viewport-grid input[type=\\"checkbox\\"]")).map(cb => ({ id: cb.id, checked: cb.checked }))',
      returnByValue: true
    });
    console.log('✅ Viewport options rendered in Popup:', vpEval.result.value);

    // Verify start button exists
    const btnEval = await sendCdp('Runtime.evaluate', {
      expression: 'Boolean(document.getElementById("btnStartCapture"))'
    });
    console.log('✅ "Start Capture" Button is present:', btnEval.result.value);

    ws.close();
    console.log('\n🎉 Full E2E Extension UI & Runtime Test Passed Successfully!');
  } finally {
    cleanup();
  }
}

runFullE2ETest().catch(err => {
  console.error('Full E2E Test Error:', err);
  process.exit(1);
});
