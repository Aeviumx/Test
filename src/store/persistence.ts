import { get, set } from 'idb-keyval';
import { MediaAsset, Project } from '../types';
import { createId } from '../utils/id';

const IDB_PROJECT_KEY = 'motionforge_autosave_project_v1';

export async function saveProjectToIndexedDB(project: Project): Promise<void> {
  try {
    await set(IDB_PROJECT_KEY, project);
  } catch (err) {
    console.warn('IndexedDB autosave failed:', err);
  }
}

export async function loadProjectFromIndexedDB(): Promise<Project | null> {
  try {
    const saved = await get<Project>(IDB_PROJECT_KEY);
    if (saved && saved.compositions && Array.isArray(saved.compositions) && saved.compositions.length > 0) {
      return saved;
    }
    return null;
  } catch (err) {
    console.warn('IndexedDB load failed:', err);
    return null;
  }
}

export function downloadProjectFile(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = project.name.endsWith('.mfproj') ? project.name : `${project.name}.mfproj`;
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reads an uploaded media file (PNG/JPG/SVG/GIF/MP4/WebM/MP3/WAV) into a MediaAsset with dimensions/duration/waveform
 */
export async function importMediaFile(file: File): Promise<MediaAsset> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const mime = file.type.toLowerCase();
  if (mime.startsWith('image/')) {
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
      img.onerror = () => resolve({ width: 800, height: 600 });
      img.src = dataUrl;
    });
    return {
      id: createId('asset'),
      name: file.name,
      type: 'image',
      mimeType: file.type,
      url: dataUrl,
      width: dims.width,
      height: dims.height,
      sizeBytes: file.size,
    };
  }

  if (mime.startsWith('video/')) {
    const meta = await new Promise<{ width: number; height: number; duration: number }>((resolve) => {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () =>
        resolve({
          width: vid.videoWidth || 1920,
          height: vid.videoHeight || 1080,
          duration: Number.isFinite(vid.duration) ? vid.duration : 5,
        });
      vid.onerror = () => resolve({ width: 1920, height: 1080, duration: 5 });
      vid.src = dataUrl;
    });
    return {
      id: createId('asset'),
      name: file.name,
      type: 'video',
      mimeType: file.type,
      url: dataUrl,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      sizeBytes: file.size,
    };
  }

  // Audio file — extract real waveform peaks using Web Audio API
  let duration = 6;
  let waveform: number[] = [];
  try {
    const arrayBuf = await file.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
    duration = decoded.duration;
    const rawData = decoded.getChannelData(0);
    const samples = 140;
    const blockSize = Math.max(1, Math.floor(rawData.length / samples));
    const peaks: number[] = [];
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize && start + j < rawData.length; j++) {
        const v = Math.abs(rawData[start + j]);
        if (v > sum) sum = v;
      }
      peaks.push(Math.min(1, sum));
    }
    waveform = peaks;
    await audioCtx.close();
  } catch {
    waveform = Array.from({ length: 120 }, (_, i) => 0.25 + 0.65 * Math.abs(Math.sin(i * 0.35)));
  }

  return {
    id: createId('asset'),
    name: file.name,
    type: 'audio',
    mimeType: file.type || 'audio/mpeg',
    url: dataUrl,
    duration,
    sizeBytes: file.size,
    waveform,
  };
}
