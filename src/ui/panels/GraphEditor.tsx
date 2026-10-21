import React, { useRef } from 'react';
import { Activity, TrendingUp } from 'lucide-react';
import { getLayerPropertyByPath, listLayerAnimatableProperties } from '../../core/commands';
import { computePropertySpeed, evaluateProperty } from '../../engine/evaluator';
import { useProjectStore } from '../../store/useProjectStore';
import { Keyframe, Vec2 } from '../../types';
import { clamp } from '../../utils/timecode';

export const GraphEditor: React.FC = () => {
  const comp = useProjectStore((s) => s.getActiveComp());
  const currentTime = useProjectStore((s) => s.currentTime);
  const selectedLayerIds = useProjectStore((s) => s.selectedLayerIds);
  const inspectedPropertyPath = useProjectStore((s) => s.inspectedPropertyPath);
  const graphEditorMode = useProjectStore((s) => s.graphEditorMode);
  const selectedKeyframes = useProjectStore((s) => s.selectedKeyframes);

  const setGraphEditorMode = useProjectStore((s) => s.setGraphEditorMode);
  const setInspectedPropertyPath = useProjectStore((s) => s.setInspectedPropertyPath);
  const setCurrentTime = useProjectStore((s) => s.setCurrentTime);
  const setSelectedKeyframes = useProjectStore((s) => s.setSelectedKeyframes);
  const updateKeyframeTangentsAndValue = useProjectStore((s) => s.updateKeyframeTangentsAndValue);
  const applyEasingToSelectedKeyframes = useProjectStore((s) => s.applyEasingToSelectedKeyframes);

  const svgRef = useRef<SVGSVGElement>(null);

  const layer = comp.layers.find((l) => l.id === selectedLayerIds[0]) ?? comp.layers[0] ?? null;
  const layerIdx = layer ? comp.layers.indexOf(layer) : 0;

  if (!layer) {
    return (
      <div className="h-full flex items-center justify-center bg-[#18181c] text-[#787885] text-[12px]">
        Select a layer to edit animation curves in the Graph Editor.
      </div>
    );
  }

  const allProps = listLayerAnimatableProperties(layer);
  const animatedProps = allProps.filter((p) => p.property.animated || p.property.expressionEnabled);
  const activePath =
    inspectedPropertyPath && getLayerPropertyByPath(layer, inspectedPropertyPath)
      ? inspectedPropertyPath
      : animatedProps[0]?.path ?? 'transform.position';

  const prop = getLayerPropertyByPath(layer, activePath) ?? layer.transform.position;

  const width = 920;
  const height = 220;
  const padL = 52;
  const padR = 24;
  const padT = 20;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const timeToX = (t: number) => padL + (clamp(t, 0, comp.duration) / Math.max(0.1, comp.duration)) * plotW;
  const xToTime = (x: number) => clamp(((x - padL) / plotW) * comp.duration, 0, comp.duration);

  // Sample curve across composition duration
  const sampleCount = 140;
  const samples: { t: number; v0: number; v1?: number; speed: number }[] = [];
  let minVal = Infinity;
  let maxVal = -Infinity;
  let maxSpeed = 10;

  for (let i = 0; i <= sampleCount; i++) {
    const t = (i / sampleCount) * comp.duration;
    const raw = evaluateProperty(prop, t, comp, layer, layerIdx);
    const spd = computePropertySpeed(prop, t, comp, layer, layerIdx);
    if (spd > maxSpeed) maxSpeed = spd;

    if (typeof raw === 'number') {
      if (raw < minVal) minVal = raw;
      if (raw > maxVal) maxVal = raw;
      samples.push({ t, v0: raw, speed: spd });
    } else if (Array.isArray(raw)) {
      minVal = Math.min(minVal, raw[0], raw[1]);
      maxVal = Math.max(maxVal, raw[0], raw[1]);
      samples.push({ t, v0: raw[0], v1: raw[1], speed: spd });
    } else {
      samples.push({ t, v0: 0, speed: 0 });
    }
  }

  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || Math.abs(maxVal - minVal) < 1) {
    minVal = (Number.isFinite(minVal) ? minVal : 0) - 50;
    maxVal = minVal + 100;
  } else {
    const margin = (maxVal - minVal) * 0.18;
    minVal -= margin;
    maxVal += margin;
  }

  const valToY = (v: number) => {
    if (graphEditorMode === 'speed') {
      return padT + plotH - (clamp(v, 0, maxSpeed * 1.15) / (maxSpeed * 1.15)) * plotH;
    }
    return padT + plotH - ((v - minVal) / Math.max(1e-5, maxVal - minVal)) * plotH;
  };

  const yToVal = (y: number) => {
    const norm = 1 - (y - padT) / plotH;
    return minVal + norm * (maxVal - minVal);
  };

  const getSvgPoint = (clientX: number, clientY: number): Vec2 => {
    if (!svgRef.current) return [0, 0];
    const rect = svgRef.current.getBoundingClientRect();
    const sx = ((clientX - rect.left) / Math.max(1, rect.width)) * width;
    const sy = ((clientY - rect.top) / Math.max(1, rect.height)) * height;
    return [sx, sy];
  };

  const handleKeyframeDrag = (e: React.MouseEvent, kf: Keyframe<number | Vec2 | string>) => {
    e.stopPropagation();
    setSelectedKeyframes([{ layerId: layer.id, propertyPath: activePath, keyframeId: kf.id }]);

    const onMove = (me: MouseEvent) => {
      const [sx, sy] = getSvgPoint(me.clientX, me.clientY);
      const nextTime = xToTime(sx);
      if (graphEditorMode === 'value') {
        const nextScalar = Math.round(yToVal(sy) * 100) / 100;
        if (typeof kf.value === 'number') {
          updateKeyframeTangentsAndValue(layer.id, activePath, kf.id, {
            time: nextTime,
            value: nextScalar,
          });
        } else if (Array.isArray(kf.value)) {
          updateKeyframeTangentsAndValue(layer.id, activePath, kf.id, {
            time: nextTime,
            value: [nextScalar, kf.value[1]],
          });
        }
      } else {
        updateKeyframeTangentsAndValue(layer.id, activePath, kf.id, {
          time: nextTime,
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

  const handleTangentDrag = (
    e: React.MouseEvent,
    kf: Keyframe<number | Vec2 | string>,
    side: 'in' | 'out',
    spanPx: number
  ) => {
    e.stopPropagation();
    const kfX = timeToX(kf.time);
    const scalarVal = typeof kf.value === 'number' ? kf.value : Array.isArray(kf.value) ? kf.value[0] : 0;
    const kfY = valToY(scalarVal);

    const onMove = (me: MouseEvent) => {
      const [sx, sy] = getSvgPoint(me.clientX, me.clientY);
      const dx = side === 'out' ? sx - kfX : kfX - sx;
      const dy = kfY - sy;
      const normX = clamp(dx / Math.max(24, spanPx), 0.05, 0.95);
      const normY = clamp(dy / (plotH * 0.5), -1.5, 1.5);

      if (side === 'out') {
        updateKeyframeTangentsAndValue(layer.id, activePath, kf.id, {
          outTangent: { x: Number(normX.toFixed(2)), y: Number(normY.toFixed(2)) },
        });
      } else {
        updateKeyframeTangentsAndValue(layer.id, activePath, kf.id, {
          inTangent: { x: Number(normX.toFixed(2)), y: Number(normY.toFixed(2)) },
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

  const isVec2 = samples[0]?.v1 !== undefined;

  return (
    <div className="h-full flex flex-col bg-[#16161a] select-none overflow-hidden">
      {/* Graph Editor Toolbar */}
      <div className="h-7 px-3 bg-[#1e1e23] border-b border-[#2e2e33] flex items-center justify-between gap-2 text-[11px] shrink-0">
        {/* Left: Property Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#00d1b2] shrink-0">
            Curve:
          </span>
          <select
            value={activePath}
            onChange={(e) => setInspectedPropertyPath(e.target.value)}
            className="h-5 px-1.5 bg-[#141418] border border-[#34343e] rounded text-[11px] text-white outline-none"
          >
            {allProps.map((p) => (
              <option key={p.path} value={p.path}>
                {p.groupName}: {p.label} {p.property.animated ? '◆' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Center: Value Graph vs Speed Graph */}
        <div className="flex items-center gap-1 bg-[#141418] p-0.5 rounded border border-[#2e2e33]">
          <button
            type="button"
            onClick={() => setGraphEditorMode('value')}
            className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ${
              graphEditorMode === 'value'
                ? 'bg-[#6c5ce7] text-white'
                : 'text-[#9b9ba6] hover:text-white'
            }`}
          >
            <TrendingUp className="w-3 h-3" /> Value Graph
          </button>
          <button
            type="button"
            onClick={() => setGraphEditorMode('speed')}
            className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ${
              graphEditorMode === 'speed'
                ? 'bg-[#00d1b2] text-[#141418] font-semibold'
                : 'text-[#9b9ba6] hover:text-white'
            }`}
          >
            <Activity className="w-3 h-3" /> Speed Graph
          </button>
        </div>

        {/* Right: Easing Quick Presets */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => applyEasingToSelectedKeyframes('easy-ease')}
            title="Easy Ease (F9)"
            className="h-5 px-2 rounded bg-[#26262e] hover:bg-[#6c5ce7] text-[10px] text-[#e4e4e8]"
          >
            Easy Ease (F9)
          </button>
          <button
            type="button"
            onClick={() => applyEasingToSelectedKeyframes('ease-in')}
            title="Ease In (Shift+F9)"
            className="h-5 px-2 rounded bg-[#26262e] hover:bg-[#6c5ce7] text-[10px] text-[#e4e4e8]"
          >
            Ease In
          </button>
          <button
            type="button"
            onClick={() => applyEasingToSelectedKeyframes('ease-out')}
            title="Ease Out (Ctrl+Shift+F9)"
            className="h-5 px-2 rounded bg-[#26262e] hover:bg-[#6c5ce7] text-[10px] text-[#e4e4e8]"
          >
            Ease Out
          </button>
          <button
            type="button"
            onClick={() => applyEasingToSelectedKeyframes('linear')}
            className="h-5 px-2 rounded bg-[#26262e] hover:bg-[#6c5ce7] text-[10px] text-[#e4e4e8]"
          >
            Linear
          </button>
          <button
            type="button"
            onClick={() => applyEasingToSelectedKeyframes('hold')}
            className="h-5 px-2 rounded bg-[#26262e] hover:bg-[#6c5ce7] text-[10px] text-[#e4e4e8]"
          >
            Hold
          </button>
        </div>
      </div>

      {/* Interactive SVG Curve Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              const [sx] = getSvgPoint(e.clientX, e.clientY);
              setCurrentTime(xToTime(sx));
            }
          }}
          className="w-full h-full block cursor-crosshair"
        >
          {/* Horizontal Value/Speed Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((norm) => {
            const y = padT + norm * plotH;
            const labelVal =
              graphEditorMode === 'speed'
                ? Math.round((1 - norm) * maxSpeed * 1.15)
                : Math.round(minVal + (1 - norm) * (maxVal - minVal));
            return (
              <g key={norm}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="#26262f"
                  strokeWidth={1}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#787885"
                  fontSize="9"
                  fontFamily="JetBrains Mono"
                >
                  {labelVal}
                </text>
              </g>
            );
          })}

          {/* Vertical Second Grid Lines */}
          {Array.from({ length: Math.ceil(comp.duration) + 1 }, (_, s) => s).map((sec) => {
            const x = timeToX(sec);
            return (
              <g key={sec}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={height - padB}
                  stroke="#26262f"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                  fill="#787885"
                  fontSize="9"
                  fontFamily="JetBrains Mono"
                >
                  {sec}s
                </text>
              </g>
            );
          })}

          {/* Plot Curves */}
          {graphEditorMode === 'speed' ? (
            <polyline
              fill="none"
              stroke="#00d1b2"
              strokeWidth={2}
              points={samples.map((s) => `${timeToX(s.t)},${valToY(s.speed)}`).join(' ')}
            />
          ) : (
            <>
              <polyline
                fill="none"
                stroke={isVec2 ? '#f43f5e' : '#6c5ce7'}
                strokeWidth={2.2}
                points={samples.map((s) => `${timeToX(s.t)},${valToY(s.v0)}`).join(' ')}
              />
              {isVec2 && (
                <polyline
                  fill="none"
                  stroke="#00d1b2"
                  strokeWidth={2.2}
                  points={samples
                    .map((s) => `${timeToX(s.t)},${valToY(s.v1 ?? 0)}`)
                    .join(' ')}
                />
              )}
            </>
          )}

          {/* Keyframe Nodes & Interactive Bezier Handles (in Value Mode) */}
          {graphEditorMode === 'value' &&
            prop.keyframes.map((kf, idx) => {
              const kx = timeToX(kf.time);
              const scalar =
                typeof kf.value === 'number'
                  ? kf.value
                  : Array.isArray(kf.value)
                  ? kf.value[0]
                  : 0;
              const ky = valToY(scalar);
              const isSelected = selectedKeyframes.some((s) => s.keyframeId === kf.id);

              const nextKf = prop.keyframes[idx + 1];
              const prevKf = prop.keyframes[idx - 1];
              const outSpanPx = nextKf ? Math.max(40, timeToX(nextKf.time) - kx) : 90;
              const inSpanPx = prevKf ? Math.max(40, kx - timeToX(prevKf.time)) : 90;

              const outHandleX = kx + (kf.outTangent?.x ?? 0.33) * outSpanPx;
              const outHandleY = ky - (kf.outTangent?.y ?? 0) * (plotH * 0.5);

              const inHandleX = kx - (kf.inTangent?.x ?? 0.33) * inSpanPx;
              const inHandleY = ky - (kf.inTangent?.y ?? 0) * (plotH * 0.5);

              return (
                <g key={kf.id}>
                  {/* Outgoing Bezier Handle */}
                  {kf.interpolation === 'bezier' && nextKf && (
                    <>
                      <line
                        x1={kx}
                        y1={ky}
                        x2={outHandleX}
                        y2={outHandleY}
                        stroke="#f59e0b"
                        strokeWidth={1.2}
                      />
                      <circle
                        cx={outHandleX}
                        cy={outHandleY}
                        r={4.5}
                        fill="#f59e0b"
                        className="cursor-pointer"
                        onMouseDown={(e) => handleTangentDrag(e, kf, 'out', outSpanPx)}
                      />
                    </>
                  )}

                  {/* Incoming Bezier Handle */}
                  {kf.interpolation === 'bezier' && prevKf && (
                    <>
                      <line
                        x1={kx}
                        y1={ky}
                        x2={inHandleX}
                        y2={inHandleY}
                        stroke="#f59e0b"
                        strokeWidth={1.2}
                      />
                      <circle
                        cx={inHandleX}
                        cy={inHandleY}
                        r={4.5}
                        fill="#f59e0b"
                        className="cursor-pointer"
                        onMouseDown={(e) => handleTangentDrag(e, kf, 'in', inSpanPx)}
                      />
                    </>
                  )}

                  {/* Keyframe Diamond */}
                  <rect
                    x={kx - 5}
                    y={ky - 5}
                    width={10}
                    height={10}
                    fill={isSelected ? '#f59e0b' : '#ffffff'}
                    stroke="#6c5ce7"
                    strokeWidth={2}
                    transform={`rotate(45 ${kx} ${ky})`}
                    className="cursor-move"
                    onMouseDown={(e) => handleKeyframeDrag(e, kf)}
                  />
                </g>
              );
            })}

          {/* Current Time Playhead Line */}
          <line
            x1={timeToX(currentTime)}
            y1={0}
            x2={timeToX(currentTime)}
            y2={height}
            stroke="#6c5ce7"
            strokeWidth={1.8}
          />
        </svg>
      </div>
    </div>
  );
};
