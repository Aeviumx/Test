import React, { useRef, useState } from 'react';
import {
  FileAudio,
  FileImage,
  FileVideo,
  Film,
  FolderPlus,
  Layers,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { importMediaFile } from '../../store/persistence';
import { useProjectStore } from '../../store/useProjectStore';
import { ContextMenu, ContextMenuItem } from '../components/ContextMenu';

export const ProjectPanel: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const activeComp = useProjectStore((s) => s.getActiveComp());
  const setActiveCompId = useProjectStore((s) => s.setActiveCompId);
  const setActiveModal = useProjectStore((s) => s.setActiveModal);
  const addMediaAsset = useProjectStore((s) => s.addMediaAsset);
  const removeMediaAsset = useProjectStore((s) => s.removeMediaAsset);
  const addLayer = useProjectStore((s) => s.addLayer);
  const deleteComposition = useProjectStore((s) => s.deleteComposition);

  const [search, setSearch] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      try {
        const asset = await importMediaFile(file);
        addMediaAsset(asset, true);
      } catch (err) {
        console.error('Failed to import asset:', err);
      }
    }
  };

  const filteredComps = project.compositions.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredAssets = project.assets.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files?.length) {
          void handleFiles(e.dataTransfer.files);
        }
      }}
      className={`h-full flex flex-col bg-[#232327] border-r border-[#2e2e33] select-none relative ${
        isDraggingOver ? 'ring-2 ring-inset ring-[#00d1b2]' : ''
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Panel Header */}
      <div className="h-[28px] pl-3 pr-1.5 border-b border-[#2e2e33] flex items-center justify-between bg-[#1e1e22] shrink-0">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#6c5ce7]" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#d4d4dc]">
            Project
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveModal('new-comp')}
            title="New Composition (Ctrl+Alt+N)"
            className="w-[22px] h-[22px] flex items-center justify-center rounded hover:bg-[#2e2e36] text-[#9b9ba6] hover:text-white transition-colors duration-150"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import Media (Ctrl+I)"
            className="w-[22px] h-[22px] flex items-center justify-center rounded hover:bg-[#2e2e36] text-[#9b9ba6] hover:text-white transition-colors duration-150"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Comp Summary Banner */}
      <div className="px-3 py-2 bg-[#1a1a1d] border-b border-[#2e2e33] flex items-center gap-2.5 shrink-0" title={`${activeComp.name} — ${activeComp.width}×${activeComp.height}, ${activeComp.fps} fps, ${activeComp.duration}s`}>
        <div
          className="w-10 h-7 rounded border border-[#383842] flex items-center justify-center shrink-0"
          style={{ backgroundColor: activeComp.backgroundColor }}
        >
          <Film className="w-4 h-4 text-[#00d1b2]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-white truncate">{activeComp.name}</div>
          <div className="font-mono text-[10px] text-[#9b9ba6]">
            {activeComp.width}×{activeComp.height} • {activeComp.fps}fps • {activeComp.duration}s
          </div>
        </div>
      </div>

      {/* Search Filter */}
      <div className="px-2 py-1.5 border-b border-[#2e2e33] shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#787885] absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search comps & assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-[24px] pl-7 pr-2 bg-[#161619] border border-[#2e2e33] focus:border-[#6c5ce7] rounded text-[11px] text-white placeholder:text-[#686873] outline-none transition-colors duration-150"
          />
        </div>
      </div>

      {/* Asset & Composition List */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-2">
        {/* Compositions Section */}
        <div>
          <div className="h-[24px] px-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#8c8c98]">
            <span>Compositions ({filteredComps.length})</span>
            <button
              type="button"
              onClick={() => setActiveModal('new-comp')}
              title="New Composition (Ctrl+Alt+N)"
              className="h-[20px] px-1.5 -mr-1 rounded text-[#8f82f5] hover:bg-[#6c5ce7]/15 flex items-center gap-0.5 transition-colors duration-150"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          <div className="space-y-0.5 mt-0.5">
            {filteredComps.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-[#686873]">
                No compositions match “{search}”
              </div>
            )}
            {filteredComps.map((comp) => {
              const isActive = comp.id === activeComp.id;
              return (
                <div
                  key={comp.id}
                  onClick={() => setActiveCompId(comp.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      items: [
                        {
                          id: 'open',
                          label: 'Open Composition',
                          onClick: () => setActiveCompId(comp.id),
                        },
                        {
                          id: 'settings',
                          label: 'Composition Settings...',
                          shortcut: 'Ctrl+K',
                          onClick: () => {
                            setActiveCompId(comp.id);
                            setActiveModal('comp-settings');
                          },
                        },
                        {
                          id: 'insert-precomp',
                          label: `Insert into "${activeComp.name}"`,
                          disabled: comp.id === activeComp.id,
                          dividerAbove: true,
                          onClick: () => {
                            addLayer('precomp', {
                              name: comp.name,
                              compId: comp.id,
                              width: comp.width,
                              height: comp.height,
                            });
                          },
                        },
                        {
                          id: 'delete-comp',
                          label: 'Delete Composition',
                          danger: true,
                          disabled: project.compositions.length <= 1,
                          dividerAbove: true,
                          onClick: () => deleteComposition(comp.id),
                        },
                      ],
                    });
                  }}
                  title={`${comp.name} — click to open, right-click for options`}
                  className={`group h-[26px] flex items-center justify-between px-2 rounded cursor-pointer transition-colors duration-150 ${
                    isActive
                      ? 'bg-[#6c5ce7]/20 text-white border border-[#6c5ce7]/50'
                      : 'text-[#d4d4dc] hover:bg-[#2a2a32] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Film
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-[#00d1b2]' : 'text-[#6c5ce7]'
                      }`}
                    />
                    <span className="truncate text-[11px] font-medium">{comp.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#787885] ml-2 shrink-0">
                    {comp.width}×{comp.height}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Imported Footage / Media Assets Section */}
        <div>
          <div className="h-[24px] px-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#8c8c98]">
            <span>Media Footage ({filteredAssets.length})</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Import Media (Ctrl+I)"
              className="h-[20px] px-1.5 -mr-1 rounded text-[#00d1b2] hover:bg-[#00d1b2]/15 flex items-center gap-0.5 transition-colors duration-150"
            >
              <Upload className="w-3 h-3" /> Import
            </button>
          </div>

          {filteredAssets.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 mx-0.5 px-4 py-5 rounded-md border border-dashed border-[#34343e] hover:border-[#6c5ce7] hover:bg-[#6c5ce7]/5 bg-[#1a1a1d]/60 text-center cursor-pointer transition-colors duration-150"
            >
              <Upload className="w-5 h-5 text-[#6c5ce7] mx-auto mb-1.5 opacity-80" />
              <div className="text-[11px] font-medium text-[#d4d4dc]">
                Drop files here or click to import
              </div>
              <div className="text-[10px] text-[#787885] mt-1 leading-relaxed">
                PNG · JPG · SVG · GIF · MP4 · WebM · MP3 · WAV
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-[#686873]">
                <kbd className="px-1 h-[16px] inline-flex items-center rounded border border-[#3a3a44] bg-[#232327] font-mono text-[9px] text-[#b8b8c4]">Ctrl+I</kbd>
                <span>to browse</span>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5 mt-0.5">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  onDoubleClick={() =>
                    addLayer(asset.type, {
                      name: asset.name,
                      assetId: asset.id,
                      width: asset.width,
                      height: asset.height,
                    })
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      items: [
                        {
                          id: 'add-to-comp',
                          label: `Add to "${activeComp.name}"`,
                          onClick: () =>
                            addLayer(asset.type, {
                              name: asset.name,
                              assetId: asset.id,
                              width: asset.width,
                              height: asset.height,
                            }),
                        },
                        {
                          id: 'remove-asset',
                          label: 'Delete Asset',
                          danger: true,
                          dividerAbove: true,
                          onClick: () => removeMediaAsset(asset.id),
                        },
                      ],
                    });
                  }}
                  title={`${asset.name} — double-click to add to composition`}
                  className="group h-[26px] flex items-center justify-between px-2 rounded border border-transparent text-[#d4d4dc] hover:bg-[#2a2a32] cursor-pointer transition-colors duration-150"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {asset.type === 'image' && <FileImage className="w-3.5 h-3.5 text-[#00d1b2] shrink-0" />}
                    {asset.type === 'video' && <FileVideo className="w-3.5 h-3.5 text-[#10b981] shrink-0" />}
                    {asset.type === 'audio' && <FileAudio className="w-3.5 h-3.5 text-[#f59e0b] shrink-0" />}
                    <span className="truncate text-[11px]">{asset.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        addLayer(asset.type, {
                          name: asset.name,
                          assetId: asset.id,
                          width: asset.width,
                          height: asset.height,
                        });
                      }}
                      title="Add to Active Composition"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#6c5ce7] text-white"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeMediaAsset(asset.id);
                      }}
                      title="Remove Asset"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#ef4444] text-white"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Create Footer */}
      <div className="px-2 py-1.5 border-t border-[#2e2e33] bg-[#1d1d21] grid grid-cols-3 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => addLayer('shape', { shapeType: 'rectangle' })}
          title="New Shape Layer (use Q for the Shape Tool)"
          className="h-[24px] rounded bg-[#26262c] hover:bg-[#32323a] text-[11px] text-[#d4d4dc] flex items-center justify-center gap-1 transition-colors duration-150"
        >
          <Plus className="w-3 h-3 text-[#0ea5e9]" /> Shape
        </button>
        <button
          type="button"
          onClick={() => addLayer('text')}
          title="New Text Layer (Shift+T for the Text Tool)"
          className="h-[24px] rounded bg-[#26262c] hover:bg-[#32323a] text-[11px] text-[#d4d4dc] flex items-center justify-center gap-1 transition-colors duration-150"
        >
          <Plus className="w-3 h-3 text-[#6c5ce7]" /> Text
        </button>
        <button
          type="button"
          onClick={() => addLayer('adjustment')}
          title="New Adjustment Layer — effects apply to all layers below"
          className="h-[24px] rounded bg-[#26262c] hover:bg-[#32323a] text-[11px] text-[#d4d4dc] flex items-center justify-center gap-1 transition-colors duration-150"
        >
          <Plus className="w-3 h-3 text-[#d946ef]" /> Adjust
        </button>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
