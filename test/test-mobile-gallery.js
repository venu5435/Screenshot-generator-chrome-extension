import { chromium } from 'playwright';
import fs from 'fs';

async function testMobile() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  global.chrome = {
    debugger: {
      sendCommand: (d, method, params, callback) => {
        client.send(method, params).then(res => callback(res)).catch(err => {
          global.chrome.runtime.lastError = { message: err.message };
          callback(null);
          delete global.chrome.runtime.lastError;
        });
      }
    },
    runtime: {}
  };

  const { warmUpAndHydratePage, captureViewportScreenshot, DEFAULT_VIEWPORTS } = await import('../utils/capture.js');
  const debuggee = { tabId: 1 };

  await page.goto('https://imagecrane.com/gallery/', { waitUntil: 'load', timeout: 30000 });

  await warmUpAndHydratePage(debuggee, {
    onStatus: msg => console.log('  [Status]', msg)
  });

  const mobileVp = DEFAULT_VIEWPORTS.find(v => v.id === 'mobile');
  console.log('Capturing mobile...');
  const b64 = await captureViewportScreenshot(debuggee, mobileVp);
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync('./test/gallery-mobile-enhanced.png', buf);
  console.log('Saved ./test/gallery-mobile-enhanced.png, size:', buf.length);

  await browser.close();
}

testMobile().catch(console.error);
