import { useEffect, useRef } from 'react';
import { globalFrameCache } from '../render/FrameCache';
import { saveProjectToIndexedDB } from '../store/persistence';
import { useProjectStore } from '../store/useProjectStore';
import { timeToFrame } from '../utils/timecode';

export function usePlaybackLoop(): void {
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const directionRef = useRef<1 | -1>(1);
  const audioPlayersRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Playback requestAnimationFrame loop + Audio/Video Sound Synchronization
  useEffect(() => {
    const players = audioPlayersRef.current;

    const pauseAllAudio = () => {
      players.forEach((audio) => {
        if (!audio.paused) {
          audio.pause();
        }
      });
    };

    if (!isPlaying) {
      directionRef.current = 1;
      pauseAllAudio();
      return;
    }

    const syncAudioAtTime = (t: number) => {
      const state = useProjectStore.getState();
      const comp = state.getActiveComp();
      const anySolo = comp.layers.some((l) => l.solo);
      const activeIds = new Set<string>();

      for (const layer of comp.layers) {
        if (layer.type !== 'audio' && layer.type !== 'video') continue;
        if (!layer.audioEnabled || !layer.assetId) continue;
        if (anySolo && !layer.solo) continue;
        if (layer.type === 'video' && !layer.visible) continue;
        if (t < layer.inPoint || t > layer.outPoint || directionRef.current < 0) continue;

        const asset = state.project.assets.find((a) => a.id === layer.assetId);
        if (!asset) continue;

        activeIds.add(layer.id);
        let audio = players.get(layer.id);
        if (!audio || audio.dataset.assetId !== asset.id) {
          if (audio) audio.pause();
          audio = new Audio(asset.url);
          audio.dataset.assetId = asset.id;
          audio.preload = 'auto';
          players.set(layer.id, audio);
        }

        const localT = Math.max(0, t - layer.startTime);
        const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        const targetT = dur > 0 ? Math.min(dur - 0.01, localT % dur) : localT;

        if (Math.abs(audio.currentTime - targetT) > 0.18) {
          try {
            audio.currentTime = Math.max(0, targetT);
          } catch {
            // Ignore before metadata loads
          }
        }
        if (audio.paused) {
          void audio.play().catch(() => {});
        }
      }

      players.forEach((audio, layerId) => {
        if (!activeIds.has(layerId) && !audio.paused) {
          audio.pause();
        }
      });
    };

    syncAudioAtTime(useProjectStore.getState().currentTime);

    let rafId = 0;
    let lastTimestamp = performance.now();
    let frameCount = 0;
    let fpsAccumulator = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTimestamp) / 1000);
      lastTimestamp = now;

      frameCount += 1;
      fpsAccumulator += dt;
      if (fpsAccumulator >= 0.4) {
        const measured = Math.round(frameCount / fpsAccumulator);
        useProjectStore.getState().setMeasuredFps(Math.min(60, Math.max(1, measured)));
        frameCount = 0;
        fpsAccumulator = 0;
      }

      const state = useProjectStore.getState();
      const comp = state.getActiveComp();
      const wStart = comp.workAreaStart;
      const wEnd = Math.max(wStart + 1 / comp.fps, comp.workAreaEnd);

      let nextTime = state.currentTime + dt * directionRef.current;

      if (state.loopMode === 'loop') {
        if (nextTime >= wEnd) {
          nextTime = wStart + ((nextTime - wStart) % (wEnd - wStart));
        } else if (nextTime < wStart) {
          nextTime = wStart;
        }
      } else if (state.loopMode === 'pingpong') {
        if (nextTime >= wEnd) {
          nextTime = wEnd;
          directionRef.current = -1;
        } else if (nextTime <= wStart) {
          nextTime = wStart;
          directionRef.current = 1;
        }
      } else {
        // 'once'
        if (nextTime >= wEnd) {
          state.setCurrentTime(wEnd);
          state.setIsPlaying(false);
          pauseAllAudio();
          return;
        }
      }

      state.setCurrentTime(nextTime);
      syncAudioAtTime(nextTime);
      globalFrameCache.markFrameCached(comp.id, timeToFrame(nextTime, comp.fps));

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      pauseAllAudio();
    };
  }, [isPlaying]);

  // Auto-save to IndexedDB every 30 seconds
  useEffect(() => {
    const interval = window.setInterval(() => {
      const state = useProjectStore.getState();
      void saveProjectToIndexedDB(state.project).then(() => {
        state.setLastSavedAt(new Date().toISOString());
      });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);
}
