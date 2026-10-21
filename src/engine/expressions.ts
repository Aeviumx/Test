import { Composition, Layer, Property, Vec2 } from '../types';
import { clamp } from '../utils/timecode';
import { evaluatePropertyKeyframes, interpolateValues } from './interpolation';

/**
 * Deterministic 1D value-gradient noise for wiggle() so frame N is always identical
 */
function hash1D(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return (s - Math.floor(s)) * 2 - 1;
}

function noise1D(x: number, seedOffset: number): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const u = xf * xf * (3 - 2 * xf);
  const a = hash1D(xi + seedOffset);
  const b = hash1D(xi + 1 + seedOffset);
  return a + (b - a) * u;
}

function fbmNoise1D(x: number, octaves: number, ampMult: number, seedOffset: number): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  const safeOctaves = Math.min(6, Math.max(1, Math.round(octaves)));

  for (let i = 0; i < safeOctaves; i++) {
    total += noise1D(x * frequency, seedOffset + i * 57.3) * amplitude;
    maxValue += amplitude;
    amplitude *= ampMult;
    frequency *= 2;
  }

  return maxValue > 0 ? total / maxValue : 0;
}

function stringSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 10000;
}

export interface ExpressionContext {
  comp: Composition;
  layer: Layer;
  layerIndex: number;
  property: Property<number | Vec2 | string>;
  time: number;
  baseValue: number | Vec2 | string;
}

export interface ExpressionResult<T> {
  value: T;
  error: string | null;
}

export function evaluateExpression<T = number | Vec2 | string>(
  ctx: ExpressionContext
): ExpressionResult<T> {
  const { comp, layer, layerIndex, property, time, baseValue } = ctx;
  const code = property.expression.trim();
  if (!property.expressionEnabled || !code) {
    return { value: baseValue as T, error: null };
  }

  const seed = stringSeed(`${layer.id}_${property.id}`);

  // Helper: wiggle(freq, amp, octaves = 2, ampMult = 0.5, t = time)
  const wiggle = (
    freq = 1,
    amp = 10,
    octaves = 2,
    ampMult = 0.5,
    t = time
  ): number | Vec2 => {
    const curVal = evaluatePropertyKeyframes(property, t);
    if (Array.isArray(curVal)) {
      const dx = fbmNoise1D(t * freq, octaves, ampMult, seed + 11.3) * amp;
      const dy = fbmNoise1D(t * freq, octaves, ampMult, seed + 97.7) * amp;
      return [curVal[0] + dx, curVal[1] + dy];
    }
    if (typeof curVal === 'number') {
      const d = fbmNoise1D(t * freq, octaves, ampMult, seed + 11.3) * amp;
      return curVal + d;
    }
    return 0;
  };

  // Helper: loopOut(type = "cycle" | "pingpong" | "offset")
  const loopOut = (type: 'cycle' | 'pingpong' | 'offset' = 'cycle'): number | Vec2 | string => {
    const kfs = property.keyframes;
    if (!property.animated || kfs.length < 2) return baseValue;
    const first = kfs[0];
    const last = kfs[kfs.length - 1];
    const span = last.time - first.time;
    if (span <= 1e-5 || time <= last.time) return baseValue;

    const elapsed = time - last.time;
    const cycleCount = Math.floor(elapsed / span);
    const rem = elapsed % span;

    if (type === 'pingpong') {
      const sampleTime = cycleCount % 2 === 0 ? last.time - rem : first.time + rem;
      return evaluatePropertyKeyframes(property, sampleTime);
    }
    if (type === 'offset') {
      const sampled = evaluatePropertyKeyframes(property, first.time + rem);
      const cycles = cycleCount + 1;
      if (typeof sampled === 'number' && typeof first.value === 'number' && typeof last.value === 'number') {
        const delta = last.value - first.value;
        return sampled + delta * cycles;
      }
      if (Array.isArray(sampled) && Array.isArray(first.value) && Array.isArray(last.value)) {
        const dx = last.value[0] - first.value[0];
        const dy = last.value[1] - first.value[1];
        return [sampled[0] + dx * cycles, sampled[1] + dy * cycles];
      }
    }
    return evaluatePropertyKeyframes(property, first.time + rem);
  };

  const loopIn = (type: 'cycle' | 'pingpong' = 'cycle'): number | Vec2 | string => {
    const kfs = property.keyframes;
    if (!property.animated || kfs.length < 2) return baseValue;
    const first = kfs[0];
    const last = kfs[kfs.length - 1];
    const span = last.time - first.time;
    if (span <= 1e-5 || time >= first.time) return baseValue;

    const before = first.time - time;
    const cycleCount = Math.floor(before / span);
    const rem = before % span;
    if (type === 'pingpong') {
      const sampleTime = cycleCount % 2 === 0 ? first.time + rem : last.time - rem;
      return evaluatePropertyKeyframes(property, sampleTime);
    }
    return evaluatePropertyKeyframes(property, last.time - rem);
  };

  const linearFn = <V = number | Vec2>(
    t: number,
    tMin = 0,
    tMax = 1,
    v1?: V,
    v2?: V
  ): V | number => {
    if (v1 === undefined || v2 === undefined) {
      return clamp((t - tMin) / Math.max(1e-6, tMax - tMin), 0, 1);
    }
    const u = clamp((t - tMin) / Math.max(1e-6, tMax - tMin), 0, 1);
    return interpolateValues(v1 as number | Vec2, v2 as number | Vec2, u) as V;
  };

  const easeFn = <V = number | Vec2>(
    t: number,
    tMin = 0,
    tMax = 1,
    v1?: V,
    v2?: V
  ): V | number => {
    const raw = clamp((t - tMin) / Math.max(1e-6, tMax - tMin), 0, 1);
    const smooth = raw * raw * (3 - 2 * raw);
    if (v1 === undefined || v2 === undefined) return smooth;
    return interpolateValues(v1 as number | Vec2, v2 as number | Vec2, smooth) as V;
  };

  const easeInFn = <V = number | Vec2>(
    t: number,
    tMin = 0,
    tMax = 1,
    v1?: V,
    v2?: V
  ): V | number => {
    const raw = clamp((t - tMin) / Math.max(1e-6, tMax - tMin), 0, 1);
    const u = raw * raw;
    if (v1 === undefined || v2 === undefined) return u;
    return interpolateValues(v1 as number | Vec2, v2 as number | Vec2, u) as V;
  };

  const easeOutFn = <V = number | Vec2>(
    t: number,
    tMin = 0,
    tMax = 1,
    v1?: V,
    v2?: V
  ): V | number => {
    const raw = clamp((t - tMin) / Math.max(1e-6, tMax - tMin), 0, 1);
    const u = 1 - (1 - raw) * (1 - raw);
    if (v1 === undefined || v2 === undefined) return u;
    return interpolateValues(v1 as number | Vec2, v2 as number | Vec2, u) as V;
  };

  const thisCompProxy = {
    name: comp.name,
    width: comp.width,
    height: comp.height,
    duration: comp.duration,
    fps: comp.fps,
    frameDuration: 1 / Math.max(1, comp.fps),
    numLayers: comp.layers.length,
    layer: (nameOrIndex: string | number) => {
      const target =
        typeof nameOrIndex === 'number'
          ? comp.layers[nameOrIndex - 1] ?? comp.layers[nameOrIndex]
          : comp.layers.find((l) => l.name === nameOrIndex);
      if (!target) {
        return {
          name: 'Missing',
          index: 0,
          transform: {
            position: [0, 0] as Vec2,
            scale: [100, 100] as Vec2,
            rotation: 0,
            opacity: 100,
            anchorPoint: [0, 0] as Vec2,
          },
        };
      }
      return {
        name: target.name,
        index: comp.layers.indexOf(target) + 1,
        inPoint: target.inPoint,
        outPoint: target.outPoint,
        transform: {
          position: evaluatePropertyKeyframes(target.transform.position, time),
          scale: evaluatePropertyKeyframes(target.transform.scale, time),
          rotation: evaluatePropertyKeyframes(target.transform.rotation, time),
          opacity: evaluatePropertyKeyframes(target.transform.opacity, time),
          anchorPoint: evaluatePropertyKeyframes(target.transform.anchorPoint, time),
        },
      };
    },
  };

  const thisLayerProxy = {
    name: layer.name,
    index: layerIndex + 1,
    width: layer.width,
    height: layer.height,
    inPoint: layer.inPoint,
    outPoint: layer.outPoint,
    startTime: layer.startTime,
    transform: {
      position: evaluatePropertyKeyframes(layer.transform.position, time),
      scale: evaluatePropertyKeyframes(layer.transform.scale, time),
      rotation: evaluatePropertyKeyframes(layer.transform.rotation, time),
      opacity: evaluatePropertyKeyframes(layer.transform.opacity, time),
      anchorPoint: evaluatePropertyKeyframes(layer.transform.anchorPoint, time),
    },
  };

  try {
    // Support both single-expression (`time * 50`) and multi-statement (`const x = ...; [x, 10]`)
    const statements = code
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    let body = code;
    if (!code.includes('return ')) {
      if (statements.length <= 1 && !code.includes('\n')) {
        body = `return (${code});`;
      } else {
        const lines = code
          .split(/\r?\n|;/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (lines.length > 0) {
          const last = lines[lines.length - 1];
          const prefix = lines.slice(0, -1).join(';\n');
          body = `${prefix ? prefix + ';\n' : ''}return (${last});`;
        }
      }
    }

    const fn = new Function(
      'time',
      'frame',
      'fps',
      'duration',
      'value',
      'index',
      'width',
      'height',
      'wiggle',
      'loopOut',
      'loopIn',
      'linear',
      'ease',
      'easeIn',
      'easeOut',
      'clamp',
      'thisComp',
      'thisLayer',
      'Math',
      `"use strict";\n${body}`
    );

    const rawResult = fn(
      time,
      Math.round(time * comp.fps),
      comp.fps,
      comp.duration,
      baseValue,
      layerIndex + 1,
      comp.width,
      comp.height,
      wiggle,
      loopOut,
      loopIn,
      linearFn,
      easeFn,
      easeInFn,
      easeOutFn,
      clamp,
      thisCompProxy,
      thisLayerProxy,
      Math
    );

    // Coerce/validate result type against baseValue
    if (typeof baseValue === 'number') {
      if (typeof rawResult === 'number' && Number.isFinite(rawResult)) {
        return { value: rawResult as T, error: null };
      }
      if (Array.isArray(rawResult) && typeof rawResult[0] === 'number') {
        return { value: rawResult[0] as T, error: null };
      }
      return { value: baseValue as T, error: 'Expression must return a number' };
    }

    if (Array.isArray(baseValue)) {
      if (
        Array.isArray(rawResult) &&
        rawResult.length >= 2 &&
        typeof rawResult[0] === 'number' &&
        typeof rawResult[1] === 'number' &&
        Number.isFinite(rawResult[0]) &&
        Number.isFinite(rawResult[1])
      ) {
        return { value: [rawResult[0], rawResult[1]] as T, error: null };
      }
      if (typeof rawResult === 'number' && Number.isFinite(rawResult)) {
        return { value: [rawResult, rawResult] as T, error: null };
      }
      return { value: baseValue as T, error: 'Expression must return [x, y]' };
    }

    if (typeof baseValue === 'string') {
      return { value: String(rawResult) as T, error: null };
    }

    return { value: rawResult as T, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { value: baseValue as T, error: msg };
  }
}
