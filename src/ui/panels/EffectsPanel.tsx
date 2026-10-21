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
    <div className="h-full flex flex-col bg-[#232327] select-none">
      {/* Search Bar */}
      <div className="p-2 border-b border-[#2e2e33]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#787885] absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search 16 WebGL2 shaders & presets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-6 pl-7 pr-2 bg-[#161619] border border-[#2e2e33] focus:border-[#6c5ce7] rounded text-[11px] text-white outline-none"
          />
        </div>
      </div>

      {!selectedLayerId && (
        <div className="mx-2 mt-2 px-2.5 py-1.5 rounded bg-[#f59e0b]/15 border border-[#f59e0b]/40 text-[11px] text-[#fde68a]">
          Select a layer first to apply GPU effects or animation presets.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Motion Presets Section */}
        <div>
          <div className="px-1.5 py-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#00d1b2]">
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
                className="w-full p-2 rounded bg-[#1a1a1d] hover:bg-[#2a2a34] border border-[#2e2e33] text-left flex items-center justify-between disabled:opacity-40 transition-colors"
              >
                <div>
                  <div className="text-[11px] font-semibold text-white">{preset.name}</div>
                  <div className="text-[10px] text-[#8c8c98]">{preset.desc}</div>
                </div>
                <Plus className="w-3.5 h-3.5 text-[#00d1b2] shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* GPU Shader Effects Categories */}
        {categories.map((cat) => (
          <div key={cat}>
            <div className="px-1.5 py-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6c5ce7]">
              <Sparkles className="w-3 h-3" />
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
                    className="w-full p-2 rounded bg-[#1a1a1d] hover:bg-[#2a2a34] border border-[#2e2e33] hover:border-[#6c5ce7]/50 text-left flex items-center justify-between disabled:opacity-40 transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-[11px] font-medium text-white">{fx.name}</div>
                      <div className="text-[10px] text-[#787885] truncate">{fx.description}</div>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-[#6c5ce7] shrink-0" />
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
