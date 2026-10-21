import React, { useState } from 'react';
import { Plus, Search, Sparkles, Wand2 } from 'lucide-react';
import { createKeyframe, EFFECT_CATALOG } from '../../core/defaults';
import { useProjectStore } from '../../store/useProjectStore';
import { EffectType, Vec2 } from '../../types';

export const EffectsPanel: React.FC = () => {
  const selectedLayerIds = useProjectStore((s) => s.selectedLayerIds);
  const addEffectToLayer = useProjectStore((s) => s.addEffectToLayer);
  const setRightTab = useProjectStore((s) => s.setRightTab);
  const commitCommand = useProjectStore((s) => s.commitCommand);
  const currentTime = useProjectStore((s) => s.currentTime);

  const [query, setQuery] = useState('');

  const selectedLayerId = selectedLayerIds[0] ?? null;

  const filteredEffects = EFFECT_CATALOG.filter(
    (fx) =>
      fx.name.toLowerCase().includes(query.toLowerCase()) ||
      fx.category.toLowerCase().includes(query.toLowerCase()) ||
      fx.description.toLowerCase().includes(query.toLowerCase())
  );

  const categories = Array.from(new Set(filteredEffects.map((f) => f.category)));

  const handleApplyEffect = (type: EffectType) => {
    if (!selectedLayerId) return;
    addEffectToLayer(selectedLayerId, type);
    setRightTab('properties');
  };

  const applyAnimationPreset = (presetId: string) => {
    if (!selectedLayerId) return;
    commitCommand(`Apply Preset: ${presetId}`, (draft) => {
      const comp = draft.compositions.find((c) => c.id === draft.activeCompId);
      const layer = comp?.layers.find((l) => l.id === selectedLayerId);
      if (!comp || !layer) return;

      if (presetId === 'pop-scale') {
        layer.transform.scale.animated = true;
        layer.transform.scale.keyframes = [
          createKeyframe<Vec2>(currentTime, [0, 0], 'bezier'),
          createKeyframe<Vec2>(currentTime + 0.35, [115, 115], 'bezier'),
          createKeyframe<Vec2>(currentTime + 0.55, [100, 100], 'bezier'),
        ];
      } else if (presetId === 'wiggle-float') {
        layer.transform.position.expression = 'wiggle(1.6, 35)';
        layer.transform.position.expressionEnabled = true;
      } else if (presetId === 'spin-loop') {
        layer.transform.rotation.expression = 'time * 90';
        layer.transform.rotation.expressionEnabled = true;
      }
    });
    setRightTab('properties');
  };

  return (
    <div className="h-full flex flex-col bg-[var(--bg-panel)] select-none">
      {/* Search Bar */}
      <div className="px-2 py-1.5 border-b border-[var(--border)] shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--steel)] absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search 16 WebGL2 shaders & presets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-[24px] pl-7 pr-2 bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--accent)] rounded text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150"
          />
        </div>
      </div>

      {!selectedLayerId && (
        <div className="mx-2 mt-2 px-2.5 py-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--warning)]/30 flex items-start gap-2 text-[11px] text-[var(--warning)] shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-[var(--warning)] shrink-0 mt-0.5" />
          <span className="leading-snug">Select a layer in the Timeline to apply GPU effects or motion presets.</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Motion Presets Section */}
        <div>
          <div className="px-1.5 py-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
            <Wand2 className="w-3 h-3" />
            <span>One-Click Motion Presets</span>
          </div>
          <div className="space-y-1 mt-1">
            {[
              {
                id: 'pop-scale',
                name: 'Elastic Pop-In Scale',
                desc: '3-keyframe overshoot entrance at playhead',
              },
              {
                id: 'wiggle-float',
                name: 'Organic Wiggle Float',
                desc: 'Applies wiggle(1.6, 35) expression to Position',
              },
              {
                id: 'spin-loop',
                name: 'Continuous Spin (90°/s)',
                desc: 'Applies time * 90 expression to Rotation',
              },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={!selectedLayerId}
                onClick={() => applyAnimationPreset(preset.id)}
                title={`Apply ${preset.name} preset to selected layer`}
                className="w-full p-2 rounded bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] hover:border-[var(--border-strong)] text-left flex items-center justify-between disabled:opacity-35 transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed"
              >
                <div>
                  <div className="text-[11px] font-semibold text-[var(--text-primary)]">{preset.name}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{preset.desc}</div>
                </div>
                <Plus className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* GPU Shader Effects Categories */}
        {categories.map((cat) => (
          <div key={cat}>
            <div className="px-1.5 py-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              <Sparkles className="w-3 h-3 text-[var(--accent)]" />
              <span>{cat}</span>
            </div>
            <div className="space-y-1 mt-1">
              {filteredEffects
                .filter((f) => f.category === cat)
                .map((fx) => (
                  <button
                    key={fx.type}
                    type="button"
                    disabled={!selectedLayerId}
                    onClick={() => handleApplyEffect(fx.type)}
                    title={`Apply ${fx.name} effect to selected layer`}
                    className="w-full p-2 rounded bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] hover:border-[var(--accent)]/60 text-left flex items-center justify-between disabled:opacity-35 transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-[11px] font-medium text-[var(--text-primary)]">{fx.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">{fx.description}</div>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
