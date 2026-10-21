import { SceneClip } from '../types';
import { createId } from './id';

export interface SceneDetectionOptions {
  /** Sensitivity threshold 0.15 (very sensitive) to 0.60 (only drastic cuts). Default 0.32 */
  threshold?: number;
  /** Frames to sample per second. Default 5 (sufficient for detecting scene transitions) */
  sampleFps?: number;
  /** Maximum number of scenes to prevent runaway splits. Default 100 */
  maxScenes?: number;
  /** Minimum scene duration in seconds to avoid micro-cuts. Default 0.4s */
  minSceneDuration?: number;
  /** Progress callback (0..100) */
  onProgress?: (percent: number, currentScenes: number) => void;
}

/**
 * Extracts a normalized 48-bin RGB histogram (16 bins each) from canvas image data.
 */
function computeRgbHistogram(data: Uint8ClampedArray): Float32Array {
  const hist = new Float32Array(48); // 16 R + 16 G + 16 B
  const totalPixels = data.length / 4;
  if (totalPixels === 0) return hist;

  for (let i = 0; i < data.length; i += 4) {
    const rBin = data[i] >> 4; // 0..15
    const gBin = data[i + 1] >> 4;
    const bBin = data[i + 2] >> 4;
    hist[rBin]++;
    hist[16 + gBin]++;
    hist[32 + bBin]++;
  }

  const invTotal = 1 / totalPixels;
  for (let i = 0; i < 48; i++) {
    hist[i] *= invTotal;
  }
  return hist;
}

/**
 * Computes Manhattan distance between two normalized histograms (0..2).
 */
function histogramDifference(a: Float32Array, b: Float32Array): number {
  let diff = 0;
  for (let i = 0; i < 48; i++) {
    diff += Math.abs(a[i] - b[i]);
  }
  return diff / 3; // normalize back to ~0..1 range
}

/**
 * Automatically detects scene cuts in a video asset using client-side frame difference analysis.
 */
export async function detectScenesInVideo(
  assetId: string,
  videoUrl: string,
  options: SceneDetectionOptions = {}
): Promise<SceneClip[]> {
  const threshold = options.threshold ?? 0.32;
  const sampleFps = options.sampleFps ?? 5;
  const maxScenes = options.maxScenes ?? 120;
  const minSceneDuration = options.minSceneDuration ?? 0.4;
  const onProgress = options.onProgress;

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const cleanUp = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    video.onerror = () => {
      cleanUp();
      resolve([]);
    };

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      if (!duration || duration <= 0 || !isFinite(duration)) {
        cleanUp();
        resolve([]);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        cleanUp();
        resolve([]);
        return;
      }

      const step = 1 / sampleFps;
      const cutTimestamps: number[] = [0];
      let prevHist: Float32Array | null = null;
      let lastCutTime = 0;

      // Helper to seek video and wait for frame
      const seekTo = (time: number): Promise<void> =>
        new Promise((res) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            res();
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = Math.min(time, duration);
        });

      // Sample frames along the timeline
      const totalSteps = Math.floor(duration / step);
      let stepIdx = 0;

      for (let t = 0; t < duration; t += step) {
        stepIdx++;
        await seekTo(t);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const curHist = computeRgbHistogram(imgData.data);

        if (prevHist) {
          const diff = histogramDifference(curHist, prevHist);
          if (diff >= threshold && t - lastCutTime >= minSceneDuration) {
            cutTimestamps.push(Math.round(t * 100) / 100);
            lastCutTime = t;
            if (cutTimestamps.length >= maxScenes) break;
          }
        }
        prevHist = curHist;

        if (stepIdx % 4 === 0 && onProgress) {
          const pct = Math.min(95, Math.round((stepIdx / totalSteps) * 100));
          onProgress(pct, cutTimestamps.length);
        }
      }

      if (cutTimestamps[cutTimestamps.length - 1] < duration - minSceneDuration) {
        cutTimestamps.push(Math.round(duration * 100) / 100);
      } else {
        cutTimestamps[cutTimestamps.length - 1] = Math.round(duration * 100) / 100;
      }

      // Generate scene clips with thumbnail previews
      const scenes: SceneClip[] = [];
      const numScenes = cutTimestamps.length - 1;

      for (let i = 0; i < numScenes; i++) {
        const start = cutTimestamps[i];
        const end = cutTimestamps[i + 1];
        const dur = Math.max(0.05, Math.round((end - start) * 100) / 100);

        // Capture thumbnail around 10-20% into the scene
        const thumbTime = Math.min(start + Math.min(0.2, dur * 0.2), end - 0.02);
        await seekTo(thumbTime);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumb = canvas.toDataURL('image/jpeg', 0.65);

        scenes.push({
          id: createId('scn'),
          assetId,
          sceneIndex: i + 1,
          name: `Scene ${String(i + 1).padStart(2, '0')}`,
          inPoint: start,
          outPoint: end,
          duration: dur,
          thumbnail: thumb,
        });

        if (onProgress) {
          onProgress(95 + Math.round(((i + 1) / numScenes) * 5), scenes.length);
        }
      }

      cleanUp();
      resolve(scenes);
    };
  });
}
