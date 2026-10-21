import { applyPatches, enablePatches, Patch, produceWithPatches } from 'immer';
import { create } from 'zustand';
import { getLayerPropertyByPath, listLayerAnimatableProperties } from '../core/commands';
import {
  createDefaultComposition,
  createDefaultLayer,
  createDefaultMask,
  createEffectInstance,
  createKeyframe,
  recomputeSpatialTangents,
} from '../core/defaults';
import { createDemoProject } from '../core/demoProject';
import {
  computeLayerWorldMatrix,
  evaluateLayerTransform,
  evaluateProperty,
} from '../engine/evaluator';
import { globalFrameCache } from '../render/FrameCache';
import { applyMatrixToPoint, invertMatrix } from '../utils/geometry';
import {
  BezierVertex,
  ClipboardKeyframe,
  Composition,
  EffectType,
  Keyframe,
  Layer,
  LayerType,
  Mask,
  MaskShapeType,
  MediaAsset,
  PreviewResolution,
  Project,
  SelectedKeyframeRef,
  ShapeGeometryType,
  ToolType,
  Vec2,
} from '../types';
import { createId } from '../utils/id';
import { clamp, snapToFrame } from '../utils/timecode';
import { saveProjectToIndexedDB } from './persistence';

enablePatches();

let currentPointerSessionId: number | null = null;
let pointerSessionCounter = 0;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'mousedown',
    () => {
      pointerSessionCounter += 1;
      currentPointerSessionId = pointerSessionCounter;
    },
    true
  );
  window.addEventListener(
    'mouseup',
    () => {
      currentPointerSessionId = null;
    },
    true
  );
}

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  dragSessionId?: number | null;
  patches: Patch[];
  inversePatches: Patch[];
}

export type ActiveModalType =
  | 'none'
  | 'comp-settings'
  | 'new-comp'
  | 'export'
  | 'precompose'
  | 'shortcuts';

export interface ProjectStoreState {
  project: Project;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  lastSavedAt: string | null;

  // Transport & Timeline
  currentTime: number;
  isPlaying: boolean;
  loopMode: 'loop' | 'pingpong' | 'once';
  measuredFps: number;
  timelineZoom: number; // pixels per second
  timelineScrollX: number;

  // Selection
  selectedLayerIds: string[];
  selectedKeyframes: SelectedKeyframeRef[];
  clipboardKeyframes: ClipboardKeyframe[];
  inspectedPropertyPath: string | null; // active property for Graph Editor

  // Viewport & Tools
  activeTool: ToolType;
  activeShapeType: ShapeGeometryType;
  viewportZoom: number; // 0.1 .. 8.0
  viewportPan: Vec2;
  previewResolution: PreviewResolution;
  showGrid: boolean;
  showSafeZones: boolean;
  showRulers: boolean;
  showMotionPaths: boolean;
  showCheckerboard: boolean;
  snapEnabled: boolean;

  // Graph Editor & Panels
  graphEditorOpen: boolean;
  graphEditorMode: 'value' | 'speed';
  rightTab: 'properties' | 'effects';
  activeModal: ActiveModalType;

  // Core Helpers
  getActiveComp: () => Composition;
  commitCommand: (label: string, mutator: (draft: Project) => void) => void;
  undo: () => void;
  redo: () => void;

  // Project & Composition Actions
  setProject: (project: Project) => void;
  loadDemoProject: () => void;
  createNewEmptyProject: () => void;
  setActiveCompId: (compId: string) => void;
  createComposition: (params: {
    name: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    backgroundColor: string;
  }) => void;
  updateActiveComposition: (updates: Partial<Pick<Composition, 'name' | 'width' | 'height' | 'fps' | 'duration' | 'backgroundColor' | 'workAreaStart' | 'workAreaEnd' | 'hideShyLayers' | 'motionBlur'>>) => void;
  deleteComposition: (compId: string) => void;
  addCompMarker: (time: number, label?: string) => void;
  deleteCompMarker: (markerId: string) => void;

  // Assets
  addMediaAsset: (asset: MediaAsset, addToActiveComp?: boolean) => void;
  removeMediaAsset: (assetId: string) => void;

  // Layer Actions
  addLayer: (
    type: LayerType,
    options?: {
      name?: string;
      solidColor?: string;
      shapeType?: ShapeGeometryType;
      text?: string;
      assetId?: string;
      compId?: string;
      position?: Vec2;
      width?: number;
      height?: number;
    }
  ) => string;
  selectLayer: (layerId: string | null, multi?: boolean) => void;
  setSelectedLayerIds: (layerIds: string[]) => void;
  deleteSelectedLayers: () => void;
  duplicateSelectedLayers: () => void;
  splitSelectedLayersAtPlayhead: () => void;
  precomposeSelectedLayers: (newCompName: string) => void;
  reorderLayer: (fromIndex: number, toIndex: number) => void;
  updateLayerMeta: (layerId: string, updates: Partial<Layer>) => void;
  moveLayerTime: (layerId: string, newStartTime: number, newInPoint: number, newOutPoint: number) => void;
  alignSelectedLayersStartToPlayhead: () => void;
  alignSelectedLayersEndToPlayhead: () => void;
  trimSelectedLayersInToPlayhead: () => void;
  trimSelectedLayersOutToPlayhead: () => void;
  toggleLayerGroupExpanded: (layerId: string, groupName: string) => void;
  revealLayerShortcutGroup: (shortcutKey: 'P' | 'S' | 'R' | 'T' | 'A' | 'U') => void;

  // Shape & Text & Mask & Effect Actions
  updateShapeVertices: (layerId: string, vertices: BezierVertex[], closed?: boolean) => void;
  addVertexToShapeOrMask: (layerId: string, vertex: BezierVertex) => void;
  updateTextSource: (layerId: string, updates: Partial<NonNullable<Layer['textContents']>>) => void;
  toggleTextAnimator: (layerId: string, enabled: boolean) => void;
  addMaskToLayer: (layerId: string, shapeType?: MaskShapeType) => void;
  updateLayerMask: (layerId: string, maskId: string, updates: Partial<Mask>) => void;
  removeLayerMask: (layerId: string, maskId: string) => void;
  addEffectToLayer: (layerId: string, effectType: EffectType) => void;
  removeEffectFromLayer: (layerId: string, effectId: string) => void;
  toggleEffectEnabled: (layerId: string, effectId: string) => void;
  reorderLayerEffect: (layerId: string, fromIdx: number, toIdx: number) => void;

  // Property & Keyframe Actions
  setPropertyValue: (
    layerId: string,
    propertyPath: string,
    value: number | Vec2 | string,
    atTime?: number
  ) => void;
  togglePropertyStopwatch: (layerId: string, propertyPath: string) => void;
  toggleKeyframeAtTime: (layerId: string, propertyPath: string, time?: number) => void;
  setSelectedKeyframes: (refs: SelectedKeyframeRef[]) => void;
  moveSelectedKeyframes: (deltaTime: number) => void;
  updateKeyframeTangentsAndValue: (
    layerId: string,
    propertyPath: string,
    keyframeId: string,
    updates: {
      time?: number;
      value?: number | Vec2 | string;
      inTangent?: { x: number; y: number };
      outTangent?: { x: number; y: number };
      spatialInTangent?: Vec2;
      spatialOutTangent?: Vec2;
    }
  ) => void;
  deleteSelectedKeyframes: () => void;
  applyEasingToSelectedKeyframes: (
    preset: 'easy-ease' | 'ease-in' | 'ease-out' | 'linear' | 'hold'
  ) => void;
  copySelectedKeyframes: () => void;
  pasteKeyframesAtPlayhead: () => void;
  jumpToAdjacentKeyframe: (direction: 'prev' | 'next') => void;
  setPropertyExpression: (
    layerId: string,
    propertyPath: string,
    expression: string,
    enabled: boolean
  ) => void;

  // Transport & UI Setters
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlayPause: () => void;
  setLoopMode: (mode: 'loop' | 'pingpong' | 'once') => void;
  setMeasuredFps: (fps: number) => void;
  setTimelineZoom: (zoom: number) => void;
  setTimelineScrollX: (scrollX: number) => void;
  setActiveTool: (tool: ToolType) => void;
  setActiveShapeType: (shapeType: ShapeGeometryType) => void;
  setViewportZoom: (zoom: number) => void;
  setViewportPan: (pan: Vec2) => void;
  fitViewportToComp: (viewportWidth?: number, viewportHeight?: number) => void;
  setPreviewResolution: (res: PreviewResolution) => void;
  toggleViewportFlag: (
    flag: 'showGrid' | 'showSafeZones' | 'showRulers' | 'showMotionPaths' | 'showCheckerboard' | 'snapEnabled'
  ) => void;
  setGraphEditorOpen: (open: boolean) => void;
  setGraphEditorMode: (mode: 'value' | 'speed') => void;
  setInspectedPropertyPath: (path: string | null) => void;
  setRightTab: (tab: 'properties' | 'effects') => void;
  setActiveModal: (modal: ActiveModalType) => void;
  setLastSavedAt: (iso: string) => void;
}

const initialProject = createDemoProject();

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  project: initialProject,
  undoStack: [],
  redoStack: [],
  lastSavedAt: new Date().toISOString(),

  currentTime: 1.5,
  isPlaying: false,
  loopMode: 'loop',
  measuredFps: 60,
  timelineZoom: 120,
  timelineScrollX: 0,

  selectedLayerIds: initialProject.compositions[0]?.layers[1]
    ? [initialProject.compositions[0].layers[1].id]
    : [],
  selectedKeyframes: [],
  clipboardKeyframes: [],
  inspectedPropertyPath: 'transform.position',

  activeTool: 'select',
  activeShapeType: 'rectangle',
  viewportZoom: 0.45,
  viewportPan: [0, 0],
  previewResolution: 'full',
  showGrid: false,
  showSafeZones: true,
  showRulers: true,
  showMotionPaths: true,
  showCheckerboard: false,
  snapEnabled: true,

  graphEditorOpen: false,
  graphEditorMode: 'value',
  rightTab: 'properties',
  activeModal: 'none',

  getActiveComp: () => {
    const { project } = get();
    return (
      project.compositions.find((c) => c.id === project.activeCompId) ??
      project.compositions[0]
    );
  },

  commitCommand: (label, mutator) => {
    const currentProject = get().project;
    const [nextProject, patches, inversePatches] = produceWithPatches(
      currentProject,
      (draft) => {
        mutator(draft);
        draft.updatedAt = new Date().toISOString();
      }
    );

    if (patches.length === 0) return;

    globalFrameCache.invalidateAll();

    set((state) => {
      const lastEntry = state.undoStack[state.undoStack.length - 1];
      if (
        currentPointerSessionId !== null &&
        lastEntry &&
        lastEntry.dragSessionId === currentPointerSessionId
      ) {
        const merged: HistoryEntry = {
          ...lastEntry,
          timestamp: Date.now(),
          patches: [...lastEntry.patches, ...patches],
          inversePatches: [...inversePatches, ...lastEntry.inversePatches],
        };
        return {
          project: nextProject,
          undoStack: [...state.undoStack.slice(0, -1), merged],
          redoStack: [],
        };
      }

      return {
        project: nextProject,
        undoStack: [
          ...state.undoStack.slice(-79),
          {
            id: createId('cmd'),
            label,
            timestamp: Date.now(),
            dragSessionId: currentPointerSessionId,
            patches,
            inversePatches,
          },
        ],
        redoStack: [],
      };
    });
  },

  undo: () => {
    const { undoStack, redoStack, project } = get();
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    const prevProject = applyPatches(project, last.inversePatches);
    globalFrameCache.invalidateAll();
    set({
      project: prevProject,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, last],
    });
  },

  redo: () => {
    const { undoStack, redoStack, project } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const nextProject = applyPatches(project, next.patches);
    globalFrameCache.invalidateAll();
    set({
      project: nextProject,
      undoStack: [...undoStack, next],
      redoStack: redoStack.slice(0, -1),
    });
  },

  setProject: (project) => {
    globalFrameCache.invalidateAll();
    const firstComp = project.compositions[0];
    set({
      project,
      undoStack: [],
      redoStack: [],
      currentTime: 0,
      isPlaying: false,
      selectedLayerIds: firstComp?.layers[0] ? [firstComp.layers[0].id] : [],
      selectedKeyframes: [],
    });
    void saveProjectToIndexedDB(project);
  },

  loadDemoProject: () => {
    const demo = createDemoProject();
    globalFrameCache.invalidateAll();
    set({
      project: demo,
      undoStack: [],
      redoStack: [],
      currentTime: 1.5,
      isPlaying: false,
      selectedLayerIds: demo.compositions[0]?.layers[1] ? [demo.compositions[0].layers[1].id] : [],
      selectedKeyframes: [],
    });
    void saveProjectToIndexedDB(demo);
  },

  createNewEmptyProject: () => {
    const comp = createDefaultComposition({
      name: 'Comp 1',
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 6,
      backgroundColor: '#0e0e14',
    });
    const newProj: Project = {
      id: createId('proj'),
      name: 'Untitled Project.mfproj',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeCompId: comp.id,
      compositions: [comp],
      assets: [],
    };
    globalFrameCache.invalidateAll();
    set({
      project: newProj,
      undoStack: [],
      redoStack: [],
      currentTime: 0,
      isPlaying: false,
      selectedLayerIds: [],
      selectedKeyframes: [],
    });
  },

  setActiveCompId: (compId) => {
    const comp = get().project.compositions.find((c) => c.id === compId);
    if (!comp) return;
    set((state) => ({
      project: { ...state.project, activeCompId: compId },
      currentTime: clamp(state.currentTime, 0, comp.duration),
      selectedLayerIds: comp.layers[0] ? [comp.layers[0].id] : [],
      selectedKeyframes: [],
    }));
  },

  createComposition: (params) => {
    const newComp = createDefaultComposition(params);
    get().commitCommand(`Create Composition "${params.name}"`, (draft) => {
      draft.compositions.push(newComp);
      draft.activeCompId = newComp.id;
    });
    set({
      currentTime: 0,
      selectedLayerIds: [],
      selectedKeyframes: [],
    });
  },

  updateActiveComposition: (updates) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Update Composition Settings', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      Object.assign(comp, updates);
      if (updates.duration !== undefined) {
        comp.workAreaEnd = Math.min(comp.duration, Math.max(0.5, comp.workAreaEnd));
        comp.workAreaStart = Math.min(comp.workAreaStart, comp.workAreaEnd - 0.1);
      }
    });
  },

  deleteComposition: (compId) => {
    const { project } = get();
    if (project.compositions.length <= 1) return;
    get().commitCommand('Delete Composition', (draft) => {
      draft.compositions = draft.compositions.filter((c) => c.id !== compId);
      if (draft.activeCompId === compId && draft.compositions[0]) {
        draft.activeCompId = draft.compositions[0].id;
      }
    });
  },

  addCompMarker: (time, label = 'Marker') => {
    const compId = get().project.activeCompId;
    get().commitCommand('Add Marker', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      comp.markers.push({
        id: createId('mrk'),
        time: snapToFrame(time, comp.fps),
        label,
        color: '#00d1b2',
      });
    });
  },

  deleteCompMarker: (markerId) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Delete Marker', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      comp.markers = comp.markers.filter((m) => m.id !== markerId);
    });
  },

  addMediaAsset: (asset, addToActiveComp = true) => {
    const comp = get().getActiveComp();
    let createdLayerId: string | null = null;
    get().commitCommand(`Import "${asset.name}"`, (draft) => {
      draft.assets.push(asset);
      if (addToActiveComp) {
        const targetComp = draft.compositions.find((c) => c.id === comp.id);
        if (targetComp) {
          const layer = createDefaultLayer(targetComp, asset.type, asset.name, {
            assetId: asset.id,
            width: asset.width ?? targetComp.width,
            height: asset.height ?? targetComp.height,
          });
          if (asset.duration && asset.duration > 0) {
            layer.outPoint = Math.min(targetComp.duration, asset.duration);
          }
          targetComp.layers.unshift(layer);
          createdLayerId = layer.id;
        }
      }
    });
    if (createdLayerId) {
      set({ selectedLayerIds: [createdLayerId] });
    }
  },

  removeMediaAsset: (assetId) => {
    get().commitCommand('Remove Asset', (draft) => {
      draft.assets = draft.assets.filter((a) => a.id !== assetId);
      for (const c of draft.compositions) {
        c.layers = c.layers.filter((l) => l.assetId !== assetId);
      }
    });
  },

  addLayer: (type, options) => {
    const comp = get().getActiveComp();
    const layer = createDefaultLayer(comp, type, options?.name, {
      solidColor: options?.solidColor,
      shapeType: options?.shapeType,
      text: options?.text,
      assetId: options?.assetId,
      compId: options?.compId,
      width: options?.width,
      height: options?.height,
    });
    if (options?.position) {
      layer.transform.position.value = options.position;
    }

    get().commitCommand(`Add ${layer.name}`, (draft) => {
      const targetComp = draft.compositions.find((c) => c.id === comp.id);
      if (!targetComp) return;
      targetComp.layers.unshift(layer);
    });

    set({
      selectedLayerIds: [layer.id],
      selectedKeyframes: [],
    });
    return layer.id;
  },

  selectLayer: (layerId, multi = false) => {
    if (!layerId) {
      set({ selectedLayerIds: [], selectedKeyframes: [] });
      return;
    }
    set((state) => {
      if (multi) {
        const exists = state.selectedLayerIds.includes(layerId);
        return {
          selectedLayerIds: exists
            ? state.selectedLayerIds.filter((id) => id !== layerId)
            : [...state.selectedLayerIds, layerId],
        };
      }
      return { selectedLayerIds: [layerId] };
    });
  },

  setSelectedLayerIds: (layerIds) => set({ selectedLayerIds: layerIds }),

  deleteSelectedLayers: () => {
    const { selectedLayerIds, project } = get();
    if (selectedLayerIds.length === 0) return;
    const compId = project.activeCompId;
    get().commitCommand('Delete Layers', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      comp.layers = comp.layers.filter((l) => !selectedLayerIds.includes(l.id));
      for (const l of comp.layers) {
        if (l.parentId && selectedLayerIds.includes(l.parentId)) {
          l.parentId = null;
        }
      }
    });
    set({ selectedLayerIds: [], selectedKeyframes: [] });
  },

  duplicateSelectedLayers: () => {
    const { selectedLayerIds, project } = get();
    if (selectedLayerIds.length === 0) return;
    const compId = project.activeCompId;
    const newIds: string[] = [];

    get().commitCommand('Duplicate Layer', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      const nextLayers: Layer[] = [];
      for (const layer of comp.layers) {
        if (selectedLayerIds.includes(layer.id)) {
          const clone: Layer = JSON.parse(JSON.stringify(layer));
          clone.id = createId('layer');
          clone.name = `${layer.name} Copy`;
          newIds.push(clone.id);
          nextLayers.push(clone);
        }
        nextLayers.push(layer);
      }
      comp.layers = nextLayers;
    });

    if (newIds.length > 0) {
      set({ selectedLayerIds: newIds });
    }
  },

  splitSelectedLayersAtPlayhead: () => {
    const { selectedLayerIds, currentTime, project } = get();
    if (selectedLayerIds.length === 0) return;
    const compId = project.activeCompId;
    const newSelectedIds: string[] = [];

    get().commitCommand('Split Layer', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      const nextLayers: Layer[] = [];

      for (const layer of comp.layers) {
        if (
          selectedLayerIds.includes(layer.id) &&
          currentTime > layer.inPoint + 1 / comp.fps &&
          currentTime < layer.outPoint - 1 / comp.fps
        ) {
          const upperHalf: Layer = JSON.parse(JSON.stringify(layer));
          upperHalf.id = createId('layer');
          upperHalf.name = `${layer.name} [2]`;
          upperHalf.inPoint = currentTime;
          layer.outPoint = currentTime;
          newSelectedIds.push(upperHalf.id);
          nextLayers.push(upperHalf);
          nextLayers.push(layer);
        } else {
          nextLayers.push(layer);
        }
      }
      comp.layers = nextLayers;
    });

    if (newSelectedIds.length > 0) {
      set({ selectedLayerIds: newSelectedIds });
    }
  },

  precomposeSelectedLayers: (newCompName) => {
    const { selectedLayerIds, project } = get();
    if (selectedLayerIds.length === 0) return;
    const compId = project.activeCompId;
    let precompLayerId = '';

    get().commitCommand(`Pre-compose "${newCompName}"`, (draft) => {
      const activeComp = draft.compositions.find((c) => c.id === compId);
      if (!activeComp) return;

      const movingLayers = activeComp.layers.filter((l) => selectedLayerIds.includes(l.id));
      if (movingLayers.length === 0) return;

      const firstIndex = activeComp.layers.findIndex((l) => selectedLayerIds.includes(l.id));

      const subComp = createDefaultComposition({
        name: newCompName || 'Pre-comp 1',
        width: activeComp.width,
        height: activeComp.height,
        fps: activeComp.fps,
        duration: activeComp.duration,
        backgroundColor: activeComp.backgroundColor,
      });
      subComp.layers = JSON.parse(JSON.stringify(movingLayers));
      draft.compositions.push(subComp);

      const precompLayer = createDefaultLayer(activeComp, 'precomp', subComp.name, {
        compId: subComp.id,
        width: subComp.width,
        height: subComp.height,
      });
      precompLayerId = precompLayer.id;

      const remaining = activeComp.layers.filter((l) => !selectedLayerIds.includes(l.id));
      remaining.splice(Math.max(0, firstIndex), 0, precompLayer);
      activeComp.layers = remaining;
    });

    if (precompLayerId) {
      set({ selectedLayerIds: [precompLayerId], activeModal: 'none' });
    }
  },

  reorderLayer: (fromIndex, toIndex) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Reorder Layers', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      if (fromIndex < 0 || fromIndex >= comp.layers.length) return;
      const targetIdx = clamp(toIndex, 0, comp.layers.length - 1);
      const [moved] = comp.layers.splice(fromIndex, 1);
      comp.layers.splice(targetIdx, 0, moved);
    });
  },

  updateLayerMeta: (layerId, updates) => {
    const { project, currentTime } = get();
    const compId = project.activeCompId;
    get().commitCommand('Update Layer', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!comp || !layer) return;

      if (updates.parentId !== undefined && updates.parentId !== layer.parentId) {
        const layerIdx = comp.layers.indexOf(layer);
        const childTr = evaluateLayerTransform(layer, currentTime, comp, layerIdx);
        const oldWorldMat = computeLayerWorldMatrix(layer, comp, currentTime);
        const worldAnchorPt = applyMatrixToPoint(oldWorldMat, childTr.anchorPoint);
        const worldRotDeg = (Math.atan2(oldWorldMat[1], oldWorldMat[0]) * 180) / Math.PI;

        let newLocalPos: Vec2 = [Math.round(worldAnchorPt[0]), Math.round(worldAnchorPt[1])];
        let newLocalRot = Math.round(worldRotDeg * 10) / 10;

        if (updates.parentId) {
          const newParent = comp.layers.find((l) => l.id === updates.parentId);
          if (newParent && newParent.id !== layer.id) {
            const parentWorldMat = computeLayerWorldMatrix(newParent, comp, currentTime);
            const invParentMat = invertMatrix(parentWorldMat);
            const pt = applyMatrixToPoint(invParentMat, worldAnchorPt);
            const parentRotDeg = (Math.atan2(parentWorldMat[1], parentWorldMat[0]) * 180) / Math.PI;
            newLocalPos = [Math.round(pt[0]), Math.round(pt[1])];
            newLocalRot = Math.round((worldRotDeg - parentRotDeg) * 10) / 10;
          }
        }

        const deltaPos: Vec2 = [
          newLocalPos[0] - layer.transform.position.value[0],
          newLocalPos[1] - layer.transform.position.value[1],
        ];
        layer.transform.position.value = newLocalPos;
        if (layer.transform.position.animated) {
          for (const kf of layer.transform.position.keyframes) {
            kf.value = [kf.value[0] + deltaPos[0], kf.value[1] + deltaPos[1]];
          }
        }
        layer.transform.rotation.value = newLocalRot;
      }

      Object.assign(layer, updates);
    });
  },

  moveLayerTime: (layerId, newStartTime, newInPoint, newOutPoint) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Trim/Move Layer Time', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer || layer.locked || !comp) return;
      layer.startTime = snapToFrame(newStartTime, comp.fps);
      layer.inPoint = clamp(snapToFrame(newInPoint, comp.fps), 0, comp.duration);
      layer.outPoint = clamp(
        snapToFrame(newOutPoint, comp.fps),
        layer.inPoint + 1 / comp.fps,
        comp.duration
      );
    });
  },

  alignSelectedLayersStartToPlayhead: () => {
    const { selectedLayerIds, currentTime, project } = get();
    if (selectedLayerIds.length === 0) return;
    const compId = project.activeCompId;
    get().commitCommand('Move Layer In to Playhead', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      for (const l of comp.layers) {
        if (selectedLayerIds.includes(l.id) && !l.locked) {
          const dur = l.outPoint - l.inPoint;
          const delta = currentTime - l.inPoint;
          l.startTime += delta;
          l.inPoint = currentTime;
          l.outPoint = Math.min(comp.duration, currentTime + dur);
        }
      }
    });
  },

  alignSelectedLayersEndToPlayhead: () => {
    const { selectedLayerIds, currentTime, project } = get();
    if (selectedLayerIds.length === 0) return;
    const compId = project.activeCompId;
    get().commitCommand('Move Layer Out to Playhead', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      for (const l of comp.layers) {
        if (selectedLayerIds.includes(l.id) && !l.locked) {
          const dur = l.outPoint - l.inPoint;
          const delta = currentTime - l.outPoint;
          l.startTime += delta;
          l.outPoint = currentTime;
          l.inPoint = Math.max(0, currentTime - dur);
        }
      }
    });
  },

  trimSelectedLayersInToPlayhead: () => {
    const { selectedLayerIds, currentTime, project } = get();
    if (selectedLayerIds.length === 0) return;
    const compId = project.activeCompId;
    get().commitCommand('Trim Layer In Point', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      for (const l of comp.layers) {
        if (selectedLayerIds.includes(l.id) && !l.locked && currentTime < l.outPoint) {
          l.inPoint = Math.max(0, currentTime);
        }
      }
    });
  },

  trimSelectedLayersOutToPlayhead: () => {
    const { selectedLayerIds, currentTime, project } = get();
    if (selectedLayerIds.length === 0) return;
    const compId = project.activeCompId;
    get().commitCommand('Trim Layer Out Point', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      for (const l of comp.layers) {
        if (selectedLayerIds.includes(l.id) && !l.locked && currentTime > l.inPoint) {
          l.outPoint = Math.min(comp.duration, currentTime);
        }
      }
    });
  },

  toggleLayerGroupExpanded: (layerId, groupName) => {
    const compId = get().project.activeCompId;
    set((state) => {
      const [nextProject] = produceWithPatches(state.project, (draft) => {
        const comp = draft.compositions.find((c) => c.id === compId);
        const layer = comp?.layers.find((l) => l.id === layerId);
        if (!layer) return;
        const groups = layer.expandedGroups ?? [];
        if (groupName === 'all') {
          if (groups.length > 0) {
            layer.expandedGroups = [];
          } else {
            layer.expandedGroups = ['transform', 'contents', 'text', 'masks', 'effects'];
          }
        } else if (groups.includes(groupName)) {
          layer.expandedGroups = groups.filter((g) => g !== groupName);
        } else {
          layer.expandedGroups = [...groups, groupName];
        }
      });
      return { project: nextProject };
    });
  },

  revealLayerShortcutGroup: (shortcutKey) => {
    const { selectedLayerIds, project } = get();
    const compId = project.activeCompId;
    const propMap: Record<string, string> = {
      P: 'transform.position',
      S: 'transform.scale',
      R: 'transform.rotation',
      T: 'transform.opacity',
      A: 'transform.anchorPoint',
    };
    const targetPath = propMap[shortcutKey] ?? null;

    set((state) => {
      const [nextProject] = produceWithPatches(state.project, (draft) => {
        const comp = draft.compositions.find((c) => c.id === compId);
        if (!comp) return;
        const targets =
          selectedLayerIds.length > 0
            ? comp.layers.filter((l) => selectedLayerIds.includes(l.id))
            : comp.layers;
        for (const layer of targets) {
          const groups = new Set(layer.expandedGroups ?? []);
          if (shortcutKey === 'U') {
            if (groups.has('animated-only')) {
              groups.delete('animated-only');
            } else {
              groups.clear();
              groups.add('animated-only');
            }
          } else {
            groups.delete('animated-only');
            groups.add('transform');
          }
          layer.expandedGroups = Array.from(groups);
        }
      });
      return {
        project: nextProject,
        inspectedPropertyPath: targetPath ?? state.inspectedPropertyPath,
      };
    });
  },

  updateShapeVertices: (layerId, vertices, closed) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Edit Path Vertices', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer || !layer.shapeContents) return;
      layer.shapeContents.shapeType = 'path';
      layer.shapeContents.vertices = vertices;
      if (closed !== undefined) layer.shapeContents.closed = closed;
    });
  },

  addVertexToShapeOrMask: (layerId, vertex) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Add Bezier Vertex', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer) return;
      if (
        layer.type === 'shape' &&
        layer.shapeContents?.shapeType === 'path' &&
        layer.masks.length === 0
      ) {
        const verts = layer.shapeContents.vertices;
        if (verts.length >= 3) {
          const d0 = Math.hypot(vertex.x - verts[0].x, vertex.y - verts[0].y);
          if (d0 < 20) {
            layer.shapeContents.closed = true;
            return;
          }
        }
        verts.push(vertex);
      } else {
        let pathMask = layer.masks.find((m) => m.shapeType === 'path');
        if (!pathMask) {
          pathMask = createDefaultMask(
            layer.width,
            layer.height,
            'path',
            layer.masks.length + 1
          );
          pathMask.vertices = [];
          pathMask.closed = true;
          layer.masks.push(pathMask);
        } else if (pathMask.vertices.length >= 3) {
          const d0 = Math.hypot(
            vertex.x - pathMask.vertices[0].x,
            vertex.y - pathMask.vertices[0].y
          );
          if (d0 < 20) {
            pathMask.closed = true;
            return;
          }
        }
        pathMask.vertices.push(vertex);
        if (pathMask.vertices.length >= 3) {
          pathMask.closed = true;
        }
        if (!layer.expandedGroups?.includes('masks')) {
          layer.expandedGroups = [...(layer.expandedGroups ?? []), 'masks'];
        }
      }
    });
  },

  updateTextSource: (layerId, updates) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Update Text Properties', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer || !layer.textContents) return;
      Object.assign(layer.textContents, updates);
    });
  },

  toggleTextAnimator: (layerId, enabled) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Toggle Text Animator', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer || !layer.textContents) return;
      layer.textContents.animator.enabled = enabled;
    });
  },

  addMaskToLayer: (layerId, shapeType = 'rectangle') => {
    const compId = get().project.activeCompId;
    get().commitCommand('Add Layer Mask', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer) return;
      const mask = createDefaultMask(layer.width, layer.height, shapeType, layer.masks.length + 1);
      layer.masks.push(mask);
      if (!layer.expandedGroups?.includes('masks')) {
        layer.expandedGroups = [...(layer.expandedGroups ?? []), 'masks'];
      }
    });
  },

  updateLayerMask: (layerId, maskId, updates) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Update Mask', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      const mask = layer?.masks.find((m) => m.id === maskId);
      if (!mask) return;
      Object.assign(mask, updates);
    });
  },

  removeLayerMask: (layerId, maskId) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Delete Mask', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer) return;
      layer.masks = layer.masks.filter((m) => m.id !== maskId);
    });
  },

  addEffectToLayer: (layerId, effectType) => {
    const compId = get().project.activeCompId;
    const fx = createEffectInstance(effectType);
    get().commitCommand(`Add Effect "${fx.name}"`, (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer) return;
      layer.effects.push(fx);
      if (!layer.expandedGroups?.includes('effects')) {
        layer.expandedGroups = [...(layer.expandedGroups ?? []), 'effects'];
      }
    });
  },

  removeEffectFromLayer: (layerId, effectId) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Remove Effect', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer) return;
      layer.effects = layer.effects.filter((e) => e.id !== effectId);
    });
  },

  toggleEffectEnabled: (layerId, effectId) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Toggle Effect', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      const fx = layer?.effects.find((e) => e.id === effectId);
      if (!fx) return;
      fx.enabled = !fx.enabled;
    });
  },

  reorderLayerEffect: (layerId, fromIdx, toIdx) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Reorder Effect Stack', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer) return;
      if (fromIdx < 0 || fromIdx >= layer.effects.length) return;
      const target = clamp(toIdx, 0, layer.effects.length - 1);
      const [moved] = layer.effects.splice(fromIdx, 1);
      layer.effects.splice(target, 0, moved);
    });
  },

  setPropertyValue: (layerId, propertyPath, value, atTime) => {
    const { project, currentTime } = get();
    const compId = project.activeCompId;
    const t = atTime ?? currentTime;

    get().commitCommand(`Change ${propertyPath}`, (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!comp || !layer || layer.locked) return;

      const prop = getLayerPropertyByPath(layer, propertyPath);
      if (!prop) return;

      prop.value = value;
      const snappedT = snapToFrame(t, comp.fps);

      if (prop.animated) {
        const existing = prop.keyframes.find((k) => Math.abs(k.time - snappedT) < 0.001);
        if (existing) {
          existing.value = value;
        } else {
          prop.keyframes.push(createKeyframe(snappedT, value, 'linear'));
          prop.keyframes.sort((a, b) => a.time - b.time);
        }
        if (propertyPath === 'transform.position') {
          recomputeSpatialTangents(prop.keyframes as Keyframe<Vec2>[]);
        }
      }
    });
  },

  togglePropertyStopwatch: (layerId, propertyPath) => {
    const { project, currentTime } = get();
    const compId = project.activeCompId;

    get().commitCommand(`Toggle Animation on ${propertyPath}`, (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!comp || !layer || layer.locked) return;

      const prop = getLayerPropertyByPath(layer, propertyPath);
      if (!prop) return;

      const layerIdx = comp.layers.indexOf(layer);
      const evaluatedNow = evaluateProperty(prop, currentTime, comp, layer, layerIdx);

      if (prop.animated) {
        prop.animated = false;
        prop.value = evaluatedNow;
        prop.keyframes = [];
      } else {
        prop.animated = true;
        const snappedT = snapToFrame(currentTime, comp.fps);
        prop.keyframes = [createKeyframe(snappedT, evaluatedNow, 'linear')];
      }
    });
  },

  toggleKeyframeAtTime: (layerId, propertyPath, time) => {
    const { project, currentTime } = get();
    const compId = project.activeCompId;
    const targetTime = time ?? currentTime;
    let addedRef: SelectedKeyframeRef | null = null;

    get().commitCommand('Add/Remove Keyframe', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!comp || !layer || layer.locked) return;

      const prop = getLayerPropertyByPath(layer, propertyPath);
      if (!prop) return;

      const snappedT = snapToFrame(targetTime, comp.fps);
      const layerIdx = comp.layers.indexOf(layer);
      const currentVal = evaluateProperty(prop, snappedT, comp, layer, layerIdx);

      if (!prop.animated) {
        prop.animated = true;
        const kf = createKeyframe(snappedT, currentVal, 'linear');
        prop.keyframes = [kf];
        addedRef = { layerId, propertyPath, keyframeId: kf.id };
        return;
      }

      const existingIdx = prop.keyframes.findIndex((k) => Math.abs(k.time - snappedT) < 0.001);
      if (existingIdx >= 0) {
        prop.keyframes.splice(existingIdx, 1);
        if (prop.keyframes.length === 0) {
          prop.animated = false;
        }
      } else {
        const kf = createKeyframe(snappedT, currentVal, 'linear');
        prop.keyframes.push(kf);
        prop.keyframes.sort((a, b) => a.time - b.time);
        addedRef = { layerId, propertyPath, keyframeId: kf.id };
      }
      if (propertyPath === 'transform.position') {
        recomputeSpatialTangents(prop.keyframes as Keyframe<Vec2>[]);
      }
    });

    if (addedRef) {
      set({ selectedKeyframes: [addedRef], inspectedPropertyPath: propertyPath });
    }
  },

  setSelectedKeyframes: (refs) => {
    set((state) => ({
      selectedKeyframes: refs,
      inspectedPropertyPath: refs[0] ? refs[0].propertyPath : state.inspectedPropertyPath,
    }));
  },

  moveSelectedKeyframes: (deltaTime) => {
    const { selectedKeyframes, project } = get();
    if (selectedKeyframes.length === 0 || Math.abs(deltaTime) < 1e-5) return;
    const compId = project.activeCompId;

    get().commitCommand('Move Keyframes', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;

      const touchedProps = new Set<ReturnType<typeof getLayerPropertyByPath>>();
      for (const ref of selectedKeyframes) {
        const layer = comp.layers.find((l) => l.id === ref.layerId);
        if (!layer || layer.locked) continue;
        const prop = getLayerPropertyByPath(layer, ref.propertyPath);
        if (!prop) continue;
        const kf = prop.keyframes.find((k) => k.id === ref.keyframeId);
        if (kf) {
          kf.time = clamp(snapToFrame(kf.time + deltaTime, comp.fps), 0, comp.duration);
          touchedProps.add(prop);
        }
      }

      touchedProps.forEach((p) => {
        p?.keyframes.sort((a, b) => a.time - b.time);
      });
    });
  },

  updateKeyframeTangentsAndValue: (layerId, propertyPath, keyframeId, updates) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Edit Keyframe Curve', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!comp || !layer || layer.locked) return;
      const prop = getLayerPropertyByPath(layer, propertyPath);
      if (!prop) return;
      const kf = prop.keyframes.find((k) => k.id === keyframeId);
      if (!kf) return;

      if (updates.time !== undefined) {
        kf.time = clamp(snapToFrame(updates.time, comp.fps), 0, comp.duration);
      }
      if (updates.value !== undefined) {
        kf.value = updates.value;
      }
      if (updates.inTangent) {
        kf.inTangent = updates.inTangent;
        kf.interpolation = 'bezier';
      }
      if (updates.outTangent) {
        kf.outTangent = updates.outTangent;
        kf.interpolation = 'bezier';
      }
      if (updates.spatialInTangent) {
        kf.spatialInTangent = updates.spatialInTangent;
      }
      if (updates.spatialOutTangent) {
        kf.spatialOutTangent = updates.spatialOutTangent;
      }
      prop.keyframes.sort((a, b) => a.time - b.time);
      if (
        propertyPath === 'transform.position' &&
        updates.value !== undefined &&
        !updates.spatialInTangent &&
        !updates.spatialOutTangent
      ) {
        recomputeSpatialTangents(prop.keyframes as Keyframe<Vec2>[]);
      }
    });
  },

  deleteSelectedKeyframes: () => {
    const { selectedKeyframes, project } = get();
    if (selectedKeyframes.length === 0) return;
    const compId = project.activeCompId;

    get().commitCommand('Delete Keyframes', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;
      for (const ref of selectedKeyframes) {
        const layer = comp.layers.find((l) => l.id === ref.layerId);
        if (!layer || layer.locked) continue;
        const prop = getLayerPropertyByPath(layer, ref.propertyPath);
        if (!prop) continue;
        prop.keyframes = prop.keyframes.filter((k) => k.id !== ref.keyframeId);
        if (prop.keyframes.length === 0) {
          prop.animated = false;
        }
      }
    });
    set({ selectedKeyframes: [] });
  },

  applyEasingToSelectedKeyframes: (preset) => {
    const { selectedKeyframes, selectedLayerIds, project } = get();
    const compId = project.activeCompId;

    get().commitCommand(`Apply ${preset}`, (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      if (!comp) return;

      const applyPresetToKf = (kf: Keyframe<unknown>) => {
        if (preset === 'linear') {
          kf.interpolation = 'linear';
          kf.inTangent = { x: 0.25, y: 0 };
          kf.outTangent = { x: 0.25, y: 0 };
        } else if (preset === 'hold') {
          kf.interpolation = 'hold';
        } else if (preset === 'easy-ease') {
          kf.interpolation = 'bezier';
          kf.inTangent = { x: 0.42, y: 0 };
          kf.outTangent = { x: 0.42, y: 0 };
        } else if (preset === 'ease-in') {
          kf.interpolation = 'bezier';
          kf.inTangent = { x: 0.65, y: 0 };
          kf.outTangent = { x: 0.15, y: 0 };
        } else if (preset === 'ease-out') {
          kf.interpolation = 'bezier';
          kf.inTangent = { x: 0.15, y: 0 };
          kf.outTangent = { x: 0.65, y: 0 };
        }
      };

      if (selectedKeyframes.length > 0) {
        for (const ref of selectedKeyframes) {
          const layer = comp.layers.find((l) => l.id === ref.layerId);
          if (!layer || layer.locked) continue;
          const prop = getLayerPropertyByPath(layer, ref.propertyPath);
          const kf = prop?.keyframes.find((k) => k.id === ref.keyframeId);
          if (kf) applyPresetToKf(kf);
        }
      } else if (selectedLayerIds.length > 0) {
        for (const layerId of selectedLayerIds) {
          const layer = comp.layers.find((l) => l.id === layerId);
          if (!layer || layer.locked) continue;
          for (const entry of listLayerAnimatableProperties(layer)) {
            if (entry.property.animated) {
              for (const kf of entry.property.keyframes) {
                applyPresetToKf(kf);
              }
            }
          }
        }
      }
    });
  },

  copySelectedKeyframes: () => {
    const { selectedKeyframes } = get();
    if (selectedKeyframes.length === 0) return;
    const comp = get().getActiveComp();
    const collected: { time: number; item: Omit<ClipboardKeyframe, 'relativeTime'> }[] = [];

    for (const ref of selectedKeyframes) {
      const layer = comp.layers.find((l) => l.id === ref.layerId);
      if (!layer) continue;
      const prop = getLayerPropertyByPath(layer, ref.propertyPath);
      const kf = prop?.keyframes.find((k) => k.id === ref.keyframeId);
      if (!kf) continue;
      collected.push({
        time: kf.time,
        item: {
          propertyPath: ref.propertyPath,
          value: JSON.parse(JSON.stringify(kf.value)),
          interpolation: kf.interpolation,
          inTangent: { ...kf.inTangent },
          outTangent: { ...kf.outTangent },
        },
      });
    }

    if (collected.length === 0) return;
    const minTime = Math.min(...collected.map((c) => c.time));
    const clipboard: ClipboardKeyframe[] = collected.map((c) => ({
      ...c.item,
      relativeTime: c.time - minTime,
    }));
    set({ clipboardKeyframes: clipboard });
  },

  pasteKeyframesAtPlayhead: () => {
    const { clipboardKeyframes, selectedLayerIds, currentTime, project } = get();
    if (clipboardKeyframes.length === 0 || selectedLayerIds.length === 0) return;
    const compId = project.activeCompId;
    const targetLayerId = selectedLayerIds[0];

    get().commitCommand('Paste Keyframes', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === targetLayerId);
      if (!comp || !layer || layer.locked) return;

      for (const clip of clipboardKeyframes) {
        const prop = getLayerPropertyByPath(layer, clip.propertyPath);
        if (!prop) continue;
        prop.animated = true;
        const pasteTime = clamp(
          snapToFrame(currentTime + clip.relativeTime, comp.fps),
          0,
          comp.duration
        );
        const existingIdx = prop.keyframes.findIndex((k) => Math.abs(k.time - pasteTime) < 0.001);
        const newKf = createKeyframe(
          pasteTime,
          JSON.parse(JSON.stringify(clip.value)),
          clip.interpolation,
          { ...clip.inTangent },
          { ...clip.outTangent }
        );
        if (existingIdx >= 0) {
          prop.keyframes[existingIdx] = newKf;
        } else {
          prop.keyframes.push(newKf);
        }
        prop.keyframes.sort((a, b) => a.time - b.time);
      }
    });
  },

  jumpToAdjacentKeyframe: (direction) => {
    const { currentTime } = get();
    const comp = get().getActiveComp();
    const times: number[] = [];

    for (const layer of comp.layers) {
      const props = listLayerAnimatableProperties(layer);
      for (const entry of props) {
        if (entry.property.animated) {
          for (const kf of entry.property.keyframes) {
            times.push(kf.time);
          }
        }
      }
    }

    if (times.length === 0) return;
    const sorted = Array.from(new Set(times)).sort((a, b) => a - b);
    if (direction === 'prev') {
      const prev = [...sorted].reverse().find((t) => t < currentTime - 0.002);
      if (prev !== undefined) set({ currentTime: prev, isPlaying: false });
    } else {
      const next = sorted.find((t) => t > currentTime + 0.002);
      if (next !== undefined) set({ currentTime: next, isPlaying: false });
    }
  },

  setPropertyExpression: (layerId, propertyPath, expression, enabled) => {
    const compId = get().project.activeCompId;
    get().commitCommand('Update Expression', (draft) => {
      const comp = draft.compositions.find((c) => c.id === compId);
      const layer = comp?.layers.find((l) => l.id === layerId);
      if (!layer) return;
      const prop = getLayerPropertyByPath(layer, propertyPath);
      if (!prop) return;
      prop.expression = expression;
      prop.expressionEnabled = enabled;
    });
  },

  setCurrentTime: (time) => {
    const comp = get().getActiveComp();
    set({ currentTime: clamp(time, 0, comp.duration) });
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  togglePlayPause: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setLoopMode: (mode) => set({ loopMode: mode }),

  setMeasuredFps: (fps) => set({ measuredFps: fps }),

  setTimelineZoom: (zoom) => set({ timelineZoom: clamp(zoom, 25, 600) }),

  setTimelineScrollX: (scrollX) => set({ timelineScrollX: Math.max(0, scrollX) }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setActiveShapeType: (shapeType) => set({ activeShapeType: shapeType }),

  setViewportZoom: (zoom) => set({ viewportZoom: clamp(zoom, 0.1, 8.0) }),

  setViewportPan: (pan) => set({ viewportPan: pan }),

  fitViewportToComp: (viewportWidth = 960, viewportHeight = 540) => {
    const comp = get().getActiveComp();
    const scaleX = (viewportWidth - 96) / Math.max(1, comp.width);
    const scaleY = (viewportHeight - 96) / Math.max(1, comp.height);
    const zoom = clamp(Math.min(scaleX, scaleY), 0.1, 2.0);
    set({ viewportZoom: Number(zoom.toFixed(2)), viewportPan: [0, 0] });
  },

  setPreviewResolution: (res) => set({ previewResolution: res }),

  toggleViewportFlag: (flag) => set((state) => ({ [flag]: !state[flag] })),

  setGraphEditorOpen: (open) => set({ graphEditorOpen: open }),

  setGraphEditorMode: (mode) => set({ graphEditorMode: mode }),

  setInspectedPropertyPath: (path) => set({ inspectedPropertyPath: path }),

  setRightTab: (tab) => set({ rightTab: tab }),

  setActiveModal: (modal) => set({ activeModal: modal }),

  setLastSavedAt: (iso) => set({ lastSavedAt: iso }),
}));

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__MF_STORE__ = useProjectStore;
}
