export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;
out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * Unified GPU Effect Fragment Shader (#version 300 es)
 * Implements all 16 GPU effects via u_effectType integer dispatch
 */
export const EFFECT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform int u_effectType;

// Generic scalar/vector/color uniforms per effect pass
uniform float u_p0;
uniform float u_p1;
uniform float u_p2;
uniform float u_p3;
uniform float u_p4;
uniform vec2 u_v0;
uniform vec2 u_v1;
uniform vec4 u_c0;
uniform vec4 u_c1;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, float evo) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 5; i++) {
    v += a * valueNoise(p + vec2(evo * 0.13, -evo * 0.09));
    p = rot * p * 2.02 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

vec3 rgb2hsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float l = (maxC + minC) * 0.5;
  if (maxC == minC) return vec3(0.0, 0.0, l);
  float d = maxC - minC;
  float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
  float h = 0.0;
  if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  h /= 6.0;
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  if (s == 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(
    hue2rgb(p, q, h + 1.0 / 3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0 / 3.0)
  );
}

void main() {
  vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
  vec4 src = texture(u_tex, v_uv);

  // 0: Gaussian Blur (two-dimensional weighted kernel)
  if (u_effectType == 0) {
    float radius = u_p0;
    if (radius <= 0.2) {
      outColor = src;
      return;
    }
    vec2 scaleDir = vec2(u_p1 / 100.0, u_p2 / 100.0);
    vec4 acc = vec4(0.0);
    float totalW = 0.0;
    for (int x = -4; x <= 4; x++) {
      for (int y = -4; y <= 4; y++) {
        vec2 offset = vec2(float(x), float(y)) * texel * (radius * 0.35) * scaleDir;
        float dist2 = float(x * x + y * y);
        float w = exp(-dist2 / 8.0);
        acc += texture(u_tex, clamp(v_uv + offset, 0.0, 1.0)) * w;
        totalW += w;
      }
    }
    outColor = acc / max(totalW, 0.0001);
    return;
  }

  // 1: Directional Blur
  if (u_effectType == 1) {
    float angleRad = radians(u_p0);
    float len = u_p1;
    vec2 dir = vec2(cos(angleRad), sin(angleRad)) * texel * len;
    vec4 acc = vec4(0.0);
    const int SAMPLES = 13;
    for (int i = -6; i <= 6; i++) {
      float t = float(i) / 6.0;
      acc += texture(u_tex, clamp(v_uv + dir * t, 0.0, 1.0));
    }
    outColor = acc / float(SAMPLES);
    return;
  }

  // 2: Glow
  if (u_effectType == 2) {
    float threshold = u_p0 / 100.0;
    float radius = u_p1;
    float intensity = u_p2;
    vec3 glowColor = u_c0.rgb;

    vec4 bloom = vec4(0.0);
    float totalW = 0.0;
    for (int x = -3; x <= 3; x++) {
      for (int y = -3; y <= 3; y++) {
        vec2 off = vec2(float(x), float(y)) * texel * (radius * 0.45);
        vec4 samp = texture(u_tex, clamp(v_uv + off, 0.0, 1.0));
        float luma = dot(samp.rgb, vec3(0.299, 0.587, 0.114)) * samp.a;
        float bright = max(0.0, luma - threshold) / max(0.01, 1.0 - threshold);
        float w = exp(-float(x * x + y * y) / 6.0);
        bloom += vec4(glowColor * bright, samp.a * bright) * w;
        totalW += w;
      }
    }
    bloom /= max(totalW, 0.001);
    vec3 combined = src.rgb + bloom.rgb * intensity;
    float combAlpha = clamp(src.a + bloom.a * clamp(intensity * 0.65, 0.0, 1.0), 0.0, 1.0);
    outColor = vec4(clamp(combined, 0.0, 1.0), combAlpha);
    return;
  }

  // 3: Drop Shadow
  if (u_effectType == 3) {
    float opacity = u_p0 / 100.0;
    float angleRad = radians(u_p1);
    float distancePx = u_p2;
    float softness = u_p3;
    vec3 shadowCol = u_c0.rgb;

    vec2 shift = vec2(cos(angleRad), -sin(angleRad)) * texel * distancePx;
    float shadowAlpha = 0.0;
    float totalW = 0.0;
    for (int x = -2; x <= 2; x++) {
      for (int y = -2; y <= 2; y++) {
        vec2 blurOff = vec2(float(x), float(y)) * texel * (softness * 0.35);
        float a = texture(u_tex, clamp(v_uv - shift + blurOff, 0.0, 1.0)).a;
        float w = exp(-float(x * x + y * y) / 4.0);
        shadowAlpha += a * w;
        totalW += w;
      }
    }
    shadowAlpha = (shadowAlpha / max(totalW, 0.001)) * opacity;
    vec3 finalRgb = mix(shadowCol * shadowAlpha, src.rgb, src.a);
    float finalA = clamp(src.a + shadowAlpha * (1.0 - src.a), 0.0, 1.0);
    outColor = vec4(finalRgb, finalA);
    return;
  }

  // 4: Brightness & Contrast
  if (u_effectType == 4) {
    float b = u_p0 / 100.0;
    float c = u_p1 / 100.0;
    float factor = (1.0 + c) / max(0.05, 1.0 - c * 0.85);
    vec3 rgb = (src.rgb + b - 0.5) * factor + 0.5;
    outColor = vec4(clamp(rgb, 0.0, 1.0), src.a);
    return;
  }

  // 5: Hue / Saturation
  if (u_effectType == 5) {
    vec3 hsl = rgb2hsl(src.rgb);
    hsl.x = fract(hsl.x + u_p0 / 360.0);
    hsl.y = clamp(hsl.y * (1.0 + u_p1 / 100.0), 0.0, 1.0);
    hsl.z = clamp(hsl.z + u_p2 / 100.0, 0.0, 1.0);
    outColor = vec4(hsl2rgb(hsl), src.a);
    return;
  }

  // 6: Curves
  if (u_effectType == 6) {
    float shadows = u_p0 / 100.0;
    float midtones = u_p1 / 100.0;
    float highlights = u_p2 / 100.0;
    float sCurve = u_p3 / 100.0;

    vec3 x = clamp(src.rgb, 0.0, 1.0);
    // Apply lift / gamma / gain
    x = clamp(x + shadows * (1.0 - x) * 0.45, 0.0, 1.0);
    x = pow(max(x, vec3(0.0001)), vec3(max(0.2, 1.0 - midtones * 0.65)));
    x = clamp(x * (1.0 + highlights * 0.6), 0.0, 1.0);
    // Apply S-curve
    vec3 smoothX = x * x * (3.0 - 2.0 * x);
    x = mix(x, smoothX, sCurve);
    outColor = vec4(clamp(x, 0.0, 1.0), src.a);
    return;
  }

  // 7: Fill
  if (u_effectType == 7) {
    float op = u_p0 / 100.0;
    vec3 rgb = mix(src.rgb, u_c0.rgb, op);
    outColor = vec4(rgb, src.a);
    return;
  }

  // 8: Tint
  if (u_effectType == 8) {
    float amount = u_p0 / 100.0;
    float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
    vec3 tinted = mix(u_c0.rgb, u_c1.rgb, luma);
    outColor = vec4(mix(src.rgb, tinted, amount), src.a);
    return;
  }

  // 9: Gradient Ramp
  if (u_effectType == 9) {
    vec2 px = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
    vec2 a = u_v0;
    vec2 b = u_v1;
    vec2 ab = b - a;
    float len2 = max(1.0, dot(ab, ab));
    float t = clamp(dot(px - a, ab) / len2, 0.0, 1.0);
    vec3 rampCol = mix(u_c0.rgb, u_c1.rgb, t);
    float blendOrig = u_p0 / 100.0;
    outColor = vec4(mix(rampCol, src.rgb, blendOrig), src.a);
    return;
  }

  // 10: Noise
  if (u_effectType == 10) {
    float amount = u_p0 / 100.0;
    bool isColor = u_p1 > 0.5;
    float seed = u_p2;
    vec2 p = v_uv * u_resolution + vec2(seed * 13.7, seed * 29.3);
    vec3 n;
    if (isColor) {
      n = vec3(
        hash21(p + vec2(1.0, 2.0)),
        hash21(p + vec2(3.0, 5.0)),
        hash21(p + vec2(7.0, 11.0))
      ) * 2.0 - 1.0;
    } else {
      float m = hash21(p) * 2.0 - 1.0;
      n = vec3(m);
    }
    outColor = vec4(clamp(src.rgb + n * amount, 0.0, 1.0), src.a);
    return;
  }

  // 11: Fractal Noise
  if (u_effectType == 11) {
    float contrast = u_p0 / 100.0;
    float brightness = u_p1 / 100.0;
    float scale = max(5.0, u_p2);
    float evo = radians(u_p3);
    float blend = u_p4 / 100.0;

    vec2 p = (v_uv * u_resolution) / scale;
    float n = fbm(p, evo);
    n = (n - 0.5) * contrast + 0.5 + brightness;
    n = clamp(n, 0.0, 1.0);
    vec3 rgb = mix(src.rgb, vec3(n), blend);
    outColor = vec4(rgb, src.a);
    return;
  }

  // 12: Chromatic Aberration
  if (u_effectType == 12) {
    vec2 shift = vec2(u_p0, u_p1) * texel;
    float radialFactor = mix(1.0, length(v_uv - 0.5) * 2.0, u_p2 / 100.0);
    vec2 effShift = shift * radialFactor;
    vec4 rS = texture(u_tex, clamp(v_uv + effShift, 0.0, 1.0));
    vec4 gS = src;
    vec4 bS = texture(u_tex, clamp(v_uv - effShift, 0.0, 1.0));
    float a = max(max(rS.a, gS.a), bS.a);
    outColor = vec4(rS.r, gS.g, bS.b, a);
    return;
  }

  // 13: Wave Warp
  if (u_effectType == 13) {
    float waveHeight = u_p0;
    float waveWidth = max(4.0, u_p1);
    float dirRad = radians(u_p2);
    float phaseRad = radians(u_p3);

    vec2 px = v_uv * u_resolution;
    vec2 dir = vec2(cos(dirRad), sin(dirRad));
    vec2 perp = vec2(-dir.y, dir.x);
    float along = dot(px, dir);
    float disp = sin((along / waveWidth) * 6.2831853 + phaseRad) * waveHeight;
    vec2 warpedUv = clamp(v_uv + (perp * disp) * texel, 0.0, 1.0);
    outColor = texture(u_tex, warpedUv);
    return;
  }

  // 14: Turbulent Displace
  if (u_effectType == 14) {
    float amount = u_p0;
    float size = max(10.0, u_p1);
    float evo = radians(u_p2);
    vec2 p = (v_uv * u_resolution) / size;
    float nx = fbm(p + vec2(3.1, 7.4), evo) * 2.0 - 1.0;
    float ny = fbm(p + vec2(19.2, 41.8), evo) * 2.0 - 1.0;
    vec2 displacedUv = clamp(v_uv + vec2(nx, ny) * amount * texel, 0.0, 1.0);
    outColor = texture(u_tex, displacedUv);
    return;
  }

  // 15: Vignette
  if (u_effectType == 15) {
    float amount = u_p0 / 100.0;
    float midpoint = u_p1 / 100.0;
    float feather = max(0.02, u_p2 / 100.0);
    float dist = length((v_uv - 0.5) * vec2(1.0, u_resolution.y / max(1.0, u_resolution.x)) * 1.65);
    float vig = smoothstep(midpoint * 0.7, midpoint * 0.7 + feather, dist);
    vec3 rgb = amount >= 0.0
      ? src.rgb * (1.0 - vig * amount)
      : mix(src.rgb, vec3(1.0), vig * (-amount));
    outColor = vec4(clamp(rgb, 0.0, 1.0), src.a);
    return;
  }

  outColor = src;
}
`;

/**
 * Master Layer Composite Shader (#version 300 es)
 * Handles Blend Modes, Layer Opacity, and Track Mattes (Alpha / Luma / Inverted)
 */
export const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_baseTex;
uniform sampler2D u_layerTex;
uniform sampler2D u_matteTex;
uniform int u_blendMode;
uniform int u_matteMode;
uniform float u_opacity;

vec3 blendChannel(vec3 base, vec3 top, int mode) {
  // 0: normal
  if (mode == 0) return top;
  // 1: multiply
  if (mode == 1) return base * top;
  // 2: screen
  if (mode == 2) return 1.0 - (1.0 - base) * (1.0 - top);
  // 3: overlay
  if (mode == 3) {
    return mix(
      2.0 * base * top,
      1.0 - 2.0 * (1.0 - base) * (1.0 - top),
      step(0.5, base)
    );
  }
  // 4: add
  if (mode == 4) return min(vec3(1.0), base + top);
  // 5: darken
  if (mode == 5) return min(base, top);
  // 6: lighten
  if (mode == 6) return max(base, top);
  // 7: difference
  if (mode == 7) return abs(base - top);
  // 8: color-dodge
  if (mode == 8) return min(vec3(1.0), base / max(vec3(0.001), 1.0 - top));
  return top;
}

void main() {
  vec4 base = texture(u_baseTex, v_uv);
  vec4 top = texture(u_layerTex, v_uv);

  float matteFactor = 1.0;
  if (u_matteMode != 0) {
    vec4 m = texture(u_matteTex, v_uv);
    float luma = dot(m.rgb, vec3(0.299, 0.587, 0.114)) * m.a;
    if (u_matteMode == 1) matteFactor = m.a; // alpha
    else if (u_matteMode == 2) matteFactor = 1.0 - m.a; // alpha-inverted
    else if (u_matteMode == 3) matteFactor = luma; // luma
    else if (u_matteMode == 4) matteFactor = 1.0 - luma; // luma-inverted
  }

  float alphaTop = clamp(top.a * u_opacity * matteFactor, 0.0, 1.0);
  if (alphaTop <= 0.0001) {
    outColor = base;
    return;
  }

  vec3 blendedRgb = blendChannel(base.rgb, top.rgb, u_blendMode);
  vec3 finalRgb = mix(base.rgb, blendedRgb, alphaTop);
  float finalAlpha = alphaTop + base.a * (1.0 - alphaTop);
  outColor = vec4(clamp(finalRgb, 0.0, 1.0), clamp(finalAlpha, 0.0, 1.0));
}
`;
