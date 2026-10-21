import { useEffect } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { snapToFrame } from '../utils/timecode';

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      const state = useProjectStore.getState();
      const comp = state.getActiveComp();
      const isCtrl = e.ctrlKey || e.metaKey;

      // Undo / Redo
      if (isCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          state.redo();
        } else {
          state.undo();
        }
        return;
      }
      if (isCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        state.redo();
        return;
      }

      // Duplicate Layer (Ctrl+D) or Split Layer (Ctrl+Shift+D)
      if (isCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (e.shiftKey) {
          state.splitSelectedLayersAtPlayhead();
        } else {
          state.duplicateSelectedLayers();
        }
        return;
      }

      // Pre-compose (Ctrl+Shift+C)
      if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (state.selectedLayerIds.length > 0) {
          state.setActiveModal('precompose');
        }
        return;
      }

      // Copy / Paste Keyframes (Ctrl+C / Ctrl+V)
      if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'c') {
        if (state.selectedKeyframes.length > 0) {
          e.preventDefault();
          state.copySelectedKeyframes();
        }
        return;
      }
      if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'v') {
        if (state.clipboardKeyframes.length > 0) {
          e.preventDefault();
          state.pasteKeyframesAtPlayhead();
        }
        return;
      }

      // Export Modal (Ctrl+M) or Comp Settings (Ctrl+K)
      if (isCtrl && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        state.setActiveModal('export');
        return;
      }
      if (isCtrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        state.setActiveModal('comp-settings');
        return;
      }

      // Easing Hotkeys: F9, Shift+F9, Ctrl+Shift+F9
      if (e.key === 'F9') {
        e.preventDefault();
        if (isCtrl && e.shiftKey) {
          state.applyEasingToSelectedKeyframes('ease-out');
        } else if (e.shiftKey) {
          state.applyEasingToSelectedKeyframes('ease-in');
        } else {
          state.applyEasingToSelectedKeyframes('easy-ease');
        }
        return;
      }

      // Space: Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        state.togglePlayPause();
        return;
      }

      // PageUp / PageDown: Prev / Next Frame
      if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && isCtrl)) {
        e.preventDefault();
        state.setIsPlaying(false);
        state.setCurrentTime(snapToFrame(state.currentTime - 1 / comp.fps, comp.fps));
        return;
      }
      if (e.key === 'PageDown' || (e.key === 'ArrowRight' && isCtrl)) {
        e.preventDefault();
        state.setIsPlaying(false);
        state.setCurrentTime(snapToFrame(state.currentTime + 1 / comp.fps, comp.fps));
        return;
      }

      // Home / End
      if (e.key === 'Home') {
        e.preventDefault();
        state.setIsPlaying(false);
        state.setCurrentTime(comp.workAreaStart);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        state.setIsPlaying(false);
        state.setCurrentTime(comp.workAreaEnd);
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (state.selectedKeyframes.length > 0) {
          state.deleteSelectedKeyframes();
        } else if (state.selectedLayerIds.length > 0) {
          state.deleteSelectedLayers();
        }
        return;
      }

      // [ and ] or Alt+[ and Alt+]
      if (e.key === '[' || e.code === 'BracketLeft') {
        e.preventDefault();
        if (e.altKey) {
          state.trimSelectedLayersInToPlayhead();
        } else {
          state.alignSelectedLayersStartToPlayhead();
        }
        return;
      }
      if (e.key === ']' || e.code === 'BracketRight') {
        e.preventDefault();
        if (e.altKey) {
          state.trimSelectedLayersOutToPlayhead();
        } else {
          state.alignSelectedLayersEndToPlayhead();
        }
        return;
      }

      // ? or Shift+/
      if (e.key === '?') {
        e.preventDefault();
        state.setActiveModal(state.activeModal === 'shortcuts' ? 'none' : 'shortcuts');
        return;
      }

      if (isCtrl || e.altKey) return;

      const upper = e.key.toUpperCase();

      // Viewport Tools vs Layer Property Shortcuts
      switch (upper) {
        case 'V':
          state.setActiveTool('select');
          break;
        case 'H':
          state.setActiveTool('hand');
          break;
        case 'Z':
          state.setActiveTool('zoom');
          break;
        case 'W':
          state.setActiveTool('rotate');
          break;
        case 'Y':
          state.setActiveTool('anchor');
          break;
        case 'Q': {
          if (state.activeTool === 'shape') {
            const order: ('rectangle' | 'ellipse' | 'polygon' | 'star')[] = [
              'rectangle',
              'ellipse',
              'polygon',
              'star',
            ];
            const idx = order.indexOf(
              state.activeShapeType as 'rectangle' | 'ellipse' | 'polygon' | 'star'
            );
            state.setActiveShapeType(order[(idx + 1) % order.length]);
          } else {
            state.setActiveTool('shape');
          }
          break;
        }
        case 'G':
          state.setActiveTool('pen');
          break;
        case 'T':
          if (e.shiftKey) {
            state.setActiveTool('text');
          } else if (state.selectedLayerIds.length > 0) {
            state.revealLayerShortcutGroup('T');
          } else {
            state.setActiveTool('text');
          }
          break;
        case 'P':
          state.revealLayerShortcutGroup('P');
          break;
        case 'S':
          state.revealLayerShortcutGroup('S');
          break;
        case 'R':
          state.revealLayerShortcutGroup('R');
          break;
        case 'A':
          state.revealLayerShortcutGroup('A');
          break;
        case 'U':
          state.revealLayerShortcutGroup('U');
          break;
        case 'J':
          state.jumpToAdjacentKeyframe('prev');
          break;
        case 'K':
          state.jumpToAdjacentKeyframe('next');
          break;
        case 'B':
          state.updateActiveComposition({
            workAreaStart: Math.min(state.currentTime, comp.workAreaEnd - 1 / comp.fps),
          });
          break;
        case 'N':
          state.updateActiveComposition({
            workAreaEnd: Math.max(state.currentTime, comp.workAreaStart + 1 / comp.fps),
          });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
