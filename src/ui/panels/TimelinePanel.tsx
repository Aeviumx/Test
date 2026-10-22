import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  Clock,
  Diamond,
  Eye,
  EyeOff,
  Ghost,
  Layers,
  Link,
  Lock,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Unlock,
  Volume2,
  VolumeX,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { listLayerAnimatableProperties, ResolvedPropertyEntry } from '../../core/commands';
import { evaluateProperty } from '../../engine/evaluator';
import { globalFrameCache } from '../../render/FrameCache';
import { useProjectStore } from '../../store/useProjectStore';
import { Keyframe, KeyframeInterpolation, Layer, SelectedKeyframeRef } from '../../types';
import { LABEL_COLOR_MAP } from '../../utils/color';
import {
  clamp,
  formatShortTimecode,
  formatTimecode,
  parseTimecode,
  snapToFrame,
  timeToFrame,
} from '../../utils/timecode';
import { ContextMenu, ContextMenuItem } from '../components/ContextMenu';
import { ScrubbyInput } from '../components/ScrubbyInput';
import { GraphEditor } from './GraphEditor';

const ROW_HEIGHT = 28;
const PROP_ROW_HEIGHT = 24;

export const TimelinePanel: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const comp = useProjectStore((s) => s.getActiveComp());
  const currentTime = useProjectStore((s) =>
    s.isPlaying ? Math.round(s.currentTime * 15) / 15 : s.currentTime
  );
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const loopMode = useProjectStore((s) => s.loopMode);
  const measuredFps = useProjectStore((s) => s.measuredFps);
  const timelineZoom = useProjectStore((s) => s.timelineZoom);
  const selectedLayerIds = useProjectStore((s) => s.selectedLayerIds);
  const selectedKeyframes = useProjectStore((s) => s.selectedKeyframes);
  const graphEditorOpen = useProjectStore((s) => s.graphEditorOpen);

  const setCurrentTime = useProjectStore((s) => s.setCurrentTime);
  const setIsPlaying = useProjectStore((s) => s.setIsPlaying);
  const togglePlayPause = useProjectStore((s) => s.togglePlayPause);
  const setLoopMode = useProjectStore((s) => s.setLoopMode);
  const setTimelineZoom = useProjectStore((s) => s.setTimelineZoom);
  const selectLayer = useProjectStore((s) => s.selectLayer);
  const updateLayerMeta = useProjectStore((s) => s.updateLayerMeta);
  const reorderLayer = useProjectStore((s) => s.reorderLayer);
  const moveLayerTime = useProjectStore((s) => s.moveLayerTime);
  const toggleLayerGroupExpanded = useProjectStore((s) => s.toggleLayerGroupExpanded);
  const setPropertyValue = useProjectStore((s) => s.setPropertyValue);
  const togglePropertyStopwatch = useProjectStore((s) => s.togglePropertyStopwatch);
  const toggleKeyframeAtTime = useProjectStore((s) => s.toggleKeyframeAtTime);
  const setSelectedKeyframes = useProjectStore((s) => s.setSelectedKeyframes);
  const moveSelectedKeyframes = useProjectStore((s) => s.moveSelectedKeyframes);
  const applyEasingToSelectedKeyframes = useProjectStore((s) => s.applyEasingToSelectedKeyframes);
  const deleteSelectedKeyframes = useProjectStore((s) => s.deleteSelectedKeyframes);
  const copySelectedKeyframes = useProjectStore((s) => s.copySelectedKeyframes);
  const pasteKeyframesAtPlayhead = useProjectStore((s) => s.pasteKeyframesAtPlayhead);
  const duplicateSelectedLayers = useProjectStore((s) => s.duplicateSelectedLayers);
  const splitSelectedLayersAtPlayhead = useProjectStore((s) => s.splitSelectedLayersAtPlayhead);
  const deleteSelectedLayers = useProjectStore((s) => s.deleteSelectedLayers);
  const updateActiveComposition = useProjectStore((s) => s.updateActiveComposition);
  const addCompMarker = useProjectStore((s) => s.addCompMarker);
  const deleteCompMarker = useProjectStore((s) => s.deleteCompMarker);
  const recordTapAccent = useProjectStore((s) => s.recordTapAccent);
  const autoDetectRhythmAccents = useProjectStore((s) => s.autoDetectRhythmAccents);
  const clearAccentMap = useProjectStore((s) => s.clearAccentMap);
  const setGraphEditorOpen = useProjectStore((s) => s.setGraphEditorOpen);
  const setInspectedPropertyPath = useProjectStore((s) => s.setInspectedPropertyPath);
  const setActiveModal = useProjectStore((s) => s.setActiveModal);
  const activeTool = useProjectStore((s) => s.activeTool);
  const splitLayerAtTime = useProjectStore((s) => s.splitLayerAtTime);
  const rippleDeleteLayer = useProjectStore((s) => s.rippleDeleteLayer);
  const slipLayer = useProjectStore((s) => s.slipLayer);

  const [editingTimecode, setEditingTimecode] = useState(false);
  const [timecodeInput, setTimecodeInput] = useState('');
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [dragReorderIdx, setDragReorderIdx] = useState<number | null>(null);
  const [pickWhipFromId, setPickWhipFromId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [, setCacheTick] = useState(0);

  // Marquee selection box state on keyframe tracks
  const [marquee, setMarquee] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const trackContentRef = useRef<HTMLDivElement>(null);

  // Subscribe to RAM Frame Cache updates so the green bar updates live
  useEffect(() => {
    return globalFrameCache.subscribe(() => {
      setCacheTick((t) => t + 1);
    });
  }, []);

  const visibleLayers = comp.hideShyLayers
    ? comp.layers.filter((l) => !l.shy)
    : comp.layers;

  const trackWidth = Math.max(800, Math.ceil(comp.duration * timelineZoom) + 120);

  const timeToPx = (t: number) => t * timelineZoom;
  const pxToTime = (px: number) => clamp(px / timelineZoom, 0, comp.duration);

  // Collect snap targets (keyframes, layer in/out points, markers, workArea)
  const getSnapTargets = (): number[] => {
    const targets: number[] = [0, comp.workAreaStart, comp.workAreaEnd, comp.duration];
    for (const m of comp.markers) targets.push(m.time);
    for (const l of comp.layers) {
      targets.push(l.inPoint, l.outPoint);
      for (const p of listLayerAnimatableProperties(l)) {
        if (p.property.animated) {
          for (const k of p.property.keyframes) targets.push(k.time);
        }
      }
    }
    return targets;
  };

  const snapTimeWithTargets = (rawTime: number, altKey: boolean): number => {
    if (altKey) return snapToFrame(rawTime, comp.fps);
    const thresholdSec = 7 / timelineZoom;
    const targets = getSnapTargets();
    for (const target of targets) {
      if (Math.abs(rawTime - target) <= thresholdSec) {
        return target;
      }
    }
    return snapToFrame(rawTime, comp.fps);
  };

  // Scrub playhead along time ruler
  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsPlaying(false);
    const rect = e.currentTarget.getBoundingClientRect();

    const updateFromClientX = (clientX: number, altKey: boolean) => {
      const localX = clientX - rect.left;
      const t = snapTimeWithTargets(pxToTime(localX), altKey);
      setCurrentTime(t);
    };

    updateFromClientX(e.clientX, e.altKey);

    const onMove = (me: MouseEvent) => updateFromClientX(me.clientX, me.altKey);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Work Area handle drag
  const startWorkAreaDrag = (
    e: React.MouseEvent,
    mode: 'start' | 'end' | 'bar'
  ) => {
    e.stopPropagation();
    const startX = e.clientX;
    const origStart = comp.workAreaStart;
    const origEnd = comp.workAreaEnd;
    const span = origEnd - origStart;

    const onMove = (me: MouseEvent) => {
      const dt = (me.clientX - startX) / timelineZoom;
      if (mode === 'start') {
        updateActiveComposition({
          workAreaStart: clamp(snapToFrame(origStart + dt, comp.fps), 0, origEnd - 1 / comp.fps),
        });
      } else if (mode === 'end') {
        updateActiveComposition({
          workAreaEnd: clamp(
            snapToFrame(origEnd + dt, comp.fps),
            origStart + 1 / comp.fps,
            comp.duration
          ),
        });
      } else {
        const nextS = clamp(snapToFrame(origStart + dt, comp.fps), 0, comp.duration - span);
        updateActiveComposition({
          workAreaStart: nextS,
          workAreaEnd: nextS + span,
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Drag layer bar (move, trim, razor cut, or slip)
  const startLayerBarDrag = (
    e: React.MouseEvent,
    layer: Layer,
    mode: 'move' | 'trim-in' | 'trim-out'
  ) => {
    e.stopPropagation();
    if (layer.locked || e.button !== 0) return;

    // Razor tool: cut layer right at click time
    if (activeTool === 'razor') {
      const rect = trackContentRef.current?.getBoundingClientRect();
      const clickX = rect ? e.clientX - rect.left : 0;
      const clickTime = pxToTime(clickX);
      splitLayerAtTime(layer.id, snapToFrame(clickTime, comp.fps));
      return;
    }

    selectLayer(layer.id, e.shiftKey);

    // Slip tool: slide media in window without moving inPoint / outPoint
    if (activeTool === 'slip' || (mode === 'move' && e.altKey)) {
      const startX = e.clientX;
      const onMove = (me: MouseEvent) => {
        const dt = (me.clientX - startX) / timelineZoom;
        slipLayer(layer.id, dt);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    const startX = e.clientX;
    const origStart = layer.startTime;
    const origIn = layer.inPoint;
    const origOut = layer.outPoint;
    const duration = origOut - origIn;

    const onMove = (me: MouseEvent) => {
      const dt = (me.clientX - startX) / timelineZoom;
      if (mode === 'move') {
        const nextIn = clamp(
          snapTimeWithTargets(origIn + dt, me.altKey),
          0,
          comp.duration - duration
        );
        const realDelta = nextIn - origIn;
        moveLayerTime(layer.id, origStart + realDelta, nextIn, origOut + realDelta);
      } else if (mode === 'trim-in') {
        const nextIn = clamp(
          snapTimeWithTargets(origIn + dt, me.altKey),
          0,
          origOut - 1 / comp.fps
        );
        moveLayerTime(layer.id, origStart, nextIn, origOut);
      } else {
        const nextOut = clamp(
          snapTimeWithTargets(origOut + dt, me.altKey),
          origIn + 1 / comp.fps,
          comp.duration
        );
        moveLayerTime(layer.id, origStart, origIn, nextOut);
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Drag keyframe diamond horizontally
  const startKeyframeDrag = (
    e: React.MouseEvent,
    layerId: string,
    propertyPath: string,
    kf: Keyframe<unknown>
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const ref: SelectedKeyframeRef = { layerId, propertyPath, keyframeId: kf.id };
    const alreadySelected = selectedKeyframes.some((s) => s.keyframeId === kf.id);

    if (e.shiftKey) {
      setSelectedKeyframes(
        alreadySelected
          ? selectedKeyframes.filter((s) => s.keyframeId !== kf.id)
          : [...selectedKeyframes, ref]
      );
    } else if (!alreadySelected) {
      setSelectedKeyframes([ref]);
    }

    setInspectedPropertyPath(propertyPath);

    let lastSteppedDt = 0;
    const startX = e.clientX;

    const onMove = (me: MouseEvent) => {
      const rawDt = (me.clientX - startX) / timelineZoom;
      const snappedDt = snapToFrame(rawDt, comp.fps);
      const stepDelta = snappedDt - lastSteppedDt;
      if (Math.abs(stepDelta) >= 1 / comp.fps - 1e-4) {
        moveSelectedKeyframes(stepDelta);
        lastSteppedDt = snappedDt;
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Determine which property rows are visible under each layer
  const getVisiblePropertyRowsForLayer = (layer: Layer): ResolvedPropertyEntry[] => {
    const groups = layer.expandedGroups ?? [];
    if (groups.length === 0) return [];
    const all = listLayerAnimatableProperties(layer);
    if (groups.includes('animated-only')) {
      return all.filter((p) => p.property.animated || p.property.expressionEnabled);
    }
    return all.filter((p) => {
      if (p.property.animated || p.property.expressionEnabled) return true;
      if (p.groupName === 'Transform' && groups.includes('transform')) return true;
      if (p.groupName === 'Contents' && groups.includes('contents')) return true;
      if ((p.groupName === 'Text' || p.groupName === 'Text Animator') && groups.includes('text'))
        return true;
      if (p.groupName === 'Masks' && groups.includes('masks')) return true;
      if (p.groupName === 'Effects' && groups.includes('effects')) return true;
      return false;
    });
  };

  // Build flat row layout so Left Column and Right Track Area stay 100% pixel-aligned
  const flatRows: (
    | { kind: 'layer'; layer: Layer; layerIndex: number }
    | { kind: 'prop'; layer: Layer; layerIndex: number; entry: ResolvedPropertyEntry }
  )[] = [];

  visibleLayers.forEach((layer) => {
    const idx = comp.layers.indexOf(layer);
    flatRows.push({ kind: 'layer', layer, layerIndex: idx });
    const props = getVisiblePropertyRowsForLayer(layer);
    for (const entry of props) {
      flatRows.push({ kind: 'prop', layer, layerIndex: idx, entry });
    }
  });

  // Virtualize rows when timeline has > 35 rows so 100+ layers × 10 keyframes scroll at 60 FPS
  const shouldVirtualize = flatRows.length > 35;
  let topSpacerHeight = 0;
  let bottomSpacerHeight = 0;
  let virtualRows = flatRows;

  if (shouldVirtualize) {
    const winMinY = Math.max(0, scrollTop - 220);
    const winMaxY = scrollTop + 680;
    const sliced: typeof flatRows = [];
    let yCursor = 0;
    let foundFirst = false;

    for (let i = 0; i < flatRows.length; i++) {
      const r = flatRows[i];
      const rh = r.kind === 'layer' ? ROW_HEIGHT : PROP_ROW_HEIGHT;
      const rowBottom = yCursor + rh;
      if (rowBottom < winMinY) {
        topSpacerHeight += rh;
      } else if (yCursor <= winMaxY) {
        foundFirst = true;
        sliced.push(r);
      } else if (foundFirst) {
        bottomSpacerHeight += rh;
      }
      yCursor = rowBottom;
    }
    virtualRows = sliced;
  }

  // Start marquee selection box on empty track background
  const handleTrackAreaMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x0 = e.clientX - rect.left;
    const y0 = e.clientY - rect.top;
    if (!e.shiftKey) {
      setSelectedKeyframes([]);
    }
    setMarquee({ x0, y0, x1: x0, y1: y0 });

    const onMove = (me: MouseEvent) => {
      const x1 = me.clientX - rect.left;
      const y1 = me.clientY - rect.top;
      setMarquee({ x0, y0, x1, y1 });

      // Find all keyframes inside box
      const minX = Math.min(x0, x1);
      const maxX = Math.max(x0, x1);
      const minY = Math.min(y0, y1);
      const maxY = Math.max(y0, y1);

      const hits: SelectedKeyframeRef[] = [];
      let cursorY = 0;
      for (const row of flatRows) {
        const h = row.kind === 'layer' ? ROW_HEIGHT : PROP_ROW_HEIGHT;
        const centerY = cursorY + h / 2;
        if (row.kind === 'prop' && centerY >= minY && centerY <= maxY) {
          for (const kf of row.entry.property.keyframes) {
            const kx = timeToPx(kf.time);
            if (kx >= minX && kx <= maxX) {
              hits.push({
                layerId: row.layer.id,
                propertyPath: row.entry.path,
                keyframeId: kf.id,
              });
            }
          }
        }
        cursorY += h;
      }
      setSelectedKeyframes(hits);
    };

    const onUp = () => {
      setMarquee(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Render Keyframe Icon Shape: Diamond (linear), Hourglass (bezier), Square (hold)
  const renderKeyframeShape = (interp: KeyframeInterpolation, selected: boolean) => {
    const fill = selected ? '#8cc4ec' : '#8796ab';
    const stroke = selected ? '#ffffff' : '#343c4a';
    const filter = selected ? 'drop-shadow(0 0 4px rgba(140, 196, 236, 0.6))' : undefined;
    if (interp === 'hold') {
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" style={{ filter }}>
          <rect x="2" y="2" width="8" height="8" fill={fill} stroke={stroke} strokeWidth="1.3" />
        </svg>
      );
    }
    if (interp === 'bezier') {
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ filter }}>
          <polygon
            points="2,1.5 10,1.5 7,6 10,10.5 2,10.5 5,6"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.2"
          />
        </svg>
      );
    }
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" style={{ filter }}>
        <polygon points="6,1 11,6 6,11 1,6" fill={fill} stroke={stroke} strokeWidth="1.2" />
      </svg>
    );
  };

  const cachedFrames = globalFrameCache.getCachedFrames(comp.id);
  const totalCompFrames = Math.max(1, Math.round(comp.duration * comp.fps));

  return (
    <div className="h-full flex flex-col bg-[var(--bg-panel)] border-t border-[var(--border)] select-none overflow-hidden">
      {/* Top Transport & Timeline Controls Bar */}
      <div className="h-[32px] px-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
        {/* Left: Timecode & Frame Counter + Transport Buttons */}
        <div className="flex items-center gap-2">
          {editingTimecode ? (
            <input
              type="text"
              value={timecodeInput}
              autoFocus
              onChange={(e) => setTimecodeInput(e.target.value)}
              onBlur={() => {
                setEditingTimecode(false);
                const parsed = parseTimecode(timecodeInput, comp.fps);
                if (parsed !== null) setCurrentTime(parsed);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setEditingTimecode(false);
                  const parsed = parseTimecode(timecodeInput, comp.fps);
                  if (parsed !== null) setCurrentTime(parsed);
                }
                if (e.key === 'Escape') setEditingTimecode(false);
              }}
              className="w-28 h-[22px] px-2 bg-[var(--bg-base)] border border-[var(--accent)] rounded font-mono text-[11px] text-[var(--accent)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setTimecodeInput(formatTimecode(currentTime, comp.fps));
                setEditingTimecode(true);
              }}
              title="Click to enter exact SMPTE timecode (HH:MM:SS:FF)"
              className="h-[22px] px-2 bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded flex items-center gap-1.5 font-mono cursor-pointer transition-colors duration-150"
            >
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                {formatTimecode(currentTime, comp.fps)}
              </span>
              <span className="text-[10px] text-[var(--accent)]">
                {String(timeToFrame(currentTime, comp.fps)).padStart(4, '0')}f
              </span>
            </button>
          )}

          {/* Transport Controls */}
          <div className="flex items-center gap-0.5 bg-[var(--bg-base)] p-0.5 rounded border border-[var(--border)]">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentTime(comp.workAreaStart);
              }}
              title="First Frame of Work Area (Home)"
              className="p-1 rounded text-[var(--steel)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentTime(snapToFrame(currentTime - 1 / comp.fps, comp.fps));
              }}
              title="Previous Frame (PageUp)"
              className="p-1 rounded text-[var(--steel)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
            >
              <StepBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={togglePlayPause}
              title="Play / Pause Preview (Space)"
              className={`px-2 py-1 rounded flex items-center justify-center transition-all duration-150 ${
                isPlaying
                  ? 'bg-[var(--accent)] text-[#0b0d11] shadow-[0_0_8px_var(--accent-glow)]'
                  : 'bg-[var(--accent)] text-[#0b0d11] hover:bg-[var(--accent-hover)] shadow-[0_0_8px_var(--accent-glow)]'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentTime(snapToFrame(currentTime + 1 / comp.fps, comp.fps));
              }}
              title="Next Frame (PageDown)"
              className="p-1 rounded text-[var(--steel)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
            >
              <StepForward className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentTime(comp.workAreaEnd);
              }}
              title="Last Frame of Work Area (End)"
              className="p-1 rounded text-[var(--steel)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const order: ('loop' | 'pingpong' | 'once')[] = ['loop', 'pingpong', 'once'];
                setLoopMode(order[(order.indexOf(loopMode) + 1) % order.length]);
              }}
              title={`Loop Mode: ${loopMode.toUpperCase()}`}
              className={`px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] font-mono transition-colors duration-150 ${
                loopMode !== 'once' ? 'text-[var(--accent)]' : 'text-[var(--steel)]'
              }`}
            >
              <Repeat className="w-3 h-3" />
              <span className="uppercase">{loopMode}</span>
            </button>
          </div>

          {/* Real-time FPS & RAM Cache Status */}
          <div className="hidden md:flex items-center gap-2 px-2 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border)] font-mono text-[10px]">
            <span
              className={`w-2 h-2 rounded-full ${
                isPlaying ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--steel)]'
              }`}
            />
            <span className="text-[var(--text-secondary)]">{isPlaying ? `${measuredFps} FPS` : `${comp.fps} FPS`}</span>
            <span className="text-[var(--success)]">
              • RAM {Math.min(100, Math.round((cachedFrames.size / totalCompFrames) * 100))}%
            </span>
          </div>
        </div>

        {/* Center: Shy Switch, Marker, Easy Ease & Graph Editor Toggle */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => updateActiveComposition({ hideShyLayers: !comp.hideShyLayers })}
            title="Hide All Shy Layers in Timeline"
            className={`h-[22px] px-2 rounded flex items-center gap-1 text-[11px] border transition-colors duration-150 ${
              comp.hideShyLayers
                ? 'bg-[var(--bg-hover)] border-[var(--accent)] text-[var(--text-primary)] shadow-[0_0_8px_var(--accent-glow)]'
                : 'bg-[var(--bg-base)] border-[var(--border)] text-[var(--steel)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Ghost className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Shy</span>
          </button>

          <button
            type="button"
            onClick={() => addCompMarker(currentTime, `Marker ${comp.markers.length + 1}`)}
            title="Add Composition Marker at Playhead"
            className="h-[22px] px-2 rounded bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--steel-light)] hover:text-[var(--text-primary)] flex items-center gap-1 text-[11px] transition-colors duration-150"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-[var(--blush)]" />
            <span className="hidden lg:inline">Marker</span>
          </button>

          <button
            type="button"
            onClick={() => recordTapAccent(currentTime)}
            title="Tap Accent (or press 'A' during playback) - Auto-quantizes to nearest audio transient"
            className="h-[22px] px-2 rounded bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--steel-light)] hover:text-white flex items-center gap-1 text-[11px] transition-colors duration-150"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
            <span className="hidden lg:inline">Tap Accent [A]</span>
          </button>

          <button
            type="button"
            onClick={() => autoDetectRhythmAccents()}
            title="Auto-Detect Repeating Syncopated Accents (Reference 1 style 3-hit syncopation)"
            className="h-[22px] px-2 rounded bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--steel-light)] hover:text-[var(--text-primary)] flex items-center gap-1 text-[11px] transition-colors duration-150"
          >
            <span className="text-[10px] font-mono font-semibold text-rose-400">Syncopate</span>
          </button>

          <button
            type="button"
            onClick={() => setGraphEditorOpen(!graphEditorOpen)}
            title="Toggle Value / Speed Graph Editor"
            className={`h-[22px] px-2.5 rounded flex items-center gap-1.5 text-[11px] font-medium border transition-colors duration-150 ${
              graphEditorOpen
                ? 'bg-[var(--accent)] border-[var(--accent)] text-[#0b0d11] font-semibold shadow-[0_0_8px_var(--accent-glow)]'
                : 'bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Graph Editor</span>
          </button>
        </div>

        {/* Right: Timeline Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTimelineZoom(timelineZoom * 0.8)}
            className="p-1 rounded bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--steel)] hover:text-[var(--text-primary)] transition-colors duration-150"
            title="Zoom Out Timeline"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={30}
            max={450}
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(Number(e.target.value))}
            className="w-20 accent-[var(--accent)] cursor-pointer"
            title="Timeline Zoom"
          />
          <button
            type="button"
            onClick={() => setTimelineZoom(timelineZoom * 1.25)}
            className="p-1 rounded bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--steel)] hover:text-[var(--text-primary)] transition-colors duration-150"
            title="Zoom In Timeline"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Split Timeline Body: Left Layer/Property Tree + Right Track / Graph Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT COLUMN: Layer Stack & Expandable Property Tree */}
        <div className="w-[410px] shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
          {/* Column Headers */}
          <div className="h-[28px] px-2 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] shrink-0">
            <div className="flex items-center">
              <span className="w-[126px] pl-1 text-left">Switches</span>
              <span># / Layer Name</span>
            </div>
            <div className="flex items-center pr-2">
              <span>Parent (@)</span>
            </div>
          </div>

          {/* Scrollable Layer & Property Rows */}
          <div
            ref={leftScrollRef}
            onScroll={(e) => {
              const st = e.currentTarget.scrollTop;
              setScrollTop(st);
              if (rightScrollRef.current && rightScrollRef.current.scrollTop !== st) {
                rightScrollRef.current.scrollTop = st;
              }
            }}
            className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-[var(--border)]"
          >
            {topSpacerHeight > 0 && (
              <div style={{ height: topSpacerHeight }} aria-hidden="true" />
            )}
            {flatRows.length === 0 && (
              <div className="p-8 text-center text-[var(--text-muted)] select-none">
                <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center mx-auto mb-2.5">
                  <Layers className="w-5 h-5 text-[var(--steel)] opacity-60" />
                </div>
                <div className="text-[12px] font-medium text-[var(--text-primary)]">No Layers in Composition</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1 max-w-[240px] mx-auto leading-relaxed">
                  Press <kbd className="px-1 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded font-mono text-[9px] text-[var(--accent)]">Q</kbd> for Shape, <kbd className="px-1 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded font-mono text-[9px] text-[var(--steel-light)]">Shift+T</kbd> for Text, or import media.
                </div>
              </div>
            )}
            {virtualRows.map((row) => {
              if (row.kind === 'layer') {
                const { layer, layerIndex } = row;
                const isSelected = selectedLayerIds.includes(layer.id);
                const isExpanded = (layer.expandedGroups ?? []).length > 0;
                const labelInfo = LABEL_COLOR_MAP[layer.labelColor];

                return (
                  <div
                    key={`left_layer_${layer.id}`}
                    style={{ height: ROW_HEIGHT }}
                    draggable
                    onDragStart={() => setDragReorderIdx(layerIndex)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragReorderIdx !== null && dragReorderIdx !== layerIndex) {
                        reorderLayer(dragReorderIdx, layerIndex);
                      }
                      setDragReorderIdx(null);
                    }}
                    onClick={(e) => selectLayer(layer.id, e.shiftKey || e.ctrlKey)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      selectLayer(layer.id, false);
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        items: [
                          {
                            id: 'rename',
                            label: 'Rename Layer',
                            shortcut: 'Enter',
                            onClick: () => {
                              setRenamingLayerId(layer.id);
                              setRenameText(layer.name);
                            },
                          },
                          {
                            id: 'duplicate',
                            label: 'Duplicate Layer',
                            shortcut: 'Ctrl+D',
                            onClick: () => duplicateSelectedLayers(),
                          },
                          {
                            id: 'split',
                            label: 'Split Layer at Playhead',
                            shortcut: 'Ctrl+K',
                            onClick: () => splitSelectedLayersAtPlayhead(),
                          },
                          {
                            id: 'ripple-delete',
                            label: 'Ripple Delete (Close Gap)',
                            shortcut: 'Shift+Del',
                            danger: true,
                            onClick: () => rippleDeleteLayer(layer.id),
                          },
                          {
                            id: 'precomp',
                            label: 'Pre-compose...',
                            shortcut: 'Ctrl+Shift+C',
                            dividerAbove: true,
                            onClick: () => setActiveModal('precompose'),
                          },
                          {
                            id: 'delete',
                            label: 'Delete Layer',
                            shortcut: 'Del',
                            danger: true,
                            dividerAbove: true,
                            onClick: () => deleteSelectedLayers(),
                          },
                        ],
                      });
                    }}
                    className={`px-1.5 flex items-center justify-between gap-1.5 text-[11px] cursor-pointer transition-colors duration-150 ${
                      isSelected
                        ? 'bg-[var(--accent-deep)]/25 text-[var(--text-primary)]'
                        : 'bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {/* Left Switches: Expand, Eye, Audio, Solo, Lock, Shy, Color Swatch */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerGroupExpanded(layer.id, 'all');
                        }}
                        title={isExpanded ? "Collapse Layer Properties" : "Expand Layer Properties"}
                        className="p-0.5 text-[var(--steel)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--bg-hover)] transition-colors duration-150"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateLayerMeta(layer.id, { visible: !layer.visible });
                        }}
                        title="Toggle Visibility"
                        className={`p-0.5 transition-colors duration-150 ${
                          layer.visible ? 'text-[var(--text-primary)]' : 'text-[var(--steel)]/50'
                        }`}
                      >
                        {layer.visible ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                      </button>

                      {(layer.type === 'audio' || layer.type === 'video') && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateLayerMeta(layer.id, { audioEnabled: !layer.audioEnabled });
                          }}
                          title="Toggle Audio"
                          className={`p-0.5 transition-colors duration-150 ${
                            layer.audioEnabled ? 'text-[var(--steel-light)]' : 'text-[var(--steel)]/50'
                          }`}
                        >
                          {layer.audioEnabled ? (
                            <Volume2 className="w-3 h-3" />
                          ) : (
                            <VolumeX className="w-3 h-3" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateLayerMeta(layer.id, { solo: !layer.solo });
                        }}
                        title="Solo Layer"
                        className={`w-3.5 h-3.5 rounded text-[9px] font-bold flex items-center justify-center transition-colors duration-150 ${
                          layer.solo
                            ? 'bg-[var(--blush)] text-[#0b0d11]'
                            : 'text-[var(--steel)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        S
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateLayerMeta(layer.id, { shy: !layer.shy });
                        }}
                        title="Shy Layer Switch"
                        className={`p-0.5 transition-colors duration-150 ${
                          layer.shy ? 'text-[var(--accent)]' : 'text-[var(--steel)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <Ghost className="w-3 h-3" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateLayerMeta(layer.id, { locked: !layer.locked });
                        }}
                        title="Lock Layer"
                        className={`p-0.5 transition-colors duration-150 ${
                          layer.locked ? 'text-[var(--danger)]' : 'text-[var(--steel)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {layer.locked ? (
                          <Lock className="w-3 h-3" />
                        ) : (
                          <Unlock className="w-3 h-3" />
                        )}
                      </button>

                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/20"
                        style={{ backgroundColor: labelInfo.hex }}
                      />
                    </div>

                    {/* Center: Layer Index & Name */}
                    <div
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setRenamingLayerId(layer.id);
                        setRenameText(layer.name);
                      }}
                      className="flex items-center gap-1.5 min-w-0 flex-1"
                    >
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">
                        {layerIndex + 1}
                      </span>
                      {renamingLayerId === layer.id ? (
                        <input
                          type="text"
                          value={renameText}
                          autoFocus
                          onChange={(e) => setRenameText(e.target.value)}
                          onBlur={() => {
                            if (renameText.trim()) {
                              updateLayerMeta(layer.id, { name: renameText.trim() });
                            }
                            setRenamingLayerId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (renameText.trim()) {
                                updateLayerMeta(layer.id, { name: renameText.trim() });
                              }
                              setRenamingLayerId(null);
                            }
                            if (e.key === 'Escape') setRenamingLayerId(null);
                          }}
                          className="h-5 px-1 bg-[var(--bg-base)] border border-[var(--accent)] rounded text-[11px] text-[var(--text-primary)] outline-none w-full"
                        />
                      ) : (
                        <span className="truncate font-medium">{layer.name}</span>
                      )}
                    </div>

                    {/* Right: Pick-Whip (@) & Parent Selector */}
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        draggable
                        onDragStart={() => setPickWhipFromId(layer.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (pickWhipFromId && pickWhipFromId !== layer.id) {
                            updateLayerMeta(pickWhipFromId, { parentId: layer.id });
                          }
                          setPickWhipFromId(null);
                        }}
                        title="Drag Pick-Whip (@) onto another layer to parent"
                        className="p-0.5 text-[var(--steel-light)] hover:bg-[var(--bg-hover)] rounded cursor-grab transition-colors duration-150"
                      >
                        <Link className="w-3 h-3" />
                      </button>

                      <select
                        value={layer.parentId ?? ''}
                        onChange={(e) =>
                          updateLayerMeta(layer.id, { parentId: e.target.value || null })
                        }
                        className="w-20 h-5 px-1 bg-[var(--bg-base)] border border-[var(--border)] rounded text-[10px] text-[var(--text-secondary)] outline-none"
                      >
                        <option value="">None</option>
                        {comp.layers
                          .filter((l) => l.id !== layer.id && l.type !== 'audio')
                          .map((l, idx) => (
                            <option key={l.id} value={l.id}>
                              {idx + 1}. {l.name.slice(0, 12)}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                );
              }

              // Property Row
              const { layer, layerIndex, entry } = row;
              const prop = entry.property;
              const val = evaluateProperty(prop, currentTime, comp, layer, layerIndex);
              const snappedNow = snapToFrame(currentTime, comp.fps);
              const hasKfNow =
                prop.animated &&
                prop.keyframes.some((k) => Math.abs(k.time - snappedNow) < 0.001);

              return (
                <div
                  key={`left_prop_${layer.id}_${entry.path}`}
                  style={{ height: PROP_ROW_HEIGHT }}
                  onClick={() => setInspectedPropertyPath(entry.path)}
                  className="pl-7 pr-2 bg-[var(--bg-panel)]/80 hover:bg-[var(--bg-hover)] flex items-center justify-between gap-1 text-[11px] transition-colors duration-150"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePropertyStopwatch(layer.id, entry.path);
                      }}
                      title="Toggle Animation Stopwatch"
                      className={`p-0.5 rounded transition-colors duration-150 ${
                        prop.animated ? 'text-[var(--accent)]' : 'text-[var(--steel)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleKeyframeAtTime(layer.id, entry.path);
                      }}
                      title="Add / Remove Keyframe at Playhead"
                      className={`p-0.5 rounded transition-colors duration-150 ${
                        hasKfNow ? 'text-[var(--accent)]' : 'text-[var(--steel)] hover:text-[var(--steel-light)]'
                      }`}
                    >
                      <Diamond className={`w-2.5 h-2.5 ${hasKfNow ? 'fill-[var(--accent)] drop-shadow-[0_0_4px_var(--accent-glow)]' : ''}`} />
                    </button>

                    <span className="text-[var(--text-secondary)] truncate">{entry.label}</span>
                  </div>

                  {/* Compact Inline Scrubby Input */}
                  <div className="flex items-center gap-1 shrink-0">
                    {typeof val === 'number' && (
                      <ScrubbyInput
                        value={val}
                        onChange={(v) => setPropertyValue(layer.id, entry.path, v)}
                        min={prop.min}
                        max={prop.max}
                        step={prop.step ?? 1}
                        unit={prop.unit ?? ''}
                        className="w-[68px] h-5"
                      />
                    )}
                    {Array.isArray(val) && (
                      <>
                        <ScrubbyInput
                          value={val[0]}
                          onChange={(nx) => setPropertyValue(layer.id, entry.path, [nx, val[1]])}
                          step={prop.step ?? 1}
                          className="w-[64px] h-5"
                        />
                        <ScrubbyInput
                          value={val[1]}
                          onChange={(ny) => setPropertyValue(layer.id, entry.path, [val[0], ny])}
                          step={prop.step ?? 1}
                          className="w-[64px] h-5"
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {bottomSpacerHeight > 0 && (
              <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Either Interactive Graph Editor OR Dope Sheet / Layer Bars */}
        <div className="flex-1 min-w-0 flex flex-col bg-[var(--bg-base)] overflow-hidden">
          {graphEditorOpen ? (
            <GraphEditor />
          ) : (
            <div
              ref={rightScrollRef}
              onScroll={(e) => {
                const st = e.currentTarget.scrollTop;
                setScrollTop(st);
                if (leftScrollRef.current && leftScrollRef.current.scrollTop !== st) {
                  leftScrollRef.current.scrollTop = st;
                }
              }}
              onWheel={(e) => {
                if (e.ctrlKey || e.altKey) {
                  e.preventDefault();
                  setTimelineZoom(timelineZoom * (e.deltaY < 0 ? 1.15 : 0.86));
                }
              }}
              className="flex-1 overflow-auto relative"
            >
              <div style={{ width: trackWidth }} className="min-h-full relative">
                {/* Sticky Time Ruler + RAM Cache Bar + Work Area Bar + Audio Intelligence */}
                <div
                  onMouseDown={handleRulerMouseDown}
                  className={`sticky top-0 z-30 ${
                    comp.audioTrackAnalysis?.accentMap
                      ? 'h-[72px]'
                      : comp.audioTrackAnalysis
                      ? 'h-[56px]'
                      : 'h-[28px]'
                  } bg-[var(--bg-elevated)] border-b border-[var(--border)] cursor-ew-resize select-none transition-[height] duration-150`}
                >
                  {/* RAM Frame Cache Indicator Bar */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--bg-base)] flex z-30">
                    {Array.from({ length: Math.min(240, totalCompFrames) }, (_, i) => {
                      const frameIdx = Math.round((i / Math.min(240, totalCompFrames)) * totalCompFrames);
                      const isCached = cachedFrames.has(frameIdx);
                      return (
                        <div
                          key={i}
                          className="flex-1 h-full"
                          style={{
                            backgroundColor: isCached ? 'var(--success)' : 'transparent',
                          }}
                        />
                      );
                    })}
                  </div>

                  {/* Musical Structure Sections (Intro -> Buildup -> Drop -> Break -> Outro) */}
                  {comp.audioTrackAnalysis?.sections && (
                    <div className="absolute top-1 left-0 right-0 h-4 flex pointer-events-none z-20 overflow-hidden">
                      {comp.audioTrackAnalysis.sections.map((sec, idx) => {
                        const left = timeToPx(sec.startTime);
                        const width = timeToPx(sec.endTime - sec.startTime);
                        const colors = {
                          intro: 'bg-indigo-950/70 border-indigo-400/40 text-indigo-300',
                          buildup: 'bg-amber-950/70 border-amber-400/50 text-amber-300',
                          drop: 'bg-cyan-950/85 border-cyan-400 text-cyan-200 font-bold shadow-[0_0_12px_rgba(6,182,212,0.35)]',
                          break: 'bg-purple-950/70 border-purple-400/40 text-purple-300',
                          climax: 'bg-rose-950/85 border-rose-400 text-rose-200 font-bold shadow-[0_0_12px_rgba(244,63,94,0.35)]',
                          outro: 'bg-slate-900/70 border-slate-500/40 text-slate-300',
                        };
                        return (
                          <div
                            key={idx}
                            style={{ left, width }}
                            className={`absolute top-0 h-full border-r border-t flex items-center justify-between px-1.5 text-[8.5px] uppercase tracking-wider backdrop-blur-sm ${colors[sec.type] || colors.intro}`}
                          >
                            <span className="truncate">{sec.type === 'drop' ? 'DROP 🔥' : sec.type}</span>
                            <span className="opacity-60 font-mono text-[8px]">{(sec.endTime - sec.startTime).toFixed(1)}s</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Dynamic Audio Energy Curve (RMS & Frequency Envelope) */}
                  {comp.audioTrackAnalysis?.energyCurve && (
                    <svg
                      style={{ width: timeToPx(comp.duration) }}
                      className="absolute top-5 left-0 h-7 pointer-events-none z-10 opacity-75"
                    >
                      <defs>
                        <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
                        </linearGradient>
                      </defs>
                      <path
                        d={(() => {
                          const curve = comp.audioTrackAnalysis.energyCurve;
                          const pts = curve.map((val, i) => {
                            const t = (i / (curve.length - 1)) * comp.duration;
                            const x = timeToPx(t);
                            const y = 26 - val * 22;
                            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                          }).join(' ');
                          return `${pts} L ${timeToPx(comp.duration)} 28 L 0 28 Z`;
                        })()}
                        fill="url(#energyFill)"
                      />
                      <path
                        d={(() => {
                          const curve = comp.audioTrackAnalysis.energyCurve;
                          return curve.map((val, i) => {
                            const t = (i / (curve.length - 1)) * comp.duration;
                            const x = timeToPx(t);
                            const y = 26 - val * 22;
                            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                          }).join(' ');
                        })()}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.2"
                      />
                    </svg>
                  )}

                  {/* Synchronized Beat Transients (Snare & Kick) */}
                  {comp.audioTrackAnalysis?.beats.map((b) => (
                    <div
                      key={b.time}
                      style={{ left: timeToPx(b.time) }}
                      className={`absolute top-5 bottom-0 pointer-events-none ${
                        b.isDownbeat
                          ? 'w-[1.5px] bg-cyan-400 z-10 shadow-[0_0_6px_rgba(56,189,248,0.8)]'
                          : 'w-[1px] bg-sky-500/35 z-0'
                      }`}
                    >
                      {b.isDownbeat && (
                        <div className="w-1.5 h-1.5 -ml-[2px] rounded-full bg-cyan-300 shadow-[0_0_4px_cyan]" />
                      )}
                    </div>
                  ))}

                  {/* Rhythmic Accent Map (Strong / Medium / Weak Syncopations) */}
                  {comp.audioTrackAnalysis?.accentMap?.accents.map((acc) => {
                    const color =
                      acc.strength === 'strong'
                        ? '#f43f5e'
                        : acc.strength === 'medium'
                        ? '#f59e0b'
                        : '#38bdf8';
                    return (
                      <div
                        key={acc.id}
                        style={{ left: timeToPx(acc.time) }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentTime(acc.time);
                        }}
                        title={`Accent (${acc.strength.toUpperCase()} @ ${acc.time.toFixed(2)}s - ${acc.band || 'beat'})`}
                        className="absolute top-5 h-7 -ml-[5px] flex flex-col items-center cursor-pointer group z-20"
                      >
                        <div
                          style={{ backgroundColor: color, borderColor: color }}
                          className={`w-2.5 h-2.5 rotate-45 border shadow-[0_0_6px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-125 ${
                            acc.strength === 'strong' ? 'shadow-[0_0_8px_#f43f5e]' : ''
                          }`}
                        />
                        <div
                          style={{ backgroundColor: color }}
                          className="w-[1.5px] flex-1 opacity-60 group-hover:opacity-100"
                        />
                      </div>
                    );
                  })}

                  {/* Work Area Bar (B / N) */}
                  <div
                    style={{
                      left: timeToPx(comp.workAreaStart),
                      width: Math.max(8, timeToPx(comp.workAreaEnd - comp.workAreaStart)),
                    }}
                    onMouseDown={(e) => startWorkAreaDrag(e, 'bar')}
                    title="Work Area (Press B / N to set Start / End at Playhead)"
                    className="absolute top-1 h-2.5 bg-[var(--denim)]/40 border-y border-[var(--denim-light)] cursor-grab flex items-center justify-between"
                  >
                    <div
                      onMouseDown={(e) => startWorkAreaDrag(e, 'start')}
                      className="w-1.5 h-full bg-[var(--denim-light)] hover:bg-[var(--accent)] cursor-ew-resize transition-colors"
                    />
                    <div
                      onMouseDown={(e) => startWorkAreaDrag(e, 'end')}
                      className="w-1.5 h-full bg-[var(--denim-light)] hover:bg-[var(--accent)] cursor-ew-resize transition-colors"
                    />
                  </div>

                  {/* Time Ticks & Labels */}
                  {Array.from(
                    { length: Math.ceil(comp.duration * 2) + 1 },
                    (_, idx) => idx * 0.5
                  ).map((sec) => {
                    const isWhole = Number.isInteger(sec);
                    const x = timeToPx(sec);
                    return (
                      <div
                        key={sec}
                        style={{ left: x }}
                        className="absolute bottom-0 pointer-events-none"
                      >
                        <div
                          className={`border-l ${
                            isWhole ? 'h-3.5 border-[var(--steel)]' : 'h-2 border-[var(--border-strong)]'
                          }`}
                        />
                        {isWhole && (
                          <span className="absolute bottom-1.5 left-1 font-mono text-[9px] text-[var(--text-muted)]">
                            {formatShortTimecode(sec, comp.fps)}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Composition Markers */}
                  {comp.markers.map((mrk) => (
                    <div
                      key={mrk.id}
                      style={{ left: timeToPx(mrk.time) }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentTime(mrk.time);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteCompMarker(mrk.id);
                      }}
                      title={`${mrk.label} (Right-click to delete)`}
                      className="absolute top-3.5 -translate-x-1/2 px-1 py-0.2 rounded bg-[var(--blush)] text-[#0b0d11] font-mono text-[9px] font-bold cursor-pointer shadow-[0_0_6px_rgba(240,212,216,0.3)]"
                    >
                      {mrk.label}
                    </div>
                  ))}
                </div>

                {/* Track Rows (Layer Bars & Keyframe Diamonds) */}
                <div
                  ref={trackContentRef}
                  onMouseDown={handleTrackAreaMouseDown}
                  className="relative divide-y divide-[var(--border)]"
                >
                  {/* Work Area Dimmed Overlay Outside Bounds */}
                  {comp.workAreaStart > 0 && (
                    <div
                      style={{ width: timeToPx(comp.workAreaStart) }}
                      className="absolute top-0 bottom-0 left-0 bg-black/40 pointer-events-none z-10"
                    />
                  )}
                  {comp.workAreaEnd < comp.duration && (
                    <div
                      style={{
                        left: timeToPx(comp.workAreaEnd),
                        width: timeToPx(comp.duration - comp.workAreaEnd),
                      }}
                      className="absolute top-0 bottom-0 bg-black/40 pointer-events-none z-10"
                    />
                  )}

                  {topSpacerHeight > 0 && (
                    <div style={{ height: topSpacerHeight }} aria-hidden="true" />
                  )}
                  {virtualRows.map((row) => {
                    if (row.kind === 'layer') {
                      const { layer } = row;
                      const isSelected = selectedLayerIds.includes(layer.id);
                      const colorInfo = LABEL_COLOR_MAP[layer.labelColor];
                      const barLeft = timeToPx(layer.inPoint);
                      const barWidth = Math.max(6, timeToPx(layer.outPoint - layer.inPoint));
                      const asset = layer.assetId
                        ? project.assets.find((a) => a.id === layer.assetId)
                        : undefined;

                      return (
                        <div
                          key={`track_layer_${layer.id}`}
                          style={{ height: ROW_HEIGHT }}
                          className={`relative ${
                            isSelected ? 'bg-[var(--accent-deep)]/10' : 'bg-[var(--bg-base)]'
                          }`}
                        >
                          {/* Layer Bar */}
                          <div
                            style={{
                              left: barLeft,
                              width: barWidth,
                              backgroundColor: isSelected ? 'var(--accent-deep)' : colorInfo.bg,
                              borderTop: isSelected ? '1px solid var(--accent)' : '1px solid var(--denim-light)',
                              boxShadow: isSelected ? '0 0 8px var(--accent-glow)' : 'inset 0 -1px 0 rgba(0,0,0,0.3)',
                              borderColor: isSelected ? 'var(--accent)' : colorInfo.border,
                            }}
                            onMouseDown={(e) => startLayerBarDrag(e, layer, 'move')}
                            className={`absolute top-1 bottom-1 rounded border flex items-center justify-between overflow-hidden group transition-all duration-150 ${
                              activeTool === 'razor'
                                ? 'cursor-crosshair'
                                : activeTool === 'slip'
                                ? 'cursor-ew-resize'
                                : 'cursor-grab active:cursor-grabbing'
                            }`}
                          >
                            {/* Left Trim Handle */}
                            <div
                              onMouseDown={(e) => startLayerBarDrag(e, layer, 'trim-in')}
                              title="Drag to Trim Layer In Point (Alt+[)"
                              className="w-2 h-full bg-white/15 hover:bg-white/50 cursor-ew-resize shrink-0 z-10 transition-colors"
                            />

                            {/* Audio Waveform if Audio Layer */}
                            {asset?.waveform && asset.waveform.length > 0 && (
                              <div className="absolute inset-0 flex items-center gap-px px-2 opacity-60 pointer-events-none">
                                {asset.waveform.map((peak, wIdx) => (
                                  <div
                                    key={wIdx}
                                    style={{ height: `${Math.max(15, peak * 95)}%` }}
                                    className="flex-1 bg-[var(--steel-light)] rounded-full"
                                  />
                                ))}
                              </div>
                            )}

                            <span className="px-1.5 text-[10px] font-medium text-[var(--text-primary)] truncate pointer-events-none">
                              {layer.name}
                            </span>

                            {/* Right Trim Handle */}
                            <div
                              onMouseDown={(e) => startLayerBarDrag(e, layer, 'trim-out')}
                              title="Drag to Trim Layer Out Point (Alt+])"
                              className="w-2 h-full bg-white/15 hover:bg-white/50 cursor-ew-resize shrink-0 z-10 transition-colors"
                            />
                          </div>
                        </div>
                      );
                    }

                    // Property Keyframe Track Row
                    const { layer, entry } = row;
                    const prop = entry.property;

                    return (
                      <div
                        key={`track_prop_${layer.id}_${entry.path}`}
                        style={{ height: PROP_ROW_HEIGHT }}
                        className="relative bg-[var(--bg-base)] hover:bg-[var(--bg-hover)]/40 transition-colors"
                      >
                        {prop.keyframes.map((kf) => {
                          const kx = timeToPx(kf.time);
                          const isKfSelected = selectedKeyframes.some(
                            (s) => s.keyframeId === kf.id
                          );
                          return (
                            <div
                              key={kf.id}
                              style={{ left: kx }}
                              onMouseDown={(e) =>
                                startKeyframeDrag(e, layer.id, entry.path, kf)
                              }
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedKeyframes([
                                  {
                                    layerId: layer.id,
                                    propertyPath: entry.path,
                                    keyframeId: kf.id,
                                  },
                                ]);
                                setContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  items: [
                                    {
                                      id: 'easy-ease',
                                      label: 'Keyframe Assistant → Easy Ease',
                                      shortcut: 'F9',
                                      onClick: () =>
                                        applyEasingToSelectedKeyframes('easy-ease'),
                                    },
                                    {
                                      id: 'ease-in',
                                      label: 'Keyframe Assistant → Ease In',
                                      shortcut: 'Shift+F9',
                                      onClick: () =>
                                        applyEasingToSelectedKeyframes('ease-in'),
                                    },
                                    {
                                      id: 'ease-out',
                                      label: 'Keyframe Assistant → Ease Out',
                                      shortcut: 'Ctrl+Shift+F9',
                                      onClick: () =>
                                        applyEasingToSelectedKeyframes('ease-out'),
                                    },
                                    {
                                      id: 'linear',
                                      label: 'Interpolation → Linear (Diamond)',
                                      dividerAbove: true,
                                      onClick: () =>
                                        applyEasingToSelectedKeyframes('linear'),
                                    },
                                    {
                                      id: 'hold',
                                      label: 'Interpolation → Toggle Hold (Square)',
                                      onClick: () => applyEasingToSelectedKeyframes('hold'),
                                    },
                                    {
                                      id: 'copy-kf',
                                      label: 'Copy Keyframe(s)',
                                      shortcut: 'Ctrl+C',
                                      dividerAbove: true,
                                      onClick: () => copySelectedKeyframes(),
                                    },
                                    {
                                      id: 'paste-kf',
                                      label: 'Paste Keyframe(s) at Playhead',
                                      shortcut: 'Ctrl+V',
                                      onClick: () => pasteKeyframesAtPlayhead(),
                                    },
                                    {
                                      id: 'del-kf',
                                      label: 'Delete Keyframe',
                                      shortcut: 'Del',
                                      danger: true,
                                      dividerAbove: true,
                                      onClick: () => deleteSelectedKeyframes(),
                                    },
                                  ],
                                });
                              }}
                              title={`${entry.label} @ ${formatShortTimecode(
                                kf.time,
                                comp.fps
                              )} (${kf.interpolation})`}
                              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 hover:scale-125 transition-transform"
                            >
                              {renderKeyframeShape(kf.interpolation, isKfSelected)}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {bottomSpacerHeight > 0 && (
                    <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
                  )}

                  {/* Marquee Selection Box */}
                  {marquee && (
                    <div
                      style={{
                        left: Math.min(marquee.x0, marquee.x1),
                        top: Math.min(marquee.y0, marquee.y1),
                        width: Math.abs(marquee.x1 - marquee.x0),
                        height: Math.abs(marquee.y1 - marquee.y0),
                      }}
                      className="absolute bg-[var(--accent)]/15 border border-[var(--accent)] pointer-events-none z-30"
                    />
                  )}
                </div>

                {/* Full-Height Playhead Line & Cap */}
                <div
                  style={{ left: timeToPx(currentTime) }}
                  className="absolute top-0 bottom-0 w-px bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)] pointer-events-none z-40"
                >
                  <div className="w-3.5 h-4 -ml-[6.5px] bg-[var(--accent)] clip-path-playhead rounded-t-sm shadow-[0_0_8px_var(--accent-glow)] flex items-center justify-center">
                    <div className="w-1 h-2 bg-[#0b0d11] rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
