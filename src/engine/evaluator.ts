import { Composition, Layer, Property, Vec2 } from '../types';
import {
  buildLayerTransformMatrix,
  identityMatrix,
  Mat2D,
  multiplyMatrices,
} from '../utils/geometry';
import { evaluateExpression } from './expressions';
import { evaluatePropertyKeyframes } from './interpolation';

/**
 * Evaluates any Property<T> at composition time `time`, applying keyframes and optional JS expression
 */
export function evaluateProperty<T = number | Vec2 | string>(
  prop: Property<T>,
  time: number,
  comp?: Composition,
  layer?: Layer,
  layerIndex = 0
): T {
  const kfValue = evaluatePropertyKeyframes(prop, time);

  if (prop.expressionEnabled && prop.expression.trim() && comp && layer) {
    const res = evaluateExpression<T>({
      comp,
      layer,
      layerIndex,
      property: prop as unknown as Property<number | Vec2 | string>,
      time,
      baseValue: kfValue as unknown as number | Vec2 | string,
    });
    return res.value;
  }

  return kfValue;
}

/**
 * Evaluates a Property<T> and returns both the value and any expression error string
 */
export function evaluatePropertyWithDiagnostics<T = number | Vec2 | string>(
  prop: Property<T>,
  time: number,
  comp: Composition,
  layer: Layer,
  layerIndex = 0
): { value: T; error: string | null } {
  const kfValue = evaluatePropertyKeyframes(prop, time);
  if (prop.expressionEnabled && prop.expression.trim()) {
    return evaluateExpression<T>({
      comp,
      layer,
      layerIndex,
      property: prop as unknown as Property<number | Vec2 | string>,
      time,
      baseValue: kfValue as unknown as number | Vec2 | string,
    });
  }
  return { value: kfValue, error: null };
}

export interface EvaluatedTransform {
  anchorPoint: Vec2;
  position: Vec2;
  scale: Vec2;
  rotation: number;
  opacity: number;
  skew: number;
  skewAxis: number;
}

export function evaluateLayerTransform(
  layer: Layer,
  time: number,
  comp: Composition,
  layerIndex = 0
): EvaluatedTransform {
  const t = layer.transform;
  return {
    anchorPoint: evaluateProperty(t.anchorPoint, time, comp, layer, layerIndex),
    position: evaluateProperty(t.position, time, comp, layer, layerIndex),
    scale: evaluateProperty(t.scale, time, comp, layer, layerIndex),
    rotation: evaluateProperty(t.rotation, time, comp, layer, layerIndex),
    opacity: evaluateProperty(t.opacity, time, comp, layer, layerIndex),
    skew: evaluateProperty(t.skew, time, comp, layer, layerIndex),
    skewAxis: evaluateProperty(t.skewAxis, time, comp, layer, layerIndex),
  };
}

/**
 * Computes the complete world 2D transform matrix for a layer at `time`,
 * resolving its `parentId` hierarchy and optional active 2.5D Camera layer
 */
export function computeLayerWorldMatrix(
  layer: Layer,
  comp: Composition,
  time: number,
  visited = new Set<string>()
): Mat2D {
  if (visited.has(layer.id)) {
    return identityMatrix();
  }
  visited.add(layer.id);

  const layerIdx = comp.layers.indexOf(layer);
  const tr = evaluateLayerTransform(layer, time, comp, layerIdx >= 0 ? layerIdx : 0);
  const localMat = buildLayerTransformMatrix(tr);

  let worldMat = localMat;

  if (layer.parentId) {
    const parentLayer = comp.layers.find((l) => l.id === layer.parentId);
    if (parentLayer) {
      const parentWorld = computeLayerWorldMatrix(parentLayer, comp, time, visited);
      worldMat = multiplyMatrices(parentWorld, localMat);
    }
  }

  // Apply active 2.5D Camera projection if layer is 3D-switched or camera exists
  const activeCamera = comp.layers.find(
    (l) => l.type === 'camera' && l.visible && time >= l.inPoint && time <= l.outPoint
  );
  if (activeCamera && activeCamera.id !== layer.id && layer.type !== 'adjustment') {
    const camIdx = comp.layers.indexOf(activeCamera);
    const camTr = evaluateLayerTransform(activeCamera, time, comp, camIdx);
    const zoom = activeCamera.cameraOptions
      ? evaluateProperty(activeCamera.cameraOptions.zoom, time, comp, activeCamera, camIdx)
      : 1200;
    const zoomRatio = zoom / 1200;
    const cx = comp.width / 2;
    const cy = comp.height / 2;
    const dx = cx - camTr.position[0];
    const dy = cy - camTr.position[1];
    const camRot = (-camTr.rotation * Math.PI) / 180;
    const cos = Math.cos(camRot);
    const sin = Math.sin(camRot);

    let camMat: Mat2D = [1, 0, 0, 1, cx, cy];
    camMat = multiplyMatrices(camMat, [cos, sin, -sin, cos, 0, 0]);
    camMat = multiplyMatrices(camMat, [zoomRatio, 0, 0, zoomRatio, 0, 0]);
    camMat = multiplyMatrices(camMat, [1, 0, 0, 1, -cx + dx, -cy + dy]);

    worldMat = multiplyMatrices(camMat, worldMat);
  }

  return worldMat;
}

/**
 * Computes scalar speed of a property at `time` for the Speed Graph Editor
 */
export function computePropertySpeed(
  prop: Property<number | Vec2 | string>,
  time: number,
  comp: Composition,
  layer: Layer,
  layerIndex = 0
): number {
  const dt = 1 / Math.max(60, comp.fps * 2);
  const v0 = evaluateProperty(prop, Math.max(0, time - dt), comp, layer, layerIndex);
  const v1 = evaluateProperty(prop, time + dt, comp, layer, layerIndex);
  const span = Math.max(dt, time + dt - Math.max(0, time - dt));

  if (typeof v0 === 'number' && typeof v1 === 'number') {
    return (v1 - v0) / span;
  }
  if (Array.isArray(v0) && Array.isArray(v1)) {
    return Math.hypot(v1[0] - v0[0], v1[1] - v0[1]) / span;
  }
  return 0;
}
