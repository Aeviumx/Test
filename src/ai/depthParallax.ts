/**
 * 2.5D Multiplane Parallax & Depth Layering Engine
 * Synthesizes multi-layered 2.5D depth from a single static anime art
 * (foreground character cutout + ambient shadow + in-filled background),
 * generating authentic multiplane camera parallax.
 */

export interface ParallaxLayerConfig {
  id: string;
  name: string;
  type: 'background' | 'shadow' | 'character' | 'particles';
  depthZ: number;       // 0.0 (near camera) to 1.0 (far background)
  parallaxFactor: number; // multiplier for camera pan displacement
  scale: number;        // safety padding scale to prevent edges showing during parallax
  blurRadius?: number;  // background bokeh blur
  opacity: number;
}

export interface ParallaxFrameOffset {
  offsetX: number; // pixels
  offsetY: number; // pixels
  scale: number;
  rotation: number;
}

export interface MultiplaneParallaxSetup {
  layers: ParallaxLayerConfig[];
  focalDepth: number; // 0..1 depth where displacement is zero (focus plane)
}

/**
 * Creates default 3-layer 2.5D parallax configuration from character art
 */
export function createDefault25DParallaxSetup(): MultiplaneParallaxSetup {
  return {
    focalDepth: 0.3,
    layers: [
      {
        id: 'bg_layer',
        name: 'Distant Background / Stage',
        type: 'background',
        depthZ: 0.9,
        parallaxFactor: 0.25, // moves slowly
        scale: 1.25,          // extra padding for camera swing
        blurRadius: 18,       // shallow depth of field bokeh
        opacity: 1.0,
      },
      {
        id: 'shadow_layer',
        name: 'Ambient Shadow / Rim',
        type: 'shadow',
        depthZ: 0.45,
        parallaxFactor: 0.75,
        scale: 1.05,
        opacity: 0.65,
      },
      {
        id: 'char_layer',
        name: 'Foreground Character Cutout',
        type: 'character',
        depthZ: 0.15,
        parallaxFactor: 1.45, // moves rapidly in front of background
        scale: 1.05,
        opacity: 1.0,
      },
    ],
  };
}

/**
 * Evaluates layer offset for a given camera pan displacement (dx, dy) and time
 */
export function evaluateLayerParallax(
  layer: ParallaxLayerConfig,
  cameraPanX: number,
  cameraPanY: number,
  cameraZoom = 1.0,
  time = 0
): ParallaxFrameOffset {
  // Parallax displacement proportional to layer depth
  const offsetX = cameraPanX * layer.parallaxFactor;
  const offsetY = cameraPanY * layer.parallaxFactor;

  // Subtle breathing / floating oscillation based on depth
  const floatY = Math.sin(time * 2.2 + layer.depthZ * Math.PI) * (4 * (1 - layer.depthZ));

  // Scale compensation based on camera zoom
  const scale = layer.scale * (1.0 + (cameraZoom - 1.0) * (1.2 - layer.depthZ * 0.4));

  return {
    offsetX: Math.round(offsetX * 10) / 10,
    offsetY: Math.round((offsetY + floatY) * 10) / 10,
    scale: Math.round(scale * 1000) / 1000,
    rotation: (cameraPanX * 0.02 * (1 - layer.depthZ)),
  };
}

import { Layer } from '../types';
import { createDefaultLayer, createEffectInstance, createKeyframe } from '../core/defaults';

export interface MultiplaneParallaxOptions {
  compWidth: number;
  compHeight: number;
  duration?: number;
  layers: {
    backgroundAssetId: string;
    shadowAssetId?: string;
    characterAssetId: string;
  };
  cameraMotion?: 'subtle-drift' | 'sway' | 'push-in';
}

/**
 * Generates ready-to-use Composition Layers for 3-layer 2.5D multiplane parallax
 */
export function createMultiplaneParallax(options: MultiplaneParallaxOptions): Layer[] {
  const {
    compWidth,
    compHeight,
    duration = 10,
    layers: assetLayers,
    cameraMotion = 'subtle-drift',
  } = options;

  const compInfo = { width: compWidth, height: compHeight, duration };
  const layers: Layer[] = [];

  // 1. Distant Background Layer (with subtle bokeh blur)
  const bg = createDefaultLayer(
    compInfo,
    'image',
    'Background Stage (Distant Multiplane)',
    { assetId: assetLayers.backgroundAssetId, width: compWidth, height: compHeight }
  );
  bg.is3D = false;
  // Subtle bokeh blur for shallow depth of field
  const bgBlur = createEffectInstance('gaussian-blur');
  bgBlur.params.radius.value = 14;
  bg.effects.push(bgBlur);

  if (cameraMotion === 'subtle-drift') {
    bg.transform.position.animated = true;
    bg.transform.position.keyframes = [
      createKeyframe(0, [compWidth * 0.5, compHeight * 0.5]),
      createKeyframe(duration * 0.5, [compWidth * 0.5 - 12, compHeight * 0.5 - 6]),
      createKeyframe(duration, [compWidth * 0.5, compHeight * 0.5]),
    ];
  }
  layers.push(bg);

  // 2. Ambient Shadow / Rim Layer (if provided)
  if (assetLayers.shadowAssetId) {
    const shadow = createDefaultLayer(
      compInfo,
      'image',
      'Ambient Shadow / Depth Occlusion',
      { assetId: assetLayers.shadowAssetId, width: compWidth, height: compHeight }
    );
    shadow.is3D = false;
    shadow.transform.opacity.value = 65;
    layers.push(shadow);
  }

  // 3. Foreground Character Cutout (with 3D parallax displacement)
  const char = createDefaultLayer(
    compInfo,
    'image',
    'Foreground Character Cutout (2.5D Parallax)',
    { assetId: assetLayers.characterAssetId, width: compWidth, height: compHeight }
  );
  char.is3D = true;
  if (cameraMotion === 'subtle-drift') {
    char.transform.position.animated = true;
    char.transform.position.keyframes = [
      createKeyframe(0, [compWidth * 0.5, compHeight * 0.5]),
      createKeyframe(duration * 0.5, [compWidth * 0.5 + 24, compHeight * 0.5 + 10]),
      createKeyframe(duration, [compWidth * 0.5, compHeight * 0.5]),
    ];
  }
  layers.push(char);

  return layers;
}
