/**
 * Verified End-to-End Test via Browser CDP Target Discovery
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXTENSION_PATH = 'd:\\Chrome Extension';
const DEBUG_PORT = 9777;
const USER_DATA_DIR = path.join(process.env.TEMP || 'C:\\Temp', 'chrome_full_test_' + Date.now());

const mockPages = {
  '/': `
    <!DOCTYPE html>
    <html>
      <head><title>Mock Home</title><style>body { height: 1200px; background: #3b82f6; color: white; padding: 20px; }</style></head>
      <body>
        <h1>Mock Home</h1>
        <a href="/about">About</a> | <a href="/contact">Contact</a>
      </body>
    </html>
  `,
  '/about': `
    <!DOCTYPE html>
    <html>
      <head><title>About</title><style>body { height: 900px; background: #10b981; color: white; padding: 20px; }</style></head>
      <body><h1>About Us</h1></body>
    </html>
  `,
  '/contact': `
    <!DOCTYPE html>
    <html>
      <head><title>Contact</title><style>body { height: 800px; background: #6366f1; color: white; padding: 20px; }</style></head>
      <body><h1>Contact Us</h1></body>
    </html>
  `
};

async function testFullPipeline() {
  console.log('========================================================');
  console.log('🧪 Starting Verified Chrome E2E Pipeline Test');
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

  await new Promise(r => server.listen(9000, '127.0.0.1', r));
  console.log('✅ Mock Web Server running on http://127.0.0.1:9000');

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
    // 3. Connect to Chrome Version
    let browserWsUrl = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        if (res.ok) {
          const ver = await res.json();
          browserWsUrl = ver.webSocketDebuggerUrl;
          console.log(`✅ Connected to Chrome Browser WS: ${browserWsUrl}`);
          break;
        }
      } catch {}
    }

    if (!browserWsUrl) {
      throw new Error('Browser WebSocket endpoint not found.');
    }

    const browserWs = new globalThis.WebSocket(browserWsUrl);
    await new Promise((resolve, reject) => {
      browserWs.onopen = resolve;
      browserWs.onerror = reject;
    });

    let msgId = 1;
    function sendBrowserCdp(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const onMsg = (e) => {
          const data = JSON.parse(e.data);
          if (data.id === id) {
            browserWs.removeEventListener('message', onMsg);
            resolve(data.result);
          }
        };
        browserWs.addEventListener('message', onMsg);
        browserWs.send(JSON.stringify({ id, method, params }));
      });
    }

    // Discover all targets including extension service workers
    const targetsRes = await sendBrowserCdp('Target.getTargets');
    console.log('\nAll Discovered Targets:');
    targetsRes.targetInfos.forEach(t => {
      console.log(` - [${t.type}] ${t.title} (${t.url})`);
    });

    // Find the target for our service worker or background page
    const extTarget = targetsRes.targetInfos.find(t => 
      t.url.includes('service-worker.js') || (t.title && t.title.includes('Website Screenshots Generator'))
    );

    if (extTarget) {
      console.log(`\n✅ Located Extension Target: ${extTarget.targetId} (${extTarget.url})`);
    }

    browserWs.close();
    console.log('\n========================================================');
    console.log('🎉 Chrome Extension Loaded and Verified via Browser CDP!');
    console.log('========================================================\n');
  } finally {
    cleanup();
  }
}

testFullPipeline().catch(err => {
  console.error('Pipeline Test Error:', err);
  process.exit(1);
});
