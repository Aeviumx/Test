import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as ort from 'onnxruntime-node';
import { RifeService } from '../electron/rifeService';
import { FfmpegService } from '../electron/ffmpegService';

const execFileAsync = promisify(execFile);

// Helper to convert BMP buffer to [3, H, W] Float32Array (normalized 0..1)
function bmpToTensor(buf: Buffer): { data: Float32Array; width: number; height: number } {
  const pixelOffset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const height = Math.abs(buf.readInt32LE(22));
  const rowBytes = Math.floor((width * 3 + 3) / 4) * 4;

  const data = new Float32Array(3 * height * width);
  const planeSize = height * width;

  for (let y = 0; y < height; y++) {
    const rowOffset = pixelOffset + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 3;
      const b = buf[idx] / 255.0;
      const g = buf[idx + 1] / 255.0;
      const r = buf[idx + 2] / 255.0;

      const pIdx = y * width + x;
      data[pIdx] = r;                  // Red
      data[planeSize + pIdx] = g;      // Green
      data[planeSize * 2 + pIdx] = b;  // Blue
    }
  }

  return { data, width, height };
}

// Helper to convert [3, H, W] Float32Array back to 24-bit BMP Buffer
function tensorToBmp(tensorData: Float32Array, width: number, height: number): Buffer {
  const rowBytes = Math.floor((width * 3 + 3) / 4) * 4;
  const pixelBytes = rowBytes * height;
  const fileSize = 54 + pixelBytes;
  const buf = Buffer.alloc(fileSize);

  buf.write('BM', 0, 2, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10);

  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(pixelBytes, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  const planeSize = height * width;
  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      const r = Math.min(255, Math.max(0, Math.round(tensorData[pIdx] * 255)));
      const g = Math.min(255, Math.max(0, Math.round(tensorData[planeSize + pIdx] * 255)));
      const b = Math.min(255, Math.max(0, Math.round(tensorData[planeSize * 2 + pIdx] * 255)));

      const idx = rowOffset + x * 3;
      buf[idx] = b;
      buf[idx + 1] = g;
      buf[idx + 2] = r;
    }
  }

  return buf;
}

interface ClipTask {
  name: string;
  sourceFile: string;
  startTime: number;
  duration: number;
  multiplier: 2 | 4;
}

async function processClip(
  task: ClipTask,
  session: ort.InferenceSession,
  ffmpeg: string,
  cacheDir: string,
  outClipsDir: string
) {
  console.log(`\n=======================================================`);
  console.log(`[RIFE Twixtor] Processing: ${task.name}`);
  console.log(`Source: ${path.basename(task.sourceFile)} @ t=${task.startTime}s, dur=${task.duration}s (${task.multiplier}x slowmo)`);
  console.log(`=======================================================`);

  const clipWorkDir = path.join(cacheDir, task.name);
  fs.rmSync(clipWorkDir, { recursive: true, force: true });
  fs.mkdirSync(clipWorkDir, { recursive: true });

  const rawDir = path.join(clipWorkDir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });

  // 1. Extract frames from source at native FPS
  await execFileAsync(ffmpeg, [
    '-ss', String(task.startTime),
    '-i', task.sourceFile,
    '-t', String(task.duration),
    '-vf', 'scale=640:360:flags=lanczos',
    '-r', '30',
    '-f', 'image2',
    path.join(rawDir, 'frame_%04d.bmp')
  ]);

  const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.bmp')).sort();
  console.log(`Extracted ${rawFiles.length} raw action frames.`);

  // 2. Scan and remove anime held frames (2s and 3s animation)
  const rawBuffers = rawFiles.map(f => fs.readFileSync(path.join(rawDir, f)));
  const heldScan = RifeService.scanAnimeHeldFrames(rawBuffers, 2.0);
  console.log(`Original frames: ${heldScan.totalOriginalFrames} | Held duplicates: ${heldScan.heldFramesCount} (${((heldScan.heldFramesCount / heldScan.totalOriginalFrames) * 100).toFixed(1)}%)`);
  console.log(`Unique keyframe drawings: ${heldScan.uniqueKeyframesCount} | Cadence: ${heldScan.heldCadence}`);

  const keyframeBuffers = heldScan.uniqueFrameIndices.map(idx => rawBuffers[idx]);

  const { width, height } = bmpToTensor(keyframeBuffers[0]);
  const padW = ((width + 31) >> 5) << 5;
  const padH = ((height + 31) >> 5) << 5;

  const interpDir = path.join(clipWorkDir, 'interp');
  fs.mkdirSync(interpDir, { recursive: true });

  const interpolatePair = async (tensorA: Float32Array, tensorB: Float32Array): Promise<Float32Array> => {
    const inputBuf = new Float32Array(1 * 6 * padH * padW);
    const planeA = padH * padW;
    const origPlane = height * width;

    for (let c = 0; c < 3; c++) {
      const srcOffset = c * origPlane;
      const dstOffsetA = c * planeA;
      const dstOffsetB = (c + 3) * planeA;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          inputBuf[dstOffsetA + y * padW + x] = tensorA[srcOffset + y * width + x];
          inputBuf[dstOffsetB + y * padW + x] = tensorB[srcOffset + y * width + x];
        }
      }
    }

    const inputTensor = new ort.Tensor('float32', inputBuf, [1, 6, padH, padW]);
    const result = await session.run({ input: inputTensor });
    const outputTensor = result.output.data as Float32Array;

    const cropped = new Float32Array(3 * origPlane);
    for (let c = 0; c < 3; c++) {
      const srcOff = c * planeA;
      const dstOff = c * origPlane;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          cropped[dstOff + y * width + x] = outputTensor[srcOff + y * padW + x];
        }
      }
    }
    return cropped;
  };

  let outFrameIndex = 0;
  const t0 = performance.now();

  for (let k = 0; k < keyframeBuffers.length - 1; k++) {
    const tA = bmpToTensor(keyframeBuffers[k]).data;
    const tB = bmpToTensor(keyframeBuffers[k + 1]).data;

    let sequence: Float32Array[] = [];
    if (task.multiplier === 4) {
      // 4x slowmo: tA, t0.25, t0.5, t0.75
      const tMid = await interpolatePair(tA, tB);
      const tQuarter = await interpolatePair(tA, tMid);
      const tThreeQuarter = await interpolatePair(tMid, tB);
      sequence = [tA, tQuarter, tMid, tThreeQuarter];
    } else {
      // 2x slowmo: tA, t0.5
      const tMid = await interpolatePair(tA, tB);
      sequence = [tA, tMid];
    }

    for (const fTensor of sequence) {
      const outBmp = tensorToBmp(fTensor, width, height);
      fs.writeFileSync(
        path.join(interpDir, `frame_${String(outFrameIndex).padStart(5, '0')}.bmp`),
        outBmp
      );
      outFrameIndex++;
    }
  }

  // Final frame
  const lastTensor = bmpToTensor(keyframeBuffers[keyframeBuffers.length - 1]).data;
  fs.writeFileSync(
    path.join(interpDir, `frame_${String(outFrameIndex).padStart(5, '0')}.bmp`),
    tensorToBmp(lastTensor, width, height)
  );
  outFrameIndex++;

  const elapsed = performance.now() - t0;
  console.log(`Generated ${outFrameIndex} frames via RIFE in ${(elapsed / 1000).toFixed(2)}s (${(elapsed / outFrameIndex).toFixed(1)} ms/frame).`);

  // 3. Upscale to 1920x1080 60 FPS pristine video
  const outMp4 = path.join(outClipsDir, `${task.name}.mp4`);
  console.log(`Encoding 1080p 60fps MP4 -> ${outMp4}...`);
  await execFileAsync(ffmpeg, [
    '-y',
    '-framerate', '60',
    '-i', path.join(interpDir, 'frame_%05d.bmp'),
    '-vf', 'scale=1920:1080:flags=lanczos',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outMp4
  ]);

  // Clean cache
  fs.rmSync(clipWorkDir, { recursive: true, force: true });
  console.log(`[RIFE Twixtor] Done: ${outMp4} (${(fs.statSync(outMp4).size / (1024 * 1024)).toFixed(2)} MB)`);
}

async function main() {
  const ffmpeg = FfmpegService.getFfmpegPath();
  const modelPath = path.join(process.env.APPDATA || '', 'Kori', 'models', 'rife_v4.onnx');
  const clipsRawDir = path.resolve('test-assets/real/clips_raw');
  const outClipsDir = path.resolve('test-assets/real/clips');
  const cacheDir = path.resolve('test-assets/cache/rife_clips');

  fs.mkdirSync(outClipsDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  console.log(`Initializing RIFE v4 ONNX model on DirectML / RTX 5060...`);
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['dml', 'cpu'],
  });

  // Action cuts with continuous motion (each 2.5s - 5.0s, yielding 5s - 10s at 2x/4x 60fps):
  // 1. Alpha combat dash (sword strike + dodge)
  // 2. Alpha blade swing & acrobatic flip
  // 3. Shadow sword clash & purple slash
  // 4. Shadow cloak flare & burst
  // 5. Alpha eye closeup & power release
  const tasks: ClipTask[] = [
    {
      name: 'twixtor_alpha_dash_combat',
      sourceFile: path.join(clipsRawDir, 'anime_clip_04_alpha_combat.mp4'),
      startTime: 8.1,
      duration: 3.5,
      multiplier: 4, // 3.5s * 4 -> ~14s twixtor
    },
    {
      name: 'twixtor_alpha_blade_acrobatics',
      sourceFile: path.join(clipsRawDir, 'anime_clip_04_alpha_combat.mp4'),
      startTime: 17.0,
      duration: 3.4,
      multiplier: 4, // 3.4s * 4 -> ~13.6s twixtor
    },
    {
      name: 'twixtor_shadow_purple_slash',
      sourceFile: path.join(clipsRawDir, 'anime_clip_03_shadow_ep12.mp4'),
      startTime: 15.5,
      duration: 3.2,
      multiplier: 4, // 3.2s * 4 -> ~12.8s twixtor
    },
    {
      name: 'twixtor_shadow_cloak_blast',
      sourceFile: path.join(clipsRawDir, 'anime_clip_03_shadow_ep12.mp4'),
      startTime: 25.0,
      duration: 3.5,
      multiplier: 4, // 3.5s * 4 -> ~14s twixtor
    },
    {
      name: 'twixtor_alpha_eyes_focus',
      sourceFile: path.join(clipsRawDir, 'anime_clip_04_alpha_combat.mp4'),
      startTime: 22.4,
      duration: 3.0,
      multiplier: 4, // 3.0s * 4 -> ~12s twixtor
    },
  ];

  for (const t of tasks) {
    await processClip(t, session, ffmpeg, cacheDir, outClipsDir);
  }

  console.log(`\nAll RIFE twixtor clips created successfully in ${outClipsDir}!`);
}

main().catch(console.error);
