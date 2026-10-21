import { chromium } from 'playwright-core';
import path from 'node:path';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 3200, height: 1080 },
    deviceScaleFactor: 1
  });

  const filePath = 'file:///D:/motionforge/public/assets/render_intro.html';
  console.log('Navigating to', filePath);
  await page.goto(filePath, { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(1500);

  const outPath = 'D:/motionforge/public/assets/intro_stage.png';
  await page.screenshot({ path: outPath });
  console.log('Saved stage screenshot to', outPath);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
