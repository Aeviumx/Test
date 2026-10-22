import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as crypto from 'crypto';
import { ModelDownloadProgress } from '../src/types/electron';

export interface ModelMetadata {
  id: string;
  name: string;
  fileName: string;
  expectedSha256: string;
  sizeBytes: number;
  url: string;
  license: string;
  description: string;
}

export const MODEL_REGISTRY: Record<string, ModelMetadata> = {
  rife_v4: {
    id: 'rife_v4',
    name: 'RIFE v4.6 Neural Flow Interpolation',
    fileName: 'rife_v4.onnx',
    expectedSha256: '6a31074c0f588648982b5e828aee6c27e005015a712a46ea63da48c65fa9a26b',
    sizeBytes: 21604631,
    url: 'https://huggingface.co/FuryTMP/RIFE_fp32/resolve/main/RIFE_fp32.onnx',
    license: 'CC-BY-NC 4.0 (Non-Commercial / Personal Use)',
    description: 'High-quality optical flow for 60fps slow-motion velocity edits',
  },
  isnetis: {
    id: 'isnetis',
    name: 'SkyTNT IS-Net Anime Segmentation',
    fileName: 'isnetis.onnx',
    expectedSha256: 'f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99',
    sizeBytes: 176069933,
    url: 'https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx',
    license: 'MIT',
    description: 'Dichotomous anime character segmentation and alpha matting',
  },
  anime_face_detect: {
    id: 'anime_face_detect',
    name: 'DeepGHS Anime Face Detector (YOLOv8)',
    fileName: 'anime_face_detect.onnx',
    expectedSha256: '403b5bc93b6ff789b7d183418df4a1364049bac00c24acd927604a7ff6891483',
    sizeBytes: 44583229,
    url: 'https://huggingface.co/deepghs/anime_face_detection/resolve/main/face_detect_v1.4_s/model.onnx',
    license: 'Apache-2.0',
    description: 'Real-time anime facial bounding box detection',
  },
  anime_landmarks_cfa: {
    id: 'anime_landmarks_cfa',
    name: 'CFA Anime Facial Landmarks (24 points)',
    fileName: 'anime_landmarks_cfa.onnx',
    expectedSha256: '636ce58523779772735c8238e10d81bb2cfa3b9fe0285d8bcadb40664e560d29',
    sizeBytes: 16740764,
    url: 'https://huggingface.co/kanosawa/anime_face_landmark_detection/resolve/main/anime_landmarks_cfa.onnx',
    license: 'MIT',
    description: '24 facial landmark heatmap estimation',
  },
  depth_anything_v2_small: {
    id: 'depth_anything_v2_small',
    name: 'Depth Anything V2 Small',
    fileName: 'depth_anything_v2_small.onnx',
    expectedSha256: 'afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c',
    sizeBytes: 99060839,
    url: 'https://huggingface.co/depth-anything/Depth-Anything-V2-Small/resolve/main/depth_anything_v2_vits.onnx',
    license: 'Apache-2.0',
    description: 'Monocular depth estimation foundation model',
  },
  realesrgan_anime: {
    id: 'realesrgan_anime',
    name: 'Real-ESRGAN Anime 4x Super-Resolution (6B)',
    fileName: 'RealESRGAN_x4plus_anime_6B.onnx',
    expectedSha256: '2648cab4c4343541c1aa291c6754e9e8edbe7a813fffc2a677423dd12cb6b7f7',
    sizeBytes: 17906596,
    url: 'https://huggingface.co/deepghs/imgutils-models/resolve/main/real_esrgan/RealESRGAN_x4plus_anime_6B.onnx',
    license: 'BSD-3-Clause',
    description: 'AI Super-resolution upscaler for anime illustrations and gacha arts',
  },
  modnet: {
    id: 'modnet',
    name: 'MODNet Matting',
    fileName: 'modnet.onnx',
    expectedSha256: '07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9',
    sizeBytes: 25888640,
    url: 'https://huggingface.co/gradio/Modnet/resolve/main/modnet.onnx',
    license: 'Apache-2.0',
    description: 'Photographic portrait and anime matting fallback',
  },
  ggml_base: {
    id: 'ggml_base',
    name: 'OpenAI Whisper Base (GGML)',
    fileName: 'ggml-base.bin',
    expectedSha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    sizeBytes: 147951465,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    license: 'MIT',
    description: 'Speech-to-text token transcription model for whisper.cpp',
  },
};

export class ModelManager {
  private static modelsDirCache: string | null = null;

  public static getModelsDir(): string {
    if (this.modelsDirCache) return this.modelsDirCache;
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData/Roaming');
    const dir = path.join(appData, 'Kori', 'models');
    fs.mkdirSync(dir, { recursive: true });
    this.modelsDirCache = dir;
    return dir;
  }

  public static getModelPath(modelId: string): string | null {
    const meta = MODEL_REGISTRY[modelId];
    if (!meta) return null;

    // Check AppData model location
    const appDataFile = path.join(this.getModelsDir(), meta.fileName);
    if (fs.existsSync(appDataFile)) return appDataFile;

    // Check local models directory (dev / tests)
    const localFile = path.resolve(process.cwd(), 'models', meta.fileName);
    if (fs.existsSync(localFile)) return localFile;

    return null;
  }

  public static isModelReady(modelId: string): boolean {
    const filePath = this.getModelPath(modelId);
    if (!filePath || !fs.existsSync(filePath)) return false;
    const meta = MODEL_REGISTRY[modelId];
    if (!meta) return false;
    return fs.statSync(filePath).size > 1024 * 1024;
  }

  public static computeFileSha256(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  public static verifyModelSha256(modelId: string): { valid: boolean; actualSha256: string; expectedSha256: string } {
    const meta = MODEL_REGISTRY[modelId];
    if (!meta) throw new Error(`Unknown model ID: ${modelId}`);
    const filePath = this.getModelPath(modelId);
    if (!filePath || !fs.existsSync(filePath)) {
      return { valid: false, actualSha256: '', expectedSha256: meta.expectedSha256 };
    }
    const actualSha256 = this.computeFileSha256(filePath);
    return {
      valid: actualSha256.toLowerCase() === meta.expectedSha256.toLowerCase(),
      actualSha256,
      expectedSha256: meta.expectedSha256,
    };
  }

  /**
   * Downloads model with real-time progress reporting and SHA-256 verification
   */
  public static async downloadModel(
    modelId: string,
    onProgress?: (event: ModelDownloadProgress) => void
  ): Promise<boolean> {
    const meta = MODEL_REGISTRY[modelId];
    if (!meta) throw new Error(`Unknown model ID ${modelId}`);

    const targetFile = path.join(this.getModelsDir(), meta.fileName);
    const tempFile = `${targetFile}.downloading`;

    return new Promise((resolve, reject) => {
      const startDownload = (downloadUrl: string) => {
        https.get(downloadUrl, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
            const redirectUrl = res.headers.location;
            if (redirectUrl) {
              startDownload(redirectUrl);
              return;
            }
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Failed to download ${modelId}: HTTP status ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || `${meta.sizeBytes}`, 10);
          let downloadedBytes = 0;
          const hash = crypto.createHash('sha256');
          const fileStream = fs.createWriteStream(tempFile);

          res.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            hash.update(chunk);
            fileStream.write(chunk);

            if (onProgress && totalBytes > 0) {
              onProgress({
                modelName: modelId,
                bytesDownloaded: downloadedBytes,
                totalBytes,
                percent: Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)),
                status: 'downloading',
              });
            }
          });

          res.on('end', () => {
            fileStream.end(() => {
              if (onProgress) {
                onProgress({
                  modelName: modelId,
                  bytesDownloaded: downloadedBytes,
                  totalBytes,
                  percent: 99,
                  status: 'verifying',
                });
              }

              const actualSha256 = hash.digest('hex');
              if (actualSha256.toLowerCase() !== meta.expectedSha256.toLowerCase()) {
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                const err = new Error(
                  `SHA-256 Verification Failed for ${modelId}! Expected: ${meta.expectedSha256}, Got: ${actualSha256}`
                );
                if (onProgress) {
                  onProgress({
                    modelName: modelId,
                    bytesDownloaded: downloadedBytes,
                    totalBytes,
                    percent: 0,
                    status: 'error',
                  });
                }
                reject(err);
                return;
              }

              // Atomically rename validated file to target
              if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
              fs.renameSync(tempFile, targetFile);

              if (onProgress) {
                onProgress({
                  modelName: modelId,
                  bytesDownloaded: downloadedBytes,
                  totalBytes,
                  percent: 100,
                  status: 'ready',
                });
              }
              resolve(true);
            });
          });

          res.on('error', (err) => {
            fileStream.close();
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            reject(err);
          });
        }).on('error', reject);
      };

      startDownload(meta.url);
    });
  }
}
