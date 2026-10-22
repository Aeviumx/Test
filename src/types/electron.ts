/**
 * Typed Electron IPC Definitions for Kōri Desktop Studio
 * Strictly typed interface exposed through window.koriAPI
 */

export interface MediaProbeResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  formatName: string;
  duration: number; // seconds
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
}

export interface NativeSceneCut {
  sceneIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  thumbnailPath?: string;
}

export interface ProxyProgressEvent {
  jobId: string;
  sourcePath: string;
  proxyPath: string;
  percent: number; // 0..100
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

export interface RifeInterpolationConfig {
  sourceFramesDir?: string;
  videoPath?: string;
  targetFps: number;
  multiplier: 2 | 4 | 8;
  deduplicateHeldFrames: boolean; // prune 2s and 3s anime duplicates
  heldFrameThreshold?: number; // default 0.98 similarity
  useGpu: boolean; // DirectML / CUDA
}

export interface ModelDownloadProgress {
  modelName: string;
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  status: 'downloading' | 'verifying' | 'ready' | 'error';
}

export interface ExportJobConfig {
  jobId: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  codec: 'h264_nvenc' | 'hevc_nvenc' | 'libx264' | 'prores';
  bitrateKbps: number;
  audioPath?: string;
  sourceFramesDir: string;
}

export interface ExportProgressEvent {
  jobId: string;
  currentFrame: number;
  totalFrames: number;
  percent: number;
  fps: number;
  status: 'rendering' | 'encoding' | 'done' | 'error';
  error?: string;
}

export interface ProjectSaveData {
  version: string;
  name: string;
  lastModified: number;
  appVersion: string;
  project: unknown;
  mediaPaths: Record<string, string>; // assetId -> absolute disk path
}

export interface KoriElectronAPI {
  // Window controls
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    unmaximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
  };

  // Native file system dialogs
  dialog: {
    openMediaFiles: () => Promise<string[] | null>;
    openProjectFile: () => Promise<{ filePath: string; data: ProjectSaveData } | null>;
    saveProjectFile: (data: ProjectSaveData, currentPath?: string) => Promise<string | null>;
    saveExportDialog: (defaultName: string, format: 'mp4' | 'mov') => Promise<string | null>;
    relinkMissingFile: (fileName: string) => Promise<string | null>;
  };

  // Native Media Engine (ffmpeg / ffprobe)
  media: {
    probe: (filePath: string) => Promise<MediaProbeResult>;
    generateProxy: (filePath: string, targetHeight?: number) => Promise<string>;
    detectScenes: (filePath: string, threshold?: number) => Promise<NativeSceneCut[]>;
    extractAudioPcm: (filePath: string) => Promise<{ wavPath: string; sampleRate: number; duration: number }>;
    onProxyProgress: (callback: (progress: ProxyProgressEvent) => void) => () => void;
  };

  // AI & Frame Interpolation (RIFE + Held Frames + Matting)
  ai: {
    checkModelStatus: (modelName: 'rife_v4' | 'anime_matting') => Promise<boolean>;
    downloadModel: (modelName: 'rife_v4' | 'anime_matting') => Promise<boolean>;
    onModelProgress: (callback: (progress: ModelDownloadProgress) => void) => () => void;
    interpolateFrames: (config: RifeInterpolationConfig) => Promise<{ outputVideoPath: string; totalFrames: number }>;
    segmentCharacterForeground: (imagePath: string) => Promise<{ maskPath: string }>;
  };

  // Native High-Speed Hardware Encoder
  exporter: {
    startExport: (config: ExportJobConfig) => Promise<string>;
    cancelExport: (jobId: string) => Promise<void>;
    onExportProgress: (callback: (progress: ExportProgressEvent) => void) => () => void;
    getAvailableEncoders: () => Promise<string[]>;
  };

  // Project persistence & Cache
  storage: {
    getCacheDir: () => Promise<string>;
    clearCache: () => Promise<void>;
    saveAutoRecovery: (data: ProjectSaveData) => Promise<void>;
    loadAutoRecovery: () => Promise<ProjectSaveData | null>;
    checkFileExists: (filePath: string) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    koriAPI?: KoriElectronAPI;
  }
}
