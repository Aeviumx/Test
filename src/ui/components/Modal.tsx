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
        className={`w-full ${widthClass} bg-[#232327] border border-[#383842] rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150`}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-[#1d1d21] border-b border-[#2e2e33]">
          <div>
            <h2 className="text-[13px] font-semibold text-white">{title}</h2>
            {subtitle && <p className="text-[11px] text-[#9b9ba6] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#9b9ba6] hover:text-white hover:bg-[#2e2e33] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};
