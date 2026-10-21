import { BezierVertex, Vec2 } from '../types';

/**
 * 2D Affine Transform Matrix [a, b, c, d, tx, ty]
 * Represents:
 * | a  c  tx |
 * | b  d  ty |
 * | 0  0  1  |
 */
export type Mat2D = [number, number, number, number, number, number];

export function identityMatrix(): Mat2D {
  return [1, 0, 0, 1, 0, 0];
}

export function multiplyMatrices(m1: Mat2D, m2: Mat2D): Mat2D {
  const [a1, b1, c1, d1, tx1, ty1] = m1;
  const [a2, b2, c2, d2, tx2, ty2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * tx2 + c1 * ty2 + tx1,
    b1 * tx2 + d1 * ty2 + ty1,
  ];
}

export function invertMatrix(m: Mat2D): Mat2D {
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-8) return identityMatrix();
  const invDet = 1 / det;
  return [
    d * invDet,
    -b * invDet,
    -c * invDet,
    a * invDet,
    (c * ty - d * tx) * invDet,
    (b * tx - a * ty) * invDet,
  ];
}

export function applyMatrixToPoint(m: Mat2D, pt: Vec2): Vec2 {
  const [a, b, c, d, tx, ty] = m;
  return [a * pt[0] + c * pt[1] + tx, b * pt[0] + d * pt[1] + ty];
}

/**
 * Builds local-to-parent 2D matrix from Anchor Point, Position, Scale (%), Rotation (deg), Skew (deg), SkewAxis (deg)
 */
export function buildLayerTransformMatrix(params: {
  anchorPoint: Vec2;
  position: Vec2;
  scale: Vec2;
  rotation: number;
  skew?: number;
  skewAxis?: number;
}): Mat2D {
  const { anchorPoint, position, scale, rotation, skew = 0, skewAxis = 0 } = params;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = scale[0] / 100;
  const sy = scale[1] / 100;

  // Translate to position
  let m: Mat2D = [1, 0, 0, 1, position[0], position[1]];

  // Rotate
  m = multiplyMatrices(m, [cos, sin, -sin, cos, 0, 0]);

  // Skew if non-zero
  if (Math.abs(skew) > 0.001) {
    const axisRad = (skewAxis * Math.PI) / 180;
    const skewRad = (skew * Math.PI) / 180;
    const ca = Math.cos(axisRad);
    const sa = Math.sin(axisRad);
    const tanSkew = Math.tan(skewRad);
    m = multiplyMatrices(m, [ca, sa, -sa, ca, 0, 0]);
    m = multiplyMatrices(m, [1, 0, tanSkew, 1, 0, 0]);
    m = multiplyMatrices(m, [ca, -sa, sa, ca, 0, 0]);
  }

  // Scale
  m = multiplyMatrices(m, [sx, 0, 0, sy, 0, 0]);

  // Translate by -anchorPoint
  m = multiplyMatrices(m, [1, 0, 0, 1, -anchorPoint[0], -anchorPoint[1]]);

  return m;
}

/**
 * Samples a closed or open BezierVertex[] path into polyline points for rendering and Trim Paths
 */
export function sampleBezierPath(
  vertices: BezierVertex[],
  closed: boolean,
  segmentsPerCurve = 24
): Vec2[] {
  if (vertices.length === 0) return [];
  if (vertices.length === 1) return [[vertices[0].x, vertices[0].y]];

  const points: Vec2[] = [];
  const count = closed ? vertices.length : vertices.length - 1;

  for (let i = 0; i < count; i++) {
    const v0 = vertices[i];
    const v1 = vertices[(i + 1) % vertices.length];
    const p0x = v0.x;
    const p0y = v0.y;
    const p1x = v0.x + v0.outX;
    const p1y = v0.y + v0.outY;
    const p2x = v1.x + v1.inX;
    const p2y = v1.y + v1.inY;
    const p3x = v1.x;
    const p3y = v1.y;

    for (let s = 0; s < segmentsPerCurve; s++) {
      const t = s / segmentsPerCurve;
      const mt = 1 - t;
      const x =
        mt * mt * mt * p0x +
        3 * mt * mt * t * p1x +
        3 * mt * t * t * p2x +
        t * t * t * p3x;
      const y =
        mt * mt * mt * p0y +
        3 * mt * mt * t * p1y +
        3 * mt * t * t * p2y +
        t * t * t * p3y;
      points.push([x, y]);
    }
  }

  if (closed) {
    points.push([vertices[0].x, vertices[0].y]);
  } else {
    const last = vertices[vertices.length - 1];
    points.push([last.x, last.y]);
  }

  return points;
}

/**
 * Extracts a sub-polyline corresponding to Trim Paths [startPct, endPct, offsetDeg]
 */
export function applyTrimPathsToPolyline(
  points: Vec2[],
  startPct: number,
  endPct: number,
  offsetDeg: number,
  closed: boolean
): Vec2[] {
  if (points.length < 2) return points;
  let s = Math.min(100, Math.max(0, startPct)) / 100;
  let e = Math.min(100, Math.max(0, endPct)) / 100;
  if (Math.abs(e - s) < 0.0001) return [];
  if (s > e) {
    const tmp = s;
    s = e;
    e = tmp;
  }
  if (s <= 0.0001 && e >= 0.9999) return points;

  const segLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    const len = Math.hypot(dx, dy);
    segLengths.push(len);
    totalLength += len;
  }
  if (totalLength < 0.001) return points;

  const offsetNorm = (((offsetDeg / 360) % 1) + 1) % 1;
  const extractRange = (r0: number, r1: number): Vec2[] => {
    const targetStart = r0 * totalLength;
    const targetEnd = r1 * totalLength;
    const out: Vec2[] = [];
    let accum = 0;

    for (let i = 0; i < segLengths.length; i++) {
      const segLen = segLengths[i];
      const nextAccum = accum + segLen;
      if (nextAccum >= targetStart && accum <= targetEnd && segLen > 0) {
        const localT0 = Math.max(0, (targetStart - accum) / segLen);
        const localT1 = Math.min(1, (targetEnd - accum) / segLen);
        const p0 = points[i];
        const p1 = points[i + 1];
        const startPt: Vec2 = [
          p0[0] + (p1[0] - p0[0]) * localT0,
          p0[1] + (p1[1] - p0[1]) * localT0,
        ];
        const endPt: Vec2 = [
          p0[0] + (p1[0] - p0[0]) * localT1,
          p0[1] + (p1[1] - p0[1]) * localT1,
        ];
        if (out.length === 0) out.push(startPt);
        out.push(endPt);
      }
      accum = nextAccum;
    }
    return out;
  };

  if (!closed || offsetNorm === 0) {
    const shiftedS = Math.min(1, Math.max(0, s + offsetNorm));
    const shiftedE = Math.min(1, Math.max(0, e + offsetNorm));
    return extractRange(shiftedS, shiftedE);
  }

  const sOff = (s + offsetNorm) % 1;
  const span = e - s;
  if (sOff + span <= 1) {
    return extractRange(sOff, sOff + span);
  }
  const part1 = extractRange(sOff, 1);
  const part2 = extractRange(0, sOff + span - 1);
  return [...part1, ...part2];
}
