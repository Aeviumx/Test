import React, { useEffect, useRef, useState } from 'react';

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}

const SWATCH_PRESETS = [
  '#6c5ce7',
  '#00d1b2',
  '#ff4757',
  '#ffa502',
  '#2ed573',
  '#1e90ff',
  '#eccc68',
  '#ff6b81',
  '#ffffff',
  '#a4b0be',
  '#2f3542',
  '#0b0b10',
];

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, label }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const safeHex = value?.startsWith('#') ? value.slice(0, 7) : '#6c5ce7';

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1.5">
      {label && <span className="text-[11px] text-[#9b9ba6]">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 h-6 px-1.5 bg-[#1a1a1d] hover:bg-[#2a2a32] border border-[#2e2e33] rounded transition-colors"
      >
        <span
          className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0"
          style={{ backgroundColor: safeHex }}
        />
        <span className="font-mono text-[11px] text-[#d4d4dc] uppercase">{safeHex}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-50 w-48 p-2.5 bg-[#232327] border border-[#3a3a42] rounded-md shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="color"
              value={safeHex}
              onChange={(e) => onChange(e.target.value)}
              className="w-8 h-7 bg-transparent border-0 cursor-pointer p-0"
            />
            <input
              type="text"
              value={safeHex}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                  onChange(v);
                }
              }}
              className="flex-1 h-7 px-2 bg-[#161619] border border-[#2e2e33] rounded font-mono text-[11px] text-white outline-none focus:border-[#6c5ce7]"
            />
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {SWATCH_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  onChange(preset);
                  setOpen(false);
                }}
                className="w-6 h-5 rounded border border-white/15 hover:scale-110 transition-transform"
                style={{ backgroundColor: preset }}
                title={preset}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
