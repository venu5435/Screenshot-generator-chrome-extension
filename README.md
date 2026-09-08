# Website Screenshots Generator v2.4 (Chrome Extension - Manifest V3)

> Automatically discover internal website pages, capture authentic full-height responsive screenshots across 5 device viewports using the Chrome DevTools Protocol with zero white-space gaps and no repeating headers, and download as an organized ZIP archive.

---

## 📸 What's New in Version 2.4 (v2.4.0)

- 📐 **Authoritative CDP Layout Engine:** Uses native `Page.getLayoutMetrics` (`contentSize.height`) rather than DOM scroll estimates, guaranteeing exact rendering height.
- ⏳ **Active Viewport Hydration (`window.innerHeight * 0.75` / 150ms):** Smoothly scrolls down each viewport in step increments with simulated interaction events to fully hydrate client-rendered galleries (WP Rocket, GoDaddy, Webflow, Squarespace).
- 🖼️ **Guaranteed Image Completion:** Awaits `img.complete` on all pending assets with fallback timeouts before taking screenshots.
- 🧹 **Detached Trailing Height Cleanup:** Resets document/body height styles (`height = 'auto'`) prior to measurement to eliminate awkward bottom whitespace.
- 🚫 **No 100vh CSS Section Stretching:** Preserves authentic hardware screen heights during emulation so `100vh`/`min-height: 100vh` sections do not stretch into miles of empty white space.
- 🎯 **No Repeating Sticky/Fixed Headers:** Fixed and sticky navigation headers render cleanly only once at the top of the screenshot rather than repeating across viewport tiles.
- ❄️ **Animation & Transition Freezing:** Temporarily freezes CSS keyframes and transitions during snapshot capture to avoid capturing elements mid-fade or blank.

---

## 📐 Supported Hardware Viewports

- 🖥️ **Large Desktop:** `1920 × 1080` (folder: `desktop-1920`, mobile: false)
- 💻 **Laptop:** `1366 × 768` (folder: `laptop-1366`, mobile: false)
- 🖥️ **Desktop/Laptop:** `1280 × 720` (folder: `medium-1280`, mobile: false)
- 📱 **Tablet:** `768 × 1024` (folder: `tablet-768`, mobile: true, touch enabled)
- 📱 **Mobile:** `390 × 844` (folder: `mobile-390`, mobile: true, touch enabled)

---

## 🚀 How to Load and Test in Google Chrome

1. **Open Chrome Extensions Page:**
   - In Chrome's address bar, navigate to: `chrome://extensions`
2. **Enable Developer Mode:**
   - Toggle the **Developer mode** switch in the top-right corner.
3. **Load Unpacked Extension:**
   - Click the **Load unpacked** button in the top-left.
   - Select the extension folder: `D:\Chrome Extension`
4. **Pin and Use:**
   - Click the puzzle icon in Chrome's toolbar and pin **Website Screenshots Generator v2.4**.
   - Navigate to any website (e.g. `https://example.com` or `https://imagecrane.com`).
   - Click the extension icon, review the detected URL and settings, and click **Start Full-Page Capture**!

---

## 📂 Project Structure

```text
website-screenshots-generator/
├── manifest.json                  # Manifest V3 specification (v2.4.0)
├── CHROMEWEBSTORE.md              # Chrome Web Store metadata & review disclosures (v2.4.0)
├── README.md                      # Documentation & installation guide
├── icons/                         # Valid PNG icons
│   ├── icon-16.png                # 16x16px toolbar icon
│   ├── icon-48.png                # 48x48px extension management icon
│   └── icon-128.png               # 128x128px Chrome Web Store icon
├── lib/
│   └── jszip.min.js               # Standalone bundled JSZip 3.10.1 (no CDN dependencies)
├── popup/
│   ├── popup.html                 # Modern glassmorphism UI & live progress monitor (v2.4.0)
│   ├── popup.css                  # Dark theme styling & responsive animations
│   └── popup.js                   # Popup controller & state synchronization
├── background/
│   └── service-worker.js          # Background orchestrator (crawling, tab navigation, zip download)
├── utils/
│   ├── crawler.js                 # URL normalization, link extraction & BFS crawler
│   └── capture.js                 # v2.4 CDP debugger emulation & authoritative capture engine
└── test/
    ├── mock-server.js             # Automated unit & BFS crawler test suite
    ├── e2e-chrome-test.js         # Headless Chrome extension loader verification
    ├── e2e-full-flow.js           # E2E popup & WebSocket debugger verification
    └── verify-vh-fixed.js         # Verification for 100vh and fixed header behavior
```

---

## 🧪 Running Automated Tests

Run the unit and integration test suite:

```bash
node test/mock-server.js
```
