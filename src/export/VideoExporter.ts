import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { Composition, Project } from '../types';
import { WebGLCompositionRenderer } from '../render/WebGLRenderer';
import { encodeAnimatedGif } from './gifEncoder';
import { buildZipArchive, ZipEntryInput } from './zipBuilder';

export type ExportFormat = 'mp4' | 'webm' | 'png-seq' | 'gif';

export interface ExportOptions {
  format: ExportFormat;
  scale: 1 | 0.5 | 0.25;
  fps: number;
  bitrateMbps: number;
  range: 'workArea' | 'full';
  onProgress: (info: {
    progress: number;
    currentFrame: number;
    totalFrames: number;
    previewDataUrl?: string;
    statusText: string;
  }) => void;
  signal: AbortSignal;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function canvasToUint8Png(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode PNG blob'));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
    }, 'image/png');
  });
}

export async function exportComposition(
  comp: Composition,
  project: Project,
  options: ExportOptions
): Promise<{ blob: Blob; filename: string }> {
  const { format, scale, fps, bitrateMbps, range, onProgress, signal } = options;

  const startTime = range === 'workArea' ? comp.workAreaStart : 0;
  const endTime = range === 'workArea' ? comp.workAreaEnd : comp.duration;
  const duration = Math.max(1 / fps, endTime - startTime);
  const totalFrames = Math.max(1, Math.round(duration * fps));

  // Ensure even dimensions for H.264 / video codecs
  const rawW = Math.round(comp.width * scale);
  const rawH = Math.round(comp.height * scale);
  const exportWidth = Math.max(16, rawW % 2 === 0 ? rawW : rawW + 1);
  const exportHeight = Math.max(16, rawH % 2 === 0 ? rawH : rawH + 1);
  const effectiveScale = exportWidth / comp.width;

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = exportWidth;
  offscreenCanvas.height = exportHeight;
  const renderer = new WebGLCompositionRenderer(offscreenCanvas);

  const safeBaseName = comp.name.replace(/[^a-zA-Z0-9_-]/g, '_');

  // 1. MP4 via WebCodecs VideoEncoder + mp4-muxer
  if (format === 'mp4' && typeof window !== 'undefined' && 'VideoEncoder' in window) {
    try {
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: 'avc',
          width: exportWidth,
          height: exportHeight,
        },
        fastStart: 'in-memory',
      });

      let encoderError: Error | null = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta);
        },
        error: (e) => {
          encoderError = e instanceof Error ? e : new Error(String(e));
        },
      });

      const codecCandidates = ['avc1.640028', 'avc1.4d002a', 'avc1.42001f'];
      let chosenCodec = codecCandidates[0];
      for (const candidate of codecCandidates) {
        const support = await VideoEncoder.isConfigSupported({
          codec: candidate,
          width: exportWidth,
          height: exportHeight,
          bitrate: Math.round(bitrateMbps * 1_000_000),
          framerate: fps,
        });
        if (support.supported) {
          chosenCodec = candidate;
          break;
        }
      }

      encoder.configure({
        codec: chosenCodec,
        width: exportWidth,
        height: exportHeight,
        bitrate: Math.round(bitrateMbps * 1_000_000),
        framerate: fps,
      });

      for (let f = 0; f < totalFrames; f++) {
        if (signal.aborted) {
          encoder.close();
          throw new Error('Export cancelled');
        }
        if (encoderError) throw encoderError;

        const t = startTime + f / fps;
        renderer.renderComposition(comp, t, project, effectiveScale);

        const timestampUs = Math.round((f / fps) * 1_000_000);
        const durationUs = Math.round((1 / fps) * 1_000_000);
        const videoFrame = new VideoFrame(offscreenCanvas, {
          timestamp: timestampUs,
          duration: durationUs,
        });
        encoder.encode(videoFrame, { keyFrame: f % Math.round(fps * 2) === 0 });
        videoFrame.close();

        if (f % 4 === 0 || f === totalFrames - 1) {
          onProgress({
            progress: ((f + 1) / totalFrames) * 100,
            currentFrame: f + 1,
            totalFrames,
            previewDataUrl: offscreenCanvas.toDataURL('image/jpeg', 0.55),
            statusText: `Encoding H.264 MP4 frame ${f + 1} / ${totalFrames}`,
          });
          await yieldToMain();
        }
      }

      await encoder.flush();
      encoder.close();
      muxer.finalize();

      return {
        blob: new Blob([target.buffer], { type: 'video/mp4' }),
        filename: `${safeBaseName}_${exportWidth}x${exportHeight}.mp4`,
      };
    } catch (err) {
      if (signal.aborted) throw err;
      console.warn('WebCodecs MP4 failed, falling back to MediaRecorder WebM:', err);
    }
  }

  // 2. WebM (or MP4 fallback) via MediaRecorder
  if (format === 'webm' || format === 'mp4') {
    const stream = offscreenCanvas.captureStream(0);
    const mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: Math.round(bitrateMbps * 1_000_000),
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const stopPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: 'video/webm' }));
      };
    });

    recorder.start();
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack & {
      requestFrame?: () => void;
    };

    for (let f = 0; f < totalFrames; f++) {
      if (signal.aborted) {
        recorder.stop();
        throw new Error('Export cancelled');
      }
      const t = startTime + f / fps;
      renderer.renderComposition(comp, t, project, effectiveScale);
      if (typeof track.requestFrame === 'function') {
        track.requestFrame();
      }
      onProgress({
        progress: ((f + 1) / totalFrames) * 100,
        currentFrame: f + 1,
        totalFrames,
        previewDataUrl: f % 5 === 0 ? offscreenCanvas.toDataURL('image/jpeg', 0.5) : undefined,
        statusText: `Recording WebM frame ${f + 1} / ${totalFrames}`,
      });
      await new Promise((r) => setTimeout(r, Math.max(8, Math.round(1000 / fps / 2))));
    }

    recorder.stop();
    const blob = await stopPromise;
    return {
      blob,
      filename: `${safeBaseName}_${exportWidth}x${exportHeight}.webm`,
    };
  }

  // 3. PNG Sequence (ZIP)
  if (format === 'png-seq') {
    const entries: ZipEntryInput[] = [];
    for (let f = 0; f < totalFrames; f++) {
      if (signal.aborted) throw new Error('Export cancelled');
      const t = startTime + f / fps;
      renderer.renderComposition(comp, t, project, effectiveScale);
      const pngData = await canvasToUint8Png(offscreenCanvas);
      const frameNum = String(f).padStart(5, '0');
      entries.push({
        name: `${safeBaseName}_${frameNum}.png`,
        data: pngData,
      });

      if (f % 3 === 0 || f === totalFrames - 1) {
        onProgress({
          progress: ((f + 1) / totalFrames) * 100,
          currentFrame: f + 1,
          totalFrames,
          previewDataUrl: offscreenCanvas.toDataURL('image/jpeg', 0.55),
          statusText: `Rendering PNG sequence ${f + 1} / ${totalFrames}`,
        });
        await yieldToMain();
      }
    }

    const zipBlob = buildZipArchive(entries);
    return {
      blob: zipBlob,
      filename: `${safeBaseName}_PNG_Sequence.zip`,
    };
  }

  // 4. Animated GIF
  const readCanvas = document.createElement('canvas');
  readCanvas.width = exportWidth;
  readCanvas.height = exportHeight;
  const readCtx = readCanvas.getContext('2d', { willReadFrequently: true });
  if (!readCtx) throw new Error('2D context unavailable for GIF');

  const gifFrames: ImageData[] = [];
  for (let f = 0; f < totalFrames; f++) {
    if (signal.aborted) throw new Error('Export cancelled');
    const t = startTime + f / fps;
    renderer.renderComposition(comp, t, project, effectiveScale);
    readCtx.clearRect(0, 0, exportWidth, exportHeight);
    readCtx.drawImage(offscreenCanvas, 0, 0);
    gifFrames.push(readCtx.getImageData(0, 0, exportWidth, exportHeight));

    if (f % 3 === 0 || f === totalFrames - 1) {
      onProgress({
        progress: ((f + 1) / totalFrames) * 90,
        currentFrame: f + 1,
        totalFrames,
        previewDataUrl: offscreenCanvas.toDataURL('image/jpeg', 0.55),
        statusText: `Capturing GIF frame ${f + 1} / ${totalFrames}`,
      });
      await yieldToMain();
    }
  }

  onProgress({
    progress: 96,
    currentFrame: totalFrames,
    totalFrames,
    statusText: 'Compressing LZW GIF89a palette...',
  });
  await yieldToMain();

  const gifBlob = encodeAnimatedGif(gifFrames, exportWidth, exportHeight, fps);
  return {
    blob: gifBlob,
    filename: `${safeBaseName}_${exportWidth}x${exportHeight}.gif`,
  };
}
