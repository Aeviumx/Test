import { Keyframe, Property, Vec2 } from '../types';
import { interpolateHexColor } from '../utils/color';
import { clamp } from '../utils/timecode';

/**
 * Solves cubic bezier y(t) for a given x in [0..1], with control points P1(x1, y1) and P2(x2, y2)
 */
export function solveCubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (Math.abs(x1 - y1) < 1e-5 && Math.abs(x2 - y2) < 1e-5) return x;

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleCurveDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  // Newton-Raphson iteration
  let t2 = x;
  for (let i = 0; i < 8; i++) {
    const x2Est = sampleCurveX(t2) - x;
    if (Math.abs(x2Est) < 1e-6) {
      return sampleCurveY(t2);
    }
    const d2 = sampleCurveDerivativeX(t2);
    if (Math.abs(d2) < 1e-6) break;
    t2 -= x2Est / d2;
  }

  // Fallback to bisection
  let t0 = 0;
  let t1 = 1;
  t2 = x;
  for (let i = 0; i < 12; i++) {
    const x2Est = sampleCurveX(t2);
    if (Math.abs(x2Est - x) < 1e-6) break;
    if (x > x2Est) t0 = t2;
    else t1 = t2;
    t2 = (t1 + t0) * 0.5;
  }

  return sampleCurveY(t2);
}

/**
 * Computes eased progress u in [0..1] (with possible overshoot) between two keyframes k1 and k2
 */
export function computeSegmentEase(k1: Keyframe<unknown>, k2: Keyframe<unknown>, rawT: number): number {
  if (k1.interpolation === 'hold') return 0;
  if (k1.interpolation === 'linear' && k2.interpolation === 'linear') {
    return rawT;
  }
  const x1 = clamp(k1.outTangent?.x ?? 0.33, 0.01, 0.99);
  const y1 = clamp(k1.outTangent?.y ?? 0, -2, 2);
  const x2 = clamp(1 - (k2.inTangent?.x ?? 0.33), 0.01, 0.99);
  const y2 = clamp(1 + (k2.inTangent?.y ?? 0), -2, 3);
  return solveCubicBezier(x1, y1, x2, y2, clamp(rawT, 0, 1));
}

export function interpolateValues<T = number | Vec2 | string>(
  v1: T,
  v2: T,
  u: number,
  k1?: Keyframe<T>,
  k2?: Keyframe<T>
): T {
  if (typeof v1 === 'number' && typeof v2 === 'number') {
    return (v1 + (v2 - v1) * u) as T;
  }

  if (Array.isArray(v1) && Array.isArray(v2)) {
    // Check if spatial bezier tangents exist on k1 or k2
    const outTan = k1?.spatialOutTangent;
    const inTan = k2?.spatialInTangent;
    if (
      (outTan && (Math.abs(outTan[0]) > 0.01 || Math.abs(outTan[1]) > 0.01)) ||
      (inTan && (Math.abs(inTan[0]) > 0.01 || Math.abs(inTan[1]) > 0.01))
    ) {
      const p0x = v1[0];
      const p0y = v1[1];
      const p3x = v2[0];
      const p3y = v2[1];
      const p1x = p0x + (outTan ? outTan[0] : (p3x - p0x) * 0.33);
      const p1y = p0y + (outTan ? outTan[1] : (p3y - p0y) * 0.33);
      const p2x = p3x + (inTan ? inTan[0] : (p0x - p3x) * 0.33);
      const p2y = p3y + (inTan ? inTan[1] : (p0y - p3y) * 0.33);
      const mt = 1 - u;
      const x =
        mt * mt * mt * p0x +
        3 * mt * mt * u * p1x +
        3 * mt * u * u * p2x +
        u * u * u * p3x;
      const y =
        mt * mt * mt * p0y +
        3 * mt * mt * u * p1y +
        3 * mt * u * u * p2y +
        u * u * u * p3y;
      return [x, y] as T;
    }

    return [v1[0] + (v2[0] - v1[0]) * u, v1[1] + (v2[1] - v1[1]) * u] as T;
  }

  if (typeof v1 === 'string' && typeof v2 === 'string') {
    if (v1.startsWith('#') && v2.startsWith('#')) {
      return interpolateHexColor(v1, v2, clamp(u, 0, 1)) as T;
    }
    return (u < 0.5 ? v1 : v2) as T;
  }

  return v1;
}

/**
 * Evaluates a Property's keyframes at `time` (ignoring expressions)
 */
export function evaluatePropertyKeyframes<T = number | Vec2 | string>(
  prop: Property<T>,
  time: number
): T {
  if (!prop.animated || prop.keyframes.length === 0) {
    return prop.value;
  }

  const kfs = prop.keyframes;
  if (kfs.length === 1) {
    return kfs[0].value;
  }

  // Sort safety if needed (usually kept sorted in store)
  const sorted = kfs.length > 1 && kfs[0].time > kfs[1].time
    ? [...kfs].sort((a, b) => a.time - b.time)
    : kfs;

  if (time <= sorted[0].time) {
    return sorted[0].value;
  }
  const last = sorted[sorted.length - 1];
  if (time >= last.time) {
    return last.value;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const k1 = sorted[i];
    const k2 = sorted[i + 1];
    if (time >= k1.time && time <= k2.time) {
      const span = k2.time - k1.time;
      if (span <= 1e-6) return k2.value;
      const rawT = (time - k1.time) / span;
      const easedU = computeSegmentEase(k1, k2, rawT);
      return interpolateValues(k1.value, k2.value, easedU, k1, k2);
    }
  }

  return prop.value;
}
