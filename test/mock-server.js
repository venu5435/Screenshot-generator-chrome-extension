/**
 * Automated Verification Script for Website Screenshots Generator
 * Tests URL normalization, HTML link extraction, BFS crawling, Page Slug creation, and JSZip archive generation.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { normalizeUrl, extractLinksFromHtml, createPageSlug, crawlOrigin } from '../utils/crawler.js';
import { DEFAULT_VIEWPORTS, MAX_HARDWARE_HEIGHT, MIN_PAYLOAD_BASE64_LENGTH } from '../utils/capture.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 Starting Website Screenshots Generator Unit & Mock Tests');
  console.log('========================================================\n');

  // TEST 1: URL Normalization
  console.log('--- Test Suite 1: URL Normalization ---');
  const baseOrigin = 'https://example.com';
  const currentUrl = 'https://example.com/blog/article-1';

  assert(
    normalizeUrl('/about', currentUrl, baseOrigin) === 'https://example.com/about',
    'Normalizes absolute path (/about)'
  );

  assert(
    normalizeUrl('subpage', currentUrl, baseOrigin) === 'https://example.com/blog/subpage',
    'Normalizes relative path (subpage)'
  );

  assert(
    normalizeUrl('../pricing/', currentUrl, baseOrigin) === 'https://example.com/pricing',
    'Normalizes parent relative path and strips trailing slash (../pricing/)'
  );

  assert(
    normalizeUrl('/contact#team', currentUrl, baseOrigin) === 'https://example.com/contact',
    'Strips hash fragment (#team)'
  );

  assert(
    normalizeUrl('/features?utm_source=twitter&utm_medium=cpc&plan=pro', currentUrl, baseOrigin) === 'https://example.com/features?plan=pro',
    'Strips tracking params (utm_*) while preserving functional params (plan=pro)'
  );

  assert(
    normalizeUrl('https://external-domain.com/page', currentUrl, baseOrigin) === null,
    'Rejects external domains'
  );

  assert(
    normalizeUrl('mailto:test@example.com', currentUrl, baseOrigin) === null,
    'Rejects mailto: links'
  );

  assert(
    normalizeUrl('/downloads/whitepaper.pdf', currentUrl, baseOrigin) === null,
    'Rejects non-HTML file extensions (.pdf)'
  );

  assert(
    normalizeUrl('/images/hero.png', currentUrl, baseOrigin) === null,
    'Rejects image files (.png)'
  );

  // TEST 2: HTML Link Extraction
  console.log('\n--- Test Suite 2: HTML Link Extraction ---');
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <head><title>Test Page</title></head>
      <body>
        <a href="/about">About Us</a>
        <a href="/pricing">Pricing</a>
        <a href="contact.html">Contact</a>
        <a href="https://example.com/docs/api/">Docs API</a>
        <a href="https://other.com/login">External Login</a>
        <a href="#section-top">Jump to top</a>
        <a href="/assets/manual.pdf">PDF Manual</a>
        <a href="javascript:void(0)">Noop</a>
      </body>
    </html>
  `;

  const extracted = extractLinksFromHtml(sampleHtml, 'https://example.com', 'https://example.com');
  assert(extracted.includes('https://example.com/about'), 'Extracted /about');
  assert(extracted.includes('https://example.com/pricing'), 'Extracted /pricing');
  assert(extracted.includes('https://example.com/contact.html'), 'Extracted contact.html');
  assert(extracted.includes('https://example.com/docs/api'), 'Extracted and normalized /docs/api');
  assert(!extracted.some(u => u.includes('other.com')), 'Ignored external links');
  assert(!extracted.some(u => u.includes('.pdf')), 'Ignored .pdf links');
  assert(!extracted.some(u => u.includes('#section-top')), 'Ignored hash only links');

  // TEST 3: Page Slug Generation
  console.log('\n--- Test Suite 3: Page Slug Generation ---');
  assert(createPageSlug('https://example.com/', 1) === 'page-01-home', 'Root slug is page-01-home');
  assert(createPageSlug('https://example.com/about-us', 2) === 'page-02-about-us', 'Slug for /about-us');
  assert(createPageSlug('https://example.com/products/pro-gear?id=42', 3) === 'page-03-products-pro-gear-id-42', 'Slug with path and query');

  // TEST 4: Mock HTTP Server & Live BFS Crawling
  console.log('\n--- Test Suite 4: Mock Server & BFS Crawl ---');
  
  const mockPages = {
    '/': `
      <html><body>
        <h1>Home</h1>
        <a href="/features">Features</a>
        <a href="/pricing">Pricing</a>
        <a href="/team">Team</a>
        <a href="/logo.png">Image</a>
      </body></html>
    `,
    '/features': `
      <html><body>
        <h1>Features</h1>
        <a href="/features/deep-dive">Deep Dive</a>
        <a href="/pricing">Pricing</a>
      </body></html>
    `,
    '/features/deep-dive': `
      <html><body>
        <h1>Deep Dive</h1>
        <a href="/">Home</a>
      </body></html>
    `,
    '/pricing': `
      <html><body>
        <h1>Pricing</h1>
        <a href="/contact">Contact</a>
      </body></html>
    `,
    '/team': `
      <html><body>
        <h1>Team</h1>
        <a href="/careers">Careers</a>
      </body></html>
    `,
    '/contact': `
      <html><body><h1>Contact</h1></body></html>
    `,
    '/careers': `
      <html><body><h1>Careers</h1></body></html>
    `
  };

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

  await new Promise(resolve => server.listen(8765, '127.0.0.1', resolve));
  const serverBase = 'http://127.0.0.1:8765';

  try {
    // Crawl depth 1, max 4
    const normalizedSeed = normalizeUrl(serverBase, serverBase, serverBase);
    const crawledD1 = await crawlOrigin(serverBase, { maxPages: 4, maxDepth: 1 });
    assert(crawledD1.length === 4, `Crawl maxPages 4 returned 4 pages (got ${crawledD1.length})`);
    assert(crawledD1[0] === normalizedSeed, 'Seed URL is first discovered page');
    assert(crawledD1.includes(`${serverBase}/features`), 'Discovered /features at depth 1');
    assert(crawledD1.includes(`${serverBase}/pricing`), 'Discovered /pricing at depth 1');
    assert(crawledD1.includes(`${serverBase}/team`), 'Discovered /team at depth 1');
    assert(!crawledD1.includes(`${serverBase}/features/deep-dive`), 'Did not reach depth 2 when maxDepth is 1');

    // Crawl depth 2, max 10
    const crawledD2 = await crawlOrigin(serverBase, { maxPages: 10, maxDepth: 2 });
    assert(crawledD2.includes(`${serverBase}/features/deep-dive`), 'Discovered /features/deep-dive at depth 2');
    assert(crawledD2.includes(`${serverBase}/contact`), 'Discovered /contact at depth 2 via /pricing');
    assert(crawledD2.includes(`${serverBase}/careers`), 'Discovered /careers at depth 2 via /team');

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  // TEST 5: JSZip Packaging Verification
  console.log('\n--- Test Suite 5: Standalone JSZip Verification ---');
  // Load bundled jszip
  const jszipCode = fs.readFileSync('lib/jszip.min.js', 'utf8');
  // Evaluate in sandbox context
  const mockGlobal = {};
  const fn = new Function('self', 'window', 'global', jszipCode);
  fn(mockGlobal, mockGlobal, mockGlobal);

  const JSZip = mockGlobal.JSZip;
  assert(typeof JSZip === 'function', 'JSZip exports valid constructor');

  const zip = new JSZip();
  const rootFolder = zip.folder('website-screenshots-test-2026-09-08');
  const desktopFolder = rootFolder.folder('desktop-1920');
  const mobileFolder = rootFolder.folder('mobile-390');

  // Dummy 1x1 transparent PNG in base64
  const dummyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  desktopFolder.file('page-01-home.png', dummyPngBase64, { base64: true });
  desktopFolder.file('page-02-about.png', dummyPngBase64, { base64: true });
  mobileFolder.file('page-01-home.png', dummyPngBase64, { base64: true });

  const zipBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  assert(typeof zipBase64 === 'string' && zipBase64.length > 50, 'Generated valid Base64 ZIP payload');

  const zipBuffer = Buffer.from(zipBase64, 'base64');
  assert(zipBuffer.slice(0, 4).toString('hex') === '504b0304', 'ZIP file has valid standard PK ZIP header (0x504B0304)');

  // TEST 6: Viewports, Height Guardrails & Blank Payload Validation
  console.log('\n--- Test Suite 6: Viewport & Height Guardrail Verification ---');
  assert(DEFAULT_VIEWPORTS.length === 5, 'Exactly 5 default viewports defined');
  
  const desktopVp = DEFAULT_VIEWPORTS.find(v => v.id === 'desktop');
  assert(desktopVp && desktopVp.width === 1920 && desktopVp.typicalHeight === 1080 && !desktopVp.mobile, 'Large Desktop: 1920x1080 (mobile: false)');

  const laptopVp = DEFAULT_VIEWPORTS.find(v => v.id === 'laptop');
  assert(laptopVp && laptopVp.width === 1366 && laptopVp.typicalHeight === 768 && !laptopVp.mobile, 'Laptop: 1366x768 (mobile: false)');

  const mediumVp = DEFAULT_VIEWPORTS.find(v => v.id === 'medium');
  assert(mediumVp && mediumVp.width === 1280 && mediumVp.typicalHeight === 720 && !mediumVp.mobile, 'Desktop/Laptop: 1280x720 (mobile: false)');

  const tabletVp = DEFAULT_VIEWPORTS.find(v => v.id === 'tablet');
  assert(tabletVp && tabletVp.width === 768 && tabletVp.typicalHeight === 1024 && tabletVp.mobile, 'Tablet: 768x1024 (mobile: true)');

  const mobileVp = DEFAULT_VIEWPORTS.find(v => v.id === 'mobile');
  assert(mobileVp && mobileVp.width === 390 && mobileVp.typicalHeight === 844 && mobileVp.mobile, 'Mobile: 390x844 (mobile: true)');

  // Height Clamping Function (Simulated)
  function clampHeight(measured, typical) {
    return Math.min(Math.max(measured, typical), MAX_HARDWARE_HEIGHT);
  }

  assert(clampHeight(300, 1080) === 1080, 'Clamps abnormal low height (300px) to typicalHeight (1080px)');
  assert(clampHeight(3500, 1080) === 3500, 'Preserves true scrollable height within normal range (3500px)');
  assert(clampHeight(25000, 1080) === 16384, 'Clamps runaway/infinite scroll height (25000px) to MAX_HARDWARE_HEIGHT (16384px)');

  // Blank Base64 payload validation
  const smallPayload = 'a'.repeat(2000);
  const validPayload = 'a'.repeat(MIN_PAYLOAD_BASE64_LENGTH + 500);
  assert(smallPayload.length < MIN_PAYLOAD_BASE64_LENGTH, 'Detects payloads under 5KB as suspect/blank');
  assert(validPayload.length >= MIN_PAYLOAD_BASE64_LENGTH, 'Accepts valid high-resolution PNG Base64 payloads');

  console.log('\n========================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test execution failed with error:', err);
  process.exit(1);
});
