/**
 * Static Art Liveliness & 2.5D Idle Animation Engine
 * Transforms static 2D illustrations into living characters
 * via procedural respiration (breathing), idle body sway, hair wave drift, and organic camera drift.
 */

export interface LivelinessParams {
  breathingRate: number;      // breaths per minute (e.g. 18-22, default 20)
  breathingIntensity: number; // 0..1 (default 0.6)
  swayRate: number;           // sway cycles per minute (default 14)
  swayIntensity: number;      // 0..1 (default 0.5)
  hairDriftSpeed: number;     // speed of secondary motion waves (default 1.0)
  hairDriftIntensity: number; // 0..1 (default 0.45)
  cameraDriftRate: number;    // slow ambient camera wander (default 0.5)
}

export interface ArtLivelinessTransform {
  // Character root transforms
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  anchorOffsetY: number;
  
  // Wave drift for vertex / warp shaders (phase and amplitude)
  wavePhase: number;
  waveAmplitude: number;
  
  // Camera ambient drift
  cameraPanX: number;
  cameraPanY: number;
  cameraZoom: number;
}

export function getDefaultLivelinessParams(): LivelinessParams {
  return {
    breathingRate: 20,
    breathingIntensity: 0.6,
    swayRate: 14,
    swayIntensity: 0.5,
    hairDriftSpeed: 1.0,
    hairDriftIntensity: 0.45,
    cameraDriftRate: 0.5,
  };
}

/**
 * Computes procedural character liveliness transforms for a given timestamp
 */
export function evaluateArtLiveliness(
  timeSeconds: number,
  params: LivelinessParams = getDefaultLivelinessParams()
): ArtLivelinessTransform {
  // 1. Respiration Cycle (Breathing)
  // Sine curve with asymmetric inhale/exhale (inhale slightly faster, exhale slightly slower)
  const breathFreq = (params.breathingRate / 60) * 2 * Math.PI;
  const rawBreath = Math.sin(timeSeconds * breathFreq);
  // Vertical chest expansion
  const breathScaleY = 1.0 + rawBreath * (0.015 * params.breathingIntensity);
  const breathScaleX = 1.0 - rawBreath * (0.005 * params.breathingIntensity);
  const anchorOffsetY = -rawBreath * (3.5 * params.breathingIntensity);

  // 2. Idle Body Sway (Lateral gentle pendulum)
  const swayFreq = (params.swayRate / 60) * 2 * Math.PI;
  const rotationDeg = Math.sin(timeSeconds * swayFreq) * (0.85 * params.swayIntensity);

  // 3. Hair & Cloth Secondary Motion Wave (Continuous harmonic flow)
  const waveFreq = params.hairDriftSpeed * 2.8;
  const wavePhase = (timeSeconds * waveFreq) % (2 * Math.PI);
  const waveAmplitude = 0.02 * params.hairDriftIntensity;

  // 4. Ken Burns Organic Camera Drift (Slow creeping push-in + subtle pan)
  const driftFreq = (params.cameraDriftRate / 60) * 2 * Math.PI;
  const cameraPanX = Math.sin(timeSeconds * driftFreq * 1.3) * 12;
  const cameraPanY = Math.cos(timeSeconds * driftFreq * 0.9) * 8;
  const cameraZoom = 1.0 + (timeSeconds * 0.012); // smooth 1.2% zoom per second

  return {
    scaleX: Number(breathScaleX.toFixed(4)),
    scaleY: Number(breathScaleY.toFixed(4)),
    rotationDeg: Number(rotationDeg.toFixed(3)),
    anchorOffsetY: Number(anchorOffsetY.toFixed(2)),
    wavePhase: Number(wavePhase.toFixed(3)),
    waveAmplitude: Number(waveAmplitude.toFixed(4)),
    cameraPanX: Number(cameraPanX.toFixed(2)),
    cameraPanY: Number(cameraPanY.toFixed(2)),
    cameraZoom: Number(cameraZoom.toFixed(4)),
  };
}

import { Keyframe, Layer, Vec2 } from '../types';
import { createKeyframe } from '../core/defaults';

export interface LivelinessTrackOptions {
  duration: number;
  bpm?: number;
  breathingIntensity?: number;
  swayIntensity?: number;
  sampleStepSeconds?: number;
}

export interface LivelinessKeyframes {
  keyframes: Array<{
    time: number;
    scale: Vec2;
    rotation: number;
    anchorOffset: number;
  }>;
}

/**
 * Creates baked keyframes representing subtle breathing and sway over a given duration
 */
export function createLivelinessTrack(options: LivelinessTrackOptions): LivelinessKeyframes {
  const {
    duration,
    bpm = 120,
    breathingIntensity = 1.0,
    swayIntensity = 1.0,
    sampleStepSeconds = 0.15,
  } = options;

  const keyframes: LivelinessKeyframes['keyframes'] = [];
  const params: LivelinessParams = {
    ...getDefaultLivelinessParams(),
    breathingRate: (bpm / 120) * 20,
    breathingIntensity,
    swayIntensity,
  };

  for (let t = 0; t <= duration; t += sampleStepSeconds) {
    const evalResult = evaluateArtLiveliness(t, params);
    keyframes.push({
      time: Math.round(t * 1000) / 1000,
      scale: [evalResult.scaleX * 100, evalResult.scaleY * 100],
      rotation: evalResult.rotationDeg,
      anchorOffset: evalResult.anchorOffsetY,
    });
  }

  return { keyframes };
}

/**
 * Attaches animated liveliness (scale & rotation) to a layer's transform
 */
export function applyLivelinessToLayer(layer: Layer, track: LivelinessKeyframes): void {
  layer.transform.scale.animated = true;
  layer.transform.scale.keyframes = track.keyframes.map((kf) =>
    createKeyframe(kf.time, kf.scale as Vec2)
  );

  layer.transform.rotation.animated = true;
  layer.transform.rotation.keyframes = track.keyframes.map((kf) =>
    createKeyframe(kf.time, kf.rotation)
  );
}
