import React, { useEffect, useRef, useState } from 'react';

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}

const SWATCH_PRESETS = [
  '#8cc4ec', // Ice (Accent)
  '#b0d9f7', // Accent Hover
  '#4f86b5', // Accent Deep
  '#3b4658', // Denim
  '#55647c', // Denim Light
  '#5a6a80', // Steel
  '#8796ab', // Steel Light
  '#f0d4d8', // Blush
  '#e2727f', // Danger
  '#e8c27a', // Warning
  '#7fd1b9', // Success
  '#e9edf3', // Pale Skin / Text Primary
];

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, label }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const safeHex = value?.startsWith('#') ? value.slice(0, 7) : '#8cc4ec';

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
      {label && <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 h-6 px-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded transition-colors duration-150"
      >
        <span
          className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0"
          style={{ backgroundColor: safeHex }}
        />
        <span className="font-mono text-[11px] text-[var(--text-primary)] uppercase">{safeHex}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-50 w-48 p-2.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
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
              className="flex-1 h-7 px-2 bg-[var(--bg-base)] border border-[var(--border)] rounded font-mono text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
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
