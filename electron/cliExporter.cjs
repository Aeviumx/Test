/**
 * Kōri Desktop Studio - Master Headless Exporter
 * Runs inside Electron offscreen BrowserWindow with full GPU WebGL2 and HTML5 Canvas acceleration.
 * Streams 1080x1920 60fps raw RGBA frames directly into FFmpeg stdin with loudnorm -14 LUFS & -1.0 dBTP limiter.
 */

const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Disable hardware acceleration issues in some headless CI environments, but allow WebGL
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('enable-webgl');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

async function runExporter() {
  const args = process.argv.slice(2);
  const getArg = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
  };

  const style = getArg('--style', 'gacha-hype');
  const audioPath = getArg('--audio', '');
  const outputPath = getArg('--out', '');
  const duration = parseFloat(getArg('--duration', '15.0'));
  const fps = parseInt(getArg('--fps', '60'), 10);
  const totalFrames = Math.round(duration * fps);

  console.log(`[Kōri Headless Engine] Launching render job:`);
  console.log(`  Style:       ${style}`);
  console.log(`  Audio:       ${audioPath}`);
  console.log(`  Output:      ${outputPath}`);
  console.log(`  Duration:    ${duration}s (${totalFrames} frames @ ${fps}fps)`);

  const win = new BrowserWindow({
    show: false,
    width: 1080,
    height: 1920,
    webPreferences: {
      offscreen: true,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  // Prepare assets directory
  const rootDir = path.resolve(__dirname, '..');
  const artDir = path.join(rootDir, 'test-assets', 'real', 'art');
  const bgDir = path.join(rootDir, 'test-assets', 'real', 'backgrounds');

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body, html { margin: 0; padding: 0; background: #000; overflow: hidden; }
      canvas { width: 1080px; height: 1920px; display: block; }
    </style>
  </head>
  <body>
    <canvas id="stage" width="1080" height="1920"></canvas>
    <script>
      const fs = require('fs');
      const path = require('path');
      const { spawn } = require('child_process');

      const style = "${style}";
      const audioPath = "${audioPath.replace(/\\/g, '\\\\')}";
      const outputPath = "${outputPath.replace(/\\/g, '\\\\')}";
      const duration = ${duration};
      const fps = ${fps};
      const totalFrames = ${totalFrames};
      const rootDir = "${rootDir.replace(/\\/g, '\\\\')}";
      const artDir = "${artDir.replace(/\\/g, '\\\\')}";
      const bgDir = "${bgDir.replace(/\\/g, '\\\\')}";

      const canvas = document.getElementById('stage');
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

      function loadImage(filePath) {
        return new Promise((resolve, reject) => {
          if (!fs.existsSync(filePath)) {
            return reject(new Error('File not found: ' + filePath));
          }
          const buf = fs.readFileSync(filePath);
          const b64 = buf.toString('base64');
          const ext = path.extname(filePath).slice(1).toLowerCase();
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = 'data:' + mime + ';base64,' + b64;
        });
      }

      // Decontaminate mask edges (erode 1.5px + soft unmult white background)
      function decontaminateImage(img) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = img.width;
        offCanvas.height = img.height;
        const oCtx = offCanvas.getContext('2d');
        oCtx.drawImage(img, 0, 0);

        const imgData = oCtx.getImageData(0, 0, img.width, img.height);
        const d = imgData.data;
        const w = img.width;
        const h = img.height;

        // Clean white background contamination on boundary alpha pixels
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            const a = d[idx + 3];
            if (a > 0 && a < 245) {
              const aNorm = a / 255.0;
              const bgComp = 255.0 * (1.0 - aNorm);
              for (let c = 0; c < 3; c++) {
                const unmult = Math.round((d[idx + c] - bgComp) / aNorm);
                d[idx + c] = Math.max(0, Math.min(255, unmult));
              }
            }
          }
        }
        oCtx.putImageData(imgData, 0, 0);
        return offCanvas;
      }

      async function renderJob() {
        console.log('[Kōri WebGL/Canvas Engine] Loading asset textures...');
        let images = {};

        if (style === 'gacha-hype') {
          const rawVera = await loadImage(path.join(artDir, 'gacha_vera.png'));
          const rawLucia = await loadImage(path.join(artDir, 'gacha_lucia.png'));
          const rawLiv = await loadImage(path.join(artDir, 'gacha_liv.png'));
          const rawGroup = await loadImage(path.join(artDir, 'gacha_group.png'));

          images.vera = decontaminateImage(rawVera);
          images.lucia = decontaminateImage(rawLucia);
          images.liv = decontaminateImage(rawLiv);
          images.group = rawGroup;

          // Color Fidelity Assertion: Verify Vera's red hair is preserved in RGB!
          const vCtx = images.vera.getContext('2d');
          const sampleData = vCtx.getImageData(1036, 716 - 150, 10, 10).data;
          let rSum = 0, gSum = 0, bSum = 0;
          for (let i = 0; i < sampleData.length; i += 4) {
            rSum += sampleData[i];
            gSum += sampleData[i+1];
            bSum += sampleData[i+2];
          }
          const avgR = rSum / (sampleData.length / 4);
          const avgB = bSum / (sampleData.length / 4);
          console.log(\`[Kōri Color Check] Vera hair sample: Red=\${avgR.toFixed(1)}, Blue=\${avgB.toFixed(1)}\`);
          if (avgR < avgB) {
            throw new Error('COLOR_CORRUPTION_ERROR: BGR/RGB channels swapped! Vera hair is blue instead of red!');
          }
        } else {
          // Aesthetic Lyric
          const rawSelena = await loadImage(path.join(artDir, 'lyric_selena_capriccio.png'));
          images.selena = decontaminateImage(rawSelena);
          // Load background video frame / image
          const bgFrame = await loadImage(path.join(rootDir, 'test-assets', 'results', 'audit', 'fix7_lyric_background_grade.jpg'));
          images.bg = bgFrame;
        }

        console.log('[Kōri WebGL/Canvas Engine] Assets successfully verified and loaded.');

        // Launch FFmpeg encoding process with loudnorm and limiter
        const ffmpegArgs = [
          '-y',
          '-f', 'rawvideo',
          '-pix_fmt', 'rgba',
          '-s', '1080x1920',
          '-r', String(fps),
          '-i', '-',
        ];

        if (audioPath && fs.existsSync(audioPath)) {
          // Add audio with loudnorm & true-peak limiter
          const audioOffset = style === 'gacha-hype' ? 0.46 : 0.0;
          ffmpegArgs.push(
            '-ss', String(audioOffset),
            '-i', audioPath,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=-1.0dB:level=disabled',
            '-c:a', 'aac',
            '-b:a', '256k',
            '-t', String(duration),
            outputPath
          );
        } else {
          ffmpegArgs.push(
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-t', String(duration),
            outputPath
          );
        }

        console.log('[Kōri WebGL/Canvas Engine] Starting FFmpeg process...');
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        ffmpeg.stderr.on('data', (d) => {
          // console.log(d.toString());
        });

        // Main 60 FPS Render Loop
        const overscan = 1.08; // +8% overscan to prevent edge exposure
        const bpm = style === 'gacha-hype' ? 122.0 : 116.0;

        for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
          const t = frameIdx / fps;

          if (style === 'gacha-hype') {
            renderGachaFrame(ctx, t, frameIdx, images, overscan);
          } else {
            renderLyricFrame(ctx, t, frameIdx, images, overscan);
          }

          // Extract frame buffer and write to FFmpeg stdin
          const imgData = ctx.getImageData(0, 0, 1080, 1920);
          const buf = Buffer.from(imgData.data.buffer);

          await new Promise((resolve) => {
            if (!ffmpeg.stdin.write(buf)) {
              ffmpeg.stdin.once('drain', resolve);
            } else {
              resolve();
            }
          });

          if (frameIdx % 120 === 0 || frameIdx === totalFrames - 1) {
            const pct = ((frameIdx + 1) / totalFrames * 100).toFixed(1);
            console.log(\`[Kōri CLI Export] Progress: \${pct}% (\${frameIdx + 1}/\${totalFrames} frames, t=\${t.toFixed(2)}s)\`);
          }
        }

        ffmpeg.stdin.end();
        await new Promise((resolve, reject) => {
          ffmpeg.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error('FFmpeg exited with code ' + code));
          });
        });

        console.log(\`[Kōri Master Render] Successfully generated: \${outputPath}\`);
        window.renderSuccess = true;
      }

      // --- Style 1: Gacha Hype Frame Renderer ---
      function renderGachaFrame(ctx, t, frameIdx, images, overscan) {
        ctx.save();

        if (t < 4.0) {
          // --- INTRO CARDS (0.0s - 4.0s) ---
          // Crisp clean white/light graphic background
          const bgGrad = ctx.createRadialGradient(540, 960, 100, 540, 960, 1100);
          bgGrad.addColorStop(0, '#ffffff');
          bgGrad.addColorStop(1, '#e9ecef');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, 1080, 1920);

          // Card dimensions: 72% height = 1382px, width = 345px
          const cardW = 345;
          const cardH = 1380;
          const centerY = 960;

          // Card entrance animations (0.0s - 0.7s)
          const easeOut = (x) => 1 - Math.pow(1 - x, 3);
          const enterProg = Math.min(1.0, t / 0.65);
          const slideOff = (1 - easeOut(enterProg)) * 900;

          // Card Swap at 2.0s
          const swapProg = Math.max(0, Math.min(1.0, (t - 2.0) / 0.35));
          const swapEase = easeOut(swapProg);

          // Card 1: Liv (Left)
          ctx.save();
          const livX = 540 - 350 - (1 - swapEase) * slideOff;
          ctx.translate(livX, centerY + 20);
          ctx.rotate(-5 * Math.PI / 180);
          drawCard(ctx, images.liv, cardW, cardH, '#38bdf8', [1002, 845]);
          ctx.restore();

          // Card 2: Vera (Hero Center)
          ctx.save();
          const veraX = 540 + (swapEase * 350);
          ctx.translate(veraX, centerY - 25);
          ctx.rotate((swapEase * 4) * Math.PI / 180);
          drawCard(ctx, images.vera, cardW * 1.08, cardH * 1.02, '#e11d48', [1036, 716]);
          ctx.restore();

          // Card 3: Lucia (Right)
          ctx.save();
          const luciaX = 540 + 350 + (1 - swapEase) * slideOff - (swapEase * 700);
          ctx.translate(luciaX, centerY + 20);
          ctx.rotate((5 - swapEase * 10) * Math.PI / 180);
          drawCard(ctx, images.lucia, cardW, cardH, '#8b5cf6', [819, 473]);
          ctx.restore();

          // Climax transition: Red screen flash at 3.45s - 3.70s
          if (t >= 3.45 && t < 3.70) {
            const redAlpha = Math.sin((t - 3.45) / 0.25 * Math.PI) * 0.75;
            ctx.fillStyle = \`rgba(255, 26, 64, \${redAlpha})\`;
            ctx.fillRect(0, 0, 1080, 1920);
          }

          // Climax zoom into group art at 3.70s - 4.00s
          if (t >= 3.70) {
            const groupProg = (t - 3.70) / 0.30;
            const groupScale = 1.0 + groupProg * 0.25;
            ctx.globalAlpha = Math.min(1.0, groupProg * 1.5);
            ctx.save();
            ctx.translate(540, 960);
            ctx.scale(groupScale, groupScale);
            drawImageCover(ctx, images.group, -540, -960, 1080, 1920);
            ctx.restore();
          }
        } else {
          // --- DROP & ACCENT TIMELINE (4.0s - 15.0s) ---
          // Background dark anime gradient
          ctx.fillStyle = '#0b0c10';
          ctx.fillRect(0, 0, 1080, 1920);

          // Shot breakdown with Face & Eyes Anchored framing:
          // 4.00s - 4.49s: Lucia Face Close-up (2.5x, face center locked at upper third)
          // 4.49s - 5.48s: Lucia Wide Shot (1.15x)
          // 5.48s - 6.46s: Lucia Macro Eyes Punch (4.2x, eyes region locked at upper third)
          // 6.46s - 7.44s: Vera Face Close-up (2.6x, Vera red hair, face locked at upper third)
          // 7.44s - 8.43s: Vera Wide Shot (1.15x)
          // 8.43s - 9.41s: Vera Macro Eyes Punch (4.3x)
          // 9.41s - 11.38s: Lucia Close-up (2.5x)
          // 11.38s - 15.00s: Group Splash Art Climax (1.15x push-in)

          let currentImg = images.lucia;
          let faceCenter = [819, 473];
          let eyesCenter = [819, 454];
          let shotZoom = 2.5;
          let isEyesMacro = false;
          let isClimax = false;

          if (t >= 4.00 && t < 4.49) {
            currentImg = images.lucia;
            shotZoom = 2.5;
          } else if (t >= 4.49 && t < 5.48) {
            currentImg = images.lucia;
            shotZoom = 1.15;
          } else if (t >= 5.48 && t < 6.46) {
            // Moment 3: Macro Eyes Punch on downbeat!
            currentImg = images.lucia;
            shotZoom = 4.2;
            isEyesMacro = true;
          } else if (t >= 6.46 && t < 7.44) {
            currentImg = images.vera;
            faceCenter = [1036, 716];
            eyesCenter = [1036, 689];
            shotZoom = 2.6;
          } else if (t >= 7.44 && t < 8.43) {
            currentImg = images.vera;
            faceCenter = [1036, 716];
            shotZoom = 1.15;
          } else if (t >= 8.43 && t < 9.41) {
            currentImg = images.vera;
            faceCenter = [1036, 716];
            eyesCenter = [1036, 689];
            shotZoom = 4.3;
            isEyesMacro = true;
          } else if (t >= 9.41 && t < 11.38) {
            currentImg = images.lucia;
            shotZoom = 2.5;
          } else {
            currentImg = images.group;
            isClimax = true;
            shotZoom = 1.15 + (t - 11.38) * 0.03;
          }

          // Controlled Accents: Flashes only on primary downbeats (minimum 2 beats without flash)
          // Downbeats with flash: 4.00s, 5.48s, 8.43s, 11.38s
          let flashIntensity = 0;
          let zoomPunch = 0;
          let chromaticSplit = 0;

          const checkAccent = (accentTime, hasFlash, flashPower, punchPower) => {
            const dt = t - accentTime;
            if (dt >= 0 && dt < 0.28) {
              const decay = Math.exp(-dt * 14.0);
              zoomPunch = punchPower * decay;
              if (hasFlash && dt < 0.14) {
                flashIntensity = flashPower * Math.exp(-dt * 22.0);
                chromaticSplit = 22 * decay;
              }
            }
          };

          checkAccent(4.00, true, 130, 0.18);
          checkAccent(4.49, false, 0, 0.14);   // Accent WITHOUT flash (no strobe!)
          checkAccent(5.48, true, 115, 0.20);  // Macro Eyes downbeat
          checkAccent(6.46, false, 0, 0.16);  // Accent WITHOUT flash
          checkAccent(7.44, false, 0, 0.12);  // Accent WITHOUT flash
          checkAccent(8.43, true, 120, 0.18);  // Downbeat with flash
          checkAccent(9.41, false, 0, 0.15);  // Accent WITHOUT flash
          checkAccent(11.38, true, 140, 0.24); // Climax downbeat with flash

          // Liveliness breathing
          const breathing = Math.sin(t * (20 / 60) * 2 * Math.PI) * 0.012;
          const totalScale = (shotZoom + zoomPunch + breathing) * overscan;

          // Camera transform: lock target (face/eyes) to upper third (y = 537px)
          const targetYComp = isEyesMacro ? 500 : 540;
          const anchorX = isClimax ? currentImg.width * 0.5 : (isEyesMacro ? eyesCenter[0] : faceCenter[0]);
          const anchorY = isClimax ? currentImg.height * 0.5 : (isEyesMacro ? eyesCenter[1] : faceCenter[1]);

          ctx.save();
          ctx.translate(540, targetYComp);
          ctx.scale(totalScale, totalScale);

          // Chromatic aberration on flash
          if (chromaticSplit > 2) {
            ctx.shadowColor = 'rgba(255, 0, 80, 0.6)';
            ctx.shadowOffsetX = chromaticSplit;
          }

          ctx.drawImage(currentImg, -anchorX, -anchorY);
          ctx.restore();

          // Exposure flash burst
          if (flashIntensity > 5) {
            ctx.fillStyle = \`rgba(255, 255, 255, \${flashIntensity / 255})\`;
            ctx.fillRect(0, 0, 1080, 1920);
          }
        }

        ctx.restore();
      }

      function drawCard(ctx, img, width, height, borderColor, faceCoord) {
        // Rounded card box with soft drop shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 32;
        ctx.shadowOffsetY = 16;

        ctx.fillStyle = '#ffffff';
        roundRect(ctx, -width / 2, -height / 2, width, height, 24);
        ctx.fill();
        ctx.restore();

        // Inner clipping for character
        ctx.save();
        roundRect(ctx, -width / 2, -height / 2, width, height, 24);
        ctx.clip();

        // Card interior gradient
        const cardGrad = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
        cardGrad.addColorStop(0, '#f8fafc');
        cardGrad.addColorStop(1, '#e2e8f0');
        ctx.fillStyle = cardGrad;
        ctx.fillRect(-width / 2, -height / 2, width, height);

        // Draw character cutout filling >= 75% height
        const charScale = (height * 0.88) / img.height;
        ctx.drawImage(
          img,
          - (faceCoord[0] * charScale),
          -height / 2 + 60,
          img.width * charScale,
          img.height * charScale
        );

        // Subtle colored border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 4;
        roundRect(ctx, -width / 2, -height / 2, width, height, 24);
        ctx.stroke();

        ctx.restore();
      }

      function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      }

      function drawImageCover(ctx, img, x, y, w, h) {
        const scale = Math.max(w / img.width, h / img.height);
        const nw = img.width * scale;
        const nh = img.height * scale;
        ctx.drawImage(img, x + (w - nw) / 2, y + (h - nh) / 2, nw, nh);
      }

      // --- Style 2: Aesthetic Lyric Frame Renderer ---
      function renderLyricFrame(ctx, t, frameIdx, images, overscan) {
        ctx.save();

        // 1. Background video frame with moody cold night color grade
        drawImageCover(ctx, images.bg, 0, 0, 1080, 1920);

        // Ambient dark navy overlay (#0a192f) with lifted blacks & atmospheric vignette
        ctx.fillStyle = 'rgba(10, 25, 47, 0.45)';
        ctx.fillRect(0, 0, 1080, 1920);

        // 2. Character Cutout (Selena):
        // 100% INTACT SILHOUETTE - NO artificial fade, NO clipping!
        // Positioned on the left: x_center = 255px (occupies x in [0, 510px])
        // Face-locked push-in: anchor is locked to face center (Fy = 401px in art -> 530px in comp)
        const charProg = Math.min(1.0, t / 15.0);
        const charScale = (1.00 + charProg * 0.36) * overscan; // Smooth 1.00x -> 1.36x push-in
        const breathing = Math.sin(t * (20 / 60) * 2 * Math.PI) * 0.008;

        // Anchor coordinates: face center of Selena is [1062, 401] in art (dimensions 2083x3375)
        const faceArtX = 1062;
        const faceArtY = 401;
        const faceCompY = 530; // Upper third locked position
        const selenaCenterCompX = 255;

        ctx.save();
        // Light wrap edge bloom
        ctx.shadowColor = 'rgba(56, 189, 248, 0.28)';
        ctx.shadowBlur = 18;

        ctx.translate(selenaCenterCompX, faceCompY);
        ctx.scale((charScale + breathing), (charScale + breathing));

        const baseArtScale = 0.52;
        ctx.drawImage(
          images.selena,
          -faceArtX * baseArtScale,
          -faceArtY * baseArtScale,
          images.selena.width * baseArtScale,
          images.selena.height * baseArtScale
        );
        ctx.restore();

        // 3. Typography & OFL Lyrics (Side-Block on Right: x in [560, 1020px])
        // Safe zones respected: left >= 60, right <= 1020, top >= 180, bottom <= 1580
        const lyricLines = [
          { text: "Girl, you know I want your love", start: 0.5, end: 3.8 },
          { text: "Your love was handmade for somebody like me", start: 3.8, end: 7.6 },
          { text: "Come on now, follow my lead", start: 7.6, end: 11.2 },
          { text: "I may be crazy, don't mind me", start: 11.2, end: 15.0 }
        ];

        ctx.save();
        const lyricStartX = 560;
        const lyricStartY = 820;

        // Glowing double-dot ornament ••
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.font = '700 32px sans-serif';
        ctx.fillText('••', lyricStartX, lyricStartY - 40);

        ctx.font = '700 48px sans-serif';
        ctx.textBaseline = 'top';

        let currentY = lyricStartY;
        lyricLines.forEach((line, idx) => {
          const isActive = t >= line.start && t < line.end;
          const isRead = t >= line.end;

          if (isActive) {
            // Active line: glowing luminescent white
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 16;
          } else if (isRead) {
            // Read line: solid white-slate
            ctx.fillStyle = '#e2e8f0';
            ctx.shadowBlur = 0;
          } else {
            // Unread line: dimmed slate (35% opacity)
            ctx.fillStyle = 'rgba(100, 116, 139, 0.35)';
            ctx.shadowBlur = 0;
          }

          // Word wrapping within max width 460px (x in [560, 1020])
          const words = line.text.split(' ');
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine + word + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > 440 && currentLine !== '') {
              ctx.fillText(currentLine, lyricStartX, currentY);
              currentY += 58;
              currentLine = word + ' ';
            } else {
              currentLine = testLine;
            }
          }
          ctx.fillText(currentLine, lyricStartX, currentY);
          currentY += 68;
        });

        // 4. Dynamic Song Signature strictly below the last lyric line with 48px padding
        // Positioned safely within x in [560, 1020px], y <= 1580px
        const signatureY = Math.min(currentY + 32, 1540);
        ctx.shadowBlur = 0;
        ctx.font = '500 24px sans-serif';
        ctx.fillStyle = '#94a3b8'; // subtle silver
        const sigText = 'Shape of You • Ed Sheeran (Slowed + Reverb)';
        ctx.fillText(sigText, lyricStartX, signatureY);

        // 5. Typewriter author watermark at bottom-left: edit by kōri _
        ctx.font = '500 24px sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
        const blink = Math.floor(t * 2) % 2 === 0 ? '_' : ' ';
        ctx.fillText('edit by kōri ' + blink, 120, 1680);

        ctx.restore();
        ctx.restore();
      }

      renderJob().catch((err) => {
        console.error('[Kōri Render Error]', err);
        window.renderError = err.message;
      });
    </script>
  </body>
  </html>
  `;

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

  // Monitor render completion
  const checkInterval = setInterval(async () => {
    try {
      const isSuccess = await win.webContents.executeJavaScript('window.renderSuccess');
      const err = await win.webContents.executeJavaScript('window.renderError');

      if (err) {
        clearInterval(checkInterval);
        console.error(`[Kōri Headless Engine] Job failed: ${err}`);
        app.exit(1);
      }

      if (isSuccess) {
        clearInterval(checkInterval);
        console.log(`[Kōri Headless Engine] Job completed successfully!`);
        app.quit();
      }
    } catch {
      // still rendering
    }
  }, 500);
}

app.whenReady().then(runExporter);
