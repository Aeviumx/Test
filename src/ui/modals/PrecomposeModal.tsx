import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Modal } from '../components/Modal';

export const PrecomposeModal: React.FC = () => {
  const selectedCount = useProjectStore((s) => s.selectedLayerIds.length);
  const precomposeSelectedLayers = useProjectStore((s) => s.precomposeSelectedLayers);
  const setActiveModal = useProjectStore((s) => s.setActiveModal);
  const compCount = useProjectStore((s) => s.project.compositions.length);

  const [compName, setCompName] = useState(`Pre-comp ${compCount + 1}`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    precomposeSelectedLayers(compName.trim() || `Pre-comp ${compCount + 1}`);
  };

  return (
    <Modal
      title="Pre-compose Layers"
      subtitle={`Group ${selectedCount} selected layer(s) into a nested composition`}
      onClose={() => setActiveModal('none')}
      widthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">New Composition Name</label>
          <input
            type="text"
            value={compName}
            onChange={(e) => setCompName(e.target.value)}
            autoFocus
            className="w-full h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--accent)] rounded text-[var(--text-primary)] text-[12px] outline-none"
          />
        </div>
        <div className="p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border)] text-[11px] text-[var(--text-secondary)]">
          Moves all selected layer attributes, keyframes, masks, and GPU effects into the new composition and replaces them with a single Pre-comp layer.
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={() => setActiveModal('none')}
            className="px-3 py-1.5 rounded bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[12px] font-semibold text-[#0b0d11] shadow-[0_0_12px_var(--accent-glow)] transition-all duration-150"
          >
            Pre-compose
          </button>
        </div>
      </form>
    </Modal>
  );
};
