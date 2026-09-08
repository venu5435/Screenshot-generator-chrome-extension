const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DEVICES = [
    { name: 'large-desktop', width: 1920, height: 1080, mobile: false },
    { name: 'laptop', width: 1366, height: 768, mobile: false },
    { name: 'desktop-laptop', width: 1280, height: 720, mobile: false },
    { name: 'tablet', width: 768, height: 1024, mobile: true },
    { name: 'mobile', width: 390, height: 844, mobile: true }
];

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to target...');
    await page.goto('http://127.0.0.1:4321', { waitUntil: 'networkidle' });

    for (const device of DEVICES) {
        console.log(`Testing viewport: ${device.name} (${device.width}x${device.height})`);

        await page.setViewportSize({ width: device.width, height: device.height });

        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 400;
                const timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= document.body.scrollHeight) {
                        clearInterval(timer);
                        window.scrollTo(0, 0);
                        resolve();
                    }
                }, 80);
            });
        });

        await page.waitForTimeout(600);

        const outPath = path.join(__dirname, `${device.name}.png`);
        await page.screenshot({ path: outPath, fullPage: true });

        const stats = fs.statSync(outPath);
        if (stats.size < 10000) {
            console.error(`FAILED: ${device.name} produced a blank or corrupt screenshot (${stats.size} bytes).`);
        } else {
            console.log(`PASSED: ${device.name} captured successfully (${(stats.size / 1024).toFixed(1)} KB).`);
        }
    }

    await browser.close();
    process.exit(0);
})();