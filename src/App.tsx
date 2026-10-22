import React, { useEffect } from 'react';
import { Sliders, Sparkles } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePlaybackLoop } from './hooks/usePlaybackLoop';
import { loadProjectFromIndexedDB, importMediaFile } from './store/persistence';
import { useProjectStore } from './store/useProjectStore';
import { CompSettingsModal } from './ui/modals/CompSettingsModal';
import { ExportModal } from './ui/modals/ExportModal';
import { PrecomposeModal } from './ui/modals/PrecomposeModal';
import { ShortcutsModal } from './ui/modals/ShortcutsModal';
import { SettingsModal } from './ui/modals/SettingsModal';
import { EffectsPanel } from './ui/panels/EffectsPanel';
import { ProjectPanel } from './ui/panels/ProjectPanel';
import { PropertiesPanel } from './ui/panels/PropertiesPanel';
import { TimelinePanel } from './ui/panels/TimelinePanel';
import { TopBar } from './ui/panels/TopBar';
import { ViewportPanel } from './ui/panels/ViewportPanel';
import { MediaAsset, Project } from './types';

export const App: React.FC = () => {
  const rightTab = useProjectStore((s) => s.rightTab);
  const setRightTab = useProjectStore((s) => s.setRightTab);
  const activeModal = useProjectStore((s) => s.activeModal);
  const setProject = useProjectStore((s) => s.setProject);
  const addMediaAsset = useProjectStore((s) => s.addMediaAsset);
  const project = useProjectStore((s) => s.project);

  usePlaybackLoop();
  useKeyboardShortcuts();

  // Restore auto-saved project on mount (from Electron desktop storage or IndexedDB)
  useEffect(() => {
    if (window.koriAPI?.storage) {
      void window.koriAPI.storage.loadAutoRecovery().then((recovery) => {
        if (recovery && recovery.project) {
          setProject(recovery.project as Project);
          return;
        }
        void loadProjectFromIndexedDB().then((saved) => {
          if (saved && saved.compositions?.length > 0) {
            setProject(saved);
          }
        });
      });
    } else {
      void loadProjectFromIndexedDB().then((saved) => {
        if (saved && saved.compositions?.length > 0) {
          setProject(saved);
        }
      });
    }
  }, [setProject]);

  // Periodic Auto-Save every 60s
  useEffect(() => {
    if (!window.koriAPI?.storage) return;
    const timer = setInterval(() => {
      void window.koriAPI?.storage.saveAutoRecovery({
        version: '1.0.0',
        name: project.name || 'AutoRecovered',
        lastModified: Date.now(),
        appVersion: '1.0.0',
        project,
        mediaPaths: {},
      });
    }, 60000);
    return () => clearInterval(timer);
  }, [project]);

  // Native Drag-and-Drop files from Windows Explorer
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files || []);
      for (const file of files) {
        const filePath = (file as unknown as { path?: string }).path;
        if (filePath && window.koriAPI?.media) {
          try {
            const probe = await window.koriAPI.media.probe(filePath);
            const assetType = probe.hasVideo ? 'video' : probe.hasAudio ? 'audio' : 'image';
            const asset: MediaAsset = {
              id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: probe.fileName,
              type: assetType,
              mimeType: probe.hasVideo ? 'video/mp4' : 'audio/wav',
              url: `file://${filePath.replace(/\\/g, '/')}`,
              width: probe.width,
              height: probe.height,
              duration: probe.duration,
            };
            addMediaAsset(asset, true);
          } catch (err) {
            console.error('Failed to probe dropped media file', err);
          }
        } else {
          try {
            const asset = await importMediaFile(file);
            addMediaAsset(asset, true);
          } catch (err) {
            console.error('Browser import error', err);
          }
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [addMediaAsset]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden select-none">
      {/* Top Menu & Tool Bar */}
      <TopBar />

      {/* Main Resizable Workspace */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="vertical">
          {/* Upper Workspace: Project (Left) + Viewport (Center) + Properties/Effects (Right) */}
          <Panel defaultSize={56} minSize={28}>
            <PanelGroup direction="horizontal">
              {/* Left: Project & Assets Panel */}
              <Panel defaultSize={19} minSize={13} maxSize={34}>
                <ProjectPanel />
              </Panel>

              <PanelResizeHandle />

              {/* Center: WebGL2 Composition Viewport */}
              <Panel defaultSize={55} minSize={30}>
                <ViewportPanel />
              </Panel>

              <PanelResizeHandle />

              {/* Right: Properties / Effect Controls + Effects & Presets */}
              <Panel defaultSize={26} minSize={18} maxSize={42}>
                <div className="h-full flex flex-col bg-[var(--bg-panel)] border-l border-[var(--border)]">
                  {/* Tab Switcher */}
                  <div className="h-[28px] bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-stretch px-1 gap-0.5 shrink-0">
                    {(
                      [
                        { id: 'properties', label: 'Properties', icon: <Sliders className="w-3 h-3 text-[var(--steel)]" />, hint: 'Layer Transform, Masks, Text & Effect Controls' },
                        { id: 'effects', label: 'Effects & Presets', icon: <Sparkles className="w-3 h-3 text-[var(--steel)]" />, hint: 'Browse and apply GPU effects & animation presets' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        title={tab.hint}
                        onClick={() => setRightTab(tab.id)}
                        className={`relative px-3 text-[11px] font-medium flex items-center gap-1.5 transition-colors duration-150 ${
                          rightTab === tab.id
                            ? 'text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {tab.icon}
                        <span className="whitespace-nowrap tracking-wide">{tab.label}</span>
                        <span
                          className={`absolute left-2 right-2 bottom-0 h-[2px] rounded-full transition-all duration-150 ${
                            rightTab === tab.id
                              ? 'bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]'
                              : 'bg-transparent'
                          }`}
                        />
                      </button>
                    ))}
                  </div>

                  {/* Active Right Panel Body */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {rightTab === 'properties' ? <PropertiesPanel /> : <EffectsPanel />}
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle />

          {/* Lower Full-Width Panel: Timeline & Graph Editor */}
          <Panel defaultSize={44} minSize={22}>
            <TimelinePanel />
          </Panel>
        </PanelGroup>
      </div>

      {/* Application Modals */}
      {activeModal === 'new-comp' && <CompSettingsModal mode="new" />}
      {activeModal === 'comp-settings' && <CompSettingsModal mode="edit" />}
      {activeModal === 'precompose' && <PrecomposeModal />}
      {activeModal === 'shortcuts' && <ShortcutsModal />}
      {activeModal === 'export' && <ExportModal />}
      {activeModal === 'settings' && <SettingsModal />}
    </div>
  );
};

export default App;
