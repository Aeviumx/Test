import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  dividerAbove?: boolean;
  onClick: () => void;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const clampedX = Math.min(x, window.innerWidth - 220);
  const clampedY = Math.min(y, window.innerHeight - items.length * 28 - 20);

  return (
    <div
      ref={menuRef}
      style={{ left: clampedX, top: clampedY }}
      className="fixed z-[100] min-w-[205px] py-1 bg-[var(--bg-elevated)]/95 backdrop-blur-md border border-[var(--border)] rounded-md shadow-[0_12px_32px_rgba(0,0,0,0.6)] select-none"
    >
      {items.map((item) => (
        <React.Fragment key={item.id}>
          {item.dividerAbove && <div className="my-1 border-t border-[var(--border)]" />}
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-[11px] transition-colors duration-150 ${
              item.disabled
                ? 'opacity-35 cursor-not-allowed text-[var(--text-muted)]'
                : item.danger
                ? 'text-[var(--danger)] hover:bg-[var(--danger)]/15'
                : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]'
            }`}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="ml-4 font-mono text-[10px] text-[var(--text-muted)]">{item.shortcut}</span>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};
