import React, { useEffect, useRef, useState } from 'react';
import { clamp } from '../../utils/timecode';

export interface ScrubbyInputProps {
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
  disabled?: boolean;
}

export const ScrubbyInput: React.FC<ScrubbyInputProps> = ({
  value,
  onChange,
  min = -100000,
  max = 100000,
  step = 1,
  unit = '',
  prefix,
  decimals = step < 1 ? 2 : 1,
  className = '',
  disabled = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [isScrubbing, setIsScrubbing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startXRef = useRef(0);
  const startValRef = useRef(value);
  const movedRef = useRef(false);

  const safeVal = Number.isFinite(value) ? value : 0;
  const displayStr = Number.isInteger(safeVal)
    ? String(safeVal)
    : safeVal.toFixed(decimals).replace(/\.0+$/, '');

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitDraft = () => {
    setIsEditing(false);
    const cleaned = draftText.replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    if (!Number.isNaN(parsed)) {
      onChange(clamp(parsed, min, max));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled || isEditing || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    startXRef.current = e.clientX;
    startValRef.current = safeVal;
    movedRef.current = false;
    setIsScrubbing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startXRef.current;
      if (Math.abs(dx) > 2) {
        movedRef.current = true;
      }
      if (!movedRef.current) return;

      let mult = 1;
      if (moveEvent.shiftKey) mult = 10;
      else if (moveEvent.altKey) mult = 0.1;

      const rawNext = startValRef.current + dx * step * mult * 0.5;
      const rounded =
        step >= 1 && !moveEvent.altKey
          ? Math.round(rawNext / step) * step
          : Number(rawNext.toFixed(2));
      onChange(clamp(rounded, min, max));
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (!movedRef.current) {
        setDraftText(displayStr);
        setIsEditing(true);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitDraft();
          if (e.key === 'Escape') setIsEditing(false);
        }}
        className={`h-6 px-1.5 bg-[#141418] border border-[#6c5ce7] rounded text-[11px] font-mono text-white outline-none w-16 ${className}`}
      />
    );
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      title="Drag horizontally to scrub (Shift ×10, Alt ×0.1) or click to enter value"
      className={`inline-flex items-center justify-between gap-1 h-6 px-1.5 rounded bg-[#1a1a1d] hover:bg-[#2a2a32] border ${
        isScrubbing ? 'border-[#6c5ce7] bg-[#2a2a36]' : 'border-[#2e2e33]'
      } text-[11px] font-mono select-none transition-colors duration-150 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-ew-resize'
      } ${className}`}
    >
      {prefix && <span className="text-[#787885] text-[10px] font-sans mr-0.5">{prefix}</span>}
      <span className="text-[#6c5ce7] font-medium hover:text-[#8f82f5] truncate">
        {displayStr}
        {unit}
      </span>
    </div>
  );
};
