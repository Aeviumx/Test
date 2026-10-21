import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock,
  Film,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { formatTimecode } from '../../utils/timecode';

export const SourceMonitor: React.FC = () => {
  const assetId = useProjectStore((s) => s.sourceMonitorAssetId);
  const asset = useProjectStore((s) =>
    s.project.assets.find((a) => a.id === assetId)
  );
  const sourceInTime = useProjectStore((s) => s.sourceInTime);
  const sourceOutTime = useProjectStore((s) => s.sourceOutTime);
  const sourceCurrentTime = useProjectStore((s) => s.sourceCurrentTime);
  const isDetectingScenes = useProjectStore((s) => s.isDetectingScenes);
  const sceneDetectionProgress = useProjectStore((s) => s.sceneDetectionProgress);

  const setViewportMode = useProjectStore((s) => s.setViewportMode);
  const setSourceInPoint = useProjectStore((s) => s.setSourceInPoint);
  const setSourceOutPoint = useProjectStore((s) => s.setSourceOutPoint);
  const clearSourceInOut = useProjectStore((s) => s.clearSourceInOut);
  const setSourceCurrentTime = useProjectStore((s) => s.setSourceCurrentTime);
  const insertSourceClipToTimeline = useProjectStore((s) => s.insertSourceClipToTimeline);
  const detectScenesForAsset = useProjectStore((s) => s.detectScenesForAsset);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubTrackRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(asset?.duration ?? 5);

  useEffect(() => {
    if (asset?.duration) {
      setDuration(asset.duration);
    }
  }, [asset]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (Math.abs(v.currentTime - sourceCurrentTime) > 0.08) {
      v.currentTime = sourceCurrentTime;
    }
  }, [sourceCurrentTime]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setSourceCurrentTime(v.currentTime);
    if (sourceOutTime !== null && v.currentTime >= sourceOutTime) {
      v.pause();
      setIsPlaying(false);
      v.currentTime = sourceInTime ?? 0;
      setSourceCurrentTime(sourceInTime ?? 0);
    }
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = scrubTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    setSourceCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  if (!asset) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] bg-[var(--bg-base)] select-none">
        <Film className="w-10 h-10 mb-2 text-[var(--steel)] opacity-60" />
        <span className="text-sm font-medium">No media selected in Source Monitor</span>
        <span className="text-xs text-[var(--text-secondary)] mt-1">
          Double-click any video or audio in Project Panel to preview
        </span>
        <button
          type="button"
          onClick={() => setViewportMode('program')}
          className="mt-4 px-3 py-1.5 rounded bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-xs text-[var(--accent)] border border-[var(--border)] transition-colors"
        >
          Return to Program Monitor
        </button>
      </div>
    );
  }

  const effectiveIn = sourceInTime !== null ? sourceInTime : 0;
  const effectiveOut = sourceOutTime !== null ? sourceOutTime : duration;
  const inPercent = duration > 0 ? (effectiveIn / duration) * 100 : 0;
  const outPercent = duration > 0 ? (effectiveOut / duration) * 100 : 100;
  const playheadPercent = duration > 0 ? (sourceCurrentTime / duration) * 100 : 0;
  const clipDur = Math.max(0, effectiveOut - effectiveIn);

  return (
    <div className="h-full flex flex-col bg-[var(--bg-base)] select-none relative">
      {/* Top bar: Asset metadata & switch button */}
      <div className="h-[28px] px-3 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Film className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate max-w-[280px]">
            {asset.name}
          </span>
          {asset.width && asset.height && (
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              {asset.width}×{asset.height}
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--denim)]/40 text-[var(--steel-light)] font-mono">
            Dur: {formatTimecode(duration, 30)}
          </span>
          {sourceInTime !== null && sourceOutTime !== null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-deep)]/30 text-[var(--accent)] border border-[var(--accent)]/30 font-mono">
              Marked: {formatTimecode(clipDur, 30)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {asset.type === 'video' && (
            <button
              type="button"
              disabled={isDetectingScenes}
              onClick={() => void detectScenesForAsset(asset.id)}
              title="Automatically detect cuts and split into scenes"
              className="h-[20px] px-2 rounded text-[10px] font-medium flex items-center gap-1 bg-[var(--bg-hover)] text-[var(--accent)] hover:bg-[var(--accent-deep)]/20 border border-[var(--border)] transition-colors disabled:opacity-50"
            >
              {isDetectingScenes ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" />
                  <span>{sceneDetectionProgress}%</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>
                    {asset.scenes && asset.scenes.length > 0
                      ? `${asset.scenes.length} Scenes`
                      : 'Auto Scene Detect'}
                  </span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setViewportMode('program')}
            title="Switch back to Program Monitor (Composition)"
            className="h-[20px] px-2 rounded text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            Program View
          </button>
        </div>
      </div>

      {/* Main Video Preview Area */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 relative overflow-hidden bg-black/40">
        {asset.type === 'video' && (
          <video
            ref={videoRef}
            src={asset.url}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              if (videoRef.current?.duration) {
                setDuration(videoRef.current.duration);
              }
            }}
            onClick={togglePlay}
            className="max-h-full max-w-full object-contain rounded shadow-lg border border-[var(--border)] cursor-pointer"
          />
        )}
        {asset.type === 'image' && (
          <img
            src={asset.url}
            alt={asset.name}
            className="max-h-full max-w-full object-contain rounded shadow-lg border border-[var(--border)]"
          />
        )}
        {asset.type === 'audio' && (
          <div className="flex flex-col items-center gap-3">
            <Volume2 className="w-16 h-16 text-[var(--blush)] animate-pulse" />
            <span className="text-sm font-medium text-[var(--text-primary)]">{asset.name}</span>
            <audio
              ref={videoRef as unknown as React.RefObject<HTMLAudioElement>}
              src={asset.url}
              onTimeUpdate={handleTimeUpdate}
              controls
              className="mt-2"
            />
          </div>
        )}
      </div>

      {/* Scrubber & In/Out Range */}
      <div className="px-3 pt-2 bg-[var(--bg-panel)] border-t border-[var(--border)] shrink-0">
        <div
          ref={scrubTrackRef}
          onClick={handleScrub}
          className="h-5 w-full bg-[var(--bg-base)] rounded border border-[var(--border)] relative cursor-pointer group"
        >
          {/* Highlighted In-Out selected range */}
          <div
            className="absolute top-0 bottom-0 bg-[var(--accent-deep)]/40 border-l-2 border-r-2 border-[var(--accent)] pointer-events-none"
            style={{
              left: `${Math.min(inPercent, outPercent)}%`,
              width: `${Math.abs(outPercent - inPercent)}%`,
            }}
          />

          {/* Scene cut tick marks (if detected) */}
          {asset.scenes?.map((scene) => {
            const cutPct = duration > 0 ? (scene.inPoint / duration) * 100 : 0;
            return (
              <div
                key={scene.id}
                title={`${scene.name} (${formatTimecode(scene.inPoint, 30)})`}
                className="absolute top-0 bottom-0 w-[1px] bg-[var(--accent)]/70 pointer-events-none"
                style={{ left: `${cutPct}%` }}
              />
            );
          })}

          {/* Current Playhead */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)] pointer-events-none -ml-[1px]"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="w-2.5 h-2.5 bg-[var(--accent)] -ml-[4px] -top-1 absolute rotate-45 rounded-sm" />
          </div>
        </div>
      </div>

      {/* Source Monitor Transport Controls */}
      <div className="h-[38px] px-3 bg-[var(--bg-panel)] flex items-center justify-between shrink-0">
        {/* Left: Timecode and frame step */}
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <Clock className="w-3.5 h-3.5 text-[var(--steel)]" />
          <span className="font-semibold text-[var(--accent)]">
            {formatTimecode(sourceCurrentTime, 30)}
          </span>
          <span className="text-[var(--text-muted)]">/</span>
          <span className="text-[var(--text-secondary)]">{formatTimecode(duration, 30)}</span>
        </div>

        {/* Center: Play, In, Out transport */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSourceInPoint()}
            title="Mark In Point (I)"
            className="h-[24px] px-2 rounded text-[11px] font-semibold bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] hover:text-[var(--accent)] border border-[var(--border)] transition-colors"
          >
            Mark In [I]
          </button>
          <button
            type="button"
            onClick={() => setSourceOutPoint()}
            title="Mark Out Point (O)"
            className="h-[24px] px-2 rounded text-[11px] font-semibold bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] hover:text-[var(--accent)] border border-[var(--border)] transition-colors"
          >
            Mark Out [O]
          </button>
          {(sourceInTime !== null || sourceOutTime !== null) && (
            <button
              type="button"
              onClick={clearSourceInOut}
              title="Clear In/Out Points (Alt+X)"
              className="h-[24px] px-1.5 rounded text-[10px] text-[var(--steel)] hover:text-[var(--danger)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              Clear
            </button>
          )}

          <div className="w-[1px] h-3.5 bg-[var(--border)] mx-1" />

          <button
            type="button"
            onClick={() => {
              const prev = Math.max(0, sourceCurrentTime - 1 / 30);
              setSourceCurrentTime(prev);
              if (videoRef.current) videoRef.current.currentTime = prev;
            }}
            title="Step Back 1 Frame (,)"
            className="w-[24px] h-[24px] flex items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--steel-light)] transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            title="Play / Pause (Space)"
            className="w-[28px] h-[24px] flex items-center justify-center rounded bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--accent)] border border-[var(--border)] transition-colors"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = Math.min(duration, sourceCurrentTime + 1 / 30);
              setSourceCurrentTime(next);
              if (videoRef.current) videoRef.current.currentTime = next;
            }}
            title="Step Forward 1 Frame (.)"
            className="w-[24px] h-[24px] flex items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--steel-light)] transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Insert & Overwrite to Timeline */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => insertSourceClipToTimeline({ mode: 'insert' })}
            title="Insert Clip to Timeline at playhead (shifts subsequent clips) [,]"
            className="h-[24px] px-2.5 rounded text-[11px] font-semibold bg-[var(--accent)] text-[#0b0d11] hover:bg-[var(--accent-hover)] shadow-sm flex items-center gap-1 transition-colors"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Insert (,)</span>
          </button>
          <button
            type="button"
            onClick={() => insertSourceClipToTimeline({ mode: 'overwrite' })}
            title="Overwrite Clip to Timeline at playhead [.]"
            className="h-[24px] px-2 rounded text-[11px] font-semibold bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border)] transition-colors"
          >
            Overwrite (.)
          </button>
        </div>
      </div>
    </div>
  );
};
