# Chrome Web Store Listing - Website Screenshots Generator v2.4

## Store Metadata

- **Name**: Website Screenshots Generator v2.4
- **Version**: 2.4.0
- **Category**: Developer Tools / Productivity
- **Language**: English
- **Last Updated**: 2026-09-08

---

## Short Description (max 132 characters)
Crawl website pages, capture full-height responsive screenshots across 5 device viewports with zero white-space gaps, and export as ZIP.

---

## Detailed Description

**Website Screenshots Generator v2.4** is a developer-grade Chrome Extension designed for web developers, QA engineers, UI/UX designers, and digital marketers who need pixel-perfect, full-page, multi-device screenshot captures of entire websites in seconds.

### 🌟 Key Features (Version 2.4.0)

1. **Authoritative Layout Metrics via Native CDP (v2.4 New):**
   - Directly leverages Chrome DevTools Protocol `Page.getLayoutMetrics` (`contentSize.height`), replacing unreliable DOM height estimates with exact browser layout heights.

2. **Active Viewport Hydration Engine (v2.4 New):**
   - Automatically executes a stepwise hydration pass (`window.innerHeight * 0.75` with 150ms pauses) for each responsive viewport, guaranteeing client-rendered image galleries, masonry layouts, and carousels on builders like GoDaddy, Webflow, Squarespace, and WordPress/WP Rocket paint completely without blanks.

3. **Guaranteed Image Completion (v2.4 New):**
   - Awaits `img.complete` on all pending assets across the document before triggering snapshot capture.

4. **Detached Trailing Height Cleanup (v2.4 New):**
   - Enforces `document.documentElement/body.style.height = 'auto'` to remove trailing whitespace gaps at the bottom of pages.

5. **Zero White-Space & No 100vh CSS Stretching:**
   - Emulates authentic hardware screen heights (`1080px`, `768px`, `720px`, `1024px`, `844px`) so responsive `100vh`, `100dvh`, and `min-height: 100vh` sections render with natural proportions rather than stretching into miles of blank white space.

6. **No Repeating Sticky/Fixed Headers:**
   - Full-page capture engine renders sticky and `position: fixed` navigation bars cleanly at the top without tiling or duplicate repeating sections across the page.

7. **Animation & Transition Freezing:**
   - Temporarily pauses active CSS keyframe animations and transitions during the capture snapshot to prevent capturing elements mid-fade or blank.

8. **5 Standard Responsive Device Viewports:**
   - 🖥️ **Large Desktop:** 1920 × 1080
   - 💻 **Laptop:** 1366 × 768
   - 🖥️ **Desktop/Laptop:** 1280 × 720
   - 📱 **Tablet:** 768 × 1024 (Touch enabled)
   - 📱 **Mobile:** 390 × 844 (Touch enabled)

9. **Automated BFS Internal Crawler:**
   - Discovers internal origin pages automatically with customizable page limits (1–20) and depth control (0–3).
   - Smart URL normalization filters out duplicate anchors, hashes, tracking parameters, and non-HTML assets.

10. **Instant ZIP Export & Clean Folder Hierarchy:**
    - Packs all captures locally into an organized archive:
      ```text
      website-screenshots-v2.4-[domain]-[timestamp]/
        ├── desktop-1920/
        │     ├── page-01-home.png
        │     └── page-02-about.png
        ├── laptop-1366/
        ├── medium-1280/
        ├── tablet-768/
        └── mobile-390/
      ```

11. **100% Private & Client-Side:**
    - Operates strictly inside your local browser. Zero analytics, zero tracking, and no external server uploads.

---

## Permissions Justification

| Permission | Technical Reason & User Benefit |
| :--- | :--- |
| `activeTab` | Grants temporary access to read the currently active tab URL when the user clicks "Use Current Tab". |
| `tabs` | Required to create dedicated background tabs for crawling and navigating between internal URLs to capture screenshots. |
| `scripting` | Used to evaluate scrollable document dimensions across varying responsive page layouts. |
| `downloads` | Required to automatically trigger the `.zip` archive download once all screenshots are compressed. |
| `storage` | Used to store capture state, user settings, and progress logs so the extension can resume status if the popup is closed. |
| `debugger` | Required to execute Chrome DevTools Protocol commands (`Emulation.setDeviceMetricsOverride` and `Page.captureScreenshot`) for authentic responsive device simulation and beyond-viewport screenshot captures. |
| `<all_urls>` (Host Permission) | Enables crawling internal links and capturing responsive screenshots on any website URL specified by the user. |

---

## Version History

- **v2.4.0 (2026-09-08):**
  - Authoritative layout-driven capture pipeline with native `Page.getLayoutMetrics`.
  - Active stepwise viewport hydration (`0.75 * innerHeight` / 150ms delay) for builder/client-rendered sites.
  - Full image completion guarantees and detached trailing height cleanup.
  - Bumped version to 2.4.0 across all extension components.

- **v2.0.0 (2026-09-08):**
  - Resolved 100vh CSS section stretching that caused massive white space gaps.
  - Resolved repeating sticky/fixed navigation headers across full-page captures.
  - Added CSS animation and transition freeze subsystem.
  - Upgraded to 5 standard hardware screen profiles.

- **v1.0.0 (2026-09-08):**
  - Initial release with BFS crawler, CDP screenshot engine, and JSZip export.
