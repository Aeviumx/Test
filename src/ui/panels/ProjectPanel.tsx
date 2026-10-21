import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileAudio,
  FileImage,
  FileVideo,
  Film,
  FolderPlus,
  Layers,
  Loader2,
  MonitorPlay,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { importMediaFile } from '../../store/persistence';
import { useProjectStore } from '../../store/useProjectStore';
import { ContextMenu, ContextMenuItem } from '../components/ContextMenu';
import { formatTimecode } from '../../utils/timecode';

export const ProjectPanel: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const activeComp = useProjectStore((s) => s.getActiveComp());
  const setActiveCompId = useProjectStore((s) => s.setActiveCompId);
  const setActiveModal = useProjectStore((s) => s.setActiveModal);
  const addMediaAsset = useProjectStore((s) => s.addMediaAsset);
  const removeMediaAsset = useProjectStore((s) => s.removeMediaAsset);
  const addLayer = useProjectStore((s) => s.addLayer);
  const deleteComposition = useProjectStore((s) => s.deleteComposition);
  const setSourceMonitorAsset = useProjectStore((s) => s.setSourceMonitorAsset);
  const detectScenesForAsset = useProjectStore((s) => s.detectScenesForAsset);
  const insertSceneToTimeline = useProjectStore((s) => s.insertSceneToTimeline);
  const isDetectingScenes = useProjectStore((s) => s.isDetectingScenes);
  const sceneDetectionProgress = useProjectStore((s) => s.sceneDetectionProgress);

  const [search, setSearch] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [expandedScenes, setExpandedScenes] = useState<Record<string, boolean>>({});
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
      className={`h-full flex flex-col bg-[var(--bg-panel)] border-r border-[var(--border)] select-none relative transition-colors duration-150 ${
        isDraggingOver ? 'ring-2 ring-inset ring-[var(--accent)]' : ''
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
      <div className="h-[28px] pl-3 pr-1.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-elevated)] shrink-0">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
            Project
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveModal('new-comp')}
            title="New Composition (Ctrl+Alt+N)"
            className="w-[22px] h-[22px] flex items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--steel)] hover:text-[var(--text-primary)] transition-colors duration-150"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import Media (Ctrl+I)"
            className="w-[22px] h-[22px] flex items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--steel)] hover:text-[var(--text-primary)] transition-colors duration-150"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Comp Summary Banner */}
      <div className="px-3 py-2 bg-[var(--bg-base)] border-b border-[var(--border)] flex items-center gap-2.5 shrink-0" title={`${activeComp.name} — ${activeComp.width}×${activeComp.height}, ${activeComp.fps} fps, ${activeComp.duration}s`}>
        <div
          className="w-10 h-7 rounded border border-[var(--border-strong)] flex items-center justify-center shrink-0"
          style={{ backgroundColor: activeComp.backgroundColor }}
        >
          <Film className="w-4 h-4 text-[var(--accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{activeComp.name}</div>
          <div className="font-mono text-[10px] text-[var(--text-muted)]">
            {activeComp.width}×{activeComp.height} • {activeComp.fps}fps • {activeComp.duration}s
          </div>
        </div>
      </div>

      {/* Search Filter */}
      <div className="px-2 py-1.5 border-b border-[var(--border)] shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--steel)] absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search comps & assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-[24px] pl-7 pr-2 bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--accent)] rounded text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150"
          />
        </div>
      </div>

      {/* Asset & Composition List */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-2">
        {/* Compositions Section */}
        <div>
          <div className="h-[24px] px-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
            <span>Compositions ({filteredComps.length})</span>
            <button
              type="button"
              onClick={() => setActiveModal('new-comp')}
              title="New Composition (Ctrl+Alt+N)"
              className="h-[20px] px-1.5 -mr-1 rounded text-[var(--accent)] hover:bg-[var(--bg-hover)] flex items-center gap-0.5 transition-colors duration-150"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          <div className="space-y-0.5 mt-0.5">
            {filteredComps.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-[var(--text-muted)]">
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
                      ? 'bg-[var(--accent-deep)]/25 text-[var(--text-primary)] border border-[var(--accent)]/40 shadow-[0_0_8px_var(--accent-glow)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Film
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-[var(--accent)]' : 'text-[var(--steel)]'
                      }`}
                    />
                    <span className="truncate text-[11px] font-medium">{comp.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--text-muted)] ml-2 shrink-0">
                    {comp.width}×{comp.height}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Imported Footage / Media Assets Section */}
        <div>
          <div className="h-[24px] px-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
            <span>Media Footage ({filteredAssets.length})</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Import Media (Ctrl+I)"
              className="h-[20px] px-1.5 -mr-1 rounded text-[var(--accent)] hover:bg-[var(--bg-hover)] flex items-center gap-0.5 transition-colors duration-150"
            >
              <Upload className="w-3 h-3" /> Import
            </button>
          </div>

          {filteredAssets.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 mx-0.5 px-4 py-5 rounded-md border border-dashed border-[var(--border-strong)] hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]/40 bg-[var(--bg-base)]/60 text-center cursor-pointer transition-all duration-150 group"
            >
              <Upload className="w-5 h-5 text-[var(--steel)] group-hover:text-[var(--accent)] mx-auto mb-1.5 transition-colors duration-150" />
              <div className="text-[11px] font-medium text-[var(--text-primary)]">
                Drop files here or click to import
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">
                PNG · JPG · SVG · GIF · MP4 · WebM · MP3 · WAV
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <kbd className="px-1 h-[16px] inline-flex items-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono text-[9px] text-[var(--text-secondary)]">Ctrl+I</kbd>
                <span>to browse</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1 mt-0.5">
              {filteredAssets.map((asset) => {
                const hasScenes = !!(asset.scenes && asset.scenes.length > 0);
                const isExpanded = !!expandedScenes[asset.id];

                return (
                  <div key={asset.id} className="space-y-0.5">
                    <div
                      onDoubleClick={() => setSourceMonitorAsset(asset.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          items: [
                            {
                              id: 'open-source-monitor',
                              label: 'Open in Source Monitor',
                              onClick: () => setSourceMonitorAsset(asset.id),
                            },
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
                            ...(asset.type === 'video'
                              ? [
                                  {
                                    id: 'detect-scenes',
                                    label: hasScenes
                                      ? `Re-detect Scenes (${asset.scenes?.length})`
                                      : 'Auto-Detect Scenes (Scene Detection)',
                                    dividerAbove: true,
                                    onClick: () => void detectScenesForAsset(asset.id),
                                  },
                                ]
                              : []),
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
                      title={`${asset.name} — double-click to preview in Source Monitor`}
                      className="group h-[26px] flex items-center justify-between px-2 rounded border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors duration-150"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {hasScenes && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedScenes((prev) => ({
                                ...prev,
                                [asset.id]: !prev[asset.id],
                              }));
                            }}
                            className="p-0.5 -ml-1 text-[var(--steel)] hover:text-[var(--accent)]"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                        )}
                        {asset.type === 'image' && (
                          <FileImage className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        )}
                        {asset.type === 'video' && (
                          <FileVideo className="w-3.5 h-3.5 text-[var(--steel-light)] shrink-0" />
                        )}
                        {asset.type === 'audio' && (
                          <FileAudio className="w-3.5 h-3.5 text-[var(--blush)] shrink-0" />
                        )}
                        <span className="truncate text-[11px]">{asset.name}</span>
                        {hasScenes && (
                          <span className="text-[9px] px-1 rounded bg-[var(--accent-deep)]/25 text-[var(--accent)] font-mono">
                            {asset.scenes?.length} scenes
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSourceMonitorAsset(asset.id);
                          }}
                          title="Open in Source Monitor"
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--steel-light)] hover:text-[var(--accent)]"
                        >
                          <MonitorPlay className="w-3 h-3" />
                        </button>
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
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--accent)]"
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
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--danger)] text-white"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Detected Scene Subclips */}
                    {hasScenes && isExpanded && (
                      <div className="pl-4 pr-1 space-y-1 py-1 border-l border-[var(--border)] ml-3">
                        {asset.scenes?.map((scene) => (
                          <div
                            key={scene.id}
                            onDoubleClick={() => insertSceneToTimeline(scene)}
                            title={`${scene.name} (${formatTimecode(scene.inPoint, 30)} - ${formatTimecode(scene.outPoint, 30)}) — double click to insert`}
                            className="group/scn flex items-center justify-between p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors border border-transparent hover:border-[var(--border)]"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              {scene.thumbnail ? (
                                <img
                                  src={scene.thumbnail}
                                  alt={scene.name}
                                  className="w-8 h-5 object-cover rounded bg-black shrink-0 border border-[var(--border)]"
                                />
                              ) : (
                                <Film className="w-4 h-4 text-[var(--steel)] shrink-0" />
                              )}
                              <span className="font-medium truncate">{scene.name}</span>
                              <span className="font-mono text-[9px] text-[var(--text-muted)]">
                                {scene.duration.toFixed(1)}s
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                insertSceneToTimeline(scene);
                              }}
                              title="Insert Scene to Timeline at Playhead"
                              className="opacity-0 group-hover/scn:opacity-100 p-0.5 rounded text-[var(--accent)] hover:bg-[var(--bg-elevated)]"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick Create Footer */}
      <div className="px-2 py-1.5 border-t border-[var(--border)] bg-[var(--bg-elevated)] grid grid-cols-3 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => addLayer('shape', { shapeType: 'rectangle' })}
          title="New Shape Layer (use Q for the Shape Tool)"
          className="h-[24px] rounded bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] text-[11px] text-[var(--text-primary)] flex items-center justify-center gap-1 transition-colors duration-150"
        >
          <Plus className="w-3 h-3 text-[var(--accent)]" /> Shape
        </button>
        <button
          type="button"
          onClick={() => addLayer('text')}
          title="New Text Layer (Shift+T for the Text Tool)"
          className="h-[24px] rounded bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] text-[11px] text-[var(--text-primary)] flex items-center justify-center gap-1 transition-colors duration-150"
        >
          <Plus className="w-3 h-3 text-[var(--steel-light)]" /> Text
        </button>
        <button
          type="button"
          onClick={() => addLayer('adjustment')}
          title="New Adjustment Layer — effects apply to all layers below"
          className="h-[24px] rounded bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] text-[11px] text-[var(--text-primary)] flex items-center justify-center gap-1 transition-colors duration-150"
        >
          <Plus className="w-3 h-3 text-[var(--denim-light)]" /> Adjust
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
