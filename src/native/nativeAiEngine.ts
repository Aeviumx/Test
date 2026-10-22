import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import * as ort from 'onnxruntime-node';

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

export interface Landmark {
  x: number;
  y: number;
}

export class NativeAiEngine {
  private isnetSession: ort.InferenceSession | null = null;
  private faceSession: ort.InferenceSession | null = null;
  private cfaSession: ort.InferenceSession | null = null;
  private depthSession: ort.InferenceSession | null = null;

  private modelsDir: string;
  private whisperBin: string;
  private ffmpegBin: string;

  constructor(baseDir = process.cwd()) {
    this.modelsDir = path.join(baseDir, 'models');
    this.whisperBin = path.join(baseDir, 'bin', 'whisper', 'Release', 'whisper-cli.exe');
    this.ffmpegBin = path.join(baseDir, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
  }

  async initModels(): Promise<void> {
    const isnetPath = path.join(this.modelsDir, 'isnetis.onnx');
    const facePath = path.join(this.modelsDir, 'anime_face_detect.onnx');
    const cfaPath = path.join(this.modelsDir, 'anime_landmarks_cfa.onnx');
    const depthPath = path.join(this.modelsDir, 'depth_anything_v2_small.onnx');

    if (fs.existsSync(isnetPath)) {
      this.isnetSession = await ort.InferenceSession.create(isnetPath);
    }
    if (fs.existsSync(facePath)) {
      this.faceSession = await ort.InferenceSession.create(facePath);
    }
    if (fs.existsSync(cfaPath)) {
      this.cfaSession = await ort.InferenceSession.create(cfaPath);
    }
    if (fs.existsSync(depthPath)) {
      this.depthSession = await ort.InferenceSession.create(depthPath);
    }
  }

  isModelReady(model: 'segmentation' | 'face' | 'landmarks' | 'depth' | 'whisper'): boolean {
    switch (model) {
      case 'segmentation': return this.isnetSession !== null;
      case 'face': return this.faceSession !== null;
      case 'landmarks': return this.cfaSession !== null;
      case 'depth': return this.depthSession !== null;
      case 'whisper': return fs.existsSync(this.whisperBin);
    }
  }

  async runWhisperCli(audioWavPath: string, modelPath?: string): Promise<Array<{ word: string; start: number; end: number }>> {
    const targetModel = modelPath || path.join(this.modelsDir, 'ggml-base.bin');
    if (!fs.existsSync(this.whisperBin)) {
      throw new Error(`whisper-cli not found at: ${this.whisperBin}`);
    }
    if (!fs.existsSync(targetModel)) {
      throw new Error(`whisper ggml model not found at: ${targetModel}`);
    }

    return new Promise((resolve, reject) => {
      const args = ['-m', targetModel, '-f', audioWavPath, '-ml', '1'];
      const child = spawn(this.whisperBin, args);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });

      child.on('close', code => {
        if (code !== 0) {
          return reject(new Error(`whisper-cli failed (${code}): ${stderr}`));
        }

        const words: Array<{ word: string; start: number; end: number }> = [];
        // Regex to parse: [00:00:01.260 --> 00:00:02.000]   conversation
        const lineRegex = /\[(\d{2}):(\d{2}):(\d{2}\.\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}\.\d{3})\]\s+(.*)/g;
        let match;
        while ((match = lineRegex.exec(stdout)) !== null) {
          const sMin = parseInt(match[2], 10);
          const sSec = parseFloat(match[3]);
          const start = sMin * 60 + sSec;

          const eMin = parseInt(match[5], 10);
          const eSec = parseFloat(match[6]);
          const end = eMin * 60 + eSec;

          const word = match[7].trim();
          if (word) {
            words.push({ word, start: Math.round(start * 1000)/1000, end: Math.round(end * 1000)/1000 });
          }
        }
        resolve(words);
      });
    });
  }
}
