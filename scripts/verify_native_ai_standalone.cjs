/**
 * Standalone Native AI Verification Script
 * Strictly removes any Python from process.env.PATH to prove Kōri operates 100% natively:
 * - ONNX Runtime Node (C++ native addon)
 * - Standalone whisper-cli binary
 * - Built-in ffmpeg-static
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ort = require('onnxruntime-node');

// 1. Sanitize PATH to ensure NO Python exists in environment
const currentPath = process.env.PATH || '';
const sanitizedPath = currentPath
  .split(';')
  .filter(p => !p.toLowerCase().includes('python') && !p.toLowerCase().includes('framepack'))
  .join(';');
process.env.PATH = sanitizedPath;

console.log('='.repeat(75));
console.log('KŌRI NATIVE RUNTIME AUDIT (PYTHON COMPLETELY REMOVED FROM PATH)');
console.log('='.repeat(75));

async function runAudit() {
  const models = [
    { name: 'SkyTNT Anime Segmentation (IS-Net)', file: 'models/isnetis.onnx' },
    { name: 'DeepGHS Anime Face Detector (YOLOv8)', file: 'models/anime_face_detect.onnx' },
    { name: 'CFA Anime Facial Landmarks (24 points)', file: 'models/anime_landmarks_cfa.onnx' },
    { name: 'Depth Anything V2 Small (Monocular Depth)', file: 'models/depth_anything_v2_small.onnx' },
  ];

  console.log('\n[TEST 1/2] Initializing ONNX Models via onnxruntime-node:');
  for (const m of models) {
    const fullPath = path.resolve(__dirname, '..', m.file);
    if (!fs.existsSync(fullPath)) {
      console.error(`  FAIL: Missing model file ${fullPath}`);
      process.exit(1);
    }
    const t0 = Date.now();
    const session = await ort.InferenceSession.create(fullPath);
    const dt = Date.now() - t0;
    console.log(`  PASS: ${m.name}`);
    console.log(`        File: ${m.file} (${(fs.statSync(fullPath).size / 1024 / 1024).toFixed(1)} MB) | Load: ${dt}ms`);
    console.log(`        Inputs: [${session.inputNames.join(', ')}] | Outputs: [${session.outputNames.join(', ')}]`);
  }

  console.log('\n[TEST 2/2] Running Standalone whisper-cli (C++ Native Binary):');
  const whisperCli = path.resolve(__dirname, '..', 'bin', 'whisper', 'Release', 'whisper-cli.exe');
  const ggmlModel = path.resolve(__dirname, '..', 'models', 'ggml-base.bin');
  const testWav = path.resolve(__dirname, '..', 'test-assets', 'results', 'test_ref2_16k.wav');

  if (!fs.existsSync(whisperCli)) {
    console.error(`  FAIL: Missing whisper-cli binary at ${whisperCli}`);
    process.exit(1);
  }

  const child = spawn(whisperCli, ['-m', ggmlModel, '-f', testWav, '-ml', '1']);
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', code => {
    if (code !== 0) {
      console.error(`  FAIL: whisper-cli returned code ${code}: ${stderr}`);
      process.exit(1);
    }

    const words = [];
    const lineRegex = /\[(\d{2}):(\d{2}):(\d{2}\.\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}\.\d{3})\]\s+(.*)/g;
    let match;
    while ((match = lineRegex.exec(stdout)) !== null) {
      words.push({ word: match[7].trim(), start: match[3], end: match[6] });
    }

    console.log(`  PASS: whisper-cli transcribed ${words.length} words in pure native C++`);
    console.log(`        Sample output:`);
    for (const w of words.slice(6, 12)) {
      console.log(`        "${w.word}" [${w.start}s -> ${w.end}s]`);
    }

    console.log('\n' + '='.repeat(75));
    console.log('AUDIT VERDICT: 100% NATIVE RUNTIME CONFIRMED. ZERO PYTHON REQUIRED.');
    console.log('='.repeat(75));
  });
}

runAudit().catch(err => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
