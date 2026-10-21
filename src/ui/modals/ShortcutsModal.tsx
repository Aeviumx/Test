import React from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Modal } from '../components/Modal';

const SHORTCUT_GROUPS = [
  {
    title: 'Tools & Viewport',
    items: [
      { key: 'V', desc: 'Selection Tool' },
      { key: 'H', desc: 'Hand / Pan Tool (or Space+Drag)' },
      { key: 'Z', desc: 'Zoom Tool (Alt+Click to zoom out)' },
      { key: 'W', desc: 'Rotation Tool' },
      { key: 'Y', desc: 'Pan Behind / Anchor Point Tool' },
      { key: 'Q', desc: 'Shape Tool (cycle Rect / Ellipse / Poly / Star)' },
      { key: 'G', desc: 'Pen / Bezier Tool' },
      { key: 'Shift + T', desc: 'Text Tool' },
    ],
  },
  {
    title: 'Layer Properties & Keyframes',
    items: [
      { key: 'P / S / R / T / A', desc: 'Show Position / Scale / Rotation / Opacity / Anchor' },
      { key: 'U', desc: 'Toggle solo animated/keyframed properties' },
      { key: 'F9', desc: 'Easy Ease selected keyframes' },
      { key: 'Shift + F9', desc: 'Ease In selected keyframes' },
      { key: 'Ctrl + Shift + F9', desc: 'Ease Out selected keyframes' },
      { key: 'J / K', desc: 'Jump to Previous / Next visible keyframe' },
      { key: 'Ctrl + C / Ctrl + V', desc: 'Copy / Paste keyframes at playhead' },
    ],
  },
  {
    title: 'Timeline & Layer Editing',
    items: [
      { key: 'Space', desc: 'Play / Pause real-time preview' },
      { key: 'PageUp / PageDown', desc: 'Step 1 frame backward / forward' },
      { key: 'Home / End', desc: 'Jump to Work Area start / end' },
      { key: 'B / N', desc: 'Set Work Area start / end to playhead' },
      { key: '[ / ]', desc: 'Align layer In / Out point to playhead' },
      { key: 'Alt + [ / Alt + ]', desc: 'Trim layer In / Out point to playhead' },
      { key: 'Ctrl + D', desc: 'Duplicate selected layer(s)' },
      { key: 'Ctrl + Shift + D', desc: 'Split selected layer(s) at playhead' },
      { key: 'Ctrl + Shift + C', desc: 'Pre-compose selected layer(s)' },
      { key: 'Ctrl + Z / Ctrl + Shift + Z', desc: 'Undo / Redo (Immer patch history)' },
    ],
  },
];

export const ShortcutsModal: React.FC = () => {
  const setActiveModal = useProjectStore((s) => s.setActiveModal);

  return (
    <Modal
      title="Keyboard Shortcuts Reference"
      subtitle="Adobe After Effects compatible workflow hotkeys"
      onClose={() => setActiveModal('none')}
      widthClass="max-w-3xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
        {SHORTCUT_GROUPS.map((group) => (
          <div
            key={group.title}
            className="bg-[#1a1a1d] border border-[#2e2e33] rounded-md p-3 space-y-2"
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#00d1b2] pb-1 border-b border-[#2e2e33]">
              {group.title}
            </h3>
            <div className="space-y-1.5">
              {group.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[#b8b8c4]">{item.desc}</span>
                  <kbd className="px-1.5 py-0.5 bg-[#26262c] border border-[#3a3a44] rounded font-mono text-[10px] text-[#e4e4e8] shrink-0">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};
