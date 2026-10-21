import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { ColorPicker } from '../components/ColorPicker';
import { Modal } from '../components/Modal';
import { ScrubbyInput } from '../components/ScrubbyInput';

const COMP_PRESETS = [
  { id: '1080p', label: 'HDTV 1080p (16:9)', width: 1920, height: 1080, fps: 30 },
  { id: '4k', label: 'UHD 4K (16:9)', width: 3840, height: 2160, fps: 30 },
  { id: 'reels', label: 'Reels / Shorts / TikTok (9:16)', width: 1080, height: 1920, fps: 30 },
  { id: 'square', label: 'Instagram Square (1:1)', width: 1080, height: 1080, fps: 30 },
  { id: '720p', label: 'HD 720p Web (16:9)', width: 1280, height: 720, fps: 30 },
];

export const CompSettingsModal: React.FC<{ mode: 'new' | 'edit' }> = ({ mode }) => {
  const activeComp = useProjectStore((s) => s.getActiveComp());
  const createComposition = useProjectStore((s) => s.createComposition);
  const updateActiveComposition = useProjectStore((s) => s.updateActiveComposition);
  const setActiveModal = useProjectStore((s) => s.setActiveModal);
  const compCount = useProjectStore((s) => s.project.compositions.length);

  const [name, setName] = useState(
    mode === 'new' ? `Comp ${compCount + 1}` : activeComp.name
  );
  const [width, setWidth] = useState(mode === 'new' ? 1920 : activeComp.width);
  const [height, setHeight] = useState(mode === 'new' ? 1080 : activeComp.height);
  const [fps, setFps] = useState(mode === 'new' ? 30 : activeComp.fps);
  const [duration, setDuration] = useState(mode === 'new' ? 6 : activeComp.duration);
  const [backgroundColor, setBackgroundColor] = useState(
    mode === 'new' ? '#0b0b10' : activeComp.backgroundColor
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'new') {
      createComposition({
        name: name.trim() || 'Comp',
        width: Math.max(64, Math.round(width)),
        height: Math.max(64, Math.round(height)),
        fps,
        duration: Math.max(0.5, duration),
        backgroundColor,
      });
    } else {
      updateActiveComposition({
        name: name.trim() || activeComp.name,
        width: Math.max(64, Math.round(width)),
        height: Math.max(64, Math.round(height)),
        fps,
        duration: Math.max(0.5, duration),
        backgroundColor,
      });
    }
    setActiveModal('none');
  };

  return (
    <Modal
      title={mode === 'new' ? 'New Composition' : 'Composition Settings'}
      subtitle="Configure resolution, frame rate, duration, and background"
      onClose={() => setActiveModal('none')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] text-[#9b9ba6] mb-1">Composition Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-8 px-2.5 bg-[#161619] border border-[#2e2e33] focus:border-[#6c5ce7] rounded text-white text-[12px] outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] text-[#9b9ba6] mb-1">Preset</label>
          <div className="grid grid-cols-2 gap-1.5">
            {COMP_PRESETS.map((preset) => {
              const active = width === preset.width && height === preset.height;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setWidth(preset.width);
                    setHeight(preset.height);
                    setFps(preset.fps);
                  }}
                  className={`px-2.5 py-1.5 rounded text-left text-[11px] border transition-colors ${
                    active
                      ? 'bg-[#6c5ce7]/20 border-[#6c5ce7] text-white'
                      : 'bg-[#1a1a1d] border-[#2e2e33] text-[#9b9ba6] hover:text-white'
                  }`}
                >
                  <div className="font-medium">{preset.label}</div>
                  <div className="font-mono text-[10px] opacity-75">
                    {preset.width} × {preset.height} px
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between bg-[#1a1a1d] px-3 py-2 rounded border border-[#2e2e33]">
            <span className="text-[11px] text-[#9b9ba6]">Width</span>
            <ScrubbyInput
              value={width}
              onChange={setWidth}
              min={64}
              max={7680}
              step={10}
              unit=" px"
              className="w-24"
            />
          </div>
          <div className="flex items-center justify-between bg-[#1a1a1d] px-3 py-2 rounded border border-[#2e2e33]">
            <span className="text-[11px] text-[#9b9ba6]">Height</span>
            <ScrubbyInput
              value={height}
              onChange={setHeight}
              min={64}
              max={7680}
              step={10}
              unit=" px"
              className="w-24"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#1a1a1d] px-3 py-2 rounded border border-[#2e2e33]">
            <span className="block text-[10px] text-[#9b9ba6] mb-1">Frame Rate (FPS)</span>
            <div className="flex gap-1">
              {[24, 25, 30, 60].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setFps(rate)}
                  className={`flex-1 h-6 rounded font-mono text-[11px] transition-colors ${
                    fps === rate
                      ? 'bg-[#6c5ce7] text-white'
                      : 'bg-[#232327] text-[#9b9ba6] hover:text-white'
                  }`}
                >
                  {rate}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#1a1a1d] px-3 py-2 rounded border border-[#2e2e33] flex flex-col justify-between">
            <span className="block text-[10px] text-[#9b9ba6] mb-1">Duration (sec)</span>
            <ScrubbyInput
              value={duration}
              onChange={setDuration}
              min={0.5}
              max={600}
              step={0.5}
              unit=" s"
              className="w-full"
            />
          </div>

          <div className="bg-[#1a1a1d] px-3 py-2 rounded border border-[#2e2e33] flex flex-col justify-between">
            <span className="block text-[10px] text-[#9b9ba6] mb-1">Background</span>
            <ColorPicker value={backgroundColor} onChange={setBackgroundColor} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#2e2e33]">
          <button
            type="button"
            onClick={() => setActiveModal('none')}
            className="px-3.5 py-1.5 rounded bg-[#2a2a30] hover:bg-[#34343c] text-[12px] text-[#d4d4dc]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded bg-[#6c5ce7] hover:bg-[#5b4bc4] text-[12px] font-medium text-white"
          >
            {mode === 'new' ? 'Create Composition' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
