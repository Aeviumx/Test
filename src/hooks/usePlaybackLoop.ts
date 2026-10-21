import { useEffect, useRef } from 'react';
import { globalFrameCache } from '../render/FrameCache';
import { saveProjectToIndexedDB } from '../store/persistence';
import { useProjectStore } from '../store/useProjectStore';
import { timeToFrame } from '../utils/timecode';

export function usePlaybackLoop(): void {
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const directionRef = useRef<1 | -1>(1);

  // Playback requestAnimationFrame loop
  useEffect(() => {
    if (!isPlaying) {
      directionRef.current = 1;
      return;
    }

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
        useProjectStore.getState().setMeasuredFps(Math.min(120, Math.max(1, measured)));
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
          return;
        }
      }

      state.setCurrentTime(nextTime);
      globalFrameCache.markFrameCached(comp.id, timeToFrame(nextTime, comp.fps));

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
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
