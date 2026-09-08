/**
 * Test to verify CDP capture logic against stress-site.js (ES Module)
 */

import http from 'http';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Stress Test Site</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          .header { position: fixed; top: 0; left: 0; right: 0; height: 70px; background: #1e293b; color: white; display: flex; align-items: center; padding: 0 20px; z-index: 1000; }
          .hero { margin-top: 70px; height: 100vh; background: linear-gradient(135deg, #4f46e5, #06b6d4); color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; }
          .content { padding: 40px 20px; background: #f8fafc; }
          .card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .lazy-box { height: 400px; background: #f59e0b; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; border-radius: 12px; margin-top: 40px; }
          .footer { background: #0f172a; color: #94a3b8; padding: 40px 20px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>IMAGE CRANE SERVICE</h2>
        </div>
        <div class="hero">
          <h1>Reliable Lifting You Can Count On</h1>
          <p>This hero section uses height: 100vh</p>
        </div>
        <div class="content">
          <div class="card">
            <h3>Certified & Experienced Operators</h3>
            <p>High standard quality lifting services.</p>
          </div>
          <div class="card">
            <h3>Well Maintained Equipment</h3>
            <p>Inspected and certified regularly.</p>
          </div>
          <div id="lazy" class="lazy-box">Lazy Loaded Section (Appears after scroll)</div>
        </div>
        <div class="footer">
          <p>&copy; 2026 Image Crane Service. All Rights Reserved.</p>
        </div>
        <script>
          setTimeout(() => {
            const extra = document.createElement('div');
            extra.className = 'card';
            extra.style.background = '#e2e8f0';
            extra.innerHTML = '<h3>Dynamically Appended Section</h3><p>Loaded after delay.</p>';
            document.querySelector('.content').appendChild(extra);
          }, 600);
        </script>
      </body>
    </html>
  `);
});

server.listen(5433, async () => {
  console.log('Test server started on http://127.0.0.1:5433');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Test Mobile Viewport (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5433', { waitUntil: 'networkidle' });

  // Pre-scroll down and back
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 50);
    });
  });

  await page.waitForTimeout(800);

  const outMobile = path.join(__dirname, 'test-mobile-clean.png');
  await page.screenshot({ path: outMobile, fullPage: true });
  console.log('Mobile screenshot generated, size:', fs.statSync(outMobile).size);

  // Test Large Desktop (1920x1080)
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(400);
  const outDesktop = path.join(__dirname, 'test-desktop-clean.png');
  await page.screenshot({ path: outDesktop, fullPage: true });
  console.log('Desktop screenshot generated, size:', fs.statSync(outDesktop).size);

  await browser.close();
  server.close();
  console.log('✅ Test finished successfully!');
});
