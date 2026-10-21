import { Layer, Property, Vec2 } from '../types';

export interface ResolvedPropertyEntry {
  path: string;
  label: string;
  groupName: string;
  property: Property<number | Vec2 | string>;
}

/**
 * Resolves a dot-separated propertyPath on a Layer (e.g., "transform.position", "shapeContents.trimEnd", "effects.0.params.radius")
 */
export function getLayerPropertyByPath(
  layer: Layer,
  propertyPath: string
): Property<number | Vec2 | string> | null {
  const parts = propertyPath.split('.');
  if (parts[0] === 'transform') {
    const key = parts[1] as keyof typeof layer.transform;
    const prop = layer.transform[key];
    if (prop && typeof prop === 'object' && 'value' in prop) {
      return prop as Property<number | Vec2 | string>;
    }
    return null;
  }

  if (parts[0] === 'shapeContents' && layer.shapeContents) {
    const key = parts[1] as keyof typeof layer.shapeContents;
    const prop = layer.shapeContents[key];
    if (prop && typeof prop === 'object' && 'value' in prop) {
      return prop as Property<number | Vec2 | string>;
    }
    return null;
  }

  if (parts[0] === 'textContents' && layer.textContents) {
    if (parts[1] === 'animator') {
      const animKey = parts[2] as keyof typeof layer.textContents.animator;
      const prop = layer.textContents.animator[animKey];
      if (prop && typeof prop === 'object' && 'value' in prop) {
        return prop as Property<number | Vec2 | string>;
      }
      return null;
    }
    const key = parts[1] as keyof typeof layer.textContents;
    const prop = layer.textContents[key];
    if (prop && typeof prop === 'object' && 'value' in prop) {
      return prop as Property<number | Vec2 | string>;
    }
    return null;
  }

  if (parts[0] === 'cameraOptions' && layer.cameraOptions) {
    const key = parts[1] as keyof typeof layer.cameraOptions;
    const prop = layer.cameraOptions[key];
    if (prop && typeof prop === 'object' && 'value' in prop) {
      return prop as Property<number | Vec2 | string>;
    }
    return null;
  }

  if (parts[0] === 'masks') {
    const idx = Number(parts[1]);
    const mask = layer.masks[idx];
    if (!mask) return null;
    const key = parts[2] as 'feather' | 'opacity' | 'expansion';
    return mask[key] ?? null;
  }

  if (parts[0] === 'effects') {
    const idx = Number(parts[1]);
    const fx = layer.effects[idx];
    if (!fx) return null;
    if (parts[2] === 'params') {
      const paramKey = parts[3];
      return fx.params[paramKey] ?? null;
    }
  }

  return null;
}

/**
 * Lists all animatable properties of a layer with their canonical paths and group labels
 */
export function listLayerAnimatableProperties(layer: Layer): ResolvedPropertyEntry[] {
  const list: ResolvedPropertyEntry[] = [
    { path: 'transform.anchorPoint', label: 'Anchor Point', groupName: 'Transform', property: layer.transform.anchorPoint },
    { path: 'transform.position', label: 'Position', groupName: 'Transform', property: layer.transform.position },
    { path: 'transform.scale', label: 'Scale', groupName: 'Transform', property: layer.transform.scale },
    { path: 'transform.rotation', label: 'Rotation', groupName: 'Transform', property: layer.transform.rotation },
    { path: 'transform.opacity', label: 'Opacity', groupName: 'Transform', property: layer.transform.opacity },
    { path: 'transform.skew', label: 'Skew', groupName: 'Transform', property: layer.transform.skew },
  ];

  if (layer.shapeContents) {
    const sc = layer.shapeContents;
    list.push(
      { path: 'shapeContents.size', label: 'Size', groupName: 'Contents', property: sc.size },
      { path: 'shapeContents.cornerRadius', label: 'Corner Radius', groupName: 'Contents', property: sc.cornerRadius },
      { path: 'shapeContents.fillColor', label: 'Fill Color', groupName: 'Contents', property: sc.fillColor },
      { path: 'shapeContents.fillOpacity', label: 'Fill Opacity', groupName: 'Contents', property: sc.fillOpacity },
      { path: 'shapeContents.strokeColor', label: 'Stroke Color', groupName: 'Contents', property: sc.strokeColor },
      { path: 'shapeContents.strokeWidth', label: 'Stroke Width', groupName: 'Contents', property: sc.strokeWidth },
      { path: 'shapeContents.trimStart', label: 'Trim Start', groupName: 'Contents', property: sc.trimStart },
      { path: 'shapeContents.trimEnd', label: 'Trim End', groupName: 'Contents', property: sc.trimEnd },
      { path: 'shapeContents.trimOffset', label: 'Trim Offset', groupName: 'Contents', property: sc.trimOffset }
    );
  }

  if (layer.textContents) {
    const tc = layer.textContents;
    list.push(
      { path: 'textContents.fontSize', label: 'Font Size', groupName: 'Text', property: tc.fontSize },
      { path: 'textContents.fillColor', label: 'Fill Color', groupName: 'Text', property: tc.fillColor },
      { path: 'textContents.tracking', label: 'Tracking', groupName: 'Text', property: tc.tracking },
      { path: 'textContents.lineHeight', label: 'Line Height', groupName: 'Text', property: tc.lineHeight },
      { path: 'textContents.animator.rangeStart', label: 'Range Start', groupName: 'Text Animator', property: tc.animator.rangeStart },
      { path: 'textContents.animator.rangeEnd', label: 'Range End', groupName: 'Text Animator', property: tc.animator.rangeEnd },
      { path: 'textContents.animator.rangeOffset', label: 'Range Offset', groupName: 'Text Animator', property: tc.animator.rangeOffset },
      { path: 'textContents.animator.position', label: 'Animator Position', groupName: 'Text Animator', property: tc.animator.position },
      { path: 'textContents.animator.scale', label: 'Animator Scale', groupName: 'Text Animator', property: tc.animator.scale },
      { path: 'textContents.animator.rotation', label: 'Animator Rotation', groupName: 'Text Animator', property: tc.animator.rotation },
      { path: 'textContents.animator.opacity', label: 'Animator Opacity', groupName: 'Text Animator', property: tc.animator.opacity }
    );
  }

  if (layer.cameraOptions) {
    list.push(
      { path: 'cameraOptions.zoom', label: 'Camera Zoom', groupName: 'Camera', property: layer.cameraOptions.zoom },
      { path: 'cameraOptions.pointOfInterest', label: 'Point of Interest', groupName: 'Camera', property: layer.cameraOptions.pointOfInterest }
    );
  }

  layer.masks.forEach((mask, idx) => {
    list.push(
      { path: `masks.${idx}.feather`, label: `${mask.name} Feather`, groupName: 'Masks', property: mask.feather },
      { path: `masks.${idx}.opacity`, label: `${mask.name} Opacity`, groupName: 'Masks', property: mask.opacity },
      { path: `masks.${idx}.expansion`, label: `${mask.name} Expansion`, groupName: 'Masks', property: mask.expansion }
    );
  });

  layer.effects.forEach((fx, idx) => {
    Object.entries(fx.params).forEach(([paramKey, prop]) => {
      list.push({
        path: `effects.${idx}.params.${paramKey}`,
        label: `${fx.name}: ${prop.name}`,
        groupName: 'Effects',
        property: prop,
      });
    });
  });

  return list;
}
