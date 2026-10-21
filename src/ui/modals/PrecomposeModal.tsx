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
          <label className="block text-[11px] text-[#9b9ba6] mb-1">New Composition Name</label>
          <input
            type="text"
            value={compName}
            onChange={(e) => setCompName(e.target.value)}
            autoFocus
            className="w-full h-8 px-2.5 bg-[#161619] border border-[#2e2e33] focus:border-[#6c5ce7] rounded text-white text-[12px] outline-none"
          />
        </div>
        <div className="p-2.5 rounded bg-[#1a1a1d] border border-[#2e2e33] text-[11px] text-[#9b9ba6]">
          Moves all selected layer attributes, keyframes, masks, and GPU effects into the new composition and replaces them with a single Pre-comp layer.
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-[#2e2e33]">
          <button
            type="button"
            onClick={() => setActiveModal('none')}
            className="px-3 py-1.5 rounded bg-[#2a2a30] hover:bg-[#34343c] text-[12px] text-[#d4d4dc]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded bg-[#6c5ce7] hover:bg-[#5b4bc4] text-[12px] font-medium text-white"
          >
            Pre-compose
          </button>
        </div>
      </form>
    </Modal>
  );
};
