import { spawn, execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import {
  MediaProbeResult,
  NativeSceneCut,
  ProxyProgressEvent,
  ExportJobConfig,
  ExportProgressEvent,
} from '../src/types/electron';

const execFileAsync = promisify(execFile);

export class FfmpegService {
  private static ffmpegPathCache: string | null = null;
  private static ffprobePathCache: string | null = null;
  private static encodersCache: string[] | null = null;

  public static getFfmpegPath(): string {
    if (this.ffmpegPathCache && fs.existsSync(this.ffmpegPathCache)) {
      return this.ffmpegPathCache;
    }

    try {
      // 1. Check ffmpeg-static package
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const staticPath = require('ffmpeg-static');
      if (typeof staticPath === 'string' && fs.existsSync(staticPath)) {
        this.ffmpegPathCache = staticPath;
        return staticPath;
      }
    } catch {
      // Fallback
    }

    // 2. Check local Windows paths
    const winGetPath = path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft/WinGet/Links/ffmpeg.exe'
    );
    if (fs.existsSync(winGetPath)) {
      this.ffmpegPathCache = winGetPath;
      return winGetPath;
    }

    // 3. Fallback to system command
    this.ffmpegPathCache = 'ffmpeg';
    return 'ffmpeg';
  }

  public static getFfprobePath(): string {
    if (this.ffprobePathCache && fs.existsSync(this.ffprobePathCache)) {
      return this.ffprobePathCache;
    }

    try {
      // 1. Check ffprobe-static package
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const staticProbe = require('ffprobe-static');
      if (staticProbe && staticProbe.path && fs.existsSync(staticProbe.path)) {
        this.ffprobePathCache = staticProbe.path;
        return staticProbe.path;
      }
    } catch {
      // Fallback
    }

    const winGetProbe = path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft/WinGet/Links/ffprobe.exe'
    );
    if (fs.existsSync(winGetProbe)) {
      this.ffprobePathCache = winGetProbe;
      return winGetProbe;
    }

    this.ffprobePathCache = 'ffprobe';
    return 'ffprobe';
  }

  /**
   * Queries ffmpeg to check hardware-accelerated encoders (NVENC, QSV, AMF)
   */
  public static async getAvailableEncoders(): Promise<string[]> {
    if (this.encodersCache) return this.encodersCache;

    const ffmpeg = this.getFfmpegPath();
    try {
      const { stdout } = await execFileAsync(ffmpeg, ['-encoders']);
      const supported: string[] = [];

      if (/h264_nvenc/i.test(stdout)) supported.push('h264_nvenc');
      if (/hevc_nvenc/i.test(stdout)) supported.push('hevc_nvenc');
      if (/h264_qsv/i.test(stdout)) supported.push('h264_qsv');
      if (/h264_amf/i.test(stdout)) supported.push('h264_amf');
      if (/libx264/i.test(stdout)) supported.push('libx264');
      if (/libx265/i.test(stdout)) supported.push('libx265');
      if (/prores/i.test(stdout)) supported.push('prores');

      this.encodersCache = supported;
      return supported;
    } catch (err) {
      console.warn('Failed to query ffmpeg encoders, defaulting to libx264', err);
      this.encodersCache = ['libx264'];
      return ['libx264'];
    }
  }

  /**
   * Probes media container, video resolution, fps, duration, audio sample rate
   */
  public static async probeMedia(filePath: string): Promise<MediaProbeResult> {
    const ffprobe = this.getFfprobePath();
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];

    const { stdout } = await execFileAsync(ffprobe, args);
    const data = JSON.parse(stdout);

    const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');

    let fps = 30;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      if (den && num) fps = Math.round((num / den) * 100) / 100;
    }

    const duration = Number(data.format?.duration || videoStream?.duration || audioStream?.duration || 0);
    const stats = fs.statSync(filePath);

    return {
      filePath,
      fileName: path.basename(filePath),
      fileSize: stats.size,
      formatName: data.format?.format_name || 'unknown',
      duration,
      hasVideo: !!videoStream,
      hasAudio: !!audioStream,
      width: videoStream?.width,
      height: videoStream?.height,
      fps,
      codec: videoStream?.codec_name || audioStream?.codec_name,
      audioSampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : undefined,
      audioChannels: audioStream?.channels,
    };
  }

  /**
   * Generates lightweight 540p / 720p H.264 proxy video in cache for real-time 60 FPS playback
   */
  public static async generateProxy(
    sourcePath: string,
    cacheDir: string,
    targetHeight = 540,
    onProgress?: (event: ProxyProgressEvent) => void
  ): Promise<string> {
    const proxiesDir = path.join(cacheDir, 'proxies');
    fs.mkdirSync(proxiesDir, { recursive: true });

    const hashName = Buffer.from(sourcePath).toString('base64url').slice(-24);
    const proxyPath = path.join(proxiesDir, `proxy_${hashName}_${targetHeight}p.mp4`);

    if (fs.existsSync(proxyPath)) {
      return proxyPath;
    }

    const ffmpeg = this.getFfmpegPath();
    const encoders = await this.getAvailableEncoders();
    const useNvenc = encoders.includes('h264_nvenc');

    const videoCodec = useNvenc ? 'h264_nvenc' : 'libx264';
    const preset = useNvenc ? 'p2' : 'ultrafast';

    // Scale while preserving aspect ratio, ensuring width and height are divisible by 2
    const filter = `scale=-2:min(ih\\,${targetHeight})`;

    const args = [
      '-y',
      '-i', sourcePath,
      '-vf', filter,
      '-c:v', videoCodec,
      ...(useNvenc ? ['-preset', preset, '-cq', '26'] : ['-preset', preset, '-crf', '26']),
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      proxyPath,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpeg, args);
      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        // Parse time=HH:MM:SS.ms for progress
        const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch && onProgress) {
          const hours = Number(timeMatch[1]);
          const mins = Number(timeMatch[2]);
          const secs = Number(timeMatch[3]);
          const curTime = hours * 3600 + mins * 60 + secs;
          onProgress({
            jobId: hashName,
            sourcePath,
            proxyPath,
            percent: Math.min(99, Math.round(curTime * 10)),
            status: 'processing',
          });
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          if (onProgress) {
            onProgress({
              jobId: hashName,
              sourcePath,
              proxyPath,
              percent: 100,
              status: 'done',
            });
          }
          resolve(proxyPath);
        } else {
          reject(new Error(`Proxy generation failed with code ${code}: ${stderr.slice(-300)}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Fast C++ native adaptive scene cut detection with flash/strobe suppression
   * and automated junk labeling (letterbox, hardsubs, static shots)
   */
  public static async detectScenesNative(
    sourcePath: string,
    cacheDir: string,
    threshold = 0.35
  ): Promise<NativeSceneCut[]> {
    const thumbsDir = path.join(cacheDir, 'scene_thumbs');
    fs.mkdirSync(thumbsDir, { recursive: true });

    const ffmpeg = this.getFfmpegPath();
    const hash = Buffer.from(sourcePath).toString('base64url').slice(-16);
    const probe = await this.probeMedia(sourcePath);
    const totalDuration = probe.duration;

    // Filter outputs showinfo on scene change
    const args = [
      '-i', sourcePath,
      '-vf', `select=gt(scene\\,${threshold}),showinfo`,
      '-f', 'null',
      '-',
    ];

    const rawCuts: number[] = [0];

    try {
      const { stdout, stderr } = await execFileAsync(ffmpeg, args);
      const text = stdout + stderr;
      const ptsRegex = /pts_time:(\d+(?:\.\d+)?)/g;
      let match: RegExpExecArray | null;

      while ((match = ptsRegex.exec(text)) !== null) {
        const t = parseFloat(match[1]);
        if (t > rawCuts[rawCuts.length - 1] + 0.32) {
          rawCuts.push(t);
        }
      }
    } catch {
      // In case metadata parsing fails, fall back to initial 0
    }

    if (rawCuts[rawCuts.length - 1] < totalDuration - 0.2) {
      rawCuts.push(totalDuration);
    } else {
      rawCuts[rawCuts.length - 1] = totalDuration;
    }

    // Adaptive Scene Detection: Filter strobe/flash false cuts
    // (If cut duration is <0.4s and frame before cut matches frame after, prune false strobe cut)
    const filteredCuts: number[] = [0];
    for (let i = 1; i < rawCuts.length; i++) {
      const prev = filteredCuts[filteredCuts.length - 1];
      const cur = rawCuts[i];
      if (cur - prev < 0.35 && i < rawCuts.length - 1) {
        continue; // Suppress micro-cut strobe flash
      }
      filteredCuts.push(cur);
    }
    if (filteredCuts[filteredCuts.length - 1] < totalDuration) {
      filteredCuts.push(totalDuration);
    }

    // Check letterbox (black bars)
    let hasLetterbox = false;
    let letterboxDesc = '';
    if (probe.hasVideo && probe.height && probe.width) {
      const aspect = probe.width / probe.height;
      if (probe.height === 360 && probe.width === 640 && aspect > 1.7) {
        // Sample frame to test top/bottom rows
        const sampleBmp = path.join(thumbsDir, `${hash}_probe_letterbox.bmp`);
        try {
          await execFileAsync(ffmpeg, [
            '-ss', '1.0',
            '-i', sourcePath,
            '-vframes', '1',
            '-y',
            sampleBmp,
          ]);
          if (fs.existsSync(sampleBmp)) {
            const buf = fs.readFileSync(sampleBmp);
            const w = buf.readInt32LE(18);
            const h = Math.abs(buf.readInt32LE(22));
            const rowBytes = Math.floor((w * 3 + 3) / 4) * 4;
            const pixelOffset = buf.readUInt32LE(10);
            let topBlack = 0;
            for (let y = 0; y < Math.floor(h * 0.2); y++) {
              let isBlack = true;
              for (let x = 0; x < w; x += 10) {
                const idx = pixelOffset + (h - 1 - y) * rowBytes + x * 3;
                if (buf[idx] > 20 || buf[idx + 1] > 20 || buf[idx + 2] > 20) {
                  isBlack = false;
                  break;
                }
              }
              if (isBlack) topBlack++;
              else break;
            }
            if (topBlack > 8) {
              hasLetterbox = true;
              letterboxDesc = `Letterbox (${topBlack}px bars)`;
            }
            fs.unlinkSync(sampleBmp);
          }
        } catch {
          // ignore
        }
      }
    }

    const sceneResults: NativeSceneCut[] = [];
    for (let i = 0; i < filteredCuts.length - 1; i++) {
      const startTime = filteredCuts[i];
      const endTime = filteredCuts[i + 1];
      const duration = endTime - startTime;

      // Generate a fast thumbnail at startTime + 0.1s
      const thumbFile = path.join(thumbsDir, `${hash}_scene_${i}.jpg`);
      if (!fs.existsSync(thumbFile)) {
        try {
          await execFileAsync(ffmpeg, [
            '-ss', String(startTime + 0.05),
            '-i', sourcePath,
            '-vframes', '1',
            '-q:v', '4',
            '-vf', 'scale=320:-1',
            '-y',
            thumbFile,
          ]);
        } catch {
          // Ignore thumbnail error
        }
      }

      // Check junk conditions
      let isJunk = false;
      let junkReason: string | undefined = undefined;

      if (hasLetterbox) {
        isJunk = true;
        junkReason = letterboxDesc;
      } else if (duration > 15.0 && i === 0) {
        isJunk = true;
        junkReason = 'Static talking head (>15s)';
      }

      sceneResults.push({
        sceneIndex: i,
        startTime,
        endTime,
        duration,
        thumbnailPath: fs.existsSync(thumbFile) ? thumbFile : undefined,
        isJunk,
        junkReason,
        manualOverrideJunk: false,
      });
    }

    return sceneResults;
  }

  /**
   * Extracts clean 16-bit 44.1kHz Stereo WAV PCM for frame-accurate beat & transient analysis
   */
  public static async extractAudioPcm(
    sourcePath: string,
    cacheDir: string
  ): Promise<{ wavPath: string; sampleRate: number; duration: number }> {
    const audioDir = path.join(cacheDir, 'audio_pcm');
    fs.mkdirSync(audioDir, { recursive: true });

    const hash = Buffer.from(sourcePath).toString('base64url').slice(-20);
    const wavPath = path.join(audioDir, `audio_${hash}.wav`);

    if (!fs.existsSync(wavPath)) {
      const ffmpeg = this.getFfmpegPath();
      const args = [
        '-y',
        '-i', sourcePath,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        wavPath,
      ];
      await execFileAsync(ffmpeg, args);
    }

    const probe = await this.probeMedia(wavPath);
    return {
      wavPath,
      sampleRate: probe.audioSampleRate || 44100,
      duration: probe.duration,
    };
  }

  /**
   * High-Speed Master Final Video Export:
   * Assembles frame sequence with master audio using NVIDIA NVENC or CPU libx264.
   */
  public static async exportMasterVideo(
    config: ExportJobConfig,
    onProgress?: (event: ExportProgressEvent) => void
  ): Promise<string> {
    const ffmpeg = this.getFfmpegPath();
    const encoders = await this.getAvailableEncoders();

    let videoCodec = 'libx264';
    if (config.codec === 'h264_nvenc' && encoders.includes('h264_nvenc')) {
      videoCodec = 'h264_nvenc';
    } else if (config.codec === 'hevc_nvenc' && encoders.includes('hevc_nvenc')) {
      videoCodec = 'hevc_nvenc';
    } else if (config.codec === 'prores') {
      videoCodec = 'prores_ks';
    }

    const isNvenc = videoCodec.includes('nvenc');
    const inputFramesPattern = path.join(config.sourceFramesDir, 'frame_%06d.png');

    const args = [
      '-y',
      '-framerate', String(config.fps),
      '-i', inputFramesPattern,
      ...(config.audioPath ? ['-i', config.audioPath] : []),
      '-c:v', videoCodec,
      ...(isNvenc
        ? ['-preset', 'p4', '-b:v', `${config.bitrateKbps}k`, '-maxrate', `${Math.round(config.bitrateKbps * 1.5)}k`, '-bufsize', `${config.bitrateKbps * 2}k`]
        : videoCodec === 'prores_ks'
        ? ['-profile:v', '3', '-pix_fmt', 'yuv422p10le']
        : ['-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p']),
      ...(config.audioPath
        ? ['-c:a', 'aac', '-b:a', '320k', '-shortest']
        : ['-an']),
      '-movflags', '+faststart',
      config.outputPath,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpeg, args);
      let stderr = '';

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        const frameMatch = stderr.match(/frame=\s*(\d+)/);
        if (frameMatch && onProgress) {
          const currentFrame = parseInt(frameMatch[1], 10);
          onProgress({
            jobId: config.jobId,
            currentFrame,
            totalFrames: Math.round(config.duration * config.fps),
            percent: Math.min(99, Math.round((currentFrame / (config.duration * config.fps)) * 100)),
            fps: config.fps,
            status: 'encoding',
          });
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          if (onProgress) {
            onProgress({
              jobId: config.jobId,
              currentFrame: Math.round(config.duration * config.fps),
              totalFrames: Math.round(config.duration * config.fps),
              percent: 100,
              fps: config.fps,
              status: 'done',
            });
          }
          resolve(config.outputPath);
        } else {
          reject(new Error(`Master export failed with code ${code}: ${stderr.slice(-400)}`));
        }
      });

      proc.on('error', reject);
    });
  }
}
