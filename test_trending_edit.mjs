import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'D:/motionforge/.shots/trending-edit';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

console.log('Navigating to app...');
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

console.log('Loading Trending Anime Edit: Makima 9:16...');
await page.evaluate(() => {
  const st = window.__MF_STORE__.getState();
  st.loadTrendingAnimeEdit();
  // Set comfortable zoom for vertical 9:16 display
  st.setViewportZoom(0.22);
  st.setViewportPan([0, 0]);
});
await page.waitForTimeout(1000);

// 1. Full interface with Makima 9:16 Edit at Drop (3.65s)
await page.evaluate(() => {
  const st = window.__MF_STORE__.getState();
  st.setCurrentTime(3.65);
  const bangLayer = st.project.compositions[0].layers.find(l => l.name.includes('BANG'));
  if (bangLayer) st.setSelectedLayerIds([bangLayer.id]);
});
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, '01_makima_edit_full_drop.png') });

// Viewport container clip for Drop
const viewportElem = await page.$('[data-testid="viewport-container"]') || await page.$('canvas');
if (viewportElem) {
  await viewportElem.screenshot({ path: path.join(OUT, '03_makima_edit_drop_framed.png') });
}

// 2. Full interface & Viewport at Intro (1.0s)
await page.evaluate(() => {
  const st = window.__MF_STORE__.getState();
  st.setCurrentTime(1.0);
  const titleLayer = st.project.compositions[0].layers.find(l => l.name.includes('Title'));
  if (titleLayer) st.setSelectedLayerIds([titleLayer.id]);
});
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, '02_makima_edit_intro_1s.png') });

if (viewportElem) {
  await viewportElem.screenshot({ path: path.join(OUT, '02_makima_edit_intro_framed.png') });
}

// 3. Return to Drop (3.65s) for pristine canvas view
await page.evaluate(() => {
  const st = window.__MF_STORE__.getState();
  st.setCurrentTime(3.65);
});
await page.waitForTimeout(600);

// 4. Capture Timeline detail showing beat markers, audio, and clips
await page.screenshot({
  path: path.join(OUT, '04_timeline_beat_markers.png'),
  clip: { x: 0, y: 550, width: 1600, height: 410 },
});

// 5. Expand Makima scenes in Project Panel & preview in Source Monitor
await page.evaluate(() => {
  const st = window.__MF_STORE__.getState();
  st.setSourceMonitorAsset('asset_makima_twixtor');
  st.setSourceInPoint(3.65);
  st.setSourceOutPoint(4.98);
});
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, '05_source_monitor_makima.png') });

console.log('Verification completed. Errors:', errors);
await browser.close();
