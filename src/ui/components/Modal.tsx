import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  widthClass?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  title,
  subtitle,
  onClose,
  widthClass = 'max-w-lg',
  children,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${widthClass} bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.6)] overflow-hidden animate-in fade-in zoom-in-95 duration-150`}
      >
        <div className="flex items-center justify-between px-4 py-3 gloss-glasses border-b border-[var(--border)]">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h2>
            {subtitle && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--steel)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};
