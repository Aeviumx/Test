import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Grid,
  Magnet,
  Maximize2,
  Route,
  Scan,
  Shield,
} from 'lucide-react';
import {
  computeLayerWorldMatrix,
  evaluateLayerTransform,
  evaluateProperty,
} from '../../engine/evaluator';
import { computeSegmentEase, interpolateValues } from '../../engine/interpolation';
import { globalFrameCache } from '../../render/FrameCache';
import { WebGLCompositionRenderer } from '../../render/WebGLRenderer';
import { useProjectStore } from '../../store/useProjectStore';
import { PreviewResolution, Vec2 } from '../../types';
import {
  applyMatrixToPoint,
  buildLayerTransformMatrix,
  invertMatrix,
} from '../../utils/geometry';
import { timeToFrame } from '../../utils/timecode';

export const ViewportPanel: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const comp = useProjectStore((s) => s.getActiveComp());
  const currentTime = useProjectStore((s) => s.currentTime);
  const selectedLayerIds = useProjectStore((s) => s.selectedLayerIds);
  const activeTool = useProjectStore((s) => s.activeTool);
  const activeShapeType = useProjectStore((s) => s.activeShapeType);
  const viewportZoom = useProjectStore((s) => s.viewportZoom);
  const viewportPan = useProjectStore((s) => s.viewportPan);
  const previewResolution = useProjectStore((s) => s.previewResolution);
  const showGrid = useProjectStore((s) => s.showGrid);
  const showSafeZones = useProjectStore((s) => s.showSafeZones);
  const showRulers = useProjectStore((s) => s.showRulers);
  const showMotionPaths = useProjectStore((s) => s.showMotionPaths);
  const showCheckerboard = useProjectStore((s) => s.showCheckerboard);
  const snapEnabled = useProjectStore((s) => s.snapEnabled);

  const selectLayer = useProjectStore((s) => s.selectLayer);
  const setPropertyValue = useProjectStore((s) => s.setPropertyValue);
  const addLayer = useProjectStore((s) => s.addLayer);
  const addVertexToShapeOrMask = useProjectStore((s) => s.addVertexToShapeOrMask);
  const updateKeyframeTangentsAndValue = useProjectStore((s) => s.updateKeyframeTangentsAndValue);
  const setViewportZoom = useProjectStore((s) => s.setViewportZoom);
  const setViewportPan = useProjectStore((s) => s.setViewportPan);
  const fitViewportToComp = useProjectStore((s) => s.fitViewportToComp);
  const setPreviewResolution = useProjectStore((s) => s.setPreviewResolution);
  const toggleViewportFlag = useProjectStore((s) => s.toggleViewportFlag);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);

  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLCompositionRenderer | null>(null);

  const [renderTrigger, setRenderTrigger] = useState(0);
  const [cursorCompPos, setCursorCompPos] = useState<Vec2>([0, 0]);
  const [snapGuideX, setSnapGuideX] = useState<number | null>(null);
  const [snapGuideY, setSnapGuideY] = useState<number | null>(null);

  const resScale =
    previewResolution === 'full' ? 1 : previewResolution === 'half' ? 0.5 : 0.25;

  // Initialize WebGL2 Renderer
  useEffect(() => {
    if (!glCanvasRef.current) return;
    rendererRef.current = new WebGLCompositionRenderer(glCanvasRef.current, () => {
      setRenderTrigger((n) => n + 1);
    });
  }, []);

  // Auto-fit on initial mount or comp dimension change
  useEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 100) {
      fitViewportToComp(rect.width, rect.height);
    }
  }, [comp.id, comp.width, comp.height, fitViewportToComp]);

  // Render active frame on WebGL2 Canvas whenever state or time changes
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.renderComposition(
      comp,
      currentTime,
      project,
      resScale,
      showCheckerboard
    );
    globalFrameCache.markFrameCached(comp.id, timeToFrame(currentTime, comp.fps));
  }, [comp, currentTime, project, resScale, showCheckerboard, renderTrigger]);

  // Convert client mouse coordinates to Composition coordinates (0..comp.width, 0..comp.height)
  const clientToCompCoords = (clientX: number, clientY: number): Vec2 => {
    if (!containerRef.current) return [0, 0];
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2 + viewportPan[0];
    const centerY = rect.height / 2 + viewportPan[1];
    const compLeft = centerX - (comp.width * viewportZoom) / 2;
    const compTop = centerY - (comp.height * viewportZoom) / 2;
    const x = (clientX - rect.left - compLeft) / viewportZoom;
    const y = (clientY - rect.top - compTop) / viewportZoom;
    return [x, y];
  };

  const selectedLayer = comp.layers.find((l) => l.id === selectedLayerIds[0]) ?? null;
  const selectedLayerIdx = selectedLayer ? comp.layers.indexOf(selectedLayer) : 0;

  // Hit-test layers from top to bottom at composition coordinates
  const hitTestLayerAt = (compPt: Vec2) => {
    for (let i = 0; i < comp.layers.length; i++) {
      const l = comp.layers[i];
      if (!l.visible || l.locked || l.type === 'audio' || l.type === 'adjustment') continue;
      if (currentTime < l.inPoint || currentTime > l.outPoint) continue;
      const worldMat = computeLayerWorldMatrix(l, comp, currentTime);
      const invMat = invertMatrix(worldMat);
      const localPt = applyMatrixToPoint(invMat, compPt);
      if (
        localPt[0] >= 0 &&
        localPt[0] <= l.width &&
        localPt[1] >= 0 &&
        localPt[1] <= l.height
      ) {
        return l;
      }
    }
    return null;
  };

  // Start dragging pan, zoom, shape creation, text creation, or layer translation
  const handleViewportMouseDown = (e: React.MouseEvent) => {
    const compPt = clientToCompCoords(e.clientX, e.clientY);

    // Middle mouse button or Hand tool (H) -> Pan viewport
    if (e.button === 1 || activeTool === 'hand') {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPan: Vec2 = [...viewportPan];
      const onMove = (me: MouseEvent) => {
        setViewportPan([
          startPan[0] + (me.clientX - startX),
          startPan[1] + (me.clientY - startY),
        ]);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    if (e.button !== 0) return;

    // Zoom tool (Z)
    if (activeTool === 'zoom') {
      const factor = e.altKey ? 0.8 : 1.25;
      setViewportZoom(viewportZoom * factor);
      return;
    }

    // Text tool (T): Click to create a new Text Layer at click point
    if (activeTool === 'text') {
      addLayer('text', {
        text: 'NEW TEXT',
        position: [Math.round(compPt[0]), Math.round(compPt[1])],
      });
      setActiveTool('select');
      return;
    }

    // Shape tool (Q): Drag on canvas to create a new Shape Layer
    if (activeTool === 'shape') {
      const startCompPt: Vec2 = [Math.round(compPt[0]), Math.round(compPt[1])];
      const newLayerId = addLayer('shape', {
        shapeType: activeShapeType,
        position: startCompPt,
        width: 240,
        height: 240,
      });

      const onMove = (me: MouseEvent) => {
        const curPt = clientToCompCoords(me.clientX, me.clientY);
        const w = Math.max(40, Math.round(Math.abs(curPt[0] - startCompPt[0]) * 2));
        const h = me.shiftKey
          ? w
          : Math.max(40, Math.round(Math.abs(curPt[1] - startCompPt[1]) * 2));
        setPropertyValue(newLayerId, 'shapeContents.size', [w, h]);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setActiveTool('select');
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    // Pen tool (G): Add Bezier Vertex to selected shape path or create a new path shape layer
    if (activeTool === 'pen') {
      if (selectedLayer && selectedLayer.type === 'shape') {
        const worldMat = computeLayerWorldMatrix(selectedLayer, comp, currentTime);
        const invMat = invertMatrix(worldMat);
        const localPt = applyMatrixToPoint(invMat, compPt);
        addVertexToShapeOrMask(selectedLayer.id, {
          x: Math.round(localPt[0]),
          y: Math.round(localPt[1]),
          inX: -25,
          inY: 0,
          outX: 25,
          outY: 0,
        });
      } else {
        const id = addLayer('shape', {
          name: 'Bezier Path Shape',
          shapeType: 'path',
          width: comp.width,
          height: comp.height,
          position: [comp.width / 2, comp.height / 2],
        });
        updateShapeVerticesForNewPen(id, compPt);
      }
      return;
    }

    // Hit test layer under cursor
    const hit = hitTestLayerAt(compPt);
    if (!hit) {
      selectLayer(null);
      return;
    }

    selectLayer(hit.id, e.shiftKey);

    const hitIdx = comp.layers.indexOf(hit);
    const startTr = evaluateLayerTransform(hit, currentTime, comp, hitIdx);
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;

    // Rotation tool (W)
    if (activeTool === 'rotate') {
      const startRot = startTr.rotation;
      const worldMat = computeLayerWorldMatrix(hit, comp, currentTime);
      const anchorWorld = applyMatrixToPoint(worldMat, startTr.anchorPoint);
      const startAngle = Math.atan2(compPt[1] - anchorWorld[1], compPt[0] - anchorWorld[0]);
      const onMove = (me: MouseEvent) => {
        const curPt = clientToCompCoords(me.clientX, me.clientY);
        const curAngle = Math.atan2(curPt[1] - anchorWorld[1], curPt[0] - anchorWorld[0]);
        let deltaDeg = ((curAngle - startAngle) * 180) / Math.PI;
        if (deltaDeg > 180) deltaDeg -= 360;
        if (deltaDeg < -180) deltaDeg += 360;
        let nextRot = Math.round((startRot + deltaDeg) * 10) / 10;
        if (me.shiftKey) nextRot = Math.round(nextRot / 15) * 15;
        setPropertyValue(hit.id, 'transform.rotation', nextRot);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    // Pan Behind / Anchor Point tool (Y) — keeps layer visually stationary under any rotation/scale
    if (activeTool === 'anchor') {
      const startLocalMat = buildLayerTransformMatrix(startTr);
      const startWorldMat = computeLayerWorldMatrix(hit, comp, currentTime);
      const invStartWorldMat = invertMatrix(startWorldMat);
      const startLocalClick = applyMatrixToPoint(invStartWorldMat, compPt);
      const startAnchor: Vec2 = [...startTr.anchorPoint];

      const onMove = (me: MouseEvent) => {
        const curPt = clientToCompCoords(me.clientX, me.clientY);
        const curLocalPt = applyMatrixToPoint(invStartWorldMat, curPt);
        const newAnchor: Vec2 = [
          Math.round(startAnchor[0] + (curLocalPt[0] - startLocalClick[0])),
          Math.round(startAnchor[1] + (curLocalPt[1] - startLocalClick[1])),
        ];
        const newPos = applyMatrixToPoint(startLocalMat, newAnchor);
        setPropertyValue(hit.id, 'transform.anchorPoint', newAnchor);
        setPropertyValue(hit.id, 'transform.position', [
          Math.round(newPos[0]),
          Math.round(newPos[1]),
        ]);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    // Default Selection Tool (V): Drag layer position with smart snapping
    const startPos: Vec2 = [...startTr.position];
    const onMove = (me: MouseEvent) => {
      const dx = (me.clientX - startMouseX) / viewportZoom;
      const dy = (me.clientY - startMouseY) / viewportZoom;
      let nextX = Math.round(startPos[0] + dx);
      let nextY = Math.round(startPos[1] + dy);

      let guideX: number | null = null;
      let guideY: number | null = null;

      if (snapEnabled && !me.altKey) {
        const snapThreshold = 8 / viewportZoom;
        const xTargets = [0, comp.width / 2, comp.width];
        const yTargets = [0, comp.height / 2, comp.height];
        for (const tx of xTargets) {
          if (Math.abs(nextX - tx) <= snapThreshold) {
            nextX = tx;
            guideX = tx;
            break;
          }
        }
        for (const ty of yTargets) {
          if (Math.abs(nextY - ty) <= snapThreshold) {
            nextY = ty;
            guideY = ty;
            break;
          }
        }
      }

      setSnapGuideX(guideX);
      setSnapGuideY(guideY);
      setPropertyValue(hit.id, 'transform.position', [nextX, nextY]);
    };

    const onUp = () => {
      setSnapGuideX(null);
      setSnapGuideY(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const updateShapeVerticesForNewPen = (layerId: string, pt: Vec2) => {
    useProjectStore.getState().updateShapeVertices(
      layerId,
      [
        {
          x: Math.round(pt[0]),
          y: Math.round(pt[1]),
          inX: -30,
          inY: 0,
          outX: 30,
          outY: 0,
        },
      ],
      false
    );
  };

  // Start dragging a scale handle or rotation handle on the selected layer's gizmo
  const startGizmoHandleDrag = (
    e: React.MouseEvent,
    handleType: 'scale' | 'rotate' | 'anchor',
    dirX = 1,
    dirY = 1
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selectedLayer || selectedLayer.locked) return;

    const startTr = evaluateLayerTransform(selectedLayer, currentTime, comp, selectedLayerIdx);
    const startCompPt = clientToCompCoords(e.clientX, e.clientY);
    const startLocalMat = buildLayerTransformMatrix(startTr);
    const startWorldMat = computeLayerWorldMatrix(selectedLayer, comp, currentTime);
    const invStartWorldMat = invertMatrix(startWorldMat);
    const anchorWorld = applyMatrixToPoint(startWorldMat, startTr.anchorPoint);
    const startAngle = Math.atan2(
      startCompPt[1] - anchorWorld[1],
      startCompPt[0] - anchorWorld[0]
    );
    const startLocalClick = applyMatrixToPoint(invStartWorldMat, startCompPt);
    const worldRotRad = Math.atan2(startWorldMat[1], startWorldMat[0]);
    const cosR = Math.cos(worldRotRad);
    const sinR = Math.sin(worldRotRad);

    const onMove = (me: MouseEvent) => {
      const curCompPt = clientToCompCoords(me.clientX, me.clientY);

      if (handleType === 'rotate') {
        const curAngle = Math.atan2(
          curCompPt[1] - anchorWorld[1],
          curCompPt[0] - anchorWorld[0]
        );
        let deltaDeg = ((curAngle - startAngle) * 180) / Math.PI;
        if (deltaDeg > 180) deltaDeg -= 360;
        if (deltaDeg < -180) deltaDeg += 360;
        let nextRot = Math.round((startTr.rotation + deltaDeg) * 10) / 10;
        if (me.shiftKey) nextRot = Math.round(nextRot / 15) * 15;
        setPropertyValue(selectedLayer.id, 'transform.rotation', nextRot);
      } else if (handleType === 'anchor') {
        const curLocalPt = applyMatrixToPoint(invStartWorldMat, curCompPt);
        const newAnchor: Vec2 = [
          Math.round(startTr.anchorPoint[0] + (curLocalPt[0] - startLocalClick[0])),
          Math.round(startTr.anchorPoint[1] + (curLocalPt[1] - startLocalClick[1])),
        ];
        const newPos = applyMatrixToPoint(startLocalMat, newAnchor);
        setPropertyValue(selectedLayer.id, 'transform.anchorPoint', newAnchor);
        setPropertyValue(selectedLayer.id, 'transform.position', [
          Math.round(newPos[0]),
          Math.round(newPos[1]),
        ]);
      } else {
        const compDx = curCompPt[0] - startCompPt[0];
        const compDy = curCompPt[1] - startCompPt[1];
        // Project onto rotated layer axes
        const localDx = compDx * cosR + compDy * sinR;
        const localDy = -compDx * sinR + compDy * cosR;
        const deltaSx = (localDx * dirX) / Math.max(12, selectedLayer.width / 200);
        const deltaSy = (localDy * dirY) / Math.max(12, selectedLayer.height / 200);
        if (me.shiftKey || selectedLayer.transform.scaleConstrain) {
          const uniformDelta = Math.abs(deltaSx) > Math.abs(deltaSy) ? deltaSx : deltaSy;
          setPropertyValue(selectedLayer.id, 'transform.scale', [
            Math.round((startTr.scale[0] + uniformDelta) * 10) / 10,
            Math.round((startTr.scale[1] + uniformDelta) * 10) / 10,
          ]);
        } else {
          setPropertyValue(selectedLayer.id, 'transform.scale', [
            Math.round((startTr.scale[0] + deltaSx) * 10) / 10,
            Math.round((startTr.scale[1] + deltaSy) * 10) / 10,
          ]);
        }
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Compute selected layer bounding box corners in Composition coordinates
  const selectedLayerGizmo = (() => {
    if (!selectedLayer || !selectedLayer.visible) return null;
    const worldMat = computeLayerWorldMatrix(selectedLayer, comp, currentTime);
    const tr = evaluateLayerTransform(selectedLayer, currentTime, comp, selectedLayerIdx);
    const w = selectedLayer.width;
    const h = selectedLayer.height;

    const tl = applyMatrixToPoint(worldMat, [0, 0]);
    const trPt = applyMatrixToPoint(worldMat, [w, 0]);
    const br = applyMatrixToPoint(worldMat, [w, h]);
    const bl = applyMatrixToPoint(worldMat, [0, h]);
    const tm = applyMatrixToPoint(worldMat, [w / 2, 0]);
    const bm = applyMatrixToPoint(worldMat, [w / 2, h]);
    const ml = applyMatrixToPoint(worldMat, [0, h / 2]);
    const mr = applyMatrixToPoint(worldMat, [w, h / 2]);
    const rotHandle = applyMatrixToPoint(worldMat, [w / 2, -32 / Math.max(0.25, viewportZoom)]);
    const anchorWorld = applyMatrixToPoint(worldMat, tr.anchorPoint);

    return { tl, trPt, br, bl, tm, bm, ml, mr, rotHandle, anchorWorld, worldMat };
  })();

  // Compute Spatial Motion Path points if selected layer has animated Position
  const motionPathData = (() => {
    if (!showMotionPaths || !selectedLayer) return null;
    const posProp = selectedLayer.transform.position;
    if (!posProp.animated || posProp.keyframes.length < 2) return null;

    const kfs = posProp.keyframes;
    const curvePoints: Vec2[] = [];
    for (let i = 0; i < kfs.length - 1; i++) {
      const k1 = kfs[i];
      const k2 = kfs[i + 1];
      const steps = 24;
      for (let s = 0; s <= steps; s++) {
        const rawT = s / steps;
        const eased = computeSegmentEase(k1, k2, rawT);
        const pt = interpolateValues(k1.value, k2.value, eased, k1, k2);
        curvePoints.push(pt);
      }
    }
    return { kfs, curvePoints };
  })();

  const invZoom = 1 / Math.max(0.15, viewportZoom);

  return (
    <div className="h-full flex flex-col bg-[#161619] select-none overflow-hidden relative">
      {/* Main Interactive Viewport Stage */}
      <div
        ref={containerRef}
        onMouseDown={handleViewportMouseDown}
        onMouseMove={(e) => {
          const pt = clientToCompCoords(e.clientX, e.clientY);
          setCursorCompPos([Math.round(pt[0]), Math.round(pt[1])]);
        }}
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.12 : 0.89;
          setViewportZoom(viewportZoom * factor);
        }}
        className={`flex-1 relative overflow-hidden flex items-center justify-center ${
          activeTool === 'hand'
            ? 'cursor-grab active:cursor-grabbing'
            : activeTool === 'zoom'
            ? 'cursor-zoom-in'
            : activeTool === 'pen' || activeTool === 'shape' || activeTool === 'text'
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
      >
        {/* Top & Left Rulers */}
        {showRulers && (
          <>
            <div className="absolute top-0 left-5 right-0 h-5 bg-[#1e1e23]/90 border-b border-[#2e2e33] z-20 flex items-end px-2 pointer-events-none overflow-hidden">
              {Array.from({ length: 20 }, (_, i) => i * 200).map((px) => (
                <div
                  key={px}
                  style={{ left: `${(px / comp.width) * 100}%` }}
                  className="absolute bottom-0 border-l border-[#454552] h-2.5 pl-1 font-mono text-[9px] text-[#787885]"
                >
                  {px}
                </div>
              ))}
            </div>
            <div className="absolute top-5 left-0 bottom-0 w-5 bg-[#1e1e23]/90 border-r border-[#2e2e33] z-20 pointer-events-none overflow-hidden">
              {Array.from({ length: 12 }, (_, i) => i * 200).map((py) => (
                <div
                  key={py}
                  style={{ top: `${(py / comp.height) * 100}%` }}
                  className="absolute right-0 border-t border-[#454552] w-2.5 pt-0.5 font-mono text-[8px] text-[#787885]"
                >
                  {py}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Scaled & Panned Composition Wrapper */}
        <div
          style={{
            width: comp.width,
            height: comp.height,
            transform: `translate(${viewportPan[0]}px, ${viewportPan[1]}px) scale(${viewportZoom})`,
            transformOrigin: 'center center',
          }}
          className={`relative shadow-[0_0_60px_rgba(0,0,0,0.85)] ring-1 ring-[#383842] ${
            showCheckerboard ? 'checkerboard-bg' : ''
          }`}
        >
          {/* WebGL2 Render Canvas */}
          <canvas
            ref={glCanvasRef}
            style={{ width: comp.width, height: comp.height }}
            className="block pointer-events-none"
          />

          {/* Interactive Vector Overlay (Grid, Safe Zones, Motion Paths, Transform Gizmo) */}
          <svg
            width={comp.width}
            height={comp.height}
            viewBox={`0 0 ${comp.width} ${comp.height}`}
            className="absolute inset-0 overflow-visible pointer-events-none"
          >
            {/* Proportional Grid */}
            {showGrid && (
              <g stroke="rgba(255,255,255,0.12)" strokeWidth={1 * invZoom}>
                {Array.from({ length: 15 }, (_, i) => ((i + 1) * comp.width) / 16).map((x) => (
                  <line key={`gx_${x}`} x1={x} y1={0} x2={x} y2={comp.height} />
                ))}
                {Array.from({ length: 8 }, (_, i) => ((i + 1) * comp.height) / 9).map((y) => (
                  <line key={`gy_${y}`} x1={0} y1={y} x2={comp.width} y2={y} />
                ))}
              </g>
            )}

            {/* Action Safe (90%) & Title Safe (80%) Zones */}
            {showSafeZones && (
              <g fill="none" stroke="rgba(0, 209, 178, 0.32)" strokeWidth={1 * invZoom}>
                <rect
                  x={comp.width * 0.05}
                  y={comp.height * 0.05}
                  width={comp.width * 0.9}
                  height={comp.height * 0.9}
                  strokeDasharray={`${6 * invZoom} ${4 * invZoom}`}
                />
                <rect
                  x={comp.width * 0.1}
                  y={comp.height * 0.1}
                  width={comp.width * 0.8}
                  height={comp.height * 0.8}
                />
                <line
                  x1={comp.width / 2 - 15 * invZoom}
                  y1={comp.height / 2}
                  x2={comp.width / 2 + 15 * invZoom}
                  y2={comp.height / 2}
                />
                <line
                  x1={comp.width / 2}
                  y1={comp.height / 2 - 15 * invZoom}
                  x2={comp.width / 2}
                  y2={comp.height / 2 + 15 * invZoom}
                />
              </g>
            )}

            {/* Smart Alignment Snap Guides */}
            {snapGuideX !== null && (
              <line
                x1={snapGuideX}
                y1={0}
                x2={snapGuideX}
                y2={comp.height}
                stroke="#00d1b2"
                strokeWidth={1.5 * invZoom}
              />
            )}
            {snapGuideY !== null && (
              <line
                x1={0}
                y1={snapGuideY}
                x2={comp.width}
                y2={snapGuideY}
                stroke="#00d1b2"
                strokeWidth={1.5 * invZoom}
              />
            )}

            {/* Null Object Helper Wireframes */}
            {comp.layers
              .filter(
                (l) =>
                  l.type === 'null' &&
                  l.visible &&
                  currentTime >= l.inPoint &&
                  currentTime <= l.outPoint
              )
              .map((nullLayer) => {
                const m = computeLayerWorldMatrix(nullLayer, comp, currentTime);
                const p0 = applyMatrixToPoint(m, [0, 0]);
                const p1 = applyMatrixToPoint(m, [nullLayer.width, 0]);
                const p2 = applyMatrixToPoint(m, [nullLayer.width, nullLayer.height]);
                const p3 = applyMatrixToPoint(m, [0, nullLayer.height]);
                return (
                  <g key={`null_helper_${nullLayer.id}`}>
                    <polygon
                      points={`${p0[0]},${p0[1]} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`}
                      fill="rgba(244, 63, 94, 0.08)"
                      stroke="#f43f5e"
                      strokeWidth={1.5 * invZoom}
                      strokeDasharray={`${5 * invZoom} ${3 * invZoom}`}
                    />
                    <text
                      x={p0[0] + 4 * invZoom}
                      y={p0[1] - 5 * invZoom}
                      fill="#f43f5e"
                      fontSize={10 * invZoom}
                      fontFamily="JetBrains Mono"
                      fontWeight="bold"
                    >
                      {nullLayer.name}
                    </text>
                  </g>
                );
              })}

            {/* Spatial Bezier Motion Path Trajectory & Handles */}
            {motionPathData && selectedLayer && (
              <g>
                <polyline
                  fill="none"
                  stroke="#00d1b2"
                  strokeWidth={1.75 * invZoom}
                  strokeDasharray={`${4 * invZoom} ${3 * invZoom}`}
                  points={motionPathData.curvePoints.map((p) => `${p[0]},${p[1]}`).join(' ')}
                />
                {motionPathData.kfs.map((kf) => {
                  const pt = kf.value;
                  const outTan = kf.spatialOutTangent;
                  const inTan = kf.spatialInTangent;
                  return (
                    <g key={kf.id}>
                      {outTan && (
                        <>
                          <line
                            x1={pt[0]}
                            y1={pt[1]}
                            x2={pt[0] + outTan[0]}
                            y2={pt[1] + outTan[1]}
                            stroke="#f59e0b"
                            strokeWidth={1.2 * invZoom}
                          />
                          <circle
                            cx={pt[0] + outTan[0]}
                            cy={pt[1] + outTan[1]}
                            r={4.5 * invZoom}
                            fill="#f59e0b"
                            className="pointer-events-auto cursor-move"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              const startX = e.clientX;
                              const startY = e.clientY;
                              const orig: Vec2 = [...outTan];
                              const onMove = (me: MouseEvent) => {
                                updateKeyframeTangentsAndValue(
                                  selectedLayer.id,
                                  'transform.position',
                                  kf.id,
                                  {
                                    spatialOutTangent: [
                                      Math.round(orig[0] + (me.clientX - startX) / viewportZoom),
                                      Math.round(orig[1] + (me.clientY - startY) / viewportZoom),
                                    ],
                                  }
                                );
                              };
                              const onUp = () => {
                                window.removeEventListener('mousemove', onMove);
                                window.removeEventListener('mouseup', onUp);
                              };
                              window.addEventListener('mousemove', onMove);
                              window.addEventListener('mouseup', onUp);
                            }}
                          />
                        </>
                      )}
                      {inTan && (
                        <>
                          <line
                            x1={pt[0]}
                            y1={pt[1]}
                            x2={pt[0] + inTan[0]}
                            y2={pt[1] + inTan[1]}
                            stroke="#f59e0b"
                            strokeWidth={1.2 * invZoom}
                          />
                          <circle
                            cx={pt[0] + inTan[0]}
                            cy={pt[1] + inTan[1]}
                            r={4.5 * invZoom}
                            fill="#f59e0b"
                            className="pointer-events-auto cursor-move"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              const startX = e.clientX;
                              const startY = e.clientY;
                              const orig: Vec2 = [...inTan];
                              const onMove = (me: MouseEvent) => {
                                updateKeyframeTangentsAndValue(
                                  selectedLayer.id,
                                  'transform.position',
                                  kf.id,
                                  {
                                    spatialInTangent: [
                                      Math.round(orig[0] + (me.clientX - startX) / viewportZoom),
                                      Math.round(orig[1] + (me.clientY - startY) / viewportZoom),
                                    ],
                                  }
                                );
                              };
                              const onUp = () => {
                                window.removeEventListener('mousemove', onMove);
                                window.removeEventListener('mouseup', onUp);
                              };
                              window.addEventListener('mousemove', onMove);
                              window.addEventListener('mouseup', onUp);
                            }}
                          />
                        </>
                      )}
                      <rect
                        x={pt[0] - 5 * invZoom}
                        y={pt[1] - 5 * invZoom}
                        width={10 * invZoom}
                        height={10 * invZoom}
                        fill="#00d1b2"
                        stroke="#161619"
                        strokeWidth={1.5 * invZoom}
                        transform={`rotate(45 ${pt[0]} ${pt[1]})`}
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* Selected Layer Bounding Box, Resize Handles, Rotation Stem, and Anchor Point */}
            {selectedLayerGizmo && selectedLayer && (
              <g>
                <polygon
                  points={`${selectedLayerGizmo.tl[0]},${selectedLayerGizmo.tl[1]} ${selectedLayerGizmo.trPt[0]},${selectedLayerGizmo.trPt[1]} ${selectedLayerGizmo.br[0]},${selectedLayerGizmo.br[1]} ${selectedLayerGizmo.bl[0]},${selectedLayerGizmo.bl[1]}`}
                  fill="none"
                  stroke="#6c5ce7"
                  strokeWidth={1.8 * invZoom}
                />

                {/* Rotation Handle Stem */}
                <line
                  x1={selectedLayerGizmo.tm[0]}
                  y1={selectedLayerGizmo.tm[1]}
                  x2={selectedLayerGizmo.rotHandle[0]}
                  y2={selectedLayerGizmo.rotHandle[1]}
                  stroke="#6c5ce7"
                  strokeWidth={1.5 * invZoom}
                />
                <circle
                  cx={selectedLayerGizmo.rotHandle[0]}
                  cy={selectedLayerGizmo.rotHandle[1]}
                  r={6 * invZoom}
                  fill="#00d1b2"
                  stroke="#161619"
                  strokeWidth={1.5 * invZoom}
                  className="pointer-events-auto cursor-grab"
                  onMouseDown={(e) => startGizmoHandleDrag(e, 'rotate')}
                />

                {/* 8 Scale Handles */}
                {[
                  { pt: selectedLayerGizmo.tl, dx: -1, dy: -1 },
                  { pt: selectedLayerGizmo.trPt, dx: 1, dy: -1 },
                  { pt: selectedLayerGizmo.br, dx: 1, dy: 1 },
                  { pt: selectedLayerGizmo.bl, dx: -1, dy: 1 },
                  { pt: selectedLayerGizmo.tm, dx: 0, dy: -1 },
                  { pt: selectedLayerGizmo.bm, dx: 0, dy: 1 },
                  { pt: selectedLayerGizmo.ml, dx: -1, dy: 0 },
                  { pt: selectedLayerGizmo.mr, dx: 1, dy: 0 },
                ].map((h, i) => (
                  <rect
                    key={i}
                    x={h.pt[0] - 5 * invZoom}
                    y={h.pt[1] - 5 * invZoom}
                    width={10 * invZoom}
                    height={10 * invZoom}
                    fill="#ffffff"
                    stroke="#6c5ce7"
                    strokeWidth={1.8 * invZoom}
                    className="pointer-events-auto cursor-nwse-resize"
                    onMouseDown={(e) => startGizmoHandleDrag(e, 'scale', h.dx, h.dy)}
                  />
                ))}

                {/* Anchor Point Reticle */}
                <g
                  className="pointer-events-auto cursor-move"
                  onMouseDown={(e) => startGizmoHandleDrag(e, 'anchor')}
                >
                  <circle
                    cx={selectedLayerGizmo.anchorWorld[0]}
                    cy={selectedLayerGizmo.anchorWorld[1]}
                    r={7 * invZoom}
                    fill="rgba(108, 92, 231, 0.25)"
                    stroke="#00d1b2"
                    strokeWidth={1.8 * invZoom}
                  />
                  <line
                    x1={selectedLayerGizmo.anchorWorld[0] - 10 * invZoom}
                    y1={selectedLayerGizmo.anchorWorld[1]}
                    x2={selectedLayerGizmo.anchorWorld[0] + 10 * invZoom}
                    y2={selectedLayerGizmo.anchorWorld[1]}
                    stroke="#00d1b2"
                    strokeWidth={1.5 * invZoom}
                  />
                  <line
                    x1={selectedLayerGizmo.anchorWorld[0]}
                    y1={selectedLayerGizmo.anchorWorld[1] - 10 * invZoom}
                    x2={selectedLayerGizmo.anchorWorld[0]}
                    y2={selectedLayerGizmo.anchorWorld[1] + 10 * invZoom}
                    stroke="#00d1b2"
                    strokeWidth={1.5 * invZoom}
                  />
                </g>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Bottom Viewport Status & Overlay Controls Bar */}
      <div className="h-8 bg-[#232327] border-t border-[#2e2e33] px-3 flex items-center justify-between text-[11px] shrink-0 z-20">
        {/* Left: Zoom & Fit Controls */}
        <div className="flex items-center gap-1.5">
          <select
            value={Math.round(viewportZoom * 100)}
            onChange={(e) => setViewportZoom(Number(e.target.value) / 100)}
            className="h-6 px-1.5 bg-[#1a1a1d] border border-[#2e2e33] rounded font-mono text-[11px] text-white outline-none"
          >
            {[15, 25, 33, 50, 75, 100, 150, 200, 400].map((pct) => (
              <option key={pct} value={pct}>
                {pct}%
              </option>
            ))}
            {![15, 25, 33, 50, 75, 100, 150, 200, 400].includes(Math.round(viewportZoom * 100)) && (
              <option value={Math.round(viewportZoom * 100)}>
                {Math.round(viewportZoom * 100)}%
              </option>
            )}
          </select>

          <button
            type="button"
            onClick={() => {
              if (containerRef.current) {
                const r = containerRef.current.getBoundingClientRect();
                fitViewportToComp(r.width, r.height);
              } else {
                fitViewportToComp();
              }
            }}
            title="Fit Composition to Viewport (Shift+/)"
            className="h-6 px-2 rounded bg-[#1a1a1d] hover:bg-[#2a2a32] border border-[#2e2e33] text-[#d4d4dc] flex items-center gap-1 text-[11px]"
          >
            <Maximize2 className="w-3 h-3 text-[#6c5ce7]" />
            <span>Fit</span>
          </button>

          <div className="h-4 w-px bg-[#2e2e33] mx-1" />

          {/* Preview Resolution */}
          <select
            value={previewResolution}
            onChange={(e) => setPreviewResolution(e.target.value as PreviewResolution)}
            title="WebGL2 Render Resolution"
            className="h-6 px-1.5 bg-[#1a1a1d] border border-[#2e2e33] rounded text-[11px] text-[#00d1b2] font-medium outline-none"
          >
            <option value="full">Full (1:1)</option>
            <option value="half">Half (1:2)</option>
            <option value="quarter">Quarter (1:4)</option>
          </select>
        </div>

        {/* Center: Viewport Overlay Toggles */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => toggleViewportFlag('showGrid')}
            title="Toggle Proportional Grid"
            className={`h-6 px-2 rounded flex items-center gap-1 border transition-colors ${
              showGrid
                ? 'bg-[#6c5ce7]/25 border-[#6c5ce7] text-white'
                : 'bg-[#1a1a1d] border-[#2e2e33] text-[#9b9ba6] hover:text-white'
            }`}
          >
            <Grid className="w-3 h-3" />
            <span className="hidden md:inline">Grid</span>
          </button>

          <button
            type="button"
            onClick={() => toggleViewportFlag('showSafeZones')}
            title="Toggle Title/Action Safe Zones"
            className={`h-6 px-2 rounded flex items-center gap-1 border transition-colors ${
              showSafeZones
                ? 'bg-[#6c5ce7]/25 border-[#6c5ce7] text-white'
                : 'bg-[#1a1a1d] border-[#2e2e33] text-[#9b9ba6] hover:text-white'
            }`}
          >
            <Shield className="w-3 h-3" />
            <span className="hidden md:inline">Safe</span>
          </button>

          <button
            type="button"
            onClick={() => toggleViewportFlag('showMotionPaths')}
            title="Toggle Spatial Motion Trajectory & Handles"
            className={`h-6 px-2 rounded flex items-center gap-1 border transition-colors ${
              showMotionPaths
                ? 'bg-[#6c5ce7]/25 border-[#6c5ce7] text-white'
                : 'bg-[#1a1a1d] border-[#2e2e33] text-[#9b9ba6] hover:text-white'
            }`}
          >
            <Route className="w-3 h-3" />
            <span className="hidden md:inline">Paths</span>
          </button>

          <button
            type="button"
            onClick={() => toggleViewportFlag('snapEnabled')}
            title="Toggle Smart Snapping"
            className={`h-6 px-2 rounded flex items-center gap-1 border transition-colors ${
              snapEnabled
                ? 'bg-[#00d1b2]/20 border-[#00d1b2] text-[#00d1b2]'
                : 'bg-[#1a1a1d] border-[#2e2e33] text-[#9b9ba6] hover:text-white'
            }`}
          >
            <Magnet className="w-3 h-3" />
            <span className="hidden md:inline">Snap</span>
          </button>

          <button
            type="button"
            onClick={() => toggleViewportFlag('showCheckerboard')}
            title="Toggle Transparency Grid"
            className={`h-6 px-2 rounded flex items-center gap-1 border transition-colors ${
              showCheckerboard
                ? 'bg-[#6c5ce7]/25 border-[#6c5ce7] text-white'
                : 'bg-[#1a1a1d] border-[#2e2e33] text-[#9b9ba6] hover:text-white'
            }`}
          >
            <Scan className="w-3 h-3" />
          </button>
        </div>

        {/* Right: Cursor X/Y & Active Comp Badge */}
        <div className="flex items-center gap-3 font-mono text-[10px] text-[#9b9ba6]">
          <span className="flex items-center gap-1">
            <Crosshair className="w-3 h-3 text-[#6c5ce7]" />
            X:{cursorCompPos[0]} Y:{cursorCompPos[1]}
          </span>
          <span className="text-[#00d1b2] hidden sm:inline">WebGL2 GPU</span>
        </div>
      </div>
    </div>
  );
};
