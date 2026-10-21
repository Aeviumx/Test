import React from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Modal } from '../components/Modal';

const SHORTCUT_GROUPS = [
  {
    title: 'Tools & Viewport',
    items: [
      { key: 'V', desc: 'Selection Tool' },
      { key: 'H', desc: 'Hand / Pan Tool (or Space+Drag)' },
      { key: 'Z', desc: 'Zoom Tool (Alt+Click zoom out)' },
      { key: 'W', desc: 'Rotation Tool' },
      { key: 'Y', desc: 'Pan Behind (Anchor Point)' },
      { key: 'Q', desc: 'Shape Tool (cycle shapes)' },
      { key: 'G', desc: 'Pen / Bezier Tool' },
      { key: 'Shift + T', desc: 'Text Tool' },
      { key: 'Shift + /', desc: 'Fit Viewport to Composition' },
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
      { key: 'Space', desc: 'Play / Pause Preview' },
      { key: 'PageUp / PageDn', desc: 'Step 1 frame backward / forward' },
      { key: 'Home / End', desc: 'Jump to Work Area start / end' },
      { key: 'B / N', desc: 'Set Work Area start / end' },
      { key: '[ / ]', desc: 'Align layer In / Out to playhead' },
      { key: 'Alt + [ / ]', desc: 'Trim layer In / Out to playhead' },
      { key: 'Ctrl + D', desc: 'Duplicate selected layer' },
      { key: 'Ctrl + Shift + D', desc: 'Split layer at playhead' },
      { key: 'Ctrl + Shift + C', desc: 'Pre-compose selected layers' },
      { key: 'Ctrl + S', desc: 'Save Project (.mfproj)' },
      { key: 'Ctrl + O', desc: 'Open Project' },
      { key: 'Ctrl + I', desc: 'Import Media' },
      { key: 'Ctrl + Alt + N', desc: 'New Composition' },
      { key: 'Ctrl + M', desc: 'Export / Render Queue' },
      { key: 'Ctrl + Z / Shift+Z', desc: 'Undo / Redo (Immer History)' },
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
      widthClass="max-w-4xl"
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
