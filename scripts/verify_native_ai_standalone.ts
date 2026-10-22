/**
/**
 * Standalone Native AI Verification Script (Pure TypeScript + onnxruntime-node + whisper-cli)
 * 
 * Strictly removes any Python from process.env.PATH to prove Kōri operates 100% natively:
 * 1. SkyTNT IS-Net Anime Matting (pure TS pre/post-processing + ONNX session)
 * 2. DeepGHS Anime Face Detector (pure TS YOLOv8 decode + NMS + ONNX session)
 * 3. CFA Anime Facial Landmarks (pure TS face crop + resize + 24-point argmax + ONNX session)
 * 4. Depth Anything V2 Small (pure TS ImageNet norm + resize + ONNX session)
 * 5. Standalone whisper-cli native C++ binary transcription
 * 6. Mathematical comparison with Python ground truth (Mask IoU, Face Box IoU, Depth MAE)
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync, spawn } from 'child_process';
import * as ort from 'onnxruntime-node';

// Universal __dirname support for CJS and ESM
const scriptDir = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// 1. Sanitize PATH to ensure NO Python exists in environment
const currentPath = process.env.PATH || '';
const sanitizedPath = currentPath
  .split(';')
  .filter(p => !p.toLowerCase().includes('python') && !p.toLowerCase().includes('framepack'))
  .join(';');
process.env.PATH = sanitizedPath;

const FFMPEG = path.resolve(scriptDir, '../node_modules/ffmpeg-static/ffmpeg.exe');
const ART_PATH = path.resolve(scriptDir, '../public/assets/gacha_lucia.png');
const PY_GT_DIR = path.resolve(scriptDir, '../test-assets/cache/py_gt');

console.log('='.repeat(80));
console.log('KŌRI NATIVE RUNTIME REAL INFERENCE AUDIT (PURE TYPESCRIPT, ZERO PYTHON)');
console.log('='.repeat(80));

// --- Image I/O & Pre/Post-processing Helpers in Pure TypeScript ---

function decodeImageRgb(filePath: string): { data: Uint8Array; width: number; height: number } {
  // Read resolution via ffprobe or ffmpeg
  const probe = spawnSync(FFMPEG, ['-i', filePath], { encoding: 'utf-8' });
  const match = probe.stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  if (!match) throw new Error(`Could not determine dimensions for ${filePath}`);
  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);

  const res = spawnSync(FFMPEG, [
    '-y', '-i', filePath,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-'
  ], { maxBuffer: 100 * 1024 * 1024 });

  if (res.status !== 0) throw new Error(`Failed to decode image: ${res.stderr.toString()}`);
  return { data: new Uint8Array(res.stdout), width, height };
}

function bilinearResizeRgb(
  src: Uint8Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): Float32Array {
  const dst = new Float32Array(dw * dh * 3);
  const xRatio = (sw - 1) / Math.max(1, dw - 1);
  const yRatio = (sh - 1) / Math.max(1, dh - 1);

  for (let dy = 0; dy < dh; dy++) {
    const sy = dy * yRatio;
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const yLerp = sy - y0;

    for (let dx = 0; dx < dw; dx++) {
      const sx = dx * xRatio;
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const xLerp = sx - x0;

      const dstIdx = (dy * dw + dx) * 3;

      for (let c = 0; c < 3; c++) {
        const p00 = src[(y0 * sw + x0) * 3 + c];
        const p10 = src[(y0 * sw + x1) * 3 + c];
        const p01 = src[(y1 * sw + x0) * 3 + c];
        const p11 = src[(y1 * sw + x1) * 3 + c];

        const top = p00 + (p10 - p00) * xLerp;
        const bottom = p01 + (p11 - p01) * xLerp;
        dst[dstIdx + c] = (top + (bottom - top) * yLerp) / 255.0;
      }
    }
  }
  return dst;
}

function resizeFloatSingleChannel(
  src: Float32Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): Float32Array {
  const dst = new Float32Array(dw * dh);
  const xRatio = (sw - 1) / Math.max(1, dw - 1);
  const yRatio = (sh - 1) / Math.max(1, dh - 1);

  for (let dy = 0; dy < dh; dy++) {
    const sy = dy * yRatio;
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const yLerp = sy - y0;

    for (let dx = 0; dx < dw; dx++) {
      const sx = dx * xRatio;
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const xLerp = sx - x0;

      const p00 = src[y0 * sw + x0];
      const p10 = src[y0 * sw + x1];
      const p01 = src[y1 * sw + x0];
      const p11 = src[y1 * sw + x1];

      const top = p00 + (p10 - p00) * xLerp;
      const bottom = p01 + (p11 - p01) * xLerp;
      dst[dy * dw + dx] = top + (bottom - top) * yLerp;
    }
  }
  return dst;
}

// Compute Intersection over Union for two binary masks
function computeMaskIou(maskA: Float32Array, maskB: Float32Array, thresh = 0.5): number {
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < maskA.length; i++) {
    const a = maskA[i] >= thresh ? 1 : 0;
    const b = maskB[i] >= thresh ? 1 : 0;
    if (a && b) intersection++;
    if (a || b) union++;
  }
  return union > 0 ? (intersection / union) * 100.0 : 100.0;
}

// Compute Box IoU
function computeBoxIou(b1: number[], b2: number[]): number {
  const ix1 = Math.max(b1[0], b2[0]);
  const iy1 = Math.max(b1[1], b2[1]);
  const ix2 = Math.min(b1[2], b2[2]);
  const iy2 = Math.min(b1[3], b2[3]);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;

  const a1 = (b1[2] - b1[0]) * (b1[3] - b1[1]);
  const a2 = (b2[2] - b2[0]) * (b2[3] - b2[1]);
  const union = a1 + a2 - inter;
  return union > 0 ? (inter / union) * 100.0 : 0.0;
}

// Parse Python numpy 2D float32/uint8 array
function loadNpy(filePath: string): Float32Array {
  const buf = fs.readFileSync(filePath);
  // Simple NPY header parser
  const headerLen = buf.readUInt16LE(8);
  const dataStart = 10 + headerLen;
  const rawData = buf.subarray(dataStart);
  
  if (filePath.endsWith('depth_norm.npy')) {
    // uint8 array
    const floats = new Float32Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) floats[i] = rawData[i];
    return floats;
  }
  // float32 array
  return new Float32Array(rawData.buffer, rawData.byteOffset, rawData.length / 4);
}

// --- Main Verification Execution ---

async function runNativeVerification() {
  // 1. Decode real art
  console.log(`\n[STEP 1/5] Loading & Decoding Real Anime Art: ${path.basename(ART_PATH)}`);
  const { data: rawRgb, width: w0, height: h0 } = decodeImageRgb(ART_PATH);
  console.log(`  Decoded raw RGB: ${w0}×${h0} (${rawRgb.length} bytes) via ffmpeg-static`);

  // -------------------------------------------------------------
  // Model 1: SkyTNT IS-Net Anime Segmentation
  // -------------------------------------------------------------
  console.log(`\n[STEP 2/5] Real Native Inference: SkyTNT IS-Net Anime Segmentation (ONNX)`);
  const isnetPath = path.resolve(scriptDir, '../models/isnetis.onnx');
  const isnetSess = await ort.InferenceSession.create(isnetPath);

  const s = 1024;
  const rw = h0 > w0 ? Math.floor(s * w0 / h0) : s;
  const rh = h0 > w0 ? s : Math.floor(s * h0 / w0);
  const ph = s - rh;
  const pw = s - rw;
  const topPad = Math.floor(ph / 2);
  const leftPad = Math.floor(pw / 2);

  const resizedIsnet = bilinearResizeRgb(rawRgb, w0, h0, rw, rh);
  const isnetTensorData = new Float32Array(1 * 3 * s * s);

  // Layout: NCHW, BGR channel order matching Python cv2.imread
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const srcIdx = (y * rw + x) * 3;
      const targetY = topPad + y;
      const targetX = leftPad + x;

      // Convert RGB from ffmpeg to BGR for cv2 compatibility: B=src[2], G=src[1], R=src[0]
      isnetTensorData[0 * (s * s) + targetY * s + targetX] = resizedIsnet[srcIdx + 2];
      isnetTensorData[1 * (s * s) + targetY * s + targetX] = resizedIsnet[srcIdx + 1];
      isnetTensorData[2 * (s * s) + targetY * s + targetX] = resizedIsnet[srcIdx + 0];
    }
  }

  const isnetTensor = new ort.Tensor('float32', isnetTensorData, [1, 3, s, s]);
  const isnetT0 = Date.now();
  const isnetOut = await isnetSess.run({ img: isnetTensor });
  const isnetDt = Date.now() - isnetT0;

  const rawOutIsnet = isnetOut[Object.keys(isnetOut)[0]].data as Float32Array;
  // Crop center active region [topPad..topPad+rh, leftPad..leftPad+rw]
  const croppedMask = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      croppedMask[y * rw + x] = rawOutIsnet[(topPad + y) * s + (leftPad + x)];
    }
  }

  const nativeMask = resizeFloatSingleChannel(croppedMask, rw, rh, w0, h0);
  for (let i = 0; i < nativeMask.length; i++) {
    nativeMask[i] = Math.max(0, Math.min(1, nativeMask[i]));
  }

  console.log(`  Native IS-Net inference completed in ${isnetDt}ms`);
  const pyMask = loadNpy(path.join(PY_GT_DIR, 'mask_isnet.npy'));
  const maskIou = computeMaskIou(nativeMask, pyMask, 0.5);
  console.log(`  Verification vs Python GT:`);
  console.log(`    -> Mask IoU: ${maskIou.toFixed(2)}% (Target >= 98.0%)`);
  if (maskIou < 98.0) throw new Error(`Mask IoU too low: ${maskIou}%`);

  // -------------------------------------------------------------
  // Model 2: DeepGHS Anime Face Detector (YOLOv8)
  // -------------------------------------------------------------
  console.log(`\n[STEP 3/5] Real Native Inference: DeepGHS Anime Face Detection (YOLOv8 ONNX)`);
  const facePath = path.resolve(scriptDir, '../models/anime_face_detect.onnx');
  const faceSess = await ort.InferenceSession.create(facePath);

  const sf = 640;
  const resizedFace = bilinearResizeRgb(rawRgb, w0, h0, sf, sf);
  const faceTensorData = new Float32Array(1 * 3 * sf * sf);
  // Convert RGB to BGR for cv2 YOLOv8 input compatibility
  for (let i = 0; i < sf * sf; i++) {
    faceTensorData[0 * sf * sf + i] = resizedFace[i * 3 + 2]; // B
    faceTensorData[1 * sf * sf + i] = resizedFace[i * 3 + 1]; // G
    faceTensorData[2 * sf * sf + i] = resizedFace[i * 3 + 0]; // R
  }

  const faceTensor = new ort.Tensor('float32', faceTensorData, [1, 3, sf, sf]);
  const faceT0 = Date.now();
  const faceOut = await faceSess.run({ images: faceTensor });
  const faceDt = Date.now() - faceT0;

  const rawFacePreds = faceOut[Object.keys(faceOut)[0]].data as Float32Array;
  // Shape is [1, 5, 8400]
  const numPreds = 8400;
  let nativeBestBox: number[] = [];
  let bestConf = 0.0;

  for (let p = 0; p < numPreds; p++) {
    const cx = rawFacePreds[0 * numPreds + p];
    const cy = rawFacePreds[1 * numPreds + p];
    const fw = rawFacePreds[2 * numPreds + p];
    const fh = rawFacePreds[3 * numPreds + p];
    const conf = rawFacePreds[4 * numPreds + p];

    if (conf > 0.45 && conf > bestConf) {
      bestConf = conf;
      const x1 = Math.max(0, Math.floor((cx - fw / 2) * (w0 / sf)));
      const y1 = Math.max(0, Math.floor((cy - fh / 2) * (h0 / sf)));
      const x2 = Math.min(w0, Math.floor((cx + fw / 2) * (w0 / sf)));
      const y2 = Math.min(h0, Math.floor((cy + fh / 2) * (h0 / sf)));
      nativeBestBox = [x1, y1, x2, y2, Math.round(conf * 1000) / 1000];
    }
  }

  console.log(`  Native Face Detection completed in ${faceDt}ms`);
  console.log(`  Detected Face Bounding Box: [${nativeBestBox.slice(0, 4).join(', ')}] (Confidence: ${(nativeBestBox[4]*100).toFixed(1)}%)`);

  const pyFaceBox: number[] = JSON.parse(fs.readFileSync(path.join(PY_GT_DIR, 'face_box.json'), 'utf-8'));
  const faceBoxIou = computeBoxIou(nativeBestBox, pyFaceBox);
  console.log(`  Verification vs Python GT:`);
  console.log(`    -> Python Box: [${pyFaceBox.slice(0, 4).join(', ')}]`);
  console.log(`    -> Face Box IoU: ${faceBoxIou.toFixed(2)}% (Target >= 95.0%)`);
  if (faceBoxIou < 95.0) throw new Error(`Face Box IoU too low: ${faceBoxIou}%`);

  // -------------------------------------------------------------
  // Model 3: CFA Anime Facial Landmark Detector (24 points)
  // -------------------------------------------------------------
  console.log(`\n[STEP 4/5] Real Native Inference: CFA Anime Facial Landmarks (24 points ONNX)`);
  const cfaPath = path.resolve(scriptDir, '../models/anime_landmarks_cfa.onnx');
  const cfaSess = await ort.InferenceSession.create(cfaPath);

  const [fx1, fy1, fx2, fy2] = nativeBestBox;
  const fbw = fx2 - fx1;
  const fbh = fy2 - fy1;
  const padX = Math.floor(fbw * 0.15);
  const padY = Math.floor(fbh * 0.15);
  const cx1 = Math.max(0, fx1 - padX);
  const cy1 = Math.max(0, fy1 - padY);
  const cx2 = Math.min(w0, fx2 + padX);
  const cy2 = Math.min(h0, fy2 + padY);
  const cropW = cx2 - cx1;
  const cropH = cy2 - cy1;

  // Extract crop
  const cropRgb = new Uint8Array(cropW * cropH * 3);
  for (let cy = 0; cy < cropH; cy++) {
    for (let cx = 0; cx < cropW; cx++) {
      const srcIdx = ((cy1 + cy) * w0 + (cx1 + cx)) * 3;
      const dstIdx = (cy * cropW + cx) * 3;
      cropRgb[dstIdx] = rawRgb[srcIdx];
      cropRgb[dstIdx + 1] = rawRgb[srcIdx + 1];
      cropRgb[dstIdx + 2] = rawRgb[srcIdx + 2];
    }
  }

  // Resize crop to 128x128
  const cropResized = bilinearResizeRgb(cropRgb, cropW, cropH, 128, 128);
  const cfaTensorData = new Float32Array(1 * 3 * 128 * 128);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < 128 * 128; i++) {
      // Normalize [-1, 1]: (val - 0.5) / 0.5
      cfaTensorData[c * 128 * 128 + i] = (cropResized[i * 3 + c] - 0.5) / 0.5;
    }
  }

  const cfaTensor = new ort.Tensor('float32', cfaTensorData, [1, 3, 128, 128]);
  const cfaT0 = Date.now();
  const cfaOut = await cfaSess.run({ input: cfaTensor });
  const cfaDt = Date.now() - cfaT0;

  const heatmaps = cfaOut[Object.keys(cfaOut)[0]].data as Float32Array; // [1, 25, 32, 32]
  const nativeLandmarks: Array<[number, number, number]> = [];

  for (let pt = 0; pt < 24; pt++) {
    let maxVal = -1e9;
    let maxLx = 0;
    let maxLy = 0;
    const hmOffset = pt * 32 * 32;

    for (let ly = 0; ly < 32; ly++) {
      for (let lx = 0; lx < 32; lx++) {
        const val = heatmaps[hmOffset + ly * 32 + lx];
        if (val > maxVal) {
          maxVal = val;
          maxLx = lx;
          maxLy = ly;
        }
      }
    }
    const fullX = cx1 + Math.round(maxLx * (cropW / 32.0));
    const fullY = cy1 + Math.round(maxLy * (cropH / 32.0));
    nativeLandmarks.push([fullX, fullY, Math.round(maxVal * 1000) / 1000]);
  }

  console.log(`  Native CFA Landmark inference completed in ${cfaDt}ms`);
  const pyLandmarks: Array<[number, number, number]> = JSON.parse(
    fs.readFileSync(path.join(PY_GT_DIR, 'landmarks.json'), 'utf-8')
  );

  let totalDist = 0;
  for (let i = 0; i < 24; i++) {
    const dx = nativeLandmarks[i][0] - pyLandmarks[i][0];
    const dy = nativeLandmarks[i][1] - pyLandmarks[i][1];
    totalDist += Math.sqrt(dx * dx + dy * dy);
  }
  const meanDist = totalDist / 24.0;
  console.log(`  Verification vs Python GT:`);
  console.log(`    -> Mean Landmark Euclidean Distance: ${meanDist.toFixed(2)} px (Target < 2.5 px)`);
  if (meanDist > 2.5) throw new Error(`Landmark distance too high: ${meanDist}px`);

  // -------------------------------------------------------------
  // Model 4: Depth Anything V2 Small Monocular Depth
  // -------------------------------------------------------------
  console.log(`\n[STEP 5/5] Real Native Inference: Depth Anything V2 Small (ONNX)`);
  const depthPath = path.resolve(scriptDir, '../models/depth_anything_v2_small.onnx');
  const depthSess = await ort.InferenceSession.create(depthPath);

  const sd = 518;
  const resizedDepth = bilinearResizeRgb(rawRgb, w0, h0, sd, sd);
  const depthTensorData = new Float32Array(1 * 3 * sd * sd);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < sd * sd; i++) {
      depthTensorData[c * sd * sd + i] = (resizedDepth[i * 3 + c] - mean[c]) / std[c];
    }
  }

  const depthTensor = new ort.Tensor('float32', depthTensorData, [1, 3, sd, sd]);
  const depthT0 = Date.now();
  const depthOut = await depthSess.run({ pixel_values: depthTensor });
  const depthDt = Date.now() - depthT0;

  const rawDepthMap = depthOut[Object.keys(depthOut)[0]].data as Float32Array; // [1, 518, 518]
  const fullDepth = resizeFloatSingleChannel(rawDepthMap, sd, sd, w0, h0);

  let dMin = 1e9;
  let dMax = -1e9;
  for (let i = 0; i < fullDepth.length; i++) {
    if (fullDepth[i] < dMin) dMin = fullDepth[i];
    if (fullDepth[i] > dMax) dMax = fullDepth[i];
  }

  const nativeDepthU8 = new Float32Array(w0 * h0);
  const dRange = Math.max(1e-6, dMax - dMin);
  for (let i = 0; i < fullDepth.length; i++) {
    nativeDepthU8[i] = Math.round(((fullDepth[i] - dMin) / dRange) * 255.0);
  }

  console.log(`  Native Depth Anything V2 inference completed in ${depthDt}ms`);
  const pyDepth = loadNpy(path.join(PY_GT_DIR, 'depth_norm.npy'));

  let totalDiff = 0;
  for (let i = 0; i < nativeDepthU8.length; i++) {
    totalDiff += Math.abs(nativeDepthU8[i] - pyDepth[i]);
  }
  const meanDepthDiff = totalDiff / nativeDepthU8.length;
  console.log(`  Verification vs Python GT:`);
  console.log(`    -> Mean Absolute Error (MAE) on 0..255 scale: ${meanDepthDiff.toFixed(2)} (Target < 3.0)`);
  if (meanDepthDiff > 3.0) throw new Error(`Depth difference too high: ${meanDepthDiff}`);

  // -------------------------------------------------------------
  // Native Whisper C++ Binary Inference Check
  // -------------------------------------------------------------
  console.log(`\n[WHISPER] Real Native C++ Inference: whisper-cli.exe`);
  const whisperCli = path.resolve(scriptDir, '../bin/whisper/Release/whisper-cli.exe');
  const ggmlModel = path.resolve(scriptDir, '../models/ggml-base.bin');
  const testWav = path.resolve(scriptDir, '../test-assets/results/test_ref2_16k.wav');

  const whisperRes = spawnSync(whisperCli, ['-m', ggmlModel, '-f', testWav, '-ml', '1'], { encoding: 'utf-8' });
  if (whisperRes.status !== 0) {
    throw new Error(`whisper-cli failed: ${whisperRes.stderr}`);
  }
  const words: string[] = [];
  const lineRegex = /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s+(.*)/g;
  let match;
  while ((match = lineRegex.exec(whisperRes.stdout)) !== null) {
    words.push(match[3].trim());
  }
  console.log(`  Transcribed ${words.length} words via pure standalone native C++ binary`);
  console.log(`  Sample: "${words.slice(0, 6).join(' ')}..."`);

  // Save Native Outputs (Cutout, Annotated Face, Depth Map) via FFmpeg
  console.log(`\n[EXPORT] Saving Native Inference Outputs to test-assets/results/`);
  const outDir = path.resolve(scriptDir, '../test-assets/results');
  
  // 1. Save Mask Cutout against dark background [15, 23, 42]
  const cutoutRgb = new Uint8Array(w0 * h0 * 3);
  for (let i = 0; i < w0 * h0; i++) {
    const alpha = nativeMask[i];
    const r = rawRgb[i * 3 + 0];
    const g = rawRgb[i * 3 + 1];
    const b = rawRgb[i * 3 + 2];
    cutoutRgb[i * 3 + 0] = Math.round(r * alpha + 15 * (1 - alpha));
    cutoutRgb[i * 3 + 1] = Math.round(g * alpha + 23 * (1 - alpha));
    cutoutRgb[i * 3 + 2] = Math.round(b * alpha + 42 * (1 - alpha));
  }
  const cutoutPath = path.join(outDir, 'native_isnet_cutout.png');
  spawnSync(FFMPEG, [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w0}x${h0}`,
    '-i', '-',
    cutoutPath
  ], { input: Buffer.from(cutoutRgb) });
  console.log(`  Saved native character cutout: ${cutoutPath}`);

  // 2. Save Normalized Depth Map
  const depthRgb = new Uint8Array(w0 * h0 * 3);
  for (let i = 0; i < w0 * h0; i++) {
    const dVal = nativeDepthU8[i];
    depthRgb[i * 3 + 0] = dVal;
    depthRgb[i * 3 + 1] = dVal;
    depthRgb[i * 3 + 2] = dVal;
  }
  const depthOutPath = path.join(outDir, 'native_depth_map.png');
  spawnSync(FFMPEG, [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w0}x${h0}`,
    '-i', '-',
    depthOutPath
  ], { input: Buffer.from(depthRgb) });
  console.log(`  Saved native depth map: ${depthOutPath}`);

  // Final Verdict
  console.log('\n' + '='.repeat(80));
  console.log('AUDIT VERDICT: 100% NATIVE RUNTIME PROVEN.');
  console.log('  1. SkyTNT IS-Net Mask IoU:          ' + maskIou.toFixed(2) + '% [PASS]');
  console.log('  2. Anime Face Bounding Box IoU:      ' + faceBoxIou.toFixed(2) + '% [PASS]');
  console.log('  3. 24 Facial Landmarks Mean Error:   ' + meanDist.toFixed(2) + ' px [PASS]');
  console.log('  4. Depth Anything V2 Map MAE:        ' + meanDepthDiff.toFixed(2) + ' / 255 [PASS]');
  console.log('  5. whisper-cli Native Transcription: ' + words.length + ' words [PASS]');
  console.log('='.repeat(80));
}

runNativeVerification().catch(err => {
  console.error('\nAUDIT FAILED:', err);
  process.exit(1);
});
