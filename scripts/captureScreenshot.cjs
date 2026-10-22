const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1560,
    height: 980,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));
  await new Promise((r) => setTimeout(r, 2000));

  // Expand scene cards in Project panel
  await win.webContents.executeJavaScript(`
    try {
      const chevronButtons = Array.from(document.querySelectorAll('button')).filter(b => {
        return b.innerHTML.includes('lucide-chevron-right');
      });
      chevronButtons.forEach(b => b.click());
    } catch (e) {
      console.warn(e);
    }
  `);

  await new Promise((r) => setTimeout(r, 1200));

  const image = await win.webContents.capturePage();
  const shotsDir = path.join(__dirname, '../.shots');
  fs.mkdirSync(shotsDir, { recursive: true });
  const outPath = path.join(shotsDir, 'kori_desktop_window.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('✓ Desktop Window Screenshot saved to:', outPath);

  const artifactPath = 'C:/Users/mi7ki/.gemini/antigravity/brain/dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae/kori_desktop_window.png';
  try {
    fs.copyFileSync(outPath, artifactPath);
    console.log('✓ Copied to artifacts directory:', artifactPath);
  } catch (err) {
    console.warn('Could not copy to artifacts dir:', err);
  }

  // Also capture zoomed crops of timeline and project panel
  // Project panel: x: 0..320, y: 30..800
  const projImage = await win.webContents.capturePage({ x: 0, y: 30, width: 340, height: 750 });
  const projShotPath = path.join(shotsDir, 'kori_project_panel_scenes.png');
  fs.writeFileSync(projShotPath, projImage.toPNG());
  fs.copyFileSync(projShotPath, 'C:/Users/mi7ki/.gemini/antigravity/brain/dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae/kori_project_panel_scenes.png');
  console.log('✓ Project Panel Scenes screenshot saved');

  // Timeline panel: x: 340..1560, y: 550..980
  const timeImage = await win.webContents.capturePage({ x: 300, y: 500, width: 1260, height: 480 });
  const timeShotPath = path.join(shotsDir, 'kori_timeline_energy_beats.png');
  fs.writeFileSync(timeShotPath, timeImage.toPNG());
  fs.copyFileSync(timeShotPath, 'C:/Users/mi7ki/.gemini/antigravity/brain/dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae/kori_timeline_energy_beats.png');
  console.log('✓ Timeline Energy & Beats screenshot saved');

  app.quit();
});
