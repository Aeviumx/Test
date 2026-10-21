import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock,
  Code2,
  Diamond,
  Eye,
  Link2,
  Link2Off,
  Plus,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { evaluatePropertyWithDiagnostics } from '../../engine/evaluator';
import { useProjectStore } from '../../store/useProjectStore';
import {
  BlendMode,
  LabelColor,
  MaskMode,
  Property,
  ShapeGeometryType,
  TrackMatteType,
  Vec2,
} from '../../types';
import { LABEL_COLOR_MAP } from '../../utils/color';
import { snapToFrame } from '../../utils/timecode';
import { ColorPicker } from '../components/ColorPicker';
import { ScrubbyInput } from '../components/ScrubbyInput';

const GOOGLE_FONTS = [
  'Inter',
  'Orbitron',
  'Montserrat',
  'Space Grotesk',
  'Playfair Display',
  'JetBrains Mono',
];

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'add', label: 'Add (Linear Dodge)' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'difference', label: 'Difference' },
  { value: 'color-dodge', label: 'Color Dodge' },
];

export const PropertiesPanel: React.FC = () => {
  const comp = useProjectStore((s) => s.getActiveComp());
  const currentTime = useProjectStore((s) => s.currentTime);
  const selectedLayerIds = useProjectStore((s) => s.selectedLayerIds);

  const updateLayerMeta = useProjectStore((s) => s.updateLayerMeta);
  const setPropertyValue = useProjectStore((s) => s.setPropertyValue);
  const togglePropertyStopwatch = useProjectStore((s) => s.togglePropertyStopwatch);
  const toggleKeyframeAtTime = useProjectStore((s) => s.toggleKeyframeAtTime);
  const setPropertyExpression = useProjectStore((s) => s.setPropertyExpression);
  const updateTextSource = useProjectStore((s) => s.updateTextSource);
  const toggleTextAnimator = useProjectStore((s) => s.toggleTextAnimator);
  const addMaskToLayer = useProjectStore((s) => s.addMaskToLayer);
  const updateLayerMask = useProjectStore((s) => s.updateLayerMask);
  const removeLayerMask = useProjectStore((s) => s.removeLayerMask);
  const removeEffectFromLayer = useProjectStore((s) => s.removeEffectFromLayer);
  const toggleEffectEnabled = useProjectStore((s) => s.toggleEffectEnabled);
  const reorderLayerEffect = useProjectStore((s) => s.reorderLayerEffect);
  const setRightTab = useProjectStore((s) => s.setRightTab);
  const setInspectedPropertyPath = useProjectStore((s) => s.setInspectedPropertyPath);

  const [openExprPaths, setOpenExprPaths] = useState<Record<string, boolean>>({});

  const layer = comp.layers.find((l) => l.id === selectedLayerIds[0]) ?? null;
  const layerIndex = layer ? comp.layers.indexOf(layer) : 0;

  if (!layer) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-[#232327] text-[#8c8c98] select-none">
        <Sliders className="w-8 h-8 text-[#6c5ce7] mb-2 opacity-60" />
        <div className="text-[12px] font-medium text-[#d4d4dc]">No Layer Selected</div>
        <p className="text-[11px] text-[#787885] mt-1 max-w-[210px]">
          Select any layer in the Timeline or Viewport to inspect its Transform, Masks, Text Animator, and GPU Effect Controls.
        </p>
      </div>
    );
  }

  const snappedNow = snapToFrame(currentTime, comp.fps);

  const renderAnimatableRow = (
    prop: Property<number | Vec2 | string>,
    path: string,
    customLabel?: string,
    options?: { isColor?: boolean; constrainLink?: boolean; onToggleConstrain?: () => void }
  ) => {
    const diag = evaluatePropertyWithDiagnostics(prop, currentTime, comp, layer, layerIndex);
    const val = diag.value;
    const exprError = diag.error;
    const hasKfNow =
      prop.animated && prop.keyframes.some((k) => Math.abs(k.time - snappedNow) < 0.001);
    const exprOpen = openExprPaths[path] || prop.expressionEnabled;

    return (
      <div
        key={path}
        onClick={() => setInspectedPropertyPath(path)}
        className="py-1 px-2 rounded hover:bg-[#2a2a32]/70 transition-colors"
      >
        <div className="flex items-center justify-between gap-1.5">
          {/* Left: Stopwatch, Keyframe Diamond, Expression Toggle, Label */}
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePropertyStopwatch(layer.id, path);
              }}
              title="Toggle Animation Stopwatch (creates/clears keyframes)"
              className={`p-0.5 rounded transition-colors ${
                prop.animated
                  ? 'text-[#00d1b2] bg-[#00d1b2]/15'
                  : 'text-[#686873] hover:text-[#d4d4dc]'
              }`}
            >
              <Clock className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleKeyframeAtTime(layer.id, path);
              }}
              title="Add or Remove Keyframe at Current Time"
              className={`p-0.5 rounded transition-colors ${
                hasKfNow
                  ? 'text-[#6c5ce7]'
                  : prop.animated
                  ? 'text-[#9b9ba6] hover:text-white'
                  : 'text-[#454550] hover:text-[#9b9ba6]'
              }`}
            >
              <Diamond className={`w-2.5 h-2.5 ${hasKfNow ? 'fill-[#6c5ce7]' : ''}`} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextOpen = !exprOpen;
                setOpenExprPaths((prev) => ({ ...prev, [path]: nextOpen }));
                if (!prop.expressionEnabled && nextOpen && !prop.expression) {
                  setPropertyExpression(layer.id, path, 'value', true);
                }
              }}
              title="Toggle JS Expression"
              className={`p-0.5 rounded transition-colors ${
                prop.expressionEnabled
                  ? exprError
                    ? 'text-[#f59e0b] bg-[#f59e0b]/20'
                    : 'text-[#00d1b2] bg-[#00d1b2]/15'
                  : 'text-[#686873] hover:text-[#d4d4dc]'
              }`}
            >
              <Code2 className="w-3 h-3" />
            </button>

            <span className="text-[11px] text-[#d4d4dc] truncate ml-0.5">
              {customLabel ?? prop.name}
            </span>
          </div>

          {/* Right: Value Scrubby Inputs or Color Picker */}
          <div className="flex items-center gap-1 shrink-0">
            {options?.onToggleConstrain && (
              <button
                type="button"
                onClick={options.onToggleConstrain}
                title="Constrain Scale Proportions"
                className={`p-1 rounded ${
                  options.constrainLink ? 'text-[#6c5ce7]' : 'text-[#686873]'
                }`}
              >
                {options.constrainLink ? (
                  <Link2 className="w-3 h-3" />
                ) : (
                  <Link2Off className="w-3 h-3" />
                )}
              </button>
            )}

            {typeof val === 'number' && (
              <ScrubbyInput
                value={val}
                onChange={(v) => setPropertyValue(layer.id, path, v)}
                min={prop.min}
                max={prop.max}
                step={prop.step ?? 1}
                unit={prop.unit ?? ''}
                className="w-20"
              />
            )}

            {Array.isArray(val) && (
              <>
                <ScrubbyInput
                  prefix="X"
                  value={val[0]}
                  onChange={(nx) => {
                    if (options?.constrainLink) {
                      const delta = nx - val[0];
                      setPropertyValue(layer.id, path, [nx, val[1] + delta]);
                    } else {
                      setPropertyValue(layer.id, path, [nx, val[1]]);
                    }
                  }}
                  min={prop.min}
                  max={prop.max}
                  step={prop.step ?? 1}
                  unit={prop.unit ?? ''}
                  className="w-[68px]"
                />
                <ScrubbyInput
                  prefix="Y"
                  value={val[1]}
                  onChange={(ny) => {
                    if (options?.constrainLink) {
                      const delta = ny - val[1];
                      setPropertyValue(layer.id, path, [val[0] + delta, ny]);
                    } else {
                      setPropertyValue(layer.id, path, [val[0], ny]);
                    }
                  }}
                  min={prop.min}
                  max={prop.max}
                  step={prop.step ?? 1}
                  unit={prop.unit ?? ''}
                  className="w-[68px]"
                />
              </>
            )}

            {(options?.isColor || (typeof val === 'string' && val.startsWith('#'))) && (
              <ColorPicker
                value={String(val)}
                onChange={(hex) => setPropertyValue(layer.id, path, hex)}
              />
            )}
          </div>
        </div>

        {/* Expression Editor Box */}
        {exprOpen && (
          <div className="mt-1.5 pl-5 pr-1 space-y-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-mono text-[#00d1b2]">
                Expression (time, value, wiggle, loopOut, ease)
              </span>
              <input
                type="checkbox"
                checked={prop.expressionEnabled}
                onChange={(e) =>
                  setPropertyExpression(layer.id, path, prop.expression, e.target.checked)
                }
                title="Enable/Disable Expression"
                className="accent-[#6c5ce7]"
              />
            </div>
            <input
              type="text"
              value={prop.expression}
              onChange={(e) => setPropertyExpression(layer.id, path, e.target.value, true)}
              placeholder="e.g. wiggle(2, 35) or time * 45"
              className={`w-full h-6 px-2 rounded font-mono text-[11px] bg-[#141418] border outline-none ${
                exprError
                  ? 'border-[#f59e0b] text-[#fde68a] bg-[#f59e0b]/10'
                  : 'border-[#34343e] focus:border-[#00d1b2] text-[#e4e4e8]'
              }`}
            />
            {exprError && (
              <div className="flex items-center gap-1 text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded border border-[#f59e0b]/30">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span className="truncate">{exprError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-[#232327] select-none divide-y divide-[#2e2e33]">
      {/* 1. Layer Identity, Blend Mode, Parenting & Track Matte */}
      <div className="p-2.5 space-y-2 bg-[#1e1e22]">
        <div className="flex items-center gap-2">
          {/* Color Label Picker */}
          <select
            value={layer.labelColor}
            onChange={(e) =>
              updateLayerMeta(layer.id, { labelColor: e.target.value as LabelColor })
            }
            style={{ backgroundColor: LABEL_COLOR_MAP[layer.labelColor].hex }}
            className="w-4 h-4 rounded-sm border border-white/30 text-transparent cursor-pointer outline-none shrink-0"
            title="Layer Color Label"
          >
            {Object.entries(LABEL_COLOR_MAP).map(([key, info]) => (
              <option key={key} value={key} className="bg-[#232327] text-white">
                {info.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={layer.name}
            onChange={(e) => updateLayerMeta(layer.id, { name: e.target.value })}
            className="flex-1 h-6 px-2 bg-[#141418] border border-[#2e2e33] focus:border-[#6c5ce7] rounded text-[12px] font-semibold text-white outline-none"
          />

          <span className="px-1.5 py-0.5 rounded bg-[#2a2a32] font-mono text-[10px] uppercase text-[#00d1b2]">
            {layer.type}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label className="block text-[10px] text-[#8c8c98] mb-0.5">Blend Mode</label>
            <select
              value={layer.blendMode}
              onChange={(e) =>
                updateLayerMeta(layer.id, { blendMode: e.target.value as BlendMode })
              }
              className="w-full h-6 px-1.5 bg-[#161619] border border-[#2e2e33] rounded text-[11px] text-white outline-none"
            >
              {BLEND_MODES.map((bm) => (
                <option key={bm.value} value={bm.value}>
                  {bm.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-[#8c8c98] mb-0.5">Parent & Link (@)</label>
            <select
              value={layer.parentId ?? ''}
              onChange={(e) =>
                updateLayerMeta(layer.id, { parentId: e.target.value || null })
              }
              className="w-full h-6 px-1.5 bg-[#161619] border border-[#2e2e33] rounded text-[11px] text-white outline-none"
            >
              <option value="">None</option>
              {comp.layers
                .filter((l) => l.id !== layer.id && l.type !== 'audio')
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-[#8c8c98] mb-0.5">Track Matte</label>
            <select
              value={layer.trackMatteType}
              onChange={(e) =>
                updateLayerMeta(layer.id, {
                  trackMatteType: e.target.value as TrackMatteType,
                })
              }
              className="w-full h-6 px-1.5 bg-[#161619] border border-[#2e2e33] rounded text-[11px] text-white outline-none"
            >
              <option value="none">No Matte</option>
              <option value="alpha">Alpha Matte</option>
              <option value="alpha-inverted">Alpha Inverted</option>
              <option value="luma">Luma Matte</option>
              <option value="luma-inverted">Luma Inverted</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-[#8c8c98] mb-0.5">Matte Source Layer</label>
            <select
              value={layer.trackMatteLayerId ?? ''}
              disabled={layer.trackMatteType === 'none'}
              onChange={(e) =>
                updateLayerMeta(layer.id, {
                  trackMatteLayerId: e.target.value || null,
                })
              }
              className="w-full h-6 px-1.5 bg-[#161619] border border-[#2e2e33] rounded text-[11px] text-white outline-none disabled:opacity-40"
            >
              <option value="">Layer Above</option>
              {comp.layers
                .filter((l) => l.id !== layer.id)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Transform Section */}
      <div className="p-2">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#9b9ba6] flex items-center justify-between">
          <span>Transform</span>
          <span className="font-mono text-[9px] text-[#686873]">P / S / R / T / A</span>
        </div>
        <div className="space-y-0.5">
          {renderAnimatableRow(layer.transform.anchorPoint, 'transform.anchorPoint')}
          {renderAnimatableRow(layer.transform.position, 'transform.position')}
          {renderAnimatableRow(layer.transform.scale, 'transform.scale', 'Scale', {
            constrainLink: layer.transform.scaleConstrain,
            onToggleConstrain: () =>
              updateLayerMeta(layer.id, {
                transform: {
                  ...layer.transform,
                  scaleConstrain: !layer.transform.scaleConstrain,
                },
              }),
          })}
          {renderAnimatableRow(layer.transform.rotation, 'transform.rotation')}
          {renderAnimatableRow(layer.transform.opacity, 'transform.opacity')}
          {renderAnimatableRow(layer.transform.skew, 'transform.skew')}
        </div>
      </div>

      {/* 3. Solid Color Section */}
      {layer.type === 'solid' && (
        <div className="p-2.5 flex items-center justify-between">
          <span className="text-[11px] text-[#d4d4dc]">Solid Color</span>
          <ColorPicker
            value={layer.solidColor ?? '#2c2c54'}
            onChange={(hex) => updateLayerMeta(layer.id, { solidColor: hex })}
          />
        </div>
      )}

      {/* 4. Shape Contents & Trim Paths Section */}
      {layer.type === 'shape' && layer.shapeContents && (
        <div className="p-2 space-y-1">
          <div className="px-2 py-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#0ea5e9]">
              Shape Contents & Trim Paths
            </span>
            <select
              value={layer.shapeContents.shapeType}
              onChange={(e) =>
                updateLayerMeta(layer.id, {
                  shapeContents: {
                    ...layer.shapeContents!,
                    shapeType: e.target.value as ShapeGeometryType,
                  },
                })
              }
              className="h-5 px-1.5 bg-[#161619] border border-[#2e2e33] rounded text-[10px] text-white outline-none"
            >
              <option value="rectangle">Rectangle</option>
              <option value="ellipse">Ellipse</option>
              <option value="polygon">Polygon</option>
              <option value="star">Star</option>
              <option value="path">Bezier Path</option>
            </select>
          </div>

          {renderAnimatableRow(layer.shapeContents.size, 'shapeContents.size')}
          {layer.shapeContents.shapeType === 'rectangle' &&
            renderAnimatableRow(layer.shapeContents.cornerRadius, 'shapeContents.cornerRadius')}
          {(layer.shapeContents.shapeType === 'polygon' ||
            layer.shapeContents.shapeType === 'star') &&
            renderAnimatableRow(layer.shapeContents.points, 'shapeContents.points')}
          {layer.shapeContents.shapeType === 'star' &&
            renderAnimatableRow(layer.shapeContents.innerRadius, 'shapeContents.innerRadius')}

          <div className="px-2 pt-1 flex items-center justify-between text-[11px]">
            <label className="flex items-center gap-1.5 text-[#9b9ba6]">
              <input
                type="checkbox"
                checked={layer.shapeContents.fillEnabled}
                onChange={(e) =>
                  updateLayerMeta(layer.id, {
                    shapeContents: {
                      ...layer.shapeContents!,
                      fillEnabled: e.target.checked,
                    },
                  })
                }
                className="accent-[#6c5ce7]"
              />
              Enable Fill
            </label>
            <label className="flex items-center gap-1.5 text-[#9b9ba6]">
              <input
                type="checkbox"
                checked={layer.shapeContents.strokeEnabled}
                onChange={(e) =>
                  updateLayerMeta(layer.id, {
                    shapeContents: {
                      ...layer.shapeContents!,
                      strokeEnabled: e.target.checked,
                    },
                  })
                }
                className="accent-[#00d1b2]"
              />
              Enable Stroke
            </label>
          </div>

          {layer.shapeContents.fillEnabled && (
            <>
              {renderAnimatableRow(layer.shapeContents.fillColor, 'shapeContents.fillColor', 'Fill Color', {
                isColor: true,
              })}
              {renderAnimatableRow(layer.shapeContents.fillOpacity, 'shapeContents.fillOpacity')}
            </>
          )}

          {layer.shapeContents.strokeEnabled && (
            <>
              {renderAnimatableRow(layer.shapeContents.strokeColor, 'shapeContents.strokeColor', 'Stroke Color', {
                isColor: true,
              })}
              {renderAnimatableRow(layer.shapeContents.strokeWidth, 'shapeContents.strokeWidth')}
              {renderAnimatableRow(layer.shapeContents.strokeDash, 'shapeContents.strokeDash')}
            </>
          )}

          <div className="pt-1 border-t border-[#2e2e33]/60">
            <div className="px-2 py-0.5 text-[10px] font-semibold text-[#00d1b2]">
              Trim Paths
            </div>
            {renderAnimatableRow(layer.shapeContents.trimStart, 'shapeContents.trimStart')}
            {renderAnimatableRow(layer.shapeContents.trimEnd, 'shapeContents.trimEnd')}
            {renderAnimatableRow(layer.shapeContents.trimOffset, 'shapeContents.trimOffset')}
          </div>
        </div>
      )}

      {/* 5. Text & Text Animator Section */}
      {layer.type === 'text' && layer.textContents && (
        <div className="p-2 space-y-2">
          <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6c5ce7]">
            Character & Typography
          </div>

          <div className="px-2 space-y-1.5">
            <textarea
              rows={2}
              value={layer.textContents.text}
              onChange={(e) => updateTextSource(layer.id, { text: e.target.value })}
              className="w-full p-1.5 bg-[#141418] border border-[#2e2e33] focus:border-[#6c5ce7] rounded text-[12px] text-white outline-none resize-none"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={layer.textContents.fontFamily}
                onChange={(e) => updateTextSource(layer.id, { fontFamily: e.target.value })}
                className="h-6 px-1.5 bg-[#161619] border border-[#2e2e33] rounded text-[11px] text-white outline-none"
              >
                {GOOGLE_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>

              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => updateTextSource(layer.id, { textAlign: align })}
                    className={`flex-1 h-6 rounded text-[10px] uppercase ${
                      layer.textContents?.textAlign === align
                        ? 'bg-[#6c5ce7] text-white'
                        : 'bg-[#1a1a1d] text-[#9b9ba6]'
                    }`}
                  >
                    {align}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-0.5">
            {renderAnimatableRow(layer.textContents.fontSize, 'textContents.fontSize')}
            {renderAnimatableRow(layer.textContents.fillColor, 'textContents.fillColor', 'Fill Color', {
              isColor: true,
            })}
            {renderAnimatableRow(layer.textContents.tracking, 'textContents.tracking')}
            {renderAnimatableRow(layer.textContents.lineHeight, 'textContents.lineHeight')}
          </div>

          {/* Per-character Text Animator */}
          <div className="pt-1.5 border-t border-[#2e2e33]">
            <div className="px-2 py-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#00d1b2]">
                Text Animator (Range Selector)
              </span>
              <input
                type="checkbox"
                checked={layer.textContents.animator.enabled}
                onChange={(e) => toggleTextAnimator(layer.id, e.target.checked)}
                className="accent-[#00d1b2]"
              />
            </div>
            {layer.textContents.animator.enabled && (
              <div className="space-y-0.5">
                {renderAnimatableRow(
                  layer.textContents.animator.rangeStart,
                  'textContents.animator.rangeStart'
                )}
                {renderAnimatableRow(
                  layer.textContents.animator.rangeEnd,
                  'textContents.animator.rangeEnd'
                )}
                {renderAnimatableRow(
                  layer.textContents.animator.rangeOffset,
                  'textContents.animator.rangeOffset'
                )}
                {renderAnimatableRow(
                  layer.textContents.animator.position,
                  'textContents.animator.position'
                )}
                {renderAnimatableRow(
                  layer.textContents.animator.scale,
                  'textContents.animator.scale'
                )}
                {renderAnimatableRow(
                  layer.textContents.animator.rotation,
                  'textContents.animator.rotation'
                )}
                {renderAnimatableRow(
                  layer.textContents.animator.opacity,
                  'textContents.animator.opacity'
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Masks Section */}
      <div className="p-2 space-y-1.5">
        <div className="px-2 py-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#f59e0b]">
            Masks ({layer.masks.length})
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => addMaskToLayer(layer.id, 'rectangle')}
              className="px-1.5 py-0.5 rounded bg-[#2a2a32] hover:bg-[#6c5ce7] text-[10px] text-white flex items-center gap-0.5"
            >
              <Plus className="w-2.5 h-2.5" /> Rect
            </button>
            <button
              type="button"
              onClick={() => addMaskToLayer(layer.id, 'ellipse')}
              className="px-1.5 py-0.5 rounded bg-[#2a2a32] hover:bg-[#6c5ce7] text-[10px] text-white flex items-center gap-0.5"
            >
              <Plus className="w-2.5 h-2.5" /> Ellipse
            </button>
          </div>
        </div>

        {layer.masks.map((mask, idx) => (
          <div
            key={mask.id}
            className="bg-[#1a1a1d] border border-[#2e2e33] rounded p-1.5 space-y-1"
          >
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={mask.enabled}
                  onChange={(e) =>
                    updateLayerMask(layer.id, mask.id, { enabled: e.target.checked })
                  }
                  className="accent-[#f59e0b]"
                />
                <span className="text-[11px] font-medium text-white">{mask.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={mask.mode}
                  onChange={(e) =>
                    updateLayerMask(layer.id, mask.id, { mode: e.target.value as MaskMode })
                  }
                  className="h-5 px-1 bg-[#232327] border border-[#34343e] rounded text-[10px] text-white"
                >
                  <option value="add">Add</option>
                  <option value="subtract">Subtract</option>
                  <option value="intersect">Intersect</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeLayerMask(layer.id, mask.id)}
                  className="p-0.5 text-[#787885] hover:text-[#ef4444]"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            {renderAnimatableRow(mask.feather, `masks.${idx}.feather`, 'Feather')}
            {renderAnimatableRow(mask.opacity, `masks.${idx}.opacity`, 'Opacity')}
            {renderAnimatableRow(mask.expansion, `masks.${idx}.expansion`, 'Expansion')}
          </div>
        ))}
      </div>

      {/* 7. GPU Effect Controls Stack */}
      <div className="p-2 space-y-2">
        <div className="px-2 py-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#00d1b2]">
            GPU Effect Controls ({layer.effects.length})
          </span>
          <button
            type="button"
            onClick={() => setRightTab('effects')}
            className="text-[10px] text-[#6c5ce7] hover:underline flex items-center gap-0.5"
          >
            <Sparkles className="w-3 h-3" /> + Browse Shaders
          </button>
        </div>

        {layer.effects.length === 0 ? (
          <div className="mx-2 p-3 rounded border border-dashed border-[#34343e] text-center text-[11px] text-[#787885]">
            No GPU effects applied. Click{' '}
            <button
              type="button"
              onClick={() => setRightTab('effects')}
              className="text-[#00d1b2] underline"
            >
              Effects & Presets
            </button>{' '}
            to add WebGL2 shaders.
          </div>
        ) : (
          layer.effects.map((fx, fxIdx) => (
            <div
              key={fx.id}
              className="bg-[#1a1a1d] border border-[#2e2e33] rounded-md overflow-hidden"
            >
              <div className="px-2.5 py-1.5 bg-[#161619] border-b border-[#2e2e33] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleEffectEnabled(layer.id, fx.id)}
                    title="Toggle Effect On/Off"
                    className={`px-1 py-0.2 rounded font-mono text-[10px] font-bold border ${
                      fx.enabled
                        ? 'bg-[#00d1b2]/20 border-[#00d1b2] text-[#00d1b2]'
                        : 'bg-[#232327] border-[#383842] text-[#686873]'
                    }`}
                  >
                    fx
                  </button>
                  <span className="text-[11px] font-semibold text-white">{fx.name}</span>
                </div>

                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={fxIdx === 0}
                    onClick={() => reorderLayerEffect(layer.id, fxIdx, fxIdx - 1)}
                    className="p-0.5 text-[#787885] hover:text-white disabled:opacity-25"
                    title="Move Effect Up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={fxIdx === layer.effects.length - 1}
                    onClick={() => reorderLayerEffect(layer.id, fxIdx, fxIdx + 1)}
                    className="p-0.5 text-[#787885] hover:text-white disabled:opacity-25"
                    title="Move Effect Down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeEffectFromLayer(layer.id, fx.id)}
                    className="p-0.5 text-[#787885] hover:text-[#ef4444] ml-1"
                    title="Remove Effect"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="p-1 space-y-0.5">
                {Object.entries(fx.params).map(([paramKey, prop]) =>
                  renderAnimatableRow(prop, `effects.${fxIdx}.params.${paramKey}`)
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
