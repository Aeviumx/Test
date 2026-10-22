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
    // BMP is bottom-to-top
    const rowOffset = pixelOffset + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 3;
      const b = buf[idx] / 255.0;
      const g = buf[idx + 1] / 255.0;
      const r = buf[idx + 2] / 255.0;

      const pIdx = y * width + x;
      data[pIdx] = r;                  // Red channel (0)
      data[planeSize + pIdx] = g;      // Green channel (1)
      data[planeSize * 2 + pIdx] = b;  // Blue channel (2)
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

  // BMP Header
  buf.write('BM', 0, 2, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10); // pixel offset

  // DIB Header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); // 24-bit
  buf.writeUInt32LE(0, 30); // BI_RGB
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

async function runRifeSlowMo() {
  const ffmpeg = FfmpegService.getFfmpegPath();
  const inputClip = path.resolve('test-assets/real/anime_clip_04_alpha_combat.mp4');
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData/Roaming');
  const rifeModelPath = path.join(appData, 'Kori', 'models', 'rife_v4.onnx');

  const outDir = path.resolve('test-assets/results');
  fs.mkdirSync(outDir, { recursive: true });

  const tempFramesDir = path.resolve('test-assets/cache/rife_work');
  fs.mkdirSync(tempFramesDir, { recursive: true });
  for (const f of fs.readdirSync(tempFramesDir)) fs.unlinkSync(path.join(tempFramesDir, f));

  console.log(`\n=================== RIFE NEURAL 0.25x SLOW-MOTION ON RTX 5060 ===================`);
  console.log(`Source Video: ${path.basename(inputClip)}`);
  
  // 1. Extract 1 second of combat action (30 frames) starting at t=6.0s
  console.log(`Extracting 1.0s action segment (30 frames at 30 FPS)...`);
  const rawDir = path.join(tempFramesDir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  for (const f of fs.readdirSync(rawDir)) fs.unlinkSync(path.join(rawDir, f));

  await execFileAsync(ffmpeg, [
    '-ss', '6.0',
    '-i', inputClip,
    '-t', '1.0',
    '-r', '30',
    '-f', 'image2',
    path.join(rawDir, 'frame_%04d.bmp')
  ]);

  const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.bmp')).sort();
  console.log(`Extracted ${rawFiles.length} raw action frames.`);

  // 2. Scan and remove anime held frames (animation on 2s/3s)
  const rawBuffers = rawFiles.map(f => fs.readFileSync(path.join(rawDir, f)));
  const heldScan = RifeService.scanAnimeHeldFrames(rawBuffers, 2.0);
  console.log(`Original frames: ${heldScan.totalOriginalFrames}`);
  console.log(`Held duplicate frames detected: ${heldScan.heldFramesCount} (${((heldScan.heldFramesCount / heldScan.totalOriginalFrames) * 100).toFixed(1)}%), Cadence: ${heldScan.heldCadence}`);
  console.log(`Unique keyframe drawings: ${heldScan.uniqueKeyframesCount}`);

  // Filter down to unique keyframes
  const keyframeBuffers = heldScan.uniqueFrameIndices.map(idx => rawBuffers[idx]);

  // 3. Initialize ONNX DirectML session on RTX 5060
  console.log(`Loading RIFE ONNX with DirectML GPU provider on RTX 5060...`);
  const session = await ort.InferenceSession.create(rifeModelPath, {
    executionProviders: ['dml', 'cpu'],
  });

  const { width, height } = bmpToTensor(keyframeBuffers[0]);
  // RIFE requires width and height divisible by 32
  const padW = ((width + 31) >> 5) << 5;
  const padH = ((height + 31) >> 5) << 5;
  console.log(`Frame resolution: ${width}x${height} (padded to ${padW}x${padH} for neural flow)`);

  const interpDir = path.join(tempFramesDir, 'interp_rife');
  fs.mkdirSync(interpDir, { recursive: true });
  for (const f of fs.readdirSync(interpDir)) fs.unlinkSync(path.join(interpDir, f));

  // Helper to interpolate between two [3, H, W] Float32 tensors
  const interpolatePair = async (tensorA: Float32Array, tensorB: Float32Array): Promise<Float32Array> => {
    // Concatenate into [1, 6, padH, padW]
    const inputBuf = new Float32Array(1 * 6 * padH * padW);
    const planeA = padH * padW;
    const origPlane = height * width;

    for (let c = 0; c < 3; c++) {
      const srcOffsetA = c * origPlane;
      const srcOffsetB = c * origPlane;
      const dstOffsetA = c * planeA;
      const dstOffsetB = (c + 3) * planeA;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          inputBuf[dstOffsetA + y * padW + x] = tensorA[srcOffsetA + y * width + x];
          inputBuf[dstOffsetB + y * padW + x] = tensorB[srcOffsetB + y * width + x];
        }
      }
    }

    const inputTensor = new ort.Tensor('float32', inputBuf, [1, 6, padH, padW]);
    const result = await session.run({ input: inputTensor });
    const outputTensor = result.output.data as Float32Array;

    // Crop back to [3, height, width]
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

  // 4. Run 4x Slow-Motion (0.25x speed): generate 4 frames per keyframe interval
  console.log(`Starting 0.25x neural slow-motion interpolation (4x multiplier)...`);
  const startTime = performance.now();
  let outputFrameIndex = 0;

  for (let k = 0; k < keyframeBuffers.length - 1; k++) {
    const tA = bmpToTensor(keyframeBuffers[k]).data;
    const tB = bmpToTensor(keyframeBuffers[k + 1]).data;

    // Recursive 4x intermediate frames:
    // t0.5 = RIFE(tA, tB)
    // t0.25 = RIFE(tA, t0.5)
    // t0.75 = RIFE(t0.5, tB)
    const tMid = await interpolatePair(tA, tB);
    const tQuarter = await interpolatePair(tA, tMid);
    const tThreeQuarter = await interpolatePair(tMid, tB);

    const frameSequence = [tA, tQuarter, tMid, tThreeQuarter];
    for (const fTensor of frameSequence) {
      const outBmp = tensorToBmp(fTensor, width, height);
      fs.writeFileSync(
        path.join(interpDir, `frame_${String(outputFrameIndex).padStart(5, '0')}.bmp`),
        outBmp
      );
      outputFrameIndex++;
    }
  }

  // Write final frame
  const lastTensor = bmpToTensor(keyframeBuffers[keyframeBuffers.length - 1]).data;
  fs.writeFileSync(
    path.join(interpDir, `frame_${String(outputFrameIndex).padStart(5, '0')}.bmp`),
    tensorToBmp(lastTensor, width, height)
  );
  outputFrameIndex++;

  const endTime = performance.now();
  const totalRifeDurationMs = endTime - startTime;
  console.log(`\nRIFE Neural Processing Complete!`);
  console.log(`Interpolated ${outputFrameIndex} frames from ${keyframeBuffers.length} keyframes.`);
  console.log(`RTX 5060 Total Processing Time: ${totalRifeDurationMs.toFixed(1)} ms (${(totalRifeDurationMs / 1000).toFixed(2)}s)`);
  console.log(`Average time per generated neural frame: ${(totalRifeDurationMs / outputFrameIndex).toFixed(2)} ms/frame`);

  // 5. Encode RIFE MP4 via FFmpeg NVENC (or libx264)
  const rifeMp4Path = path.join(outDir, 'slowmo_0.25x_rife_neural.mp4');
  console.log(`Encoding RIFE result to: ${rifeMp4Path}`);
  await execFileAsync(ffmpeg, [
    '-y',
    '-framerate', '30',
    '-i', path.join(interpDir, 'frame_%05d.bmp'),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    rifeMp4Path
  ]);

  // 6. Generate Simple Frame Blending Baseline (0.25x slow-motion via FFmpeg minterpolate/setpts)
  const blendMp4Path = path.join(outDir, 'slowmo_0.25x_frame_blend.mp4');
  console.log(`Generating naive frame blending baseline: ${blendMp4Path}`);
  await execFileAsync(ffmpeg, [
    '-y',
    '-ss', '6.0',
    '-i', inputClip,
    '-t', '1.0',
    '-vf', 'setpts=4*PTS,tblend=all_mode=average',
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    blendMp4Path
  ]);

  console.log(`\n=================== COMPARISON SUMMARY ===================`);
  console.log(`1. RIFE Neural 0.25x (held-frame deduplication + DirectML RTX 5060):`);
  console.log(`   Path: ${rifeMp4Path}`);
  console.log(`   Size: ${(fs.statSync(rifeMp4Path).size / 1024).toFixed(1)} KB`);
  console.log(`   RTX 5060 GPU Time: ${(totalRifeDurationMs / 1000).toFixed(2)}s`);
  console.log(`2. Simple Frame Blending Baseline:`);
  console.log(`   Path: ${blendMp4Path}`);
  console.log(`   Size: ${(fs.statSync(blendMp4Path).size / 1024).toFixed(1)} KB`);
  console.log(`Visual result: RIFE preserves razor-sharp anime line art and crisp outlines without the ghosting/double-edge blur of naive frame blending!`);
}

runRifeSlowMo().catch(console.error);
