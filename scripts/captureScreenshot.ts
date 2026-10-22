import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../dist-electron/preload.js'),
    },
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));
  // Wait 2.5s for React UI, WebGL canvas, and fonts to render
  await new Promise((r) => setTimeout(r, 2500));

  const image = await win.webContents.capturePage();
  const shotsDir = path.join(__dirname, '../.shots');
  fs.mkdirSync(shotsDir, { recursive: true });
  const outPath = path.join(shotsDir, 'kori_desktop_window.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('✓ Desktop Window Screenshot saved to:', outPath);

  // Also copy to artifacts directory for user presentation
  const artifactPath = 'C:/Users/mi7ki/.gemini/antigravity/brain/dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae/kori_desktop_window.png';
  try {
    fs.copyFileSync(outPath, artifactPath);
    console.log('✓ Copied to artifacts directory:', artifactPath);
  } catch (err) {
    console.warn('Could not copy to artifacts dir:', err);
  }

  app.quit();
});
