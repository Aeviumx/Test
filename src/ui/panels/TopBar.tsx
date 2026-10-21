import React, { useEffect, useRef, useState } from 'react';
import {
  Circle,
  Crosshair,
  Download,
  FolderOpen,
  Hand,
  HelpCircle,
  Hexagon,
  MousePointer,
  PenTool,
  Redo2,
  RotateCw,
  Save,
  Sparkles,
  Square,
  Star,
  Type,
  Undo2,
  ZoomIn,
} from 'lucide-react';
import { EFFECT_CATALOG } from '../../core/defaults';
import { downloadProjectFile, importMediaFile, saveProjectToIndexedDB } from '../../store/persistence';
import { useProjectStore } from '../../store/useProjectStore';
import { Project, ShapeGeometryType, ToolType } from '../../types';

interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  dividerAbove?: boolean;
  onClick: () => void;
}

export const TopBar: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const undoStack = useProjectStore((s) => s.undoStack);
  const redoStack = useProjectStore((s) => s.redoStack);
  const activeTool = useProjectStore((s) => s.activeTool);
  const activeShapeType = useProjectStore((s) => s.activeShapeType);
  const selectedLayerIds = useProjectStore((s) => s.selectedLayerIds);
  const showGrid = useProjectStore((s) => s.showGrid);
  const showSafeZones = useProjectStore((s) => s.showSafeZones);
  const showRulers = useProjectStore((s) => s.showRulers);
  const showMotionPaths = useProjectStore((s) => s.showMotionPaths);
  const snapEnabled = useProjectStore((s) => s.snapEnabled);
  const graphEditorOpen = useProjectStore((s) => s.graphEditorOpen);

  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);
  const setActiveShapeType = useProjectStore((s) => s.setActiveShapeType);
  const setActiveModal = useProjectStore((s) => s.setActiveModal);
  const loadDemoProject = useProjectStore((s) => s.loadDemoProject);
  const createNewEmptyProject = useProjectStore((s) => s.createNewEmptyProject);
  const setProject = useProjectStore((s) => s.setProject);
  const addMediaAsset = useProjectStore((s) => s.addMediaAsset);
  const addLayer = useProjectStore((s) => s.addLayer);
  const duplicateSelectedLayers = useProjectStore((s) => s.duplicateSelectedLayers);
  const splitSelectedLayersAtPlayhead = useProjectStore((s) => s.splitSelectedLayersAtPlayhead);
  const deleteSelectedLayers = useProjectStore((s) => s.deleteSelectedLayers);
  const addMaskToLayer = useProjectStore((s) => s.addMaskToLayer);
  const addEffectToLayer = useProjectStore((s) => s.addEffectToLayer);
  const toggleViewportFlag = useProjectStore((s) => s.toggleViewportFlag);
  const setGraphEditorOpen = useProjectStore((s) => s.setGraphEditorOpen);
  const fitViewportToComp = useProjectStore((s) => s.fitViewportToComp);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [openMenu]);

  const handleOpenProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Project;
        if (parsed && Array.isArray(parsed.compositions) && parsed.compositions.length > 0) {
          setProject(parsed);
        }
      } catch (err) {
        console.error('Invalid .mfproj file:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportMediaFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      try {
        const asset = await importMediaFile(file);
        addMediaAsset(asset, true);
      } catch (err) {
        console.error('Import error:', err);
      }
    }
    e.target.value = '';
  };

  const selectedLayerId = selectedLayerIds[0] ?? null;

  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: 'New Empty Project', onClick: () => createNewEmptyProject() },
      { label: 'Open Demo Showcase Project', onClick: () => loadDemoProject() },
      {
        label: 'Open Project (.mfproj)...',
        dividerAbove: true,
        onClick: () => projectFileInputRef.current?.click(),
      },
      {
        label: 'Save Project (.mfproj)',
        shortcut: 'Ctrl+S',
        onClick: () => {
          void saveProjectToIndexedDB(project);
          downloadProjectFile(project);
        },
      },
      {
        label: 'Import Media (PNG/JPG/SVG/MP4/MP3)...',
        shortcut: 'Ctrl+I',
        dividerAbove: true,
        onClick: () => mediaInputRef.current?.click(),
      },
      {
        label: 'Export / Render Queue...',
        shortcut: 'Ctrl+M',
        dividerAbove: true,
        onClick: () => setActiveModal('export'),
      },
    ],
    Edit: [
      {
        label: undoStack.length > 0 ? `Undo ${undoStack[undoStack.length - 1].label}` : 'Undo',
        shortcut: 'Ctrl+Z',
        disabled: undoStack.length === 0,
        onClick: () => undo(),
      },
      {
        label: redoStack.length > 0 ? `Redo ${redoStack[redoStack.length - 1].label}` : 'Redo',
        shortcut: 'Ctrl+Shift+Z',
        disabled: redoStack.length === 0,
        onClick: () => redo(),
      },
      {
        label: 'Duplicate Selected Layer',
        shortcut: 'Ctrl+D',
        dividerAbove: true,
        disabled: selectedLayerIds.length === 0,
        onClick: () => duplicateSelectedLayers(),
      },
      {
        label: 'Split Layer at Playhead',
        shortcut: 'Ctrl+Shift+D',
        disabled: selectedLayerIds.length === 0,
        onClick: () => splitSelectedLayersAtPlayhead(),
      },
      {
        label: 'Delete Selected',
        shortcut: 'Del',
        disabled: selectedLayerIds.length === 0,
        onClick: () => deleteSelectedLayers(),
      },
    ],
    Composition: [
      { label: 'New Composition...', shortcut: 'Ctrl+N', onClick: () => setActiveModal('new-comp') },
      {
        label: 'Composition Settings...',
        shortcut: 'Ctrl+K',
        onClick: () => setActiveModal('comp-settings'),
      },
      {
        label: 'Add Composition Marker at Playhead',
        dividerAbove: true,
        onClick: () => {
          const st = useProjectStore.getState();
          st.addCompMarker(st.currentTime, 'Cue Marker');
        },
      },
      {
        label: 'Render & Export Composition...',
        shortcut: 'Ctrl+M',
        dividerAbove: true,
        onClick: () => setActiveModal('export'),
      },
    ],
    Layer: [
      { label: 'New Text Layer', shortcut: 'Shift+T', onClick: () => addLayer('text') },
      { label: 'New Solid Layer', onClick: () => addLayer('solid') },
      { label: 'New Shape Layer (Rectangle)', shortcut: 'Q', onClick: () => addLayer('shape', { shapeType: 'rectangle' }) },
      { label: 'New Shape Layer (Ellipse)', onClick: () => addLayer('shape', { shapeType: 'ellipse' }) },
      { label: 'New Shape Layer (Polygon)', onClick: () => addLayer('shape', { shapeType: 'polygon' }) },
      { label: 'New Shape Layer (Star)', onClick: () => addLayer('shape', { shapeType: 'star' }) },
      { label: 'New Null Object', dividerAbove: true, onClick: () => addLayer('null') },
      { label: 'New Adjustment Layer', onClick: () => addLayer('adjustment') },
      { label: 'New 2.5D Camera Layer', onClick: () => addLayer('camera') },
      {
        label: 'Add Rectangular Mask',
        dividerAbove: true,
        disabled: !selectedLayerId,
        onClick: () => selectedLayerId && addMaskToLayer(selectedLayerId, 'rectangle'),
      },
      {
        label: 'Add Elliptical Mask',
        disabled: !selectedLayerId,
        onClick: () => selectedLayerId && addMaskToLayer(selectedLayerId, 'ellipse'),
      },
      {
        label: 'Pre-compose Selected Layers...',
        shortcut: 'Ctrl+Shift+C',
        dividerAbove: true,
        disabled: selectedLayerIds.length === 0,
        onClick: () => setActiveModal('precompose'),
      },
    ],
    Effect: EFFECT_CATALOG.map((fx, idx) => ({
      label: `${fx.category}: ${fx.name}`,
      dividerAbove: idx > 0 && EFFECT_CATALOG[idx - 1].category !== fx.category,
      disabled: !selectedLayerId,
      onClick: () => {
        if (selectedLayerId) {
          addEffectToLayer(selectedLayerId, fx.type);
        }
      },
    })),
    View: [
      {
        label: `${showGrid ? '✓ ' : ''}Show Proportional Grid`,
        onClick: () => toggleViewportFlag('showGrid'),
      },
      {
        label: `${showSafeZones ? '✓ ' : ''}Show Title/Action Safe Zones`,
        onClick: () => toggleViewportFlag('showSafeZones'),
      },
      {
        label: `${showRulers ? '✓ ' : ''}Show Rulers & Guides`,
        onClick: () => toggleViewportFlag('showRulers'),
      },
      {
        label: `${showMotionPaths ? '✓ ' : ''}Show Spatial Motion Trajectories`,
        onClick: () => toggleViewportFlag('showMotionPaths'),
      },
      {
        label: `${snapEnabled ? '✓ ' : ''}Enable Smart Snapping`,
        onClick: () => toggleViewportFlag('snapEnabled'),
      },
      {
        label: `${graphEditorOpen ? '✓ ' : ''}Toggle Graph Editor`,
        dividerAbove: true,
        onClick: () => setGraphEditorOpen(!graphEditorOpen),
      },
      {
        label: 'Fit Composition in Viewport',
        shortcut: 'Shift+/',
        dividerAbove: true,
        onClick: () => fitViewportToComp(),
      },
    ],
    Help: [
      {
        label: 'Keyboard Shortcuts Reference...',
        shortcut: '?',
        onClick: () => setActiveModal('shortcuts'),
      },
      {
        label: 'Reload Motionforge Demo Project',
        dividerAbove: true,
        onClick: () => loadDemoProject(),
      },
    ],
  };

  const tools: { id: ToolType; label: string; shortcut: string; icon: React.ReactNode }[] = [
    { id: 'select', label: 'Selection Tool', shortcut: 'V', icon: <MousePointer className="w-3.5 h-3.5" /> },
    { id: 'hand', label: 'Hand Tool (Pan)', shortcut: 'H', icon: <Hand className="w-3.5 h-3.5" /> },
    { id: 'zoom', label: 'Zoom Tool', shortcut: 'Z', icon: <ZoomIn className="w-3.5 h-3.5" /> },
    { id: 'rotate', label: 'Rotation Tool', shortcut: 'W', icon: <RotateCw className="w-3.5 h-3.5" /> },
    { id: 'anchor', label: 'Pan Behind (Anchor Point) Tool', shortcut: 'Y', icon: <Crosshair className="w-3.5 h-3.5" /> },
    {
      id: 'shape',
      label: `Shape Tool (${activeShapeType})`,
      shortcut: 'Q',
      icon:
        activeShapeType === 'ellipse' ? (
          <Circle className="w-3.5 h-3.5" />
        ) : activeShapeType === 'polygon' ? (
          <Hexagon className="w-3.5 h-3.5" />
        ) : activeShapeType === 'star' ? (
          <Star className="w-3.5 h-3.5" />
        ) : (
          <Square className="w-3.5 h-3.5" />
        ),
    },
    { id: 'pen', label: 'Pen / Bezier Path Tool', shortcut: 'G', icon: <PenTool className="w-3.5 h-3.5" /> },
    { id: 'text', label: 'Text Tool', shortcut: 'Shift+T', icon: <Type className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="h-10 bg-[#232327] border-b border-[#2e2e33] px-2.5 flex items-center justify-between select-none shrink-0 z-40">
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".mfproj,.json"
        className="hidden"
        onChange={handleOpenProjectFile}
      />
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={handleImportMediaFiles}
      />

      {/* Left: Brand + Application Menus */}
      <div ref={menuBarRef} className="flex items-center gap-1">
        <div className="flex items-center gap-2 pr-2 mr-1 border-r border-[#2e2e33]">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-[#6c5ce7] to-[#00d1b2] flex items-center justify-center shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold tracking-tight text-[13px] text-white">MOTIONFORGE</span>
        </div>

        {Object.entries(menus).map(([menuName, items]) => (
          <div key={menuName} className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === menuName ? null : menuName)}
              onMouseEnter={() => {
                if (openMenu) setOpenMenu(menuName);
              }}
              className={`px-2 py-1 rounded text-[12px] transition-colors ${
                openMenu === menuName
                  ? 'bg-[#6c5ce7] text-white'
                  : 'text-[#d4d4dc] hover:bg-[#2e2e36] hover:text-white'
              }`}
            >
              {menuName}
            </button>

            {openMenu === menuName && (
              <div className="absolute left-0 top-7 z-50 min-w-[235px] max-h-[75vh] overflow-y-auto py-1 bg-[#232327] border border-[#3a3a44] rounded-md shadow-2xl">
                {items.map((item) => (
                  <React.Fragment key={item.label}>
                    {item.dividerAbove && <div className="my-1 border-t border-[#2e2e33]" />}
                    <button
                      type="button"
                      disabled={item.disabled}
                      onClick={() => {
                        setOpenMenu(null);
                        item.onClick();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-[12px] transition-colors ${
                        item.disabled
                          ? 'opacity-40 cursor-not-allowed text-[#787885]'
                          : 'text-[#e4e4e8] hover:bg-[#6c5ce7] hover:text-white'
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="ml-4 font-mono text-[10px] opacity-70">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Center: Tool Bar */}
      <div className="flex items-center gap-1 bg-[#1a1a1d] px-1.5 py-1 rounded-md border border-[#2e2e33]">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTool(t.id)}
            title={`${t.label} (${t.shortcut})`}
            className={`h-6 px-2 rounded flex items-center gap-1 text-[11px] transition-all duration-150 ${
              activeTool === t.id
                ? 'bg-[#6c5ce7] text-white shadow-sm'
                : 'text-[#9b9ba6] hover:text-white hover:bg-[#2a2a32]'
            }`}
          >
            {t.icon}
          </button>
        ))}

        {activeTool === 'shape' && (
          <select
            value={activeShapeType}
            onChange={(e) => setActiveShapeType(e.target.value as ShapeGeometryType)}
            className="h-6 ml-1 px-1.5 bg-[#232327] border border-[#383842] rounded text-[11px] text-white outline-none"
            title="Active Shape Geometry (press Q to cycle)"
          >
            <option value="rectangle">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="polygon">Polygon</option>
            <option value="star">Star</option>
          </select>
        )}

        <div className="h-4 w-px bg-[#2e2e33] mx-1" />

        <button
          type="button"
          onClick={undo}
          disabled={undoStack.length === 0}
          title={
            undoStack.length > 0
              ? `Undo: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)`
              : 'Nothing to Undo'
          }
          className="h-6 px-1.5 rounded text-[#9b9ba6] hover:text-white hover:bg-[#2a2a32] disabled:opacity-30"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={redoStack.length === 0}
          title={
            redoStack.length > 0
              ? `Redo: ${redoStack[redoStack.length - 1].label} (Ctrl+Shift+Z)`
              : 'Nothing to Redo'
          }
          className="h-6 px-1.5 rounded text-[#9b9ba6] hover:text-white hover:bg-[#2a2a32] disabled:opacity-30"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: Project Save/Open & Export Actions */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => projectFileInputRef.current?.click()}
          title="Open Project (.mfproj)"
          className="h-7 px-2 rounded bg-[#1a1a1d] hover:bg-[#2a2a32] border border-[#2e2e33] text-[#d4d4dc] flex items-center gap-1 text-[11px]"
        >
          <FolderOpen className="w-3.5 h-3.5 text-[#9b9ba6]" />
          <span className="hidden xl:inline">Open</span>
        </button>
        <button
          type="button"
          onClick={() => {
            void saveProjectToIndexedDB(project);
            downloadProjectFile(project);
          }}
          title="Save Project (.mfproj)"
          className="h-7 px-2 rounded bg-[#1a1a1d] hover:bg-[#2a2a32] border border-[#2e2e33] text-[#d4d4dc] flex items-center gap-1 text-[11px]"
        >
          <Save className="w-3.5 h-3.5 text-[#00d1b2]" />
          <span className="hidden xl:inline">Save</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveModal('shortcuts')}
          title="Keyboard Shortcuts (?)"
          className="h-7 w-7 rounded bg-[#1a1a1d] hover:bg-[#2a2a32] border border-[#2e2e33] text-[#9b9ba6] hover:text-white flex items-center justify-center"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setActiveModal('export')}
          title="Export Video / GIF / PNG Sequence (Ctrl+M)"
          className="h-7 px-3 rounded bg-[#6c5ce7] hover:bg-[#5b4bc4] text-white font-medium text-[11px] flex items-center gap-1.5 shadow-sm transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
