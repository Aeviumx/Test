import React, { useEffect } from 'react';
import { Sliders, Sparkles } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePlaybackLoop } from './hooks/usePlaybackLoop';
import { loadProjectFromIndexedDB } from './store/persistence';
import { useProjectStore } from './store/useProjectStore';
import { CompSettingsModal } from './ui/modals/CompSettingsModal';
import { ExportModal } from './ui/modals/ExportModal';
import { PrecomposeModal } from './ui/modals/PrecomposeModal';
import { ShortcutsModal } from './ui/modals/ShortcutsModal';
import { EffectsPanel } from './ui/panels/EffectsPanel';
import { ProjectPanel } from './ui/panels/ProjectPanel';
import { PropertiesPanel } from './ui/panels/PropertiesPanel';
import { TimelinePanel } from './ui/panels/TimelinePanel';
import { TopBar } from './ui/panels/TopBar';
import { ViewportPanel } from './ui/panels/ViewportPanel';

export const App: React.FC = () => {
  const rightTab = useProjectStore((s) => s.rightTab);
  const setRightTab = useProjectStore((s) => s.setRightTab);
  const activeModal = useProjectStore((s) => s.activeModal);
  const setProject = useProjectStore((s) => s.setProject);

  usePlaybackLoop();
  useKeyboardShortcuts();

  // Restore auto-saved project from IndexedDB on mount if available
  useEffect(() => {
    void loadProjectFromIndexedDB().then((saved) => {
      if (saved && saved.compositions?.length > 0) {
        setProject(saved);
      }
    });
  }, [setProject]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#1a1a1d] text-[#e8e8ec] overflow-hidden select-none">
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
                <div className="h-full flex flex-col bg-[#232327] border-l border-[#2e2e33]">
                  {/* Tab Switcher */}
                  <div className="h-[28px] bg-[#1e1e22] border-b border-[#2e2e33] flex items-stretch px-1 gap-0.5 shrink-0">
                    {(
                      [
                        { id: 'properties', label: 'Properties', icon: <Sliders className="w-3 h-3" />, hint: 'Layer Transform, Masks, Text & Effect Controls' },
                        { id: 'effects', label: 'Effects & Presets', icon: <Sparkles className="w-3 h-3" />, hint: 'Browse and apply GPU effects & animation presets' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        title={tab.hint}
                        onClick={() => setRightTab(tab.id)}
                        className={`relative px-3 text-[11px] font-medium flex items-center gap-1.5 transition-colors duration-150 ${
                          rightTab === tab.id
                            ? 'text-white'
                            : 'text-[#8b8b96] hover:text-[#d4d4dc]'
                        }`}
                      >
                        {tab.icon}
                        <span className="whitespace-nowrap">{tab.label}</span>
                        <span
                          className={`absolute left-2 right-2 bottom-0 h-[2px] rounded-full transition-colors duration-150 ${
                            rightTab === tab.id ? 'bg-[#6c5ce7]' : 'bg-transparent'
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
    </div>
  );
};

export default App;
